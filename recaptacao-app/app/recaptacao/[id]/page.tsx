import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Button, EmptyState, Progress, Stat } from "@/components/ui";
import { planDistribution, resolveTimes, assignRows } from "@/lib/envios";
import { fmtDate } from "@/lib/time";

export default async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  const c = await prisma.campaign.findUnique({
    where: { id: (await params).id },
    include: {
      slots: { orderBy: { polo: "asc" }, include: { times: true } },
      patients: {
        include: { patient: true },
        orderBy: [{ polo: "asc" }, { patient: { seq: "asc" } }],
      },
    },
  });
  if (!c) notFound();
  const assigned = assignRows(c.appointmentDate, c.specialty, c.slots, c.patients);
  const byPolo = new Map<string, typeof assigned>();
  for (const p of assigned) byPolo.set(p.polo, [...(byPolo.get(p.polo) ?? []), p]);
  const vagas = c.slots.reduce((a, s) => a + s.vacancies, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p>
            {c.specialty} — consulta em {fmtDate(c.appointmentDate)} — criada em{" "}
            {fmtDate(c.createdAt)}
          </p>
        </div>
        <div>
          <a href={`/api/campaigns/${c.id}/envios`} className="btn-secondary">
            Exportar envios
          </a>{" "}
          <a href={`/api/campaigns/${c.id}/pacientes`} className="btn-link">
            Exportar pacientes
          </a>
        </div>
      </div>
      <div className="stats">
        <Stat value={vagas} label="Vagas" />
        <Stat value={c.patients.length} label="Selecionados" />
        <Stat value={c.slots.length} label="Polos" />
      </div>
      {!c.patients.length ||
      c.slots.some((s) => (byPolo.get(s.polo) ?? []).length < s.vacancies) ? (
        <EmptyState
          title={c.patients.length ? "Vagas restantes" : "Nenhum paciente selecionado"}
          hint="Busca Falta/Pendente até as vagas, excluindo quem já está em outra recaptção."
        >
          <form action={`/api/campaigns/${c.id}/select`} method="post">
            <Button type="submit">Selecionar pacientes</Button>
          </form>
        </EmptyState>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Polo</th>
              <th>Vagas</th>
              <th>Selecionados</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {c.slots.map((s) => {
              const n = (byPolo.get(s.polo) ?? []).length;
              return (
                <tr key={s.polo}>
                  <td>{s.polo}</td>
                  <td>{s.vacancies}</td>
                  <td>{n}</td>
                  <td>
                    <Progress value={n} max={s.vacancies} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {c.slots.map((s) => {
        const list = byPolo.get(s.polo) ?? [];
        if (!list.length) return null;
        return (
          <div key={s.polo} className="card">
            <h2>{s.polo}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Telefones</th>
                    <th>Data</th>
                    <th>Hora</th>
                    <th>Especialidade</th>
                    <th>Local</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, i) => (
                    <tr key={`${s.polo}-${i}`}>
                      <td>{p.name}</td>
                      <td>{p.phones.join(" ")}</td>
                      <td>{p.data}</td>
                      <td>{p.time}</td>
                      <td>{c.specialty}</td>
                      <td>{p.polo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-note">Resumo por horário</p>
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Pacientes Atribuidos</th>
                </tr>
              </thead>
              <tbody>
                {planDistribution(list.length, resolveTimes(s)).map((t) => (
                  <tr key={t.time}>
                    <td>{t.time}</td>
                    <td>{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
