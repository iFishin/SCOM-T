import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import type { AppendNewline, HotkeyConfig } from "../../hooks/useSettings.ts";
import { eventToShortcut } from "../../utils/shortcutUtils.ts";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";

const ENDER_OPTIONS: { label: string; value: AppendNewline }[] = [
  { label: "无", value: "" },
  { label: "CRLF", value: "\r\n" },
  { label: "LF", value: "\n" },
  { label: "CR", value: "\r" },
];

const BUILTIN_ACTIONS = [
  { label: "清除日志", value: "clear_log" },
  { label: "清除已发送", value: "clear_sent" },
  { label: "清除已接收", value: "clear_received" },
  { label: "刷新设备列表", value: "refresh_ports" },
  { label: "关闭端口", value: "close_port" },
  { label: "切换HEX模式", value: "toggle_hex" },
];

function newHotkey(): HotkeyConfig {
  return {
    id: `hotkey-${Date.now()}`,
    label: "New",
    command: "",
    sendMode: "ascii",
    appendNewline: "",
    actionType: "command",
    builtinAction: undefined,
  };
}

export function HotkeysEditor({ hotkeys, onHotkeysChange, lang }: { hotkeys: HotkeyConfig[]; onHotkeysChange: (h: HotkeyConfig[]) => void; lang: Lang }) {
  const [capturingId, setCapturingId] = useState<string | null>(null);

  function updateHotkey(id: string, patch: Partial<HotkeyConfig>) {
    onHotkeysChange(hotkeys.map((hotkey) => (hotkey.id === id ? { ...hotkey, ...patch } : hotkey)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">指令热键</div>
          <div className="text-xs text-[var(--text-muted)]">快捷键支持 Ctrl/Alt + 任意键，输入框中也会全局触发。</div>
        </div>
        <Button
          type="button"
          onClick={() => onHotkeysChange([...hotkeys, newHotkey()])}
          className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus size={13} />
          新增
        </Button>
      </div>

            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <div className="grid grid-cols-[32px_90px_minmax(140px,1fr)_68px_60px_60px_100px_52px] gap-1 border-b border-[var(--border)] bg-[var(--bg-input)] px-2 py-2 text-center text-[11px] font-semibold text-[var(--text-muted)]">
          <div>#</div>
          <div>标签</div>
          <div>串口指令 / 内置</div>
          <div>类型</div>
          <div>模式</div>
          <div>结尾符</div>
          <div>快捷键</div>
          <div>操作</div>
        </div>
        {hotkeys.map((hotkey, index) => (
            <div key={hotkey.id} className="grid grid-cols-[32px_90px_minmax(140px,1fr)_68px_60px_60px_100px_52px] items-center gap-1 border-b border-[var(--border)] px-2 py-1.5 last:border-b-0">
            <div className="text-center text-xs text-[var(--text-muted)]">{index + 1}</div>
            <input
              value={hotkey.label}
              onChange={(event) => updateHotkey(hotkey.id, { label: event.currentTarget.value })}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
            />
              <div className="w-full">
                {hotkey.actionType === "builtin" ? (
                  <select
                    value={hotkey.builtinAction || ""}
                    onChange={(event) => updateHotkey(hotkey.id, { builtinAction: event.currentTarget.value })}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">选择内置</option>
                    {BUILTIN_ACTIONS.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={hotkey.command}
                    onChange={(event) => updateHotkey(hotkey.id, { command: event.currentTarget.value })}
                    placeholder="例如 AT 或 A0 B1"
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 font-mono text-xs outline-none focus:border-[var(--accent)]"
                  />
                )}
              </div>

              <div>
                <select
                  value={hotkey.actionType || "command"}
                  onChange={(event) => updateHotkey(hotkey.id, { actionType: event.currentTarget.value as any })}
                  className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-1 py-1 text-xs outline-none focus:border-[var(--accent)]"
                >
                  <option value="command">命令</option>
                  <option value="builtin">内置</option>
                </select>
              </div>

              <select
                value={hotkey.sendMode}
                onChange={(event) => updateHotkey(hotkey.id, { sendMode: event.currentTarget.value as HotkeyConfig["sendMode"] })}
                className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-1 py-1 text-xs outline-none focus:border-[var(--accent)]"
                disabled={hotkey.actionType === "builtin"}
              >
                <option value="ascii">ASCII</option>
                <option value="hex">HEX</option>
              </select>
              <select
                value={hotkey.appendNewline}
                onChange={(event) => updateHotkey(hotkey.id, { appendNewline: event.currentTarget.value as AppendNewline })}
                className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-1 py-1 text-xs outline-none focus:border-[var(--accent)]"
                disabled={hotkey.actionType === "builtin"}
              >
                {ENDER_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            <Button
              type="button"
              onKeyDown={(event) => {
                if (capturingId !== hotkey.id) return;
                const shortcut = eventToShortcut(event);
                event.preventDefault();
                event.stopPropagation();
                if (shortcut) {
                  updateHotkey(hotkey.id, { shortcut });
                  setCapturingId(null);
                }
              }}
              onClick={() => setCapturingId(hotkey.id)}
              className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
            >
              {capturingId === hotkey.id ? t("hotkey_press", lang) : hotkey.shortcut || t("hotkey_click_set", lang)}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (window.confirm(`${t("hotkey_delete_confirm", lang)} ${hotkey.label}？`)) {
                  onHotkeysChange(hotkeys.filter((item) => item.id !== hotkey.id));
                }
              }}
              className="mx-auto flex h-8 w-8 items-center justify-center rounded text-[var(--text-muted)] hover:bg-rose-500 hover:text-white"
              title="删除"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
