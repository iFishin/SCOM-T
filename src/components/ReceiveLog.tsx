import { useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { Search, Trash2, Eraser, ArrowDownToLine, Save, Circle, X } from "lucide-react";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { Panel } from "./ui/Panel";
import { Select } from "./ui/Select";
import { SearchReplace } from "./SearchReplace.tsx";
import {
  buildSearchRegex,
  searchInText,
  type SearchOptions,
  type MatchRange,
} from "../hooks/useSearch.ts";
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
  /** Log file saving */
  savePath?: string | null;
  realTimeLog?: boolean;
  onSelectLogFile?: () => void;
  onToggleRealTime?: () => void;
  onFlushLogs?: () => void;
  onCloseLogFile?: () => void;
};

const SCROLL_THRESHOLD = 32;
const LOG_SEPARATOR = "\n";

/** Split text into highlighted segments for a given regex */
function highlightSegments(text: string, regex: RegExp | null): { text: string; match: boolean }[] {
  if (!regex) return [{ text, match: false }];
  const segments: { text: string; match: boolean }[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) segments.push({ text: text.slice(lastIdx, m.index), match: false });
    segments.push({ text: m[0], match: true });
    lastIdx = m.index + m[0].length;
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  if (lastIdx < text.length) segments.push({ text: text.slice(lastIdx), match: false });
  return segments.length ? segments : [{ text, match: false }];
}

export function ReceiveLog({
  logs,
  receiveMode,
  lang,
  onReceiveModeChange,
  onClearAll,
  onClearReceived,
  onClearSent,
  savePath,
  realTimeLog,
  onSelectLogFile,
  onToggleRealTime,
  onFlushLogs,
  onCloseLogFile,
}: ReceiveLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [displayMode, setDisplayMode] = useState<LogDisplayMode>("card");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false, regex: false, wholeWord: false,
  });
  const [searchMatches, setSearchMatches] = useState<MatchRange[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);

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

  // ── Log search ──
  const logText = useMemo(
    () => logs.map((l) => l.payload).join(LOG_SEPARATOR),
    [logs],
  );

  const searchRegex = useMemo(
    () => buildSearchRegex(searchQuery, searchOptions),
    [searchQuery, searchOptions],
  );

  const handleLogSearch = useCallback((query: string, opts: SearchOptions) => {
    setSearchQuery(query);
    setSearchOptions(opts);
    const results = searchInText(logText, query, opts);
    setSearchMatches(results);
    setSearchIndex(results.length > 0 ? 0 : -1);
  }, [logText]);

  const handleNavigate = useCallback((idx: number) => {
    setSearchIndex(Math.max(0, Math.min(idx, searchMatches.length - 1)));
    // Scroll to the nth <mark> element in the container
    const marks = containerRef.current?.querySelectorAll("mark.hl-search-match");
    if (marks && marks[idx]) {
      marks[idx].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [searchMatches.length]);

  return (
    <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {t("received", lang)}
        </span>

        {!pinned && (
          <Button variant="primary" size="sm" onClick={jumpToBottom} title={t("jump_to_bottom", lang)} className="flex items-center gap-1 px-1.5">
            <ArrowDownToLine size={14} />
            {t("scroll_follow", lang)}
          </Button>
        )}

        {/* Search toggle */}
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className={`rounded p-1 transition-colors ${
            searchOpen
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
          }`}
          title={lang === "zh" ? "搜索" : "Search"}
        >
          <Search size={13} />
        </button>

        <Select
          value={displayMode}
          onChange={(e) => setDisplayMode(e.currentTarget.value as LogDisplayMode)}
          className="ml-auto w-auto"
        >
          <option value="card">{t("display_card", lang)}</option>
          <option value="text">{t("display_text", lang)}</option>
        </Select>

        <Checkbox
          checked={receiveMode === "hex"}
          onChange={(e) => onReceiveModeChange(e.currentTarget.checked ? "hex" : "ascii")}
          label="HEX"
        />

        <Button type="button" variant="ghost" size="sm" onClick={onClearReceived} title={t("clear_rx_log", lang)} className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-rose-300 hover:text-rose-500">
          <Eraser size={11} />
          RX
        </Button>

        <Button type="button" variant="ghost" size="sm" onClick={onClearSent} title={t("clear_tx_log", lang)} className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-rose-300 hover:text-rose-500">
          <Eraser size={11} />
          TX
        </Button>

        <Button type="button" variant="ghost" size="sm" onClick={onClearAll} title={ t("clear_log", lang) } className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-rose-300 hover:text-rose-500">
          <Trash2 size={11} />
          { t("all", lang) }
        </Button>

        {/* ── Log file controls ── */}
        {savePath ? (
          <div className="flex items-center gap-1 pl-2 ml-1 border-l border-[var(--border)]">
            <span
              className="text-[10px] text-[var(--text-muted)] max-w-[100px] truncate"
              title={savePath}
            >
              {savePath.split(/[\\/]/).pop()}
            </span>
            <button
              type="button"
              onClick={onToggleRealTime}
              className={`rounded p-0.5 transition-colors ${
                realTimeLog ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              } hover:text-[var(--text-primary)]`}
              title={realTimeLog ? "Real-time: ON" : "Real-time: OFF"}
            >
              <Circle size={10} fill={realTimeLog ? "currentColor" : "none"} />
            </button>
            {!realTimeLog && (
              <button
                type="button"
                onClick={onFlushLogs}
                className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Flush logs to file"
              >
                <Save size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={onCloseLogFile}
              className="rounded p-0.5 text-[var(--text-muted)] hover:text-rose-500 transition-colors"
              title="Close log file"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelectLogFile}
            className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-1"
            title="Save logs to file..."
          >
            <Save size={12} />
          </button>
        )}
      </div>

      {/* Search bar */}
      {searchOpen && (
        <SearchReplace
          onSearch={handleLogSearch}
          matchCount={searchMatches.length}
          matchIndex={searchIndex}
          onNavigate={handleNavigate}
          onClose={() => {
            setSearchOpen(false);
            setSearchQuery("");
            setSearchOptions({ caseSensitive: false, regex: false, wholeWord: false });
            setSearchMatches([]);
            setSearchIndex(-1);
          }}
          lang={lang}
        />
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-1 font-mono text-sm"
        style={{ fontFamily: "var(--mono-font-family)" }}
      >
        {logs.length === 0 ? (
          <div className="flex h-full min-h-16 items-center justify-center text-[var(--text-muted)] opacity-60">
            {t("no_data", lang)}
          </div>
        ) : displayMode === "text" ? (
          <div className="space-y-0.5">
            {logs.map((log, _li) => {
              const isReceived = log.direction === "received";
              const ts = log.timestamp.replace(/^\[|\]$/g, "");
              const segments = searchRegex ? highlightSegments(log.payload, searchRegex) : [];
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
                  {segments.length > 0
                    ? segments.map((seg, si) =>
                        seg.match ? (
                          <mark key={si} className="hl-search-match">
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={si}>{seg.text}</span>
                        ),
                      )
                    : log.payload}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log, _li) => {
              const segments = searchRegex ? highlightSegments(log.payload, searchRegex) : [];
              return (
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
                  <div className="break-all whitespace-pre-wrap leading-tight text-[var(--text-primary)]">
                    {segments.length > 0
                      ? segments.map((seg, si) =>
                          seg.match ? (
                            <mark key={si} className="hl-search-match">
                              {seg.text}
                            </mark>
                          ) : (
                            <span key={si}>{seg.text}</span>
                          ),
                        )
                      : log.payload}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

export default ReceiveLog;
