export const plus30 = (t: string) => {
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return "07:00";
  const mins = (parseInt(m[1]) % 24) * 60 + parseInt(m[2]) + 30;
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
};

export const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR");
