# Spec — Criação de Campanha de Confirmação (Fasterisk) — Browser do usuário, rascunho previsível

> Escrita para humanos e LLMs menos capazes. Passos são determinísticos. Assume navegador do usuário já logado.

## 1. Objetivo
Criar, de forma previsível, uma campanha **Modelos de mensagem → Sequências → `[Automação] Mensagem de Confirmação de Consultas (com Botões)`** como **Rascunho** (nunca disparar), a partir de **dados da consulta** + **etiqueta de público**. O solicitante informa apenas `dados` e `etiqueta`; todo o resto segue este spec.

## 2. Precondições
- **Navegador:** Chrome/Chromium com CDP habilitado (`--remote-debugging-port=9222`), perfil logado em `https://app.chatfast.chat` (tenant `Instituto Esporte e Vida`).
- **Conexão:** `npx --yes agent-browser connect 9222` deve retornar `✓ Done`. Aba Fasterisk ativa: `npx --yes agent-browser tab t1` (verificar com `npx --yes agent-browser tab list` → deve listar `Fasterisk - https://app.chatfast.chat/...`).
- **Permissão:** Usuário com permissão de criar campanhas. Em `https://app.chatfast.chat/campaign` a lista carrega sem erro `Erro de carregamento`.
- **Template existe:** Em `canal` informado, `Modelos de mensagem` contém o template exato `[Automação] Mensagem de Confirmação de Consultas (com Botões)` em `Sequências`.
- **Etiqueta existe:** A etiqueta informada (ex: `Teste`) existe em `Etiquetas` (tag preta `Teste`).
- **Estado inicial:** Em `/campaign`, sem diálogos abertos. Se houver filtros antigos, clicar `Limpar filtros` (texto `Limpar filtros`) e validar que `Período` e `Situação` voltam ao padrão.

## 3. Entradas (o que o usuário informa)

```json
{
  "campanha": { "local": "Gama", "especialidade": "Ortopedia", "data": "02/09/2026", "horario": "08:00" },
  "equipe": "[TI] Testes de Automação",
  "canal": "(61) 3181-8444",
  "parametros": {
    "especialidade": "Ortopedia - TESTE",
    "data": "02/09/2026",
    "horario": "08:00",
    "local": "UBS Teste - Gama DF (Ficticio - Rascunho)",
    "linkmaps": "https://maps.app.goo.gl/teste-ficticio-rascunho"
  },
  "audiencia": { "etiqueta": "Teste" }
}
```

- **Nome (padrão fixo, não livre):** Montar como `[TESTE] [Local] [Especialidade] Consulta HHhMM DD/MM/AAAA - RASCUNHO (nao disparar)` + prefixo de teste se houver, ex: `[TESTE-FABIO 01/09/2026] [Automacao] Mensagem de Confirmacao de Consultas - RASCUNHO (nao disparar)`. O solicitante informa `local/especialidade/data/horario`; o executor monta o nome.
- **Parâmetros:** `especialidade/data/horario/local/linkmaps` são **únicos por campanha** (mesmo valor para todos destinatários). `paciente` é sempre `Nome do contato (completo)` (preenchido automaticamente, desabilitado).
- **Audiência:** Sempre `Filtro por contato → Contém estas etiquetas → <etiqueta>` (ex: `Teste`). Nunca lista direta.
- **Equipe e canal:** Informados a cada campanha (não fixos).

## 4. Procedimento — Passos exatos com agent-browser

> Todos os comandos abaixo são executados com CDP já conectado. Use `npx --yes agent-browser eval '...'` com aspas simples por fora e duplas por dentro (escapar `'` como `\x27`). Verificar cada passo com `snapshot` ou `eval` antes de prosseguir. Nunca remover HTML via `remove()` — interagir apenas com botões/clicks.

### 4.1 Limpar filtros e criar
```bash
npx --yes agent-browser tab t1
npx --yes agent-browser eval 'location.href' # deve ser https://app.chatfast.chat/campaign
# Se houver "Limpar filtros" visível:
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("*")).find(e=>e.textContent.trim()==="Limpar filtros")?.click()'
# Validar: npx --yes agent-browser eval 'document.body.innerHTML.includes("653 campanhas")' etc — contador volta ao total

# Criar
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Novo")?.click()'
# Aguarda /campaign/new com título "Configuração de campanha"
```

### 4.2 Preencher cabeçalho
```bash
# Nome — montar pelo padrão fixo e digitar
npx --yes agent-browser eval 'document.querySelector("input[placeholder=\"Nome da campanha\"]")?.focus()'
npx --yes agent-browser keyboard type "[TESTE] [Gama] [Ortopedia] Consulta 08h00 02/09/2026 - RASCUNHO (nao disparar)"
# ou usar fill no textbox "Nome da campanha" via snapshot ref, se preferir

# Equipe — selecionar TI
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("mat-select")).find(s=>s.textContent.includes("Equipe"))?.click()'
# aguarda overlay com opções, então:
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("mat-option")).find(o=>o.textContent.includes("[TI] Testes de Automação"))?.click()'
# Validar: snapshot deve mostrar combobox "Equipe [TI] Testes de Automação"

# Canal — já vem (61) 3181-8444; se diferente, selecionar o informado via mesmo padrão de mat-select
```

### 4.3 Disparo — Modelo de mensagem + Sequência
```bash
# Disparo deve ser "Modelo de mensagem" (nunca Chatbot)
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("mat-select")).find(s=>s.textContent.includes("Disparo"))?.click()'
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("mat-option")).find(o=>o.textContent.trim()==="Modelo de mensagem")?.click()'

# Escolher template
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Escolher")?.click()'
# Dialog "Modelo de mensagem" abre — mudar filtro de Campanhas para Sequências:
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("mat-select")).find(s=>s.textContent.includes("Campanhas"))?.click()'
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("mat-option")).find(o=>o.textContent.includes("Sequências"))?.click()'
# Selecionar o template
npx --yes agent-browser eval 'document.querySelectorAll(".flex.items-center.gap-2.p-2")[0].click()'
# Validar: primeiro radio deve ficar mat-radio-checked
npx --yes agent-browser eval 'document.querySelectorAll(".mat-radio-button")[0].className.includes("mat-radio-checked")'

# Definir parâmetros
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Definir parâmetros"))?.click()'
# Abre dialog Parâmetros (campaign-compile-template)
```

### 4.4 Parâmetros — preenchimento com workaround de detecção

> **Regra de ouro para campos de texto (especialidade/local/linkmaps):** o frontend só detecta como preenchido após um espaço final digitado via interação real. Após digitar o valor, **focar o campo, pressionar End e digitar um único espaço " "** — verificar no preview à direita que `[especialidade]`/`[local]`/`[linkmaps]` em vermelho somem. Para `data`/`horario` (datepicker/timepicker), usar atribuição direta + eventos.

```bash
# IDs atuais (descobrir via: Array.from(document.querySelectorAll('input[id^="mat-input"]')).map(i=>i.id+":"+i.type))
# Exemplo após abrir Parâmetros: mat-input-29=especialidade, 30=data, 31=horario, 32=local, 33=linkmaps

# 1) especialidade — texto com espaço final
npx --yes agent-browser eval 'document.getElementById("mat-input-29").focus()'
npx --yes agent-browser press Control+a
npx --yes agent-browser press Backspace
npx --yes agent-browser keyboard type "Ortopedia - TESTE "
# Validar: document.getElementById("mat-input-29").value.endsWith(" ") && preview contém "Ortopedia - TESTE"

# 2) data — datepicker (usar valueAsDate + eventos, não espaço)
npx --yes agent-browser eval 'var el=document.getElementById("mat-input-30"); el.valueAsDate=new Date(2026,8,2); el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("dateInput",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}));'
# Validar preview: html.includes("02/09/2026")

# 3) horario — timepicker
npx --yes agent-browser eval 'var el=document.getElementById("mat-input-31"); el.value="08:00"; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}));'
# Validar preview: html.includes("08:00")

# 4) local — texto com espaço final
npx --yes agent-browser eval 'document.getElementById("mat-input-32").focus()'
npx --yes agent-browser press Control+a
npx --yes agent-browser press Backspace
npx --yes agent-browser keyboard type "UBS Teste - Gama DF (Ficticio - Rascunho) "

# 5) linkmaps — texto com espaço final (mesmo sendo URL, o trim do backend remove o espaço)
npx --yes agent-browser eval 'document.getElementById("mat-input-33").focus()'
npx --yes agent-browser press Control+a
npx --yes agent-browser press Backspace
npx --yes agent-browser keyboard type "https://maps.app.goo.gl/teste-ficticio-rascunho "

# Ou, alternativa robusta para textos (se digitação falhar, usar setter + espaço):
# npx --yes agent-browser eval 'var el=document.getElementById("mat-input-32"); el.focus(); var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set; s.call(el,"UBS Teste - Gama DF (Ficticio - Rascunho) "); el.dispatchEvent(new Event("input",{bubbles:true}));'

# Validar preview final antes de salvar:
npx --yes agent-browser eval 'var h=document.querySelector("campaign-compile-template").innerHTML; [h.includes("Ortopedia - TESTE")?"has esp":"no", h.includes("UBS Teste")?"has local":"no", h.includes("maps.app.goo.gl")?"has link":"no", h.includes("02/09/2026")?"has data":"no"].join(" | ")'

# Salvar Parâmetros (botão Salvar dentro do dialog Parâmetros)
npx --yes agent-browser eval 'Array.from(document.querySelector("campaign-compile-template").querySelectorAll("button")).find(b=>b.textContent.trim()==="Salvar")?.click()'
# Esperar fechar sem "Preencha todos os campos". Validar: document.querySelector("campaign-compile-template")==null && !document.body.innerHTML.includes("Preencha todos os campos")
```

### 4.5 Audiência — por etiqueta
```bash
# Na campanha, clicar Definir público
npx --yes agent-browser eval 'document.querySelector("[data-cy=\"select-public\"]")?.click()'
# Dialog Adicionar contatos → clicar Filtro por contato
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("*")).find(e=>e.textContent.trim()==="Filtro por contato")?.click()'
# Dialog Filtrar contatos → em Etiquetas → Contém estas etiquetas → clicar + (Adicione etiquetas)
# O + é o generic clickable após o texto "Adicione etiquetas" — usar ref do snapshot ou:
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("*")).find(e=>e.textContent.trim()==="Adicione etiquetas")?.click()'
# No menu Etiquetas, selecionar "Teste" (pode precisar rolar: document.querySelector(".cdk-overlay-pane .overflow-y-auto").scrollTop=500)
npx --yes agent-browser eval 'Array.from(document.querySelectorAll(".cdk-overlay-pane label")).find(l=>l.textContent.includes("Teste"))?.click()'
# Fechar menu Etiquetas clicando fora (ou no backdrop) — clicar no título "Filtrar contatos"
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("*")).find(e=>e.textContent.trim()==="Filtrar contatos")?.click()'
# Clicar Aplicar filtros
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim().includes("Aplicar filtros"))?.click()'
# Após filtrar, o dialog mostra "Adicionar 1 contato" habilitado — clicar
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Adicionar 1 contato"))?.click()'
# Dialog de confirmação "Você está adicionando 1 contato" → clicar Adicionar 1 contato novamente
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Adicionar 1 contato") && b.closest("mat-dialog-container"))?.click()'
# Voltar à campanha — validar Destinatários: 1 e Etiquetas: Teste visíveis
```

### 4.6 Salvar campanha (rascunho)
```bash
# Na campanha, clicar Salvar (não Confirmar e disparar)
npx --yes agent-browser eval 'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Salvar" && b.closest("form"))?.click()'
# ou via snapshot ref do botão Salvar da campanha
# Aguardar redirecionamento para /campaign — validar lista com 653 campanhas, primeira linha com nome exato, Destinatários=1, Status=Rascunho
```

## 5. Pós-condições e Validação

### 5.1 Lista
- Em `/campaign`, contador `653 campanhas encontrados` (incremento +1). Primeira linha: **nome exato** montado no padrão fixo, `Destinatários = 1` (ou N da etiqueta), `Status = Rascunho`, `Data de disparo` vazia.

### 5.2 Detalhe
- Clicar `Alterar` na campanha criada → `Equipe` mostra a informada, `Disparo` mostra `Modelo de mensagem`, preview mostra todos os 5 parâmetros preenchidos (sem placeholders vermelhos), `Destinatários: 1`, `Etiquetas: Teste`.

### 5.3 API (opcional)
- `GET /chat/v1/campaign?includeDetails=...` contém a campanha com `status=RASCUNHO` e `template` correto. Validar via `performance.getEntriesByType("resource")` ou HAR.

### 5.4 Falha se
- `Rascunho` não aparece, `Destinatários` continua 0, ou preview ainda com `[especialidade]`/`[local]` vermelho → refazer §4.4 com espaço final.
- `Nenhum chatbot encontrado` → verificar que `Disparo` é `Modelo`, não `Chatbot`.
- Etiqueta `Teste` não encontrada → criar etiqueta antes.

## 6. Erros e Retentativas
- `Preencha todos os campos` ao salvar Parâmetros → refazer espaço final nos 3 textos e re-salvar (não remover HTML, apenas focar e digitar espaço).
- Menu Etiquetas não fecha → clicar no título `Filtrar contatos` ou fora do menu, nunca remover via `remove()`.
- CDP desconectado → `npx --yes agent-browser connect 9222` novamente.

## 7. Exemplo completo
Entrada: `local=Gama, especialidade=Ortopedia, data=02/09/2026, horario=08:00, equipe=TI, canal=3181-8444, etiqueta=Teste` → Nome `[TESTE] [Gama] [Ortopedia] Consulta 08h00 02/09/2026 - RASCUNHO` → Campanha salva em Rascunho com 1 destinatário.

## 8. Notas para LLMs implementadores
- Sempre usar `eval` com seletores estáveis (`[data-cy]`, `mat-select`, `mat-option`, `h4`) em vez de refs `@eXX` que mudam a cada snapshot.
- Para textos, **sempre** terminar com `End` + ` ` (espaço) via `keyboard type " "` após digitar, e verificar no preview.
- Para `data`/`horario`, usar `valueAsDate`/`value` + eventos `input`/`change`/`dateInput` — não tentar digitar manualmente com `fill`.
- Nunca usar `remove()` no DOM — interagir apenas com botões.
- Validar cada passo com `eval` antes de prosseguir.
