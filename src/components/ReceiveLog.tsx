import { useLayoutEffect, useRef, useState, useCallback, useMemo, useEffect } from "react";
import { Search, Trash2, Eraser, ArrowDownToLine, Save, Circle, X, ChevronDown, Copy, Check } from "lucide-react";
import { Button } from "./ui/Button";
import { Panel } from "./ui/Panel";
import { Select } from "./ui/Select";
import { SearchReplace } from "./SearchReplace.tsx";
import {
  buildSearchRegex,
  searchInText,
  type SearchOptions,
  type MatchRange,
} from "../hooks/useSearch.ts";
import type { LogDisplayMode, SerialLogEntry } from "../hooks/useSerialPort.ts";
import { payloadToBytes, formatHexDump, displayTimestamp } from "../utils/hexConverter.ts";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import { ContextMenu, type ContextMenuItem } from "./ui/ContextMenu";
import { LogEditor } from "./LogEditor";

type ReceiveLogProps = {
  logs: SerialLogEntry[];
  lang: Lang;
  logCapWarning?: boolean;
  onClearAll: () => void;
  onClearReceived: () => void;
  onClearSent: () => void;
  /** Log file saving */
  savePath?: string | null;
  realTimeLog?: boolean;
  displayMode?: LogDisplayMode;
  onDisplayModeChange?: (mode: LogDisplayMode) => void;
  onSelectLogFile?: () => void;
  onToggleRealTime?: () => void;
  onFlushLogs?: () => void;
  onCloseLogFile?: () => void;
  /** Add a log entry's payload to the prompt commands grid */
  onAddToPrompts?: (payload: string) => void;
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

/** Group adjacent log entries with the same timestamp + direction + source + mode into one block (card view only, RX direction). Leaves TX entries and text-mode rendering alone. */
function groupAdjacentCards(logs: SerialLogEntry[]): Array<{
  entries: SerialLogEntry[];
  key: string;
  mergedPayload: string;
}> {
  const groups: Array<{ entries: SerialLogEntry[]; key: string; mergedPayload: string }> = [];
  for (const log of logs) {
    const last = groups[groups.length - 1];
    // Merge into previous group if adjacent, same timestamp, same direction, same source, same mode — for RX only
    if (
      last &&
      log.direction === "received" &&
      last.entries[0].direction === "received" &&
      log.timestamp === last.entries[0].timestamp &&
      log.source === last.entries[0].source &&
      log.mode === last.entries[0].mode
    ) {
      last.entries.push(log);
      last.mergedPayload += log.payload;
    } else {
      groups.push({
        entries: [log],
        key: log.id,
        mergedPayload: log.payload,
      });
    }
  }
  return groups;
}

/** Format logs as text-view style string for copy / editing */
export function formatLogsAsText(logs: SerialLogEntry[]): string {
  return logs
    .filter((log) => log.payload.trim().length > 0)
    .map((log) => {
      const isReceived = log.direction === "received";
      const tag =
        log.source === "tcp-server"
          ? "S→T"
          : log.source === "tcp-client"
            ? "RXT"
            : isReceived
              ? "RX"
              : "TX";
      const ts = displayTimestamp(log.timestamp).replace(/^\[|\]$/g, "");
      // Trim trailing \r\n from payload to prevent extra blank lines
      const cleanPayload = log.payload.replace(/[\r\n]+$/, "").trimStart();
      return `[${tag}] [${ts}] ${cleanPayload}`;
    })
    .join("\n");
}

export function ReceiveLog({
  logs,
  lang,
  logCapWarning = false,
  onClearAll,
  onClearReceived,
  onClearSent,
  savePath,
  realTimeLog,
  displayMode: displayModeProp,
  onDisplayModeChange,
  onSelectLogFile,
  onToggleRealTime,
  onFlushLogs,
  onCloseLogFile,
  onAddToPrompts,
}: ReceiveLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const displayMode = displayModeProp ?? "card";
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false, regex: false, wholeWord: false,
  });
  const [searchMatches, setSearchMatches] = useState<MatchRange[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [clearOpen, setClearOpen] = useState(false);
  const clearRef = useRef<HTMLDivElement>(null);
  const [dismissedCapWarning, setDismissedCapWarning] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [logEditorOpen, setLogEditorOpen] = useState(false);
  const [logEditorContent, setLogEditorContent] = useState("");
  const [logManagerOpen, setLogManagerOpen] = useState(false);

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

  // Close clear dropdown on outside click
  useEffect(() => {
    if (!clearOpen) return;
    function handleClick(e: MouseEvent) {
      if (clearRef.current && !clearRef.current.contains(e.target as Node)) {
        setClearOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [clearOpen]);

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

  // Grouped cards for display (card view only)
  const cardGroups = useMemo(() => groupAdjacentCards(logs), [logs]);

  const handleLogSearch = useCallback((query: string, opts: SearchOptions) => {
    setSearchQuery(query);
    setSearchOptions(opts);
    const results = searchInText(logText, query, opts);
    setSearchMatches(results);
    setSearchIndex(results.length > 0 ? 0 : -1);
  }, [logText]);

  const handleNavigate = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, searchMatches.length - 1));
    setSearchIndex(clamped);
    if (!containerRef.current || !searchMatches.length) return;
    const match = searchMatches[clamped];
    // Calculate the line in logText and scroll to approximate position
    const lineOfs = logText.substring(0, match.start).split("\n").length - 1;
    // Each entry in text mode is ~22px; in card mode, estimate ~30px per entry
    const LINE_H = displayMode === "text" ? 22 : 30;
    containerRef.current.scrollTop = Math.max(0, lineOfs * LINE_H - 60);
  }, [searchMatches, logText, displayMode]);

  // ── Copy log ──
  const handleCopyLog = useCallback(async () => {
    const text = formatLogsAsText(logs);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      /* ignore */
    }
  }, [logs]);

  // ── Context menu (native listener on scrollable log area only) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      // Find the closest log entry div to determine which payload to use for "add to prompts"
      let target = e.target as HTMLElement | null;
      while (target && target !== el) {
        if (target.dataset?.payload) break;
        target = target.parentElement;
      }
      menuLogPayloadRef.current = target?.dataset?.payload ?? null;
    };

    el.addEventListener("contextmenu", handler);
    return () => el.removeEventListener("contextmenu", handler);
  }, []);

  const menuLogPayloadRef = useRef<string | null>(null);

  const handleOpenEditor = useCallback(() => {
    setLogEditorContent(formatLogsAsText(logs));
    setLogEditorOpen(true);
  }, [logs]);

  const handleSelectAll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const contextMenuItems: ContextMenuItem[] = useMemo(
    () => [
      ...(onAddToPrompts && menuLogPayloadRef.current
        ? [{
          id: "add-to-prompt",
          label: lang === "zh" ? "添加到指令行" : "Add to Commands",
          onClick: () => { if (menuLogPayloadRef.current) onAddToPrompts(menuLogPayloadRef.current); },
        }] : []),
      {
        id: "open-editor",
        label: t("open_in_editor", lang),
        onClick: handleOpenEditor,
        disabled: logs.length === 0,
      },
      {
        id: "copy-all",
        label: t("copy_log", lang),
        onClick: handleCopyLog,
        disabled: logs.length === 0,
      },
      {
        id: "select-all",
        label: lang === "zh" ? "全选" : "Select All",
        onClick: handleSelectAll,
        disabled: logs.length === 0,
      },
    ],
    [handleOpenEditor, handleCopyLog, handleSelectAll, lang, logs.length],
  );

  // ── Escape key closes log editor ──
  useEffect(() => {
    if (!logEditorOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLogEditorOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [logEditorOpen]);

  return (
    <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {t("received", lang)}
        </span>

        {!pinned && (
          <Button variant="primary" size="sm" onClick={jumpToBottom} title={t("jump_to_bottom", lang)} className="flex items-center gap-1 px-1.5">
            <ArrowDownToLine size={14} />
            {t("scroll_follow", lang)}
          </Button>
        )}

        <Select
          value={displayMode}
          onChange={(e) => onDisplayModeChange?.(e.currentTarget.value as LogDisplayMode)}
          className="ml-auto w-auto h-7 text-xs" style={{ paddingTop: "2px", paddingBottom: "2px" } as React.CSSProperties}
        >
          <option value="card">{t("display_card", lang)}</option>
          <option value="text">{t("display_text", lang)}</option>
          <option value="hex">{t("display_hex", lang)}</option>
        </Select>

        {/* ── Right-side icon group ── */}

        {/* Search toggle */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSearchOpen((v) => !v)}
          className={`rounded p-1 transition-colors ${
            searchOpen
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
          }`}
          title={t("search", lang)}
        >
          <Search size={13} />
        </Button>

        {/* Copy log */}
        <button
          type="button"
          onClick={handleCopyLog}
          disabled={logs.length === 0}
          className={`rounded p-1 transition-colors ${
            copyFeedback
              ? "bg-emerald-100 text-emerald-600"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30"
          }`}
          title={t("copy_log", lang)}
        >
          {copyFeedback ? <Check size={13} /> : <Copy size={13} />}
        </button>

        {/* Clear actions dropdown */}
        <div className="relative" ref={clearRef}>
          <button
            type="button"
            onClick={() => setClearOpen((v) => !v)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-rose-500"
          >
            <Trash2 size={14} />
            <ChevronDown size={12} />
          </button>
          {clearOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg overflow-hidden">
              <button
                onClick={() => { onClearReceived(); setClearOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors"
              >
                <Eraser size={11} />
                RX
              </button>
              <button
                onClick={() => { onClearSent(); setClearOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors"
              >
                <Eraser size={11} />
                TX
              </button>
              <button
                onClick={() => { onClearAll(); setClearOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors"
              >
                <Trash2 size={11} />
                {t("all", lang)}
              </button>
            </div>
          )}
        </div>

        {/* ── Log file management ── */}
        <button
          type="button"
          onClick={() => setLogManagerOpen(true)}
          className={`rounded p-1 transition-colors ${
            savePath
              ? "text-[var(--accent)] hover:text-[var(--accent-dark)] hover:bg-[var(--bg-input)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
          }`}
          title={savePath ? `Log: ${savePath.split(/[\\/]/).pop()}` : "Save logs to file..."}
        >
          <div className="relative">
            <Save size={13} />
            {savePath && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2">
                <span className={`block h-full w-full rounded-full ${realTimeLog ? "bg-[var(--accent)]" : "bg-amber-400"}`} />
              </span>
            )}
          </div>
        </button>
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

      {logCapWarning && !dismissedCapWarning && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-800">
          <span className="font-medium">{t("log_cap_title", lang)}</span>
          <span className="opacity-80">{t("log_cap_desc", lang)}</span>
          <button
            type="button"
            onClick={() => setDismissedCapWarning(true)}
            className="ml-auto rounded px-1.5 py-0.5 text-amber-600 hover:bg-amber-100 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === "a") {
            e.preventDefault();
            e.stopPropagation();
            const container = containerRef.current;
            if (!container) return;
            const range = document.createRange();
            range.selectNodeContents(container);
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }}
        className="flex-1 overflow-y-auto p-1 font-mono text-sm outline-none select-text"
        style={{ fontFamily: "var(--mono-font-family)" }}
      >
        {logs.length === 0 ? (
          <div className="flex h-full min-h-16 items-center justify-center text-[var(--text-muted)] opacity-60">
            {t("no_data", lang)}
          </div>
        ) : displayMode === "text" ? (
          <div className="space-y-0">
            {logs.map((log) => {
              const isReceived = log.direction === "received";
              const ts = displayTimestamp(log.timestamp).replace(/^\[|\]$/g, "");
              const tagColor =
                log.source === "tcp-server"
                  ? "text-amber-600"
                  : log.source === "tcp-client"
                    ? "text-violet-600"
                    : isReceived
                      ? "text-emerald-600"
                      : "text-sky-600";
              const tag = isReceived ? "RX" : "TX";
              return (
                <div key={log.id} className="flex items-baseline gap-1 px-1 py-px leading-relaxed">
                  <span className={`shrink-0 font-bold ${tagColor}`}>
                    {tag}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)] opacity-60">
                    {ts}
                  </span>
                  <span className="break-all whitespace-pre-wrap text-[var(--text-primary)]">
                    {log.payload.trimStart()}
                  </span>
                </div>
              );
            })}
          </div>
        ) : displayMode === "hex" ? (
          <div className="space-y-0">
            {logs.map((log) => {
              const isReceived = log.direction === "received";
              const ts = displayTimestamp(log.timestamp).replace(/^\[|\]$/g, "");
              const bytes = payloadToBytes(log.payload, log.mode);
              const dumpLines = formatHexDump(bytes);
              const tagColor =
                log.source === "tcp-server"
                  ? "text-amber-600"
                  : log.source === "tcp-client"
                    ? "text-violet-600"
                    : isReceived
                      ? "text-emerald-600"
                      : "text-sky-600";
              const tag = isReceived ? "RX" : "TX";
              return (
                <div key={log.id} className="group border-b border-[var(--border)]/40 last:border-b-0">
                  <div className="flex items-baseline gap-2 px-1 pt-1 pb-px text-[10px] text-[var(--text-muted)] opacity-50 group-hover:opacity-100 transition-opacity">
                    <span className={`shrink-0 font-bold ${tagColor} ${isReceived ? "" : "opacity-60"}`}>
                      {tag}
                    </span>
                    <span className="shrink-0">
                      {isReceived ? "[" : "("}{ts}{isReceived ? "]" : ")"}
                    </span>
                    {log.serverTs && (
                      <span className="opacity-60">svr:{log.serverTs}</span>
                    )}
                    <span className="opacity-50">{log.mode.toUpperCase()}</span>
                    {bytes.length > 0 && (
                      <span className="opacity-40">({bytes.length}B)</span>
                    )}
                  </div>
                  {bytes.length === 0 ? (
                    <div className="px-1 pb-1 text-[11px] text-[var(--text-muted)] opacity-40 italic">
                      {t("no_data", lang)}
                    </div>
                  ) : (
                    <div className="px-1 pb-1">
                      {dumpLines.map((line, li) => (
                        <div key={li} className="flex leading-relaxed font-mono whitespace-nowrap">
                          <span className="shrink-0 text-[var(--text-primary)]">
                            {line.hex}
                          </span>
                          <span className="ml-3 text-[var(--text-muted)] opacity-60">
                            │{line.ascii}│
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-0.5">
            {cardGroups.map((group) => {
              const first = group.entries[0];
              const segments = searchRegex ? highlightSegments(group.mergedPayload, searchRegex) : [];
              return (
                <div
                  key={group.key}
                  className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1"
                >
                  <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                    <span
                      className={`rounded px-1 py-0.5 font-bold ${
                        first.source === "tcp-server"
                          ? "bg-amber-100 text-amber-600"
                          : first.source === "tcp-client"
                            ? "bg-violet-100 text-violet-600"
                            : first.direction === "received"
                              ? "bg-emerald-100 text-emerald-600"
                              : "bg-sky-100 text-sky-600"
                      }`}
                    >
                      {first.direction === "received" ? "RX" : "TX"}
                    </span>
                    <span>{displayTimestamp(first.timestamp)}</span>
                    {first.serverTs && (
                      <span className="text-[var(--text-muted)] opacity-70">svr:{first.serverTs}</span>
                    )}
                    <span className="opacity-60">{first.mode.toUpperCase()}</span>
                    {group.entries.length > 1 && (
                      <span className="text-[9px] text-[var(--text-muted)]/50">({group.entries.length} packets)</span>
                    )}
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
                      : group.mergedPayload.trimStart()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right-click context menu ── */}
      {contextMenuPos && (
        <ContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          items={contextMenuItems}
          onClose={() => setContextMenuPos(null)}
        />
      )}

      {/* ── Log editor modal ── */}
      {logEditorOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLogEditorOpen(false);
          }}
        >
          <LogEditor
            initialContent={logEditorContent}
            lang={lang}
            onClose={() => setLogEditorOpen(false)}
          />
        </div>
      )}

      {/* ── Log manager modal ── */}
      {logManagerOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLogManagerOpen(false);
          }}
        >
          <div className="flex w-[420px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {lang === "zh" ? "串口日志管理" : "Log File Manager"}
              </span>
              <button
                type="button"
                onClick={() => setLogManagerOpen(false)}
                className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              {savePath ? (
                <>
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      {lang === "zh" ? "日志文件" : "Log File"}
                    </div>
                    <div className="text-xs text-[var(--text-primary)] break-all bg-[var(--bg-input)] rounded border border-[var(--border)] px-2 py-1.5 font-mono">
                      {savePath}
                    </div>
                  </div>

                  {/* Real-time toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
                    <div>
                      <div className="text-xs font-medium text-[var(--text-primary)]">
                        {lang === "zh" ? "实时写入" : "Real-time Write"}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {lang === "zh" ? "数据到达时立即写入日志文件" : "Write entries to file as they arrive"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleRealTime}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                        realTimeLog
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border)]"
                      }`}
                    >
                      <Circle size={8} fill={realTimeLog ? "currentColor" : "none"} />
                      {realTimeLog
                        ? (lang === "zh" ? "已开启" : "On")
                        : (lang === "zh" ? "已关闭" : "Off")}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!realTimeLog && (
                      <Button variant="primary" size="sm" onClick={onFlushLogs} className="flex-1 justify-center text-xs">
                        <Save size={12} />
                        {lang === "zh" ? "立即写入" : "Flush Now"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCloseLogFile}
                      className={`${realTimeLog ? "flex-1" : ""} justify-center text-xs text-rose-500 hover:text-rose-600`}
                    >
                      <X size={12} />
                      {lang === "zh" ? "关闭文件" : "Close File"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center">
                  <Save size={32} className="mx-auto mb-2 text-[var(--text-muted)] opacity-40" />
                  <p className="text-sm text-[var(--text-muted)]">
                    {lang === "zh" ? "未选择日志文件" : "No log file selected"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] opacity-60 mt-1">
                    {lang === "zh" ? "选择一个文件来保存串口日志" : "Select a file to save serial logs"}
                  </p>
                  <Button variant="primary" size="sm" onClick={onSelectLogFile} className="mt-3">
                    <Save size={12} />
                    {lang === "zh" ? "选择日志文件" : "Select Log File"}
                  </Button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 justify-end border-t border-[var(--border)] bg-[var(--bg-input)] px-4 py-2">
              <Button variant="ghost" size="sm" onClick={() => setLogManagerOpen(false)} className="text-xs">
                {t("close", lang)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

export default ReceiveLog;
