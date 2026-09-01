#!/usr/bin/env node
/**
 * campaign-creator — CLI helper to create Fasterisk campaigns predictably
 * Follows tools/campaign-creator/spec.md exactly (agent-browser steps)
 * Input: JSON file with campanha/equipe/canal/parametros/audiencia
 * Usage: node create.js data.json
 */
import { execSync, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AB = "npx --yes agent-browser";
const NPX = "npx";

function run(cmd, opts = {}) {
  const full = `${NPX} --yes agent-browser ${cmd}`;
  try {
    const out = execSync(full, { encoding: "utf-8", shell: "C:\\Program Files\\Git\\bin\\bash.exe", ...opts });
    return out.trim();
  } catch (e) {
    const msg = e.stdout?.toString() || e.stderr?.toString() || e.message;
    throw new Error(`AB failed: ${full}\n${msg}`);
  }
}

function evalJs(js) {
  const escaped = js.replace(/'/g, "'\\''");
  const cmd = `${NPX} --yes agent-browser eval '${escaped}'`;
  try {
    const out = execSync(cmd, { encoding: "utf-8", shell: "C:\\Program Files\\Git\\bin\\bash.exe" });
    return out.trim().replace(/^"|"$/g, "");
  } catch (e) {
    const msg = e.stdout?.toString() || e.stderr?.toString() || e.message;
    throw new Error(`AB eval failed: ${js}\n${msg}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function log(s) { console.log(s); }

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error("Usage: node create.js <data.json>");
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(resolve(jsonPath), "utf-8"));

  // Validate input per spec §3
  const { campanha, equipe, canal, parametros, audiencia } = data;
  assert(campanha && equipe && canal && parametros && audiencia, "JSON must contain campanha/equipe/canal/parametros/audiencia");
  assert(parametros.especialidade && parametros.data && parametros.horario && parametros.local && parametros.linkmaps, "parametros must have especialidade/data/horario/local/linkmaps");
  assert(audiencia.etiqueta, "audiencia.etiqueta required");

  // Build campaign name per padrão fixo §3
  const nome = data.nome || `[TESTE] [${campanha.local}] [${campanha.especialidade}] Consulta ${campanha.horario.replace(":", "h")} ${campanha.data} - RASCUNHO (nao disparar)`;
  log(`Nome: ${nome}`);

  // Preconditions §2
  log("Checking preconditions...");
  run("tab t1");
  let url = evalJs("location.href");
  if (url.includes("/campaign/new")) {
    log("Tab em /campaign/new (execucao anterior falhou), voltando para lista...");
    evalJs("location.href='/campaign'");
    await new Promise(r => setTimeout(r, 2000));
    url = evalJs("location.href");
  }
  assert(url.includes("/campaign"), `Not on /campaign, got ${url}`);

  // 4.1 Limpar filtros se visível
  try {
    evalJs(`Array.from(document.querySelectorAll("*")).find(e=>e.textContent.trim()==="Limpar filtros")?.click()`);
    log("Filtros limpos (se havia)");
  } catch {}

  // 4.2 Criar
  log("Criando nova campanha...");
  evalJs(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Novo")?.click()`);
  // wait for /campaign/new
  await new Promise(r => setTimeout(r, 2000));
  let href = evalJs("location.href");
  assert(href.includes("/campaign/new"), `Failed to open new, got ${href}`);

  // 4.3 Cabeçalho
  log("Preenchendo cabeçalho...");
  // Nome — usar data-cy correto (placeholder é Boas-vindas, label é Nome da campanha)
  evalJs(`var el=document.querySelector('[data-cy="name-input-campaign"] input'); if(el){el.focus(); var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set; s.call(el,${JSON.stringify(nome)}); el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); el.blur();}`);
  await new Promise(r => setTimeout(r, 800));
  // Equipe — aguardar abrir e selecionar
  evalJs(`Array.from(document.querySelectorAll("mat-select")).find(s=>s.textContent.includes("Equipe"))?.click()`);
  for (let i = 0; i < 8; i++) {
    const hasOpt = evalJs(`Array.from(document.querySelectorAll("mat-option")).find(o=>o.textContent.includes(${JSON.stringify(equipe)})) ? "yes" : "no"`);
    if (hasOpt === "yes") break;
    await new Promise(r => setTimeout(r, 400));
  }
  evalJs(`Array.from(document.querySelectorAll("mat-option")).find(o=>o.textContent.includes(${JSON.stringify(equipe)}))?.click()`);
  await new Promise(r => setTimeout(r, 700));

  /**
  // 4.4 Disparo — Modelo
  evalJs(`Array.from(document.querySelectorAll("mat-select")).find(s=>s.textContent.includes("Disparo"))?.click()`);
  await new Promise(r => setTimeout(r, 600));
  evalJs(`Array.from(document.querySelectorAll("mat-option")).find(o=>o.textContent.trim()==="Modelo de mensagem")?.click()`);
  await new Promise(r => setTimeout(r, 500));

  // Escolher template
  evalJs(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Escolher")?.click()`);
  await new Promise(r => setTimeout(r, 1500));
  // Filtro Sequências
  evalJs(`Array.from(document.querySelectorAll("mat-select")).find(s=>s.textContent.includes("Campanhas"))?.click()`);
  await new Promise(r => setTimeout(r, 600));
  evalJs(`Array.from(document.querySelectorAll("mat-option")).find(o=>o.textContent.includes("Sequências"))?.click()`);
  await new Promise(r => setTimeout(r, 800));
  // Selecionar primeiro template (o desejado)
  evalJs(`document.querySelectorAll(".flex.items-center.gap-2.p-2")[0]?.click()`);
  await new Promise(r => setTimeout(r, 500));
  evalJs(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Definir parâmetros"))?.click()`);
  await new Promise(r => setTimeout(r, 2500));
  // Aguarda dialog Parâmetros abrir
  for (let i = 0; i < 10; i++) {
    const has = evalJs(`document.querySelector("campaign-compile-template") ? "yes" : "no"`);
    if (has === "yes") break;
    await new Promise(r => setTimeout(r, 500));
  }

  // 4.5 Parâmetros — com workaround de espaço final para textos
  log("Preenchendo parâmetros (com espaço final para textos)...");
  // Descobrir IDs atuais
  const ids = evalJs(`Array.from(document.querySelectorAll('input[id^="mat-input"]')).map(i=>i.id+":"+i.type).join("|")`);
  //ids like mat-input-29:text etc — parse
  // For robustness, find by data-cy
  const getId = (cy) => evalJs(`document.querySelector('[data-cy="${cy}"] input')?.id || document.querySelector('[data-cy="${cy}"]')?.querySelector("input")?.id`);

  // especialidade
  let espId = evalJs(`document.querySelector('[data-cy="input-template-param"] input')?.id`);
  // The first one is especialidade, but there are multiple with same data-cy, so find by order
  const allParamIds = evalJs(`Array.from(document.querySelectorAll('[data-cy^="input-template-param"] input')).map(i=>i.id).join(",")`);
  const paramIds = allParamIds.split(",").filter(Boolean);
  // paramIds[0]=paciente disabled, [1]=especialidade, [2]=data, [3]=horario, [4]=local, [5]=linkmaps (may vary)
  // Let's find by label text instead
  const findParamId = (label) => evalJs(`Array.from(document.querySelectorAll("campaign-compile-template mat-form-field")).find(f=>f.textContent.includes("${label}"))?.querySelector("input")?.id`);
  let espId2 = null, dataId = null, horaId = null, localId = null, linkId = null;
  for (let i = 0; i < 10; i++) {
    espId2 = evalJs(`Array.from(document.querySelectorAll("campaign-compile-template .mt-2")).find(d=>d.querySelector("b")?.textContent.trim().toLowerCase().includes("especialidade"))?.querySelector("input")?.id`);
    dataId = evalJs(`Array.from(document.querySelectorAll("campaign-compile-template .mt-2")).find(d=>d.querySelector("b")?.textContent.trim().toLowerCase().includes("data"))?.querySelector("input")?.id`);
    horaId = evalJs(`Array.from(document.querySelectorAll("campaign-compile-template .mt-2")).find(d=>d.querySelector("b")?.textContent.trim().toLowerCase().includes("horario"))?.querySelector("input")?.id`);
    localId = evalJs(`Array.from(document.querySelectorAll("campaign-compile-template .mt-2")).find(d=>{const t=d.querySelector("b")?.textContent.trim().toLowerCase(); return t && t.includes("local") && !t.includes("linkmaps")})?.querySelector("input")?.id`);
    linkId = evalJs(`Array.from(document.querySelectorAll("campaign-compile-template .mt-2")).find(d=>d.querySelector("b")?.textContent.trim().toLowerCase().includes("linkmaps"))?.querySelector("input")?.id`);
    if (espId2 && dataId && horaId && localId && linkId) break;
    await new Promise(r => setTimeout(r, 500));
  }

  log(`IDs: esp=${espId2} data=${dataId} hora=${horaId} local=${localId} link=${linkId}`);

  // Helper to set text with trailing space via focus+type (real user gesture)
  async function setTextWithTrailingSpace(id, value) {
    if (!id || id === "undefined") throw new Error(`ID not found for value ${value}`);
    evalJs(`document.getElementById("${id}")?.focus()`);
    await new Promise(r => setTimeout(r, 300));
    // Clear existing
    run(`press Control+a`);
    await new Promise(r => setTimeout(r, 200));
    run(`press Backspace`);
    await new Promise(r => setTimeout(r, 300));
    // Type value with trailing space
    execSync(`${NPX} --yes agent-browser keyboard type '${value.replace(/'/g, "'\\''")} '`, { encoding: "utf-8", shell: "C:\\Program Files\\Git\\bin\\bash.exe" });
    await new Promise(r => setTimeout(r, 500));
  }

  // Set textos com espaço final
  await setTextWithTrailingSpace(espId2, parametros.especialidade);
  await setTextWithTrailingSpace(localId, parametros.local);
  await setTextWithTrailingSpace(linkId, parametros.linkmaps);

  // Data — via valueAsDate + eventos
  {
    const iso = parametros.data.split("/").reverse().join("-"); // DD/MM/YYYY -> YYYY-MM-DD
    evalJs(`var el=document.getElementById("${dataId}"); el.valueAsDate=new Date(${iso.split("-")[0]},${parseInt(iso.split("-")[1])-1},${iso.split("-")[2]}); el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("dateInput",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}));`);
    await new Promise(r => setTimeout(r, 500));
  }
  // Horario
  {
    evalJs(`var el=document.getElementById("${horaId}"); el.value=${JSON.stringify(parametros.horario)}; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}));`);
    await new Promise(r => setTimeout(r, 500));
  }

  // After step: focar novamente e anexar espaço para garantir detecção (como feito manualmente)
  for (const id of [espId2, localId, linkId]) {
    if (!id) continue;
    evalJs(`document.getElementById("${id}")?.focus()`);
    await new Promise(r => setTimeout(r, 200));
    run(`press End`);
    await new Promise(r => setTimeout(r, 200));
    execSync(`${NPX} --yes agent-browser keyboard type ' '`, { encoding: "utf-8", shell: "C:\\Program Files\\Git\\bin\\bash.exe" });
    await new Promise(r => setTimeout(r, 300));
  }

  // Validar preview
  const previewOk = evalJs(`var h=document.querySelector("campaign-compile-template").innerHTML; [h.includes(${JSON.stringify(parametros.especialidade)})?"has esp":"no", h.includes(${JSON.stringify(parametros.local.slice(0,20))})?"has local":"no", h.includes(${JSON.stringify(parametros.data)})?"has data":"no"].join(" | ")`);
  log(`Preview check: ${previewOk}`);

  // Salvar Parâmetros — botão Salvar dentro do dialog Parâmetros (mesmo nome do Salvar da campanha)
  // O dialog Parâmetros contém campaign-compile-template; seu Salvar está no footer do mesmo mat-dialog-container
  evalJs(`var dlg=document.querySelector("campaign-compile-template")?.closest("mat-dialog-container"); var btn=dlg ? Array.from(dlg.querySelectorAll("button")).find(b=>b.textContent.trim()==="Salvar") : null; if(btn) btn.click();`);
  await new Promise(r => setTimeout(r, 800));
  // Fallback: tentar via mat-dialog-container que contém Parâmetros
  if (evalJs(`document.querySelector("campaign-compile-template") ? "still" : "closed"`) === "still") {
    evalJs(`Array.from(document.querySelectorAll("mat-dialog-container button")).find(b=>b.textContent.trim()==="Salvar" && b.closest("mat-dialog-container")?.textContent.includes("Parâmetros"))?.click()`);
    await new Promise(r => setTimeout(r, 800));
  }
  await new Promise(r => setTimeout(r, 1500));
  const stillParametros = evalJs(`document.querySelector("campaign-compile-template") ? "still" : "closed"`);
  const hasError = evalJs(`document.body.innerHTML.includes("Preencha todos os campos") ? "error" : "no error"`);
  if (stillParametros === "still" && hasError === "error") throw new Error("Parâmetros não salvos — Preencha todos os campos. Verifique espaços finais.");
  log("Parâmetros salvos.");

  // 4.5 Audiência — usar cliques reais, não remover HTML
  log(`Configurando audiência: ${audiencia.etiqueta}`);
  evalJs(`document.querySelector('[data-cy="select-public"]')?.click()`);
  await new Promise(r => setTimeout(r, 1200));
  evalJs(`Array.from(document.querySelectorAll("*")).find(e=>e.textContent.trim()==="Filtro por contato")?.click()`);
  await new Promise(r => setTimeout(r, 1200));
  // Clicar no + de "Contém estas etiquetas"
  evalJs(`var icon=document.querySelector('mat-icon[data-mat-icon-name="plus"]'); var btn=icon?.closest("button") || icon?.closest("generic") || icon?.parentElement; btn?.click()`);
  await new Promise(r => setTimeout(r, 900));
  // Aguardar menu Etiquetas abrir
  for (let i = 0; i < 8; i++) {
    const has = evalJs(`document.querySelector(".cdk-overlay-pane input[placeholder=\\"Pesquisar\\"]") ? "yes" : "no"`);
    if (has === "yes") break;
    await new Promise(r => setTimeout(r, 400));
  }
  // Filtrar por etiqueta para garantir que Teste apareça no topo
  evalJs(`var inp=document.querySelector(".cdk-overlay-pane input[placeholder=\\"Pesquisar\\"]"); if(inp){inp.focus(); var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set; s.call(inp,${JSON.stringify(audiencia.etiqueta)}); inp.dispatchEvent(new Event("input",{bubbles:true})); inp.dispatchEvent(new Event("change",{bubbles:true}));}`);
  await new Promise(r => setTimeout(r, 900));
  // Selecionar a etiqueta (clicar no label da checkbox)
  evalJs(`Array.from(document.querySelectorAll(".cdk-overlay-pane label")).find(l=>l.textContent.trim().includes(${JSON.stringify(audiencia.etiqueta)}))?.click()`);
  await new Promise(r => setTimeout(r, 700));
  // Fechar menu clicando fora — clicar no título "Filtrar contatos" (método do usuário: clica fora)
  evalJs(`Array.from(document.querySelectorAll("*")).find(e=>e.textContent.trim()==="Filtrar contatos")?.click()`);
  await new Promise(r => setTimeout(r, 700));
  // Fallback: clicar no backdrop do menu
  evalJs(`document.querySelector(".cdk-overlay-backdrop")?.click()`);
  await new Promise(r => setTimeout(r, 600));
  if (evalJs(`document.querySelector(".cdk-overlay-container")?.innerHTML.includes("Etiquetas") ? "yes" : "no"`) === "yes") {
    run(`press Escape`);
    await new Promise(r => setTimeout(r, 700));
  }
  // Aplicar filtros
  evalJs(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim().includes("Aplicar filtros"))?.click()`);
  await new Promise(r => setTimeout(r, 1800));
  // Adicionar N contatos — primeiro: no dialog Filtrar contatos (botão mostra "Adicionar 1 contato")
  // O dialog Filtrar contém "Filtrar contatos" e o botão com "Adicionar"
  evalJs(`var dlgFiltrar=Array.from(document.querySelectorAll("mat-dialog-container")).find(c=>c.textContent.includes("Filtrar contatos")); var btn1=dlgFiltrar ? Array.from(dlgFiltrar.querySelectorAll("button")).find(b=>b.textContent.includes("Adicionar") && b.textContent.includes("contato") && !b.disabled) : null; if(btn1) btn1.click(); else Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Adicionar") && b.textContent.includes("contato") && !b.disabled)?.click();`);
  await new Promise(r => setTimeout(r, 1500));
  // Confirmação "Você está adicionando N contatos" -> Adicionar (segundo, no dialog de confirmação com mesmo nome mas diferente container)
  // Este dialog contém o texto "Você está adicionando" e tem um botão "Adicionar 1 contato"
  for (let i = 0; i < 5; i++) {
    const hasConfirm = evalJs(`Array.from(document.querySelectorAll("mat-dialog-container")).find(c=>c.textContent.includes("Você está adicionando")) ? "yes" : "no"`);
    if (hasConfirm === "yes") break;
    await new Promise(r => setTimeout(r, 400));
  }
  evalJs(`var dlgConf=Array.from(document.querySelectorAll("mat-dialog-container")).find(c=>c.textContent.includes("Você está adicionando")); var btn2=dlgConf ? Array.from(dlgConf.querySelectorAll("button")).find(b=>b.textContent.includes("Adicionar")) : null; if(btn2) btn2.click();`);
  await new Promise(r => setTimeout(r, 1800));
  log("Audiência adicionada.");

  // 4.6 Salvar campanha — aguardar botão ficar habilitado
  log("Salvando campanha como rascunho...");
  for (let i = 0; i < 10; i++) {
    const disabled = evalJs(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Salvar" && !b.closest("campaign-compile-template") && !b.closest("mat-dialog-container"))?.disabled ? "yes" : "no"`);
    if (disabled === "no") break;
    await new Promise(r => setTimeout(r, 500));
  }
  evalJs(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Salvar" && !b.closest("campaign-compile-template") && !b.closest("mat-dialog-container") && !b.disabled)?.click()`);
  await new Promise(r => setTimeout(r, 2500));
  const finalUrl = evalJs("location.href");
  assert(finalUrl.includes("/campaign") && !finalUrl.includes("/new"), `Not back to list, got ${finalUrl}`);
  const countText = evalJs(`document.body.innerHTML.slice(document.body.innerHTML.indexOf("campanhas encontrados")-50, document.body.innerHTML.indexOf("campanhas encontrados")+30)`);
  log(`Lista: ${countText}`);
  log("✓ Campanha criada em Rascunho. Validar na lista: nome exato, Destinatários=N, Status=Rascunho, Alterar mostra preview correto.");
*/
}

main().catch(e => { console.error(e.message); process.exit(1); });
