import { prisma } from "@/lib/prisma";
import { POLOS_BY_SPECIALTY, SPECS } from "@/lib/constants";
import { JsonStringArray, NovaParams } from "@/lib/schemas";
import Form from "./form";

export default async function Nova({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const specialty = NovaParams.parse(await searchParams).especialidade ?? "Ortopedia";
  const defaults = await prisma.defaultConfig.findMany({
    where: { specialty },
    orderBy: { polo: "asc" },
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Nova recaptção</h1>
          <p>
            Especialidade:{" "}
            {SPECS.map((s) => (
              <span key={s}>
                {s === specialty ? (
                  <strong>{s}</strong>
                ) : (
                  <a href={`/recaptacao/nova?especialidade=${s}`}>{s}</a>
                )}{" "}
              </span>
            ))}
          </p>
        </div>
      </div>
      <Form
        specialty={specialty}
        polos={POLOS_BY_SPECIALTY[specialty] ?? []}
        defaults={Object.fromEntries(
          defaults.map((d) => [
            d.polo,
            { vacancies: d.vacancies, times: JsonStringArray.parse(d.timeSlots) },
          ]),
        )}
      />
    </>
  );
}
