/* ==========================================
   GLOBAL STATE & CONTROLS
   ========================================== */
let rawTableHTML = "";
let parsedSourceRows = [];   // Standardized structural rows
let importedData = [];       // WhatsApp-optimized pipeline output
let statusTimeout;

// UI Targets
const refDateInput = document.getElementById('refDate');
const especialidadeSel = document.getElementById('especialidadeSel');
const localSel = document.getElementById('localSel');
const exportNameInput = document.getElementById('exportNameInput');
const groupNamesInput = document.getElementById('groupNamesInput');
const statusMsg = document.getElementById('status');
const loadingContainer = document.getElementById('loadingContainer');

const refreshBtn = document.getElementById('refreshBtn');
const copyHtmlBtn = document.getElementById('copyHtmlBtn');
const dlImportedCsvBtn = document.getElementById('dlImportedCsvBtn');
const dlImportedXlsxBtn = document.getElementById('dlImportedXlsxBtn');

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

/* ==========================================
   DOM SCRAPER & FRAME INJECTOR (UNIVERSAL)
   ========================================== */
async function scrapeActivePageTable() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    toggleLoading(true);

    chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
            const table = document.getElementById('tblImpressao');
            
            // Gather ALL listagem tables inside this frame instead of just the first one
            const metaTables = document.querySelectorAll('table.table_listagem');
            const metaHTMLs = Array.from(metaTables).map(t => t.outerHTML);
            
            return {
                mainHTML: table ? table.outerHTML : null,
                metaHTMLs: metaHTMLs.length > 0 ? metaHTMLs : null
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

        // Aggregate findings across all frame contexts
        results.forEach(r => {
            if (r.result) {
                if (r.result.mainHTML) foundMainHTML = r.result.mainHTML;
                if (r.result.metaHTMLs) {
                    accumulatedMetaHTMLs = accumulatedMetaHTMLs.concat(r.result.metaHTMLs);
                }
            }
        });

        // 1. Process all discovered metadata sheets to aggregate properties
        if (accumulatedMetaHTMLs.length > 0) {
            processMultipleMetadataHTML(accumulatedMetaHTMLs);
        }

        // 2. Process core data table pipeline
        if (foundMainHTML) {
            rawTableHTML = foundMainHTML;
            processRawHTML(foundMainHTML);
            copyHtmlBtn.disabled = false;
            showStatus("Dados sincronizados com sucesso!", 'success');
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
    if (!table) return;

    const rows = table.querySelectorAll('tr');
    const rawSourceRows = [];
    let detectedHeaders = [];

    rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('th, td');
        if (cells.length === 0) return;

        const rowValues = Array.from(cells).map(cell => cell.textContent.trim());

        if (rowIndex === 0) {
            detectedHeaders = rowValues;
        } else {
            const rowObj = {};
            rowValues.forEach((val, colIdx) => {
                const colName = detectedHeaders[colIdx] || `Col_${colIdx}`;
                rowObj[colName] = val;
            });
            rawSourceRows.push(rowObj);
        }
    });

    parsedSourceRows = standardiseDataStructure(rawSourceRows);
    runAllPipelines();
}

function standardiseDataStructure(rawObjectsList) {
    const expectedKeys = ['nome', 'telefone', 'procedimento'];
    return rawObjectsList.map(obj => {
        const keyNome = Object.keys(obj).find(k => k.toLowerCase() === 'nome') || '';
        const keyTelefones = Object.keys(obj).find(k => k.toLowerCase().includes('telefone')) || '';
        const keyProcedimento = Object.keys(obj).find(k => k.toLowerCase() === 'procedimento') || '';

        if (!keyNome) console.warn('standardiseDataStructure: "nome" column not found in source headers', Object.keys(obj));
        if (!keyTelefones) console.warn('standardiseDataStructure: "telefone" column not found in source headers', Object.keys(obj));
        if (!keyProcedimento) console.warn('standardiseDataStructure: "procedimento" column not found in source headers', Object.keys(obj));

        return {
            Nome: keyNome ? obj[keyNome] : '',
            Telefones: keyTelefones ? obj[keyTelefones] : '',
            Procedimento: keyProcedimento ? obj[keyProcedimento] : ''
        };
    });
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
        dlImportedCsvBtn.disabled = true;
        dlImportedXlsxBtn.disabled = true;
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
            Email: '',
            Instagram: '',
            Etiquetas: etiquetas,
            NotasInternas: notasInternas
        };
    });

    dlImportedCsvBtn.disabled = false;
    dlImportedXlsxBtn.disabled = false;
}

/* ==========================================
   DOWNLOAD WRAPPERS & CONSOLIDATED GROUPING LOGIC
   ========================================== */
function downloadImportedData(format) {
    if (importedData.length === 0) return;

    const filenameBase = `${getFileName()}_IMPORTED`;
    let finalDataset = importedData.map(row => ({...row}));

    const rawNames = groupNamesInput.value.split(',').map(s => s.trim()).filter(Boolean);
    if (rawNames.length > 0 && rawNames.length <= finalDataset.length) {
        const totalRecords = finalDataset.length;
        const groupSize = Math.ceil(totalRecords / rawNames.length);

        finalDataset = finalDataset.map((row, index) => {
            const groupIndex = Math.floor(index / groupSize);
            const tag = `Consulta${rawNames[groupIndex]}h`;
            row.Etiquetas = row.Etiquetas ? `${row.Etiquetas}, ${tag}` : tag;
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
            'Email': row.Email,
            'Instagram': row.Instagram,
            'Etiquetas': row.Etiquetas,
            'Notas Internas': row.NotasInternas
        }));
        downloadAsExcel(structuredXlsx, `${filename}.xlsx`);
    } else {
        const importedHeaders = ['Nome', 'Telefone', 'Email', 'Instagram', 'Etiquetas', 'Notas Internas'];
        const importedFieldMap = { 'Notas Internas': 'NotasInternas' };
        const csvString = generateCSV(dataset, importedHeaders, importedFieldMap);
        downloadAsCSV(csvString, `${filename}.csv`);
    }
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

function downloadAsCSV(csvOutputStr, fileName) {
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvOutputStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    
    showStatus(`"${fileName}" baixado!`, 'success');
}

function downloadAsExcel(sheetData, fileName) {
    if (typeof XLSX === 'undefined') {
        showStatus("Falha ao gerar arquivo Excel.", 'error');
        return;
    }

    try {
        const refDate = refDateInput.value;
        const chosenEspecialidade = especialidadeSel.value;
        const chosenLocal = localSel.value;

        const nameParts = [refDate];
        if (chosenLocal) nameParts.push(chosenLocal);
        if (chosenEspecialidade) nameParts.push(chosenEspecialidade);

        let sheetName = nameParts.join('_').replace(/[\\\/\?\*\:\[\]]/g, '').substring(0, 31);
        if (!sheetName) sheetName = "Export";

        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([xlsxBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);

        showStatus(`"${fileName}" baixado!`, 'success');
    } catch (err) {
        showStatus("Erro no Excel: " + err.message, 'error');
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

function showStatus(text, type) {
    clearTimeout(statusTimeout);
    statusMsg.textContent = text;
    statusMsg.className = 'status';
    if (type) statusMsg.classList.add('status-' + type);
    statusTimeout = setTimeout(() => {
        if (statusMsg.textContent === text) { statusMsg.textContent = ''; statusMsg.className = 'status'; }
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