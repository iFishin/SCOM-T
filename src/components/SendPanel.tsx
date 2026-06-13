import React from "react";
// Hotkeys/Files refactor applied: layout extracted to separate components
import { Send, Maximize2, Minimize2 } from "lucide-react";
import { parseHexString, bytesToHex, bytesToAscii } from "../utils/hexConverter.ts";
import type { ToastType } from "./Toast.tsx";
import type { ReceiveMode, SendMode } from "../hooks/useSerialPort.ts";
import type { HotkeyConfig } from "../hooks/useSettings.ts";
import { useHotkeys } from "../hooks/useHotkeys.ts";
import { FileSend } from "./FileSend.tsx";
import { HotkeysPanel } from "./HotkeysPanel.tsx";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";

type AppendNewline = "" | "\r\n" | "\r" | "\n";

type SendPanelProps = {
  value: string;
  sendMode: SendMode;
  receiveMode: ReceiveMode;
  appendNewline: AppendNewline;
  isConnected: boolean;
  isBusy: boolean;
  hotkeys: HotkeyConfig[];
  filePath: string;
  fileSendProgress: number | null;
  lang: Lang;
  onChange: (value: string) => void;
  onSendModeChange: (mode: SendMode) => void;
  onReceiveModeChange: (mode: ReceiveMode) => void;
  onAppendNewlineChange: (value: AppendNewline) => void;
  onSend: () => Promise<void>;
  onClearSent: () => void;
  onFileSelect: () => void;
  onFileSend: () => Promise<void>;
  onHotkeySend: (hotkey: HotkeyConfig) => void;
  onPushToast: (text: string, type?: ToastType) => void;
};

const sel =
  "rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]";

export function SendPanel({
  value,
  sendMode,
  receiveMode,
  appendNewline,
  isConnected,
  isBusy,
  hotkeys,
  filePath,
  fileSendProgress,
  lang,
  onChange,
  onSendModeChange,
  onReceiveModeChange,
  onAppendNewlineChange,
  onSend,
  onFileSelect,
  onFileSend,
  onHotkeySend,
  onPushToast,
}: SendPanelProps) {
  const [expanded, setExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  function toggleExpanded() {
    setExpanded((s) => !s);
    // focus will be handled by the ref when element exists
  }
  
  

  const enderOptions = [
    { label: t("ender_crlf", lang), value: "\r\n" as AppendNewline },
    { label: t("ender_none", lang), value: "" as AppendNewline },
    { label: t("ender_lf", lang), value: "\n" as AppendNewline },
    { label: t("ender_cr", lang), value: "\r" as AppendNewline },
  ];

  

  function handleSend() {
    if (!isConnected) { onPushToast(t("toast_not_connected", lang), "warn"); return; }
    void onSend();
  }
  useHotkeys(hotkeys, isConnected, onHotkeySend);

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;

    const isInsertNewline = e.shiftKey || e.altKey;

    if (isInsertNewline) {
      // Insert newline: if not expanded, expand and insert; otherwise insert at caret
      const el = inputRef.current as HTMLInputElement | HTMLTextAreaElement | null;
      const pos = el && "selectionStart" in el ? (el.selectionStart ?? value.length) : value.length;
      const newValue = `${value.slice(0, pos)}\n${value.slice(pos)}`;
      onChange(newValue);
      if (!expanded) {
        setExpanded(true);
        // focus later to textarea and set caret
        setTimeout(() => {
          const ta = inputRef.current as HTMLTextAreaElement | null;
          if (ta) {
            ta.focus();
            ta.selectionStart = ta.selectionEnd = pos + 1;
          }
        }, 0);
      } else {
        // already expanded, restore caret position
        setTimeout(() => {
          const ta = inputRef.current as HTMLTextAreaElement | null;
          if (ta) {
            ta.selectionStart = ta.selectionEnd = pos + 1;
          }
        }, 0);
      }

      e.preventDefault();
      return;
    }

    if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {/* Send command */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-2">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {t("send", lang)}
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1">
            {expanded ? (
              <textarea
                ref={(el) => { inputRef.current = el; }}
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={sendMode === "hex" ? t("send_hex_placeholder", lang) : t("send_placeholder", lang)}
                rows={4}
                className={`w-full resize-y rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]`}
              />
            ) : (
              <input
                ref={(el) => { inputRef.current = el; }}
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={sendMode === "hex" ? t("send_hex_placeholder", lang) : t("send_placeholder", lang)}
                className={`w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]`}
              />
            )}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex gap-1 items-center">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const bytes = new TextEncoder().encode(value || "");
                      onChange(bytesToHex(bytes));
                    } catch (err: any) {
                      onPushToast?.(err?.message || String(err), "warn");
                    }
                  }}
                  className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                >
                  {lang === "zh" ? "ASCII→HEX" : "ASCII→HEX"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const bytes = parseHexString(value || "");
                      onChange(bytesToAscii(bytes));
                    } catch (err: any) {
                      onPushToast?.(err?.message || String(err), "warn");
                    }
                  }}
                  className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                >
                  {lang === "zh" ? "HEX→ASCII" : "HEX→ASCII"}
                </button>
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {(() => {
                  try {
                    const count = sendMode === "hex" ? parseHexString(value || "").length : new TextEncoder().encode(value || "").length;
                    return lang === "zh" ? `${count} 字节` : `${count} bytes`;
                  } catch {
                    return lang === "zh" ? `0 字节` : `0 bytes`;
                  }
                })()}
              </div>
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={toggleExpanded}
                  className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                  title={expanded ? (lang === "zh" ? "收起输入" : "Collapse input") : (lang === "zh" ? "展开输入" : "Expand input")}
                >
                  {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex w-36 flex-col gap-2">
            <div className="flex gap-1">
              <label className={`flex cursor-pointer items-center gap-1 ${sel}`}>
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={sendMode === "hex"}
                  onChange={(e) => onSendModeChange(e.currentTarget.checked ? "hex" : "ascii")}
                />
                <span>HEX</span>
              </label>
              <select
                value={appendNewline}
                onChange={(e) => onAppendNewlineChange(e.currentTarget.value as AppendNewline)}
                className={sel}
                title={t("ender_crlf", lang)}
              >
                {enderOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="mt-auto">
              <button
                type="button"
                onClick={handleSend}
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-1 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
              >
                <Send size={12} />
                {t("send", lang)}
              </button>
            </div>
          </div>
        </div>
      </div>

      <FileSend
        filePath={filePath}
        fileSendProgress={fileSendProgress}
        isBusy={isBusy}
        lang={lang}
        isConnected={isConnected}
        onFileSelect={onFileSelect}
        onFileSend={onFileSend}
        onPushToast={onPushToast}
      />

      <HotkeysPanel hotkeys={hotkeys} onHotkeySend={onHotkeySend} lang={lang} />

      <div className="hidden">
        <button type="button" onClick={() => onReceiveModeChange(receiveMode === "hex" ? "ascii" : "hex")} />
      </div>
    </div>
  );
}
