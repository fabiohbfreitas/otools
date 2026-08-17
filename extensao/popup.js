/* ==========================================
   GLOBAL STATE & CONTROLS
   ========================================== */
let rawTableHTML = "";
let parsedSourceRows = [];   // Standardized structural rows
let importedData = [];       // WhatsApp-optimized pipeline output
let transformedData = [];    // 8-column structured output
let naoConsultadosPending = []; // Parsed rows from the current page (tblConfirmacao)
let naoConsultadosAccum = [];   // Deduplicated accumulation across pages
let statusTimeout;

// UI Targets
const refDateInput = document.getElementById('refDate');
const especialidadeSel = document.getElementById('especialidadeSel');
const localSel = document.getElementById('localSel');
const exportNameInput = document.getElementById('exportNameInput');
const groupNamesInput = document.getElementById('groupNamesInput');
const statusMsg = document.getElementById('status');
const statusNaoConsultadosMsg = document.getElementById('statusNaoConsultados');
const loadingContainer = document.getElementById('loadingContainer');

const refreshBtn = document.getElementById('refreshBtn');
const copyHtmlBtn = document.getElementById('copyHtmlBtn');
const dlImportedCsvBtn = document.getElementById('dlImportedCsvBtn');
const dlImportedXlsxBtn = document.getElementById('dlImportedXlsxBtn');
const dlTransformedXlsxBtn = document.getElementById('dlTransformedXlsxBtn');
const addNaoConsultadosBtn = document.getElementById('addNaoConsultadosBtn');
const dlNaoConsultadosXlsxBtn = document.getElementById('dlNaoConsultadosXlsxBtn');
const clearNaoConsultadosBtn = document.getElementById('clearNaoConsultadosBtn');

/* ==========================================
   BUSINESS CONFIGURATION
   ========================================== */
const LOCATION_CONFIG = {
  Samambaia: { codes: ['0366986'] },
  Gama: { codes: ['9180168'] },
  Sobradinho: { codes: ['3031543', 'ECOGRAFICO'] }
};

const SPECIALTY_CONFIG = {
  Ortopedia: { keywords: ['ORTOPEDIA'] },
  Cardiologia: { keywords: ['CARDIOLOGIA'] },
  Otorrinolaringologia: { keywords: ['OTORRINOLARINGOLOGIA'] },
  Ginecologia: { keywords: ['GINECOLOGIA'] }
};

// Set default reference date to next business day (fallback when metadata unavailable)
const today = new Date();
const nextBusiness = getNextBusinessDay(today);
refDateInput.value = nextBusiness.toISOString().split('T')[0];

updateDefaultFileName();
scrapeActivePageTable(); // Run immediately on window opening

/* ==========================================
   EVENT REGISTER
   ========================================== */
refreshBtn.addEventListener('click', scrapeActivePageTable);
copyHtmlBtn.addEventListener('click', copyRawHtmlToClipboard);

refDateInput.addEventListener('change', () => { updateDefaultFileName(); runAllPipelines(); });
especialidadeSel.addEventListener('change', () => { updateDefaultFileName(); runAllPipelines(); });
localSel.addEventListener('change', () => { updateDefaultFileName(); runAllPipelines(); });

dlImportedCsvBtn.addEventListener('click', () => downloadImportedData('csv'));
dlImportedXlsxBtn.addEventListener('click', () => downloadImportedData('xlsx'));
dlTransformedXlsxBtn.addEventListener('click', () => downloadTransformedData());
dlNaoConsultadosXlsxBtn.addEventListener('click', downloadNaoConsultadosData);
addNaoConsultadosBtn.addEventListener('click', addNaoConsultadosPending);
clearNaoConsultadosBtn.addEventListener('click', clearNaoConsultadosData);

/* ==========================================
   DOM SCRAPER & FRAME INJECTOR (UNIVERSAL)
   ========================================== */
async function scrapeActivePageTable() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Track which tab the accumulation belongs to, so it's cleared when that tab closes
    if (chrome?.storage?.session) {
        chrome.storage.session.set({ naoConsultadosTabId: tab.id });
    }

    toggleLoading(true);

    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
            const table = document.getElementById('tblImpressao');
            
            // Gather ALL listagem tables inside this frame instead of just the first one
            const metaTables = document.querySelectorAll('table.table_listagem');
            const metaHTMLs = Array.from(metaTables).map(t => t.outerHTML);
            
            // Gather confirmacao + consulta tables (Não Consultados export)
            const confirmTables = document.querySelectorAll('table[id^="tblConfirmacao"], table[id^="tblConsulta"]');
            const confirmHTMLs = Array.from(confirmTables).map(t => t.outerHTML);
            
            return {
                mainHTML: table ? table.outerHTML : null,
                metaHTMLs: metaHTMLs.length > 0 ? metaHTMLs : null,
                confirmHTMLs: confirmHTMLs.length > 0 ? confirmHTMLs : null
            };
        }
    }, (results) => {
        if (chrome.runtime.lastError) {
            toggleLoading(false);
            showStatus("Falha na injeção: " + chrome.runtime.lastError.message, 'error');
            return;
        }
        if (!results || results.length === 0) {
            toggleLoading(false);
            showStatus("Nenhuma resposta recebida das páginas.", 'error');
            return;
        }

        let foundMainHTML = null;
        let accumulatedMetaHTMLs = [];
        let accumulatedConfirmHTMLs = [];

        // Aggregate findings across all frame contexts
        results.forEach(r => {
            if (r.result) {
                if (r.result.mainHTML) foundMainHTML = r.result.mainHTML;
                if (r.result.metaHTMLs) {
                    accumulatedMetaHTMLs = accumulatedMetaHTMLs.concat(r.result.metaHTMLs);
                }
                if (r.result.confirmHTMLs) {
                    accumulatedConfirmHTMLs = accumulatedConfirmHTMLs.concat(r.result.confirmHTMLs);
                }
            }
        });

        // 1. Process all discovered metadata sheets to aggregate properties
        if (accumulatedMetaHTMLs.length > 0) {
            processMultipleMetadataHTML(accumulatedMetaHTMLs);
        }

        // 1.5. Process confirmacao tables (Não Consultados) into the pending buffer
        naoConsultadosPending = accumulatedConfirmHTMLs.length > 0
            ? parseNaoConsultadosHTML(accumulatedConfirmHTMLs)
            : [];
        updateNaoConsultadosUI();
        if (naoConsultadosPending.length > 0) {
            showStatus(`${naoConsultadosPending.length} não consultado(s) na página`, 'success', statusNaoConsultadosMsg);
        }

        // 2. Process core data table pipeline
        if (foundMainHTML) {
            rawTableHTML = foundMainHTML;
            if (processRawHTML(foundMainHTML)) {
                copyHtmlBtn.disabled = false;
                showStatus("Dados sincronizados com sucesso!", 'success');
            } else {
                showStatus("Falha ao processar a tabela.", 'error');
            }
        } else {
            showStatus("Tabela principal não encontrada.", 'error');
        }
        toggleLoading(false);
    });
}

function copyRawHtmlToClipboard() {
    if (!rawTableHTML) return;
    navigator.clipboard.writeText(rawTableHTML)
        .then(() => showStatus("HTML copiado para área de transferência!", 'success'))
        .catch(() => showStatus("Falha ao copiar HTML.", 'error'));
}

/* ==========================================
   METADATA PARSING PIPELINE
   ========================================== */
function processMultipleMetadataHTML(metaHtmlArray) {
    let extractedUnidade = "";
    let extractedPeriodo = "";
    let extractedProcedimento = "";

    const parser = new DOMParser();

    // Loop through every table string collected to find parameters
    metaHtmlArray.forEach(htmlStr => {
        const doc = parser.parseFromString(htmlStr, 'text/html');
        const rows = doc.querySelectorAll('tr');

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const label = cells[0].textContent.trim().toLowerCase();
                const value = cells[1].textContent.trim();

                if (label.includes('unidade executante') && value) extractedUnidade = value;
                if ((label.includes('período') || label.includes('periodo')) && value) extractedPeriodo = value;
                if (label.includes('procedimento ambulatorial') && value) extractedProcedimento = value;
            }
        });
    });

    // 1. Parse date from metadata (dd/mm/yyyy -> yyyy-mm-dd) — takes priority over fallback
    if (extractedPeriodo) {
        const dateMatch = extractedPeriodo.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (dateMatch) {
            refDateInput.value = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        }
    }

    // 2. Map location from extracted metadata using config
    if (extractedUnidade) {
        const upperUnidade = extractedUnidade.toUpperCase();
        for (const [location, config] of Object.entries(LOCATION_CONFIG)) {
            const matched = config.codes.some(code => upperUnidade.includes(code));
            if (matched) {
                localSel.value = location;
                break;
            }
        }
    }

    // 3. Map specialty from extracted metadata using config
    if (extractedProcedimento) {
        const upperProc = extractedProcedimento.toUpperCase();
        for (const [specialty, config] of Object.entries(SPECIALTY_CONFIG)) {
            const matched = config.keywords.some(kw => upperProc.includes(kw));
            if (matched) {
                especialidadeSel.value = specialty;
                break;
            }
        }
    }

    // Update default dynamic name properties context tracking instantly
    updateDefaultFileName();
}

/* ==========================================
   RAW DATA PARSING PIPELINE
   ========================================== */
function processRawHTML(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return false;

    const rows = table.querySelectorAll('tr');
    let detectedHeaders = [];

    const parsedRows = [];
    rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('th, td');
        if (cells.length === 0) return;

        const rowValues = Array.from(cells).map(cell => cell.textContent.trim());

        if (rowIndex === 0) {
            detectedHeaders = rowValues;
        } else {
            const rowObj = {};
            rowValues.forEach((val, colIdx) => {
                rowObj[detectedHeaders[colIdx] || `Col_${colIdx}`] = val;
            });
            parsedRows.push(rowObj);
        }
    });

    parsedSourceRows = standardiseDataStructure(parsedRows);
    runAllPipelines();
    return true;
}

function standardiseDataStructure(rawObjectsList) {
    const expectedKeys = ['nome', 'telefone', 'procedimento'];
    if (rawObjectsList.length > 0) {
        const firstKeys = Object.keys(rawObjectsList[0]).map(k => k.toLowerCase());
        const missing = expectedKeys.filter(key => {
            if (key === 'telefone') return !firstKeys.some(k => k.includes('telefone'));
            return !firstKeys.includes(key);
        });
        if (missing.length) {
            showStatus(`Colunas não encontradas: ${missing.join(', ')}.`, 'error');
        }
    }
    return rawObjectsList.map(obj => {
        const keyNome = Object.keys(obj).find(k => k.toLowerCase() === 'nome') || '';
        const keyTelefones = Object.keys(obj).find(k => k.toLowerCase().includes('telefone')) || '';
        const keyProcedimento = Object.keys(obj).find(k => k.toLowerCase() === 'procedimento') || '';
        const keyDataHora = Object.keys(obj).find(k => {
            const lk = k.toLowerCase();
            return lk.includes('data/hora') || (lk.includes('hora') && lk.includes('data'));
        }) || '';
        return {
            Nome: keyNome ? obj[keyNome] : '',
            Telefones: keyTelefones ? obj[keyTelefones] : '',
            Procedimento: keyProcedimento ? obj[keyProcedimento] : '',
            Hora: keyDataHora ? extractHora(obj[keyDataHora]) : ''
        };
    });
}

function extractHora(value) {
    const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return '';
    return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function extractPhones(phoneStr) {
    if (!phoneStr) return [];
    const regex = /(?:\(?\d{2}\)?\s?\d{4,5}-?\d{4})/g;
    const matches = phoneStr.match(regex) || [];

    return matches.map(num => {
        const cleaned = num.replace(/\D/g, '');
        if (cleaned.length === 11) {
            return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
        } else if (cleaned.length === 10) {
            return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
        }
        return num.trim();
    });
}

/* ==========================================
   TRANSFORMATION PIPELINES
   ========================================== */
function runAllPipelines() {
    if (parsedSourceRows.length === 0) {
        importedData = [];
        transformedData = [];
        dlImportedCsvBtn.disabled = true;
        dlImportedXlsxBtn.disabled = true;
        dlTransformedXlsxBtn.disabled = true;
        return;
    }
    const refDate = refDateInput.value;
    const chosenEspecialidade = especialidadeSel.value;
    const chosenLocal = localSel.value;

    // 1. Generate "Imported" Base Dataset (Prioritizing Brazilian Mobile numbers for WhatsApp)
    importedData = parsedSourceRows.map(row => {
        const nome = row.Nome ? row.Nome.trim() : '';
        const parsedPhones = extractPhones(row.Telefones);
        
        let targetIndex = parsedPhones.findIndex(num => {
            const digits = num.trim().replace(/\D/g, ''); 
            const mainNumber = digits.substring(2);
            return mainNumber.length === 9 && mainNumber.startsWith('9');
        });

        if (targetIndex === -1 && parsedPhones.length > 0) {
            targetIndex = 0;
        }

        const chosenPhone = targetIndex !== -1 ? parsedPhones[targetIndex] : '';
        const remainderList = parsedPhones.filter((_, idx) => idx !== targetIndex);
        const remainingPhones = remainderList.join(', ');

        const tags = [refDate, 'Automação'];
        if (chosenEspecialidade) tags.push(chosenEspecialidade);
        if (chosenLocal) tags.push(chosenLocal);
        const etiquetas = tags.join(', ');

        let notasInternas = '';
        if (remainingPhones) {
            notasInternas = `Outros telefones: ${remainingPhones}`;
        }

        return {
            Nome: nome,
            Telefone: chosenPhone,
            Etiquetas: etiquetas,
            NotasInternas: notasInternas,
            Hora: row.Hora
        };
    });

    // 2. Generate "Transformed" Dataset (8-column structured)
    transformedData = parsedSourceRows.map(row => {
        const nome = row.Nome ? row.Nome.trim() : '';
        const allPhonesParsed = extractPhones(row.Telefones).join(', ');
        const formattedDate = formatToBrazilianDate(refDate);

        return {
            Paciente: nome,
            Telefone: allPhonesParsed,
            Data: formattedDate,
            Horário: row.Hora,
            Unidade: chosenLocal,
            Especialidade: chosenEspecialidade,
            Situação: 'a confirmar',
            Observação: ''
        };
    });

    dlImportedCsvBtn.disabled = false;
    dlImportedXlsxBtn.disabled = false;
    dlTransformedXlsxBtn.disabled = false;
}

/* ==========================================
   DOWNLOAD WRAPPERS & CONSOLIDATED GROUPING LOGIC
   ========================================== */
function downloadImportedData(format) {
    if (importedData.length === 0) return;

    const filenameBase = getFileName();
    let finalDataset = importedData.map(row => ({...row}));

    const rawNames = groupNamesInput.value.split(',').map(s => s.trim()).filter(Boolean);
    if (rawNames.length > 0 && rawNames.length <= finalDataset.length) {
        const totalRecords = finalDataset.length;
        const groupSize = Math.ceil(totalRecords / rawNames.length);

        finalDataset = finalDataset.map((row, index) => {
            const groupIndex = Math.floor(index / groupSize);
            const tag = formatGroupTag(rawNames[groupIndex]);
            const etq = row.Etiquetas || '';
            const regex = /,\s*Consulta[^,]*/;
            if (regex.test(etq)) {
                row.Etiquetas = etq.replace(regex, `, ${tag}`);
            } else {
                row.Etiquetas = etq ? `${etq}, ${tag}` : tag;
            }
            return row;
        });
    } else {
        finalDataset = finalDataset.map(row => {
            const tag = formatAgendaTag(row.Hora);
            if (!tag) return row;
            const etq = row.Etiquetas || '';
            row.Etiquetas = etq ? `${etq}, ${tag}` : tag;
            return row;
        });
    }

    triggerImportedFileSave(finalDataset, filenameBase, format);
}

function triggerImportedFileSave(dataset, filename, format) {
    if (format === 'xlsx') {
        const structuredXlsx = dataset.map(row => ({
            'Nome': row.Nome,
            'Telefone': row.Telefone,
            'Etiquetas': row.Etiquetas,
            'Notas Internas': row.NotasInternas
        }));
        downloadAsExcel(structuredXlsx, `${filename}.xlsx`);
    } else {
        const importedHeaders = ['Nome', 'Telefone', 'Etiquetas', 'Notas Internas'];
        const importedFieldMap = { 'Notas Internas': 'NotasInternas' };
        const csvString = generateCSV(dataset, importedHeaders, importedFieldMap);
        downloadAsCSV(csvString, `${filename}.csv`);
    }
}

function downloadTransformedData() {
    if (transformedData.length === 0) return;
    const filenameBase = getFileName();
    const structured = transformedData.map(row => ({
        'Paciente': row.Paciente,
        'Telefone': row.Telefone,
        'Data': row.Data,
        'Horário': row.Horário,
        'Unidade': row.Unidade,
        'Especialidade': row.Especialidade,
        'Situação': row.Situação,
        'Observação': row.Observação
    }));
    downloadAsExcel(structured, `${filenameBase}_DadosCompletos.xlsx`);
}

/* ==========================================
   NÃO CONSULTADOS (tblConfirmacao)
   ========================================== */
const NAO_CONSULTADO_HEADERS = ['Paciente', 'Telefone', 'Data', 'Horário', 'Unidade', 'Especialidade', 'Situação', 'Observação'];

const ESPECIALIDADE_MAP = {
    'ORTOPEDIA': 'Ortopedia',
    'CARDIOLOGIA': 'Cardiologia',
    'OTORRINOLARINGOLOGIA': 'Otorrinolaringologia',
    'GINECOLOGIA': 'Ginecologia',
    'ELETROCARDIOGRAMA': 'Eletrocardiograma',
    'TOMOGRAFIA': 'Tomografia',
    'REUMATOLOGIA': 'Reumatologia',
    'ESPIROMETRIA': 'Espirometria',
    'MAMOGRAFIA': 'Mamografia',
    'RESSONANCIA MAGNETICA': 'RessonanciaMagnetica'
};

function cellTextWithBr(td) {
    const clone = td.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return clone.textContent;
}

function deriveEspecialidade(procedimento) {
    if (!procedimento) return '';
    const upper = procedimento.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [kw, name] of Object.entries(ESPECIALIDADE_MAP)) {
        if (upper.includes(kw)) return name;
    }
    return '';
}

function getSituacaoQualifier(tds) {
    for (const td of tds) {
        const text = td.textContent.trim().replace(/\u00A0/g, ' ');
        if (!text.startsWith('Situação:')) continue;
        const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normalized.includes('pendente confirmacao')) return 'Pendente Confirmação';
        if (normalized.includes('falta')) return 'Falta';
    }
    return '';
}

function parseNaoConsultadosHTML(confirmHTMLs) {
    const results = [];
    confirmHTMLs.forEach(htmlStr => {
        const doc = new DOMParser().parseFromString(htmlStr, 'text/html');
        const tds = Array.from(doc.querySelectorAll('td'));

        // Qualifies with a "Chave:" cell (confirmation input) or a "Situação:" cell
        // marked "Pendente Confirmação" / "Falta" (not yet confirmed/consulted).
        const hasChave = tds.some(td => td.textContent.trim().startsWith('Chave:'));
        const situacaoQualifier = getSituacaoQualifier(tds);
        if (!hasChave && !situacaoQualifier) return;

        let solicitacao = '', paciente = '', telefones = '', data = '', horario = '';

        tds.forEach(td => {
            const bold = td.querySelector('b');
            if (!bold) return;
            const label = bold.textContent.replace(':', '').trim();
            const full = cellTextWithBr(td);
            const value = full.slice(full.indexOf(label) + label.length + 1).trim();

            if (label === 'Paciente') paciente = value;
            else if (label.startsWith('Telefone')) telefones = value;
            else if (label.includes('Data/Hora')) {
                const m = value.match(/(\d{2}\/\d{2}\/\d{4})/);
                if (m) data = m[1];
                horario = extractHora(value);
            }
            if (!solicitacao && label === '' && /^\d{6,}$/.test(bold.textContent.trim())) {
                solicitacao = bold.textContent.trim();
            }
        });

        let procedimento = '';
        doc.querySelectorAll('tr').forEach(row => {
            const rowTds = row.querySelectorAll('td');
            if (rowTds.length >= 2 && rowTds[0].textContent.trim().includes('Procedimento')) {
                procedimento = rowTds[1].textContent.trim();
            }
        });

        results.push({
            Paciente: paciente,
            Telefone: telefones === '---' ? '' : telefones.replace(/\n/g, ', '),
            Data: data,
            Horário: horario,
            Unidade: localSel.value,
            Especialidade: deriveEspecialidade(procedimento),
            Situação: hasChave ? 'Não consultado' : situacaoQualifier,
            Observação: solicitacao ? `Solicitação: ${solicitacao}` : ''
        });
    });
    return results;
}

function normalizePacienteKey(name) {
    return (name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function clearNaoConsultadosData() {
    naoConsultadosAccum = [];
    if (chrome?.storage?.session) {
        chrome.storage.session.remove(['naoConsultadosAccum', 'naoConsultadosTabId']);
    }
    updateNaoConsultadosUI();
}

function addNaoConsultadosPending() {
    if (naoConsultadosPending.length === 0) return;

    const existing = new Set(naoConsultadosAccum.map(r => normalizePacienteKey(r.Paciente)));
    let added = 0;
    naoConsultadosPending.forEach(row => {
        const key = normalizePacienteKey(row.Paciente);
        if (!key || existing.has(key)) return;
        existing.add(key);
        naoConsultadosAccum.push(row);
        added++;
    });

    naoConsultadosPending = [];
    saveNaoConsultadosAccum();
    updateNaoConsultadosUI();
    showStatus(`${added} adicionado(s). Total: ${naoConsultadosAccum.length}`, 'success', statusNaoConsultadosMsg);
}

function saveNaoConsultadosAccum() {
    if (chrome?.storage?.session) {
        chrome.storage.session.set({ naoConsultadosAccum });
    }
}

function updateNaoConsultadosUI() {
    addNaoConsultadosBtn.disabled = naoConsultadosPending.length === 0;
    dlNaoConsultadosXlsxBtn.disabled = naoConsultadosAccum.length === 0;
    clearNaoConsultadosBtn.disabled = naoConsultadosAccum.length === 0;
    const counter = document.getElementById('naoConsultadosCount');
    if (counter) {
        counter.textContent = naoConsultadosAccum.length > 0
            ? `(total: ${naoConsultadosAccum.length})`
            : naoConsultadosPending.length > 0
                ? `(${naoConsultadosPending.length} na página)`
                : '';
    }
}

function downloadNaoConsultadosData() {
    if (naoConsultadosAccum.length === 0) return;
    const dateStr = (naoConsultadosAccum[0].Data || refDateInput.value || 'data').replace(/\//g, '-');
    const nameParts = ['nao_consultados', dateStr];
    if (localSel.value) nameParts.push(localSel.value);
    if (especialidadeSel.value) nameParts.push(especialidadeSel.value);
    const structured = naoConsultadosAccum.map(row => {
        const obj = {};
        NAO_CONSULTADO_HEADERS.forEach(h => { obj[h] = row[h]; });
        return obj;
    });
    downloadAsExcel(structured, `${nameParts.join('_')}.xlsx`, statusNaoConsultadosMsg);

    clearNaoConsultadosData();
}

/* ==========================================
   CSV & SHEET ENGINES
   ========================================== */
const CRLF = '\r\n';

function escapeField(f) {
    const str = typeof f === 'string' ? f : String(f ?? '');
    return `"${str.replace(/"/g, '""')}"`;
}

function generateCSV(dataList, headers, fieldMap) {
    if (!dataList.length) return '';
    const rows = [headers.join(',')];
    dataList.forEach(row => {
        rows.push(headers.map(h => escapeField(fieldMap ? row[fieldMap[h] || h] : row[h])).join(','));
    });
    return rows.join(CRLF);
}

function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

function downloadAsCSV(csvOutputStr, fileName, statusTarget) {
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvOutputStr], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, fileName);
    showStatus(`"${fileName}" baixado!`, 'success', statusTarget);
}

function downloadAsExcel(sheetData, fileName, statusTarget) {
    if (typeof XLSX === 'undefined') {
        showStatus("Falha ao gerar arquivo Excel.", 'error', statusTarget);
        return;
    }

    try {
        const nameParts = [refDateInput.value];
        if (localSel.value) nameParts.push(localSel.value);
        if (especialidadeSel.value) nameParts.push(especialidadeSel.value);

        let sheetName = nameParts.join('_').replace(/[\\\/\?\*\:\[\]]/g, '').substring(0, 31);
        if (!sheetName) sheetName = "Export";

        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([xlsxBuffer], { type: 'application/octet-stream' });
        triggerDownload(blob, fileName);

        showStatus(`"${fileName}" baixado!`, 'success', statusTarget);
    } catch (err) {
        showStatus("Erro no Excel: " + err.message, 'error', statusTarget);
    }
}

function getFileName() {
    let exportName = exportNameInput.value.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    return exportName || 'processed_clinic_data';
}

function updateDefaultFileName() {
    const refDate = refDateInput.value;
    const chosenEspecialidade = especialidadeSel.value;
    const chosenLocal = localSel.value;

    const nameParts = [refDate];
    if (chosenLocal) nameParts.push(chosenLocal);
    if (chosenEspecialidade) nameParts.push(chosenEspecialidade);

    const generatedName = nameParts.join('_').replace(/[^a-zA-Z0-9_\-]/g, '_');
    exportNameInput.value = generatedName || 'processed_clinic_data';
}

function toggleLoading(visible) {
    loadingContainer.classList.toggle('visible', visible);
}

function showStatus(text, type, target) {
    const el = target || statusMsg;
    clearTimeout(statusTimeout);
    el.textContent = text;
    el.className = 'status';
    if (type) el.classList.add('status-' + type);
    statusTimeout = setTimeout(() => {
        if (el.textContent === text) { el.textContent = ''; el.className = 'status'; }
    }, 4000);
}

function formatToBrazilianDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getNextBusinessDay(date) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
    }
    return next;
}

function formatGroupTag(name) {
    if (/^\d+$/.test(name)) return `Consulta${name.padStart(2, '0')}h`;
    return 'Consulta' + name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function formatAgendaTag(hora) {
    if (!hora) return '';
    const m = hora.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    const minutes = m[2];
    return minutes === '00' ? `Agenda${m[1]}h` : `Agenda${m[1]}h${minutes}`;
}

// Restore accumulated Não Consultados across popup sessions (after all consts are initialized)
if (chrome?.storage?.session) {
    chrome.storage.session.get('naoConsultadosAccum').then(result => {
        if (Array.isArray(result.naoConsultadosAccum)) {
            naoConsultadosAccum = result.naoConsultadosAccum;
        }
        updateNaoConsultadosUI();
    });
}