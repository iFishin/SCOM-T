import { X } from "lucide-react";
import { Button } from "../ui/Button";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";

type SignalStates = {
  cts: boolean;
  dsr: boolean;
  cd: boolean;
  ri: boolean;
};

type SignalDialogProps = {
  lang: Lang;
  isConnected: boolean;
  config: { rts: boolean; dtr: boolean };
  signalStates: SignalStates;
  onClose: () => void;
};

const SIGNAL_DEFS: { key: "rts" | "dtr" | "cts" | "dsr" | "cd" | "ri"; source: "out" | "in" }[] = [
  { key: "rts", source: "out" },
  { key: "dtr", source: "out" },
  { key: "cts", source: "in" },
  { key: "dsr", source: "in" },
  { key: "cd", source: "in" },
  { key: "ri", source: "in" },
];

export function SignalDialog({ lang, isConnected, config, signalStates, onClose }: SignalDialogProps) {
  function getValue(key: string): boolean {
    if (key === "rts") return config.rts;
    if (key === "dtr") return config.dtr;
    return signalStates[key as keyof SignalStates] ?? false;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex w-[420px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold">{t("signal_status", lang)}</span>
          <Button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
            <X size={16} />
          </Button>
        </div>
        <div className="p-5">
          {!isConnected ? (
            <div className="flex items-center justify-center py-8 text-xs text-[var(--text-muted)]">
              {lang === "zh" ? "未连接串口" : "Not connected"}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {SIGNAL_DEFS.map(({ key, source }) => {
                const active = getValue(key);
                const label = t(`signal_${key}`, lang);
                return (
                  <div key={key} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3">
                    <span
                      className={`inline-block h-3 w-3 rounded-full transition-colors duration-200 ${
                        active ? "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/60" : "bg-[var(--text-muted)]/20"
                      }`}
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-[var(--text-primary)]">{label}</span>
                      <span className={`text-[10px] ${active ? "text-emerald-500" : "text-[var(--text-muted)]/50"}`}>
                        {source === "out" ? (lang === "zh" ? "输出" : "Output") : (lang === "zh" ? "输入" : "Input")}
                        {active ? (lang === "zh" ? " · 高" : " · High") : (lang === "zh" ? " · 低" : " · Low")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 text-[10px] text-[var(--text-muted)]/60 text-center">
            {isConnected ? (lang === "zh" ? "每 500ms 自动刷新" : "Auto-refresh every 500ms") : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignalDialog;