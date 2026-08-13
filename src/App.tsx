import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronLeft, ChevronRight, Settings, Eye, Wrench, HelpCircle, FileText, Info, Cloud } from "lucide-react";
import { GridLayout } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { AboutPanel } from "./components/settings/AboutPanel.tsx";
import { HelpDialog } from "./components/HelpDialog.tsx";
import { ShortcutsDialog } from "./components/ShortcutsDialog.tsx";
import { SignalDialog } from "./components/signal/SignalDialog.tsx";
import { TrafficDialog } from "./components/signal/TrafficDialog.tsx";
import { HealthDialog } from "./components/signal/HealthDialog.tsx";
import { WaveformDialog } from "./components/signal/WaveformDialog.tsx";
import { ResponseSetPage } from "./components/ResponseSetPage.tsx";
import { MarketplacePage } from "./components/MarketplacePage.tsx";
import { StringGeneratorDialog, StringCheckerDialog } from "./components/tools/StringTools.tsx";
import { CodecDialog } from "./components/tools/CodecDialog.tsx";
import { PromptPanel } from "./components/PromptPanel.tsx";
import { SendPanel } from "./components/SendPanel.tsx";
import { ReceiveLog, formatLogsAsText } from "./components/ReceiveLog.tsx";
import { StatusBar } from "./components/ui/StatusBar.tsx";
import { Button } from "./components/ui/Button.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { ContextMenu } from "./components/ui/ContextMenu.tsx";
import { TourGuide, type TourStep } from "./components/ui/TourGuide.tsx";
import { ToastContainer, useToast } from "./components/ui/Toast.tsx";
import { LogViewer } from "./components/LogViewer.tsx";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useHotkeys } from "./hooks/useHotkeys.ts";
import { useVersionCheck } from "./hooks/useVersionCheck.ts";
import { setTimestampFormat } from "./utils/hexConverter.ts";
import { appLogger } from "./utils/appLogger.ts";
import { useSettings, type HotkeyConfig } from "./hooks/useSettings.ts";
import { useLogFile } from "./hooks/useLogFile.ts";
import { t } from "./i18n.ts";
import type { SerialConfig } from "./hooks/useSerialPort.ts";
import { SessionManager } from "./components/SessionManager.tsx";
import type { SerialSession } from "./hooks/useSessionManager.ts";
import type { ActiveSessionData } from "./components/SessionManager.tsx";

const DEFAULT_NOTIFICATION_URL = "https://raw.githubusercontent.com/iFishin/notifications/main/scom-t/notifications.json";
const EMPTY_SIGNAL_STATES = { rts: false, dtr: false, cts: false, dsr: false, cd: false, ri: false };
const noopAsync = async () => {};
const noopRefresh = async () => 0;
const noopClearLogs = () => {};
const noopSendData = async (_value: string, _sendMode: import("./hooks/useSerialPort.ts").SendMode, _appendNewline: string) => {};
const noopSendFile = async (_filePath: string): Promise<number | void> => {};
const noopSignalHistory = () => [];

function useHSplit(defRatio = 0.5, minLeft = 220, minRight = 280) {
  const [tick, setTick] = useState(0);
  const [leftRatio, setLeftRatio] = useState(defRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const leftWidth = (containerRef.current
    ? Math.round(containerRef.current.clientWidth * leftRatio)
    : Math.round(typeof window !== "undefined" ? window.innerWidth * leftRatio : 800)) + (tick * 0);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  // Re-calculate on window resize
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = e.clientX - rect.left;
      const ratio = Math.max(minLeft / rect.width, Math.min(next / rect.width, 1 - minRight / rect.width));
      setLeftRatio(ratio);
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
  const [page, setPage] = useState<"main" | "responseSet" | "marketplace">("main");
  const [pendingApplyResponseSet, setPendingApplyResponseSet] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [logViewerContent, setLogViewerContent] = useState("");
  const [logFiles, setLogFiles] = useState<string[]>([]);
  const [logViewerSelectedFile, setLogViewerSelectedFile] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [cardNotifications, setCardNotifications] = useState<any[]>([]);
  const [appVersion, setAppVersion] = useState("0.0.0");
  const { updateAvailable, checkForUpdate } = useVersionCheck(appVersion);
  const [signalOpen, setSignalOpen] = useState(false);
  const [trafficOpen, setTrafficOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [waveformOpen, setWaveformOpen] = useState(false);
  const [vizMenu, setVizMenu] = useState<{ x: number; y: number } | null>(null);
  const [toolMenu, setToolMenu] = useState<{ x: number; y: number } | null>(null);
  const [helpMenu, setHelpMenu] = useState<{ x: number; y: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [stringGenOpen, setStringGenOpen] = useState(false);
  const [stringCheckOpen, setStringCheckOpen] = useState(false);
  const [codecOpen, setCodecOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [filePath, setFilePath] = useState("");
  const [sessionData, setSessionData] = useState<ActiveSessionData | null>(null);

  const { toasts, pushToast: rawPushToast, removeToast } = useToast();

  // ── Wrap pushToast to log errors to appLogger ──
  const pushToast = useCallback((msg: string, type?: import("./components/ui/Toast.tsx").ToastType) => {
    if (type === "error") {
      appLogger.error("UI", msg);
    }
    rawPushToast(msg, type);
  }, [rawPushToast]);
  const { settings, loaded, updateHotkeys, updateTheme, resetTheme, updatePromptRowCount, updateLang, updateCompactMode, updateCloseBehavior, updateAllowMultiInstance, updateLayoutMode, updateGridLayout, updateTimestampFormat, updateSendMode, updateReceiveMode, updateDisplayMode, updateAppendNewline, updateLogRetentionDays, updatePortFilterMode, updateTopCollapsed, updateRightCollapsed, updateMockSerial, updateCustomEnders, updateSessions, updateCloudServerUrl, updateCloudAuthToken, updateCloudUploaderName, updateRxIdleFlushMs, updateLogBatchFlushMs } = useSettings();
  const lang = settings.lang ?? "zh";
  const sendMode = settings.sendMode ?? "ascii";
  const receiveMode = settings.receiveMode ?? "ascii";
  const appendNewline = settings.appendNewline ?? "\r\n";
  const customEnders = settings.customEnders ?? [];

  const { containerRef, leftWidth, onDividerMouseDown } = useHSplit(
    0.5,
  );
  // ── The active tab is the only app-level serial data source ──
  const config: SerialConfig = sessionData?.config ?? {
    path: "", baudRate: 115200, dataBits: "8", parity: "none", stopBits: "1",
    flowControl: "none", rts: false, dtr: false, connectionType: "serial",
    tcpHost: "", tcpPort: 23, tcpProtocol: "rfc2217",
  };
  const logs = sessionData?.logs ?? [];
  const isConnected = sessionData?.isConnected ?? false;
  const isBusy = sessionData?.isBusy ?? false;
  const statusText = sessionData?.statusText ?? "未连接";
  const connectedPort = sessionData?.connectedPort ?? null;
  const error = sessionData?.error ?? null;
  const fileSendProgress = sessionData?.fileSendProgress ?? null;
  const logCapWarning = sessionData?.logCapWarning ?? false;
  const refreshPorts = sessionData?.refreshPorts ?? noopRefresh;
  const closePort = sessionData?.closePort ?? noopAsync;
  const sendData = sessionData?.sendData ?? noopSendData;
  const sendFile = sessionData?.sendFile ?? noopSendFile;
  const clearLogs = sessionData?.clearLogs ?? noopClearLogs;
  const tcpConnectionStatus = sessionData?.tcpConnectionStatus ?? "disconnected";
  const tcpServerStatus = sessionData?.tcpServerStatus ?? "stopped";
  const tcpServerClients = sessionData?.tcpServerClients ?? [];
  const latencyMs = sessionData?.latencyMs ?? null;
  const tcpServerBroadcast = sessionData?.tcpServerBroadcast;
  const txBytes = sessionData?.txBytes ?? 0;
  const rxBytes = sessionData?.rxBytes ?? 0;
  const txRate = sessionData?.txRate ?? 0;
  const rxRate = sessionData?.rxRate ?? 0;
  const latencyHistory = sessionData?.latencyHistory ?? [];
  const signalStates = sessionData?.signalStates ?? EMPTY_SIGNAL_STATES;
  const getSignalHistory = sessionData?.getSignalHistory ?? noopSignalHistory;
  const clearSerialBuffer = sessionData?.clearSerialBuffer ?? noopAsync;

  const activeLogs = logs;
  const activeIsConnected = isConnected;
  const activeConnectedPort = connectedPort;
  const activeSendData = sendData;
  const activeSendFile = async (selectedFilePath: string): Promise<void> => {
    await sendFile(selectedFilePath);
  };
  const activeTcpServerBroadcast = tcpServerBroadcast;
  const activeTcpClients = tcpServerClients;
  const activeError = error;

  const logFile = useLogFile();
  useEffect(() => { logFile.syncLogs(activeLogs); }, [activeLogs]);

  // ── Sync timestamp format setting ──
  useEffect(() => {
    setTimestampFormat(settings.timestampFormat ?? "datetime");
  }, [settings.timestampFormat]);

  // ── App logger initialisation ──
  useEffect(() => {
    appLogger.init().then(() => {
      appLogger.info("App", "SCOM-T started");
      // Clean up old log files based on retention setting
      const days = settings.logRetentionDays ?? 30;
      appLogger.cleanupOldFiles(days);
    });
  }, [settings.logRetentionDays]);

  const handleActiveSessionData = useCallback((data: ActiveSessionData) => {
    setSessionData(data);
  }, []);

  // ── Per-session config file management ──

  const handleSessionsChange = useCallback((incoming: SerialSession[]) => {
    // useSessionManager 内部状态不携带 activeConfigFile，合并保留
    const prevById = new Map((settings.sessions ?? []).map((s) => [s.id, s]));
    const merged = incoming.map((s) => ({
      ...s,
      activeConfigFile: prevById.get(s.id)?.activeConfigFile ?? "prompts.yaml",
    }));
    updateSessions(merged);
  }, [settings.sessions, updateSessions]);

  const updateSessionConfigFile = useCallback((sessionId: string, fileName: string) => {
    const next = (settings.sessions ?? []).map((s) =>
      s.id === sessionId ? { ...s, activeConfigFile: fileName } : s
    );
    updateSessions(next);
  }, [settings.sessions, updateSessions]);

  // Get the current session's activeConfigFile
  const currentSessionConfigFile = useMemo(() => {
    const session = (settings.sessions ?? []).find((s) => s.id === sessionData?.sessionId);
    return session?.activeConfigFile ?? "prompts.yaml";
  }, [settings.sessions, sessionData?.sessionId]);

  // ── Log viewer ──
  const handleOpenLogViewer = useCallback(async () => {
    if (!appLogger.ready) {
      setLogViewerContent("Logger not ready yet. Please try again.");
      setLogViewerOpen(true);
      return;
    }
    // Load the file list
    const files = await appLogger.listFiles();
    setLogFiles(files);
    const target = files[0] ?? null;
    setLogViewerSelectedFile(target);
    if (target) {
      const content = await appLogger.readFile(target);
      setLogViewerContent(content || "No log entries yet.");
    } else {
      setLogViewerContent("No log files available.");
    }
    setLogViewerOpen(true);
  }, []);

  const handleLoadLogFile = useCallback(async (name: string) => {
    setLogViewerSelectedFile(name);
    const content = await appLogger.readFile(name);
    setLogViewerContent(content || "No log entries yet.");
  }, []);

  const handleDeleteLogFile = useCallback(async (name: string) => {
    const ok = window.confirm(lang === "zh" ? `确认删除日志文件 "${name}"？` : `Delete log file "${name}"?`);
    if (!ok) return;
    await appLogger.deleteFile(name);
    pushToast(lang === "zh" ? `已删除 ${name}` : `Deleted ${name}`, "success");
    // Refresh list and select another file
    const files = await appLogger.listFiles();
    setLogFiles(files);
    const target = files[0] ?? null;
    setLogViewerSelectedFile(target);
    if (target) {
      const content = await appLogger.readFile(target);
      setLogViewerContent(content);
    } else {
      setLogViewerContent("No log files available.");
    }
  }, [lang, pushToast]);

  const handleNavigateToResponseSet = useCallback(() => setPage("responseSet"), []);
  const handleNavigateToMarketplace = useCallback(() => setPage("marketplace"), []);

  const handleAddToPrompts = useCallback((payload: string) => {
    // Clean: trim whitespace, split by newlines, filter empties
    const lines = payload.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      pushToast(lang === "zh" ? "没有可添加的指令" : "No commands to add", "warn");
      return;
    }
    pushToast(
      lang === "zh"
        ? `已获取 ${lines.length} 条指令: ${lines[0].slice(0, 30)}${lines.length > 1 ? `...` : ""}`
        : `Got ${lines.length} command(s): ${lines[0].slice(0, 30)}${lines.length > 1 ? `...` : ""}`,
      "success",
    );
  }, [lang, pushToast]);

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

  // ── TCP Server: new client → offer to sync logs ──
  const prevClientCountRef = useRef(0);
  useEffect(() => {
    const count = tcpServerClients.length;
    if (count > prevClientCountRef.current && prevClientCountRef.current > 0) {
      // New client connected
      const ok = window.confirm(
        lang === "zh"
          ? `新的 TCP 客户端已连接 (${tcpServerClients[count - 1]?.address ?? "unknown"})，是否将当前日志发送给所有客户端？`
          : `New TCP client connected (${tcpServerClients[count - 1]?.address ?? "unknown"}). Send current logs to all clients?`
      );
      if (ok && tcpServerBroadcast) {
        const text = formatLogsAsText(logs);
        const bytes = Array.from(new TextEncoder().encode(text));
        tcpServerBroadcast(bytes);
        pushToast(lang === "zh" ? `已同步 ${logs.length} 条日志` : `Synced ${logs.length} logs`, "success");
      }
    }
    prevClientCountRef.current = count;
  }, [tcpServerClients, tcpServerBroadcast, logs, lang, pushToast]);

  const topCollapsed = settings.topCollapsed ?? false;
  const rightCollapsed = settings.rightCollapsed ?? false;
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

  // 从配置/响应集/市场返回主界面时，主界面曾用 display:none（hidden）隐藏，
  // 期间 gridWidth 被测量为 0；ResizeObserver 要到下一帧才恢复，导致网格
  // 面板闪烁/错位/延迟渲染。这里在绘制前同步重新测量，消除延迟帧。
  useLayoutEffect(() => {
    if (page !== "main") return;
    const el = gridWidthRef.current?.parentElement;
    if (el) {
      setGridWidth(el.clientWidth - 16);
    }
  }, [page]);

  const prevError = useRef<string | null>(null);
  useEffect(() => {
    if (activeError && activeError !== prevError.current) pushToast(activeError, "error");
    prevError.current = activeError;
  }, [activeError, pushToast]);

  // ── Native event prevention & custom context menu ──

  const PREVENT_KEYS = ["f5", "f11", "f12"];
  const PREVENT_COMBO = (e: KeyboardEvent) =>
    (e.ctrlKey && ["a", "f", "r", "n", "p", "u", "s"].includes(e.key.toLowerCase())) ||
    (e.ctrlKey && e.shiftKey && ["i", "j"].includes(e.key.toLowerCase())) ||
    (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+W: close window (emergency exit when decorations:false)
      if (e.ctrlKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        getCurrentWindow().close().catch(console.error);
        return;
      }

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

  /** Compare semver strings, returns >0 if a > b */
  function compareVersion(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  // ── Startup notification check ──
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      let ver = appVersion;
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        ver = await getVersion();
        if (!cancelled) setAppVersion(ver);
      } catch { /* Tauri API not available */ }

      try {
        const res = await fetch(DEFAULT_NOTIFICATION_URL);
        const data = await res.json();
        if (cancelled) return;

        // Normalize to array
        const list: { id?: string; title?: string; body?: string; minVersion?: string; maxVersion?: string; display?: string; mode?: string; severity?: string; link?: string; date?: string }[] = Array.isArray(data) ? data : [data];
        const valid = list.filter((n) => n.title || n.body);
        if (valid.length === 0) return;

        // Filter by version range
        const versionFiltered = valid.filter((n) => {
          if (n.minVersion && compareVersion(ver, n.minVersion) < 0) return false;
          if (n.maxVersion && compareVersion(ver, n.maxVersion) > 0) return false;
          return true;
        });
        if (versionFiltered.length === 0) return;

        // Load seen IDs from localStorage
        let seenIds = new Set<string>();
        try {
          const raw = localStorage.getItem("scom_t_notification_seen");
          if (raw) seenIds = new Set<string>(JSON.parse(raw));
        } catch { /* ignore */ }

        // Separate card-mode from badge-mode notifications, apply seen tracking
        let newSeenIds = new Set(seenIds);
        const cardNotifications: typeof versionFiltered = [];
        const badgeNotifications: typeof versionFiltered = [];

        for (const n of versionFiltered) {
          const isAlways = n.display === "always";
          const isSeen = n.id && seenIds.has(n.id);

          if (isAlways || !isSeen) {
            // This notification should be shown
            if (n.mode === "card") {
              cardNotifications.push(n);
            } else {
              badgeNotifications.push(n);
            }
            // Mark as seen unless display:always
            if (!isAlways && n.id) {
              newSeenIds.add(n.id);
            }
          }
        }

        // Persist updated seen IDs
        if (newSeenIds.size !== seenIds.size) {
          try {
            localStorage.setItem("scom_t_notification_seen", JSON.stringify([...newSeenIds]));
          } catch { /* ignore */ }
        }

        // Show badge for badge-mode notifications
        if (badgeNotifications.length > 0) {
          setHasUnreadNotifications(true);
          pushToast(
            lang === "zh"
              ? `有 ${badgeNotifications.length} 条新通知，请查看「关于」`
              : `${badgeNotifications.length} new notification${badgeNotifications.length > 1 ? "s" : ""} — check About`,
            "info",
          );
        }

        // Show card modal for card-mode notifications
        if (cardNotifications.length > 0) {
          setCardNotifications(cardNotifications);
        }
      } catch { /* fetch failed, skip silently */ }
    })();
    return () => { cancelled = true; };
  }, [loaded]);

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
    // 等宽字体末尾追加中文字体兜底，避免日志/编辑器等 mono 区域中文
    // fallback 到宋体而与界面不一致（Consolas 等仅负责英文/数字等宽）。
    const monoWithCn = `${theme.monoFontFamily}, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC"`;
    root.style.setProperty("--mono-font-family", monoWithCn);
    // ── 扩展主题变量（可选字段，缺失时用 styles.css 静态默认）──
    root.style.setProperty("--bg-hover", theme.bgHover ?? "");
    root.style.setProperty("--text-placeholder", theme.textPlaceholder ?? "");
    root.style.setProperty("--border-focus", theme.borderFocus ?? "");
    root.style.setProperty("--accent-dark", theme.accentDark ?? "");
    root.style.setProperty("--accent-light", theme.accentLight ?? "");
    root.style.setProperty("--accent-muted", theme.accentMuted ?? "");
    root.style.setProperty("--radius-sm", `${theme.radiusSm ?? 0.375}rem`);
    root.style.setProperty("--radius-md", `${theme.radiusMd ?? 0.5}rem`);
    root.style.setProperty("--radius-lg", `${theme.radiusLg ?? 0.75}rem`);
    root.style.setProperty("--panel-padding", `${theme.panelPadding ?? 0.5}rem`);
    root.style.setProperty("--control-gap", `${theme.controlGap ?? 0.375}rem`);
    // density compact mode
    root.classList.toggle("density-compact", !!settings.compactMode);
  }, [settings.theme, settings.compactMode]);

  // ── Track window maximize state for custom title bar ──
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: () => void;

    win.isMaximized().then(setIsMaximized);
    win.onResized(async () => {
      const m = await win.isMaximized();
      setIsMaximized(m);
    }).then((fn) => { unlisten = fn; });

    return () => unlisten?.();
  }, []);

  // ── Random logo animation blip ──
  const [logoBlip, setLogoBlip] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      timer = setTimeout(() => {
        setLogoBlip(true);
        requestAnimationFrame(() => { requestAnimationFrame(() => setLogoBlip(false)); });
        schedule();
      }, 3000 + Math.random() * 7000);
    }
    schedule();
    return () => clearTimeout(timer);
  }, []);

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

  async function handleFileSelect() {
    const selected = await open({ multiple: false, directory: false });
    if (typeof selected === "string" && selected) setFilePath(selected);
  }

  function handleHotkeySend(hotkey: HotkeyConfig) {
    if (hotkey.actionType === "builtin") {
      switch (hotkey.builtinAction) {
        case "clear_log":
          clearLogs?.("all");
          return;
        case "clear_sent":
          clearLogs?.("sent");
          return;
        case "clear_received":
          clearLogs?.("received");
          return;
        case "refresh_ports":
          void refreshPorts?.().then((count) => pushToast(t("status_find_ports", lang, count), "success"));
          return;
        case "close_port":
          if (isConnected) void closePort?.();
          return;
        case "clear_serial_buffer":
          void clearSerialBuffer().then(() => pushToast(lang === "zh" ? "串口缓冲区已清空" : "Serial buffer cleared", "success"));
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

    void activeSendData(hotkey.command, hotkey.sendMode, hotkey.appendNewline).catch((sendError) => {
      appLogger.error("Serial", `Hotkey send failed: ${String(sendError)}`);
    });
  }

  // ── Window controls for custom title bar ──
  const winMinimize = useCallback(() => { getCurrentWindow().minimize().catch(console.error); }, []);
  const winToggleMaximize = useCallback(() => { getCurrentWindow().toggleMaximize().catch(console.error); }, []);
  const winClose = useCallback(() => { getCurrentWindow().close().catch(console.error); }, []);

  // ── Hotkeys — must be at App level so they work regardless of SendPanel collapse ──
  useHotkeys(settings.hotkeys, isConnected, handleHotkeySend);

  function renderGridLayout() {
    return (
      <div className="relative flex h-full w-full min-h-0 flex-col overflow-y-auto">
        {/* Editing toggle */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-2 py-1">
          {gridEditing && (
            <span className="text-theme-10 text-[var(--accent)] font-semibold">
              {lang === "zh" ? "📐 编辑模式 — 拖拽卡片调整布局" : "📐 Edit mode — drag cards to rearrange"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setGridEditing((v) => !v)}
            className={`rounded px-2 py-0.5 text-theme-10 font-semibold transition-colors ${
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
            <div key="config" id="tour-config" className="overflow-hidden rounded-lg flex flex-col">
              <SessionManager
                lang={lang}
                receiveMode={receiveMode}
                displayMode={settings.displayMode ?? "card"}
                onDisplayModeChange={updateDisplayMode}
                portFilterMode={settings.portFilterMode ?? "default"}
                mockSerial={settings.mockSerial}
                rxIdleFlushMs={settings.rxIdleFlushMs ?? 50}
                logBatchFlushMs={settings.logBatchFlushMs ?? 50}
                onActiveSessionData={handleActiveSessionData}
                onAddToPrompts={handleAddToPrompts}
                onSessionsChange={handleSessionsChange}
              />
            </div>

            <div key="send" id="tour-send" className="overflow-hidden rounded-lg">
              <SendPanel
                value={message}
                sendMode={sendMode}
                appendNewline={appendNewline}
                customEnders={customEnders}
                receiveMode={receiveMode}
                isConnected={activeIsConnected}
                isBusy={isBusy}
                hotkeys={settings.hotkeys}
                filePath={filePath}
                fileSendProgress={fileSendProgress}
                lang={lang}
                mode="tabbed"
                onChange={setMessage}
                onSendModeChange={updateSendMode}
                onReceiveModeChange={updateReceiveMode}
                onAppendNewlineChange={updateAppendNewline}
                onSend={() => activeSendData?.(message, sendMode, appendNewline)}
                onClearSent={() => clearLogs("sent")}
                onFileSelect={handleFileSelect}
                onFileSend={() => activeSendFile(filePath)}
                onHotkeySend={handleHotkeySend}
                onPushToast={pushToast}
                tcpClientCount={activeTcpClients.length}
                onBroadcastToClients={(text) => {
                  const bytes = Array.from(new TextEncoder().encode(text));
                  activeTcpServerBroadcast?.(bytes);
                }}
              />
            </div>

            <div key="receive" id="tour-receive" className="overflow-hidden flex flex-col rounded-lg">
              <ReceiveLog
                logs={activeLogs}
                lang={lang}
                savePath={logFile.savePath}
                realTimeLog={logFile.realTime}
                logCapWarning={logCapWarning}
                onClearAll={() => clearLogs("all")}
                onClearReceived={() => clearLogs("received")}
                onClearSent={() => clearLogs("sent")}
                displayMode={settings.displayMode ?? "card"}
                onDisplayModeChange={updateDisplayMode}
                onSelectLogFile={logFile.selectLogFile}
                onToggleRealTime={() => logFile.setRealTime((v) => !v)}
                onFlushLogs={() => logFile.flushAll(logs)}
                onCloseLogFile={logFile.closeLogFile}
                onAddToPrompts={handleAddToPrompts}
              />
            </div>

            <div key="prompts" id="tour-prompts" className="overflow-hidden flex flex-col">
              <PromptPanel variant="grid" isConnected={activeIsConnected} sendData={activeSendData} customEnders={customEnders} lang={lang} promptRowCount={settings.promptRowCount} updatePromptRowCount={updatePromptRowCount} pushToast={pushToast} onNavigateToResponseSet={handleNavigateToResponseSet} pendingApplyResponseSet={pendingApplyResponseSet} onClearPendingApply={() => setPendingApplyResponseSet(null)} activeConfigFile={currentSessionConfigFile} onActiveConfigFileChange={(fileName) => updateSessionConfigFile(sessionData?.sessionId ?? "", fileName)} logs={activeLogs} tcpServerBroadcast={activeTcpServerBroadcast} tcpClientCount={activeTcpClients.length} />
            </div>
          </GridLayout>
      </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header
        className="flex h-11 shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-surface)] pl-2 pr-0 select-none"
        style={{ WebkitAppRegion: "drag", appRegion: "drag" } as React.CSSProperties}
      >
        {/* Logo */}
        {page === "main" && (
        <div className="flex items-center shrink-0 pl-1 pr-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg">
            <img
              src="/favicon.png"
              alt="Logo"
              className={`h-8 w-8 animate-logo-float ${logoBlip ? "animate-logo-blip" : ""}`}
            />
          </div>
        </div>
        )}

        {page === "responseSet" || page === "marketplace" ? (
          /* Sub-page header controls — shared breadcrumb style */
          <nav className="flex items-center gap-2 flex-1 min-w-0">
            <Button
              type="button"
              onClick={() => setPage("main")}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition-colors bg-transparent hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
              style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
            >
              <ChevronLeft size={14} />
              {lang === "zh" ? "返回" : "Back"}
            </Button>
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {page === "responseSet"
                ? t("response_set", lang)
                : t("marketplace_title", lang)}
            </span>
          </nav>
        ) : (
          /* Main menu bar */
        <nav className="flex items-center gap-0.5 flex-1 min-w-0">
          <Button
            type="button"
            id="tour-settings-btn"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors bg-transparent hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <Settings size={14} />
            {t("settings_title", lang)}
          </Button>
          <Button
            type="button"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setHelpMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors bg-transparent hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <HelpCircle size={14} />
            <span>{t("help", lang)}</span>
          </Button>
          {helpMenu && (
            <ContextMenu
              x={helpMenu.x}
              y={helpMenu.y}
              onClose={() => setHelpMenu(null)}
              items={[
                { id: "guide", label: lang === "zh" ? "新手引导" : "Tour Guide", onClick: () => setTourOpen(true) },
                { id: "docs", label: lang === "zh" ? "帮助文档" : "Help Docs", onClick: () => setHelpOpen(true) },
                { id: "shortcuts", label: lang === "zh" ? "快捷键" : "Shortcuts", onClick: () => setShortcutsOpen(true) },
                { id: "sep", label: "", separator: true, onClick: () => {} },
                { id: "logs", label: lang === "zh" ? "查看程序日志" : "App Logs", onClick: handleOpenLogViewer },
                { id: "about", label: lang === "zh" ? "关于" : "About", onClick: () => setAboutOpen(true) },
              ]}
            />
          )}
          <Button
            type="button"
            onClick={handleOpenLogViewer}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors bg-transparent hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <FileText size={14} />
            <span>{t("app_logs", lang)}</span>
          </Button>
          <Button
            type="button"
            onClick={handleNavigateToMarketplace}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors bg-transparent hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <Cloud size={14} />
            <span>{t("marketplace_title", lang)}</span>
          </Button>
          <span className="w-px h-4 bg-[var(--border)] mx-1" />
          <Button
            type="button"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setVizMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors bg-transparent hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <Eye size={14} />
            {lang === "zh" ? "视图" : "View"}
          </Button>
          {vizMenu && (
            <ContextMenu
              x={vizMenu.x}
              y={vizMenu.y}
              onClose={() => setVizMenu(null)}
              items={[
                { id: "signal", label: `${lang === "zh" ? "信号状态" : "Signal Status"}`, onClick: () => setSignalOpen(true) },
                { id: "traffic", label: `${lang === "zh" ? "流量监控" : "Traffic Monitor"}`, onClick: () => setTrafficOpen(true) },
                { id: "health", label: `${lang === "zh" ? "连接健康" : "Connection Health"}`, onClick: () => setHealthOpen(true) },
                { id: "waveform", label: `${lang === "zh" ? "信号波形" : "Signal Waveform"}`, onClick: () => setWaveformOpen(true) },
              ]}
            />
          )}
          <Button
            type="button"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setToolMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors bg-transparent hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <Wrench size={14} />
            {lang === "zh" ? "工具" : "Tools"}
          </Button>
          {toolMenu && (
            <ContextMenu
              x={toolMenu.x}
              y={toolMenu.y}
              onClose={() => setToolMenu(null)}
              items={[
                { id: "string-gen", label: `${lang === "zh" ? "字符串生成" : "String Generator"}`, onClick: () => setStringGenOpen(true) },
                { id: "string-check", label: `${lang === "zh" ? "字符串检查" : "String Checker"}`, onClick: () => setStringCheckOpen(true) },
                { id: "codec", label: `${lang === "zh" ? "编码转换" : "Codec"}`, onClick: () => setCodecOpen(true) },
              ]}
            />
          )}
          <span className="w-px h-4 bg-[var(--border)] mx-1" />
          <Button
            type="button"
            onClick={() => { setAboutOpen(true); setHasUnreadNotifications(false); void checkForUpdate(); }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors bg-transparent hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <span className="relative inline-flex items-center justify-center gap-1.5">
              <Info size={14} />
              <span>{t("about", lang)}</span>
              {(hasUnreadNotifications || updateAvailable) && (
                <span className="absolute -right-2 -top-1 inline-block h-2 w-2 rounded-full bg-rose-500 ring-1 ring-[var(--bg-surface)]" />
              )}
            </span>
          </Button>
        </nav>
        )}

        {/* Window controls — native Windows 11 style */}
        <div className="flex h-full items-stretch">
          <button
            type="button"
            onClick={winMinimize}
            className="flex h-full w-[46px] items-center justify-center text-[var(--text-muted)] outline-none transition-colors duration-75 hover:bg-black/10 active:bg-black/15 dark:hover:bg-white/10 dark:active:bg-white/15"
            title={lang === "zh" ? "最小化" : "Minimize"}
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            onClick={winToggleMaximize}
            className="flex h-full w-[46px] items-center justify-center text-[var(--text-muted)] outline-none transition-colors duration-75 hover:bg-black/10 active:bg-black/15 dark:hover:bg-white/10 dark:active:bg-white/15"
            title={isMaximized ? (lang === "zh" ? "还原" : "Restore") : (lang === "zh" ? "最大化" : "Maximize")}
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="1.5" y="0" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="var(--bg-surface)" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={winClose}
            className="flex h-full w-[46px] items-center justify-center text-[var(--text-muted)] outline-none transition-colors duration-75 hover:bg-[#e81123] hover:text-white active:bg-[#bf0f1d]"
            title={lang === "zh" ? "关闭" : "Close"}
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
            </svg>
          </button>
        </div>
      </header>

      <ErrorBoundary>

      {page === "responseSet" && (
        <ResponseSetPage lang={lang} onClose={() => setPage("main")} onApply={(id) => setPendingApplyResponseSet(id)} />
      )}
      {page === "marketplace" && (
        <MarketplacePage
          lang={lang}
          serverUrl={settings.cloudServerUrl ?? ""}
          authToken={settings.cloudAuthToken}
          uploaderName={settings.cloudUploaderName}
          customEnders={customEnders}
          onClose={() => setPage("main")}
          onApply={(id) => setPendingApplyResponseSet(id)}
          onApplyPromptConfig={(name) => {
            updateSessionConfigFile(sessionData?.sessionId ?? "", `${name}.yaml`);
            setPage("main");
            pushToast(lang === "zh" ? `已应用指令配置: ${name}` : `Applied prompt config: ${name}`, "success");
          }}
        />
      )}
      {/* 主界面始终挂载：切到配置/响应集/市场页时用 hidden 隐藏而非卸载，
          避免 SessionManager/useSerialPort 重建导致串口断开、日志清空 */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${page === "main" ? "" : "hidden"}`}>
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
              <AboutPanel lang={lang} appVersion={appVersion} updateAvailable={updateAvailable} />
            </div>
          </div>
        </div>
      )}

      <HelpDialog
        open={helpOpen}
        lang={lang}
        helpUrl={settings.helpUrl}
        onClose={() => setHelpOpen(false)}
      />

      <ShortcutsDialog
        open={shortcutsOpen}
        lang={lang}
        hotkeys={settings.hotkeys ?? []}
        onClose={() => setShortcutsOpen(false)}
      />

      {signalOpen && (
        <SignalDialog
          lang={lang}
          isConnected={activeIsConnected}
          config={config}
          signalStates={signalStates}
          onClose={() => setSignalOpen(false)}
        />
      )}
      {trafficOpen && (
        <TrafficDialog
          lang={lang}
          isConnected={activeIsConnected}
          txBytes={txBytes}
          rxBytes={rxBytes}
          txRate={txRate}
          rxRate={rxRate}
          onClose={() => setTrafficOpen(false)}
        />
      )}
      {healthOpen && (
        <HealthDialog
          lang={lang}
          isConnected={activeIsConnected}
          connectionType={config.connectionType}
          latencyMs={latencyMs}
          latencyHistory={latencyHistory}
          connectedPort={activeConnectedPort}
          onClose={() => setHealthOpen(false)}
        />
      )}
      {waveformOpen && (
        <WaveformDialog
          lang={lang}
          isConnected={activeIsConnected}
          getSignalHistory={getSignalHistory}
          onClose={() => setWaveformOpen(false)}
        />
      )}
      {stringGenOpen && (
        <StringGeneratorDialog lang={lang} onClose={() => setStringGenOpen(false)} />
      )}
      {stringCheckOpen && (
        <StringCheckerDialog lang={lang} onClose={() => setStringCheckOpen(false)} />
      )}
      {codecOpen && (
        <CodecDialog lang={lang} onClose={() => setCodecOpen(false)} />
      )}

      {/* ── Log viewer modal ── */}
      {logViewerOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLogViewerOpen(false);
          }}
        >
          <LogViewer
            lang={lang}
            logFiles={logFiles}
            selectedFile={logViewerSelectedFile}
            content={logViewerContent}
            onSelectFile={handleLoadLogFile}
            onDeleteFile={handleDeleteLogFile}
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
                  onClick={() => updateTopCollapsed(false)}
                  className="shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 transition-colors hover:bg-[var(--bg-input)]"
                >
                  <div className="flex items-center gap-2 text-theme-11 text-[var(--text-muted)]">
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
                <div id="tour-config" className="flex flex-col min-h-0 flex-1 rounded-lg bg-[var(--bg-surface)] overflow-hidden">
                  <SessionManager
                    lang={lang}
                    receiveMode={receiveMode}
                    displayMode={settings.displayMode ?? "card"}
                    onDisplayModeChange={updateDisplayMode}
                    portFilterMode={settings.portFilterMode ?? "default"}
                    mockSerial={settings.mockSerial}
                    rxIdleFlushMs={settings.rxIdleFlushMs ?? 50}
                    logBatchFlushMs={settings.logBatchFlushMs ?? 50}
                    onActiveSessionData={handleActiveSessionData}
                    onAddToPrompts={handleAddToPrompts}
                    onSessionsChange={handleSessionsChange}
                  />
                </div>
              )}

            </div>

            {/* Drag handle + collapse button for right column */}
            <div className="group relative mx-1 flex w-3 shrink-0 items-center justify-center">
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
                  onClick={() => updateRightCollapsed(false)}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] shadow-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <ChevronLeft size={10} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => updateRightCollapsed(true)}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <ChevronRight size={10} />
                </button>
              )}
            </div>

            {/* Right column — hidden when collapsed */}
            {!rightCollapsed && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {/* Send card */}
                <div id="tour-send" className="shrink-0">
                  <SendPanel
                    value={message}
                    sendMode={sendMode}
                    appendNewline={appendNewline}
                    customEnders={customEnders}
                    receiveMode={receiveMode}
                    isConnected={activeIsConnected}
                    isBusy={isBusy}
                    hotkeys={settings.hotkeys}
                    filePath={filePath}
                    fileSendProgress={fileSendProgress}
                    lang={lang}
                    mode="tabbed"
                    onChange={setMessage}
                    onSendModeChange={updateSendMode}
                    onReceiveModeChange={updateReceiveMode}
                    onAppendNewlineChange={updateAppendNewline}
                    onSend={() => activeSendData?.(message, sendMode, appendNewline)}
                    onClearSent={() => clearLogs("sent")}
                    onFileSelect={handleFileSelect}
                    onFileSend={() => activeSendFile(filePath)}
                    onHotkeySend={handleHotkeySend}
                    onPushToast={pushToast}
                    tcpClientCount={activeTcpClients.length}
                    onBroadcastToClients={(text) => {
                      const bytes = Array.from(new TextEncoder().encode(text));
                      activeTcpServerBroadcast?.(bytes);
                    }}
                  />
                </div>

                {/* Prompt panel */}
                <div id="tour-prompts" className="min-h-0 flex-1 flex flex-col pt-2">
                  <PromptPanel variant="panel" isConnected={activeIsConnected} sendData={activeSendData} customEnders={customEnders} lang={lang} promptRowCount={settings.promptRowCount} updatePromptRowCount={updatePromptRowCount} pushToast={pushToast} onNavigateToResponseSet={handleNavigateToResponseSet} pendingApplyResponseSet={pendingApplyResponseSet} onClearPendingApply={() => setPendingApplyResponseSet(null)} activeConfigFile={currentSessionConfigFile} onActiveConfigFileChange={(fileName) => updateSessionConfigFile(sessionData?.sessionId ?? "", fileName)} logs={activeLogs} tcpServerBroadcast={activeTcpServerBroadcast} tcpClientCount={activeTcpClients.length} />
                </div>
              </div>
            )}
            </>
          )}
      </main>

      {/* ── Status bar ── */}
      <div className="shrink-0 px-2 pb-2">
        <StatusBar
          isConnected={activeIsConnected}
          statusText={statusText}
          currentPortLabel={currentPortLabel}
          latencyMs={latencyMs}
          logFileName={logFile.savePath ? logFile.savePath.split(/[\\/]/).pop() ?? null : null}
          realTimeLog={logFile.realTime}
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
        timestampFormat={settings.timestampFormat}
        logRetentionDays={settings.logRetentionDays}
        portFilterMode={settings.portFilterMode ?? "default"}
        cloudServerUrl={settings.cloudServerUrl}
        cloudAuthToken={settings.cloudAuthToken}
        cloudUploaderName={settings.cloudUploaderName}
        layoutMode={settings.layoutMode}
        gridLayout={settings.gridLayout}
        mockSerial={settings.mockSerial}
        customEnders={customEnders}
        rxIdleFlushMs={settings.rxIdleFlushMs}
        logBatchFlushMs={settings.logBatchFlushMs}
        onClose={() => setSettingsOpen(false)}
        onHotkeysChange={updateHotkeys}
        onThemeChange={updateTheme}
        onThemeReset={resetTheme}
        onLangChange={updateLang}
        onCompactModeChange={updateCompactMode}
        onCloseBehaviorChange={updateCloseBehavior}
        onAllowMultiInstanceChange={updateAllowMultiInstance}
        onLayoutModeChange={updateLayoutMode}
        onGridLayoutChange={updateGridLayout}
        onTimestampFormatChange={updateTimestampFormat}
        onLogRetentionDaysChange={updateLogRetentionDays}
        onPortFilterModeChange={updatePortFilterMode}
        onCloudServerUrlChange={updateCloudServerUrl}
        onCloudAuthTokenChange={updateCloudAuthToken}
        onCloudUploaderNameChange={updateCloudUploaderName}
        onMockSerialChange={updateMockSerial}
        onCustomEndersChange={updateCustomEnders}
        onRxIdleFlushMsChange={updateRxIdleFlushMs}
        onLogBatchFlushMsChange={updateLogBatchFlushMs}
      />
      {/* ── Notification card modal ── */}
      {cardNotifications.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="flex w-[460px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
            {cardNotifications.map((n, i) => {
              const severity = n.severity === "warning" ? "amber" : n.severity === "important" ? "rose" : "sky";
              return (
                <div key={n.id ?? i}>
                  {i > 0 && <div className="mx-4 border-t border-[var(--border)]" />}
                  <div className="px-4 py-3">
                    {/* Severity header */}
                    {n.severity && n.severity !== "info" && (
                      <div className={`flex items-center gap-1.5 mb-2 text-${severity}-600`}>
                        <span className={`inline-block w-2 h-2 rounded-full bg-${severity}-500`} />
                        <span className="text-theme-11 font-semibold">
                          {lang === "zh"
                            ? n.severity === "warning" ? "通知" : "重要通知"
                            : n.severity === "warning" ? "Notice" : "Important"}
                        </span>
                      </div>
                    )}
                    {n.date && (
                      <div className="text-theme-10 text-[var(--text-muted)]/60 mb-1">{n.date}</div>
                    )}
                    {n.title && (
                      <div className="text-sm font-semibold text-[var(--text-primary)] mb-2">{n.title}</div>
                    )}
                    {n.body && (
                      <div className="text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap mb-3">
                        {n.body}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {n.link && (
                        <button
                          type="button"
                          onClick={() => window.open(n.link, "_blank")}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--bg-input)] transition-colors"
                        >
                          {lang === "zh" ? "查看详情" : "View Details"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCardNotifications([]);
                          // Also clear the badge since user saw the card
                          setHasUnreadNotifications(false);
                        }}
                        className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                      >
                        {lang === "zh" ? "我知道了" : "Got it"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
      </ErrorBoundary>
    </div>
  );
}

export default App;
