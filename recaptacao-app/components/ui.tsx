"use client";

import {
  Button as BaseButton,
  Checkbox as BaseCheckbox,
  Input as BaseInput,
  Select as BaseSelect,
} from "@base-ui/react";
import type { ComponentProps, ReactNode } from "react";

export function Button(props: ComponentProps<typeof BaseButton>) {
  return <BaseButton {...props} />;
}

export function TextInput(props: ComponentProps<typeof BaseInput>) {
  return <BaseInput {...props} />;
}

export function Check(props: {
  name?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="check">
      <BaseCheckbox.Root
        name={props.name}
        defaultChecked={props.defaultChecked}
        checked={props.checked}
        onCheckedChange={props.onChange}
        className="check-box"
      >
        <BaseCheckbox.Indicator className="check-mark" />
      </BaseCheckbox.Root>
      {props.label}
    </label>
  );
}

export function Picker(props: {
  name: string;
  label: string;
  value?: string;
  options: [string, string][];
}) {
  return (
    <label className="picker">
      {props.label}
      <BaseSelect.Root name={props.name} defaultValue={props.value || null}>
        <BaseSelect.Trigger className="picker-trigger">
          <BaseSelect.Value>
            {(v: string | null) => (v ? (Object.fromEntries(props.options)[v] ?? v) : "Todas")}
          </BaseSelect.Value>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner>
            <BaseSelect.Popup className="picker-popup">
              {props.options.map(([v, t]) => (
                <BaseSelect.Item key={v} value={v} className="picker-item">
                  <BaseSelect.ItemText>{t}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </label>
  );
}

export function Badge({ tone, children }: { tone?: "info" | "ok"; children: ReactNode }) {
  return <span className={"badge" + (tone ? ` badge-${tone}` : "")}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Alert({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  return <p className={`alert alert-${tone}`}>{children}</p>;
}

export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
      {children}
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <span className="stat-num">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (100 * value) / max) : 0;
  return (
    <div className="progress">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
