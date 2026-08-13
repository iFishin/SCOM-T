import React from "react";
// Hotkeys/Files refactor applied: layout extracted to separate components
import { Send, Globe, ChevronDown, ChevronUp, File, Keyboard, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { Select } from "./ui/Select";
import { parseHexString, bytesToHex, bytesToAscii } from "../utils/hexConverter.ts";
import type { ToastType } from "./ui/Toast.tsx";
import type { ReceiveMode, SendMode } from "../hooks/useSerialPort.ts";
import type { HotkeyConfig, CustomEnder } from "../hooks/useSettings.ts";
import { buildEnderOptions, appendEnderFallback } from "../utils/enderOptions.ts";
import { FileSend } from "./FileSend.tsx";
import { HotkeysPanel } from "./HotkeysPanel.tsx";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";

type AppendNewline = string;

type SendPanelProps = {
  value: string;
  sendMode: SendMode;
  receiveMode: ReceiveMode;
  appendNewline: AppendNewline;
  customEnders?: CustomEnder[];
  isConnected: boolean;
  isBusy: boolean;
  hotkeys: HotkeyConfig[];
  filePath: string;
  fileSendProgress: number | null;
  lang: Lang;
  mode?: "combined" | "input-only" | "tabbed";
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
  /** TCP Server broadcast — sends current message to all connected TCP clients */
  onBroadcastToClients?: (text: string) => void;
  tcpClientCount?: number;
};


export function SendPanel({
  value,
  sendMode,
  receiveMode,
  appendNewline,
  customEnders,
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
  onBroadcastToClients,
  tcpClientCount,
}: SendPanelProps) {
  const expanded = sendPanelExpanded ?? false;
  const [textareaMinimized, setTextareaMinimized] = React.useState(true);
  const fileSendCollapsed = sendPanelFileCollapsed ?? true;
  const hotkeysCollapsed = sendPanelHotkeysCollapsed ?? true;
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const sendingRef = React.useRef(false);
  const [tabbedActiveTab, setTabbedActiveTab] = React.useState<"send" | "file" | "hotkeys">("send");

  function toggleExpanded() {
    onSendPanelExpandedChange?.(!expanded);
    // focus will be handled by the ref when element exists
  }
  
  

  const enderOptions = buildEnderOptions(customEnders ?? [], lang);

  

  function handleSend() {
    if (sendingRef.current || isBusy) { return; }
    if (!isConnected) { onPushToast(t("toast_not_connected", lang), "warn"); return; }
    sendingRef.current = true;
    const p = onSend();
    if (p) { p.catch(() => {}).finally(() => { sendingRef.current = false; }); }
    else { sendingRef.current = false; }
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

  if (mode === "tabbed") {
    const tabs: { key: "send" | "file" | "hotkeys"; label: string; icon: React.ReactNode }[] = [
      { key: "send", label: t("send", lang), icon: <Send size={12} /> },
      { key: "file", label: t("file", lang), icon: <File size={12} /> },
      { key: "hotkeys", label: t("hotkeys_title", lang), icon: <Keyboard size={12} /> },
    ];
    return (
      <div className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--border)]">
        <div className="flex bg-[var(--bg-surface)]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTabbedActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-1.5 text-theme-11 font-semibold uppercase tracking-widest transition-colors ${
                tabbedActiveTab === tab.key
                  ? "border-[var(--accent)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-input)]"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="border-t border-[var(--border)]" />
        <div className="bg-[var(--bg-surface)] p-1.5">
          {tabbedActiveTab === "send" && (
            <div className="flex gap-1.5">
              <div className="flex-1">
                <textarea
                  ref={(el) => { inputRef.current = el; }}
                  value={value}
                  onChange={(e) => onChange(e.currentTarget.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder={sendMode === "hex" ? t("send_hex_placeholder", lang) : t("send_placeholder", lang)}
                  rows={textareaMinimized ? 1 : 3}
                  className="w-full resize-none rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                />
                <div className="mt-1 flex items-center gap-1">
                  <div className="flex gap-1 items-center">
                    <button
                      type="button"
                      onClick={() => setTextareaMinimized((v) => !v)}
                      className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      title={textareaMinimized ? (lang === "zh" ? "展开输入框" : "Expand") : (lang === "zh" ? "收起输入框" : "Collapse")}
                    >
                      {textareaMinimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                    </button>
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
                      className="px-2 py-0.5 text-theme-11"
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
                      className="px-2 py-0.5 text-theme-11"
                    >
                      {t("hex2ascii", lang)}
                    </Button>
                  </div>
                  <div className="text-theme-11 text-[var(--text-muted)]">
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
                    className="text-theme-11"
                  >
                    {appendEnderFallback(enderOptions, appendNewline, lang).map((o, i) => (
                      <option key={i} value={o.value}>{o.label}</option>
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
                {tcpClientCount !== undefined && tcpClientCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onBroadcastToClients?.(value)}
                    className="w-full flex items-center justify-center gap-1 py-1 text-xs text-[var(--text-muted)]"
                    title={lang === "zh" ? `广播到 ${tcpClientCount} 个客户端` : `Broadcast to ${tcpClientCount} client(s)`}
                  >
                    <Globe size={12} />
                    {lang === "zh" ? "广播" : "Broadcast"}
                  </Button>
                )}
              </div>
            </div>
          )}
          {tabbedActiveTab === "file" && (
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
          )}
          {tabbedActiveTab === "hotkeys" && (
            <HotkeysPanel hotkeys={hotkeys} onHotkeySend={onHotkeySend} lang={lang} borderless />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      {/* Send command — collapsible */}
      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <div
          className="flex cursor-pointer items-center justify-between bg-[var(--bg-surface)] px-2 py-1 text-theme-11 font-semibold uppercase tracking-widest text-[var(--text-muted)] select-none transition-colors hover:bg-[var(--bg-input)]"
          onClick={toggleExpanded}
        >
          <span className="flex items-center gap-1">
            <Send size={11} />
            {t("send", lang)}
          </span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] shadow-sm">
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </span>
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
                    rows={textareaMinimized ? 1 : 3}
                    className={`w-full resize-none rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]`}
                  />
                  <div className="mt-1 flex items-center gap-1">
                    <div className="flex gap-1 items-center">
                      <button
                        type="button"
                        onClick={() => setTextareaMinimized((v) => !v)}
                        className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title={textareaMinimized ? (lang === "zh" ? "展开输入框" : "Expand") : (lang === "zh" ? "收起输入框" : "Collapse")}
                      >
                        {textareaMinimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                      </button>
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
                        className="px-2 py-0.5 text-theme-11"
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
                        className="px-2 py-0.5 text-theme-11"
                      >
                        {t("hex2ascii", lang)}
                      </Button>
                    </div>
                    <div className="text-theme-11 text-[var(--text-muted)]">
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
                      className="text-theme-11"
                    >
                      {appendEnderFallback(enderOptions, appendNewline, lang).map((o, i) => (
                        <option key={i} value={o.value}>{o.label}</option>
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
                  {tcpClientCount !== undefined && tcpClientCount > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onBroadcastToClients?.(value)}
                      className="w-full flex items-center justify-center gap-1 py-1 text-xs text-[var(--text-muted)]"
                      title={lang === "zh" ? `广播到 ${tcpClientCount} 个客户端` : `Broadcast to ${tcpClientCount} client(s)`}
                    >
                      <Globe size={12} />
                      {lang === "zh" ? "广播" : "Broadcast"}
                    </Button>
                  )}
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
              className="flex cursor-pointer items-center justify-between bg-[var(--bg-surface)] px-2 py-1 text-theme-11 font-semibold uppercase tracking-widest text-[var(--text-muted)] select-none transition-colors hover:bg-[var(--bg-input)]"
              onClick={() => onSendPanelFileCollapsedChange?.(!fileSendCollapsed)}
            >
              <span className="flex items-center gap-1">
                <File size={11} />
                {t("file", lang)}
              </span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] shadow-sm">
                {fileSendCollapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
              </span>
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
              className="flex cursor-pointer items-center justify-between bg-[var(--bg-surface)] px-2 py-1 text-theme-11 font-semibold uppercase tracking-widest text-[var(--text-muted)] select-none transition-colors hover:bg-[var(--bg-input)]"
              onClick={() => onSendPanelHotkeysCollapsedChange?.(!hotkeysCollapsed)}
            >
              <span className="flex items-center gap-1">
                <Keyboard size={11} />
                {t("hotkeys_title", lang)}
              </span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] shadow-sm">
                {hotkeysCollapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
              </span>
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
