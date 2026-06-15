import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronUp, Settings } from "lucide-react";
import { GridLayout } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { AboutPanel } from "./components/settings/AboutPanel.tsx";
import { ConfigPanel } from "./components/ConfigPanel.tsx";
import { FileSend } from "./components/FileSend.tsx";
import { HotkeysPanel } from "./components/HotkeysPanel.tsx";
import { SendPanel } from "./components/SendPanel.tsx";
import { ReceiveLog } from "./components/ReceiveLog.tsx";
import { StatusBar } from "./components/ui/StatusBar.tsx";
import { Button } from "./components/ui/Button.tsx";
import { Checkbox } from "./components/ui/Checkbox.tsx";
import { Input } from "./components/ui/Input.tsx";
import { Select } from "./components/ui/Select.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { ToastContainer, useToast } from "./components/ui/Toast.tsx";
import { useSettings, type HotkeyConfig } from "./hooks/useSettings.ts";
import { useLogFile } from "./hooks/useLogFile.ts";
import { usePromptConfig } from "./hooks/usePromptConfig.ts";
import { serializeToYaml, parseYamlToRows } from "./utils/yamlConfig.ts";
import { YamlEditor } from "./components/YamlEditor.tsx";
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
  device?: string;
  expectedResponses?: string[];
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
  const { settings, updateHotkeys, updateTheme, resetTheme, updatePromptRowCount, updateLang, updateCompactMode, updateLayoutMode, updateGridLayout } = useSettings();
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

  const logFile = useLogFile();
  const appendLogsRef = useRef(logFile.appendNewLogs);
  useEffect(() => { appendLogsRef.current = logFile.appendNewLogs; });
  useEffect(() => {
    if (logFile.realTime) {
      appendLogsRef.current(logs);
    }
  }, [logs, logFile.realTime]);

  const promptConfig = usePromptConfig();
  const [configAction, setConfigAction] = useState<null | "save" | "load">(null);
  const [configName, setConfigName] = useState("");
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);

  const [activePromptTab, setActivePromptTab] = useState<"grid" | "config">("grid");
  const [yamlText, setYamlText] = useState("");
  const [yamlError, setYamlError] = useState<string | null>(null);
  const yamlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [gridEditing, setGridEditing] = useState(false);
  const gridWidthRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(800);

  // Layout effect to get grid container width synchronously
  useEffect(() => {
    const el = gridWidthRef.current?.parentElement;
    if (el) {
      setGridWidth(el.clientWidth - 16); // 16px padding from main
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGridWidth(entry.contentRect.width);
      }
    });
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => { if (yamlDebounceRef.current) clearTimeout(yamlDebounceRef.current); };
  }, []);

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

  function handlePromptTabChange(tab: "grid" | "config") {
    if (yamlDebounceRef.current) {
      clearTimeout(yamlDebounceRef.current);
      yamlDebounceRef.current = null;
    }
    if (tab === "config") {
      setYamlText(serializeToYaml(promptRows));
      setYamlError(null);
    }
    setActivePromptTab(tab);
  }

  function handleYamlChange(newValue: string) {
    setYamlText(newValue);
    if (yamlDebounceRef.current) clearTimeout(yamlDebounceRef.current);
    yamlDebounceRef.current = setTimeout(() => {
      const result = parseYamlToRows(newValue);
      if (result.valid) {
        setYamlError(null);
        setPromptRows(result.rows);
        updatePromptRowCount(result.rows.length);
      } else {
        setYamlError(result.error);
      }
    }, 500);
  }

  async function handleSaveConfig(name: string) {
    try {
      await promptConfig.saveConfig(name, promptRows);
      pushToast(t("config_saved_ok", lang), "success");
      setConfigAction(null);
      setConfigName("");
    } catch (e) {
      pushToast(`${t("config_save_err", lang)}: ${e}`, "error");
    }
  }

  async function handleLoadConfig(name: string) {
    try {
      const rows = await promptConfig.loadConfig(name);
      setPromptRows(rows);
      updatePromptRowCount(rows.length);
      setYamlText(serializeToYaml(rows));
      setYamlError(null);
      pushToast(t("config_loaded_ok", lang), "success");
      setConfigAction(null);
    } catch (e) {
      pushToast(`${t("config_load_err", lang)}: ${e}`, "error");
    }
  }

  async function handleDeleteConfig(name: string) {
    try {
      await promptConfig.deleteConfig(name);
      setSavedConfigs((prev) => prev.filter((c) => c !== name));
      pushToast(t("config_deleted_ok", lang), "success");
    } catch (e) {
      pushToast(`${t("config_delete_err", lang)}: ${e}`, "error");
    }
  }

  async function handleOpenConfigDir() {
    try {
      await promptConfig.openConfigDir();
    } catch (e) {
      pushToast(`${t("config_open_err", lang)}: ${e}`, "error");
    }
  }

  async function handleShowLoadList() {
    const list = await promptConfig.listConfigs();
    setSavedConfigs(list);
    setConfigAction("load");
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
    // density compact mode
    root.classList.toggle("density-compact", !!settings.compactMode);
  }, [settings.theme, settings.compactMode]);

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

  function renderGridLayout() {
    return (
      <div className="relative flex h-full w-full min-h-0 flex-col overflow-y-auto">
        {/* Editing toggle */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-2 py-1">
          {gridEditing && (
            <span className="text-[10px] text-[var(--accent)] font-semibold">
              {lang === "zh" ? "📐 编辑模式 — 拖拽卡片调整布局" : "📐 Edit mode — drag cards to rearrange"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setGridEditing((v) => !v)}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              gridEditing
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {gridEditing
              ? (lang === "zh" ? "锁定" : "Lock")
              : (lang === "zh" ? "编辑布局" : "Edit Layout")}
          </button>
        </div>
        <div ref={gridWidthRef} className="flex-1 min-h-0">
          <GridLayout
            width={gridWidth}
            layout={settings.gridLayout as unknown as Layout}
            gridConfig={{ cols: 12, rowHeight: 30, margin: [8, 8], containerPadding: [8, 0], maxRows: Infinity }}
            dragConfig={{ enabled: gridEditing, cancel: 'input,select,textarea,button,a,.react-resizable-handle,.no-drag' }}
            resizeConfig={{ enabled: gridEditing, handles: ['e', 's', 'se', 'w', 'n'] }}
            autoSize
            onLayoutChange={(newLayout: Layout) =>
              updateGridLayout(
                newLayout.map((item) => ({
                  i: item.i,
                  x: item.x,
                  y: item.y,
                  w: item.w,
                  h: item.h,
                  minW: (settings.gridLayout ?? []).find((l) => l.i === item.i)?.minW ?? 2,
                  minH: (settings.gridLayout ?? []).find((l) => l.i === item.i)?.minH ?? 2,
                }))
              )
            }
          >
            <div key="config" className="overflow-hidden rounded-lg">
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
            </div>

            <div key="send" className="overflow-hidden rounded-lg">
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
                mode="input-only"
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

            <div key="filesend" className="overflow-hidden rounded-lg">
              <FileSend
                filePath={filePath}
                fileSendProgress={fileSendProgress}
                isBusy={isBusy}
                lang={lang}
                isConnected={isConnected}
                onFileSelect={handleFileSelect}
                onFileSend={() => sendFile(filePath)}
                onPushToast={pushToast}
              />
            </div>

            <div key="hotkeys" className="overflow-hidden rounded-lg">
              <HotkeysPanel hotkeys={settings.hotkeys} onHotkeySend={handleHotkeySend} lang={lang} />
            </div>

            <div key="receive" className="overflow-hidden flex flex-col rounded-lg">
              <ReceiveLog
                logs={logs}
                receiveMode={receiveMode}
                lang={lang}
                savePath={logFile.savePath}
                realTimeLog={logFile.realTime}
                onReceiveModeChange={setReceiveMode}
                onClearAll={() => clearLogs("all")}
                onClearReceived={() => clearLogs("received")}
                onClearSent={() => clearLogs("sent")}
                onSelectLogFile={logFile.selectLogFile}
                onToggleRealTime={() => logFile.setRealTime((v) => !v)}
                onFlushLogs={() => logFile.flushAll(logs)}
                onCloseLogFile={logFile.closeLogFile}
              />
            </div>

            <div key="prompts" className="overflow-hidden rounded-lg flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] p-2">
              {/* Prompt controls */}
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handlePromptTabChange("grid")}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                      activePromptTab === "grid"
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                    }`}
                  >
                    {t("tab_grid", lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromptTabChange("config")}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                      activePromptTab === "config"
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                    }`}
                  >
                    {t("tab_config", lang)}
                  </button>
                  {activePromptTab === "config" && (
                    <>
                      <span className="mx-1 text-[var(--border)]">|</span>
                      <button
                        type="button"
                        onClick={() => { setConfigName(""); setConfigAction("save"); }}
                        className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                      >
                        {t("save_config", lang)}
                      </button>
                      <button
                        type="button"
                        onClick={handleShowLoadList}
                        className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                      >
                        {t("load_config", lang)}
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenConfigDir}
                        className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                      >
                        {t("open_config_dir", lang)}
                      </button>
                    </>
                  )}
                </div>
                {activePromptTab === "grid" && (
                  <label className="flex items-center gap-1 text-[10px] font-normal normal-case">
                    {t("prompt_rows", lang)}
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={settings.promptRowCount}
                      onChange={(e) => updatePromptRowCount(Number(e.currentTarget.value))}
                      className="w-14 text-center"
                    />
                  </label>
                )}
              </div>
              {activePromptTab === "grid" && (
                <div className="flex gap-1.5 pb-2">
                  <input
                    readOnly
                    value={lang === "zh" ? "指令：点击左侧行按钮发送…" : "COMMAND: click a row button to send…"}
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[var(--text-muted)] outline-none"
                  />
                  <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                    {lang === "zh" ? "预设" : "Prompt"}
                  </Button>
                  <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                    Idx
                  </Button>
                  <Button className="rounded bg-[var(--accent)] px-3 py-1.5 text-white">
                    {lang === "zh" ? "开始" : "Start"}
                  </Button>
                  <input
                    readOnly
                    value={lang === "zh" ? "总次数" : "Total Times"}
                    className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[var(--text-muted)] outline-none"
                  />
                  <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                    {lang === "zh" ? "停止" : "Stop"}
                  </Button>
                </div>
              )}

              {/* Scrollable command rows / YAML editor */}
              <div className="min-h-0 flex-1">
                {activePromptTab === "grid" ? (
                  <div className="h-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
                    <div className="grid grid-cols-[28px_28px_60px_minmax(100px,1fr)_36px_56px_54px] items-center gap-x-1.5 border-b border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      <div /><div /><div>{t("send", lang)}</div><div>{t("command_placeholder", lang)}</div><div>HEX</div><div>{t("ender_none", lang)}</div><div>{t("interval_placeholder", lang)}</div>
                    </div>
                    <div className="h-[calc(100%-30px)] overflow-y-auto">
                      {promptRows.map((row) => (
                        <div key={row.id} className="grid grid-cols-[28px_28px_60px_minmax(100px,1fr)_36px_56px_54px] items-center gap-x-1.5 border-b border-[var(--border)] px-2 py-1 last:border-0 hover:bg-[var(--bg-hover)]">
                          <div className="flex justify-center">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-muted)]">{row.id}</span>
                          </div>
                          <div className="flex justify-center">
                            <Checkbox checked={row.selected} onChange={(e) => updatePromptRow(row.id, { selected: e.currentTarget.checked })} />
                          </div>
                          <Button type="button" variant="primary" size="sm" onClick={() => handleSendPromptRow(row)}>{t("prompt_sender", lang)}</Button>
                          <Input value={row.command} onChange={(e) => updatePromptRow(row.id, { command: e.currentTarget.value })} onKeyDown={(e) => handleCommandKeyDown(e, row)} ref={(el: HTMLInputElement) => { commandRefs.current[row.id] = el; }} placeholder={t("command_placeholder", lang)} className="bg-transparent" />
                          <div className="flex justify-center"><Checkbox checked={row.isHex} onChange={(e) => updatePromptRow(row.id, { isHex: e.currentTarget.checked })} /></div>
                          <Select value={row.ender} onChange={(e) => updatePromptRow(row.id, { ender: e.currentTarget.value as "" | "\r\n" | "\r" | "\n" })}>
                            <option value="\r\n">{t("ender_crlf", lang)}</option><option value="">{t("ender_none", lang)}</option><option value="\n">{t("ender_lf", lang)}</option><option value="\r">{t("ender_cr", lang)}</option>
                          </Select>
                          <Input value={row.interval} onChange={(e) => updatePromptRow(row.id, { interval: e.currentTarget.value })} placeholder={t("interval_placeholder", lang)} className="text-center" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {configAction === "save" && (
                      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--bg-input)]">
                        <input value={configName} onChange={(e) => setConfigName(e.currentTarget.value)} placeholder={t("config_name_hint", lang)} className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]" onKeyDown={(e) => { if (e.key === "Enter" && configName.trim()) handleSaveConfig(configName.trim()); if (e.key === "Escape") setConfigAction(null); }} autoFocus />
                        <Button type="button" variant="primary" size="sm" disabled={!configName.trim()} onClick={() => handleSaveConfig(configName.trim())} className="px-2 py-1 text-[11px]">{t("save_config", lang)}</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfigAction(null)} className="px-2 py-1 text-[11px]">{lang === "zh" ? "取消" : "Cancel"}</Button>
                      </div>
                    )}
                    {configAction === "load" && (
                      <div className="border-b border-[var(--border)] bg-[var(--bg-input)]">
                        {savedConfigs.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-[var(--text-muted)]">{t("no_configs", lang)}</div>
                        ) : (
                          <div className="divide-y divide-[var(--border)] max-h-32 overflow-y-auto">
                            {savedConfigs.map((name) => (
                              <div key={name} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]">
                                <button type="button" className="flex-1 text-left text-[var(--text-primary)]" onClick={() => handleLoadConfig(name)}>{name}</button>
                                <button type="button" onClick={() => handleDeleteConfig(name)} className="rounded px-1 py-0.5 text-[var(--text-muted)] hover:text-rose-500 transition-colors text-[10px]">{lang === "zh" ? "删除" : "Del"}</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="px-3 py-1.5 border-t border-[var(--border)]">
                          <button type="button" onClick={() => setConfigAction(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">{lang === "zh" ? "取消" : "Cancel"}</button>
                        </div>
                      </div>
                    )}
                    <YamlEditor value={yamlText} onChange={handleYamlChange} error={yamlError} lang={lang} />
                  </>
                )}
              </div>
            </div>
          </GridLayout>
      </div>
      </div>
    );
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
          <Button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <Settings size={14} />
            {t("settings_title", lang)}
          </Button>
          <Button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <span>{t("help", lang)}</span>
          </Button>
          <Button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <span>{t("about", lang)}</span>
          </Button>
        </nav>

      </header>

      {aboutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="flex max-h-[80vh] w-[640px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{t("about", lang)}</div>
                <div className="text-xs text-[var(--text-muted)]">{t("about_short", lang)}</div>
              </div>
              <Button type="button" onClick={() => setAboutOpen(false)} className="ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                Close
              </Button>
            </div>
            <div className="p-4">
              <AboutPanel lang={lang} />
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main ref={containerRef} className="flex min-h-0 flex-1 gap-0 overflow-hidden p-2">
        {settings.layoutMode === "grid" && renderGridLayout()}
        {settings.layoutMode !== "grid" && (
          <>
            {/* Left column */}
            <div
              ref={leftColRef}
              className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              style={{ width: leftWidth, flexShrink: 0 }}
            >
              {/* Top portion: config + send */}
              {topCollapsed ? (
                <div
                  onClick={() => setTopCollapsed(false)}
                  className="shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 transition-colors hover:bg-[var(--bg-input)]"
                >
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <ChevronDown size={14} />
                    <span className="font-semibold uppercase tracking-widest">
                      {lang === "zh" ? "配置与发送" : "Config & Send"}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]"}`} />
                      <span>{statusText}</span>
                    </span>
                  </div>
                </div>
              ) : (
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
              )}

              {/* Vertical drag handle — hidden when collapsed */}
              {!topCollapsed && (
                <div
                  onMouseDown={onVDividerMouseDown}
                  className="group relative my-0.5 flex h-3 shrink-0 cursor-row-resize items-center justify-center"
                >
                  <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setTopCollapsed(true); }}
                      className="flex items-center gap-1 rounded bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text-primary)]"
                      title={lang === "zh" ? "收起配置面板" : "Collapse config panel"}
                    >
                      <ChevronUp size={10} />
                      {lang === "zh" ? "收起" : "Collapse"}
                    </button>
                  </div>
                  <div className="h-px w-full rounded-full bg-[var(--border)] transition-all group-hover:h-0.3" />
                </div>
              )}

              {/* Bottom portion: receive log */}
              <div className="min-h-0 flex-1 flex flex-col">
                <ReceiveLog
                  logs={logs}
                  receiveMode={receiveMode}
                  lang={lang}
                  savePath={logFile.savePath}
                  realTimeLog={logFile.realTime}
                  onReceiveModeChange={setReceiveMode}
                  onClearAll={() => clearLogs("all")}
                  onClearReceived={() => clearLogs("received")}
                  onClearSent={() => clearLogs("sent")}
                  onSelectLogFile={logFile.selectLogFile}
                  onToggleRealTime={() => logFile.setRealTime((v) => !v)}
                  onFlushLogs={() => logFile.flushAll(logs)}
                  onCloseLogFile={logFile.closeLogFile}
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
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handlePromptTabChange("grid")}
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                        activePromptTab === "grid"
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                      }`}
                    >
                      {t("tab_grid", lang)}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromptTabChange("config")}
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                        activePromptTab === "config"
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                      }`}
                    >
                      {t("tab_config", lang)}
                    </button>
                    {activePromptTab === "config" && (
                      <>
                        <span className="mx-1 text-[var(--border)]">|</span>
                        <button
                          type="button"
                          onClick={() => { setConfigName(""); setConfigAction("save"); }}
                          className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                        >
                          {t("save_config", lang)}
                        </button>
                        <button
                          type="button"
                          onClick={handleShowLoadList}
                          className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                        >
                          {t("load_config", lang)}
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenConfigDir}
                          className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                        >
                          {t("open_config_dir", lang)}
                        </button>
                      </>
                    )}
                  </div>
                  {activePromptTab === "grid" && (
                    <label className="flex items-center gap-1 text-[10px] font-normal normal-case">
                      {t("prompt_rows", lang)}
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={settings.promptRowCount}
                        onChange={(e) => updatePromptRowCount(Number(e.currentTarget.value))}
                        className="w-14 text-center"
                      />
                    </label>
                  )}
                </div>
                {activePromptTab === "grid" && (
              <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
                <input
                  readOnly
                  value={lang === "zh" ? "指令：点击左侧行按钮发送…" : "COMMAND: click a row button to send…"}
                  className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[var(--text-muted)] outline-none"
                />
                <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                  {lang === "zh" ? "预设" : "Prompt"}
                </Button>
                <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                  Idx
                </Button>
                <Button className="rounded bg-[var(--accent)] px-3 py-1.5 text-white">
                  {lang === "zh" ? "开始" : "Start"}
                </Button>
                <input
                  readOnly
                  value={lang === "zh" ? "总次数" : "Total Times"}
                  className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[var(--text-muted)] outline-none"
                />
                <Button className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
                  {lang === "zh" ? "停止" : "Stop"}
                </Button>
              </div>
            )}
          </div>

          {/* Scrollable command rows / YAML editor */}
          {activePromptTab === "grid" ? (
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
                    className="grid grid-cols-[28px_28px_60px_minmax(100px,1fr)_36px_56px_54px] items-center gap-x-1.5 border-b border-[var(--border)] px-2 py-1 last:border-0 hover:bg-[var(--bg-hover)]"
                  >
                    <div className="flex justify-center">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                        {row.id}
                      </span>
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={row.selected}
                        onChange={(e) => updatePromptRow(row.id, { selected: e.currentTarget.checked })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleSendPromptRow(row)}
                    >
                      {t("prompt_sender", lang)}
                    </Button>
                    <Input
                      value={row.command}
                      onChange={(e) => updatePromptRow(row.id, { command: e.currentTarget.value })}
                      onKeyDown={(e) => handleCommandKeyDown(e, row)}
                      ref={(el: HTMLInputElement) => { commandRefs.current[row.id] = el; }}
                      placeholder={t("command_placeholder", lang)}
                      className="bg-transparent"
                    />
                    <div className="flex justify-center">
                      <Checkbox
                        checked={row.isHex}
                        onChange={(e) => updatePromptRow(row.id, { isHex: e.currentTarget.checked })}
                      />
                    </div>
                    <Select
                      value={row.ender}
                      onChange={(e) => updatePromptRow(row.id, { ender: e.currentTarget.value as "" | "\r\n" | "\r" | "\n" })}
                    >
                      <option value="\r\n">{t("ender_crlf", lang)}</option>
                      <option value="">{t("ender_none", lang)}</option>
                      <option value="\n">{t("ender_lf", lang)}</option>
                      <option value="\r">{t("ender_cr", lang)}</option>
                    </Select>
                    <Input
                      value={row.interval}
                      onChange={(e) => updatePromptRow(row.id, { interval: e.currentTarget.value })}
                      placeholder={t("interval_placeholder", lang)}
                      className="text-center"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Save action inline */}
              {configAction === "save" && (
                <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--bg-input)]">
                  <input
                    value={configName}
                    onChange={(e) => setConfigName(e.currentTarget.value)}
                    placeholder={t("config_name_hint", lang)}
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && configName.trim()) handleSaveConfig(configName.trim());
                      if (e.key === "Escape") setConfigAction(null);
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!configName.trim()}
                    onClick={() => handleSaveConfig(configName.trim())}
                    className="px-2 py-1 text-[11px]"
                  >
                    {t("save_config", lang)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfigAction(null)}
                    className="px-2 py-1 text-[11px]"
                  >
                    {lang === "zh" ? "取消" : "Cancel"}
                  </Button>
                </div>
              )}

              {/* Load action inline */}
              {configAction === "load" && (
                <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-input)]">
                  {savedConfigs.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {t("no_configs", lang)}
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border)] max-h-32 overflow-y-auto">
                      {savedConfigs.map((name) => (
                        <div key={name} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]">
                          <button
                            type="button"
                            className="flex-1 text-left text-[var(--text-primary)]"
                            onClick={() => handleLoadConfig(name)}
                          >
                            {name}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteConfig(name)}
                            className="rounded px-1 py-0.5 text-[var(--text-muted)] hover:text-rose-500 transition-colors text-[10px]"
                          >
                            {lang === "zh" ? "删除" : "Del"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-3 py-1.5 border-t border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => setConfigAction(null)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      {lang === "zh" ? "取消" : "Cancel"}
                    </button>
                  </div>
                </div>
              )}

              <YamlEditor
                value={yamlText}
                onChange={handleYamlChange}
                error={yamlError}
                lang={lang}
              />
            </>
          )}
        </div>
            </>
          )}
      </main>

      {/* ── Status bar ── */}
      <div className="shrink-0 px-2 pb-2">
        <StatusBar
          isConnected={isConnected}
          statusText={statusText}
          currentPortLabel={currentPortLabel}
          onOpenConfigDir={handleOpenConfigDir}
          configDirTooltip={lang === "zh" ? "打开配置目录" : "Open config folder"}
        />
      </div>

      <SettingsModal
        open={settingsOpen}
        hotkeys={settings.hotkeys}
        theme={settings.theme}
        lang={settings.lang}
        compactMode={settings.compactMode}
        layoutMode={settings.layoutMode}
        gridLayout={settings.gridLayout}
        onClose={() => setSettingsOpen(false)}
        onHotkeysChange={updateHotkeys}
        onThemeChange={updateTheme}
        onThemeReset={resetTheme}
        onLangChange={updateLang}
        onCompactModeChange={updateCompactMode}
        onLayoutModeChange={updateLayoutMode}
        onGridLayoutChange={updateGridLayout}
      />
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

export default App;
