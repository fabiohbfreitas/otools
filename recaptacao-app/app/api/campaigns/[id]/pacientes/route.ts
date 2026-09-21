import { prisma } from "@/lib/prisma";
import { buildPacientesFile } from "@/lib/envios";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.campaign.findUnique({
    where: { id },
    include: {
      slots: { include: { times: true } },
      patients: {
        include: { patient: true },
        orderBy: [{ polo: "asc" }, { patient: { seq: "asc" } }],
      },
    },
  });
  if (!c) return new Response("não encontrada", { status: 404 });
  const buf = buildPacientesFile(c.appointmentDate, c.specialty, c.slots, c.patients);
  const file = `pacientes-${c.name.replace(/[^\w-]+/g, "_")}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
