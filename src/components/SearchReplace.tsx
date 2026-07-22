import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { searchInText, buildSearchRegex, type SearchOptions, type MatchRange } from "../hooks/useSearch.ts";

type Props = {
  /** Textarea mode: current text content (for replace to work) */
  value?: string;
  /** Textarea mode: called when replace modifies the text */
  onValueChange?: (newValue: string) => void;
  /** DOM mode: called on every search with current query & options */
  onSearch?: (query: string, options: SearchOptions) => void;
  /** DOM mode: match count for display */
  matchCount?: number;
  /** DOM mode: current match index */
  matchIndex?: number;
  /** DOM mode: match ranges for highlighting */
  matches?: MatchRange[];
  /** DOM mode: called when user navigates matches */
  onNavigate?: (index: number) => void;
  /** Whether to show replace UI */
  allowReplace?: boolean;
  /** Self-contained mode: full text to search in */
  text?: string;
  /** Self-contained mode: scrollable container ref for navigation */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Self-contained mode: called when matches change */
  onMatchesChange?: (matches: MatchRange[], index: number, regex: RegExp | null) => void;
  /** Called when search bar is closed */
  onClose: () => void;
  lang: "zh" | "en";
};

const inputCls =
  "w-full rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 pr-12 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]";
const counterCls =
  "absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] select-none pointer-events-none";
const toggleOn = "bg-[var(--accent)] text-white border-[var(--accent-dark)]";
const toggleOff =
  "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] border-transparent";
const navBtn =
  "rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors";

export function SearchReplace({
  value,
  onValueChange,
  onSearch,
  matchCount,
  matchIndex,
  onNavigate,
  allowReplace,
  text,
  scrollRef,
  onMatchesChange,
  onClose,
  lang,
}: Props) {
  // ── Self-contained mode (text + scrollRef) ──
  const isSelfContained = Boolean(text && scrollRef);
  // ── Textarea mode ──
  const isTextareaMode = typeof value === "string" && typeof onValueChange === "function";
  // ── DOM mode (default) ──

  const [query, setQuery] = useState("");
  const [replaceVal, setReplaceVal] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [options] = useState<SearchOptions>({
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  });
  const [localIdx, setLocalIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Self-contained mode: internal search state ──
  const [selfMatches, setSelfMatches] = useState<MatchRange[]>([]);
  const [selfIndex, setSelfIndex] = useState(-1);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Self-contained mode search ──
  useEffect(() => {
    if (!isSelfContained) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query) {
      setSelfMatches([]);
      setSelfIndex(-1);
      onMatchesChange?.([], -1, null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const results = searchInText(text!, query, options);
      setSelfMatches(results);
      const newIdx = results.length > 0 ? 0 : -1;
      setSelfIndex(newIdx);
      const regex = buildSearchRegex(query, options);
      onMatchesChange?.(results, newIdx, regex);
    }, 120);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, options, text, isSelfContained, onMatchesChange]);

  // ── DOM mode: notify parent on query change ──
  useEffect(() => {
    if (isSelfContained || isTextareaMode) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!onSearch) return;
    debounceRef.current = setTimeout(() => onSearch(query, options), 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, options, onSearch, isSelfContained, isTextareaMode]);

  // ── Navigation ──
  const goTo = useCallback((dir: 1 | -1) => {
    if (isSelfContained) {
      if (selfMatches.length === 0) return;
      const next = ((selfIndex + dir + selfMatches.length) % selfMatches.length);
      setSelfIndex(next);
      if (scrollRef?.current) {
        const lineOfs = text!.substring(0, selfMatches[next].start).split("\n").length - 1;
        scrollRef.current.scrollTop = Math.max(0, lineOfs * 20 - 60);
      }
      const regex = buildSearchRegex(query, options);
      onMatchesChange?.(selfMatches, next, regex);
    } else if (isTextareaMode) {
      const ta = inputRef.current?.closest("div")?.parentElement?.querySelector("textarea");
      if (!ta) return;
      const results = searchInText(ta.value, query, options);
      if (!results.length) return;
      const next = ((localIdx + dir + results.length) % results.length);
      setLocalIdx(next);
      const m = results[next];
      ta.focus();
      ta.setSelectionRange(m.start, m.end);
    } else {
      // DOM mode
      const total = matchCount ?? 0;
      const current = matchIndex ?? 0;
      const next = ((current + dir + total) % total);
      onNavigate?.(next);
    }
  }, [isSelfContained, isTextareaMode, selfMatches, selfIndex, scrollRef, text, query, options, onMatchesChange, localIdx, matchCount, matchIndex, onNavigate]);

  const goToNext = useCallback(() => goTo(1), [goTo]);
  const goToPrev = useCallback(() => goTo(-1), [goTo]);

  // ── Display values ──
  const total = isTextareaMode
    ? searchInText(value ?? "", query, options).length
    : isSelfContained
      ? selfMatches.length
      : (matchCount ?? 0);
  const current = isTextareaMode
    ? localIdx
    : isSelfContained
      ? selfIndex
      : (matchIndex ?? 0);

  // ── Replace logic ──
  const handleReplace = useCallback(() => {
    if (!isTextareaMode || !value || !query) return;
    const results = searchInText(value, query, options);
    if (!results.length) return;
    const idx = Math.min(localIdx, results.length - 1);
    const m = results[idx];
    const next = value.slice(0, m.start) + replaceVal + value.slice(m.end);
    onValueChange!(next);
  }, [isTextareaMode, value, query, options, localIdx, replaceVal, onValueChange]);

  const handleReplaceAll = useCallback(() => {
    if (!isTextareaMode || !value || !query) return;
    const regex = buildSearchRegex(query, options);
    if (!regex) return;
    const next = value.replace(regex, replaceVal);
    onValueChange!(next);
  }, [isTextareaMode, value, query, options, replaceVal, onValueChange]);

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-input)]">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Search size={13} className="shrink-0 text-[var(--text-muted)]" />
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) goToPrev(); else goToNext(); }
              if (e.key === "Escape") onClose();
            }}
            placeholder={lang === "zh" ? "搜索…" : "Search…"}
            className={inputCls}
          />
          {total > 0 && <span className={counterCls}>{current + 1}/{total}</span>}
        </div>
        <button type="button" onClick={goToPrev} disabled={total === 0} className={navBtn} title={lang === "zh" ? "上一个" : "Previous"}>
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={goToNext} disabled={total === 0} className={navBtn} title={lang === "zh" ? "下一个" : "Next"}>
          <ChevronDown size={14} />
        </button>
        {allowReplace && isTextareaMode && (
          <>
            <span className="w-px h-4 bg-[var(--border)]" />
            <button type="button" onClick={() => setShowReplace((v) => !v)} className={`rounded px-1.5 py-0.5 text-[11px] font-mono transition-colors border ${showReplace ? toggleOn : toggleOff}`}>
              替换
            </button>
          </>
        )}
        <button type="button" onClick={onClose} className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title={lang === "zh" ? "关闭" : "Close"}>
          <X size={14} />
        </button>
      </div>

      {/* Replace UI */}
      {showReplace && isTextareaMode && (
        <div className="flex items-center gap-1.5 border-t border-[var(--border)] px-2 py-1.5">
          <input
            type="text"
            value={replaceVal}
            onChange={(e) => setReplaceVal(e.currentTarget.value)}
            placeholder={lang === "zh" ? "替换为…" : "Replace with…"}
            className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
          />
          <button type="button" onClick={handleReplace} disabled={total === 0} className="rounded px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors">
            {lang === "zh" ? "替换" : "Replace"}
          </button>
          <button type="button" onClick={handleReplaceAll} disabled={total === 0} className="rounded px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors">
            {lang === "zh" ? "全部替换" : "Replace All"}
          </button>
        </div>
      )}
    </div>
  );
}

export default SearchReplace;