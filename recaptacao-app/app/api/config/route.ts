import { prisma } from "@/lib/prisma";
import { err } from "@/lib/http";
import { ConfigSaveBody } from "@/lib/schemas";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return err("formato inválido");
  }
  const parsed = ConfigSaveBody.safeParse(raw);
  if (!parsed.success) return err("formato inválido");
  for (const r of parsed.data.rows) {
    if (!r.id) return err("linha sem id");
    const times = r.times.filter((t) => /^\d{2}:\d{2}$/.test(t));
    await prisma.defaultConfig.update({
      where: { id: r.id },
      data: {
        vacancies: r.vacancies ?? 0,
        timeSlots: JSON.stringify([...times].sort()),
        local: r.local,
        maps: r.maps,
      },
    });
  }
  return Response.json({ ok: true });
}
