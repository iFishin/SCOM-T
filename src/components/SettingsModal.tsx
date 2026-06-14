import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/Button";
import type { HotkeyConfig, ThemeSettings } from "../hooks/useSettings.ts";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import { GeneralSettings } from "./settings/GeneralSettings.tsx";
import { HotkeysEditor } from "./settings/HotkeysEditor.tsx";
import { ThemeEditor } from "./settings/ThemeEditor.tsx";

// Subcomponents extracted to src/components/settings/*


type SettingsModalProps = {
  open: boolean;
  hotkeys: HotkeyConfig[];
  theme: ThemeSettings;
  lang: Lang;
  onClose: () => void;
  onHotkeysChange: (hotkeys: HotkeyConfig[]) => void;
  onThemeChange: (theme: ThemeSettings) => void;
  onThemeReset: (mode?: ThemeSettings["mode"]) => void;
  onLangChange: (lang: Lang) => void;
};

// Helpers for hotkeys are now inside HotkeysEditor

export function SettingsModal({
  open,
  hotkeys,
  theme,
  lang,
  onClose,
  onHotkeysChange,
  onThemeChange,
  onThemeReset,
  onLangChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = [t("settings_general", lang), t("settings_hotkeys", lang), t("settings_theme", lang)];


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[88vh] w-[900px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{t("settings_title", lang)}</div>
            <div className="text-xs text-[var(--text-muted)]">{lang === "zh" ? "热键、主题与应用信息" : "Hotkeys, Theme & App Info"}</div>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            title="关闭"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-32 shrink-0 border-r border-[var(--border)] p-2">
            {tabs.map((tab, index) => (
              <Button
                key={tab}
                type="button"
                onClick={() => setActiveTab(index)}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  activeTab === index
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab}
              </Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activeTab === 0 && (
              <GeneralSettings theme={theme} lang={lang} onThemeChange={onThemeChange} onLangChange={onLangChange} />
            )}

            {activeTab === 1 && (
              <HotkeysEditor hotkeys={hotkeys} onHotkeysChange={onHotkeysChange} lang={lang} />
            )}

            {activeTab === 2 && (
              <ThemeEditor theme={theme} lang={lang} onThemeChange={onThemeChange} onThemeReset={onThemeReset} />
            )}

            </div>
        </div>
      </div>
    </div>
  );
}
