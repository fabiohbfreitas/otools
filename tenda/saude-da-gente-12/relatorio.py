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


def read_file(f: Path) -> pd.DataFrame:
    if f.suffix == ".csv":
        df = pd.read_csv(f, encoding="utf-8")
    else:
        x = pd.ExcelFile(f)
        marcadores = {"[paciente]", "Contato/Telefone"}
        aba = next((s for s in x.sheet_names
                    if marcadores & set(pd.read_excel(x, sheet_name=s, nrows=0).columns)), x.sheet_names[0])
        df = pd.read_excel(x, sheet_name=aba)
    df = df.dropna(how="all")  # ponytail: planilhas trazem linhas finais em branco
    df["_arquivo"] = f.name
    return df


def read_all(folder: Path) -> pd.DataFrame:
    files = sorted([*folder.glob("*.xlsx"), *folder.glob("*.csv")])
    if not files:
        raise SystemExit(f"nenhum .xlsx/.csv em {folder}")
    df = pd.concat([read_file(f) for f in files], ignore_index=True)
    return df.drop_duplicates(subset=[c for c in df.columns if c != "_arquivo"])  # ponytail: parte2 veio em xlsx+csv idênticos


def read_dados() -> pd.DataFrame:
    """Só formato plataforma ([paciente]/[data]/[procedimento]); original.xlsx é ignorado."""
    dfs = []
    for f in sorted([*DADOS_DIR.glob("*.xlsx"), *DADOS_DIR.glob("*.csv")]):
        df = read_file(f)
        if "[paciente]" not in df.columns:
            print(f"ignorado (fora do formato de envio): {f.name}")
            continue
        dfs.append(df)
    if not dfs:
        raise SystemExit("nenhum arquivo de envio em Dados/")
    dados = pd.concat(dfs, ignore_index=True)
    dados["_dia"] = dados[COL_DATA].astype(str).str.slice(0, 10)  # "22/09/2026 A Partir das 07:00" -> "22/09/2026"
    return dados


def confirmados_de(rel: pd.DataFrame) -> dict[str, bool]:
    sim = rel[COL_INTER].astype(str).str.strip().str.lower() == "sim"
    return rel.assign(_sim=sim).groupby("_tel")["_sim"].any().to_dict()


def main() -> None:
    dados = read_dados()
    rel = read_all(REL_DIR)
    orig_cols = [c for c in dados.columns if not c.startswith("_")]

    dados["_tel"] = dados[COL_TEL_DADOS].map(norm_tel)
    rel["_tel"] = rel[COL_TEL_REL].map(norm_tel)
    rel["_envio"] = pd.to_datetime(rel["Data de envio"], format="%d/%m/%Y %H:%M", errors="coerce")
    rel = rel.sort_values(["_tel", "_envio"])

    conf = confirmados_de(rel)  # Sim em qualquer envio = confirmado
    status = rel.groupby("_tel")[COL_STATUS].last().to_dict()  # status do envio mais recente

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
    def fmt(conf: float, n: float) -> str:
        return f"{int(conf)}/{int(n)} ({conf / n * 100:.1f}%)" if n else "—"

    dias = sorted(expl["_dia"].astype(str).unique(), key=lambda d: datetime.strptime(d, "%d/%m/%Y"))
    base = expl.pivot_table(index="_esp", columns="_dia", values="confirmado",
                            aggfunc=["size", "sum"], fill_value=0).reindex(por_esp.index)
    mat = pd.DataFrame({d: [fmt(base.loc[e, ("sum", d)], base.loc[e, ("size", d)]) for e in por_esp.index]
                        for d in dias}, index=por_esp.index)
    mat.index.name = "especialidade"
    mat["TOTAL"] = [fmt(r["confirmados"], r["n"]) for _, r in por_esp.iterrows()]

    # Números únicos por status do último envio (sem colunas de interação)
    uni = dados[["_tel", "status_envio"]].drop_duplicates("_tel")
    cnt = uni["status_envio"].value_counts()
    total_num = int(cnt.sum())
    lidos = int(cnt.get("Lida", 0))
    status_tab = pd.DataFrame({
        "Status da mensagem (último envio)": cnt.index,
        "Números únicos": cnt.values,
        "% dos números": (cnt.values / total_num * 100).round(1),
        "Situação": ["Lido" if s == "Lida" else "Pendente" for s in cnt.index],
    })
    status_tab.loc[len(status_tab)] = ["Total", total_num, 100.0, f"{total_num - lidos} pendentes"]

    resumo = pd.DataFrame([{
        "total_linhas": n, "telefones_unicos": dados["_tel"].nunique(),
        "confirmados": nc, "nao_confirmados": n - nc, "taxa_%": round(nc / n * 100, 1),
        "numeros_enviados": total_num,
        "numeros_pendentes_envio": total_num - lidos,
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
        status_tab.to_excel(w, sheet_name="Status_envio", index=False)
    for f in OUT_REL.glob("relatorio_*.xlsx"):
        if f != out:
            f.unlink()  # ponytail: só o mais recente sobrevive

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
