import React from "react";
// Hotkeys/Files refactor applied: layout extracted to separate components
import { Send, ChevronDown, ChevronUp, File, Keyboard } from "lucide-react";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { Select } from "./ui/Select";
import { parseHexString, bytesToHex, bytesToAscii } from "../utils/hexConverter.ts";
import type { ToastType } from "./ui/Toast.tsx";
import type { ReceiveMode, SendMode } from "../hooks/useSerialPort.ts";
import type { HotkeyConfig } from "../hooks/useSettings.ts";
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
  mode?: "combined" | "input-only";
  sendPanelExpanded?: boolean;
  sendPanelFileCollapsed?: boolean;
  sendPanelHotkeysCollapsed?: boolean;
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
  onSendPanelExpandedChange?: (v: boolean) => void;
  onSendPanelFileCollapsedChange?: (v: boolean) => void;
  onSendPanelHotkeysCollapsedChange?: (v: boolean) => void;
};


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
  mode = "combined",
  sendPanelExpanded,
  sendPanelFileCollapsed,
  sendPanelHotkeysCollapsed,
  onSendPanelExpandedChange,
  onSendPanelFileCollapsedChange,
  onSendPanelHotkeysCollapsedChange,
}: SendPanelProps) {
  const expanded = sendPanelExpanded ?? false;
  const fileSendCollapsed = sendPanelFileCollapsed ?? true;
  const hotkeysCollapsed = sendPanelHotkeysCollapsed ?? true;
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  function toggleExpanded() {
    onSendPanelExpandedChange?.(!expanded);
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
        onSendPanelExpandedChange?.(true);
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
    <div className="flex shrink-0 flex-col gap-0.5">
      {/* Send command — collapsible */}
      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <div
          className="flex cursor-pointer items-center justify-between bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] select-none transition-colors hover:bg-[var(--bg-input)]"
          onClick={toggleExpanded}
        >
          <span className="flex items-center gap-1">
            <Send size={11} />
            {t("send", lang)}
          </span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
        {expanded && (
          <>
            <div className="border-t border-[var(--border)]" />
            <div className="bg-[var(--bg-surface)] p-1.5">
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <textarea
                    ref={(el) => { inputRef.current = el; }}
                    value={value}
                    onChange={(e) => onChange(e.currentTarget.value)}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder={sendMode === "hex" ? t("send_hex_placeholder", lang) : t("send_placeholder", lang)}
                    rows={3}
                    className={`w-full resize-y rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]`}
                  />
                  <div className="mt-1 flex items-center gap-1">
                    <div className="flex gap-1 items-center">
                      <Button
                        type="button"
                        onClick={() => {
                          try {
                            const bytes = new TextEncoder().encode(value || "");
                            onChange(bytesToHex(bytes));
                          } catch (err: any) {
                            onPushToast?.(err?.message || String(err), "warn");
                          }
                        }}
                        className="px-2 py-0.5 text-[11px]"
                      >
                        {t("ascii2hex", lang)}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          try {
                            const bytes = parseHexString(value || "");
                            onChange(bytesToAscii(bytes));
                          } catch (err: any) {
                            onPushToast?.(err?.message || String(err), "warn");
                          }
                        }}
                        className="px-2 py-0.5 text-[11px]"
                      >
                        {t("hex2ascii", lang)}
                      </Button>
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
                  </div>
                </div>
                <div className="flex w-32 flex-col gap-1">
                  <div className="flex gap-1 items-center">
                    <Checkbox
                      checked={sendMode === "hex"}
                      onChange={(e) => onSendModeChange(e.currentTarget.checked ? "hex" : "ascii")}
                      label="HEX"
                    />
                    <Select
                      value={appendNewline}
                      onChange={(e) => onAppendNewlineChange(e.currentTarget.value as AppendNewline)}
                      title={t("ender_crlf", lang)}
                      className="text-[11px]"
                    >
                      {enderOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSend}
                    disabled={isBusy}
                    className="w-full flex items-center justify-center gap-1 py-1 text-xs"
                  >
                    <Send size={12} />
                    {t("send", lang)}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {mode === "combined" && (
        <>
          {/* File send — collapsible */}
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <div
              className="flex cursor-pointer items-center justify-between bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] select-none transition-colors hover:bg-[var(--bg-input)]"
              onClick={() => onSendPanelFileCollapsedChange?.(!fileSendCollapsed)}
            >
              <span className="flex items-center gap-1">
                <File size={11} />
                {t("file", lang)}
              </span>
              {fileSendCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </div>
            {!fileSendCollapsed && (
              <>
                <div className="border-t border-[var(--border)]" />
                <FileSend
                  filePath={filePath}
                  fileSendProgress={fileSendProgress}
                  isBusy={isBusy}
                  lang={lang}
                  isConnected={isConnected}
                  onFileSelect={onFileSelect}
                  onFileSend={onFileSend}
                  onPushToast={onPushToast}
                  borderless
                />
              </>
            )}
          </div>

          {/* Hotkeys — collapsible */}
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <div
              className="flex cursor-pointer items-center justify-between bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] select-none transition-colors hover:bg-[var(--bg-input)]"
              onClick={() => onSendPanelHotkeysCollapsedChange?.(!hotkeysCollapsed)}
            >
              <span className="flex items-center gap-1">
                <Keyboard size={11} />
                {t("hotkeys_title", lang)}
              </span>
              {hotkeysCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </div>
            {!hotkeysCollapsed && (
              <>
                <div className="border-t border-[var(--border)]" />
                <HotkeysPanel hotkeys={hotkeys} onHotkeySend={onHotkeySend} lang={lang} borderless />
              </>
            )}
          </div>
        </>
      )}

      <div className="hidden">
        <Button type="button" onClick={() => onReceiveModeChange(receiveMode === "hex" ? "ascii" : "hex")} />
      </div>
    </div>
  );
}
