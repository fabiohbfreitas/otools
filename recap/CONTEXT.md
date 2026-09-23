# CONTEXT — Recaptação e Reagendamento

Ferramentas para gerar listas de recaptação (Pacientes + Envios) e reagendar horários.
Stack: Python + uv (`uv run <script> [flags]`). Dep única: `openpyxl`.

## Scripts

- **`envios.py` (principal):** lê inputs brutos → distribui por data/polo/horário → grava o par
  `Recaptação {DD_MM} [{sufixo}] - Pacientes.xlsx` + `... - Envios.xlsx`.
- **`recap.py` (biblioteca, sem CLI):** leitura, distribuição, telefones, etiquetas,
  excedentes, validação, selfchecks. Importado pelos outros dois.
- **`reagendar.py`:** troca SÓ os horários de um Pacientes+Envios já gerado.
  Entrada e saída têm o mesmo layout; nada mais muda.

## Entrada (recaptação)

- Pasta (`--inputs`, padrão `Input/`) ou arquivo único `.xlsx`/`.csv`.
- Cabeçalho validado nas 6 colunas: `Paciente, Telefone, Data, Horário, Unidade, Especialidade`
  (`Situação, Observação` opcionais). Fora disso = erro e aborta.
- Todos os arquivos viram **uma lista única** (união por concatenação, ordem alfabética).
- **Sem dedup:** mesmo paciente em 2 arquivos = alocado 2x.
- Telefones: vários separados por vírgula; pode ser vazio. Existem números
  placeholder compartilhados (ex: `(61) 3315-2425`) — nunca usar fone como identidade.

## Config (`config.json`)

- `slots`: grade de horários (ex: `["13:00", "13:45", "14:30"]`). É a única fonte da grade.
- `min_por_horario` (atual: 5): mínimo de pacientes por grupo de horário.
- `polos`: `{endereco, link}` por polo + override opcional por especialidade (vazio hoje).
- `etiqueta_envios`: `{data_iso}, Automação, {esp}, {polo}, {agenda}` (esp antes do polo).
- `metas_por_polo`: **removido do config**. Se voltar, ativa cotas exatas/dia,
  excedentes e `--planejar`. Código continua suportando.

## Distribuição (recaptação)

1. **Cotas por data:** sem metas = divisão igual por polo (resto nas primeiras datas).
2. **Horários:** cada bloco (data,polo) é espalhado no **mínimo de horários necessários**,
   cada grupo com ≥ `min_por_horario`. Exceção: 1 grupo único menor quando faltam pacientes.
3. Ordem do input preservada; excedente = sempre a **cauda** da lista do polo.
4. Blocos (data,polo) vazios são pulados (sem separador órfão).
5. **Excedentes:** sobra de meta vai para `excedentes/excedentes_DD_MM-DD_MM.xlsx`
   no formato original de 8 colunas (reutilizável como input). Sem metas, nunca há excedente.

## Regras de dados

- **Telefone principal:** 1º com 11 dígitos (celular), senão o 1º. Resto → `Outros Telefones: …`
  (sem dedup). `Pacientes` leva todos; `Envios` leva principal + notas.
- **Especialidade:** `Pacientes` mantém `Ortopedia - Ombro`; `Envios` + etiqueta usam a base
  (`Ortopedia` = antes de `" - "`).
- **Etiqueta hora:** `Agenda07h30`; `00` omitido (`Agenda09h`, `Agenda13h`).
- **Tipos:** Data = texto `DD/MM/AAAA`; Hora = hora Excel (`HH:MM`).
- **Endereço/link:** do polo (fallback); override por especialidade se existir.

## Saídas (recaptação)

- `Pacientes`: `Nome, Telefone, Data Recaptação, Data, Hora, Especialidade, Local(=polo)`.
- `Envios`: `Nome, [paciente], Telefone, Notas Internas, Etiquetas, [data], [horario],
  [especialidade], [local], [linkmaps]`. Colunas `[x]` = variáveis do template da plataforma;
  sem `[ ]` = só CRM.
- Sem linhas em branco; 1 aba por arquivo. `--sufixo "X"` →
  `Recaptação DD_MM X - …` (ex: polos/turnos). Sem sufixo = nome base.

## Reagendamento (`reagendar.py`)

- Entrada: xlsx com abas `Pacientes`+`Envios` (ex: exportado pela plataforma).
  Fonte = aba `Pacientes` (Nome, Telefone+Notas, Data, Hora, Especialidade, Local=polo).
- Modos (ordem do arquivo preservada, exatamente 1 por execução):
  - `--horarios s1,s2,…` → divisão igual com o mínimo do config;
  - `--grupos "20:s1,s2;17:s3,s4"` → N primeiros p/ conjunto A, próximos M p/ B (soma = total, senão erro);
  - `--cotas "s1=N,…"` (exige `--horarios`) → N exatos no horário, resto igual nos demais (com mínimo).
- `--nova-data AAAA-MM-DD` (opcional): sem ela, Data intacta.
- Saída: `<base> [--sufixo] - Pacientes.xlsx` + `<base> [--sufixo] - Envios.xlsx`,
  **mesmo layout/tipos da entrada**; só Hora/`[horario]`/Etiquetas mudam (+Data com `--nova-data`).

## Lista negativa (`--lista-negativa ARQ` no `envios.py`)

- Exclui do input quem já está num Pacientes/Envios anterior. Match **estrito**:
  nome (upper, espaços colapsados) + principal (só dígitos) iguais.
- Auto-detecta a aba (prefere `Envios`: `[paciente]`+`Telefone`; senão `Pacientes`).
  Linha sem principal nunca casa. Filtra **antes** de distribuir; loga nomes + totais.

## Invariantes (sempre verdadeiras)

1. Nenhum grupo de horário abaixo do mínimo, salvo grupo único por falta de pacientes.
2. Todo paciente do input aparece exatamente 1x na saída (alocado ou excedente),
   exceto filtrados pela lista negativa (logados).
3. Reagendar nunca altera nada além de Hora/`[horario]`/Etiquetas (+Data com `--nova-data`).
4. `Pacientes` sempre carrega todos os telefones; `Envios`, só o principal + resto em Notas.
5. Sem `--sufixo`, nomes de saída nunca mudam; `reagendar` nunca sobrescreve a entrada.

## Casos de uso típicos

```bash
uv run envios.py --datas 2026-09-24 --sufixo "Gama Manhã"   # recap normal
uv run envios.py --inputs Input/arq.xlsx --datas 2026-09-24 # arquivo único
uv run envios.py --datas 2026-09-24 --lista-negativa old.xlsx
uv run reagendar.py --input base.xlsx --horarios 07:30,08:15
uv run reagendar.py --input base.xlsx --grupos "20:07:30,08:15;17:13:00,14:00"
uv run reagendar.py --input base.xlsx --horarios 07:30,08:15 --cotas "07:30=10"
uv run envios.py --selfcheck   # valida tudo (reagendar.py e recap idem)
```

## Armadilhas conhecidas

- Gerar sobrescreve arquivos de mesmo nome **sem backup**.
- `/` em sufixo vira pasta: usar `-` (`Gama-Sobradinho`).
- `--datas` repetida quebra a ordem dos blocos (`dates.index`).
- Homônimos em polos distintos: chave inclui polo/telefone onde couber; revisar manualmente.
- `example_output.xlsx` é referência parcial de layout (aba `Envios` continua válida;
  `Pacientes` divergiu: sem Notas, com `Data Recaptação`, `[paciente]` em outra posição).
