"""Recaptação: lista única com não confirmados dos dias pedidos. Uso: uv run recaptacao.py 22/09/2026 23/09/2026"""
import sys
from datetime import datetime

from relatorio import COL_DATA, DADOS_DIR, OUT_RECAP, norm_tel, read_all

COLS_DADOS = ["[paciente]", "Telefone", "[data]", "[procedimento]", "Local", "Edição"]


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

    dados = read_all(DADOS_DIR)
    from relatorio import COL_INTER, COL_STATUS, COL_TEL_DADOS, COL_TEL_REL, REL_DIR

    rel = read_all(REL_DIR)
    dados["_tel"] = dados[COL_TEL_DADOS].map(norm_tel)
    rel["_tel"] = rel[COL_TEL_REL].map(norm_tel)
    conf = rel.groupby("_tel")[COL_INTER].apply(lambda s: (s.astype(str).str.strip().str.lower() == "sim").any()).to_dict()
    dados["confirmado"] = dados["_tel"].map(conf).fillna(False).astype(bool)

    desconhecidos = sorted(set(dias) - set(dados[COL_DATA].astype(str).unique()))
    if desconhecidos:
        raise SystemExit(f"dias sem agenda em Dados: {desconhecidos}")

    sel = dados[dados[COL_DATA].astype(str).isin(dias) & ~dados["confirmado"]]
    sel = sel.sort_values(["[data]", "[procedimento]", "[paciente]"])

    OUT_RECAP.mkdir(exist_ok=True)
    tag = "+".join(d.replace("/", "-")[:-5] for d in sorted(set(dias), key=lambda d: datetime.strptime(d, "%d/%m/%Y")))
    out = OUT_RECAP / f"recap_{tag}-2026.xlsx"
    sel[COLS_DADOS].to_excel(out, index=False)

    print(f"dias={dias} pendentes={len(sel)} -> {out}")
    print(sel.groupby(COL_DATA).size().to_string() if len(sel) else "(nenhum pendente)")


if __name__ == "__main__":
    main()
