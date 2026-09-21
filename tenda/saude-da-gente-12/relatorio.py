"""Relatório Saúde da Gente 12: confirmação por telefone + recaptação."""
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
DADOS_DIR = ROOT / "Dados"
REL_DIR = ROOT / "Relatorios"
OUT_REL = REL_DIR / "gerados"
OUT_RECAP = DADOS_DIR / "recaptacao"

COL_TEL_DADOS = "Telefone"
COL_TEL_REL = "Contato/Telefone"
COL_INTER = "Houve interação"
COL_STATUS = "Status da mensagem"
COL_DATA = "[data]"
COL_PROC = "[procedimento]"


def norm_tel(v) -> str:
    d = re.sub(r"\D", "", str(v))
    if len(d) == 13 and d.startswith("55"):
        d = d[2:]
    return d[-11:] if len(d) >= 11 else d  # ponytail: 11 dígitos BR, DDI extra cai aqui


def read_all(folder: Path) -> pd.DataFrame:
    files = sorted(folder.glob("*.xlsx"))
    if not files:
        raise SystemExit(f"nenhum .xlsx em {folder}")
    dfs = []
    for f in files:
        df = pd.read_excel(f, sheet_name=0)
        df["_arquivo"] = f.name
        dfs.append(df)
    return pd.concat(dfs, ignore_index=True)


def read_dados() -> pd.DataFrame:
    """Só formato plataforma ([paciente]/[data]/[procedimento]); original.xlsx é ignorado."""
    dfs = []
    for f in sorted(DADOS_DIR.glob("*.xlsx")):
        df = pd.read_excel(f, sheet_name=0)
        if "[paciente]" not in df.columns:
            print(f"ignorado (fora do formato de envio): {f.name}")
            continue
        df["_arquivo"] = f.name
        dfs.append(df)
    if not dfs:
        raise SystemExit("nenhum arquivo de envio em Dados/")
    dados = pd.concat(dfs, ignore_index=True)
    dados["_dia"] = dados[COL_DATA].astype(str).str.slice(0, 10)  # "22/09/2026 - A partir das 07:00" -> "22/09/2026"
    return dados


def main() -> None:
    dados = read_dados()
    rel = read_all(REL_DIR)
    orig_cols = [c for c in dados.columns if not c.startswith("_")]

    dados["_tel"] = dados[COL_TEL_DADOS].map(norm_tel)
    rel["_tel"] = rel[COL_TEL_REL].map(norm_tel)
    rel["_sim"] = rel[COL_INTER].astype(str).str.strip().str.lower() == "sim"

    conf = rel.groupby("_tel")["_sim"].any().to_dict()  # Sim em qualquer envio = confirmado
    sem_wa = rel[rel[COL_STATUS].astype(str).str.contains("WhatsApp", na=False)].groupby("_tel").size().to_dict()
    status = rel.groupby("_tel")[COL_STATUS].last().to_dict()

    dados["confirmado"] = dados["_tel"].map(conf).fillna(False).astype(bool)
    dados["status_envio"] = dados["_tel"].map(status).fillna("SEM ENVIO")

    n, nc = len(dados), int(dados["confirmado"].sum())
    por_dia = dados.groupby("_dia")["confirmado"].agg(n="size", confirmados="sum")
    por_dia["taxa_%"] = (por_dia["confirmados"] / por_dia["n"] * 100).round(1)

    expl = dados.assign(_esp=dados[COL_PROC].str.split(";")).explode("_esp")
    expl["_esp"] = expl["_esp"].str.strip()
    por_esp = expl.groupby("_esp")["confirmado"].agg(n="size", confirmados="sum")
    por_esp["taxa_%"] = (por_esp["confirmados"] / por_esp["n"] * 100).round(1)
    por_esp = por_esp.sort_values("n", ascending=False)

    # Matriz especialidade (linhas) x dia (colunas): célula = "conf/n (taxa%)"
    dias = sorted(expl["_dia"].astype(str).unique(),
                  key=lambda d: datetime.strptime(d, "%d/%m/%Y"))
    base = expl.groupby(["_esp", "_dia"])["confirmado"].agg(n="size", confirmados="sum")
    order = por_esp.index.tolist()
    mat = pd.DataFrame(index=order)
    for d in dias:
        col = []
        for e in order:
            try:
                r = base.loc[(e, d)]
                col.append(f"{int(r['confirmados'])}/{int(r['n'])} ({r['confirmados'] / r['n'] * 100:.1f}%)")
            except KeyError:
                col.append("—")
        mat[d] = col
    mat.index.name = "especialidade"
    tot = [f"{int(por_esp.loc[e, 'confirmados'])}/{int(por_esp.loc[e, 'n'])} ({por_esp.loc[e, 'taxa_%']:.1f}%)" for e in order]
    mat["TOTAL"] = tot

    status_tab = pd.crosstab(rel[COL_STATUS], rel[COL_INTER])
    resumo = pd.DataFrame([{
        "total_linhas": n, "telefones_unicos": dados["_tel"].nunique(),
        "confirmados": nc, "nao_confirmados": n - nc, "taxa_%": round(nc / n * 100, 1),
        "telefones_sem_whatsapp": len(sem_wa),
        "arquivos_dados": sorted(dados["_arquivo"].unique().tolist()),
        "arquivos_relatorios": sorted(p.name for p in REL_DIR.glob("*.xlsx")),
        "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
    }])

    OUT_REL.mkdir(exist_ok=True)
    OUT_RECAP.mkdir(exist_ok=True)
    out = OUT_REL / f"relatorio_{datetime.now():%Y%m%d_%H%M}.xlsx"
    with pd.ExcelWriter(out) as w:
        resumo.to_excel(w, sheet_name="Resumo", index=False)
        por_esp.reset_index().rename(columns={"_esp": "especialidade"}).to_excel(w, sheet_name="Por_especialidade", index=False)
        mat.reset_index().to_excel(w, sheet_name="Esp_x_dia", index=False)
        status_tab.reset_index().to_excel(w, sheet_name="Status_envio", index=False)

    recaps = []
    for dia, g in dados[~dados["confirmado"]].groupby("_dia"):
        fname = f"recap_{dia.replace('/', '-')}.xlsx"
        g[orig_cols].to_excel(OUT_RECAP / fname, index=False)  # orig_cols mantém [data] completo com hora
        recaps.append(f"{fname}: {len(g)}")

    print(f"linhas={n} confirmados={nc} taxa={nc / n * 100:.1f}%")
    print(por_dia.to_string())
    print(f"OK -> {out}")
    print("Recaptação (inclui sem WhatsApp):")
    print("\n".join(recaps) if recaps else " (nenhum pendente)")


if __name__ == "__main__":
    main()
