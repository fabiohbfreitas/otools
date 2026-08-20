# /// script
# dependencies = [
#   "openpyxl",
# ]
# ///

"""Organize SaudeDaGente xlsx exports into <dia>/<Especialidade>.csv import files.

Each xlsx file is a specialty; each sheet is a day (e.g. 24-08). Output lands in the
same folder as the input: <input_dir>/<sheet>/<Canonical>.csv with columns
Nome, Telefone, Etiquetas, Notas Internas.

Usage:
  uv run process.py <arquivo.xlsx>        # single file
  uv run process.py <pasta/>              # process every *.xlsx in the folder
  uv run process.py --daily <pasta/>      # also write combined daily files (2026-08-24.csv)
  uv run process.py --verbose <pasta/>    # extra per-sheet detail (columns, skips)
  uv run process.py --validate <pasta/>   # compare outputs against inputs, full report
  uv run process.py --validate --daily <pasta/>  # also validate the combined daily files
  uv run process.py --selftest
"""
import csv
import re
import sys
import unicodedata
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path

import openpyxl

CRLF = "\r\n"
HEADERS = ["Nome", "Telefone", "Etiquetas", "Notas Internas"]
AUTOMACAO_TAG = "Automação"
SAUDE_TAG = "SaudeDaGente"
LOCAL_TAG = "Marajo"

ALIASES = [
    ("LABORATOR", "ExameLaboratorial"),
    ("CARDIOLOGISTA", "Cardiologia"),
    ("CARDIOLOGIA", "Cardiologia"),
    ("DERMATOLOGISTA", "Dermatologia"),
    ("DERMATOLOGIA", "Dermatologia"),
    ("US DE ABDOMEN TOTAL", "Ecografia"),
    ("US DE TIREOIDE", "Ecografia"),
    ("US MAMARIA", "Ecografia"),
    ("ECOGRAFIA", "Ecografia"),
    ("GINECOLOGISTA", "Ginecologia"),
    ("GINECOLOGIA", "Ginecologia"),
    ("MAMOGRAFIA", "Mamografia"),
    ("ORTOPEDISTA", "Ortopedia"),
    ("ORTOPEDIA", "Ortopedia"),
    ("PEDIATRA", "Pediatria"),
    ("PEDIATRIA", "Pediatria"),
    ("REUMATOLOGISTA", "Reumatologia"),
    ("REUMATOLOGIA", "Reumatologia"),
    ("ENDOCRINOLOGISTA", "Endocrinologista"),
    ("ENDOCRINOLOGIA", "Endocrinologista"),
    ("OTORRINOLARINGOLOGIA", "Otorrinolaringologia"),
    ("OTORRINO", "Otorrinolaringologia"),
    ("CLINICA MEDICA", "ClinicaMedica"),
    ("TOMOGRAFIA", "Tomografia"),
]

def normalize_token(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^A-Z0-9]", "", s.upper())


NORMALIZED_ALIASES = [(normalize_token(t), c) for t, c in ALIASES]


def match_token(key, token):
    return token in key or key in token


def resolve_specialty(stem, workbook):
    norm = normalize_token(stem)
    for token, canonical in NORMALIZED_ALIASES:
        if match_token(norm, token):
            return canonical

    seen = set()
    for sheet in workbook.sheetnames:
        ws = workbook[sheet]
        header = [c.value for c in ws[1]] if ws.max_row >= 1 else []
        if not header or header[0] is None:
            continue
        try:
            cols = resolve_columns(header)
        except ValueError:
            continue
        for row in ws.iter_rows(min_row=2, values_only=True):
            key = normalize_token(str(row[cols["especialidade"]])) if row[cols["especialidade"]] is not None else ""
            if not key or key in seen:
                continue
            seen.add(key)
            for token, canonical in NORMALIZED_ALIASES:
                if match_token(key, token):
                    return canonical

    return norm.title()


def extract_phones(phone_str):
    if not phone_str:
        return []
    regex = re.compile(r"\(?\d{2}\)?\s?\d{4,5}-?\d{4}")
    result = []
    for num in regex.findall(phone_str):
        cleaned = re.sub(r"\D", "", num)
        if len(cleaned) == 11:
            result.append(f"({cleaned[0:2]}) {cleaned[2:7]}-{cleaned[7:]}")
        elif len(cleaned) == 10:
            result.append(f"({cleaned[0:2]}) {cleaned[2:6]}-{cleaned[6:]}")
        else:
            result.append(num.strip())
    return result


def pick_phone(phones):
    if not phones:
        return "", ""
    target = -1
    for i, p in enumerate(phones):
        digits = re.sub(r"\D", "", p)
        main = digits[2:]
        if len(main) == 9 and main.startswith("9"):
            target = i
            break
    if target == -1:
        target = 0
    chosen = phones[target]
    remaining = ", ".join(p for i, p in enumerate(phones) if i != target)
    return chosen, remaining


def split_trailing_phone(nome):
    """Split a trailing phone off a Nome cell.

    When the Telefone column is empty, the phone may be embedded at the end of
    the Nome cell (e.g. "Nome Do Paciente (61) 92345-1234"). Returns
    (name_part, phone_raw) with the trailing phone removed and normalized, or
    (nome, "") when there is no trailing phone. If stripping leaves no name,
    the name part is empty.
    """
    if not nome:
        return nome, ""
    regex = re.compile(r"\(?\d{2}\)?\s?\d{4,5}-?\d{4}")
    match = None
    for m in regex.finditer(nome):
        rest = nome[m.end():]
        if not rest or not rest.strip() or re.fullmatch(r"[\s\-()]+", rest):
            match = m
    if match is None:
        return nome, ""
    name_part = nome[:match.start()].strip().rstrip(" -()")
    phones = extract_phones(match.group(0))
    return name_part, phones[0] if phones else ""


def parse_date(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    s = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        month, day, year = m.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
    return ""


def build_row(nome, telefone, especialidade, date):
    phones = extract_phones(telefone)
    chosen, remaining = pick_phone(phones)
    etiquetas = f"{date}, {AUTOMACAO_TAG}, {especialidade}, {SAUDE_TAG}, {LOCAL_TAG}"
    notas = f"Outros telefones: {remaining}" if remaining else ""
    return {
        "Nome": nome,
        "Telefone": chosen,
        "Etiquetas": etiquetas,
        "Notas Internas": notas,
    }


def sanitize_folder(name):
    return re.sub(r'[<>:"/\\|?*]', "_", name).strip()


REQUIRED_COLUMNS = ["nome", "telefone", "data", "especialidade"]


def resolve_columns(header_values):
    """Map fuzzy header names to column indices (nome, telefone, data, especialidade)."""
    idx = {}
    for col_idx, raw in enumerate(header_values):
        key = normalize_token(str(raw)) if raw is not None else ""
        if not key:
            continue
        if "NOME" in key and "nome" not in idx:
            idx["nome"] = col_idx
        elif "TELEFONE" in key and "telefone" not in idx:
            idx["telefone"] = col_idx
        elif ("DATA" in key or "HORA" in key) and "data" not in idx:
            idx["data"] = col_idx
        elif "ESPECIALIDADE" in key and "especialidade" not in idx:
            idx["especialidade"] = col_idx
    missing = [c for c in REQUIRED_COLUMNS if c not in idx]
    if missing:
        raise ValueError(
            f"Colunas não encontradas: {', '.join(missing)}. "
            f"Header lido: {header_values}"
        )
    return idx


def parse_sheet_date(sheet_name):
    m = re.match(r"^(\d{1,2})-(\d{1,2})$", sheet_name.strip())
    if not m:
        return ""
    day, month = int(m.group(1)), int(m.group(2))
    year = datetime.now().year
    try:
        return datetime(year, month, day).strftime("%Y-%m-%d")
    except ValueError:
        return ""


def build_sheet_rows(ws, cols, sheet_date, canonical):
    """Build output rows from one worksheet.

    Returns (rows, skipped, skipped_details) where rows is a list of
    (output_dict, spreadsheet_row_number, date), skipped is the number of
    rows dropped because they had no usable date, and skipped_details is a
    list of (spreadsheet_row_number, raw_data_value) for those dropped rows.
    """
    rows = []
    skipped = 0
    skipped_details = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        nome = row[cols["nome"]]
        if nome is None or not str(nome).strip():
            continue
        nome = str(nome).strip()
        date = parse_date(row[cols["data"]])
        if not date and sheet_date:
            date = sheet_date
        if not date:
            skipped += 1
            skipped_details.append((2 + i, row[cols["data"]]))
            continue
        telefone = str(row[cols["telefone"]]) if row[cols["telefone"]] is not None else ""
        if not telefone.strip():
            nome, telefone = split_trailing_phone(nome)
        out = build_row(nome, telefone, canonical, date)
        rows.append((out, 2 + i, date))
    return rows, skipped, skipped_details


def process_file(file_path, output_base, daily_rows=None, verbose=False):
    workbook = openpyxl.load_workbook(file_path, data_only=True)
    canonical = resolve_specialty(file_path.stem, workbook)
    created = []
    for sheet in workbook.sheetnames:
        ws = workbook[sheet]
        header = [c.value for c in ws[1]] if ws.max_row >= 1 else []
        if not header or header[0] is None:
            if verbose:
                print(f"  {sheet}: planilha vazia, ignorada")
            continue

        try:
            cols = resolve_columns(header)
        except ValueError:
            if verbose:
                print(f"  {sheet}: cabeçalho não resolvido, ignorada")
            continue
        sheet_date = parse_sheet_date(sheet)
        sheet_rows, skipped, skipped_details = build_sheet_rows(ws, cols, sheet_date, canonical)
        if not sheet_rows and skipped == 0:
            continue
        if daily_rows is not None:
            for out, _, date in sheet_rows:
                daily_rows.setdefault(date, []).append(out)

        folder = output_base / sanitize_folder(sheet)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{canonical}.csv"
        if path.exists():
            path.unlink()
        write_csv_rows([out for out, _, _ in sheet_rows], path)
        created.append((len(sheet_rows), path, skipped))
        if verbose:
            cols_str = ", ".join(f"{k}={v}" for k, v in sorted(cols.items()))
            print(f"  {sheet}: colunas {cols_str} | {len(sheet_rows)} linhas | {skipped} sem data")
            if skipped_details:
                cap = 10
                shown = skipped_details[:cap]
                for row_num, raw in shown:
                    print(f"    sem data: linha {row_num} ({raw})")
                rest = len(skipped_details) - len(shown)
                if rest > 0:
                    print(f"    ... mais {rest} linha(s) sem data")
    return canonical, created


def write_csv_rows(rows, path):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=HEADERS, delimiter=",",
            quoting=csv.QUOTE_ALL, lineterminator=CRLF,
        )
        writer.writeheader()
        writer.writerows(rows)


FIELDS = ["Nome", "Telefone", "Etiquetas", "Notas Internas"]


def etiquetas_date(row):
    et = row.get("Etiquetas", "")
    return et.split(",")[0].strip() if et else ""


def read_csv_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return [(row, 2 + i) for i, row in enumerate(reader)]


def compare_sheet(expected, actual):
    """Diff expected rows against actual CSV rows.

    expected: list of (output_dict, spreadsheet_row_number, date).
    actual:   list of (csv_dict, csv_line_number).

    Returns (missing, extra, diffs):
      missing = [(spreadsheet_row_number, output_dict)]
      extra   = [(csv_line_number, csv_dict)]
      diffs   = [(spreadsheet_row_number, field, expected_value, actual_value)]
    """
    buckets = defaultdict(deque)
    for idx, (arow, _) in enumerate(actual):
        buckets[(arow.get("Nome", ""), etiquetas_date(arow))].append(idx)

    matched = set()
    missing = []
    diffs = []
    for out, row_num, date in expected:
        q = buckets.get((out["Nome"], date))
        if q:
            idx = q.popleft()
            matched.add(idx)
            arow = actual[idx][0]
            for field in FIELDS:
                if out[field] != arow.get(field, ""):
                    diffs.append((row_num, field, out[field], arow.get(field, "")))
        else:
            missing.append((row_num, out))
    extra = [(2 + idx, arow) for idx, (arow, _) in enumerate(actual) if idx not in matched]
    return missing, extra, diffs


def _report_sheet(lines, totals, sheet_label, expected, csv_path):
    if not csv_path.exists():
        totals["no_file"] += 1
        totals["missing"] += len(expected)
        lines.append(f"  {sheet_label}: arquivo não encontrado: {csv_path.name}")
        lines.append(f"    FALTANDO {len(expected)} linha(s)")
        return
    actual = read_csv_rows(csv_path)
    missing, extra, diffs = compare_sheet(expected, actual)
    diff_rows = {rn for rn, _, _, _ in diffs}
    ok = len(expected) - len(missing) - len(diff_rows)
    totals["ok"] += ok
    totals["diff"] += len(diff_rows)
    totals["missing"] += len(missing)
    totals["extra"] += len(extra)
    lines.append(
        f"  {sheet_label}: OK {ok} | DIFERENTE {len(diff_rows)} | "
        f"FALTANDO {len(missing)} | EXTRA {len(extra)}"
    )
    for row_num, field, exp, act in diffs:
        lines.append(f"    DIFF {field} linha {row_num}: esperado '{exp}', obtido '{act}'")
    for row_num, out in missing:
        lines.append(
            f"    FALTANDO linha {row_num}: {out['Nome']} ({etiquetas_date(out)}) - "
            f"tel {out['Telefone']}"
        )
    for csv_line, arow in extra:
        lines.append(
            f"    EXTRA linha {csv_line}: {arow.get('Nome', '')} "
            f"({etiquetas_date(arow)}) - tel {arow.get('Telefone', '')}"
        )


def validate(path, daily):
    if path.is_dir():
        files = sorted(path.glob("*.xlsx"))
        output_base = path
    else:
        files = [path]
        output_base = path.parent
    if not files:
        print("Nenhum arquivo xlsx encontrado.")
        return 1

    lines = []
    totals = {"ok": 0, "diff": 0, "missing": 0, "extra": 0, "skipped": 0, "no_file": 0}
    daily_expected = {}

    for f in files:
        workbook = openpyxl.load_workbook(f, data_only=True)
        canonical = resolve_specialty(f.stem, workbook)
        lines.append(f"{f.name}  ->  {canonical}")
        for sheet in workbook.sheetnames:
            ws = workbook[sheet]
            header = [c.value for c in ws[1]] if ws.max_row >= 1 else []
            if not header or header[0] is None:
                continue
            try:
                cols = resolve_columns(header)
            except ValueError:
                continue
            sheet_date = parse_sheet_date(sheet)
            sheet_rows, skipped, _ = build_sheet_rows(ws, cols, sheet_date, canonical)
            if not sheet_rows and skipped == 0:
                continue
            totals["skipped"] += skipped
            if daily:
                for out, row_num, date in sheet_rows:
                    daily_expected.setdefault(date, []).append((out, row_num, date))
            _report_sheet(
                lines, totals, sheet,
                sheet_rows,
                output_base / sanitize_folder(sheet) / f"{canonical}.csv",
            )

    if daily:
        lines.append("Diário:")
        for date in sorted(daily_expected):
            _report_sheet(
                lines, totals, f"{date}.csv",
                daily_expected[date],
                output_base / f"{date}.csv",
            )

    lines.append(
        f"\nTotal: OK {totals['ok']} | DIFERENTE {totals['diff']} | "
        f"FALTANDO {totals['missing']} | EXTRA {totals['extra']} | "
        f"SEM DATA {totals.get('skipped', 0)}"
    )
    if totals["no_file"]:
        lines.append(f"Aviso: {totals['no_file']} arquivo(s) de saída não encontrado(s).")

    report_path = output_base / "validation-report.md"
    with open(report_path, "w", encoding="utf-8") as fp:
        fp.write("# Relatório de validação\n\n")
        fp.write("\n".join(lines))
        fp.write("\n")
    print("\n".join(lines))
    print(f"\nRelatório salvo em: {report_path}")
    return 1 if (totals["diff"] or totals["missing"] or totals["extra"]) else 0


def selftest():
    assert extract_phones("(61) 99922-0084") == ["(61) 99922-0084"]
    assert extract_phones("(61) 98490-4799 (61) 98146-5163") == \
        ["(61) 98490-4799", "(61) 98146-5163"]
    assert extract_phones("(61) 3331-5174, (61) 99439-7065") == \
        ["(61) 3331-5174", "(61) 99439-7065"]
    assert extract_phones("61 99645-0163") == ["(61) 99645-0163"]
    chosen, remaining = pick_phone(["(61) 3331-5174", "(61) 99439-7065"])
    assert chosen == "(61) 99439-7065" and remaining == "(61) 3331-5174"
    chosen, remaining = pick_phone(["(61) 3331-5174"])
    assert chosen == "(61) 3331-5174" and remaining == ""
    assert parse_date("8/24/2026") == "2026-08-24"
    assert parse_date("2026-08-24 00:00:00") == "2026-08-24"
    assert parse_date(datetime(2026, 8, 24)) == "2026-08-24"
    assert parse_sheet_date("24-08") == "2026-08-24"
    assert parse_sheet_date("25-08") == "2026-08-25"
    assert parse_sheet_date("abc") == ""
    assert resolve_columns(["QUANT.", "Nome", "Telefone", "Data", "Hora", "Especialidade", "Local"]) == \
        {"nome": 1, "telefone": 2, "data": 3, "especialidade": 5}
    assert resolve_columns(["#", "NOME", "TELEFONE(S)", "DATA/HORA", "ESPECIALIDADE"]) == \
        {"nome": 1, "telefone": 2, "data": 3, "especialidade": 4}
    assert build_row("FULANO", "(61) 99988-7766, (61) 3622-3421",
                     "Cardiologia", "2026-08-24") == {
        "Nome": "FULANO",
        "Telefone": "(61) 99988-7766",
        "Etiquetas": "2026-08-24, Automação, Cardiologia, SaudeDaGente, Marajo",
        "Notas Internas": "Outros telefones: (61) 3622-3421",
    }
    assert etiquetas_date({"Etiquetas": "2026-08-24, Automação, Cardiologia, SaudeDaGente, Marajo"}) == "2026-08-24"
    expected = [
        (build_row("A", "(61) 99999-0001", "Cardiologia", "2026-08-24"), 3, "2026-08-24"),
        (build_row("B", "(61) 99999-0002", "Cardiologia", "2026-08-24"), 4, "2026-08-24"),
    ]
    actual = [
        (build_row("A", "(61) 99999-0001", "Cardiologia", "2026-08-24"), 2),
        (build_row("C", "(61) 99999-0003", "Cardiologia", "2026-08-24"), 3),
    ]
    missing, extra, diffs = compare_sheet(expected, actual)
    assert len(missing) == 1 and missing[0][1]["Nome"] == "B"
    assert len(extra) == 1 and extra[0][1]["Nome"] == "C"
    assert diffs == []
    missing, extra, diffs = compare_sheet(expected[:1], [
        (build_row("A", "(61) 99999-9999", "Cardiologia", "2026-08-24"), 2),
    ])
    assert not missing and not extra
    assert any(f == "Telefone" for _, f, _, _ in diffs)
    assert split_trailing_phone("Nome Do Paciente (61) 92345-1234") == \
        ("Nome Do Paciente", "(61) 92345-1234")
    assert split_trailing_phone("Nome Do Paciente 61 92345-1234") == \
        ("Nome Do Paciente", "(61) 92345-1234")
    assert split_trailing_phone("Nome Do Paciente (61) 3345-1234") == \
        ("Nome Do Paciente", "(61) 3345-1234")
    assert split_trailing_phone("(61) 92345-1234") == ("", "(61) 92345-1234")
    assert split_trailing_phone("Nome Do Paciente") == ("Nome Do Paciente", "")
    assert split_trailing_phone("Maria (61) 92345-1234 Silva") == \
        ("Maria (61) 92345-1234 Silva", "")
    assert split_trailing_phone("Nome (61) 92345-1234 (61) 3345-1234") == \
        ("Nome (61) 92345-1234", "(61) 3345-1234")
    print("selftest ok")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    daily = "--daily" in sys.argv
    if len(args) < 1:
        print("Uso: uv run process.py [--validate] [--daily] [--verbose] <arquivo.xlsx|pasta>")
        sys.exit(1)

    path = Path(args[0])
    verbose = "--verbose" in sys.argv
    if "--validate" in sys.argv:
        sys.exit(validate(path, daily))

    if path.is_dir():
        files = sorted(path.glob("*.xlsx"))
        output_base = path
    else:
        files = [path]
        output_base = path.parent

    if not files:
        print("Nenhum arquivo xlsx encontrado.")
        sys.exit(1)

    daily_rows = {} if daily else None

    grand_total = 0
    grand_skipped = 0
    for f in files:
        canonical, created = process_file(f, output_base, daily_rows, verbose)
        total = sum(n for n, _, _ in created)
        skipped = sum(s for _, _, s in created)
        print(f"{total:5d}  {f.name}  ->  {canonical}")
        for count, path, skip in created:
            line = f"      {count:5d}  {path}"
            if skip:
                line += f"  ({skip} sem data)"
            print(line)
        grand_total += total
        grand_skipped += skipped
    print(f"Total: {grand_total} linhas")
    if grand_skipped:
        print(f"Aviso: {grand_skipped} linha(s) ignorada(s) por não terem data.")

    if daily:
        for date, rows in sorted(daily_rows.items()):
            path = output_base / f"{date}.csv"
            write_csv_rows(rows, path)
            print(f"Diário: {len(rows):5d}  {path}")


if __name__ == "__main__":
    main()