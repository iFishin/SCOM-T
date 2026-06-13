import { useLayoutEffect, useRef, useState } from "react";
import { Trash2, Eraser, ArrowDownToLine } from "lucide-react";
import type { LogDisplayMode, ReceiveMode, SerialLogEntry } from "../hooks/useSerialPort.ts";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";

type ReceiveLogProps = {
  logs: SerialLogEntry[];
  receiveMode: ReceiveMode;
  lang: Lang;
  onReceiveModeChange: (mode: ReceiveMode) => void;
  onClearAll: () => void;
  onClearReceived: () => void;
  onClearSent: () => void;
};

const SCROLL_THRESHOLD = 32;

export function ReceiveLog({
  logs,
  receiveMode,
  lang,
  onReceiveModeChange,
  onClearAll,
  onClearReceived,
  onClearSent,
}: ReceiveLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [displayMode, setDisplayMode] = useState<LogDisplayMode>("card");

  useLayoutEffect(() => {
    if (pinned && containerRef.current) {
      const el = containerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [logs, pinned]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
    setPinned(atBottom);
  }

  function jumpToBottom() {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {t("received", lang)}
        </span>

        {!pinned && (
          <button
            type="button"
            onClick={jumpToBottom}
            title={t("jump_to_bottom", lang)}
            className="flex items-center gap-1 rounded border border-[var(--accent)] bg-[var(--accent)] px-1.5 py-0.5 text-[0.625rem] font-semibold text-white"
          >
            <ArrowDownToLine size={14} />
            {t("scroll_follow", lang)}
          </button>
        )}

        <select
          value={displayMode}
          onChange={(e) => setDisplayMode(e.currentTarget.value as LogDisplayMode)}
          className="ml-auto rounded border border-[var(--border)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          <option value="card">{t("display_card", lang)}</option>
          <option value="text">{t("display_text", lang)}</option>
        </select>

        <label className="flex cursor-pointer items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5 text-[11px] transition-colors hover:border-[var(--accent)]">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={receiveMode === "hex"}
            onChange={(e) => onReceiveModeChange(e.currentTarget.checked ? "hex" : "ascii")}
          />
          HEX
        </label>

        <button
          type="button"
          onClick={onClearReceived}
          title={t("clear_rx_log", lang)}
          className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-rose-300 hover:text-rose-500"
        >
          <Eraser size={11} />
          RX
        </button>

        <button
          type="button"
          onClick={onClearSent}
          title={t("clear_tx_log", lang)}
          className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-rose-300 hover:text-rose-500"
        >
          <Eraser size={11} />
          TX
        </button>

        <button
          type="button"
          onClick={onClearAll}
          title={ t("clear_log", lang) }
          className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-rose-300 hover:text-rose-500"
        >
          <Trash2 size={11} />
          { t("all", lang) }
        </button>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
        style={{ fontFamily: "var(--mono-font-family)" }}
      >
        {logs.length === 0 ? (
          <div className="flex h-full min-h-16 items-center justify-center text-[var(--text-muted)] opacity-60">
            {t("no_data", lang)}
          </div>
        ) : displayMode === "text" ? (
          <div className="space-y-0.5">
            {logs.map((log) => {
              const isReceived = log.direction === "received";
              const ts = log.timestamp.replace(/^\[|\]$/g, "");
              return (
                <div
                  key={log.id}
                  className={`break-all whitespace-pre-wrap rounded px-2 py-0.5 text-xs leading-relaxed ${
                    isReceived ? "text-emerald-600" : "text-sky-600"
                  }`}
                >
                  <span className="opacity-80">
                    {isReceived ? "[" : "("}{ts}{isReceived ? "]" : ")"}
                  </span>{" "}
                  {log.payload}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1"
              >
                <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                  <span
                    className={`rounded px-1 py-0.5 font-bold ${
                      log.direction === "received"
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-sky-100 text-sky-600"
                    }`}
                  >
                    {log.direction === "received" ? "RX" : "TX"}
                  </span>
                  <span>{log.timestamp}</span>
                  <span className="opacity-60">{log.mode.toUpperCase()}</span>
                </div>
                <div className="break-all whitespace-pre-wrap text-[var(--text-primary)]">
                  {log.payload}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
