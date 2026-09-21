"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Check, Field } from "@/components/ui";
import { plus30 } from "@/lib/time";
import { CampaignCreateBody } from "@/lib/schemas";
import type { PoloState } from "@/lib/schemas";

const blank: PoloState = { included: false, showQuotas: false, vacancies: 0, times: [] };

export default function Form({
  specialty,
  polos,
  defaults,
}: {
  specialty: string;
  polos: string[];
  defaults: Record<string, { vacancies: number; times: string[] }>;
}) {
  const router = useRouter();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [name, setName] = useState(`${specialty} ${tomorrow.split("-").reverse().join("/")}`);
  const [date, setDate] = useState(tomorrow);
  const [state, setState] = useState<Record<string, PoloState>>(() =>
    Object.fromEntries(
      polos.map((polo) => {
        const vacancies = defaults[polo]?.vacancies ?? 0;
        return [
          polo,
          {
            included: vacancies > 0,
            showQuotas: false,
            vacancies,
            times: (defaults[polo]?.times ?? []).map((time) => ({ time, quota: "" })),
          },
        ];
      }),
    ),
  );
  const [error, setError] = useState("");

  const cur = (polo: string): PoloState => state[polo] ?? blank;
  const set = (polo: string, patch: Partial<PoloState>) =>
    setState((s) => ({ ...s, [polo]: { ...(s[polo] ?? blank), ...patch } }));
  const explicitSum = (polo: string) =>
    (state[polo]?.times ?? []).reduce(
      (a, t) => a + (t.quota === "" ? 0 : Math.max(0, parseInt(t.quota) || 0)),
      0,
    );

  async function submit() {
    setError("");
    for (const polo of polos.filter((x) => cur(x).included)) {
      const st = cur(polo);
      if (st.showQuotas && explicitSum(polo) > st.vacancies)
        return setError(
          `${polo}: cotas por horário (${explicitSum(polo)}) passam das vagas (${st.vacancies}).`,
        );
      if (st.vacancies > 0 && !st.times.length)
        return setError(`${polo}: informe ao menos um horário.`);
      if (st.times.some((t) => !/^\d{2}:\d{2}$/.test(t.time)))
        return setError(`${polo}: horário inválido (use HH:MM).`);
    }
    const payload = {
      name,
      date,
      specialty,
      polos: Object.fromEntries(
        polos
          .filter((polo) => cur(polo).included)
          .map((polo) => {
            const st = cur(polo);
            return [
              polo,
              {
                vacancies: st.vacancies,
                times: st.times.map((t) => ({
                  time: t.time,
                  quota:
                    !st.showQuotas || t.quota === "" ? null : Math.max(0, parseInt(t.quota) || 0),
                })),
              },
            ];
          }),
      ),
    };
    const checked = CampaignCreateBody.safeParse(payload);
    if (!checked.success) return setError("dados inválidos.");
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checked.data),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? "erro ao criar");
    router.push(`/recaptacao/${body.id}`);
  }

  return (
    <>
      <h2>1. Dados</h2>
      <div className="card dados-grid">
        <Field label="Nome">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Data da consulta">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <h2>2. Disponibilidade por polo</h2>
      {polos.map((polo) => (
        <div key={polo} className="card">
          <h2>
            <input
              type="checkbox"
              checked={cur(polo).included}
              onChange={(e) => set(polo, { included: e.target.checked })}
            />{" "}
            {polo} — vagas{" "}
            <input
              type="number"
              min={0}
              disabled={!cur(polo).included}
              value={cur(polo).vacancies}
              onChange={(e) => set(polo, { vacancies: Math.max(0, parseInt(e.target.value) || 0) })}
            />{" "}
            {cur(polo).showQuotas && <>(cotas: {explicitSum(polo)})</>}
          </h2>
          {cur(polo).included && (
            <>
              <Check
                label="Cotas por horário"
                checked={cur(polo).showQuotas}
                onChange={(v) => set(polo, { showQuotas: v })}
              />
              <table>
                <thead>
                  <tr>
                    <th>Horário</th>
                    {cur(polo).showQuotas && <th>Cota (vazio = divide o resto)</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cur(polo).times.map((t, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="time"
                          value={t.time}
                          onChange={(e) => {
                            const times = [...cur(polo).times];
                            times[i] = { ...t, time: e.target.value };
                            times.sort((a, b) => a.time.localeCompare(b.time));
                            set(polo, { times });
                          }}
                        />
                      </td>
                      {cur(polo).showQuotas && (
                        <td>
                          <input
                            type="number"
                            min={0}
                            style={{ minWidth: 130 }}
                            placeholder="divide o resto"
                            value={t.quota}
                            onChange={(e) => {
                              const times = [...cur(polo).times];
                              times[i] = { ...t, quota: e.target.value };
                              set(polo, { times });
                            }}
                          />
                        </td>
                      )}
                      <td>
                        <button
                          type="button"
                          className="btn-danger-ghost btn-icon"
                          onClick={() =>
                            set(polo, { times: cur(polo).times.filter((_, j) => j !== i) })
                          }
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const times = cur(polo).times;
                  set(polo, {
                    times: [
                      ...times,
                      { time: plus30(times[times.length - 1]?.time ?? ""), quota: "" },
                    ].sort((a, b) => a.time.localeCompare(b.time)),
                  });
                }}
              >
                + horário
              </button>
            </>
          )}
        </div>
      ))}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="sticky-bar">
        <span>
          {polos.filter((x) => cur(x).included).reduce((a, x) => a + cur(x).vacancies, 0)} vagas em{" "}
          {polos.filter((x) => cur(x).included).length} polos
        </span>
        <Button type="button" onClick={submit}>
          Criar recaptção
        </Button>
      </div>
    </>
  );
}
