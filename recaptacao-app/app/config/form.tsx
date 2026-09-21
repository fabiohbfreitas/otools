"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { SPECS } from "@/lib/constants";
import { plus30 } from "@/lib/time";
import { ConfigSaveBody } from "@/lib/schemas";
import type { ConfigFormRow as Row } from "@/lib/schemas";

export default function ConfigForm({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const set = (id: string, patch: Partial<Row>) => {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  async function submit() {
    setError("");
    for (const r of rows)
      if (r.times.some((t) => !/^\d{2}:\d{2}$/.test(t)))
        return setError(`${r.specialty}/${r.polo}: horário inválido (use HH:MM).`);
    const checked = ConfigSaveBody.safeParse({
      rows: rows.map((r) => ({
        id: r.id,
        vacancies: r.vacancies,
        times: [...r.times].sort(),
        local: r.local,
        maps: r.maps,
      })),
    });
    if (!checked.success) return setError("dados inválidos.");
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checked.data),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? "erro ao salvar");
    setSaved(true);
    router.refresh();
  }

  return (
    <>
      {SPECS.map((spec) => (
        <section key={spec}>
          <h2>{spec}</h2>
          <div className="cards">
            {rows
              .filter((r) => r.specialty === spec)
              .map((r) => (
                <div key={r.id} className="card">
                  <h3>{r.polo}</h3>
                  <Field label="Vagas/dia">
                    <input
                      type="number"
                      min={0}
                      value={r.vacancies}
                      onChange={(e) =>
                        set(r.id, { vacancies: Math.max(0, parseInt(e.target.value) || 0) })
                      }
                    />
                  </Field>
                  <span className="field-label">Horários</span>
                  <div className="time-list">
                    {r.times.map((t, i) => (
                      <div key={i} className="time-row">
                        <input
                          type="time"
                          value={t}
                          onChange={(e) => {
                            const times = [...r.times];
                            times[i] = e.target.value;
                            set(r.id, { times: times.sort() });
                          }}
                        />
                        <button
                          type="button"
                          className="btn-danger-ghost btn-icon"
                          onClick={() => set(r.id, { times: r.times.filter((_, j) => j !== i) })}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <p>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() =>
                        set(r.id, {
                          times: [...r.times, plus30(r.times[r.times.length - 1] ?? "")].sort(),
                        })
                      }
                    >
                      + horário
                    </button>
                  </p>
                  <Field label="Local (endereço)">
                    <input
                      type="text"
                      value={r.local}
                      style={{ width: "100%" }}
                      onChange={(e) => set(r.id, { local: e.target.value })}
                    />
                  </Field>
                  <Field label="Link Maps">
                    <input
                      type="text"
                      value={r.maps}
                      style={{ width: "100%" }}
                      onChange={(e) => set(r.id, { maps: e.target.value })}
                    />
                  </Field>
                </div>
              ))}
          </div>
        </section>
      ))}
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="ok">Salvo.</Alert>}
      <div className="sticky-bar">
        <span>Padrão usado ao criar recaptções</span>
        <Button type="button" onClick={submit}>
          Salvar
        </Button>
      </div>
    </>
  );
}
