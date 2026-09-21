import { prisma } from "@/lib/prisma";
import { POLOS_BY_SPECIALTY } from "@/lib/constants";
import { selectForCampaign } from "@/lib/select";
import { err } from "@/lib/http";
import { CampaignCreateBody } from "@/lib/schemas";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return err("nome, especialidade e data (AAAA-MM-DD) são obrigatórios");
  }
  const parsed = CampaignCreateBody.safeParse(raw);
  if (!parsed.success) return err("nome, especialidade e data (AAAA-MM-DD) são obrigatórios");
  const body = parsed.data;
  const { name, specialty, date } = body;
  if (!name || !specialty || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return err("nome, especialidade e data (AAAA-MM-DD) são obrigatórios");
  const slots = [];
  for (const polo of POLOS_BY_SPECIALTY[specialty] ?? []) {
    const in_ = body.polos?.[polo];
    const vacancies = in_?.vacancies ?? 0;
    if (!vacancies) continue;
    const times = (in_?.times ?? [])
      .filter((t) => /^\d{2}:\d{2}$/.test(t.time))
      .map((t) => ({ time: t.time, quota: t.quota }));
    if (!times.length) return err(`${polo}: informe ao menos um horário`);
    if (times.reduce((a, t) => a + (t.quota ?? 0), 0) > vacancies)
      return err(`${polo}: cotas por horário passam das vagas (${vacancies})`);
    slots.push({ polo, vacancies, times: { create: times } });
  }
  if (!slots.length) return err("informe vagas em ao menos um polo");
  const campaign = await prisma.campaign.create({
    data: {
      name,
      specialty,
      appointmentDate: new Date(`${date}T12:00:00`),
      slots: { create: slots },
    },
  });
  await selectForCampaign(campaign.id);
  return Response.json({ id: campaign.id }, { status: 201 });
}
