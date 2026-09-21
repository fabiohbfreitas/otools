"""Envios: gera Pacientes + Envios (layout example_output) a partir do input bruto."""
import argparse, datetime, json, os, sys

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recap import (load_inputs, distribute, split_phones, pick_main, agenda_str,
                   local_link, check_metas, write_excedentes, validate_config)

PAC_HDR = ["Nome", "Telefone", "Data Recaptação", "Data", "Hora", "Especialidade", "Local"]
ENV_HDR = ["Nome", "[paciente]", "Telefone", "Notas Internas", "Etiquetas", "[data]", "[horario]", "[especialidade]", "[local]", "[linkmaps]"]


def esp_base(esp):
    return esp.split(" - ")[0] if esp else ""


def build_envios(cfg, buckets, dates, polos_por_dia):
    pac, env = [], []
    for d in dates:
        nova = datetime.date.fromisoformat(d).strftime("%d/%m/%Y")
        for polo in polos_por_dia[dates.index(d)]:
            bloco = buckets.get((d, polo), [])
            if not bloco:
                continue
            if pac:
                pac.append([None] * 7)
                env.append([None] * 10)
            for p, slot in bloco:
                hh, mm = slot.split(":")
                t = datetime.time(int(hh), int(mm))
                main, rest = pick_main(split_phones(p["tel_raw"]))
                loc, link = local_link(cfg, polo, p["esp"])
                base = esp_base(p["esp"])
                etiq = cfg["etiqueta_envios"].format(data_iso=d, polo=polo, esp=base, agenda=agenda_str(slot))
                notas = ("Outros Telefones: " + ", ".join(rest)) if rest else None
                pac.append([p["paciente"], p["tel_raw"] or None, p["data_recap"] or None, nova, t, p["esp"], polo])
                env.append([p["paciente"], p["paciente"], main, notas, etiq, nova, t, base, loc, link])
    return pac, env


def output_base(dates, sufixo=""):
    d0 = datetime.date.fromisoformat(min(dates))
    d1 = datetime.date.fromisoformat(max(dates))
    base = f"Recaptação {d0:%d_%m}" if d0 == d1 else f"Recaptação {d0:%d_%m}-{d1:%d_%m}"
    if sufixo.strip():
        base += f" {sufixo.strip()}"
    return base


def write_sheet(path, name, hdr, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = name
    ws.append(hdr)
    for r in rows:
        if any(r):
            ws.append(r)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, datetime.time):
                c.number_format = "HH:MM"
    wb.save(path)


def selfcheck():
    assert PAC_HDR == ["Nome", "Telefone", "Data Recaptação", "Data", "Hora", "Especialidade", "Local"]
    assert ENV_HDR == ["Nome", "[paciente]", "Telefone", "Notas Internas", "Etiquetas", "[data]", "[horario]", "[especialidade]", "[local]", "[linkmaps]"]
    assert "2026-09-10, Automação, Ortopedia, Gama, Agenda07h30" == \
        "{data_iso}, Automação, {esp}, {polo}, {agenda}".format(
            data_iso="2026-09-10", esp="Ortopedia", polo="Gama", agenda="Agenda07h30")
    assert esp_base("Ortopedia - Ombro") == "Ortopedia" and esp_base("Ortopedia") == "Ortopedia"
    assert output_base(["2026-09-22"]) == "Recaptação 22_09"
    assert output_base(["2026-09-22"], "Sobradinho Manhã") == "Recaptação 22_09 Sobradinho Manhã"
    assert output_base(["2026-09-22", "2026-09-23"], "Gama") == "Recaptação 22_09-23_09 Gama"
    print("selfcheck ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--inputs", default="Input", help="pasta ou arquivo xlsx/csv único")
    ap.add_argument("--datas", required=False, help="AAAA-MM-DD,...")
    ap.add_argument("--polos-por-dia", default="", help='"Gama,Sobradinho;Samambaia,..." (vazio=todos por dia)')
    ap.add_argument("--out-dir", default=".")
    ap.add_argument("--sufixo", default="", help='ex: "Sobradinho Manhã" → Recaptação 22_09 Sobradinho Manhã - ...')
    ap.add_argument("--selfcheck", action="store_true")
    a = ap.parse_args()
    if a.selfcheck:
        return selfcheck()
    if not a.datas:
        ap.error("--datas é obrigatório")
    cfg = json.load(open(a.config, encoding="utf-8"))
    if "etiqueta_envios" not in cfg:
        sys.exit("config sem etiqueta_envios")
    cfg_min, metas = validate_config(cfg)
    dates = [d.strip() for d in a.datas.split(",")]
    polos = list(cfg["polos"])
    ppd = ([p.strip() for p in g.split(",") if p.strip()] for g in a.polos_por_dia.split(";")) if a.polos_por_dia else None
    polos_por_dia = [list(g) if g else list(polos) for g in ppd] if ppd else [list(polos)] * len(dates)
    if len(polos_por_dia) != len(dates):
        sys.exit("--polos-por-dia deve ter um grupo por data")
    patients = load_inputs(a.inputs)
    for p in patients:
        if p["polo"] not in cfg["polos"]:
            sys.exit(f"polo sem config: {p['polo']}")
    buckets, exced = distribute(patients, dates, polos_por_dia, cfg["slots"], cfg_min, metas)
    for w in check_metas(buckets, dates, polos_por_dia, metas, cfg_min):
        print(w)
    for d, pls in zip(dates, polos_por_dia):
        print("  " + d + ": " + " ".join(f"{p}={len(buckets.get((d, p), []))}" for p in pls))
    pac, env = build_envios(cfg, buckets, dates, polos_por_dia)
    base = output_base(dates, a.sufixo)
    d0 = datetime.date.fromisoformat(min(dates))
    d1 = datetime.date.fromisoformat(max(dates))
    os.makedirs(a.out_dir, exist_ok=True)
    for name, hdr, rows in [("Pacientes", PAC_HDR, pac), ("Envios", ENV_HDR, env)]:
        path = os.path.join(a.out_dir, f"{base} - {name}.xlsx")
        write_sheet(path, name, hdr, rows)
        print(f"  {path}")
    if exced:
        edir = os.path.join(a.out_dir, "excedentes")
        os.makedirs(edir, exist_ok=True)
        epath = os.path.join(edir, f"excedentes_{d0:%d_%m}-{d1:%d_%m}.xlsx")
        write_excedentes(epath, exced)
        print(f"  {epath} ({len(exced)} excedentes)")
    print(f"{len(patients)} pacientes -> {base} - Pacientes|Envios.xlsx")


if __name__ == "__main__":
    main()
