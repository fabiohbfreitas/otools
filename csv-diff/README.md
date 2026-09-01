# CSV Diff — A minus B

Keep rows that are in the first spreadsheet but not in the second. Use when you had to import data in two steps.

## How To Use

Open `diff.html` in a browser (no install, works offline).

1. **File A — source / full** — the complete spreadsheet.
2. **File B — already imported** — what you already sent.
3. Click **Compute Diff** → preview + counts appear.
4. **Download Diff CSV** — contains `A \ B` with the same columns.

Both files must have the same columns (names and order), e.g.:

```
Nome,Telefone,Etiquetas,Notas Internas
```

A mismatch aborts with an error. Input is expected as **CSV** — convert XLSX first with `tools/xlsx-to-csv/convert.py` if needed.

## Match Key

A row is considered "the same" when `Nome + Telefone` match after normalization:

- **Nome**: trimmed, inner whitespace collapsed, case-insensitive (`MARIA  SILVA` == `maria silva`)
- **Telefone**: digits only (`(61) 98354-1231` == `61983541231`)

Duplicates in A are preserved as-is — if A has the same person twice and B has it once, both copies remain in the output.

## Output

- Same header/column order as input
- `UTF-8 with BOM`, `CRLF`, RFC 4180 quoted — Excel-safe
- Filename from the text field (defaults to `diff.csv`, `.csv` appended if missing)
