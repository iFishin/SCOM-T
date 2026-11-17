import { useLayoutEffect, useRef, useState, useCallback, useMemo, useEffect, memo } from "react";
import { Search, Trash2, Eraser, ArrowDownToLine, Save, X, ChevronDown, Copy, Check, FileText, Activity, Clock, FolderOpen, Database } from "lucide-react";
import { Button } from "./ui/Button";
import { Panel } from "./ui/Panel";
import { Select } from "./ui/Select";
import { SearchReplace } from "./SearchReplace.tsx";
import {
  buildSearchRegex,
  searchInText,
  highlightText,
  type SearchOptions,
  type MatchRange,
} from "../hooks/useSearch.ts";
import type { LogDisplayMode, SerialLogEntry } from "../hooks/useSerialPort.ts";
import { payloadToBytes, parseHexString, formatHexDump, displayTimestamp } from "../utils/hexConverter.ts";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import { ContextMenu, type ContextMenuItem } from "./ui/ContextMenu";
import { LogEditor } from "./LogEditor";

type ReceiveLogProps = {
  logs: SerialLogEntry[];
  /**
   * False while the session sits in a background tab. The log rows are the
   * heaviest part of a session view, and keeping them mounted for every open
   * tab multiplied the cost by the tab count — the DOM is dropped and rebuilt
   * when the tab becomes active again.
   */
  mounted?: boolean;
  lang: Lang;
  logCapWarning?: boolean;
  sendQueue?: string[];
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
  onDumpLogs?: () => void;
  onCloseLogFile?: () => void;
  /** Add a log entry's payload to the prompt commands grid */
  onAddToPrompts?: (payload: string) => void;
};

const SCROLL_THRESHOLD = 32;
const LOG_SEPARATOR = "\n";

/** Rows mounted on first paint, and how many older rows each scroll-up adds. */
export const WINDOW_INITIAL = 600;
const WINDOW_STEP = 600;
/** Pull in older rows once the scroll position is this close to the top. */
const LOAD_OLDER_THRESHOLD = 48;

type LogGroup = {
  entries: SerialLogEntry[];
  key: string;
  mergedPayload: string;
  /** Index of the first entry inside the full log array (stable, see below). */
  startIndex: number;
};

/** Group adjacent log entries with the same timestamp + direction + source + mode into one block (card view only, RX direction). Leaves TX entries and text-mode rendering alone. */
function groupAdjacentCards(logs: SerialLogEntry[], from = 0, seed?: LogGroup[]): LogGroup[] {
  // `seed` is always a fresh array (the caller slices before passing it), so it
  // is appended to directly instead of being copied a second time.
  const groups: LogGroup[] = seed ?? [];
  // When resuming from a seed, the boundary at `from` was already decided by a
  // previous pass; re-testing it would merge across the seam.
  let allowMerge = !seed;
  for (let i = from; i < logs.length; i++) {
    const log = logs[i];
    const last = allowMerge ? groups[groups.length - 1] : undefined;
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
      last.mergedPayload += `${last.mergedPayload.endsWith("\n") ? "" : "\n"}${log.payload}`;
    } else {
      groups.push({
        entries: [log],
        key: log.id,
        mergedPayload: log.payload,
        startIndex: i,
      });
      allowMerge = true;
    }
  }
  return groups;
}

/**
 * Extend a previous grouping instead of rebuilding it.
 *
 * On append only the last group can grow, so every closed group keeps its
 * identity — which is what lets CardRow's memo do its job. Rebuilding all
 * groups on each 50 ms batch re-rendered all 10k rows, allocating a fresh
 * element tree every time; that is what made long captures progressively
 * heavier while memory crept up.
 */
export function extendCardGroups(
  logs: SerialLogEntry[],
  previous: { groups: LogGroup[]; consumed: number } | null,
): { groups: LogGroup[]; consumed: number } {
  if (!previous || previous.groups.length === 0) {
    return { groups: groupAdjacentCards(logs), consumed: logs.length };
  }
  if (logs.length < previous.consumed) {
    return { groups: groupAdjacentCards(logs), consumed: logs.length };
  }

  const lastGroup = previous.groups[previous.groups.length - 1];
  const lastEntry = lastGroup.entries[lastGroup.entries.length - 1];
  // Not the same sequence we grouped last time (clear / trim / reload): rebuild.
  if (previous.consumed > 0 && logs[previous.consumed - 1] !== lastEntry) {
    return { groups: groupAdjacentCards(logs), consumed: logs.length };
  }
  if (logs.length === previous.consumed) {
    return previous;
  }

  // Re-open the final group from its own start index. Its first entry already
  // failed to merge into the group before it, so the boundary must not be
  // re-tested — and the closed groups above are never mutated.
  const closed = previous.groups.slice(0, -1);
  const groups = groupAdjacentCards(logs, lastGroup.startIndex, closed);
  return { groups, consumed: logs.length };
}

// ── Memoized row renderers ──
// Extracted so appending a log only renders the new row: with thousands of
// entries, re-running the inline maps below on every incoming packet stalls
// the UI. Each row's props stay referentially stable (log objects are
// immutable once appended), so memo skips the untouched rows.
// Search highlighting still works because per-row highlight inputs
// (offset / current-match range) are passed as primitive props.

type Seg = ReturnType<typeof highlightText>[number];

/** Render one search-highlighted payload, wiring the current match ref. */
function renderSegments(segments: Seg[], activeMatchRef: React.RefObject<HTMLElement | null>, fallback: string) {
  return segments.length > 0
    ? segments.map((seg, si) =>
        seg.current ? (
          <mark key={si} ref={activeMatchRef} className="hl-search-current">{seg.text}</mark>
        ) : seg.match ? (
          <mark key={si} className="hl-search-match">{seg.text}</mark>
        ) : (
          <span key={si}>{seg.text}</span>
        ),
      )
    : fallback;
}

type TextRowProps = {
  log: SerialLogEntry;
  logOffset: number;
  searchRegex: RegExp | null;
  curMatch: { start: number; end: number } | null;
  activeMatchRef: React.RefObject<HTMLElement | null>;
};

const TextRow = memo(function TextRow({ log, logOffset, searchRegex, curMatch, activeMatchRef }: TextRowProps) {
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
  const rowBg = !isReceived ? "bg-sky-50/40 dark:bg-sky-950/15" : "";
  const payTrim = log.payload.trimStart();
  const payTrimOffset = log.payload.length - payTrim.length;
  const curStart = curMatch ? curMatch.start - logOffset - payTrimOffset : undefined;
  const curEnd = curMatch ? curMatch.end - logOffset - payTrimOffset : undefined;
  const inRange = curStart !== undefined && curEnd !== undefined && curStart >= 0 && curEnd <= payTrim.length;
  const hlMatch = searchRegex
    ? highlightText(payTrim, searchRegex, inRange ? curStart : undefined, inRange ? curEnd : undefined)
    : [];
  return (
    <div data-seq={log.seq} className={"flex items-baseline gap-1 px-1 py-px leading-relaxed " + rowBg}>
      <span className={`shrink-0 font-bold ${tagColor}`}>{tag}</span>
      <span className="shrink-0 text-theme-10 text-[var(--text-muted)] opacity-60">{ts}</span>
      <span className="break-all whitespace-pre-wrap text-[var(--text-primary)]">
        {renderSegments(hlMatch, activeMatchRef, payTrim)}
        {log.terminator && (
          <span className="text-[var(--text-muted)] opacity-50"> [{log.terminator}]</span>
        )}
      </span>
    </div>
  );
});

/** Affordance at the top of a windowed log: pull in the entries above. */
const LoadOlderRow = memo(function LoadOlderRow({
  remaining,
  lang,
  onLoad,
}: {
  remaining: number;
  lang: Lang;
  onLoad: () => void;
}) {
  return (
    <div className="flex justify-center pb-1">
      <button
        type="button"
        onClick={onLoad}
        className="rounded-full border border-[var(--border)] bg-[var(--bg-input)] px-3 py-0.5 text-theme-10 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        {lang === "zh"
          ? `上方还有 ${remaining} 条 · 点击加载`
          : `${remaining} older entries · load`}
      </button>
    </div>
  );
});

const HEX_DUMP_MAX_BYTES = 2048;type HexRowProps = {
  log: SerialLogEntry;
  noDataLabel: string;
};

const HexRow = memo(function HexRow({ log, noDataLabel }: HexRowProps) {
  const isReceived = log.direction === "received";
  const ts = displayTimestamp(log.timestamp).replace(/^\[|\]$/g, "");
  // 真实字节优先。payload 是解码后的文本，用它反推字节会把非法字节
  // （如 0xAA）膨胀成 EF BF BD，与设备实际发出的字节不符（#36 / #37）。
  // rawBytes 是 Uint8Array，直接引用而不复制：hex dump 只读，且这条路径
  // 在 1 万条日志上每条都要跑一次。
  const hasRawBytes = log.rawBytes !== undefined && log.rawBytes.length > 0;
  const base: number[] | Uint8Array = hasRawBytes
    ? log.rawBytes!
    : payloadToBytes(log.payload, log.mode);
  // 只有无 rawBytes 的旧日志才需要补结尾符：onDispatch 记录的 rawBytes
  // 已经包含结尾符字节，重复追加会多出一组 CRLF。
  const bytes = !hasRawBytes && log.terminator
    ? [...base, ...parseHexString(log.terminator)]
    : base;
  const dumpLines = formatHexDump(bytes, HEX_DUMP_MAX_BYTES);
  const truncated = bytes.length > HEX_DUMP_MAX_BYTES;
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
    <div data-seq={log.seq} className="group border-b border-[var(--border)]/40 last:border-b-0">
      <div className="flex items-baseline gap-2 px-1 pt-1 pb-px text-theme-10 text-[var(--text-muted)] opacity-50 group-hover:opacity-100 transition-opacity">
        <span className={`shrink-0 font-bold ${tagColor} ${isReceived ? "" : "opacity-60"}`}>{tag}</span>
        <span className="shrink-0">{isReceived ? "[" : "("}{ts}{isReceived ? "]" : ")"}</span>
        {log.serverTs && <span className="opacity-60">svr:{log.serverTs}</span>}
        <span className="opacity-50">{log.mode.toUpperCase()}</span>
        {bytes.length > 0 && <span className="opacity-40">({bytes.length}B)</span>}
      </div>
      {bytes.length === 0 ? (
        <div className="px-1 pb-1 text-theme-11 text-[var(--text-muted)] opacity-40 italic">{noDataLabel}</div>
      ) : (
        <div className="px-1 pb-1">
          {dumpLines.map((line, li) => (
            <div key={li} className="flex leading-relaxed font-mono whitespace-nowrap">
              <span className="shrink-0 text-[var(--text-muted)] opacity-50">{line.offset}</span>
              <span className="ml-3 shrink-0 text-[var(--text-primary)]">{line.hex}</span>
              <span className="ml-3 text-[var(--text-muted)] opacity-60">│{line.ascii}│</span>
            </div>
          ))}
          {truncated && (
            <div className="text-theme-11 text-[var(--text-muted)] opacity-60">
              …仅显示前 {HEX_DUMP_MAX_BYTES} 字节
            </div>
          )}
        </div>
      )}
    </div>
  );
});

type CardRowProps = {
  group: { entries: SerialLogEntry[]; key: string; mergedPayload: string };
  groupOffset: number;
  searchRegex: RegExp | null;
  curMatch: { start: number; end: number } | null;
  activeMatchRef: React.RefObject<HTMLElement | null>;
};

const CardRow = memo(function CardRow({ group, groupOffset, searchRegex, curMatch, activeMatchRef }: CardRowProps) {
  const first = group.entries[0];
  const gCurStart = curMatch ? curMatch.start - groupOffset : undefined;
  const gCurEnd = curMatch ? curMatch.end - groupOffset : undefined;
  const gInRange = gCurStart !== undefined && gCurEnd !== undefined
    && gCurStart >= 0 && gCurEnd <= group.mergedPayload.length;
  const cardSegments = searchRegex
    ? highlightText(group.mergedPayload, searchRegex, gInRange ? gCurStart : undefined, gInRange ? gCurEnd : undefined)
    : [];
  return (
    <div data-seq={group.entries.map((e) => e.seq).join(",")} className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1">
      <div className="mb-0.5 flex items-center gap-2 text-theme-10 uppercase tracking-widest text-[var(--text-muted)]">
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
          <span className="text-theme-9 text-[var(--text-muted)]/50">({group.entries.length} packets)</span>
        )}
      </div>
      <div className="break-all whitespace-pre-wrap leading-tight text-[var(--text-primary)]">
        {renderSegments(cardSegments, activeMatchRef, group.mergedPayload.trimStart())}
        {first.terminator && (
          <span className="text-[var(--text-muted)] opacity-50"> [{first.terminator}]</span>
        )}
      </div>
    </div>
  );
});

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
      const term = log.terminator ? ` [${log.terminator}]` : "";
      return `[${tag}] [${ts}] ${cleanPayload}${term}`;
    })
    .join("\n");
}

export function ReceiveLog({
  logs,
  mounted = true,
  lang,
  logCapWarning = false,
  sendQueue = [],
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
  onDumpLogs,
  onCloseLogFile,
  onAddToPrompts,
}: ReceiveLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  /**
   * Only the tail of the log is mounted. Rows are the heaviest thing this view
   * owns — one node subtree plus a React fiber each — and a day-long capture
   * fills the 10k buffer, so keeping every row in the DOM was most of the
   * resident memory. Older entries are pulled in on demand when the user
   * scrolls up.
   */
  const [windowSize, setWindowSize] = useState(WINDOW_INITIAL);
  /**
   * Index one past the last visible entry, frozen while the user is reading
   * scrollback. Without it a live append would push the window forward and
   * yank the rows they are looking at upward. `null` means "follow the tail".
   */
  const [frozenEnd, setFrozenEnd] = useState<number | null>(null);
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

  // Prefix sums of log payload lengths — O(1) per-row offset lookup for search
  // highlight. Without this, each row recomputes a slice+reduce (O(n²) overall),
  // which stalls on thousands of log entries.
  const payloadPrefix = useMemo(() => {
    const arr = new Array(logs.length + 1);
    arr[0] = 0;
    for (let i = 0; i < logs.length; i++) arr[i + 1] = arr[i] + logs[i].payload.length;
    return arr;
  }, [logs]);

  // ── Mounted window ──
  const windowEnd = frozenEnd === null ? logs.length : Math.min(frozenEnd, logs.length);
  const windowStart = Math.max(0, windowEnd - windowSize);
  const windowStartRef = useRef(windowStart);
  windowStartRef.current = windowStart;
  const logsLengthRef = useRef(logs.length);
  logsLengthRef.current = logs.length;

  const visibleLogs = useMemo(
    () => (windowStart === 0 ? logs : logs.slice(windowStart)),
    [logs, windowStart],
  );

  // Reset the window when the buffer is cleared or trimmed below it.
  const prevLogsLengthRef = useRef(logs.length);
  useLayoutEffect(() => {
    const prev = prevLogsLengthRef.current;
    prevLogsLengthRef.current = logs.length;
    if (logs.length === 0) {
      setFrozenEnd(null);
      setWindowSize(WINDOW_INITIAL);
      return;
    }
    if (logs.length < prev) {
      // Trimmed by the live cap. The frozen index no longer points at the row
      // the user was reading, so resume following the tail instead of jumping
      // to an arbitrary position.
      setFrozenEnd(null);
    }
  }, [logs.length]);

  // Loading older rows prepends content, so compensate scrollTop or the text
  // the user was reading jumps down.
  const scrollAnchorRef = useRef<number | null>(null);
  const loadOlder = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    scrollAnchorRef.current = el.scrollHeight - el.scrollTop;
    setWindowSize((size) => size + WINDOW_STEP);
  }, []);

  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const el = containerRef.current;
    if (anchor === null || !el) return;
    scrollAnchorRef.current = null;
    el.scrollTop = el.scrollHeight - anchor;
  }, [windowSize]);

  useLayoutEffect(() => {
    if (pinned && containerRef.current) {
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      });
    }
  }, [logs, pinned]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
    setPinned(atBottom);
    // Reading scrollback freezes the window end so live appends do not push
    // the rows being read upward; returning to the bottom resumes following.
    setFrozenEnd((end) => (atBottom ? null : (end ?? logsLengthRef.current)));
    if (el.scrollTop <= LOAD_OLDER_THRESHOLD && windowStartRef.current > 0) loadOlder();
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
    setFrozenEnd(null);
  }

  // ── Log search ──
  // The joined text is only needed when a search actually runs. Building it on
  // every log append was O(n) per batch and allocated one ever-growing string.
  const buildLogText = useCallback(
    () => logs.map((l) => l.payload).join(LOG_SEPARATOR),
    [logs],
  );

  const searchRegex = useMemo(
    () => buildSearchRegex(searchQuery, searchOptions),
    [searchQuery, searchOptions],
  );

  // Grouped cards are only used by the card view; text/hex views must not pay
  // the O(n) grouping cost on every appended batch. The cache lets an append
  // reuse every closed group, so only the row that actually grew re-renders.
  const groupCacheRef = useRef<{ groups: LogGroup[]; consumed: number } | null>(null);
  const cardGroups = useMemo(() => {
    if (displayMode !== "card") return [];
    const next = extendCardGroups(logs, groupCacheRef.current);
    groupCacheRef.current = next;
    return next.groups;
  }, [logs, displayMode]);

  // Groups are built over the whole array (their startIndex is absolute), but
  // only the ones inside the mounted window are rendered. One group before the
  // boundary is kept: a group can straddle windowStart, and dropping it would
  // hide the entries past the seam.
  const visibleGroups = useMemo(() => {
    if (cardGroups.length === 0 || windowStart === 0) return cardGroups;
    let lo = 0;
    let hi = cardGroups.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cardGroups[mid].startIndex < windowStart) lo = mid + 1;
      else hi = mid;
    }
    const from = lo > 0 ? lo - 1 : 0;
    return from === 0 ? cardGroups : cardGroups.slice(from);
  }, [cardGroups, windowStart]);

  // Current search hit range, or null. Kept as a stable reference between log
  // appends so memoized rows are not re-rendered by an unrelated keystroke.
  const curMatch = useMemo(
    () => (searchIndex >= 0 && searchIndex < searchMatches.length ? searchMatches[searchIndex] : null),
    [searchIndex, searchMatches],
  );

  const pendingMatchScrollRef = useRef(false);

  /**
   * Pull the matching entry into the mounted window before scrolling to it.
   * A match outside the window has no DOM node, so the highlight ref would stay
   * null and the view would never move — the old behaviour when the hit lived
   * in the part of the buffer that is no longer mounted.
   */
  const revealMatch = useCallback((match: MatchRange) => {
    pendingMatchScrollRef.current = true;
    let lo = 0;
    let hi = logs.length - 1;
    let index = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const entryStart = payloadPrefix[mid] + mid * LOG_SEPARATOR.length;
      if (entryStart <= match.start) {
        index = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const needed = logs.length - index;
    setFrozenEnd(null);
    setWindowSize((size) => (needed > size ? needed : size));
  }, [logs.length, payloadPrefix]);

  const handleLogSearch = useCallback((query: string, opts: SearchOptions) => {
    setSearchQuery(query);
    setSearchOptions(opts);
    const results = searchInText(buildLogText(), query, opts);
    setSearchMatches(results);
    setSearchIndex(results.length > 0 ? 0 : -1);
    if (results.length > 0) revealMatch(results[0]);
  }, [buildLogText, revealMatch]);

  const handleNavigate = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, searchMatches.length - 1));
    setSearchIndex(clamped);
    if (searchMatches[clamped]) revealMatch(searchMatches[clamped]);
  }, [searchMatches, revealMatch]);

  // Scroll the actual current-match element into view once it (re)renders,
  // rather than estimating scrollTop from newline counts — payload wrapping,
  // grouped cards, and hex dumps all make row height too variable to estimate.
  // Scrolled manually (not scrollIntoView) so only the log container's own
  // scrollTop moves — scrollIntoView walks up every scrollable ancestor,
  // which was dragging the whole page layout around.
  const activeMatchRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (searchIndex < 0 || !pendingMatchScrollRef.current) return;
    const container = containerRef.current;
    const el = activeMatchRef.current;
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = (elRect.top + elRect.height / 2) - (containerRect.top + containerRect.height / 2);
    container.scrollTop += delta;
    pendingMatchScrollRef.current = false;
  }, [searchIndex, searchMatches, displayMode, windowSize]);

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
        <span className="text-theme-11 font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {t("received", lang)}
        </span>

        {/* ── Send buffer (write queue) indicator ── */}
        {sendQueue.length > 0 && (
          <div
            className="flex min-w-0 max-w-[240px] items-center gap-1.5 rounded bg-amber-50 px-2 py-0.5 text-theme-10 text-amber-700"
            title={lang === "zh" ? "串口发送缓冲区（排队待发送）" : "Serial send buffer (queued)"}
          >
            <span className="shrink-0 font-semibold">
              {lang === "zh" ? "发送缓冲" : "Send"} {sendQueue.length}
            </span>
            <span className="truncate font-mono">{sendQueue[sendQueue.length - 1]}</span>
          </div>
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

        {!pinned && (
          <button type="button" onClick={jumpToBottom} title={t("jump_to_bottom", lang)}
            className="flex items-center gap-1 rounded px-2 py-1 text-theme-11 text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
          >
            <ArrowDownToLine size={12} />
            {t("scroll_follow", lang)}
          </button>
        )}

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
            className="flex items-center gap-1 rounded px-2 py-0.5 text-theme-11 text-[var(--text-muted)] transition-colors hover:text-rose-500"
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
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1 text-theme-11 text-amber-800">
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
        onCopy={(e) => {
          // 复制策略（WYSIWYG + 全量导出）：
          // - 有选区但只是部分文字 → 不拦截，浏览器复制选中的原文（框到几行就复制几行）
          // - 全选（选区覆盖整个日志容器，如 Ctrl+A）或无选中 → 导出完整格式化日志
          const sel = window.getSelection();
          const hasSelection = !!sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
          let isSelectAll = false;
          if (hasSelection) {
            const container = containerRef.current;
            isSelectAll =
              !!container && sel!.toString().trim() === (container.textContent ?? "").trim();
            if (!isSelectAll) return; // 部分选中：交给浏览器默认复制
          }
          // 全选 / 无选中 → 全量格式化复制（过滤空 payload，避免空行）
          if (logs.length === 0) return;
          const text = logs
            .filter((log) => log.payload.trim().length > 0)
            .map((log) => {
              const tag = log.direction === "received" ? "RX" : "TX";
              const ts = displayTimestamp(log.timestamp).replace(/^\[|\]$/g, "");
              const pay = log.payload.trimStart();
              const term = log.terminator ? ` [${log.terminator}]` : "";
              return `[${tag}] [${ts}] ${pay}${term}`;
            })
            .join("\n");
          if (text) { e.preventDefault(); e.clipboardData.setData("text/plain", text); }
        }}
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
        className="log-rows flex-1 overflow-y-auto p-1 font-mono text-sm outline-none select-text"
        data-log-searching={searchIndex >= 0 ? "1" : undefined}
        style={{ fontFamily: "var(--mono-font-family)" }}
      >
        {logs.length === 0 ? (
          <div className="flex h-full min-h-16 items-center justify-center text-[var(--text-muted)] opacity-60">
            {t("no_data", lang)}
          </div>
        ) : !mounted ? (
          <div className="flex h-full min-h-16 items-center justify-center text-theme-10 text-[var(--text-muted)] opacity-50">
            {lang === "zh" ? "切回该标签页以显示日志" : "Switch to this tab to show logs"}
          </div>
        ) : displayMode === "text" ? (
          <div className="log-rows__list space-y-0">
            {windowStart > 0 && (
              <LoadOlderRow
                remaining={windowStart}
                lang={lang}
                onLoad={loadOlder}
              />
            )}
            {visibleLogs.map((log, i) => {
              const absolute = windowStart + i;
              return (
                <TextRow
                  key={log.id}
                  log={log}
                  logOffset={absolute * LOG_SEPARATOR.length + payloadPrefix[absolute]}
                  searchRegex={searchRegex}
                  curMatch={curMatch}
                  activeMatchRef={activeMatchRef}
                />
              );
            })}
          </div>
        ) : displayMode === "hex" ? (
          <div className="log-rows__list space-y-0">
            {windowStart > 0 && (
              <LoadOlderRow
                remaining={windowStart}
                lang={lang}
                onLoad={loadOlder}
              />
            )}
            {visibleLogs.map((log) => (
              <HexRow key={log.id} log={log} noDataLabel={t("no_data", lang)} />
            ))}
          </div>
        ) : (
          <div className="log-rows__list space-y-0.5">
            {windowStart > 0 && (
              <LoadOlderRow
                remaining={windowStart}
                lang={lang}
                onLoad={loadOlder}
              />
            )}
            {visibleGroups.map((group) => (
              <CardRow
                key={group.key}
                group={group}
                groupOffset={group.startIndex * LOG_SEPARATOR.length + payloadPrefix[group.startIndex]}
                searchRegex={searchRegex}
                curMatch={curMatch}
                activeMatchRef={activeMatchRef}
              />
            ))}
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
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40">
          <div className="flex w-[500px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-input)] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10">
                  <FileText size={15} className="text-[var(--accent)]" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {lang === "zh" ? "日志管理" : "Log Manager"}
                  </span>
                  <span className="ml-2 text-theme-10 text-[var(--text-muted)]">
                    {lang === "zh" ? `${logs.length} 条记录` : `${logs.length} entries`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLogManagerOpen(false)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {savePath ? (
                <>
                  {/* File info card */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <FolderOpen size={13} className="shrink-0" />
                      <span className="font-medium">{lang === "zh" ? "文件路径" : "File Path"}</span>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-theme-11 text-[var(--text-primary)] break-all leading-relaxed select-all">
                      {savePath}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-theme-10 text-[var(--text-muted)] uppercase tracking-wider">
                        <Database size={12} />
                        <span>{lang === "zh" ? "写入条目" : "Written"}</span>
                      </div>
                      <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
                        {logs.length} {lang === "zh" ? "条" : "entries"}
                      </span>
                      <span className="block text-theme-10 text-[var(--text-muted)]">
                        ~{logs.length > 0 ? Math.round(logs.reduce((s, l) => s + l.payload.length + 40, 0) / 1024) : 0} KB
                      </span>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-theme-10 text-[var(--text-muted)] uppercase tracking-wider">
                        <Activity size={12} />
                        <span>{lang === "zh" ? "写入模式" : "Mode"}</span>
                      </div>
                      <span className={`text-lg font-bold tabular-nums ${realTimeLog ? "text-emerald-600" : "text-amber-600"}`}>
                        {realTimeLog
                          ? (lang === "zh" ? "实时" : "Realtime")
                          : (lang === "zh" ? "手动" : "Manual")}
                      </span>
                      <span className="block text-theme-10 text-[var(--text-muted)]">
                        {realTimeLog
                          ? (lang === "zh" ? "每 2 秒自动写入" : "Every 2 seconds")
                          : (lang === "zh" ? "需手动点击写入" : "Flush manually")}
                      </span>
                    </div>
                  </div>

                  {/* Real-time toggle — redesigned */}
                  <div className="rounded-xl border border-[var(--border)] p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${realTimeLog ? "bg-emerald-100" : "bg-[var(--bg-input)]"}`}>
                          <Clock size={15} className={realTimeLog ? "text-emerald-600" : "text-[var(--text-muted)]"} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            {lang === "zh" ? "实时写入" : "Real-time Write"}
                          </div>
                          <div className="text-theme-10 text-[var(--text-muted)] mt-0.5">
                            {realTimeLog
                              ? (lang === "zh" ? "日志到达时自动写入磁盘" : "Auto-write entries to disk as they arrive")
                              : (lang === "zh" ? "手动保存日志到文件" : "Save logs to file manually")}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onToggleRealTime}
                        className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none ${
                          realTimeLog
                            ? "border-emerald-400 bg-emerald-500"
                            : "border-[var(--border)] bg-[var(--bg-surface)]"
                        }`}
                        role="switch"
                        aria-checked={realTimeLog}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          realTimeLog ? "translate-x-5" : "translate-x-0.5"
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onDumpLogs}
                      disabled={logs.length === 0}
                      className="w-full justify-center gap-1.5 text-xs h-9 border border-[var(--border)] disabled:opacity-40"
                    >
                      <Database size={13} />
                      {lang === "zh"
                        ? `追加当前日志到文件（${logs.length} 条）`
                        : `Append current logs (${logs.length})`}
                    </Button>
                    <div className="flex gap-2.5">
                      {!realTimeLog && (
                        <Button variant="primary" size="sm" onClick={onFlushLogs} className="flex-1 justify-center gap-1.5 text-xs h-9">
                          <Save size={13} />
                          {lang === "zh" ? "立即写入" : "Flush Now"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onCloseLogFile}
                        className={`${realTimeLog ? "flex-1" : ""} justify-center gap-1.5 text-xs h-9 text-rose-500 hover:text-rose-600 hover:bg-rose-50`}
                      >
                        <X size={13} />
                        {lang === "zh" ? "关闭文件" : "Close File"}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                /* Empty state */
                <div className="flex flex-col items-center py-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-input)] mb-4">
                    <FileText size={28} className="text-[var(--text-muted)] opacity-40" />
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {lang === "zh" ? "未选择日志文件" : "No Log File Selected"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1 mb-5 max-w-[260px] text-center leading-relaxed">
                    {lang === "zh"
                      ? "选择一个保存位置，将串口日志写入文件以便后续查阅和分析。"
                      : "Choose a location to save serial logs for later review and analysis."}
                  </p>
                  <Button variant="primary" size="sm" onClick={onSelectLogFile} className="gap-1.5 text-xs">
                    <Save size={13} />
                    {lang === "zh" ? "选择日志文件" : "Select Log File"}
                  </Button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-end border-t border-[var(--border)] bg-[var(--bg-input)] px-5 py-2.5">
              <span className="text-theme-10 text-[var(--text-muted)] mr-auto opacity-60">
                {lang === "zh" ? "提示：日志文件存储在本地，不会自动上传" : "Logs are stored locally and never uploaded"}
              </span>
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
