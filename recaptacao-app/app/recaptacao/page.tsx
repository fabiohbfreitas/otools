import { prisma } from "@/lib/prisma";
import { Progress } from "@/components/ui";
import { fmtDate } from "@/lib/time";

export default async function Recaptacoes() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { slots: true, _count: { select: { patients: true } } },
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recaptações</h1>
          <p>
            Uma por data de consulta e especialidade. Paciente selecionado sai da base de aptos.
          </p>
        </div>
        <a href="/recaptacao/nova" className="btn-link">
          Nova recaptção
        </a>
      </div>
      {campaigns.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Consulta em</th>
                <th>Especialidade</th>
                <th>Criada em</th>
                <th>Selecionados</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const vagas = c.slots.reduce((a, s) => a + s.vacancies, 0);
                return (
                  <tr key={c.id}>
                    <td>
                      <a href={`/recaptacao/${c.id}`}>{c.name}</a>
                    </td>
                    <td>{fmtDate(c.appointmentDate)}</td>
                    <td>{c.specialty}</td>
                    <td>{fmtDate(c.createdAt)}</td>
                    <td>
                      {c._count.patients} de {vagas}
                    </td>
                    <td>
                      <Progress value={c._count.patients} max={vagas} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <strong>Nenhuma recaptção ainda</strong>
          <p>
            <a href="/recaptacao/nova" className="btn-link">
              Nova recaptção
            </a>
          </p>
        </div>
      )}
    </>
  );
}
