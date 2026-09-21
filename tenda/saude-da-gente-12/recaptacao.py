"""Recaptação: lista única com não confirmados dos dias pedidos. Uso: uv run recaptacao.py 22/09/2026 23/09/2026"""
import sys
from datetime import datetime

from relatorio import (COL_TEL_DADOS, COL_TEL_REL, OUT_RECAP, REL_DIR, confirmados_de,
                       norm_tel, read_all, read_dados)


def parse_dia(s: str) -> str:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%d/%m/%Y")
        except ValueError:
            pass
    raise SystemExit(f"dia inválido: {s} (use DD/MM/AAAA)")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        raise SystemExit("uso: uv run recaptacao.py 22/09/2026 [23/09/2026 ...]")
    dias = [parse_dia(a) for a in sys.argv[1:]]

    dados = read_dados()
    orig_cols = [c for c in dados.columns if not c.startswith("_")]

    rel = read_all(REL_DIR)
    dados["_tel"] = dados[COL_TEL_DADOS].map(norm_tel)
    rel["_tel"] = rel[COL_TEL_REL].map(norm_tel)
    dados["confirmado"] = dados["_tel"].map(confirmados_de(rel)).fillna(False).astype(bool)

    desconhecidos = sorted(set(dias) - set(dados["_dia"].astype(str).unique()))
    if desconhecidos:
        raise SystemExit(f"dias sem agenda em Dados: {desconhecidos}")

    sel = dados[dados["_dia"].astype(str).isin(dias) & ~dados["confirmado"]]
    sel = sel.sort_values(["_dia", "[procedimento]", "[paciente]"])

    OUT_RECAP.mkdir(exist_ok=True)
    tag = "+".join(d.replace("/", "-")[:-5] for d in sorted(set(dias), key=lambda d: datetime.strptime(d, "%d/%m/%Y")))
    out = OUT_RECAP / f"recap_{tag}-2026.xlsx"
    sel[orig_cols].to_excel(out, index=False)

    print(f"dias={dias} pendentes={len(sel)} -> {out}")
    print(sel.groupby("_dia").size().to_string() if len(sel) else "(nenhum pendente)")


if __name__ == "__main__":
    main()
