import { useMemo } from "react";
import { X, Wifi, WifiOff } from "lucide-react";
import { Button } from "../ui/Button";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";

type HealthDialogProps = {
  lang: Lang;
  isConnected: boolean;
  connectionType: string;
  latencyMs: number | null;
  latencyHistory: number[];
  connectedPort: { path: string; baudRate: number } | null;
  onClose: () => void;
};

function Sparkline({ data, width = 280, height = 60 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * (height - 4) - 2}`).join(" ");

  return (
    <svg width={width} height={height} className="w-full">
      {/* Grid lines */}
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--border)" strokeWidth={0.5} />
      <line x1={0} y1={height - 2} x2={width} y2={height - 2} stroke="var(--border)" strokeWidth={0.5} />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Area fill */}
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill="var(--accent)"
        fillOpacity={0.08}
      />
    </svg>
  );
}

export function HealthDialog({ lang, isConnected, connectionType, latencyMs, latencyHistory, connectedPort, onClose }: HealthDialogProps) {
  const avg = useMemo(() => {
    if (latencyHistory.length === 0) return null;
    return Math.round(latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length);
  }, [latencyHistory]);

  const max = useMemo(() => {
    if (latencyHistory.length === 0) return null;
    return Math.max(...latencyHistory);
  }, [latencyHistory]);

  const isTcp = connectionType === "tcp-client";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex w-[420px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold">{t("connection_health", lang)}</span>
          <Button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
            <X size={16} />
          </Button>
        </div>
        <div className="p-5 space-y-4">
          {!isConnected ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <WifiOff size={24} className="text-[var(--text-muted)]/40" />
              <span className="text-xs text-[var(--text-muted)]">{lang === "zh" ? "未连接" : "Not connected"}</span>
            </div>
          ) : (
            <>
              {/* Connection info */}
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
                <Wifi size={14} className="text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{connectedPort?.path ?? "—"}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{connectedPort?.baudRate ?? "—"} baud · {isTcp ? "TCP" : connectionType}</div>
                </div>
              </div>

              {/* Latency */}
              {isTcp && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold">{t("health_latency", lang)}</span>
                    <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                      {latencyMs !== null ? `${latencyMs}ms` : "—"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2">
                    <Sparkline data={latencyHistory} />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-[var(--text-muted)]">
                    <span>{t("health_avg", lang)}: {avg !== null ? `${avg}ms` : "—"}</span>
                    <span>{t("health_max", lang)}: {max !== null ? `${max}ms` : "—"}</span>
                    <span>{lang === "zh" ? "样本" : "Samples"}: {latencyHistory.length}</span>
                  </div>
                </div>
              )}

              {!isTcp && (
                <div className="flex items-center justify-center py-4 text-xs text-[var(--text-muted)]">
                  {lang === "zh" ? "延迟监控仅适用于 TCP 客户端连接" : "Latency monitoring available for TCP client only"}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default HealthDialog;