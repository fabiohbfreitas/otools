# /// script
# dependencies = [
#   "openpyxl",
# ]
# ///

"""Detect patients sharing phone numbers in processed SaudeDaGente CSVs.

Given a folder containing day folders (24-08, 25-08, ...), reads every
<dia>/<Especialidade>.csv, groups rows by specialty across all days, and flags
numbers shared by two or more different patient names. Writes one
<Especialidade>-duplicados.xlsx per specialty with duplicates (columns Nome,
Telefones, Especialidade, Data), listing every occurrence of each flagged
number. A single CSV path is also accepted.

Usage:
  uv run duplicates.py <pasta>            # all day folders, one xlsx per specialty
  uv run duplicates.py <arquivo.csv>      # single file
  uv run duplicates.py --selftest
"""
import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.styles import Font

from process import (
    NORMALIZED_ALIASES,
    etiquetas_date,
    extract_phones,
    match_token,
    normalize_token,
    read_csv_rows,
)


def canonical_from_stem(stem):
    norm = normalize_token(stem)
    for token, canonical in NORMALIZED_ALIASES:
        if match_token(norm, token):
            return canonical
    return norm.title()


def collect_row_phones(row):
    """All normalized phones of one CSV row, deduplicated, order preserved."""
    phones = []
    for field in ("Telefone", "Notas Internas", "Nome"):
        for p in extract_phones(row.get(field, "")):
            if p not in phones:
                phones.append(p)
    return phones


def name_key(nome):
    return " ".join(nome.split()).casefold()


def find_duplicates(rows):
    """Group occurrences by phone; keep groups sharing 2+ distinct names.

    rows: list of (row_dict, line_number). Returns [(phone, occurrences)]
    sorted by phone, where occurrences is a list of (nome, phones, date).
    """
    by_phone = {}
    for row, _ in rows:
        phones = collect_row_phones(row)
        nome = row.get("Nome", "")
        for p in phones:
            by_phone.setdefault(p, []).append((nome, phones, etiquetas_date(row)))
    flagged = [
        (phone, occs)
        for phone, occs in by_phone.items()
        if len({name_key(n) for n, _, _ in occs}) >= 2
    ]
    flagged.sort(key=lambda item: item[0])
    return flagged


def write_spreadsheet(flagged, sheet_name, out_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name[:31]
    ws.append(["Nome", "Telefones", "Especialidade", "Data"])
    for cell in ws[1]:
        cell.font = Font(bold=True)
    first = True
    for _, occs in flagged:
        if not first:
            ws.append(["", "", "", ""])
        first = False
        for nome, phones, date in occs:
            ws.append([nome, ";".join(phones), sheet_name, date])
    ws.column_dimensions["A"].width = 45
    ws.column_dimensions["B"].width = 40
    ws.column_dimensions["C"].width = 20
    ws.column_dimensions["D"].width = 12
    ws.freeze_panes = "A2"
    try:
        wb.save(out_path)
    except PermissionError:
        print(f"Erro: feche '{out_path.name}' no Excel e tente novamente.")
        sys.exit(1)


def selftest():
    assert canonical_from_stem("Cardiologia") == "Cardiologia"
    assert canonical_from_stem("Laboratório") == "ExameLaboratorial"
    assert canonical_from_stem("Endocrinologista") == "Endocrinologia"
    assert canonical_from_stem("Tomografia") == "Tomografia"
    assert collect_row_phones({
        "Telefone": "(61) 99988-7766",
        "Notas Internas": "Outros telefones: (61) 3622-3421",
        "Nome": "FULANO",
    }) == ["(61) 99988-7766", "(61) 3622-3421"]
    assert collect_row_phones({
        "Telefone": "(61) 99988-7766",
        "Notas Internas": "",
        "Nome": "X",
    }) == ["(61) 99988-7766"]
    assert collect_row_phones({"Telefone": "", "Notas Internas": "", "Nome": "Sem telefone"}) == []
    assert collect_row_phones({"Telefone": "61998708050", "Notas Internas": "", "Nome": ""}) == \
        ["(61) 99870-8050"]

    rows = [
        ({"Nome": "ANA SILVA", "Telefone": "(61) 99999-0001", "Etiquetas": ""}, 2),
        ({"Nome": "ana  silva", "Telefone": "(61) 99999-0001", "Etiquetas": ""}, 3),
        ({"Nome": "BRUNO COSTA", "Telefone": "(61) 99999-0002",
          "Etiquetas": "2026-08-24, Automação, Cardiologia, SaudeDaGente, Marajo"}, 4),
        ({"Nome": "CARLOS DIAS", "Telefone": "(61) 99999-0002",
          "Etiquetas": "2026-08-25, Automação, Cardiologia, SaudeDaGente, Marajo"}, 5),
        ({"Nome": "DUDA SOUZA", "Telefone": "(61) 99999-0003", "Etiquetas": ""}, 6),
        ({"Nome": "DUDA SOUZA", "Telefone": "(61) 99999-0003", "Etiquetas": ""}, 7),
    ]
    flagged = find_duplicates(rows)
    assert [p for p, _ in flagged] == ["(61) 99999-0002"]
    g1 = dict(flagged)["(61) 99999-0002"]
    assert len(g1) == 2 and g1[0][0] == "BRUNO COSTA" and g1[1][0] == "CARLOS DIAS"
    assert g1[0][2] == "2026-08-24" and g1[1][2] == "2026-08-25"
    print("selftest ok")


def collect_groups(path):
    """Map canonical specialty -> rows, from a folder of day folders or one CSV."""
    if path.is_file():
        return {canonical_from_stem(path.stem): read_csv_rows(path)}, path.parent
    day_dirs = [
        d for d in sorted(path.iterdir())
        if d.is_dir() and re.match(r"^\d{1,2}-\d{1,2}$", d.name)
    ]
    if not day_dirs:
        return {}, None
    groups = {}
    for day in day_dirs:
        for csv_path in sorted(day.glob("*.csv")):
            canonical = canonical_from_stem(csv_path.stem)
            groups.setdefault(canonical, []).extend(read_csv_rows(csv_path))
    return groups, path


def main():
    if "--selftest" in sys.argv:
        selftest()
        return

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 1:
        print("Uso: uv run duplicates.py [--selftest] <pasta|arquivo.csv>")
        sys.exit(1)

    path = Path(args[0])
    if not path.exists():
        print(f"Caminho não encontrado: {path}")
        sys.exit(1)

    groups, out_base = collect_groups(path)
    if not groups:
        print(f"Nenhuma pasta de dia (DD-MM) com CSVs encontrada em {path}")
        sys.exit(1)

    wrote = 0
    for canonical in sorted(groups):
        rows = groups[canonical]
        flagged = find_duplicates(rows)
        if not flagged:
            print(f"{canonical}: nenhum telefone duplicado ({len(rows)} linhas).")
            continue
        total_occs = sum(len(occs) for _, occs in flagged)
        print(f"{canonical}: {len(flagged)} número(s) duplicado(s), "
              f"{total_occs} linha(s) afetada(s)")
        for phone, occs in flagged:
            names = sorted({n for n, _, _ in occs})
            print(f"  {phone}: {len(occs)} linha(s), {len(names)} paciente(s): {', '.join(names)}")
        out_path = out_base / f"{canonical}-duplicados.xlsx"
        write_spreadsheet(flagged, canonical, out_path)
        print(f"Planilha salva em: {out_path}")
        wrote += 1

    if wrote == 0:
        print("Nenhuma planilha gerada.")


if __name__ == "__main__":
    main()
