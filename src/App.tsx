import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Settings } from "lucide-react";
import { AboutPanel } from "./components/settings/AboutPanel.tsx";
import { ConfigPanel } from "./components/ConfigPanel.tsx";
import { SendPanel } from "./components/SendPanel.tsx";
import { ReceiveLog } from "./components/ReceiveLog.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { ToastContainer, useToast } from "./components/Toast.tsx";
import { useSettings, type HotkeyConfig } from "./hooks/useSettings.ts";
import { t } from "./i18n.ts";
import {
  BAUD_RATES,
  DATA_BITS_OPTIONS,
  PARITY_OPTIONS,
  STOP_BITS_OPTIONS,
  useSerialPort,
  type ReceiveMode,
  type SendMode,
  type SerialConfig,
} from "./hooks/useSerialPort.ts";

type PromptRow = {
  id: number;
  selected: boolean;
  command: string;
  isHex: boolean;
  ender: "" | "\r\n" | "\r" | "\n";
  interval: string;
};
function useHSplit(initialPx: number, minLeft = 220, minRight = 280) {
  const [leftWidth, setLeftWidth] = useState(initialPx);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = e.clientX - rect.left;
      setLeftWidth(Math.max(minLeft, Math.min(next, rect.width - minRight)));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minLeft, minRight]);

  return { containerRef, leftWidth, onDividerMouseDown };
}

/** Vertical split-pane hook for left column */
function useVSplit(initialRatio = 0.45, minTopPx = 120, minBottomPx = 80) {
  const [topRatio, setTopRatio] = useState(initialRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const clamped = Math.max(minTopPx, Math.min(relY, rect.height - minBottomPx));
      setTopRatio(clamped / rect.height);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minTopPx, minBottomPx]);

  return { containerRef, topRatio, onDividerMouseDown };
}

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sendMode, setSendMode] = useState<SendMode>("ascii");
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>("ascii");
  const [appendNewline, setAppendNewline] = useState<"" | "\r\n" | "\r" | "\n">("\r\n");
  const [message, setMessage] = useState("");
  const [filePath, setFilePath] = useState("");
  const [config, setConfig] = useState<SerialConfig>({
    path: "",
    baudRate: 115200,
    dataBits: "8",
    parity: "none",
    stopBits: "1",
  });
  const [promptRows, setPromptRows] = useState<PromptRow[]>(() =>
    Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      selected: false,
      command: "",
      isHex: false,
      ender: "\r\n" as const,
      interval: "",
    })),
  );
  const commandRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { toasts, pushToast, removeToast } = useToast();
  const { settings, updateHotkeys, updateTheme, resetTheme, updatePromptRowCount, updateLang } = useSettings();
  const lang = settings.lang ?? "zh";
  const { containerRef, leftWidth, onDividerMouseDown } = useHSplit(
    typeof window !== "undefined" ? Math.floor(window.innerWidth / 2) : 480,
  );
  const { containerRef: leftColRef, topRatio, onDividerMouseDown: onVDividerMouseDown } = useVSplit(0.45);

  const {
    ports, logs, isConnected, isBusy, statusText, connectedPort,
    error, fileSendProgress,
    refreshPorts, openPort, closePort, sendData, sendFile, clearLogs,
  } = useSerialPort({ config, receiveMode });

  const prevError = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== prevError.current) pushToast(error, "error");
    prevError.current = error;
  }, [error]);

  // Keep promptRows length in sync with promptRowCount
  useEffect(() => {
    setPromptRows((current) => {
      const target = settings.promptRowCount;
      if (current.length === target) return current;
      // Rebuild with sequential ids
      return Array.from({ length: target }, (_, i) => {
        const existing = current[i];
        return existing
          ? { ...existing, id: i + 1 }
          : { id: i + 1, selected: false, command: "", isHex: false, ender: "\r\n" as const, interval: "" };
      });
    });
  }, [settings.promptRowCount]);

  function updatePromptRow(id: number, patch: Partial<PromptRow>) {
    setPromptRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function handleSendPromptRow(row: PromptRow) {
    if (!isConnected) { pushToast(t("toast_not_connected", lang), "warn"); return; }
    if (!row.command) { pushToast(`${t("prompt_sender", lang)} ${row.id}: ${t("toast_command_empty", lang)}`, "warn"); return; }
    const mode = row.isHex ? "hex" : "ascii";
    await sendData(row.command, mode, row.ender);
  }

  function handleCommandKeyDown(e: React.KeyboardEvent, row: PromptRow) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendPromptRow(row);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(1, row.id - 1);
      commandRefs.current[prev]?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(settings.promptRowCount, row.id + 1);
      commandRefs.current[next]?.focus();
    }
  }

  useEffect(() => {
    const root = document.documentElement;
    const theme = settings.theme;
    root.classList.toggle("dark", theme.mode === "dark");
    root.style.setProperty("--bg-primary", theme.bgPrimary);
    root.style.setProperty("--bg-surface", theme.bgSurface);
    root.style.setProperty("--bg-input", theme.bgInput);
    root.style.setProperty("--text-primary", theme.textPrimary);
    root.style.setProperty("--text-muted", theme.textMuted);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--border", theme.border);
    root.style.setProperty("--font-family", theme.fontFamily);
    root.style.setProperty("--font-size", `${theme.fontSize}px`);
    root.style.setProperty("--font-weight", String(theme.fontWeight));
    root.style.setProperty("--mono-font-family", theme.monoFontFamily);
  }, [settings.theme]);

  const currentPortLabel = useMemo(() => {
    if (!isConnected || !connectedPort) return "Closed";
    return `${connectedPort.path} @ ${connectedPort.baudRate}`;
  }, [connectedPort, isConnected]);

  async function handleRefreshPorts() {
    const count = await refreshPorts();
    if (count === 0) pushToast(t("status_no_ports", lang), "warn");
    else pushToast(t("status_find_ports", lang, count), "success");
  }

  async function handleFileSelect() {
    const selected = await open({ multiple: false, directory: false });
    if (typeof selected === "string" && selected) setFilePath(selected);
  }

  function handleHotkeySend(hotkey: HotkeyConfig) {
    if (hotkey.actionType === "builtin") {
      switch (hotkey.builtinAction) {
        case "clear_log":
          clearLogs("all");
          return;
        case "clear_sent":
          clearLogs("sent");
          return;
        case "refresh_ports":
          void refreshPorts().then((count) => pushToast(t("status_find_ports", lang, count), "success"));
          return;
        default:
          pushToast(`${hotkey.label}: ${t("hotkey_no_action", lang)}`, "warn");
          return;
      }
    }

    if (!hotkey.command) {
      pushToast(`${hotkey.label}: ${t("hotkey_no_command", lang)}`, "warn");
      return;
    }

    void sendData(hotkey.command, hotkey.sendMode, hotkey.appendNewline);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="flex h-10 shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-surface)] px-3">
        <div className="flex items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg">
            <img src="../public/favicon.png" alt="Logo" className="h-8 w-8" />
          </div>
        </div>

        {/* Menu bar */}
        <nav className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <Settings size={14} />
            {t("settings_title", lang)}
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <span>{t("view", lang)}</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <span>{t("help", lang)}</span>
          </button>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <span>{t("about", lang)}</span>
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]"}`} />
            {currentPortLabel}
          </div>
        </div>
      </header>

      {aboutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="flex max-h-[80vh] w-[640px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{t("about", lang)}</div>
                <div className="text-xs text-[var(--text-muted)]">{t("about_short", lang)}</div>
              </div>
              <button type="button" onClick={() => setAboutOpen(false)} className="ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                Close
              </button>
            </div>
            <div className="p-4">
              <AboutPanel lang={lang} />
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main
        ref={containerRef}
        className="flex min-h-0 flex-1 gap-0 overflow-hidden p-2"
      >
        {/* Left column */}
        <div
          ref={leftColRef}
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          style={{ width: leftWidth, flexShrink: 0 }}
        >
          {/* Top portion: config + send */}
          <div
            className="flex min-h-0 flex-col gap-2 overflow-y-auto pb-1"
            style={{ height: `calc(${topRatio * 100}% - 4px)` }}
          >
            <ConfigPanel
              ports={ports}
              config={config}
              baudRates={BAUD_RATES}
              dataBitsOptions={DATA_BITS_OPTIONS}
              parityOptions={PARITY_OPTIONS}
              stopBitsOptions={STOP_BITS_OPTIONS}
              isConnected={isConnected}
              isBusy={isBusy}
              lang={lang}
              onRefresh={handleRefreshPorts}
              onConfigChange={setConfig}
              onOpen={openPort}
              onClose={closePort}
            />
            <SendPanel
              value={message}
              sendMode={sendMode}
              appendNewline={appendNewline}
              receiveMode={receiveMode}
              isConnected={isConnected}
              isBusy={isBusy}
              hotkeys={settings.hotkeys}
              filePath={filePath}
              fileSendProgress={fileSendProgress}
              lang={lang}
              onChange={setMessage}
              onSendModeChange={setSendMode}
              onReceiveModeChange={setReceiveMode}
              onAppendNewlineChange={setAppendNewline}
              onSend={() => sendData(message, sendMode, appendNewline)}
              onClearSent={() => clearLogs("sent")}
              onFileSelect={handleFileSelect}
              onFileSend={() => sendFile(filePath)}
              onHotkeySend={handleHotkeySend}
              onPushToast={pushToast}
            />
          </div>

          {/* Vertical drag handle */}
          <div
            onMouseDown={onVDividerMouseDown}
            className="group my-0.5 flex h-2 shrink-0 cursor-row-resize items-center justify-center"
          >
            <div className="h-px w-full rounded-full bg-[var(--border)] transition-all group-hover:h-0.5 group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]" />
          </div>

          {/* Bottom portion: receive log */}
          <div className="min-h-0 flex-1 flex flex-col">
            <ReceiveLog
              logs={logs}
              receiveMode={receiveMode}
              lang={lang}
              onReceiveModeChange={setReceiveMode}
              onClearAll={() => clearLogs("all")}
              onClearReceived={() => clearLogs("received")}
              onClearSent={() => clearLogs("sent")}
            />
          </div>
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onDividerMouseDown}
          className="group mx-1 flex w-2 shrink-0 cursor-col-resize items-center justify-center"
        >
          <div className="h-full w-px rounded-full bg-[var(--border)] transition-all group-hover:w-0.5 group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]" />
        </div>

        {/* Right column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          {/* Prompt controls */}
          <div className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-2 text-xs">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              <span>{t("prompt_group", lang)}</span>
              <label className="flex items-center gap-1 text-[10px] font-normal normal-case">
                {t("prompt_rows", lang)}
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={settings.promptRowCount}
                  onChange={(e) => updatePromptRowCount(Number(e.currentTarget.value))}
                  className="w-14 rounded border border-[var(--border)] bg-[var(--bg-input)] px-1 py-0.5 text-center text-xs outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
              <input
                readOnly
                value={lang === "zh" ? "指令：点击左侧行按钮发送…" : "COMMAND: click a row button to send…"}
                className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[var(--text-muted)] outline-none"
              />
              <button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                {lang === "zh" ? "预设" : "Prompt"}
              </button>
              <button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                Idx
              </button>
              <button className="rounded bg-[var(--accent)] px-3 py-1.5 text-white">
                {lang === "zh" ? "开始" : "Start"}
              </button>
              <input
                readOnly
                value={lang === "zh" ? "总次数" : "Total Times"}
                className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[var(--text-muted)] outline-none"
              />
              <button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                {lang === "zh" ? "停止" : "Stop"}
              </button>
            </div>
          </div>

          {/* Scrollable command rows */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="grid grid-cols-[28px_28px_60px_minmax(100px,1fr)_36px_56px_54px] items-center gap-x-1.5 border-b border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              <div />
              <div />
              <div>{t("send", lang)}</div>
              <div>{t("command_placeholder", lang)}</div>
              <div>HEX</div>
              <div>{t("ender_none", lang)}</div>
              <div>{t("interval_placeholder", lang)}</div>
            </div>
            <div className="h-[calc(100%-30px)] overflow-y-auto">
              {promptRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[28px_28px_60px_minmax(100px,1fr)_36px_56px_54px] items-center gap-x-1.5 border-b border-[var(--border)] px-2 py-1 last:border-0 hover:bg-[var(--bg-input)]"
                >
                  <div className="flex justify-center">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                      {row.id}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) => updatePromptRow(row.id, { selected: e.currentTarget.checked })}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendPromptRow(row)}
                    className="rounded bg-[var(--accent)] px-2 py-1 text-xs text-white transition-colors hover:opacity-80"
                  >
                    {t("prompt_sender", lang)}
                  </button>
                  <input
                    value={row.command}
                    onChange={(e) => updatePromptRow(row.id, { command: e.currentTarget.value })}
                    onKeyDown={(e) => handleCommandKeyDown(e, row)}
                    ref={(el) => { commandRefs.current[row.id] = el; }}
                    placeholder={t("command_placeholder", lang)}
                    className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                  />
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={row.isHex}
                      onChange={(e) => updatePromptRow(row.id, { isHex: e.currentTarget.checked })}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                  </div>
                  <select
                    value={row.ender}
                    onChange={(e) => updatePromptRow(row.id, { ender: e.currentTarget.value as "" | "\r\n" | "\r" | "\n" })}
                    className="w-full rounded border border-[var(--border)] bg-transparent px-1 py-1 text-[11px] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="\r\n">{t("ender_crlf", lang)}</option>
                    <option value="">{t("ender_none", lang)}</option>
                    <option value="\n">{t("ender_lf", lang)}</option>
                    <option value="\r">{t("ender_cr", lang)}</option>
                  </select>
                  <input
                    value={row.interval}
                    onChange={(e) => updatePromptRow(row.id, { interval: e.currentTarget.value })}
                    placeholder={t("interval_placeholder", lang)}
                    className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-center text-xs outline-none focus:border-[var(--accent)]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── Status bar ── */}
      <div className="shrink-0 px-2 pb-2">
        <StatusBar
          isConnected={isConnected}
          statusText={statusText}
          currentPortLabel={currentPortLabel}
        />
      </div>

      <SettingsModal
        open={settingsOpen}
        hotkeys={settings.hotkeys}
        theme={settings.theme}
        lang={settings.lang}
        onClose={() => setSettingsOpen(false)}
        onHotkeysChange={updateHotkeys}
        onThemeChange={updateTheme}
        onThemeReset={resetTheme}
        onLangChange={updateLang}
      />
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

export default App;
