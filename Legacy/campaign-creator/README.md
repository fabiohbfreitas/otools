# campaign-creator

Helper previsível para criar campanhas Fasterisk **em rascunho** via `agent-browser`, seguindo `spec.md`.

## Precondições
- Chrome com CDP: `chrome --remote-debugging-port=9222` e aba Fasterisk logada (`npx --yes agent-browser connect 9222 && npx --yes agent-browser tab t1`)
- Em `https://app.chatfast.chat/campaign`

## Uso

```bash
node create.js example.json
# ou
npm run create -- example.json
```

`example.json` segue o formato da spec §3 (ver `example.json`).

## O que faz
1. Limpa filtros, clica Novo, preenche nome/equipe/canal
2. Seleciona `Modelo de mensagem → Sequências → [Automação] Mensagem de Confirmação de Consultas (com Botões)`
3. Preenche parâmetros com workaround de espaço final para textos e datepicker para data/horário, valida no preview
4. Define público por etiqueta (`Teste`), aplica filtro e adiciona contato(s)
5. Salva como **Rascunho** (nunca dispara)

## Validação
- Lista mostra `+1` campanha, com `Destinatários = N`, `Status = Rascunho`
- Ao clicar `Alterar`, preview mostra todos os parâmetros sem placeholders vermelhos
