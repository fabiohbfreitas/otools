# Spec: SaudeDaGente XLSX → Organized CSV Import Files

This document is a **language-agnostic specification** of the `process.py` pipeline.
It describes the input, the transformation rules, and the exact output layout so that
both humans and LLMs can implement, review, or maintain this logic in any programming
language. The existing implementation (`process.py`) is one possible implementation of
this spec and must behave consistently with it.

---

## 1. Purpose

Convert a set of Excel (`.xlsx`) exports from the "Saúde da Gente" program into
WhatsApp-import-ready CSV files.

Each Excel workbook represents **one specialty** (e.g. Cardiology). Inside the workbook,
each worksheet represents **one day** (e.g. `24-08`). The goal is to split the data into
small, importable CSV files grouped by **day** and by **specialty**, plus (optionally)
one combined file per day containing all specialties.

---

## 2. Input

- One or more `.xlsx` files. The input may be:
  - a single file path, or
  - a folder path (all `.xlsx` files in that folder are processed).
- Each file name identifies the specialty (e.g. `Cardiologia.xlsx`, `Laboratório.xlsx`).
- Each worksheet inside the file is a day, named like `24-08` (day-month, no year).
- Worksheets may be empty (no header, no data). Empty sheets must be skipped.
- A worksheet may contain only a stray value in the first cell (e.g. a number `26`)
  with no header and no data. Such sheets must be skipped.

### Expected columns

The data sheet has a header row, then one row per patient. Columns are located by
**header name**, not by fixed position. Required logical columns:

| Logical column | Typical header names found in the data |
|---|---|
| Nome (patient name) | `Nome`, `NOME` |
| Telefone (phone) | `Telefone`, `Telefone(s)`, `TELEFONE(S)` |
| Data (date) | `Data`, `Data/Hora`, `DATA/HORA`, `Hora` |
| Especialidade (specialty) | `Especialidade`, `ESPECIALIDADE` |

Header matching is **fuzzy**: accents and non-alphanumeric characters are ignored and
compared in uppercase, and a header is matched if it *contains* the keyword
(e.g. `TELEFONE` matches `TELEFONE(S)`; `DATA` matches `DATA/HORA`).

If a sheet's header does not contain all four required logical columns, that sheet is
skipped (it is considered unusable/empty).

### 2.1 Variant: single-sheet per-row exports (`--quant`)

A second input format, selected with the `--quant` flag. The workbook contains one or
more plain-named spreadsheets (e.g. `Sheet1`) whose header is:

```
Quant., Nome, Telefone, Data, Hora, Especialidade, Local
```

- Only `Nome`, `Telefone`, `Data` and `Especialidade` are used; `Quant.` (row counter),
  `Hora` and `Local` are ignored.
- Date and specialty are resolved **per row**, not per sheet/file:
  - The specialty is taken from each row's Especialidade cell, normalized per Section
    4.1 and matched against the alias table (Section 4.2). Unmatched values fall back
    to their normalized title-case form.
- Output folders use the **full ISO date** from the row (`<output_base>/2026-08-26/Ginecologia.csv`)
  instead of worksheet names.
- Etiquetas, phone handling, skip rules and CSV format are identical to Sections 5/3.3.
- Compatible with `--daily` (combined files at `<output_base>/<YYYY-MM-DD>.csv`) and
  `--verbose`. Not compatible with `--validate`.
- `--duplicates` accepts day folders named either `DD-MM` or `YYYY-MM-DD`.

---

## 3. Output

Output is written **in the same folder as the input** (`output_base`).

### 3.1 Per-day, per-specialty files (always)

```
<output_base>/<day>/<CanonicalSpecialty>.csv
```

- `<day>` is the **worksheet name** (e.g. `24-08`). Folder names are sanitized:
  characters `< > : " / \ | ? *` are replaced with `_`.
- `<CanonicalSpecialty>` is the canonical specialty name (see Section 4).
- These files always exist; they are not optional.

### 3.2 Combined daily files (only with `--daily`)

```
<output_base>/<YYYY-MM-DD>.csv
```

- One file per date, at the same level as the day folders.
- Contains **all specialties** for that day.
- Rows are kept in **source order** (the order they appear across input files).
- File name uses the full ISO date (e.g. `2026-08-24.csv`).

### 3.3 CSV file format (both output kinds)

- Header row: `Nome, Telefone, Etiquetas, Notas Internas`
- Encoding: UTF-8 with BOM (`utf-8-sig`).
- Line ending: CRLF (`\r\n`).
- Delimiter: comma.
- All fields are wrapped in double quotes (`csv.QUOTE_ALL`).
- Any embedded double quotes inside a value are doubled (`"` → `""`).

### Example output tree

```
data/SaudeDaGente/
├── 24-08/
│   ├── Cardiologia.csv
│   ├── Dermatologia.csv
│   ├── Ecografia.csv
│   ├── ExameLaboratorial.csv
│   ├── Ginecologia.csv
│   ├── Mamografia.csv
│   ├── Ortopedia.csv
│   └── Pediatria.csv
├── 25-08/
│   └── ...
├── 2026-08-24.csv      (only with --daily; all specialties combined)
└── 2026-08-25.csv      (only with --daily)
```

---

## 4. Specialty canonicalization

Each workbook is assigned exactly one **canonical specialty name**. Resolution order:

1. **By file name** (stem, without extension): the name is normalized and looked up in
   the alias table (Section 4.2). If found, that canonical name is used.
2. **By the Especialidade column**: if the file name did not match, scan the sheets'
   Especialidade column values (normalized) and return the first canonical that any
   value matches.
3. If neither succeeds, processing fails for that file with an error naming the file.

### 4.1 Normalization rule

Normalization applied to any text before matching:

1. Decompose accents (NFD unicode normalization).
2. Drop combining/accent marks.
3. Convert to uppercase.
4. Remove everything that is not `A-Z` or `0-9`.

Examples: `Laboratório` → `LABORATORIO`; `Clínica Médica` → `CLINICAMEDICA`;
`US DE ABDOMEN TOTAL` → `USDEABDOMENTOTAL`.

### 4.2 Alias → canonical table

Matching is **substring-based in both directions**: a token is a match if the normalized
input *contains* the token OR the token *contains* the normalized input.

| Alias tokens (normalized) | Canonical output |
|---|---|
| `LABORATOR` | `ExameLaboratorial` |
| `CARDIOLOGIA`, `CARDIOLOGISTA` | `Cardiologia` |
| `DERMATOLOGIA`, `DERMATOLOGISTA` | `Dermatologia` |
| `ECOGRAFIA`, `US DE ABDOMEN TOTAL`, `US DE TIREOIDE`, `US MAMARIA` | `Ecografia` |
| `GINECOLOGIA`, `GINECOLOGISTA` | `Ginecologia` |
| `MAMOGRAFIA` | `Mamografia` |
| `ORTOPEDIA`, `ORTOPEDISTA` | `Ortopedia` |
| `PEDIATRIA`, `PEDIATRA` | `Pediatria` |
| `REUMATOLOGIA`, `REUMATOLOGISTA` | `Reumatologia` |
| `ENDOCRINOLOGIA`, `ENDOCRINOLOGISTA` | `Endocrinologia` |
| `OTORRINO`, `OTORRINOLARINGOLOGIA` | `Otorrinolaringologia` |
| `CLINICAMEDICA` | `ClinicaMedica` |

Note: `LABORATOR` must be matched before more specific tokens because many laboratory
values contain it.

---

## 5. Per-row transformation

For each data row (after the header), the following rules produce exactly one output row.

### 5.1 Skip rules

- Rows where the **Nome** cell is empty/whitespace are ignored (not counted).
- Rows with no usable date (see 5.4) are **skipped and counted**; the count is reported.

### 5.2 Phone parsing and selection

The raw Telefone cell may contain several phone numbers, separated by commas, spaces,
slashes, etc. Steps:

1. **Extract** all phone numbers from the raw text using the pattern:
   `(?:\(?\d{2}\)?\s?\d{4,5}-?\d{4})` (a DDD in optional parentheses, optional space,
   then 4–5 digits, optional hyphen, 4 digits).
2. **Normalize** each extracted number to a canonical form:
   - 11 digits → `(DD) XXXXX-XXXX` (first 2 = area code, next 5, last 4).
   - 10 digits → `(DD) XXXX-XXXX` (first 2 = area code, next 4, last 4).
   - anything else → left as extracted (trimmed).
3. **Choose the phone** for the `Telefone` column:
   - Prefer the first number whose digits, after removing the area code (first 2
     digits), have length **9** and start with **9** (i.e. a Brazilian mobile).
   - If none qualifies, use the **first** extracted number.
4. **Remaining phones** (all except the chosen one) are joined with `, ` and put in
   `Notas Internas` as `Outros telefones: <list>`. If there are no remaining phones,
   `Notas Internas` is empty.

### 5.3 Tags (Etiquetas column)

Etiquetas is a single string of tags joined by `", "`:

```
<YYYY-MM-DD>, Automação, <CanonicalSpecialty>, SaudeDaGente, Marajo
```

Fixed tags (always present, in this order):
1. `Automação` — automation/tracking marker.
2. `SaudeDaGente` — program name.
3. `Marajo` — location tag.

Example: `2026-08-24, Automação, Cardiologia, SaudeDaGente, Marajo`

### 5.4 Date handling

The date tag is the full ISO date `YYYY-MM-DD`. Resolution order per row:

1. Parse the **Data** column value. Accept the following forms:
   - a real date/time value (ISO format),
   - strings: `YYYY-MM-DD HH:MM:SS`, `YYYY-MM-DD`, `MM/DD/YYYY`, `MM-DD-YYYY`, `DD/MM/YYYY`,
   - fallback regexes for `YYYY-MM-DD` and `MM/DD/YYYY` embedded in a larger string.
2. If the Data column yields nothing, fall back to the **worksheet name** (`DD-MM`)
   combined with the current year (e.g. sheet `24-08` → `2026-08-24`).
3. If both fail, the row is skipped and counted.

---

## 6. CLI usage

| Command | Behavior |
|---|---|
| `process <file.xlsx>` | Process a single file. |
| `process <folder/>` | Process every `.xlsx` in the folder, prompting `y/n` per file **before** processing (Enter = yes; EOF = no). Declined files are listed at the end under `Ignorados pelo usuário:`. |
| `process --daily <file or folder>` | Also emit combined daily files (`YYYY-MM-DD.csv`). |
| `process --verbose <file or folder>` | Extra per-sheet detail (columns, skips). |
| `process --validate <file or folder>` | Compare generated outputs against inputs; full report. |
| `process --validate --daily <file or folder>` | Also validate the combined daily files. |
| `process --duplicates <output folder or CSV>` | Detect patients sharing phone numbers in processed CSVs; write one report per specialty. |
| `process --selftest` | Run built-in assertions; requires no input file. |

When given a folder, all `.xlsx` files inside it are processed together and output goes
into that same folder.

Every generated CSV line in the console output is annotated `[novo]` (file created) or
`[sobrescrito]` (an existing file was replaced), including the combined daily files.

`--duplicates` is **standalone**: it must not be combined with `--daily`, `--validate`,
`--verbose`, or `--quant` (error + exit code 1). `--validate` also rejects `--quant`.

---

## 6.2 Duplicates mode (`--duplicates`)

Detects phone numbers shared by two or more **different** patient names in the
already-processed CSV outputs.

### Input

- A folder containing day folders (`24-08`, `25-08`, ...): every `<dia>/*.csv` is read
  and rows are grouped by canonical specialty **across all days**, or
- a single CSV file path (rows belong to its own specialty).

### Matching rule

1. For every row, collect **all** phones: the `Telefone` column, phones inside
   `Notas Internas` (`Outros telefones:`), and phones embedded in `Nome`.
   Phones are normalized to `(DD) XXXXX-XXXX` / `(DD) XXXX-XXXX`; duplicates within a
   row are removed, first occurrence order preserved.
2. Occurrences are grouped per phone number.
3. A phone is flagged when its occurrences contain **2+ distinct patient names**
   (name identity is case-insensitive and whitespace-collapsed — `ANA SILVA` and
   `ana  silva` are the same person).
4. Repeats of the *same* name on the same phone are kept in the listing but do not
   trigger a flag by themselves.

### Output

- Console: per specialty, `N número(s) duplicado(s), M linha(s) afetada(s)` followed by
  one line per flagged phone listing occurrence count and distinct patient names;
  groups sorted by phone.
- One single spreadsheet for all specialties with duplicates:

```
<output_base>/duplicados.xlsx
```

  - Single sheet (`Duplicados`), columns `Nome | Telefones | Especialidade | Data`.
  - All specialties on the same sheet; the Especialidade column identifies each row.
  - One row per occurrence of each flagged number; phones joined with `;`.
  - A blank row separates flagged-number groups; header bold; freeze pane at A2.
  - If the target xlsx is open in Excel (PermissionError), print an error asking to
    close it and exit 1.

### Exit codes

| Situation | Code |
|---|---|
| Success (with or without duplicates) | `0` |
| Path not found | `1` |
| Folder contains no `DD-MM` day folders with CSVs | `1` |
| Output spreadsheet locked / unwritable | `1` |

---

## 6.1 Validation mode (`--validate`)

Re-derives the expected output rows from the input spreadsheets (using the exact same
rules as the pipeline) and compares them against the already-generated CSV files.

### What it detects

| Category | Meaning |
|---|---|
| `FALTANDO` (missing) | An input row that should have produced an output row is absent from the CSV. |
| `EXTRA` | An output row with no matching input row. |
| `DIFF <campo>` | A matched row whose field value differs from the expected value. Fields checked: `Nome`, `Telefone`, `Etiquetas`, `Notas Internas`. |

### Matching

- Input rows are matched to output rows by **`(Nome, date)`** — the patient name plus
  the ISO date from the first tag of `Etiquetas`.
- Matching is **multiset-based**: each expected row pairs with exactly one output row;
  leftover output rows are `EXTRA`, unmatched input rows are `FALTANDO`.
- Duplicate `(Nome, date)` pairs in one sheet are handled by this pairing.

### Report

- Printed to the terminal and saved as `validation-report.md` in the output folder
  (overwritten each run).
- Per input file and per sheet/day: counts `OK | DIFERENTE | FALTANDO | EXTRA |
  SEM DATA`, then one line per difference with the spreadsheet row number:
  - `DIFF <campo> linha N: esperado 'X', obtido 'Y'`
  - `FALTANDO linha N: <Nome> (<date>) - tel <telefone>`
  - `EXTRA linha N: <Nome> (<date>) - tel <telefone>`
- `SEM DATA` rows (intentionally skipped, see 5.1) are reported as informational counts
  only and never as differences.
- A missing output file is reported (`arquivo não encontrado`) and all its expected rows
  count as `FALTANDO`.
- **Exit code:** `0` when no `DIFERENTE`/`FALTANDO`/`EXTRA` is found; `1` otherwise.
- Requires the outputs to exist (run the normal pipeline first).

---

## 7. Overwrite / idempotency

- Re-running the tool must produce a clean, consistent result.
- For each per-day/per-specialty file, the existing file (if any) is **deleted** before
  the new one is written.
- Day folders are created as needed.
- **Important**: when processing a folder with multiple specialties, the tool must only
  touch each specialty's own CSV file. It must NOT delete the whole day folder (that
  would erase other specialties' files). Only the specific `<CanonicalSpecialty>.csv`
  being regenerated may be removed.
- Combined daily files are fully overwritten each run.

---

## 8. Output columns reference

| Column | Content |
|---|---|
| `Nome` | Patient name, trimmed. |
| `Telefone` | Single chosen phone, normalized (see 5.2). |
| `Etiquetas` | Tag list: `date, Automação, specialty, SaudeDaGente, Marajo`. |
| `Notas Internas` | `Outros telefones: <remaining phones>` or empty. |

---

## 9. Summary of edge cases

| Case | Behavior |
|---|---|
| Empty worksheet | Skipped. |
| Worksheet with only a stray first cell | Skipped (header not resolvable). |
| Header missing a required column | Sheet skipped. |
| Row with empty Nome | Ignored silently. |
| Row with no parseable date | Skipped and counted; reported as `(N sem data)`. |
| File with unknown specialty | Processing fails with an error naming the file. |
| Multiple phones in one cell | Pick mobile (9-digit starting with `9`) else first; rest to Notas Internas. |
| Date stored as datetime vs string | Both handled and normalized to `YYYY-MM-DD`. |
| Validation: duplicate (Nome, date) in one sheet | Paired multiset-wise; leftovers reported as EXTRA. |
| Validation: output file missing | Reported `arquivo não encontrado`; all expected rows counted as FALTANDO. |
| Validation: intentionally skipped rows | Informational `SEM DATA` count only, never a difference. |