import { useEffect, useRef, useState } from "react";
import type { SendMode, ReceiveMode, LogDisplayMode } from "./useSerialPort.ts";
import type { Lang } from "../i18n.ts";

export type AppendNewline = "" | "\r\n" | "\r" | "\n";

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
  timestampFormat?: "time" | "datetime";
  sendMode?: SendMode;
  receiveMode?: ReceiveMode;
  displayMode?: LogDisplayMode;
  appendNewline?: "" | "\r\n" | "\r" | "\n";
  logRetentionDays?: number;
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
  "Clear-Log", "Read-ATC", "Update-ATC", "Restore-ATC",
  "Internet", "RST", "ECHO", "Version",
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
};

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
    theme: { ...DEFAULT_LIGHT_THEME, ...(raw.theme || {}) },
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
    timestampFormat: raw.timestampFormat === "time" || raw.timestampFormat === "datetime"
      ? raw.timestampFormat : undefined,
    sendMode: raw.sendMode === "hex" ? "hex" : "ascii",
    receiveMode: raw.receiveMode === "hex" ? "hex" : "ascii",
    displayMode: raw.displayMode === "text" || raw.displayMode === "hex"
      ? raw.displayMode : "card",
    appendNewline: raw.appendNewline === "\r\n" || raw.appendNewline === "\n" || raw.appendNewline === "\r" || raw.appendNewline === ""
      ? raw.appendNewline : "\r\n",
    logRetentionDays: typeof raw.logRetentionDays === "number" && raw.logRetentionDays >= 1
      ? Math.floor(raw.logRetentionDays) : 30,
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
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveSettingsToFile(settings);
      }
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

  function updateTimestampFormat(format: "time" | "datetime") {
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

  function updateAppendNewline(v: "" | "\r\n" | "\r" | "\n") {
    setSettings((current) => ({ ...current, appendNewline: v }));
  }

  function updateLogRetentionDays(days: number) {
    setSettings((current) => ({ ...current, logRetentionDays: Math.max(1, Math.floor(days)) }));
  }

  function resetTheme(mode = settings.theme.mode) {
    const base = mode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
    updateTheme({
      ...settings.theme,
      mode: base.mode,
      bgPrimary: base.bgPrimary,
      bgSurface: base.bgSurface,
      bgInput: base.bgInput,
      textPrimary: base.textPrimary,
      textMuted: base.textMuted,
      accent: base.accent,
      border: base.border,
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
    updateTimestampFormat,
    updateSendMode,
    updateReceiveMode,
    updateDisplayMode,
    updateAppendNewline,
    updateLogRetentionDays,
  };
}
