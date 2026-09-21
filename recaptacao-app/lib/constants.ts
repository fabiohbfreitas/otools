export const POLOS_BY_SPECIALTY: Record<string, string[]> = {
  Ortopedia: ["Gama", "Samambaia", "Sobradinho"],
  Cardiologia: ["Samambaia", "Sobradinho"],
};
import { POLOS, SPECIALTIES, APT_STATUSES as APT } from "./schemas";

export { POLOS, SPECIALTIES };
export const APT_STATUSES: string[] = [...APT];
export const SPECS: string[] = [...SPECIALTIES];
export const DEFAULT_VAC: Record<string, Record<string, number>> = {
  Ortopedia: { Gama: 70, Sobradinho: 70, Samambaia: 140 },
  Cardiologia: { Samambaia: 60, Sobradinho: 40 },
};
export const DEFAULT_SLOTS = Array.from(
  { length: 12 },
  (_, i) => `${String(i + 7).padStart(2, "0")}:00`,
);
