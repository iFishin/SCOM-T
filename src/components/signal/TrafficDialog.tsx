import { X } from "lucide-react";
import { Button } from "../ui/Button";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";

type TrafficDialogProps = {
  lang: Lang;
  isConnected: boolean;
  txBytes: number;
  rxBytes: number;
  txRate: number;
  rxRate: number;
  onClose: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function TrafficDialog({ lang, isConnected, txBytes, rxBytes, txRate, rxRate, onClose }: TrafficDialogProps) {
  const maxBar = Math.max(txRate, rxRate, 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex w-[420px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold">{t("traffic_monitor", lang)}</span>
          <Button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
            <X size={16} />
          </Button>
        </div>
        <div className="p-5 space-y-5">
          {!isConnected ? (
            <div className="flex items-center justify-center py-8 text-xs text-[var(--text-muted)]">
              {lang === "zh" ? "未连接" : "Not connected"}
            </div>
          ) : (
            <>
              {/* TX section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-sky-500">{t("traffic_tx", lang)}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {formatRate(txRate)} / {formatBytes(txBytes)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-input)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${(txRate / maxBar) * 100}%` }}
                  />
                </div>
              </div>

              {/* RX section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-emerald-500">{t("traffic_rx", lang)}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {formatRate(rxRate)} / {formatBytes(rxBytes)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-input)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(rxRate / maxBar) * 100}%` }}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border)]">
                <div className="text-center">
                  <div className="text-lg font-bold text-sky-500">{formatBytes(txBytes)}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{t("traffic_tx", lang)} {t("traffic_bytes", lang)}</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-emerald-500">{formatBytes(rxBytes)}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{t("traffic_rx", lang)} {t("traffic_bytes", lang)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default TrafficDialog;