import { useEffect, useRef, useState } from "react";
import { X, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";

type SignalSnapshot = {
  time: number;
  rts: boolean;
  dtr: boolean;
  cts: boolean;
  dsr: boolean;
  cd: boolean;
  ri: boolean;
};

type WaveformDialogProps = {
  lang: Lang;
  isConnected: boolean;
  getSignalHistory: () => SignalSnapshot[];
  onClose: () => void;
};

const SIGNAL_NAMES = ["RTS", "DTR", "CTS", "DSR", "CD", "RI"] as const;
const SIGNAL_KEYS: (keyof SignalSnapshot)[] = ["rts", "dtr", "cts", "dsr", "cd", "ri"];
const HISTORY_WINDOW_MS = 30_000; // show last 30 seconds
const LANE_HEIGHT = 28;
const LABEL_WIDTH = 40;
const MARGIN = { top: 12, bottom: 20, right: 12 };

export function WaveformDialog({ lang, isConnected, getSignalHistory, onClose }: WaveformDialogProps) {
  const [paused, setPaused] = useState(false);
  const [history, setHistory] = useState<SignalSnapshot[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dim, setDim] = useState({ w: 600, h: 0 });

  // Refresh history from the hook ref
  useEffect(() => {
    if (paused) return;
    setHistory([...getSignalHistory()]);
    const timer = setInterval(() => {
      setHistory([...getSignalHistory()]);
    }, 500);
    return () => clearInterval(timer);
  }, [paused]);

  // Measure SVG width
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = SIGNAL_NAMES.length * LANE_HEIGHT + MARGIN.top + MARGIN.bottom;
        setDim({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute the time range for the visible window
  const now = Date.now();
  const windowEnd = history.length > 0 ? history[history.length - 1].time : now;
  const windowStart = windowEnd - HISTORY_WINDOW_MS;

  // Filter history to visible window
  const visible = history.filter((s) => s.time >= windowStart);

  const plotW = Math.max(0, dim.w - LABEL_WIDTH - MARGIN.right);
  const plotH = SIGNAL_NAMES.length * LANE_HEIGHT;

  function xPos(time: number): number {
    if (plotW <= 0) return 0;
    return LABEL_WIDTH + ((time - windowStart) / HISTORY_WINDOW_MS) * plotW;
  }

  function yPos(lane: number): number {
    return MARGIN.top + lane * LANE_HEIGHT;
  }

  // Generate waveform path data for each signal
  function buildPath(key: keyof SignalSnapshot): string {
    if (visible.length === 0) return "";
    // Start at the left edge
    const first = visible[0];
    let x = LABEL_WIDTH;
    let y = yPos(SIGNAL_KEYS.indexOf(key));
    const high = first[key] as boolean;
    let d = `M ${x} ${y + (high ? 0 : LANE_HEIGHT / 2)}`;

    // Draw segments between each sample
    for (let i = 1; i < visible.length; i++) {
      const prev = visible[i - 1];
      const curr = visible[i];
      const prevHigh = prev[key] as boolean;
      const currHigh = curr[key] as boolean;
      const x2 = xPos(curr.time);

      if (prevHigh !== currHigh) {
        // Transition: draw horizontal to x2, then vertical
        d += ` L ${x2} ${y + (prevHigh ? 0 : LANE_HEIGHT / 2)}`;
        d += ` L ${x2} ${y + (currHigh ? 0 : LANE_HEIGHT / 2)}`;
      }
      // If no transition, the line continues horizontally
      // Always draw to x2 at current level
      d += ` L ${x2} ${y + (currHigh ? 0 : LANE_HEIGHT / 2)}`;
    }
    return d;
  }

  // Generate filled area path for each signal (for the green/gray fill)
  function buildAreaPath(key: keyof SignalSnapshot): string {
    if (visible.length === 0) return "";
    const linePath = buildPath(key);
    if (!linePath) return "";
    const idx = SIGNAL_KEYS.indexOf(key);
    const y = yPos(idx);
    const bottom = y + LANE_HEIGHT / 2;
    // Find the last x position
    const last = visible[visible.length - 1];
    const lastX = xPos(last.time);
    // Close the area: from last point down to bottom, then back to left
    return `${linePath} L ${lastX} ${bottom} L ${LABEL_WIDTH} ${bottom} Z`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex w-[680px] max-w-full max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold">{t("signal_waveform", lang)}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setHistory([]);
                setPaused(false);
              }}
              className="flex items-center gap-1 text-xs"
              title={lang === "zh" ? "清除" : "Clear"}
            >
              <Trash2 size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPaused((v) => !v)}
              className="flex items-center gap-1 text-xs"
              title={paused ? (lang === "zh" ? "继续" : "Resume") : (lang === "zh" ? "暂停" : "Pause")}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
            </Button>
            <Button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {!isConnected ? (
            <div className="flex items-center justify-center py-12 text-xs text-[var(--text-muted)]">
              {lang === "zh" ? "请先打开串口连接" : "Open a serial port first"}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-xs text-[var(--text-muted)]">
              {lang === "zh" ? "正在采集信号数据..." : "Collecting signal data..."}
            </div>
          ) : (
            <svg
              ref={svgRef}
              width="100%"
              height={dim.h}
              className="block"
              style={{ minHeight: dim.h }}
            >
              {/* Grid lines (horizontal, between lanes) */}
              {SIGNAL_NAMES.map((_, i) => (
                <line
                  key={`grid-${i}`}
                  x1={LABEL_WIDTH}
                  y1={yPos(i) + LANE_HEIGHT / 2}
                  x2={LABEL_WIDTH + plotW}
                  y2={yPos(i) + LANE_HEIGHT / 2}
                  stroke="var(--border)"
                  strokeWidth={0.5}
                  opacity={0.5}
                />
              ))}

              {/* Signal waveforms */}
              {SIGNAL_KEYS.map((key, i) => {
                const areaD = buildAreaPath(key);
                const lineD = buildPath(key);
                return (
                  <g key={key}>
                    {/* Lane label */}
                    <text
                      x={4}
                      y={yPos(i) + LANE_HEIGHT / 2 + 1}
                      className="fill-[var(--text-muted)]"
                      fontSize={10}
                      fontFamily="ui-monospace, monospace"
                      textAnchor="start"
                      dominantBaseline="middle"
                    >
                      {SIGNAL_NAMES[i]}
                    </text>
                    {/* Fill area (high = green, low = gray) */}
                    {areaD && (
                      <path
                        d={areaD}
                        fill={key === "rts" || key === "dtr" ? "var(--accent)" : "#22c55e"}
                        opacity={0.15}
                      />
                    )}
                    {/* Waveform line */}
                    {lineD && (
                      <path
                        d={lineD}
                        fill="none"
                        stroke={key === "rts" || key === "dtr" ? "var(--accent)" : "#22c55e"}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </g>
                );
              })}

              {/* Time axis */}
              {[0, 5, 10, 15, 20, 25, 30].map((sec) => {
                const t = windowEnd - sec * 1000;
                const x = xPos(t);
                if (x < LABEL_WIDTH || x > LABEL_WIDTH + plotW) return null;
                return (
                  <g key={`time-${sec}`}>
                    <line
                      x1={x}
                      y1={MARGIN.top}
                      x2={x}
                      y2={MARGIN.top + plotH}
                      stroke="var(--border)"
                      strokeWidth={0.5}
                      strokeDasharray="2 2"
                      opacity={0.3}
                    />
                    <text
                      x={x}
                      y={MARGIN.top + plotH + 14}
                      className="fill-[var(--text-muted)]"
                      fontSize={9}
                      textAnchor="middle"
                      opacity={0.6}
                    >
                      -{sec}s
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
          <span>
            {visible.length} {lang === "zh" ? "个采样点" : "samples"}
            {paused && ` · ${lang === "zh" ? "已暂停" : "Paused"}`}
          </span>
          <Button variant="primary" size="sm" onClick={onClose} className="text-xs">
            {t("dialog_close", lang)}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default WaveformDialog;