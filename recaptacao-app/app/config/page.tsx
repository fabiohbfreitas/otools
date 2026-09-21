import { prisma } from "@/lib/prisma";
import { POLOS_BY_SPECIALTY, SPECS, DEFAULT_VAC, DEFAULT_SLOTS } from "@/lib/constants";
import { POLO_LOCAL } from "@/lib/envios";
import { JsonStringArray } from "@/lib/schemas";
import ConfigForm from "./form";

export default async function Config() {
  const existing = await prisma.defaultConfig.findMany();
  const missing = [];
  for (const specialty of SPECS)
    for (const polo of POLOS_BY_SPECIALTY[specialty] ?? [])
      if (!existing.some((e) => e.polo === polo && e.specialty === specialty))
        missing.push({
          polo,
          specialty,
          vacancies: DEFAULT_VAC[specialty]?.[polo] ?? 0,
          timeSlots: JSON.stringify(DEFAULT_SLOTS),
          local: POLO_LOCAL[polo]?.local ?? "",
          maps: POLO_LOCAL[polo]?.maps ?? "",
        });
  if (missing.length) await prisma.defaultConfig.createMany({ data: missing });
  const rows = await prisma.defaultConfig.findMany({
    orderBy: [{ specialty: "asc" }, { polo: "asc" }],
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Configuração padrão</h1>
          <p>
            Vagas e horários por polo e especialidade — ponto de partida ao criar uma recaptção.
          </p>
        </div>
      </div>
      <ConfigForm
        initial={rows.map((r) => ({
          id: r.id,
          specialty: r.specialty,
          polo: r.polo,
          vacancies: r.vacancies,
          times: JsonStringArray.parse(r.timeSlots),
          local: r.local,
          maps: r.maps,
        }))}
      />
    </>
  );
}
