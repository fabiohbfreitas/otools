# /// script
# dependencies = [
#   "openpyxl",
# ]
# ///

"""Generate a re-engagement (Recaptação) CSV from sent batches + WhatsApp reports.

Given a send folder containing the import CSVs (<Especialidade>.csv) and a
relatorios/ subfolder with the WhatsApp delivery reports, emits a single
<pasta>/recaptacao.csv with everyone worth a second touch, mixing specialties.
Contacts whose report shows interaction are skipped.

Selection (matched by digit-normalized phone):
  - absent from the reports (never attempted)
  - report says the number has no WhatsApp
  - delivered/sent but Houve interação = Não
  - read but Houve interação = Não

For no-WhatsApp contacts the script rotates to another known phone (own
'Outros telefones' first, then phones from the same patient's rows in other
specialty CSVs); if none exists the original number stays and the count is
reported in the console summary for manual outreach.

Output keeps the strict import format (Nome, Telefone, Etiquetas, Notas
Internas). Patients repeated across specialties become ONE row: specialty tags
joined, phones united, and Etiquetas gains the Recaptação tag:
  <data>, Automação, <Spec1>, ..., Recaptação, SaudeDaGente, Marajo

Usage:
  uv run recaptacao.py <pasta-do-envio>
  uv run recaptacao.py --selftest
"""
import csv
import re
import sys
from pathlib import Path

from process import (
    canonical_from_stem,
    extract_phones,
    name_key,
    pick_phone,
    write_csv_rows,
)

PRIORITY = ["NuncaEnviado", "SemWhatsApp", "NaoVisto", "LidoSemInteracao"]

OUTPUT_NAME = "recaptacao.csv"


def digits(phone):
    return re.sub(r"\D", "", phone)


def classify(report_row):
    """Map one report row (or None) to a selection reason; None means skip."""
    if report_row is None:
        return "NuncaEnviado"
    status = report_row.get("Status da mensagem", "")
    if "não possui WhatsApp" in status:
        return "SemWhatsApp"
    if report_row.get("Houve interação", "").strip() == "Sim":
        return None
    if status.strip() == "Lida":
        return "LidoSemInteracao"
    return "NaoVisto"


def load_reports(folder):
    """Map digit-normalized phone -> report row, from relatorios/*.csv."""
    rdir = folder / "relatorios"
    reports = {}
    for p in sorted(rdir.glob("*.csv")):
        with open(p, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                phone = digits(row.get("Contato/Telefone", ""))
                if phone and phone not in reports:
                    reports[phone] = row
    return reports


def load_sources(folder):
    """Map canonical specialty -> list of source rows."""
    sources = {}
    for p in sorted(folder.glob("*.csv")):
        if p.name == OUTPUT_NAME:
            continue
        canonical = canonical_from_stem(p.stem)
        with open(p, encoding="utf-8-sig", newline="") as f:
            sources.setdefault(canonical, []).extend(
                row for row in csv.DictReader(f) if row.get("Nome", "").strip()
            )
    return sources


def collect_targets(sources, reports):
    """Group target contacts by patient identity.

    Returns (entries, excluded): entries maps name_key -> accumulated dict;
    excluded counts rows skipped because the patient interacted.
    """
    entries = {}
    excluded = 0
    for spec in sorted(sources):
        for row in sources[spec]:
            situation = classify(reports.get(digits(row.get("Telefone", ""))))
            if situation is None:
                excluded += 1
                continue
            key = name_key(row["Nome"])
            entry = entries.get(key)
            if entry is None:
                entry = {
                    "nome": row["Nome"],
                    "date": row.get("Etiquetas", "").split(",")[0].strip(),
                    "specs": [],
                    "phones": [],
                    "deads": [],
                    "reasons": set(),
                }
                entries[key] = entry
            if spec not in entry["specs"]:
                entry["specs"].append(spec)
            entry["reasons"].add(situation)
            for field in ("Telefone", "Notas Internas"):
                for ph in extract_phones(row.get(field, "")):
                    if ph not in entry["phones"]:
                        entry["phones"].append(ph)
            if situation == "SemWhatsApp":
                dead = digits(row.get("Telefone", ""))
                if dead:
                    entry["deads"].append(dead)
    return entries, excluded


def resolve_reason(reasons):
    return min(reasons, key=PRIORITY.index)


def finalize_entry(entry):
    """Resolve one patient entry into its output row dict."""
    phones = list(entry["phones"])
    if resolve_reason(entry["reasons"]) == "SemWhatsApp":
        working = [p for p in phones if digits(p) not in entry["deads"]]
        chosen, remaining = pick_phone(working or phones)
    else:
        chosen, remaining = pick_phone(phones)
    return {
        "Nome": entry["nome"],
        "Telefone": chosen,
        "Etiquetas": ", ".join(
            [entry["date"], "Automação"] + entry["specs"]
            + ["Recaptação", "SaudeDaGente", "Marajo"]
        ),
        "Notas Internas": f"Outros telefones: {remaining}" if remaining else "",
    }


def run_recaptacao(folder):
    if not folder.exists():
        print(f"Caminho não encontrado: {folder}")
        return 1
    if not (folder / "relatorios").is_dir():
        print(f"Pasta 'relatorios/' não encontrada em {folder}")
        return 1

    sources = load_sources(folder)
    if not sources:
        print("Nenhum CSV de contato encontrado.")
        return 1

    reports = load_reports(folder)
    entries, excluded = collect_targets(sources, reports)

    rows = []
    reasons_count = {r: 0 for r in PRIORITY}
    alternates = 0
    sem_alternativa = 0
    for key in sorted(entries):
        entry = entries[key]
        row = finalize_entry(entry)
        reason = resolve_reason(entry["reasons"])
        reasons_count[reason] += 1
        if reason == "SemWhatsApp":
            if digits(row["Telefone"]) in entry["deads"]:
                sem_alternativa += 1
            else:
                alternates += 1
        rows.append(row)

    out_path = folder / OUTPUT_NAME
    write_csv_rows(rows, out_path)

    print(f"Contatos com interação ignorados: {excluded}")
    for r in PRIORITY:
        print(f"{reasons_count[r]:5d}  {r}")
    print(f"Troca de número aplicada: {alternates} | sem alternativa: {sem_alternativa}")
    print(f"Total recaptação: {len(rows)}")
    print(f"CSV salvo em: {out_path}")
    return 0


def selftest():
    assert classify(None) == "NuncaEnviado"
    assert classify({"Status da mensagem":
                     "O número de telefone não possui WhatsApp",
                     "Houve interação": "Não"}) == "SemWhatsApp"
    assert classify({"Status da mensagem": "Lida", "Houve interação": "Sim"}) is None
    assert classify({"Status da mensagem": "Entregue", "Houve interação": "Não"}) == \
        "NaoVisto"
    assert classify({"Status da mensagem": "Enviado", "Houve interação": ""}) == \
        "NaoVisto"
    assert classify({"Status da mensagem": "Lida", "Houve interação": "Não"}) == \
        "LidoSemInteracao"

    etiq = "2026-08-24, Automação, {}, SaudeDaGente, Marajo"
    sources = {
        "Cardiologia": [
            {"Nome": "ANA SILVA", "Telefone": "(61) 99999-0001",
             "Etiquetas": etiq.format("Cardiologia"), "Notas Internas": ""},
            {"Nome": "BRUNO COSTA", "Telefone": "(61) 98888-0002",
             "Etiquetas": etiq.format("Cardiologia"),
             "Notas Internas": "Outros telefones: (61) 3333-4444"},
            {"Nome": "DUDA SOUZA", "Telefone": "(61) 98765-4321",
             "Etiquetas": etiq.format("Cardiologia"), "Notas Internas": ""},
        ],
        "Ortopedia": [
            {"Nome": "ana silva", "Telefone": "(61) 90000-5555",
             "Etiquetas": etiq.format("Ortopedia"), "Notas Internas": ""},
            {"Nome": "ERIDAN SOARES", "Telefone": "(61) 97123-4567",
             "Etiquetas": etiq.format("Ortopedia"), "Notas Internas": ""},
        ],
    }
    reports = {
        "61999990001": {"Status da mensagem":
                        "O número de telefone não possui WhatsApp",
                        "Houve interação": "Não"},
        "61988880002": {"Status da mensagem": "Entregue", "Houve interação": "Não"},
        "61987654321": {"Status da mensagem": "Lida", "Houve interação": "Sim"},
        "61900005555": {"Status da mensagem": "Lida", "Houve interação": "Não"},
    }
    entries, excluded = collect_targets(sources, reports)
    assert excluded == 1  # DUDA interacted

    assert len(entries) == 3
    ana = entries["ana silva"]
    assert ana["specs"] == ["Cardiologia", "Ortopedia"]
    assert "(61) 99999-0001" in ana["phones"] and "(61) 90000-5555" in ana["phones"]

    out = {}
    for key, entry in entries.items():
        out[key] = finalize_entry(entry)
    # ANA: primary dead, alternate harvested from the Ortopedia row;
    # the dead number is dropped entirely
    ana_out = out["ana silva"]
    assert ana_out["Telefone"] == "(61) 90000-5555"
    assert ana_out["Notas Internas"] == ""
    assert ana_out["Etiquetas"] == (
        "2026-08-24, Automação, Cardiologia, Ortopedia, "
        "Recaptação, SaudeDaGente, Marajo"
    )
    # BRUNO: delivered unseen, keeps his mobile, extra phone in notes
    bruno = out["bruno costa"]
    assert bruno["Telefone"] == "(61) 98888-0002"
    assert bruno["Notas Internas"] == "Outros telefones: (61) 3333-4444"
    # ERIDAN: absent from reports, single phone, empty notes
    eridan = out["eridan soares"]
    assert eridan["Telefone"] == "(61) 97123-4567"
    assert eridan["Notas Internas"] == ""

    # SemWhatsApp with no alternative keeps the original number
    solo = {
        "nome": "Solo Paciente", "date": "2026-08-24",
        "specs": ["Tomografia"], "phones": ["(61) 99999-0001"],
        "deads": ["61999990001"], "reasons": {"SemWhatsApp"},
    }
    solo_row = finalize_entry(solo)
    assert solo_row["Telefone"] == "(61) 99999-0001"
    assert solo_row["Notas Internas"] == ""

    # reason priority: most severe wins when a patient has mixed reasons
    assert resolve_reason({"LidoSemInteracao", "NuncaEnviado"}) == "NuncaEnviado"
    print("selftest ok")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 1:
        print("Uso: uv run recaptacao.py [--selftest] <pasta-do-envio>")
        sys.exit(1)
    sys.exit(run_recaptacao(Path(args[0])))


if __name__ == "__main__":
    main()
