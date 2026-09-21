import * as XLSX from "xlsx";
import { JsonStringArray } from "./schemas";
import type { DbPatient, Slot, SlotTime } from "./schemas";

// Endereços padrão (editáveis na Config por polo/especialidade).
export const POLO_LOCAL: Record<string, { local: string; maps: string }> = {
  Sobradinho: {
    local:
      "Centro Clínico Sobradinho - Q 8 ao lado do Hospital Regional de Sobradinho - Sobradinho, Brasília - DF, 73005-080",
    maps: "https://maps.app.goo.gl/bwhpSzdVEsBn3bDb9",
  },
  Gama: {
    local:
      "Centro de Imagens do Gama - Quadra 10 Lote 16/17 Setor Lojas 1 e 2 - Gama Oeste, Brasília - DF, 72425-132",
    maps: "https://maps.app.goo.gl/tpu3EdUojQnr8HS56?g_st=ic",
  },
  Samambaia: {
    local:
      "Clinica Multi Medici -  Qs 122 conjunto 03 lote 12,13,14 Edifício Cardio Medici - Samambaia, Brasília - DF, 72304-523",
    maps: "https://maps.app.goo.gl/pXGfqqUN1TACkwsd7",
  },
};

export const agendaTag = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = String(h).padStart(2, "0");
  return m ? `Agenda${hh}h${String(m).padStart(2, "0")}` : `Agenda${hh}h`;
};

export function resolveTimes(slot: Slot): SlotTime[] {
  const times = (slot.times?.length ? slot.times : [{ time: "07:00", quota: null }]).sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  return times.map((t) => ({ time: t.time, quota: t.quota ?? null }));
}

// Distribuição: cotas explícitas primeiro (em ordem); o resto em blocos iguais entre os sem cota (último com menos).
export function planDistribution(count: number, times: SlotTime[]) {
  const plan: { time: string; count: number }[] = [];
  let assigned = 0;
  for (const t of times.filter((t) => t.quota != null)) {
    const take = Math.min(Math.max(t.quota ?? 0, 0), count - assigned);
    plan.push({ time: t.time, count: take });
    assigned += take;
  }
  const undef = times.filter((t) => t.quota == null);
  const per = undef.length ? Math.ceil((count - assigned) / undef.length) : 0;
  for (const t of undef) {
    const take = Math.min(per, count - assigned);
    plan.push({ time: t.time, count: take });
    assigned += take;
  }
  return plan.sort((a, b) => a.time.localeCompare(b.time));
}

// Tudo sai como texto: nada de serial numérico de data/hora.
function textSheet(aoa: string[][]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const k of Object.keys(ws)) {
    if (k[0] === "!") continue;
    // Fronteira da lib xlsx: célula tipada sem casts espalhados.
    const c: { t?: string; v?: unknown } = ws[k];
    if (c && typeof c === "object") {
      c.t = "s";
      c.v = String(c.v ?? "");
    }
  }
  return ws;
}

export function assignRows(
  appointmentDate: Date,
  specialty: string,
  slots: Slot[],
  patients: { polo: string; patient: DbPatient }[],
) {
  const y = appointmentDate.getFullYear();
  const mo = appointmentDate.getMonth();
  const d = appointmentDate.getDate();
  const data = `${String(d).padStart(2, "0")}/${String(mo + 1).padStart(2, "0")}/${y}`;
  const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const timesByPolo: Record<string, SlotTime[]> = Object.fromEntries(
    slots.map((s) => [s.polo, resolveTimes(s)]),
  );
  const idxByPolo: Record<string, number> = {};
  const flatByPolo: Record<string, string[]> = {};
  const totalByPolo: Record<string, number> = {};
  for (const { polo } of patients) totalByPolo[polo] = (totalByPolo[polo] ?? 0) + 1;
  return patients.map(({ polo, patient }) => {
    const phones = JsonStringArray.parse(patient.phones);
    let flat = flatByPolo[polo];
    if (!flat) {
      flat = flatByPolo[polo] = planDistribution(
        totalByPolo[polo] ?? 0,
        timesByPolo[polo] ?? [],
      ).flatMap((p) => Array(p.count).fill(p.time));
    }
    const time = flat[Math.min(idxByPolo[polo] ?? 0, flat.length - 1)] ?? "07:00";
    idxByPolo[polo] = (idxByPolo[polo] ?? 0) + 1;
    return {
      polo,
      data,
      time,
      name: patient.name,
      phone: phones[0] ?? "",
      phones,
      notas: phones.length > 1 ? `Outros Telefones: ${phones.slice(1).join(" ")}` : "",
      etiqueta: `${iso}, Automação, ${specialty}, ${polo}, ${agendaTag(time)}`,
    };
  });
}

function baseRows(
  appointmentDate: Date,
  specialty: string,
  slots: Slot[],
  patients: { polo: string; patient: DbPatient }[],
) {
  return assignRows(appointmentDate, specialty, slots, patients);
}

export function buildEnviosFile(
  appointmentDate: Date,
  specialty: string,
  slots: Slot[],
  patients: { polo: string; patient: DbPatient }[],
  addr: Record<string, { local: string; maps: string }> = {},
): Buffer {
  const rows = baseRows(appointmentDate, specialty, slots, patients);
  const aoa: string[][] = [
    [
      "Nome",
      "Telefone",
      "Notas Internas",
      "Etiquetas",
      "Data",
      "Hora",
      "Especialidade",
      "Local",
      "LinkMaps",
    ],
    ...rows.map((r) => [
      r.name,
      r.phone,
      r.notas,
      r.etiqueta,
      r.data,
      r.time,
      specialty,
      addr[r.polo]?.local || POLO_LOCAL[r.polo]?.local || r.polo,
      addr[r.polo]?.maps || POLO_LOCAL[r.polo]?.maps || "",
    ]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, textSheet(aoa), "Envios");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function buildPacientesFile(
  appointmentDate: Date,
  specialty: string,
  slots: Slot[],
  patients: { polo: string; patient: DbPatient }[],
): Buffer {
  const rows = baseRows(appointmentDate, specialty, slots, patients);
  const aoa: string[][] = [
    ["Nome", "Telefone", "Notas Internas", "Data", "Hora", "Especialidade", "Local"],
    ...rows.map((r) => [r.name, r.phone, r.notas, r.data, r.time, specialty, r.polo]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, textSheet(aoa), "Pacientes");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
