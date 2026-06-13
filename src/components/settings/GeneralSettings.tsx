import React from "react";
import { Moon, Sun } from "lucide-react";
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from "../../hooks/useSettings.ts";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";
import type { ThemeSettings } from "../../hooks/useSettings.ts";

export function GeneralSettings({ theme, lang, onThemeChange, onLangChange }: {
  theme: ThemeSettings;
  lang: Lang;
  onThemeChange: (t: ThemeSettings) => void;
  onLangChange: (l: Lang) => void;
}) {
  function handleModeChange(mode: ThemeSettings["mode"]) {
    const base = mode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
    onThemeChange({ ...base, accent: theme.accent });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-3 text-sm font-semibold">{t("display_mode", lang)}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange("light")}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${theme.mode === "light" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            <Sun size={14} />
            {t("mode_light", lang)}
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("dark")}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${theme.mode === "dark" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            <Moon size={14} />
            {t("mode_dark", lang)}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold">{t("language", lang)}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onLangChange("zh")}
            className={`rounded-lg border px-3 py-2 text-xs ${lang === "zh" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            中文
          </button>
          <button
            type="button"
            onClick={() => onLangChange("en")}
            className={`rounded-lg border px-3 py-2 text-xs ${lang === "en" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            English
          </button>
        </div>
      </div>
    </div>
  );
}
