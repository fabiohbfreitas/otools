#!/usr/bin/env python3
"""Recaptura: cruza Dados/ x Relatorios/ -> recaptura.xlsx no formato do modelo.

Uso: uv run recaptura.py [--pular DD/MM/AAAA ...] [--dia DD/MM/AAAA] [--remarcar-de DD/MM/AAAA --remarcar-para DD/MM/AAAA] [saida.xlsx]
Re-rodagem: jogue o relatório novo em Relatorios/ e rode de novo.
Quem teve 'Sim' em QUALQUER relatório é excluído (sucesso global).
Alvo = 'Houve interação=Não' (inclui falhas de entrega).
Saída = 1 linha por paciente/exame (telefone pode repetir).
--pular exclui dias de agendamento (ex: dias já passados).
--dia filtra um único dia de agendamento.
--remarcar-de/--remarcar-para reemite os não-confirmados do dia de origem
  com a DataAgendamento = data 'para' (remarcação).
--pular, --dia e --remarcar-* são mutuamente exclusivos.
"""
import argparse
import csv
import re
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook

BASE = Path(__file__).parent
DADOS = BASE / "Dados"
REL = BASE / "Relatorios"
HEADER = ["Telefone", "[Nome]", "[DataAgendamento]", "[Procedimento]"]

DATE_FMTS = ("%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y")


def norm_phone(s):
    d = re.sub(r"\D", "", s or "")
    if len(d) in (12, 13) and d.startswith("55"):
        d = d[2:]  # ponytail: ignora DDI 55, base é nacional
    return d


def fmt_phone(d):
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return d


def fmt_date(s):
    s = (s or "").strip()
    for f in DATE_FMTS:
        try:
            return datetime.strptime(s, f).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return s


def fmt_categoria(s):
    # ponytail: categoria curta no lugar do procedimento detalhado (msg menor)
    return "; ".join(p for p in ((x or "").strip() for x in (s or "").split(";")) if p)


def parse_dia_cli(s):
    # ponytail: entrada do terminal é BR primeiro (08/09/2026 = 8/set),
    # ordem inversa do fmt_date, que lê os CSVs em ordem americana
    for f in ("%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%Y-%m-%d"):
        try:
            return datetime.strptime((s or "").strip(), f).strftime("%d/%m/%Y")
        except ValueError:
            continue
    raise ValueError(f"dia inválido (use DD/MM/AAAA): {s!r}")


def read_csv(path):
    for enc in ("utf-8-sig", "latin1"):
        try:
            with open(path, encoding=enc) as fh:
                sample = fh.read(4096)
                fh.seek(0)
                delim = ";" if sample.count(";") > sample.count(",") else ","
                return list(csv.DictReader(fh, delimiter=delim))
        except UnicodeError:
            continue
    raise ValueError(f"encoding ilegível: {path}")


def main(out=None, pular=None, dia=None, remarcar_de=None, remarcar_para=None):
    if (remarcar_de or remarcar_para) and not (remarcar_de and remarcar_para):
        print("erro: --remarcar-de e --remarcar-para devem ser usados juntos", file=sys.stderr)
        raise SystemExit(2)
    if remarcar_de and (pular or dia):
        print("erro: --remarcar-* é mutuamente exclusivo com --pular e --dia", file=sys.stderr)
        raise SystemExit(2)
    if pular and dia:
        print("erro: --pular e --dia são mutuamente exclusivos", file=sys.stderr)
        raise SystemExit(2)
    skip = set()
    for d in pular or []:
        try:
            skip.add(parse_dia_cli(d))
        except ValueError as e:
            print(f"erro: {e}", file=sys.stderr)
            raise SystemExit(2)
    dia_alvo = None
    if dia:
        try:
            dia_alvo = parse_dia_cli(dia)
        except ValueError as e:
            print(f"erro: {e}", file=sys.stderr)
            raise SystemExit(2)
    de = para = None
    if remarcar_de:
        try:
            de, para = parse_dia_cli(remarcar_de), parse_dia_cli(remarcar_para)
        except ValueError as e:
            print(f"erro: {e}", file=sys.stderr)
            raise SystemExit(2)
    if out is None and de and para:
        out = BASE / f"recaptura-remarcada-{de.replace('/', '-')}-para-{para.replace('/', '-')}.xlsx"
    elif out is None and dia_alvo:
        out = BASE / f"recaptura-dia-{dia_alvo.replace('/', '-')}.xlsx"
    elif out is None and skip:
        tag = "_".join(sorted(skip, key=lambda d: (d[6:], d[3:5], d[:2])))
        out = BASE / f"recaptura-sem-{tag.replace('/', '-')}.xlsx"
    out = Path(out or BASE / "recaptura.xlsx")
    sim, nao = set(), set()
    for f in sorted(REL.glob("*.csv")):
        for r in read_csv(f):
            p = norm_phone(r.get("Contato/Telefone", ""))
            if not p:
                continue
            (sim if (r.get("Houve interação", "") or "").strip().lower() == "sim" else nao).add(p)
    alvo = nao - sim  # exclusão global de sucesso

    rows, invalid, sem_relato, pulados, remarcados = [], 0, 0, 0, 0
    for f in sorted(DADOS.glob("*.csv")):
        for r in read_csv(f):
            cols = r.keys()
            tel_raw = r.get("Telefone padronizado") if "Telefone padronizado" in cols else r.get("Telefone", "")
            p = norm_phone(tel_raw)
            if len(p) not in (10, 11):
                invalid += 1
                continue
            if p not in alvo:
                if p not in sim:
                    sem_relato += 1
                continue
            data = fmt_date(r.get("Data", ""))
            if de and para:
                if data != de:
                    continue
                remarcados += 1
            elif data in skip:
                pulados += 1
                continue
            elif dia_alvo and data != dia_alvo:
                continue
            proc = fmt_categoria(r.get("Categoria/Meta") or r.get("Categorias") or r.get("Procedimento/Exame"))
            rows.append([fmt_phone(p), (r.get("Paciente", "") or "").strip(),
                         para or data, proc])
    rows.sort(key=lambda x: x[1])

    wb = Workbook()
    ws = wb.active
    ws.title = "Recaptura"
    ws.append(HEADER)
    for row in rows:
        ws.append(row)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for c, w in zip("ABCD", (18, 45, 18, 45)):
        ws.column_dimensions[c].width = w
    res = wb.create_sheet("Resumo")
    for k, v in [("Relatórios: interagiram (Sim, únicos)", len(sim)),
                 ("Relatórios: sem interação (Não, únicos)", len(nao)),
                 ("Alvo (Não menos Sim global)", len(alvo)),
                 ("Dia filtrado", dia_alvo or "—"),
                 ("Dias pulados", ", ".join(sorted(skip, key=lambda d: (d[6:], d[3:5], d[:2]))) or "—"),
                 ("Linhas puladas (dias excluídos)", pulados),
                 ("Remarcação de", de or "—"),
                 ("Remarcação para", para or "—"),
                 ("Linhas remarcadas", remarcados),
                 ("Linhas de recaptura (1/paciente)", len(rows)),
                 ("Dados: telefone inválido (ignorado)", invalid),
                 ("Dados: fora de relatório/excluído", sem_relato)]:
        res.append([k, v])
    res.column_dimensions["A"].width = 42
    wb.save(out)
    print(f"Sim={len(sim)} Nao={len(nao)} alvo={len(alvo)} linhas={len(rows)} "
          f"pulados={pulados} remarcados={remarcados} invalidos={invalid} fora={sem_relato} -> {out.name}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Gera planilha de recaptura no formato do modelo.")
    ap.add_argument("--pular", action="append", default=[], metavar="DD/MM/AAAA",
                    help="dia de agendamento a excluir (repetível)")
    ap.add_argument("--dia", default=None, metavar="DD/MM/AAAA",
                    help="dia de agendamento a filtrar (único)")
    ap.add_argument("--remarcar-de", default=None, metavar="DD/MM/AAAA",
                    help="dia de origem dos não-confirmados (par com --remarcar-para)")
    ap.add_argument("--remarcar-para", default=None, metavar="DD/MM/AAAA",
                    help="nova data de agendamento (par com --remarcar-de)")
    ap.add_argument("saida", nargs="?", default=None, help="xlsx de saída (padrão: recaptura.xlsx)")
    args = ap.parse_args()
    main(args.saida, args.pular, args.dia, args.remarcar_de, args.remarcar_para)
