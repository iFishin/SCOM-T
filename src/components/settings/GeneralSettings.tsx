
import { Maximize2, Minimize2, Moon, Sun } from "lucide-react";
import { Button } from "../ui/Button";
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from "../../hooks/useSettings.ts";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";
import type { ThemeSettings } from "../../hooks/useSettings.ts";

export function GeneralSettings({ theme, lang, compactMode, closeToTray, allowMultiInstance, onThemeChange, onLangChange, onCompactModeChange, onCloseBehaviorChange, onAllowMultiInstanceChange }: {
  theme: ThemeSettings;
  lang: Lang;
  compactMode?: boolean;
  closeToTray?: boolean;
  allowMultiInstance?: boolean;
  onThemeChange: (t: ThemeSettings) => void;
  onLangChange: (l: Lang) => void;
  onCompactModeChange?: (v: boolean) => void;
  onCloseBehaviorChange?: (v: boolean) => void;
  onAllowMultiInstanceChange?: (v: boolean) => void;
}) {
  function handleModeChange(mode: ThemeSettings["mode"]) {
    const base = mode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
    onThemeChange({
      ...theme,
      mode: base.mode,
      bgPrimary: base.bgPrimary,
      bgSurface: base.bgSurface,
      bgInput: base.bgInput,
      textPrimary: base.textPrimary,
      textMuted: base.textMuted,
      border: base.border,
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-3 text-sm font-semibold">{t("display_mode", lang)}</div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => handleModeChange("light")}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${theme.mode === "light" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            <Sun size={14} />
            {t("mode_light", lang)}
          </Button>
          <Button
            type="button"
            onClick={() => handleModeChange("dark")}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${theme.mode === "dark" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            <Moon size={14} />
            {t("mode_dark", lang)}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold">{t("language", lang)}</div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => onLangChange("zh")}
            className={`rounded-lg border px-3 py-2 text-xs ${lang === "zh" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            中文
          </Button>
          <Button
            type="button"
            onClick={() => onLangChange("en")}
            className={`rounded-lg border px-3 py-2 text-xs ${lang === "en" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            English
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold">{t("compact_mode", lang)}</div>
        <div className="text-xs text-[var(--text-muted)] mb-3">{t("compact_mode_desc", lang)}</div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => onCompactModeChange?.(false)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${!compactMode ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            <Maximize2 size={14} />
            {lang === "zh" ? "标准" : "Normal"}
          </Button>
          <Button
            type="button"
            onClick={() => onCompactModeChange?.(true)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${compactMode ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            <Minimize2 size={14} />
            {lang === "zh" ? "紧凑" : "Compact"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold">{t("close_behavior", lang)}</div>
        <div className="text-xs text-[var(--text-muted)] mb-3">{t("close_behavior_desc", lang)}</div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => onCloseBehaviorChange?.(true)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${closeToTray !== false ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            {lang === "zh" ? "最小化到托盘" : "Tray"}
          </Button>
          <Button
            type="button"
            onClick={() => onCloseBehaviorChange?.(false)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${closeToTray === false ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            {lang === "zh" ? "退出程序" : "Exit"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold">{t("multi_instance", lang)}</div>
        <div className="text-xs text-[var(--text-muted)] mb-3">{t("multi_instance_desc", lang)}</div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => onAllowMultiInstanceChange?.(false)}
            className={`rounded-lg border px-3 py-2 text-xs ${!allowMultiInstance ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            {lang === "zh" ? "单实例" : "Single"}
          </Button>
          <Button
            type="button"
            onClick={() => onAllowMultiInstanceChange?.(true)}
            className={`rounded-lg border px-3 py-2 text-xs ${allowMultiInstance ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            {lang === "zh" ? "多实例" : "Multi"}
          </Button>
        </div>
      </div>
    </div>
  );
}
