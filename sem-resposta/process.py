#!/usr/bin/env python3
"""Split a ChatFast "sem resposta" export into SemResposta/<date>/<especialidade>.csv.

Usage: uv run process.py [sem-resposta.csv] [--selftest]
"""
import csv
import re
import sys
import unicodedata
from pathlib import Path

CRLF = "\r\n"
HEADERS = ["Nome", "Telefone", "Etiquetas", "Notas Internas"]

SPECIALTY_ALIASES = [
    ("RESSONANCIA", "RessonanciaMagnetica"),
    ("LABORATOR", "ExameLaboratorial"),
]


def normalize_specialty(raw):
    s = (raw or "").strip()
    if not s:
        return ""
    s = re.sub(r"^N[aã]o\s+classificada\s*[\u2014\u2013-]\s*", "", s, flags=re.I).strip()
    key = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().upper()
    for token, canonical in SPECIALTY_ALIASES:
        if token in key:
            return canonical
    return s


def extract_phones(phone_str):
    if not phone_str:
        return []
    results = []
    for part in re.split(r"[/,:|]", phone_str):
        digits = re.sub(r"\D", "", part)
        if not digits:
            continue
        if digits.startswith("55") and len(digits) > 11:
            digits = digits[2:]
        if len(digits) in (12, 11):
            results.append(f"({digits[:2]}) {digits[2:7]}-{digits[7:]}")
        elif len(digits) == 10:
            results.append(f"({digits[:2]}) {digits[2:6]}-{digits[6:]}")
        elif len(digits) == 9:
            results.append(f"{digits[:5]}-{digits[5:]}")
        elif len(digits) == 8:
            results.append(f"{digits[:4]}-{digits[4:]}")
    return results


def build_row(paciente, telefone, especialidade, date):
    phones = extract_phones(telefone)
    if not phones:
        return None
    target = next((i for i, p in enumerate(phones)
                   if re.sub(r"\D", "", p)[2:].startswith("9") and len(re.sub(r"\D", "", p)[2:]) == 9), None)
    if target is None:
        target = 0
    chosen = phones[target]
    remaining = ", ".join(p for i, p in enumerate(phones) if i != target)
    etiquetas = f"{date}, Automação, Convocacao2, MaisSaude, {especialidade}"
    return {
        "Nome": paciente,
        "Telefone": chosen,
        "Etiquetas": etiquetas,
        "Notas Internas": f"Outros telefones: {remaining}" if remaining else "",
    }


def process(input_path, output_dir):
    with open(input_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        groups = {}
        skipped = 0
        for row in reader:
            paciente = (row.get("Paciente") or "").strip()
            if not paciente:
                continue
            date = (row.get("Data do agendamento") or "").strip()
            if not date:
                continue
            especialidade = normalize_specialty(row.get("Especialidade"))
            out = build_row(paciente, row.get("Telefone"), especialidade, date)
            if out is None:
                skipped += 1
                continue
            groups.setdefault((date, especialidade), []).append(out)

    total = sum(len(rows) for _, rows in groups.items())
    counts = []
    for (date, esp), rows in sorted(groups.items()):
        folder = Path(output_dir) / date
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{esp}.csv"
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=HEADERS, delimiter=",", lineterminator=CRLF)
            w.writeheader()
            w.writerows(rows)
        counts.append(f"{len(rows):4d}  {path}")
    return counts, skipped, total


def selftest():
    assert extract_phones("(61) 99922-0084") == ["(61) 99922-0084"]
    assert extract_phones("+55 (61) 99163-7071 / (61) 3622-3421") == ["(61) 99163-7071", "(61) 3622-3421"]
    assert extract_phones("61 99645-0163") == ["(61) 99645-0163"]
    assert normalize_specialty("Não classificada — Otorrinolaringologia") == "Otorrinolaringologia"
    assert normalize_specialty("Ressonância") == "RessonanciaMagnetica"
    assert normalize_specialty("Exames laboratoriais") == "ExameLaboratorial"
    assert normalize_specialty("Cardiologia") == "Cardiologia"
    assert build_row("FULANO", "(61) 99988-7766", "Cardiologia", "2026-08-04")["Etiquetas"] == \
        "2026-08-04, Automação, Convocacao2, MaisSaude, Cardiologia"
    print("selftest ok")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return
    input_path = Path(sys.argv[1] if len(sys.argv) > 1 else "sem-resposta.csv")
    output_dir = input_path.resolve().parent / "SemResposta"
    counts, skipped, total = process(input_path, output_dir)
    print(f"{total} linhas, {len(counts)} arquivos, {skipped} ignoradas (sem telefone)")
    for line in counts:
        print(line)


if __name__ == "__main__":
    main()
