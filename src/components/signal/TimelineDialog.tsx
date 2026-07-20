import { useMemo } from "react";
import { X, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "../ui/Button";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";
import type { SerialLogEntry } from "../../hooks/useSerialPort.ts";

type TimelineDialogProps = {
  lang: Lang;
  logs: SerialLogEntry[];
  onClose: () => void;
};

const MAX_ITEMS = 80;

export function TimelineDialog({ lang, logs, onClose }: TimelineDialogProps) {
  const recent = useMemo(() => {
    return logs.slice(-MAX_ITEMS);
  }, [logs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex w-[560px] max-w-full max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold">{t("log_timeline", lang)}</span>
          <Button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
            <X size={16} />
          </Button>
        </div>

        {recent.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-[var(--text-muted)]">
            {lang === "zh" ? "暂无日志数据" : "No log data"}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="relative">
              {/* Timeline center line */}
              <div className="absolute left-[26px] top-2 bottom-2 w-0.5 bg-[var(--border)]" />

              <div className="space-y-1.5">
                {recent.map((entry) => {
                  const isSent = entry.direction === "sent";
                  const color = isSent ? "border-sky-400 bg-sky-500/10" : "border-emerald-400 bg-emerald-500/10";
                  const dotColor = isSent ? "bg-sky-500" : "bg-emerald-500";
                  const Icon = isSent ? ArrowUp : ArrowDown;

                  return (
                    <div key={entry.id} className="flex items-start gap-3">
                      {/* Dot and icon */}
                      <div className="relative flex shrink-0 items-center justify-center" style={{ width: 52 }}>
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor} ring-2 ring-[var(--bg-surface)] z-10`} />
                      </div>
                      {/* Content card */}
                      <div className={`flex-1 min-w-0 rounded-lg border ${color} px-2.5 py-1.5`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Icon size={10} className={isSent ? "text-sky-500" : "text-emerald-500"} />
                          <span className="text-[10px] text-[var(--text-muted)]">{entry.timestamp}</span>
                          {entry.source && entry.source !== "serial" && (
                            <span className="text-[9px] px-1 rounded bg-[var(--bg-input)] text-[var(--text-muted)]">{entry.source}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-primary)] font-mono break-all leading-relaxed">
                          {entry.payload}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
          <span>{recent.length} / {logs.length} {lang === "zh" ? "条记录" : "entries"}</span>
          <Button variant="primary" size="sm" onClick={onClose} className="text-xs">
            {t("dialog_close", lang)}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default TimelineDialog;