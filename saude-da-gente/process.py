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
  uv run process.py --selftest
"""
import csv
import re
import sys
import unicodedata
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

    raise ValueError(f"Não foi possível identificar a especialidade de {stem}")


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


def process_file(file_path, output_base, daily_rows=None):
    workbook = openpyxl.load_workbook(file_path, data_only=True)
    canonical = resolve_specialty(file_path.stem, workbook)
    created = []
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
        rows = []
        skipped = 0
        for row in ws.iter_rows(min_row=2, values_only=True):
            nome = row[cols["nome"]]
            if nome is None or not str(nome).strip():
                continue
            nome = str(nome).strip()
            date = parse_date(row[cols["data"]])
            if not date and sheet_date:
                date = sheet_date
            if not date:
                skipped += 1
                continue
            telefone = str(row[cols["telefone"]]) if row[cols["telefone"]] is not None else ""
            out = build_row(nome, telefone, canonical, date)
            rows.append(out)
            if daily_rows is not None:
                daily_rows.setdefault(date, []).append(out)

        if not rows and skipped == 0:
            continue

        folder = output_base / sanitize_folder(sheet)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{canonical}.csv"
        if path.exists():
            path.unlink()
        write_csv_rows(rows, path)
        created.append((len(rows), path, skipped))
    return canonical, created


def write_csv_rows(rows, path):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=HEADERS, delimiter=",",
            quoting=csv.QUOTE_ALL, lineterminator=CRLF,
        )
        writer.writeheader()
        writer.writerows(rows)


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
    print("selftest ok")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    daily = "--daily" in sys.argv
    if len(args) < 1:
        print("Uso: uv run process.py [--daily] <arquivo.xlsx|pasta>")
        sys.exit(1)

    path = Path(args[0])
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
        canonical, created = process_file(f, output_base, daily_rows)
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