import { fakerPT_BR as faker } from "@faker-js/faker";
import XLSX from "xlsx";

const [, , aOrto = "1600", aCardio = "400", aSeed = "42", aOut = "dataset"] = process.argv;
faker.seed(Number(aSeed));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const unidades = ["Gama", "Samambaia", "Sobradinho"];
const obs = ["Retorno", "Primeira consulta", "Encaixe", "Remarcado 1x", "Paciente pediu manhã", ""];

const quotas = {
  Ortopedia: { Gama: 70, Sobradinho: 70, Samambaia: 140 },
  Cardiologia: { Samambaia: 60, Sobradinho: 40 },
};
const total = { Ortopedia: Number(aOrto), Cardiologia: Number(aCardio) };
const perDay = (esp) => Object.values(quotas[esp]).reduce((a, b) => a + b, 0);
const nDays = Math.max(
  Math.ceil(total.Ortopedia / perDay("Ortopedia")),
  Math.ceil(total.Cardiologia / perDay("Cardiologia")),
);

const days = [];
for (
  let d = new Date(new Date().setDate(new Date().getDate() - 1));
  days.length < nDays;
  d.setDate(d.getDate() - 1)
)
  if (d.getDay() % 6) days.unshift(new Date(d));

const mk = (Especialidade, Unidade, Data) => ({
  Paciente: faker.person.fullName(),
  Telefone:
    Math.random() < 1 / 3
      ? Array.from(
          { length: faker.number.int({ min: 2, max: 4 }) },
          () => `(61) 9${faker.string.numeric(4)}-${faker.string.numeric(4)}`,
        ).join(" ")
      : `(61) 9${faker.string.numeric(4)}-${faker.string.numeric(4)}`,
  Data,
  Horário: `${String(faker.number.int({ min: 7, max: 18 })).padStart(2, "0")}:${pick(["00", "15", "30", "45"])}`,
  Unidade,
  Especialidade,
  Situação: Math.random() < 0.7 ? "Pendente" : "Falta",
  Observação: Math.random() < 0.8 ? "" : pick(obs),
});

const rows = [];
const rest = { ...total };
for (const d of days) {
  const data = d.toLocaleDateString("pt-BR");
  for (const esp of ["Ortopedia", "Cardiologia"])
    for (const [u, q] of Object.entries(quotas[esp])) {
      const n = Math.min(q, rest[esp]);
      rest[esp] -= n;
      for (let i = 0; i < n; i++) rows.push(mk(esp, u, data));
    }
}

const base = aOut.endsWith(".xlsx") ? aOut.slice(0, -5) : aOut;

const byPolo = (u) =>
  rows.filter((x) => x.Unidade === u).sort((a, b) => a.Horário.localeCompare(b.Horário));
const write = (name, r) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r), "Dados");
  XLSX.writeFile(wb, name);
  return name;
};
const files = [
  ...unidades.map((u) => write(`${base}-${u.toLowerCase()}.xlsx`, byPolo(u))),
  write(`${base}-todos.xlsx`, rows),
];
console.log(
  `OK: ${rows.length} registros (${rows.filter((r) => r.Especialidade === "Ortopedia").length} orto / ${rows.filter((r) => r.Especialidade === "Cardiologia").length} cardio) -> ${files.join(", ")}`,
);
