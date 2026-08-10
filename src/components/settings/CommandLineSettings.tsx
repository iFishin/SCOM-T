import { useState } from "react";
import { Plus, Trash2, ListChecks } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { Lang } from "../../i18n.ts";
import type { CustomEnder } from "../../hooks/useSettings.ts";
import { parseHexString, bytesToHex } from "../../utils/hexConverter.ts";

type CommandLineSettingsProps = {
  lang: Lang;
  customEnders: CustomEnder[];
  onCustomEndersChange: (list: CustomEnder[]) => void;
};

/** 去掉空白并转大写，作为存储规范。 */
function normalizeHex(hex: string): string {
  return hex.replace(/\s+/g, "").toUpperCase();
}

function isValidHex(hex: string): boolean {
  const n = normalizeHex(hex);
  return n.length > 0 && n.length % 2 === 0 && /^[0-9A-F]+$/.test(n);
}

export function CommandLineSettings({ lang, customEnders, onCustomEndersChange }: CommandLineSettingsProps) {
  const [newLabel, setNewLabel] = useState("");
  const [newHex, setNewHex] = useState("");

  function addEnder() {
    if (!isValidHex(newHex)) return;
    onCustomEndersChange([
      ...customEnders,
      {
        id: `ender-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        label: newLabel.trim() || normalizeHex(newHex),
        hex: normalizeHex(newHex),
      },
    ]);
    setNewLabel("");
    setNewHex("");
  }

  function updateEnder(id: string, patch: Partial<CustomEnder>) {
    onCustomEndersChange(customEnders.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEnder(id: string) {
    onCustomEndersChange(customEnders.filter((e) => e.id !== id));
  }

  const newHexValid = newHex ? isValidHex(newHex) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-1 text-sm font-semibold flex items-center gap-1.5">
          <ListChecks size={14} />
          {lang === "zh" ? "自定义结尾符" : "Custom Terminators"}
        </div>
        <div className="text-xs text-[var(--text-muted)] mb-3">
          {lang === "zh"
            ? "以十六进制字节序列定义，会出现在发送面板、指令网格和热键的结尾符下拉框中。发送时按字节追加在命令后。"
            : "Define terminator byte sequences (hex). They appear in the Send, Command Grid and Hotkey terminator dropdowns, and are appended to the command bytes on send."}
        </div>

        {/* Add new */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.currentTarget.value)}
            placeholder={lang === "zh" ? "标签（可选）" : "Label (optional)"}
            className="w-40 text-xs"
          />
          <Input
            type="text"
            value={newHex}
            onChange={(e) => setNewHex(e.currentTarget.value)}
            placeholder="0D 0A"
            className="w-32 font-mono text-xs"
          />
          {newHexValid !== null && (
            <span className={`text-[10px] ${newHexValid ? "text-emerald-500" : "text-rose-500"}`}>
              {newHexValid
                ? bytesToHex(parseHexString(normalizeHex(newHex)))
                : lang === "zh" ? "无效 HEX" : "Invalid HEX"}
            </span>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={addEnder}
            disabled={!isValidHex(newHex)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs"
          >
            <Plus size={13} />
            {lang === "zh" ? "添加" : "Add"}
          </Button>
        </div>

        {/* List */}
        <div className="mt-3 space-y-2">
          {customEnders.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] text-center py-4 border border-dashed border-[var(--border)] rounded-lg">
              {lang === "zh" ? "暂无自定义结尾符" : "No custom terminators yet"}
            </div>
          ) : (
            customEnders.map((e) => {
              const valid = isValidHex(e.hex);
              let preview = "";
              try {
                preview = bytesToHex(parseHexString(e.hex));
              } catch {
                /* invalid hex — leave preview empty */
              }
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
                  <Input
                    type="text"
                    value={e.label}
                    onChange={(ev) => updateEnder(e.id, { label: ev.currentTarget.value })}
                    placeholder={lang === "zh" ? "标签" : "Label"}
                    className="w-40 text-xs"
                  />
                  <Input
                    type="text"
                    value={e.hex}
                    onChange={(ev) => updateEnder(e.id, { hex: ev.currentTarget.value })}
                    className={`w-32 font-mono text-xs ${valid ? "" : "border-rose-500 text-rose-500"}`}
                  />
                  <span className={`text-[10px] font-mono ${valid ? "text-[var(--text-muted)]" : "text-rose-500"}`}>
                    {valid ? preview : lang === "zh" ? "无效 HEX" : "Invalid"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEnder(e.id)}
                    className="text-rose-500 hover:text-rose-600 p-1"
                    title={lang === "zh" ? "删除" : "Delete"}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
