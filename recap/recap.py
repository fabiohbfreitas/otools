"""Recap: distribui não-consultados em Recap N (controle) + Envio N (automação)."""
import argparse, datetime, glob, json, os, re, sys
from collections import defaultdict

import openpyxl

RECAP_HDR = ["Paciente", "Telefone", "Data Recaptação", "Unidade", "Especialidade", "Hora", "Data"]
ENVIO_HDR = ["[paciente]", "Telefone", "[especialidade]", "[horario]", "[data]", "[local]", "[linkmaps]", "Etiquetas", "Notas Internas"]
INPUT_HDR = ["Paciente", "Telefone", "Data", "Horário", "Unidade", "Especialidade", "Situação", "Observação"]


def split_phones(raw):
    if not raw or not str(raw).strip():
        return []
    return [p.strip() for p in str(raw).split(",") if p.strip()]


def pick_main(phones):
    # ponytail: 11 dígitos = móvel 9 dígitos; upgrade se regra de DDD mudar
    if not phones:
        return None, []
    for p in phones:
        if len(re.sub(r"\D", "", p)) == 11:
            rest = list(phones)
            rest.remove(p)
            return p, rest
    return phones[0], phones[1:]


def agenda_str(slot):
    hh, mm = slot.split(":")
    return f"Agenda{hh}h" if mm == "00" else f"Agenda{hh}h{mm}"


def assign_slots(items, slots, min_n):
    # ponytail: usa só os slots necessários; mínimo min_n por slot, salvo resto final
    n = len(items)
    if n == 0:
        return []
    k = min(len(slots), n // min_n) if n >= min_n else 1
    k = max(k, 1)
    base, rem = divmod(n, k)
    out, j = [], 0
    for s in range(k):
        for _ in range(base + (1 if s < rem else 0)):
            out.append((items[j], slots[s]))
            j += 1
    return out


def local_link(cfg, polo, esp):
    p = cfg["polos"][polo]
    ov = (p.get("especialidades") or {}).get(esp) or {}
    return ov.get("endereco", p["endereco"]), ov.get("link", p["link"])


def load_inputs(indir):
    pats = sorted(glob.glob(os.path.join(indir, "*.xlsx")))
    if not pats:
        sys.exit(f"nenhum xlsx em {indir}")
    out = []
    for f in pats:
        wb = openpyxl.load_workbook(f, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if [str(c).strip() if c else "" for c in rows[0][:8]] != INPUT_HDR:
            sys.exit(f"{f}: cabeçalho inesperado: {rows[0][:8]}")
        for r in rows[1:]:
            if not r[0] or not str(r[0]).strip():
                continue
            out.append({"paciente": str(r[0]).strip(), "tel_raw": str(r[1]).strip() if r[1] else "",
                        "data_recap": str(r[2]).strip() if r[2] else "",
                        "polo": str(r[4]).strip(), "esp": str(r[5]).strip() if r[5] else ""})
    return out


def plan_quotas(total, ndates, min_n):
    # ponytail: sem mínimo ou total suficiente = divisão igual; senão completa o mínimo nos 1ºs dias
    if min_n and total < min_n * ndates:
        quotas, left = [], total
        for _ in range(ndates):
            q = min(min_n, left)
            quotas.append(q)
            left -= q
        return quotas
    base, rem = divmod(total, ndates)
    return [base + (1 if i < rem else 0) for i in range(ndates)]


def distribute(patients, dates, polos_por_dia, slots, min_horario, min_polo=0):
    by_polo = defaultdict(list)
    for p in patients:
        by_polo[p["polo"]].append(p)
    buckets = {(d, polo): [] for d, pls in zip(dates, polos_por_dia) for polo in pls}
    for polo, lst in by_polo.items():
        ds = [d for d, pls in zip(dates, polos_por_dia) if polo in pls]
        if not ds:
            sys.exit(f"polo {polo} sem data destino")
        i = 0
        for d, n in zip(ds, plan_quotas(len(lst), len(ds), min_polo)):
            buckets[(d, polo)] = assign_slots(lst[i:i + n], slots, min_horario)
            i += n
    return buckets


def check_min_por_polo(buckets, dates, polos_por_dia, min_n):
    warns = []
    for d, pls in zip(dates, polos_por_dia):
        for polo in pls:
            n = len(buckets.get((d, polo), []))
            if min_n and n < min_n:
                warns.append(f"AVISO: {polo} em {d}: {n} < mínimo {min_n}")
    return warns


def build_rows(cfg, buckets, dates, polos_por_dia):
    files = []
    for d in dates:
        dt = datetime.date.fromisoformat(d)
        nova = dt.strftime("%d/%m/%Y")
        recap, envio = [], []
        emitidos = 0
        for polo in polos_por_dia[dates.index(d)]:
            bloco = buckets.get((d, polo), [])
            if not bloco:
                continue
            if emitidos:
                recap.append([None] * 7)
                envio.append([None] * 9)
            emitidos += 1
            for p, slot in bloco:
                hh, mm = slot.split(":")
                t = datetime.time(int(hh), int(mm))
                phones = split_phones(p["tel_raw"])
                main, rest = pick_main(phones)
                loc, link = local_link(cfg, polo, p["esp"])
                etiq = cfg["etiqueta_template"].format(data_iso=d, polo=polo, esp=p["esp"], agenda=agenda_str(slot))
                notas = ("Outros Telefones: " + ", ".join(rest)) if rest else None
                recap.append([p["paciente"], p["tel_raw"] or None, p["data_recap"], polo, p["esp"], t, nova])
                envio.append([p["paciente"], main, p["esp"], t, nova, loc, link, etiq, notas])
        files.append((f"Recap {dt:%d_%m}.xlsx", [("Recaptação", RECAP_HDR, recap), ("Envio", ENVIO_HDR, envio)]))
    return files


def write_xlsx(path, sheets):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, hdr, rows in sheets:
        ws = wb.create_sheet(name)
        ws.append(hdr)
        for r in rows:
            ws.append(r)
        for row in ws.iter_rows(min_row=2):
            for c in row:
                if isinstance(c.value, datetime.time):
                    c.number_format = "HH:MM"
    wb.save(path)


def selfcheck():
    assert pick_main(["(61) 3485-9002", "(61) 99587-0517", "(61) 99132-0964"])[0] == "(61) 99587-0517"
    assert pick_main(["(61) 3315-2425", "(61) 9938-2494", "(61) 99636-9724"])[0] == "(61) 99636-9724"
    assert pick_main(["(61) 9169-6717", "(61) 99169-6717"])[0] == "(61) 99169-6717"
    assert pick_main([]) == (None, [])
    assert split_phones(None) == []
    assert agenda_str("09:00") == "Agenda09h" and agenda_str("13:00") == "Agenda13h"
    assert agenda_str("07:30") == "Agenda07h30" and agenda_str("15:15") == "Agenda15h15"
    assert [s for _, s in assign_slots(list(range(10)), [f"0{i}" for i in range(10)], 4)] == ["00"] * 5 + ["01"] * 5
    assert assign_slots(list(range(3)), ["a", "b"], 4) == [(0, "a"), (1, "a"), (2, "a")]
    b = {("2026-09-01", "Gama"): [1] * 5, ("2026-09-01", "Sobradinho"): [1] * 40}
    assert check_min_por_polo(b, ["2026-09-01"], [["Gama", "Sobradinho"]], 10) == ["AVISO: Gama em 2026-09-01: 5 < mínimo 10"]
    assert check_min_por_polo(b, ["2026-09-01"], [["Gama", "Sobradinho"]], 0) == []
    assert plan_quotas(200, 2, 200) == [200, 0]
    assert plan_quotas(242, 2, 200) == [200, 42]
    assert plan_quotas(441, 2, 200) == [221, 220]
    assert plan_quotas(10, 3, 0) == [4, 3, 3]
    print("selfcheck ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--inputs", default="Test-Input")
    ap.add_argument("--datas", required=False, help="AAAA-MM-DD,... (uma por Recap N)")
    ap.add_argument("--polos-por-dia", default="", help='"Gama,Sobradinho;Samambaia,..." (vazio=todos por dia)')
    ap.add_argument("--out-dir", default="outputs")
    ap.add_argument("--min-por-polo", type=int, default=0, help="mínimo de pacientes por polo/dia (0=desligado; completa o mínimo nos 1ºs dias, avisa o resto)")
    ap.add_argument("--selfcheck", action="store_true")
    a = ap.parse_args()
    if a.selfcheck:
        return selfcheck()
    if not a.datas:
        ap.error("--datas é obrigatório (ex: --datas 2026-09-02,2026-09-03,2026-09-04)")
    cfg = json.load(open(a.config, encoding="utf-8"))
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
    buckets = distribute(patients, dates, polos_por_dia, cfg["slots"], cfg.get("min_por_horario", 4), a.min_por_polo)
    for w in check_min_por_polo(buckets, dates, polos_por_dia, a.min_por_polo):
        print(w)
    for d, pls in zip(dates, polos_por_dia):
        print("  " + d + ": " + " ".join(f"{p}={len(buckets.get((d, p), []))}" for p in pls))
    sheets = build_rows(cfg, buckets, dates, polos_por_dia)
    os.makedirs(a.out_dir, exist_ok=True)
    for fname, file_sheets in sheets:
        path = os.path.join(a.out_dir, fname)
        write_xlsx(path, file_sheets)
        print(f"  {path}")
    print(f"{len(patients)} pacientes -> {len(sheets)} arquivos em {a.out_dir}/")


if __name__ == "__main__":
    main()
