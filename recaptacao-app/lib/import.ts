import * as XLSX from "xlsx";
import { prisma } from "./prisma";
import { ImportRow, POLOS } from "./schemas";

const PHONE_RE = /\(\d{2}\)\s*\d{4,5}-\d{4}/g;

const splitPhones = (raw: string) => raw.match(PHONE_RE) ?? [];
const digits = (s: string) => s.replace(/\D/g, "");

export async function importWorkbook(buf: Buffer, fileName: string) {
  const wb = XLSX.read(buf, { type: "buffer" });
  // Formato real: vale a primeira aba, independente do nome; polo vem da coluna Unidade.
  const sheet = wb.SheetNames[0] ?? "";
  const batch = await prisma.importBatch.create({
    data: { fileName, sheets: JSON.stringify([sheet]), rows: 0 },
  });
  let rows = 0;
  let ignored = 0;
  let next = (await prisma.patient.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
  if (sheet) {
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], {
      defval: "",
    });
    for (const r of data) {
      const row = ImportRow.parse(r);
      const polo = String(row.Unidade ?? "");
      if (!POLOS.some((p) => p === polo)) {
        ignored++;
        continue;
      }
      const phones = splitPhones(String(row.Telefone ?? ""));
      const name = String(row.Paciente ?? "").trim();
      const first = phones[0];
      if (!first || !name) {
        ignored++;
        continue;
      }
      const patient = {
        name,
        phones: JSON.stringify(phones),
        polo,
        specialty: String(row.Especialidade ?? ""),
        status: String(row.Situação ?? ""),
        observation: String(row.Observação ?? "") || null,
        batchId: batch.id,
      };
      await prisma.patient.upsert({
        where: { primaryPhone: digits(first) },
        update: patient,
        create: { ...patient, primaryPhone: digits(first), seq: ++next },
      });
      rows++;
    }
  }
  await prisma.importBatch.update({ where: { id: batch.id }, data: { rows } });
  return { rows, ignored };
}
