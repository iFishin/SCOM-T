import { useEffect, useState } from "react";
import type { SendMode } from "./useSerialPort.ts";
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

export type AppSettings = {
  hotkeys: HotkeyConfig[];
  theme: ThemeSettings;
  promptRowCount: number;
  lang: Lang;
  compactMode?: boolean;
};

const STORAGE_KEY = "scom-t-settings";

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

const DEFAULT_HOTKEYS: HotkeyConfig[] = [
  "Clear-Log",
  "Read-ATC",
  "Update-ATC",
  "Restore-ATC",
  "Internet",
  "RST",
  "ECHO",
  "Version",
].map((label, index) => ({
  id: `hotkey-${index + 1}`,
  label,
  command: "",
  sendMode: "ascii",
  appendNewline: "",
  actionType: "command",
  builtinAction: undefined,
}));

const DEFAULT_SETTINGS: AppSettings = {
  hotkeys: DEFAULT_HOTKEYS,
  theme: DEFAULT_LIGHT_THEME,
  promptRowCount: 100,
  lang: "zh",
  compactMode: false,
};

function readSettings(): AppSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      hotkeys: Array.isArray(parsed.hotkeys)
        ? parsed.hotkeys.map((hotkey, index) => ({
            id: hotkey.id || `hotkey-${index + 1}`,
            label: hotkey.label || `Hotkey ${index + 1}`,
            command: hotkey.command || "",
            sendMode: hotkey.sendMode === "hex" ? "hex" : "ascii",
            appendNewline: hotkey.appendNewline || "",
            shortcut: hotkey.shortcut || undefined,
            actionType:
              (hotkey as any).actionType === "builtin" ? "builtin" : "command",
            builtinAction: (hotkey as any).builtinAction || undefined,
          }))
        : DEFAULT_HOTKEYS,
      theme: {
        ...DEFAULT_LIGHT_THEME,
        ...(parsed.theme || {}),
        fontSize:
          typeof (parsed.theme as ThemeSettings | undefined)?.fontSize ===
          "number"
            ? (parsed.theme as ThemeSettings).fontSize
            : DEFAULT_LIGHT_THEME.fontSize,
        fontWeight:
          typeof (parsed.theme as ThemeSettings | undefined)?.fontWeight ===
          "number"
            ? (parsed.theme as ThemeSettings).fontWeight
            : DEFAULT_LIGHT_THEME.fontWeight,
      },
      promptRowCount:
        typeof parsed.promptRowCount === "number" && parsed.promptRowCount >= 1
          ? parsed.promptRowCount
          : 100,
      lang: parsed.lang === "en" || parsed.lang === "zh" ? parsed.lang : "zh",
      compactMode:
        typeof parsed.compactMode === "boolean" ? parsed.compactMode : false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
    updateHotkeys,
    updateTheme,
    resetTheme,
    updatePromptRowCount,
    updateLang,
    updateCompactMode,
  };
}
