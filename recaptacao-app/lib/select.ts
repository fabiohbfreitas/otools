import { prisma } from "./prisma";
import { APT_STATUSES } from "./constants";

export async function selectForCampaign(id: string) {
  const camp = await prisma.campaign.findUnique({
    where: { id },
    include: { slots: true, patients: { select: { patientId: true, polo: true } } },
  });
  if (!camp) return;
  // Paciente selecionado uma vez não volta a ficar apto em nenhuma outra recaptção.
  const taken = new Set(
    (await prisma.campaignPatient.findMany({ select: { patientId: true } })).map(
      (p) => p.patientId,
    ),
  );
  for (const slot of camp.slots) {
    const inPolo = camp.patients.filter((p) => p.polo === slot.polo).length;
    const need = slot.vacancies - inPolo;
    if (need <= 0) continue;
    // notIn com milhares de ids estoura o limite de parâmetros (P2029): filtra em memória.
    const cands = (
      await prisma.patient.findMany({
        where: { specialty: camp.specialty, polo: slot.polo, status: { in: APT_STATUSES } },
        orderBy: { seq: "asc" },
        select: { id: true },
      })
    )
      .map((p) => p.id)
      .filter((pid) => !taken.has(pid))
      .slice(0, need)
      .map((pid) => ({ id: pid }));
    if (!cands.length) continue;
    await prisma.campaignPatient.createMany({
      data: cands.map((p) => ({ campaignId: id, patientId: p.id, polo: slot.polo })),
    });
    cands.forEach((p) => taken.add(p.id));
  }
}
