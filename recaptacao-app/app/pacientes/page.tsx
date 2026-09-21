import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Badge, Button, EmptyState, Picker, TextInput } from "@/components/ui";
import { JsonStringArray, PacientesParams } from "@/lib/schemas";

const PER_PAGE = 50;

export default async function Pacientes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = PacientesParams.parse(await searchParams);
  const selVal = p.sel ?? "aptos";
  const where: Prisma.PatientWhereInput = {
    ...(p.polo ? { polo: p.polo } : {}),
    ...(p.especialidade ? { specialty: p.especialidade } : {}),
    ...(p.situacao ? { status: p.situacao } : {}),
    ...(p.q ? { name: { contains: p.q, mode: "insensitive" } } : {}),
    ...(selVal === "aptos" ? { campaigns: { none: {} } } : {}),
    ...(selVal === "selecionados" ? { campaigns: { some: {} } } : {}),
  };
  const [total, polos, specs, statuses] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.groupBy({ by: ["polo"] }),
    prisma.patient.groupBy({ by: ["specialty"] }),
    prisma.patient.groupBy({ by: ["status"] }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(1, p.pag), pages);
  const rows = await prisma.patient.findMany({
    where,
    orderBy: { seq: "asc" },
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    include: { campaigns: { include: { campaign: { select: { id: true, name: true } } } } },
  });
  const qs = (n: number) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(p))
      if (v && k !== "importados" && k !== "ignorados") s.set(k, String(v));
    s.set("pag", String(n));
    return `/pacientes?${s}`;
  };
  const eq = (xs: string[]) => xs.map((x) => [x, x] as [string, string]);
  const pager = (
    <div className="pager">
      <span>{total} pacientes</span>
      <nav>
        {page > 1 ? <a href={qs(page - 1)}>← Anterior</a> : <span />}{" "}
        {page < pages && <a href={qs(page + 1)}>Próxima →</a>}
      </nav>
      <span className="pages">
        Página {page} de {pages}
      </span>
    </div>
  );
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pacientes</h1>
          <p>Aptos para recaptção por padrão. Filtre, selecione campanhas e importe novos lotes.</p>
        </div>
        <a href="/importar" className="btn-link">
          Importar Pacientes
        </a>
      </div>
      {p.importados && (
        <p>
          Importados/atualizados: {p.importados} registros.
          {p.ignorados && p.ignorados !== "0" ? ` Ignorados: ${p.ignorados}.` : ""}
        </p>
      )}
      <form method="get" className="toolbar">
        <Picker name="polo" label="Polo" value={p.polo} options={eq(polos.map((x) => x.polo))} />
        <Picker
          name="especialidade"
          label="Especialidade"
          value={p.especialidade}
          options={eq(specs.map((x) => x.specialty))}
        />
        <Picker
          name="situacao"
          label="Situação"
          value={p.situacao}
          options={eq(statuses.map((x) => x.status))}
        />
        <Picker
          name="sel"
          label="Recaptção"
          value={selVal}
          options={[
            ["aptos", "Aptos"],
            ["selecionados", "Selecionados"],
          ]}
        />
        <label className="picker">
          Nome
          <TextInput type="search" name="q" defaultValue={p.q ?? ""} placeholder="buscar nome" />
        </label>
        <Button type="submit">Filtrar</Button>
      </form>
      {pager}
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Telefone</th>
                <th>Polo</th>
                <th>Especialidade</th>
                <th>Situação</th>
                <th>Recaptção</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{JsonStringArray.parse(r.phones).join(" ")}</td>
                  <td>{r.polo}</td>
                  <td>{r.specialty}</td>
                  <td>
                    <Badge tone={r.status === "Falta" ? "info" : undefined}>{r.status}</Badge>
                  </td>
                  <td>
                    {r.campaigns.length ? (
                      r.campaigns.map((c) => (
                        <span key={c.campaign.id}>
                          <a href={`/recaptacao/${c.campaign.id}`} className="badge badge-ok">
                            {c.campaign.name}
                          </a>{" "}
                        </span>
                      ))
                    ) : (
                      <Badge>Apto</Badge>
                    )}
                  </td>
                  <td>{r.observation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Nenhum paciente encontrado"
          hint="Ajuste os filtros ou importe um novo lote."
        >
          <p>
            <a href="/importar" className="btn-link">
              Importar Pacientes
            </a>
          </p>
        </EmptyState>
      )}
      {pager}
    </>
  );
}
