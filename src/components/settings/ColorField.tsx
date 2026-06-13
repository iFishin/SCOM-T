import React from "react";

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid grid-cols-[92px_36px_1fr] items-center gap-2 text-xs text-[var(--text-primary)]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-7 w-9 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}
