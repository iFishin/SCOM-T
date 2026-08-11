import { X, Keyboard } from "lucide-react";
import type { Lang } from "../i18n.ts";
import type { HotkeyConfig } from "../hooks/useSettings.ts";

type ShortcutsDialogProps = {
  open: boolean;
  lang: Lang;
  hotkeys: HotkeyConfig[];
  onClose: () => void;
};

/** 内置全局快捷键（不依赖用户指令热键）。 */
const BUILTIN_SHORTCUTS: { zh: string; en: string; shortcut: string }[] = [
  { zh: "执行指令热键（在任意输入框也生效）", en: "Run command hotkey (works in inputs too)", shortcut: "Ctrl / Alt + ↑ 或 ↓ 选择热键" },
  { zh: "命令发送框内换行", en: "Insert newline in send box", shortcut: "Shift + Enter / Alt + Enter" },
  { zh: "发送命令（聚焦发送框时）", en: "Send command (send box focused)", shortcut: "Enter" },
  { zh: "日志框全选", en: "Select all log", shortcut: "Ctrl + A" },
  { zh: "在批量编辑器中搜索", en: "Search in batch editor", shortcut: "Ctrl + F" },
  { zh: "批量编辑器撤销", en: "Undo in batch editor", shortcut: "Ctrl + Z" },
  { zh: "批量编辑器重做", en: "Redo in batch editor", shortcut: "Ctrl + Y" },
];

export function ShortcutsDialog({ open, lang, hotkeys, onClose }: ShortcutsDialogProps) {
  if (!open) return null;

  // 用户指令热键里，仅显示配了快捷键的条目
  const userHotkeys = hotkeys.filter((h) => h.shortcut);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Keyboard size={15} className="text-[var(--text-muted)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {lang === "zh" ? "快捷键" : "Shortcuts"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">
          {/* 内置快捷键 */}
          <div>
            <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              {lang === "zh" ? "内置快捷键" : "Built-in Shortcuts"}
            </div>
            <table className="w-full text-xs">
              <tbody>
                {BUILTIN_SHORTCUTS.map((s, i) => (
                  <tr key={i} className="border-t border-[var(--border)]/50 first:border-t-0">
                    <td className="py-1.5 pr-3 text-[var(--text-muted)]">
                      {lang === "zh" ? s.zh : s.en}
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      <kbd className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">
                        {s.shortcut}
                      </kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 用户指令热键 */}
          <div>
            <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              {lang === "zh" ? "指令热键" : "Command Hotkeys"}
            </div>
            {userHotkeys.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                {lang === "zh"
                  ? "暂无配置快捷键的指令热键，可在设置 → 热键中为指令配置快捷键。"
                  : "No command hotkeys with shortcuts yet. Configure them in Settings → Hotkeys."}
              </div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {userHotkeys.map((h) => (
                    <tr key={h.id} className="border-t border-[var(--border)]/50 first:border-t-0">
                      <td className="py-1.5 pr-3 text-[var(--text-primary)]">{h.label}</td>
                      <td className="py-1.5 pr-3 text-[var(--text-muted)]">{h.command}</td>
                      <td className="py-1.5 pl-3 text-right">
                        <kbd className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--accent)]">
                          {h.shortcut}
                        </kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShortcutsDialog;