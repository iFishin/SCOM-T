import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Settings } from "lucide-react";
import { GridLayout } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { AboutPanel } from "./components/settings/AboutPanel.tsx";
import { ConfigPanel } from "./components/ConfigPanel.tsx";
import { FileSend } from "./components/FileSend.tsx";
import { HotkeysPanel } from "./components/HotkeysPanel.tsx";
import { PromptPanel } from "./components/PromptPanel.tsx";
import { SendPanel } from "./components/SendPanel.tsx";
import { ReceiveLog } from "./components/ReceiveLog.tsx";
import { StatusBar } from "./components/ui/StatusBar.tsx";
import { Button } from "./components/ui/Button.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { ContextMenu } from "./components/ui/ContextMenu.tsx";
import { TourGuide, type TourStep } from "./components/ui/TourGuide.tsx";
import { ToastContainer, useToast } from "./components/ui/Toast.tsx";
import { LogEditor } from "./components/LogEditor.tsx";
import { appLogger } from "./utils/appLogger.ts";
import { useSettings, type HotkeyConfig } from "./hooks/useSettings.ts";
import { useLogFile } from "./hooks/useLogFile.ts";
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

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [logViewerContent, setLogViewerContent] = useState("");
  const [tourOpen, setTourOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
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
    flowControl: "none",
    rts: false,
    dtr: false,
    connectionType: "serial",
    tcpHost: "",
    tcpPort: 23,
    tcpProtocol: "rfc2217",
  });

  const { toasts, pushToast, removeToast } = useToast();
  const { settings, loaded, updateHotkeys, updateTheme, resetTheme, updatePromptRowCount, updateLang, updateCompactMode, updateCloseBehavior, updateAllowMultiInstance, updateLayoutMode, updateGridLayout, updateNotificationUrl } = useSettings();
  const lang = settings.lang ?? "zh";

  const { containerRef, leftWidth, onDividerMouseDown } = useHSplit(
    typeof window !== "undefined" ? Math.floor(window.innerWidth / 2) : 480,
  );
  const {
    ports, logs, isConnected, isBusy, statusText, connectedPort,
    error, fileSendProgress, logCapWarning,
    refreshPorts, openPort, closePort, sendData, sendFile, clearLogs,
    tcpConnectionStatus, tcpServerStatus, tcpServerClients, latencyMs, setSignals,
  } = useSerialPort({ config, receiveMode });

  const logFile = useLogFile();
  // Sync logs to log file hook via ref (no re-render trigger)
  useEffect(() => { logFile.syncLogs(logs); }, [logs]);

  // ── App logger initialisation ──
  useEffect(() => {
    appLogger.init().then(() => {
      appLogger.info("App", "SCOM-T started");
    });
  }, []);

  // ── Log viewer ──
  const handleOpenLogViewer = useCallback(async () => {
    if (!appLogger.ready) {
      setLogViewerContent("Logger not ready yet. Please try again.");
      setLogViewerOpen(true);
      return;
    }
    try {
      const path = await appLogger.getTodayPath();
      if (!path) {
        setLogViewerContent("Unable to determine log path.");
        setLogViewerOpen(true);
        return;
      }
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const content = await readTextFile(path).catch(() => "");
      setLogViewerContent(content || "No log entries yet.");
      setLogViewerOpen(true);
    } catch {
      setLogViewerContent("Failed to read log file.");
      setLogViewerOpen(true);
    }
  }, []);

  // ── Log key events ──
  const prevConnectedRef = useRef(isConnected);
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      appLogger.info("Serial", `Port ${config.path} opened @ ${config.baudRate}`);
    } else if (!isConnected && prevConnectedRef.current) {
      appLogger.info("Serial", `Port ${config.path} closed`);
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, config.path, config.baudRate]);

  const prevTcpStatus = useRef(tcpConnectionStatus);
  useEffect(() => {
    if (tcpConnectionStatus === "connected" && prevTcpStatus.current !== "connected") {
      appLogger.info("TCP", `Connected to ${config.tcpHost}:${config.tcpPort}`);
    } else if (tcpConnectionStatus === "disconnected" && prevTcpStatus.current === "connected") {
      appLogger.info("TCP", `Disconnected from ${config.tcpHost}:${config.tcpPort}`);
    }
    prevTcpStatus.current = tcpConnectionStatus;
  }, [tcpConnectionStatus, config.tcpHost, config.tcpPort]);

  const prevSvrStatus = useRef(tcpServerStatus);
  useEffect(() => {
    if (tcpServerStatus === "running" && prevSvrStatus.current !== "running") {
      appLogger.info("TCP-Server", `Started on port ${config.tcpPort}`);
    } else if (tcpServerStatus === "stopped" && prevSvrStatus.current === "running") {
      appLogger.info("TCP-Server", "Stopped");
    }
    prevSvrStatus.current = tcpServerStatus;
  }, [tcpServerStatus, config.tcpPort]);

  const [topCollapsed, setTopCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightSendCollapsed, setRightSendCollapsed] = useState(true);
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

  const prevError = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== prevError.current) pushToast(error, "error");
    prevError.current = error;
  }, [error]);

  // ── Native event prevention & custom context menu ──

  const PREVENT_KEYS = ["f5", "f11", "f12"];
  const PREVENT_COMBO = (e: KeyboardEvent) =>
    (e.ctrlKey && ["a", "f", "r", "n", "p", "u", "s"].includes(e.key.toLowerCase())) ||
    (e.ctrlKey && e.shiftKey && ["i", "j"].includes(e.key.toLowerCase())) ||
    (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // 让输入框/文本域/下拉框/可编辑元素的快捷键正常运作
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }

      if (PREVENT_KEYS.includes(e.key.toLowerCase()) || PREVENT_COMBO(e)) {
        e.preventDefault();
      }
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    }
    function onDragOver(e: DragEvent) { e.preventDefault(); }
    function onDrop(e: DragEvent) { e.preventDefault(); }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  // ── System tray: show-about event ──
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function setup() {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("show-about", () => setAboutOpen(true));
    }
    setup();
    return () => unlisten?.();
  }, []);

  // ── Single-instance check ──
  useEffect(() => {
    if (!loaded) return;
    if (settings.allowMultiInstance) return;
    async function check() {
      const { invoke } = await import("@tauri-apps/api/core");
      const ok = await invoke<boolean>("try_claim_instance");
      if (!ok) {
        pushToast(lang === "zh" ? "SCOM-T 已在运行" : "SCOM-T is already running", "warn");
        // Give user a moment to see the toast, then focus the existing window
        await new Promise((r) => setTimeout(r, 500));
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
      }
    }
    check();
  }, [loaded, settings.allowMultiInstance]);

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

  // ── Tour steps ──
  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "#tour-config",
        title: lang === "zh" ? "串口配置" : "Serial Configuration",
        content:
          lang === "zh"
            ? "选择串口端口、波特率、数据位等参数，然后点击「打开端口」开始连接。\n\n高级选项中可配置流控和 RTS/DTR 信号。"
            : "Select the serial port, baud rate, and data bits, then click「Open Port」to connect.\n\nAdvanced options include flow control and RTS/DTR signals.",
      },
      {
        target: "#tour-send",
        title: lang === "zh" ? "发送数据" : "Send Data",
        content:
          lang === "zh"
            ? "在输入框中输入指令，按 Enter 发送。支持 ASCII 和 HEX 两种模式。\n\nShift+Enter 可换行输入多行内容。"
            : "Type your command and press Enter to send. Supports ASCII and HEX modes.\n\nShift+Enter inserts a newline for multi-line input.",
      },
      {
        target: "#tour-receive",
        title: lang === "zh" ? "日志接收" : "Receive Log",
        content:
          lang === "zh"
            ? "此处显示串口收到的所有数据。支持卡片视图、文本视图和十六进制视图三种展示方式。\n\n右上角按钮可搜索、复制或清空日志。"
            : "All received serial data is shown here. Supports Card, Text, and Hex Dump views.\n\nUse the toolbar buttons to search, copy, or clear logs.",
      },
      {
        target: "#tour-prompts",
        title: lang === "zh" ? "指令组" : "Command Prompts",
        content:
          lang === "zh"
            ? "预设和管理常用的串口指令。网格视图中每一行为一条指令，可设置结尾符和发送间隔。\n\n还支持 YAML 配置编辑和批量文本导入。"
            : "Pre-set and manage common serial commands. Each row in the grid is one command with configurable ender and interval.\n\nAlso supports YAML config editing and batch text import.",
      },
      {
        target: "#tour-settings-btn",
        title: lang === "zh" ? "设置与热键" : "Settings & Hotkeys",
        content:
          lang === "zh"
            ? "在这里调整主题、字体、语言、紧凑模式等全局设置。\n\n还可以为常用指令绑定快捷键，实现一键发送。"
            : "Customize theme, fonts, language, compact mode, and more.\n\nYou can also bind hotkeys to frequently used commands for one-click sending.",
      },
    ],
    [lang],
  );

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
            onLayoutChange={gridEditing ? (newLayout: Layout) =>
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
            : undefined}
          >
            <div key="config" id="tour-config" className="overflow-hidden rounded-lg">
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
                tcpConnectionStatus={tcpConnectionStatus}
                tcpServerStatus={tcpServerStatus}
                tcpServerClients={tcpServerClients}
                onRefresh={handleRefreshPorts}
                onConfigChange={setConfig}
                onOpen={openPort}
                onClose={closePort}
              />
            </div>

            <div key="send" id="tour-send" className="overflow-hidden rounded-lg">
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

            <div key="receive" id="tour-receive" className="overflow-hidden flex flex-col rounded-lg">
              <ReceiveLog
                logs={logs}
                lang={lang}
                savePath={logFile.savePath}
                realTimeLog={logFile.realTime}
                logCapWarning={logCapWarning}
                onClearAll={() => clearLogs("all")}
                onClearReceived={() => clearLogs("received")}
                onClearSent={() => clearLogs("sent")}
                onSelectLogFile={logFile.selectLogFile}
                onToggleRealTime={() => logFile.setRealTime((v) => !v)}
                onFlushLogs={() => logFile.flushAll(logs)}
                onCloseLogFile={logFile.closeLogFile}
              />
            </div>

            <div key="prompts" id="tour-prompts" className="overflow-hidden flex flex-col">
              <PromptPanel variant="grid" isConnected={isConnected} sendData={sendData} lang={lang} promptRowCount={settings.promptRowCount} updatePromptRowCount={updatePromptRowCount} pushToast={pushToast} />
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
            <img src="/favicon.png" alt="Logo" className="h-8 w-8" />
          </div>
        </div>

        {/* Menu bar */}
        <nav className="flex items-center gap-0.5">
          <Button
            type="button"
            id="tour-settings-btn"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <Settings size={14} />
            {t("settings_title", lang)}
          </Button>
          <Button
            type="button"
            onClick={() => setTourOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <span>{t("help", lang)}</span>
          </Button>
          <Button
            type="button"
            onClick={handleOpenLogViewer}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <span>{t("app_logs", lang)}</span>
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
                {t("close", lang)}
              </Button>
            </div>
            <div className="p-4">
              <AboutPanel lang={lang} notificationUrl={settings.notificationUrl} />
            </div>
          </div>
        </div>
      )}

      {/* ── Log viewer modal ── */}
      {logViewerOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLogViewerOpen(false);
          }}
        >
          <LogEditor
            initialContent={logViewerContent}
            lang={lang}
            onClose={() => setLogViewerOpen(false)}
          />
        </div>
      )}

      {tourOpen && (
        <TourGuide
          steps={tourSteps}
          lang={lang}
          onFinish={() => setTourOpen(false)}
          onSkip={() => setTourOpen(false)}
        />
      )}

      {/* ── Main content ── */}
      <main ref={containerRef} className="flex min-h-0 flex-1 gap-0 overflow-hidden p-2">
        {settings.layoutMode === "grid" && renderGridLayout()}
        {settings.layoutMode !== "grid" && (
          <>
            {/* Left column — stretches when right is collapsed */}
            <div
              className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${
                rightCollapsed ? "flex-1" : "shrink-0"
              }`}
              style={!rightCollapsed ? { width: leftWidth } : {}}
            >
              {/* Config card — collapsed or expanded */}
              {topCollapsed ? (
                <div
                  onClick={() => setTopCollapsed(false)}
                  className="shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 transition-colors hover:bg-[var(--bg-input)]"
                >
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <ChevronDown size={14} />
                    <span className="font-semibold uppercase tracking-widest">
                      {currentPortLabel}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]"}`} />
                      <span>{statusText}</span>
                    </span>
                  </div>
                </div>
              ) : (
                <div id="tour-config" className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                    {lang === "zh" ? "配置" : "Config"}
                  </div>
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
                    tcpConnectionStatus={tcpConnectionStatus}
                    tcpServerStatus={tcpServerStatus}
                    tcpServerClients={tcpServerClients}
                    onRefresh={handleRefreshPorts}
                    onConfigChange={setConfig}
                    onOpen={openPort}
                    onClose={closePort}
                    onSetSignals={setSignals}
                  />
                </div>
              )}

              {/* Collapse divider for config card — only when expanded */}
              {!topCollapsed && (
                <div className="group relative my-0.5 flex h-3 shrink-0 cursor-pointer items-center justify-center">
                  <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setTopCollapsed(true)}
                      className="flex items-center justify-center rounded bg-[var(--bg-surface)] px-1 py-3 text-[10px] text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text-primary)]"
                      style={{ writingMode: "vertical-lr" }}
                    >
                      <ChevronUp size={10} className="mb-1" />
                      {t("collapse", lang)}
                    </button>
                  </div>
                  <div className="h-px w-full rounded-full bg-[var(--border)]" />
                </div>
              )}

              {/* Receive log */}
              <div id="tour-receive" className="min-h-0 flex-1 flex flex-col pt-2">
                <ReceiveLog
                  logs={logs}
                  lang={lang}
                  savePath={logFile.savePath}
                  realTimeLog={logFile.realTime}
                  logCapWarning={logCapWarning}
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

            {/* Drag handle + collapse button for right column */}
            <div className="group relative mx-1 flex w-2 shrink-0 items-center justify-center">
              {/* Resize drag area */}
              {!rightCollapsed && (
                <div
                  onMouseDown={onDividerMouseDown}
                  className="absolute inset-0 z-10 cursor-col-resize"
                />
              )}
              {/* Visual line */}
              <div
                className={`h-full w-px rounded-full bg-[var(--border)] transition-all ${
                  rightCollapsed
                    ? ""
                    : "group-hover:w-0.5 group-hover:bg-[var(--accent)] group-active:bg-[var(--accent)]"
                }`}
              />
              {/* Collapse / expand button */}
              {rightCollapsed ? (
                <button
                  type="button"
                  onClick={() => setRightCollapsed(false)}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded bg-[var(--bg-surface)] px-1 py-3 text-[10px] text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text-primary)] whitespace-nowrap"
                  style={{ writingMode: "vertical-lr" }}
                >
                  <ChevronLeft size={10} className="mb-1" />
                  {t("expand", lang)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRightCollapsed(true)}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded bg-[var(--bg-surface)] px-1 py-3 text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm ring-1 ring-[var(--border)] hover:text-[var(--text-primary)] whitespace-nowrap"
                  style={{ writingMode: "vertical-lr" }}
                >
                  <ChevronRight size={10} className="mb-1" />
                  {t("collapse", lang)}
                </button>
              )}
            </div>

            {/* Right column — hidden when collapsed */}
            {!rightCollapsed && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {/* Send card */}
                <div id="tour-send" className="shrink-0">
                  {!rightSendCollapsed && (
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
                      mode="combined"
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
                  )}
                </div>

                {/* Collapse divider for send card */}
                {rightSendCollapsed ? (
                  <div
                    onClick={() => setRightSendCollapsed(false)}
                    className="shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 transition-colors hover:bg-[var(--bg-input)]"
                  >
                    <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <ChevronDown size={12} />
                      <span className="font-semibold uppercase tracking-widest">
                        {t("send", lang)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="group relative my-0.5 flex h-3 shrink-0 cursor-pointer items-center justify-center">
                    <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setRightSendCollapsed(true)}
                        className="flex items-center justify-center rounded bg-[var(--bg-surface)] px-1 py-3 text-[10px] text-[var(--text-muted)] shadow-sm ring-1 ring-[var(--border)] transition-colors hover:text-[var(--text-primary)]"
                        style={{ writingMode: "vertical-lr" }}
                      >
                        <ChevronUp size={10} className="mb-1" />
                        {t("collapse", lang)}
                      </button>
                    </div>
                    <div className="h-px w-full rounded-full bg-[var(--border)]" />
                  </div>
                )}

                {/* Prompt panel */}
                <div id="tour-prompts" className="min-h-0 flex-1 flex flex-col pt-2">
                  <PromptPanel variant="panel" isConnected={isConnected} sendData={sendData} lang={lang} promptRowCount={settings.promptRowCount} updatePromptRowCount={updatePromptRowCount} pushToast={pushToast} />
                </div>
              </div>
            )}
            </>
          )}
      </main>

      {/* ── Status bar ── */}
      <div className="shrink-0 px-2 pb-2">
        <StatusBar
          isConnected={isConnected}
          statusText={statusText}
          currentPortLabel={currentPortLabel}
          latencyMs={latencyMs}
        />
      </div>

      <SettingsModal
        open={settingsOpen}
        hotkeys={settings.hotkeys}
        theme={settings.theme}
        lang={settings.lang}
        compactMode={settings.compactMode}
        closeToTray={settings.closeToTray}
        allowMultiInstance={settings.allowMultiInstance}
        notificationUrl={settings.notificationUrl}
        layoutMode={settings.layoutMode}
        gridLayout={settings.gridLayout}
        onClose={() => setSettingsOpen(false)}
        onHotkeysChange={updateHotkeys}
        onThemeChange={updateTheme}
        onThemeReset={resetTheme}
        onLangChange={updateLang}
        onCompactModeChange={updateCompactMode}
        onCloseBehaviorChange={updateCloseBehavior}
        onAllowMultiInstanceChange={updateAllowMultiInstance}
        onNotificationUrlChange={updateNotificationUrl}
        onLayoutModeChange={updateLayoutMode}
        onGridLayoutChange={updateGridLayout}
      />
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* ── Custom context menu ── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            {
              id: "copy",
              label: lang === "zh" ? "复制" : "Copy",
              onClick: () => { void navigator.clipboard.writeText(document.getSelection()?.toString() ?? ""); },
            },
            {
              id: "select-all",
              label: lang === "zh" ? "全选" : "Select All",
              onClick: () => { document.getSelection()?.selectAllChildren(document.body); },
            },
            { id: "sep1", label: "", separator: true, onClick: () => {} },
            {
              id: "about",
              label: lang === "zh" ? "关于" : "About",
              onClick: () => setAboutOpen(true),
            },
          ]}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

export default App;
