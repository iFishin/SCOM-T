import { useEffect, useRef, useState } from "react";
import type { SendMode, ReceiveMode, LogDisplayMode } from "./useSerialPort.ts";
import type { Lang } from "../i18n.ts";
import type { SerialSession } from "./useSessionManager.ts";

/**
 * 结尾符值。内置为 "" / "\r\n" / "\r" / "\n"，自定义结尾符是「字节串」
 * （每个 char 一个字节 0-255），故统一放宽为 string。
 */
export type AppendNewline = string;

/** 用户自定义的结尾符：以十六进制字节序列定义，出现在所有结尾符下拉框中。 */
export type CustomEnder = {
  id: string;
  label: string;
  /** 十六进制字节序列，如 "0D 0A"。 */
  hex: string;
};

export type HotkeyConfig = {
  id: string;
  label: string;
  command: string;
  sendMode: SendMode;
  appendNewline: AppendNewline;
  shortcut?: string;
  actionType?: "command" | "builtin";
  builtinAction?: string;
};

export type ThemeStylePreset = "modern" | "sharp" | "classic" | "custom";

/** 圆角/间距字段（rem） */
type RemKey = "radiusSm" | "radiusMd" | "radiusLg" | "panelPadding" | "controlGap";

export type ThemeSettings = {
  mode: "light" | "dark";
  bgPrimary: string;
  bgSurface: string;
  bgInput: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  border: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  monoFontFamily: string;
  // ── 新增文字/背景色（可选，缺省回填默认）──
  bgHover?: string;          // 悬停背景
  textPlaceholder?: string;  // 占位符文字色
  borderFocus?: string;      // 聚焦边框色
  accentDark?: string;       // 强调色深（hover/active）
  accentLight?: string;      // 强调色浅（柔和底）
  accentMuted?: string;      // 强调色淡化（滚动条等）
  // ── 圆角/间距（rem，随字号缩放）──
  radiusSm?: number;         // 小圆角（输入框）
  radiusMd?: number;         // 中圆角（按钮）
  radiusLg?: number;         // 大圆角（面板/弹窗）
  panelPadding?: number;     // 面板内边距
  controlGap?: number;       // 控件间距
  // ── 整体风格预设（最近选用或 custom）──
  stylePreset?: ThemeStylePreset;
};

export type GridItemLayout = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type MockResponse = {
  id: string;
  command: string;
  response: string;
  enabled: boolean;
};

export type MockSerialConfig = {
  enabled: boolean;
  responseDelay: number;
  customResponses: MockResponse[];
};

export type AppSettings = {
  hotkeys: HotkeyConfig[];
  theme: ThemeSettings;
  promptRowCount: number;
  lang: Lang;
  compactMode?: boolean;
  closeToTray?: boolean;
  allowMultiInstance?: boolean;
  layoutMode?: "classic" | "grid";
  gridLayout?: GridItemLayout[];
  notificationUrl?: string;
  /** 帮助文档地址（支持 {lang} 占位符，空则用默认云端 URL）。 */
  helpUrl?: string;
  timestampFormat?: "time" | "datetime" | "none";
  sendMode?: SendMode;
  receiveMode?: ReceiveMode;
  displayMode?: LogDisplayMode;
  appendNewline?: string;
  logRetentionDays?: number;
  topCollapsed?: boolean;
  rightCollapsed?: boolean;
  rightSendCollapsed?: boolean;
  sendPanelExpanded?: boolean;
  sendPanelFileCollapsed?: boolean;
  sendPanelHotkeysCollapsed?: boolean;
  activeConfigFile?: string;
  portFilterMode?: "default" | "all";
  mockSerial?: MockSerialConfig;
  customEnders?: CustomEnder[];
  /** 会话列表（含顺序），拖拽重排后同步写入 config.yaml。 */
  sessions?: SerialSession[];
  cloudServerUrl?: string;
  cloudAuthToken?: string;
  cloudUploaderName?: string;
  /** RX 空闲刷新间隔：半行数据判定已发完的等待时间（ms）。设备把回显拆成多个
   *  USB 包时，此值需大于包间隔，否则一行会被腰斩。范围 1–500。 */
  rxIdleFlushMs?: number;
  /** 日志渲染批间隔：合并 `setState` 的延迟（ms）。越大 UI 越平滑，越小日志出现越快。范围 5–1000。 */
  logBatchFlushMs?: number;
  /** 上次选择的日志文件路径，用于下次启动自动恢复写入。 */
  logSavePath?: string | null;
  /** 日志实时写入开关状态，随 logSavePath 一起持久化。 */
  logRealTime?: boolean;
};

const STORAGE_KEY = "scom-t-settings";
const CFG_FILE = "SCOM-T/config.yaml";

export const DEFAULT_LIGHT_THEME: ThemeSettings = {
  mode: "light",
  bgPrimary: "#f1f5f9",
  bgSurface: "#ffffff",
  bgInput: "#f8fafc",
  textPrimary: "#334155",
  textMuted: "#94a3b8",
  accent: "#10b981",
  border: "#e2e8f0",
  fontFamily: "Segoe UI, PingFang SC, Microsoft YaHei, sans-serif",
  fontSize: 13,
  fontWeight: 400,
  monoFontFamily: "Consolas, Menlo, Monaco, monospace",
  bgHover: "#f0fdf4",
  textPlaceholder: "#94a3b8",
  borderFocus: "#10b981",
  accentDark: "#059669",
  accentLight: "#d1fae5",
  accentMuted: "#6ee7b7",
  radiusSm: 0.375,
  radiusMd: 0.5,
  radiusLg: 0.75,
  panelPadding: 0.5,
  controlGap: 0.375,
  stylePreset: "classic",
};

export const DEFAULT_DARK_THEME: ThemeSettings = {
  mode: "dark",
  bgPrimary: "#0f172a",
  bgSurface: "#1e293b",
  bgInput: "#0f172a",
  textPrimary: "#cbd5e1",
  textMuted: "#94a3b8",
  accent: "#10b981",
  border: "#334155",
  fontFamily: "Segoe UI, PingFang SC, Microsoft YaHei, sans-serif",
  fontSize: 13,
  fontWeight: 400,
  monoFontFamily: "Consolas, Menlo, Monaco, monospace",
  bgHover: "#052e16",
  textPlaceholder: "#94a3b8",
  borderFocus: "#10b981",
  accentDark: "#059669",
  accentLight: "#064e3b",
  accentMuted: "#6ee7b7",
  radiusSm: 0.375,
  radiusMd: 0.5,
  radiusLg: 0.75,
  panelPadding: 0.5,
  controlGap: 0.375,
  stylePreset: "classic",
};

export const GRID_ITEM_KEYS = ["config", "send", "filesend", "hotkeys", "receive", "prompts"] as const;
export type GridItemKey = (typeof GRID_ITEM_KEYS)[number];

export const GRID_ITEM_LABELS: Record<GridItemKey, { zh: string; en: string }> = {
  config: { zh: "串口配置", en: "Port Config" },
  send: { zh: "数据发送", en: "Data Send" },
  filesend: { zh: "文件发送", en: "File Send" },
  hotkeys: { zh: "热键", en: "Hotkeys" },
  receive: { zh: "日志接收", en: "Receive Log" },
  prompts: { zh: "指令列表", en: "Commands" },
};

export const DEFAULT_GRID_LAYOUT: GridItemLayout[] = [
  { i: "config",   x: 0, y: 0,  w: 4, h: 8,  minW: 2, minH: 3 },
  { i: "send",     x: 4, y: 0,  w: 4, h: 8,  minW: 3, minH: 3 },
  { i: "hotkeys",  x: 8, y: 0,  w: 4, h: 4,  minW: 2, minH: 2 },
  { i: "filesend", x: 8, y: 4,  w: 4, h: 4,  minW: 2, minH: 2 },
  { i: "receive",  x: 0, y: 8,  w: 8, h: 14, minW: 3, minH: 4 },
  { i: "prompts",  x: 8, y: 8,  w: 4, h: 14, minW: 2, minH: 4 },
];

const DEFAULT_HOTKEYS: HotkeyConfig[] = [
  "快速发送指令1", "快速发送指令2", "快速发送指令3", "快速发送指令4",
  "快速发送指令5", "快速发送指令6", "快速发送指令7", "快速发送指令8",
].map((label, index) => ({
  id: `hotkey-${index + 1}`,
  label,
  command: "",
  sendMode: "ascii" as SendMode,
  appendNewline: "" as AppendNewline,
  actionType: "command" as const,
  builtinAction: undefined,
}));

const DEFAULT_SETTINGS: AppSettings = {
  hotkeys: DEFAULT_HOTKEYS,
  theme: DEFAULT_LIGHT_THEME,
  promptRowCount: 100,
  lang: "zh",
  compactMode: false,
  closeToTray: true,
  allowMultiInstance: false,
  layoutMode: "classic",
  gridLayout: DEFAULT_GRID_LAYOUT,
  notificationUrl: "",
  displayMode: "card",
  timestampFormat: "datetime",
  sendMode: "ascii",
  receiveMode: "ascii",
  appendNewline: "\r\n",
  logRetentionDays: 30,
  topCollapsed: false,
  rightCollapsed: false,
  rightSendCollapsed: true,
  sendPanelExpanded: false,
  sendPanelFileCollapsed: true,
  sendPanelHotkeysCollapsed: true,
  portFilterMode: "default",
  cloudServerUrl: "https://scom-t-marketplace.ifishin.top",
  cloudAuthToken: "",
  cloudUploaderName: "",
  helpUrl: "",
  rxIdleFlushMs: 50,
  logBatchFlushMs: 50,
  customEnders: [],
  sessions: [],
};

/** 颜色值（hex）校验：补齐原始 rgb/缩写等不校验，仅回退非字符串。 */
function isColorString(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$|^[a-z]+$/i.test(v.trim());
}

/** rem 数值钳制到合理范围（0.125–3）。 */
function clampRem(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(3, Math.max(0.125, Math.round(v * 1000) / 1000));
}

/** 合并主题：默认值兜底 + 新增字段校验（防手改 config.yaml 产生非法值）。 */
function mergeTheme(raw: Record<string, unknown>): ThemeSettings {
  const base = raw.mode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
  const colorFields: (keyof ThemeSettings)[] = [
    "bgPrimary", "bgSurface", "bgInput", "textPrimary", "textMuted",
    "accent", "border", "bgHover", "textPlaceholder", "borderFocus",
    "accentDark", "accentLight", "accentMuted",
  ];
  const out: ThemeSettings = { ...base };
  for (const k of colorFields) {
    const v = raw[k];
    if (isColorString(v)) (out as Record<string, unknown>)[k] = v;
  }
  // 字体/字数/字重
  if (typeof raw.fontFamily === "string") out.fontFamily = raw.fontFamily;
  if (typeof raw.monoFontFamily === "string") out.monoFontFamily = raw.monoFontFamily;
  if (typeof raw.fontSize === "number" && raw.fontSize >= 10 && raw.fontSize <= 24) out.fontSize = raw.fontSize;
  if (typeof raw.fontWeight === "number" && raw.fontWeight >= 300 && raw.fontWeight <= 700) out.fontWeight = raw.fontWeight;
  // 圆角/间距（rem）
  const remFields: [RemKey, number][] = [
    ["radiusSm", base.radiusSm ?? 0.375],
    ["radiusMd", base.radiusMd ?? 0.5],
    ["radiusLg", base.radiusLg ?? 0.75],
    ["panelPadding", base.panelPadding ?? 0.5],
    ["controlGap", base.controlGap ?? 0.375],
  ];
  for (const [k, fb] of remFields) {
    out[k] = clampRem(raw[k], fb);
  }
  // 风格预设枚举
  const p = raw.stylePreset;
  out.stylePreset =
    p === "modern" || p === "sharp" || p === "classic" ? p : "custom";
  return out;
}

/** Merge a raw parsed object into AppSettings with validation. */
function mergeSettings(raw: Partial<AppSettings>): AppSettings {
  return {
    hotkeys: Array.isArray(raw.hotkeys)
      ? raw.hotkeys.map((hk, i) => ({
          id: hk.id || `hotkey-${i + 1}`,
          label: hk.label || `Hotkey ${i + 1}`,
          command: hk.command || "",
          sendMode: hk.sendMode === "hex" ? "hex" : "ascii",
          appendNewline: hk.appendNewline || "",
          shortcut: hk.shortcut || undefined,
          actionType: (hk as any).actionType === "builtin" ? "builtin" : "command",
          builtinAction: (hk as any).builtinAction || undefined,
        }))
      : DEFAULT_HOTKEYS,
    theme: mergeTheme(raw.theme || {}),
    promptRowCount: typeof raw.promptRowCount === "number" && raw.promptRowCount >= 1
      ? raw.promptRowCount : 100,
    lang: raw.lang === "en" || raw.lang === "zh" ? raw.lang : "zh",
    compactMode: raw.compactMode === true,
    closeToTray: raw.closeToTray !== false,
    allowMultiInstance: raw.allowMultiInstance === true,
    layoutMode: raw.layoutMode === "grid" ? "grid" : "classic",
    gridLayout: Array.isArray(raw.gridLayout) && raw.gridLayout.length > 0
      ? raw.gridLayout.map((item: any) => ({
          i: item.i, x: item.x ?? 0, y: item.y ?? 0,
          w: item.w ?? 4, h: item.h ?? 4,
          minW: item.minW, minH: item.minH,
        }))
      : DEFAULT_GRID_LAYOUT,
    notificationUrl: typeof raw.notificationUrl === "string" ? raw.notificationUrl : "",
    helpUrl: typeof raw.helpUrl === "string" ? raw.helpUrl : "",
    timestampFormat: raw.timestampFormat === "time" || raw.timestampFormat === "datetime" || raw.timestampFormat === "none"
      ? raw.timestampFormat : "datetime",
    sendMode: raw.sendMode === "hex" ? "hex" : "ascii",
    receiveMode: raw.receiveMode === "hex" ? "hex" : "ascii",
    displayMode: raw.displayMode === "text" || raw.displayMode === "hex"
      ? raw.displayMode : "card",
    appendNewline: typeof raw.appendNewline === "string" ? raw.appendNewline : "\r\n",
    logRetentionDays: typeof raw.logRetentionDays === "number" && raw.logRetentionDays >= 1
      ? Math.floor(raw.logRetentionDays) : 30,
    topCollapsed: raw.topCollapsed === true,
    rightCollapsed: raw.rightCollapsed === true,
    rightSendCollapsed: raw.rightSendCollapsed === false ? false : true,
    sendPanelExpanded: raw.sendPanelExpanded === true,
    sendPanelFileCollapsed: raw.sendPanelFileCollapsed === false ? false : true,
    sendPanelHotkeysCollapsed: raw.sendPanelHotkeysCollapsed === false ? false : true,
    portFilterMode: raw.portFilterMode === "all" ? "all" : "default",
    mockSerial: raw.mockSerial && typeof raw.mockSerial === "object" ? {
      enabled: raw.mockSerial.enabled === true,
      responseDelay: typeof raw.mockSerial.responseDelay === "number"
        ? Math.max(0, Math.min(5000, raw.mockSerial.responseDelay)) : 100,
      customResponses: Array.isArray(raw.mockSerial.customResponses)
        ? raw.mockSerial.customResponses.map(r => ({
            id: r.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            command: r.command || "",
            response: r.response || "",
            enabled: r.enabled !== false,
          })).filter(r => r.command) : [],
    } : { enabled: false, responseDelay: 100, customResponses: [] },
    customEnders: Array.isArray(raw.customEnders)
      ? raw.customEnders
          .filter((e: any) => e && typeof e.hex === "string" && /^[0-9a-fA-F\s]+$/.test(e.hex) && e.hex.replace(/\s+/g, "").length % 2 === 0)
          .map((e: any) => ({
            id: e.id || `ender-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            label: typeof e.label === "string" ? e.label : "",
            hex: e.hex.replace(/\s+/g, "").toUpperCase(),
          }))
      : [],
    sessions: Array.isArray(raw.sessions)
      ? raw.sessions
          .filter((s: any) => s && typeof s.id === "string")
          .map((s: any) => ({
            id: s.id,
            name: typeof s.name === "string" && s.name ? s.name : "串口",
            config: s.config && typeof s.config === "object" ? s.config : {},
            // 每个 session 独立保存 activeConfigFile；旧版从全局字段迁移
            activeConfigFile: typeof s.activeConfigFile === "string" && s.activeConfigFile
              ? s.activeConfigFile
              : (typeof raw.activeConfigFile === "string" ? raw.activeConfigFile : "prompts.yaml"),
          }))
      : [],
    cloudServerUrl: typeof raw.cloudServerUrl === "string" ? raw.cloudServerUrl : "",
    cloudAuthToken: typeof raw.cloudAuthToken === "string" ? raw.cloudAuthToken : "",
    cloudUploaderName: typeof raw.cloudUploaderName === "string" ? raw.cloudUploaderName : "",
    rxIdleFlushMs: typeof raw.rxIdleFlushMs === "number" && raw.rxIdleFlushMs >= 1 && raw.rxIdleFlushMs <= 500
      ? Math.floor(raw.rxIdleFlushMs) : 50,
    logBatchFlushMs: typeof raw.logBatchFlushMs === "number" && raw.logBatchFlushMs >= 5 && raw.logBatchFlushMs <= 1000
      ? Math.floor(raw.logBatchFlushMs) : 50,
    logSavePath: typeof raw.logSavePath === "string" ? raw.logSavePath : null,
    logRealTime: raw.logRealTime === true,
  };
}

/** Path helper — resolves ~/SCOM-T/config.yaml */
async function configPath(): Promise<string> {
  const { join } = await import("@tauri-apps/api/path");
  const { homeDir } = await import("@tauri-apps/api/path");
  return join(await homeDir(), CFG_FILE);
}

/** Ensure the config directory exists. */
async function ensureDir(): Promise<void> {
  const { join } = await import("@tauri-apps/api/path");
  const { homeDir } = await import("@tauri-apps/api/path");
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  const dir = await join(await homeDir(), "SCOM-T");
  await mkdir(dir, { recursive: true }).catch(() => {});
}

/** Load settings from config.yaml (with localStorage migration). */
async function loadSettingsFromFile(): Promise<AppSettings> {
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const text = await readTextFile(await configPath());
    const raw = (await import("js-yaml")).load(text) as Partial<AppSettings>;
    return mergeSettings(raw);
  } catch {
    // If file doesn't exist, try migrating from localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        const merged = mergeSettings(parsed);
        // Migrate to file
        await saveSettingsToFile(merged);
        localStorage.removeItem(STORAGE_KEY);
        return merged;
      } catch { /* ignore migration errors */ }
    }
    return DEFAULT_SETTINGS;
  }
}

/** Save settings to config.yaml. */
async function saveSettingsToFile(settings: AppSettings): Promise<void> {
  try {
    await ensureDir();
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const yamlStr = (await import("js-yaml")).dump(settings, {
      indent: 2, lineWidth: -1, noRefs: true, quotingType: "'",
    });
    await writeTextFile(await configPath(), yamlStr);
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Load from file on mount
  useEffect(() => {
    loadSettingsFromFile().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  // Sync Rust backend settings on load (close behavior, multi-instance)
  useEffect(() => {
    if (!loaded) return;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("set_close_behavior", { closeToTray: settings.closeToTray !== false });
      invoke("set_allow_multi_instance", { allow: settings.allowMultiInstance === true });
    });
  }, [loaded]);

  // Debounced save on change
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveSettingsToFile(settings), 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [settings, loaded]);

  // Flush pending save on beforeunload
  useEffect(() => {
    function flush() {
      // 无条件落盘：即使防抖尚未调度，也把最新配置写入（Tauri 关窗时 beforeunload 可能不触发）。
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveSettingsToFile(settings);
    }
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [settings]);

  function updateHotkeys(hotkeys: HotkeyConfig[]) {
    setSettings((current) => ({ ...current, hotkeys }));
  }

  function updateTheme(theme: ThemeSettings) {
    setSettings((current) => ({ ...current, theme }));
  }

  function updatePromptRowCount(count: number) {
    setSettings((current) => ({
      ...current,
      promptRowCount: Math.max(1, Math.min(500, count)),
    }));
  }

  function updateLang(lang: Lang) {
    setSettings((current) => ({ ...current, lang }));
  }

  function updateCompactMode(compact: boolean) {
    setSettings((current) => ({ ...current, compactMode: compact }));
  }

  function updateCloseBehavior(closeToTray: boolean) {
    setSettings((current) => ({ ...current, closeToTray }));
    import("@tauri-apps/api/core").then(({ invoke }) => {
      void invoke("set_close_behavior", { closeToTray });
    });
  }

  function updateAllowMultiInstance(allow: boolean) {
    setSettings((current) => ({ ...current, allowMultiInstance: allow }));
    import("@tauri-apps/api/core").then(({ invoke }) => {
      void invoke("set_allow_multi_instance", { allow });
    });
  }

  function updateLayoutMode(mode: "classic" | "grid") {
    setSettings((current) => ({ ...current, layoutMode: mode }));
  }

  function updateNotificationUrl(url: string) {
    setSettings((current) => ({ ...current, notificationUrl: url }));
  }

  function updateHelpUrl(url: string) {
    setSettings((current) => ({ ...current, helpUrl: url }));
  }

  function updateTimestampFormat(format: "time" | "datetime" | "none") {
    setSettings((current) => ({ ...current, timestampFormat: format }));
  }

  function updateGridLayout(layout: GridItemLayout[]) {
    setSettings((current) => ({ ...current, gridLayout: layout }));
  }

  function updateSendMode(mode: SendMode) {
    setSettings((current) => ({ ...current, sendMode: mode }));
  }

  function updateReceiveMode(mode: ReceiveMode) {
    setSettings((current) => ({ ...current, receiveMode: mode }));
  }

  function updateDisplayMode(mode: LogDisplayMode) {
    setSettings((current) => ({ ...current, displayMode: mode }));
  }

  function updateAppendNewline(v: string) {
    setSettings((current) => ({ ...current, appendNewline: v }));
  }

  function updateLogRetentionDays(days: number) {
    setSettings((current) => ({ ...current, logRetentionDays: Math.max(1, Math.floor(days)) }));
  }

  function updateTopCollapsed(v: boolean) {
    setSettings((current) => ({ ...current, topCollapsed: v }));
  }

  function updateRightCollapsed(v: boolean) {
    setSettings((current) => ({ ...current, rightCollapsed: v }));
  }

  function updateRightSendCollapsed(v: boolean) {
    setSettings((current) => ({ ...current, rightSendCollapsed: v }));
  }

  function updateSendPanelExpanded(v: boolean) {
    setSettings((current) => ({ ...current, sendPanelExpanded: v }));
  }

  function updateSendPanelFileCollapsed(v: boolean) {
    setSettings((current) => ({ ...current, sendPanelFileCollapsed: v }));
  }

  function updateSendPanelHotkeysCollapsed(v: boolean) {
    setSettings((current) => ({ ...current, sendPanelHotkeysCollapsed: v }));
  }

  function updateActiveConfigFile(fileName: string) {
    setSettings((current) => ({ ...current, activeConfigFile: fileName }));
  }

  function updatePortFilterMode(mode: "default" | "all") {
    setSettings((current) => ({ ...current, portFilterMode: mode }));
  }

  function updateMockSerial(config: MockSerialConfig) {
    setSettings((current) => ({ ...current, mockSerial: config }));
  }

  function updateCustomEnders(customEnders: CustomEnder[]) {
    const next = { ...settingsRef.current, customEnders };
    setSettings(next);
    // 立即落盘：自定义结尾符改动不依赖 500ms 防抖。Tauri 关窗时 beforeunload
    // 不可靠，防抖若未触发会丢配置（实测 config.yaml 中 customEnders 变回 []）。
    void saveSettingsToFile(next);
  }

  function updateSessions(sessions: SerialSession[]) {
    setSettings((current) => ({ ...current, sessions }));
  }

  function updateCloudServerUrl(url: string) {
    setSettings((current) => ({ ...current, cloudServerUrl: url }));
  }

  function updateCloudAuthToken(token: string) {
    setSettings((current) => ({ ...current, cloudAuthToken: token }));
  }

  function updateCloudUploaderName(name: string) {
    setSettings((current) => ({ ...current, cloudUploaderName: name }));
  }

  function updateRxIdleFlushMs(ms: number) {
    setSettings((current) => ({
      ...current,
      rxIdleFlushMs: Math.max(1, Math.min(500, Math.floor(ms))),
    }));
  }

  function updateLogBatchFlushMs(ms: number) {
    setSettings((current) => ({
      ...current,
      logBatchFlushMs: Math.max(5, Math.min(1000, Math.floor(ms))),
    }));
  }

  function updateLogFileState(logSavePath: string | null, logRealTime: boolean) {
    setSettings((current) => ({ ...current, logSavePath, logRealTime }));
  }

  function resetTheme(mode = settings.theme.mode) {
    const base = mode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
    // 重置整套主题（含扩展字段）回该 mode 的默认，并标记为「经典」预设
    updateTheme({
      ...settings.theme,
      ...base,
      stylePreset: "classic",
    });
  }

  return {
    settings,
    loaded,
    updateHotkeys,
    updateTheme,
    resetTheme,
    updatePromptRowCount,
    updateLang,
    updateCompactMode,
    updateCloseBehavior,
    updateAllowMultiInstance,
    updateLayoutMode,
    updateGridLayout,
    updateNotificationUrl,
    updateHelpUrl,
    updateTimestampFormat,
    updateSendMode,
    updateReceiveMode,
    updateDisplayMode,
    updateAppendNewline,
    updateLogRetentionDays,
    updateTopCollapsed,
    updateRightCollapsed,
    updateRightSendCollapsed,
    updateSendPanelExpanded,
    updateSendPanelFileCollapsed,
    updateSendPanelHotkeysCollapsed,
    updateActiveConfigFile,
    updatePortFilterMode,
    updateMockSerial,
    updateCustomEnders,
    updateSessions,
    updateCloudServerUrl,
    updateCloudAuthToken,
    updateCloudUploaderName,
    updateRxIdleFlushMs,
    updateLogBatchFlushMs,
    updateLogFileState,
  };
}
