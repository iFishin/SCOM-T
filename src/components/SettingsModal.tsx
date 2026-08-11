import { useState } from "react";
import { Clock, Timer, X } from "lucide-react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import type { HotkeyConfig, ThemeSettings, GridItemLayout, MockSerialConfig, CustomEnder } from "../hooks/useSettings.ts";
import { DEFAULT_GRID_LAYOUT } from "../hooks/useSettings.ts";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import { GeneralSettings } from "./settings/GeneralSettings.tsx";
import { HotkeysEditor } from "./settings/HotkeysEditor.tsx";
import { ThemeEditor } from "./settings/ThemeEditor.tsx";
import { LayoutEditor } from "./settings/LayoutEditor.tsx";
import { MockSerialSettings } from "./settings/MockSerialSettings.tsx";
import { MarketplaceSettings } from "./settings/MarketplaceSettings.tsx";
import { CommandLineSettings } from "./settings/CommandLineSettings.tsx";

// Subcomponents extracted to src/components/settings/*


type SettingsModalProps = {
  open: boolean;
  hotkeys: HotkeyConfig[];
  theme: ThemeSettings;
  lang: Lang;
  compactMode?: boolean;
  closeToTray?: boolean;
  allowMultiInstance?: boolean;
  logRetentionDays?: number;
  portFilterMode?: "default" | "all";
  cloudServerUrl?: string;
  cloudAuthToken?: string;
  cloudUploaderName?: string;
  timestampFormat?: "time" | "datetime" | "none";
  layoutMode?: "classic" | "grid";
  gridLayout?: GridItemLayout[];
  mockSerial?: MockSerialConfig;
  onClose: () => void;
  onHotkeysChange: (hotkeys: HotkeyConfig[]) => void;
  onThemeChange: (theme: ThemeSettings) => void;
  onThemeReset: (mode?: ThemeSettings["mode"]) => void;
  onLangChange: (lang: Lang) => void;
  onCompactModeChange?: (v: boolean) => void;
  onCloseBehaviorChange?: (v: boolean) => void;
  onAllowMultiInstanceChange?: (v: boolean) => void;
  onLayoutModeChange?: (mode: "classic" | "grid") => void;
  onGridLayoutChange?: (layout: GridItemLayout[]) => void;
  onTimestampFormatChange?: (format: "time" | "datetime" | "none") => void;
  onLogRetentionDaysChange?: (days: number) => void;
  onPortFilterModeChange?: (mode: "default" | "all") => void;
  onCloudServerUrlChange?: (url: string) => void;
  onCloudAuthTokenChange?: (token: string) => void;
  onCloudUploaderNameChange?: (name: string) => void;
  onMockSerialChange?: (config: MockSerialConfig) => void;
  customEnders?: CustomEnder[];
  onCustomEndersChange?: (config: CustomEnder[]) => void;
  rxIdleFlushMs?: number;
  logBatchFlushMs?: number;
  onRxIdleFlushMsChange?: (ms: number) => void;
  onLogBatchFlushMsChange?: (ms: number) => void;
};

// Helpers for hotkeys are now inside HotkeysEditor

export function SettingsModal({
  open,
  hotkeys,
  theme,
  lang,
  compactMode,
  closeToTray,
  allowMultiInstance,
  logRetentionDays,
  portFilterMode,
  cloudServerUrl,
  cloudAuthToken,
  cloudUploaderName,
  timestampFormat,
  layoutMode,
  gridLayout,
  mockSerial,
  onClose,
  onHotkeysChange,
  onThemeChange,
  onThemeReset,
  onLangChange,
  onCompactModeChange,
  onCloseBehaviorChange,
  onAllowMultiInstanceChange,
  onLayoutModeChange,
  onGridLayoutChange,
  onTimestampFormatChange,
  onLogRetentionDaysChange,
  onPortFilterModeChange,
  onCloudServerUrlChange,
  onCloudAuthTokenChange,
  onCloudUploaderNameChange,
  onMockSerialChange,
  customEnders,
  onCustomEndersChange,
  rxIdleFlushMs,
  logBatchFlushMs,
  onRxIdleFlushMsChange,
  onLogBatchFlushMsChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = [
    t("settings_general", lang),
    t("settings_log", lang),
    t("settings_hotkeys", lang),
    t("settings_theme", lang),
    t("settings_layout", lang),
    t("settings_mock_serial", lang),
    t("settings_marketplace", lang),
    t("settings_command_line", lang),
  ];


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
              <GeneralSettings theme={theme} lang={lang} compactMode={compactMode} closeToTray={closeToTray} allowMultiInstance={allowMultiInstance} logRetentionDays={logRetentionDays} portFilterMode={portFilterMode} onThemeChange={onThemeChange} onLangChange={onLangChange} onCompactModeChange={onCompactModeChange} onCloseBehaviorChange={onCloseBehaviorChange} onAllowMultiInstanceChange={onAllowMultiInstanceChange} onLogRetentionDaysChange={onLogRetentionDaysChange} onPortFilterModeChange={onPortFilterModeChange} />
            )}

            {activeTab === 1 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
                  <div className="mb-2 text-sm font-semibold flex items-center gap-1.5">
                    <Clock size={14} />
                    {lang === "zh" ? "日志时间戳" : "Log Timestamp"}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mb-3">
                    {lang === "zh" ? "选择日志接收中时间戳的显示格式" : "Choose the timestamp format in log display"}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => onTimestampFormatChange?.("time")}
                      className={`rounded-lg border px-3 py-2 text-xs ${(timestampFormat ?? "datetime") === "time" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
                    >
                      {lang === "zh" ? "仅时间" : "Time Only"}
                      <span className="ml-1.5 opacity-70">HH:mm:ss.mmm</span>
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onTimestampFormatChange?.("datetime")}
                      className={`rounded-lg border px-3 py-2 text-xs ${(timestampFormat ?? "datetime") === "datetime" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
                    >
                      {lang === "zh" ? "日期+时间" : "Date & Time"}
                      <span className="ml-1.5 opacity-70">YYYY-MM-DD HH:mm:ss.mmm</span>
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onTimestampFormatChange?.("none")}
                      className={`rounded-lg border px-3 py-2 text-xs ${(timestampFormat ?? "datetime") === "none" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--text-muted)]"}`}
                    >
                      {lang === "zh" ? "无" : "None"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
                  <div className="mb-2 text-sm font-semibold flex items-center gap-1.5">
                    <Timer size={14} />
                    {lang === "zh" ? "串口数据时序" : "Serial Data Timing"}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mb-3">
                    {lang === "zh" ? "调整接收数据的判断与渲染时机。一般无需修改。" : "Tune when received data is framed and rendered. Usually leave as-is."}
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-48 shrink-0">
                        <div className="text-xs">{lang === "zh" ? "空闲刷新间隔" : "Idle Flush (ms)"}</div>
                        <div className="text-theme-10 text-[var(--text-muted)]">
                          {lang === "zh" ? "半行数据判定已发完的等待时间" : "Wait before flushing a partial line"}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={String(rxIdleFlushMs ?? 50)}
                        onChange={(e) => {
                          const v = parseInt(e.currentTarget.value, 10);
                          if (!Number.isNaN(v)) onRxIdleFlushMsChange?.(v);
                        }}
                        className="w-20 text-center"
                      />
                      <span className="text-xs text-[var(--text-muted)]">ms</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-48 shrink-0">
                        <div className="text-xs">{lang === "zh" ? "渲染批间隔" : "Render Batch (ms)"}</div>
                        <div className="text-theme-10 text-[var(--text-muted)]">
                          {lang === "zh" ? "日志合并渲染的等待时间" : "Coalesce log renders by this delay"}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={5}
                        max={1000}
                        value={String(logBatchFlushMs ?? 50)}
                        onChange={(e) => {
                          const v = parseInt(e.currentTarget.value, 10);
                          if (!Number.isNaN(v)) onLogBatchFlushMsChange?.(v);
                        }}
                        className="w-20 text-center"
                      />
                      <span className="text-xs text-[var(--text-muted)]">ms</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 2 && (
              <HotkeysEditor hotkeys={hotkeys} customEnders={customEnders} onHotkeysChange={onHotkeysChange} lang={lang} />
            )}

            {activeTab === 3 && (
              <ThemeEditor theme={theme} lang={lang} onThemeChange={onThemeChange} onThemeReset={onThemeReset} />
            )}

            {activeTab === 4 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
                  <div className="mb-3 text-sm font-semibold">{t("layout_mode", lang)}</div>
                  <div className="text-xs text-[var(--text-muted)] mb-3">{t("layout_grid_desc", lang)}</div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => onLayoutModeChange?.("classic")}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                        layoutMode !== "grid"
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--border)] text-[var(--text-muted)]"
                      }`}
                    >
                      {t("layout_classic", lang)}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onLayoutModeChange?.("grid")}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                        layoutMode === "grid"
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--border)] text-[var(--text-muted)]"
                      }`}
                    >
                      {t("layout_grid", lang)}
                    </Button>
                  </div>
                </div>

                {layoutMode === "grid" && (
                  <LayoutEditor
                    layout={gridLayout ?? []}
                    lang={lang}
                    onLayoutChange={(l) => onGridLayoutChange?.(l)}
                    onReset={() => onGridLayoutChange?.(DEFAULT_GRID_LAYOUT)}
                  />
                )}
              </div>
            )}

            {activeTab === 5 && mockSerial && onMockSerialChange && (
              <MockSerialSettings
                lang={lang}
                mockSerial={mockSerial}
                onMockSerialChange={onMockSerialChange}
              />
            )}

            {activeTab === 6 && (
              <MarketplaceSettings
                lang={lang}
                cloudServerUrl={cloudServerUrl}
                cloudAuthToken={cloudAuthToken}
                cloudUploaderName={cloudUploaderName}
                onCloudServerUrlChange={onCloudServerUrlChange}
                onCloudAuthTokenChange={onCloudAuthTokenChange}
                onCloudUploaderNameChange={onCloudUploaderNameChange}
              />
            )}

            {activeTab === 7 && (
              <CommandLineSettings
                lang={lang}
                customEnders={customEnders ?? []}
                onCustomEndersChange={(list) => onCustomEndersChange?.(list)}
              />
            )}

            </div>
        </div>
      </div>
    </div>
  );
}
