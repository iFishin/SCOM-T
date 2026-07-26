import { Plus, Trash2 } from "lucide-react";
import { Input } from "./ui/Input.tsx";
import { Checkbox } from "./ui/Checkbox.tsx";
import type { Lang } from "../i18n";
import type { PromptRow } from "../utils/yamlConfig";

type PromptConfigRowEditorProps = {
  lang: Lang;
  rows: PromptRow[];
  onChange: (rows: PromptRow[]) => void;
};

const ENDER_OPTIONS: { value: PromptRow["ender"]; label: string }[] = [
  { value: "\r\n", label: "CRLF" },
  { value: "\n", label: "LF" },
  { value: "\r", label: "CR" },
  { value: "", label: "None" },
];

export function PromptConfigRowEditor({ lang, rows, onChange }: PromptConfigRowEditorProps) {
  function updateRow(index: number, patch: Partial<PromptRow>) {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addRow() {
    const nextId = rows.length > 0 ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
    const newRow: PromptRow = { id: nextId, selected: false, command: "", isHex: false, ender: "\r\n", interval: "" };
    onChange([...rows, newRow]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          {lang === "zh" ? `指令 (${rows.length})` : `Commands (${rows.length})`}
        </span>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs bg-[var(--accent)] text-white hover:opacity-80"
        >
          <Plus size={11} />
          {lang === "zh" ? "添加指令" : "Add Command"}
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-muted)] font-mono w-5">#{i + 1}</span>
              <Input
                type="text"
                value={row.command}
                onChange={(e) => updateRow(i, { command: e.target.value })}
                placeholder={lang === "zh" ? "AT指令" : "AT Command"}
                className="flex-1 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-rose-500 hover:text-rose-600 p-1"
                title={lang === "zh" ? "删除指令" : "Delete command"}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="flex items-center gap-3 pl-7">
              <Checkbox
                checked={row.isHex}
                onChange={(e) => updateRow(i, { isHex: e.target.checked })}
                label="HEX"
                className="text-[10px]"
              />
              <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                {lang === "zh" ? "换行符" : "Ender"}
                <select
                  value={row.ender}
                  onChange={(e) => updateRow(i, { ender: e.target.value as PromptRow["ender"] })}
                  className="input text-[10px] py-0.5"
                >
                  {ENDER_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                {lang === "zh" ? "超时(ms)" : "Timeout(ms)"}
                <Input
                  type="text"
                  value={row.interval}
                  onChange={(e) => updateRow(i, { interval: e.target.value.replace(/[^0-9]/g, "") })}
                  className="w-16 text-[10px] py-0.5"
                />
              </label>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-xs text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-lg">
            {lang === "zh" ? "点击「添加指令」添加AT指令" : 'Click "Add Command" to add AT commands'}
          </div>
        )}
      </div>
    </div>
  );
}
