import { z } from "zod";

// Listas canônicas — fonte da verdade (lib/constants.ts reutiliza).
export const POLOS = ["Gama", "Samambaia", "Sobradinho"] as const;
export const SPECIALTIES = ["Ortopedia", "Cardiologia"] as const;
export const APT_STATUSES = ["Falta", "Pendente"] as const;

export const Polo = z.enum(POLOS);
export const Specialty = z.enum(SPECIALTIES);
export type Polo = z.infer<typeof Polo>;
export type Specialty = z.infer<typeof Specialty>;

export const TimeHHMM = z.string().regex(/^\d{2}:\d{2}$/);

// Coluna texto com JSON (telefones, abas, horários): nunca joga, volta [] se inválido.
const jsonStrings = (v: unknown): string[] => {
  if (typeof v !== "string") return [];
  try {
    const p: unknown = JSON.parse(v);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
};
export const JsonStringArray = z.unknown().transform(jsonStrings);

// Formas vindas do Prisma (só leitura; colunas extras do banco passam direto).
export const SlotTime = z.object({ time: z.string(), quota: z.number().nullable() });
export type SlotTime = z.infer<typeof SlotTime>;
export const Slot = z.object({ polo: z.string(), times: z.array(SlotTime).optional() });
export type Slot = z.infer<typeof Slot>;
export const DbPatient = z.object({
  name: z.string(),
  phones: z.string(),
  specialty: z.string(),
  status: z.string(),
});
export type DbPatient = z.infer<typeof DbPatient>;

// ---- Fronteiras de escrita (coerções iguais às manuais de antes) ----
const textIn = z.unknown().transform((v) => String(v ?? ""));
const trimmedIn = z.unknown().transform((v) => String(v ?? "").trim());
const vacanciesIn = z.unknown().transform((v) => Math.max(0, Math.floor(Number(v) || 0)));
const quotaIn = z
  .unknown()
  .transform((v) => (v == null ? null : Math.max(0, Math.floor(Number(v)))));

export const CampaignCreateBody = z.object({
  name: trimmedIn,
  date: textIn,
  specialty: textIn,
  polos: z
    .record(
      z.string(),
      z.object({
        vacancies: vacanciesIn.optional(),
        times: z.array(z.object({ time: textIn, quota: quotaIn })).optional(),
      }),
    )
    .optional(),
});
export type CampaignCreateBody = z.infer<typeof CampaignCreateBody>;

export const ConfigRowBody = z.object({
  id: textIn.default(""),
  vacancies: vacanciesIn.optional(),
  times: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.map(String) : []))
    .default([]),
  local: trimmedIn.default(""),
  maps: trimmedIn.default(""),
});
export const ConfigSaveBody = z.object({ rows: z.array(ConfigRowBody) });
export type ConfigSaveBody = z.infer<typeof ConfigSaveBody>;

// ---- Importação (uma linha do xlsx; colunas ausentes viram undefined) ----
const col = z.unknown().optional();
export const ImportRow = z.looseObject({
  Telefone: col,
  Paciente: col,
  Unidade: col,
  Especialidade: col,
  Situação: col,
  Observação: col,
});

// ---- Login (credenciais via env, conferidas em lib/auth) ----
export const LoginBody = z.object({ user: textIn, pass: textIn });

// ---- Query strings (valores podem vir string|string[]|undefined) ----
const single = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""));
const qp = z.unknown().transform(single).optional();

export const PacientesParams = z.object({
  polo: qp,
  especialidade: qp,
  situacao: qp,
  q: qp,
  importados: qp,
  ignorados: qp,
  sel: qp,
  pag: z
    .unknown()
    .optional()
    .transform((v) => {
      const n = parseInt(single(v), 10);
      return Number.isFinite(n) ? n : 1;
    }),
});
export type PacientesParams = z.infer<typeof PacientesParams>;

export const NovaParams = z.object({ especialidade: qp });

// ---- Estado dos forms cliente (tipos via infer; payload validado no submit) ----
export const TimeRowState = z.object({ time: z.string(), quota: z.string() });
export type TimeRow = z.infer<typeof TimeRowState>;
export const PoloFormState = z.object({
  included: z.boolean(),
  showQuotas: z.boolean(),
  vacancies: z.number(),
  times: z.array(TimeRowState),
});
export type PoloState = z.infer<typeof PoloFormState>;

export const ConfigFormRow = z.object({
  id: z.string(),
  specialty: z.string(),
  polo: z.string(),
  vacancies: z.number(),
  times: z.array(z.string()),
  local: z.string(),
  maps: z.string(),
});
export type ConfigFormRow = z.infer<typeof ConfigFormRow>;
