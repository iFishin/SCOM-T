import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { searchInText, type SearchOptions, type MatchRange } from "../hooks/useSearch.ts";

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
  /** Called when search bar is closed */
  onClose: () => void;
  lang: "zh" | "en";
};

const inputCls =
  "w-full rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 pr-12 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]";
const counterCls =
  "absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] select-none pointer-events-none";
const toggleBase =
  "rounded px-1.5 py-0.5 text-[11px] font-mono transition-colors border";
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
  onClose,
  lang,
}: Props) {
  const [query, setQuery] = useState("");
  const [replaceVal, setReplaceVal] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTextareaMode = typeof value === "string" && typeof onValueChange === "function";
  const total = isTextareaMode
    ? searchInText(value ?? "", query, options).length
    : (matchCount ?? 0);
  const current = isTextareaMode
    ? 0 // not tracked locally for textarea mode
    : (matchIndex ?? 0);
  const hasMatches = total > 0;
  const [localIdx, setLocalIdx] = useState(0);

  // Debounced search notification for DOM mode
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!onSearch) return;
    debounceRef.current = setTimeout(() => onSearch(query, options), 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, options, onSearch]);

  const toggle = (key: keyof SearchOptions) =>
    setOptions((p) => ({ ...p, [key]: !p[key] }));

  const goTo = useCallback(
    (dir: 1 | -1) => {
      if (isTextareaMode) {
        // textarea: search directly
        const ta = document.activeElement as HTMLTextAreaElement | null;
        if (!ta) return;
        const results = searchInText(ta.value, query, options);
        if (!results.length) return;
        const next = ((localIdx + dir + results.length) % results.length);
        setLocalIdx(next);
        const m = results[next];
        ta.focus();
        ta.setSelectionRange(m.start, m.end);
      } else {
        // DOM mode: delegate to parent
        const next = ((current + dir + total) % total);
        onNavigate?.(next);
      }
    },
    [isTextareaMode, query, options, localIdx, current, total, onNavigate],
  );

  const goToNext = useCallback(() => goTo(1), [goTo]);
  const goToPrev = useCallback(() => goTo(-1), [goTo]);

  // Replace one
  const handleReplace = useCallback(() => {
    if (!isTextareaMode || !value || !query) return;
    const results = searchInText(value, query, options);
    if (!results.length) return;
    const idx = Math.min(localIdx, results.length - 1);
    const m = results[idx];
    const next = value.slice(0, m.start) + replaceVal + value.slice(m.end);
    onValueChange!(next);
  }, [isTextareaMode, value, query, options, localIdx, replaceVal, onValueChange]);

  // Replace all
  const handleReplaceAll = useCallback(() => {
    if (!isTextareaMode || !value || !query) return;
    const results = searchInText(value, query, options);
    if (!results.length) return;
    let result = value;
    for (let i = results.length - 1; i >= 0; i--) {
      const m = results[i];
      result = result.slice(0, m.start) + replaceVal + result.slice(m.end);
    }
    onValueChange!(result);
  }, [isTextareaMode, value, query, options, replaceVal, onValueChange]);

  return (
    <div>
      {/* Search row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--bg-input)] text-xs">
        <Search size={12} className="shrink-0 text-[var(--text-muted)]" />
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={lang === "zh" ? "搜索…" : "Search…"}
            className={inputCls}
            autoFocus
          />
          <span className={counterCls}>
            {query
              ? hasMatches
                ? `${(isTextareaMode ? localIdx : current) + 1}/${total}`
                : "0/0"
              : ""}
          </span>
        </div>

        <button type="button" onClick={() => toggle("caseSensitive")}
          className={`${toggleBase} ${options.caseSensitive ? toggleOn : toggleOff}`}
          title={lang === "zh" ? "大小写敏感" : "Aa"}>
          Aa
        </button>
        <button type="button" onClick={() => toggle("regex")}
          className={`${toggleBase} ${options.regex ? toggleOn : toggleOff}`}
          title="Regex">
          .*
        </button>
        <button type="button" onClick={() => toggle("wholeWord")}
          className={`${toggleBase} ${options.wholeWord ? toggleOn : toggleOff}`}
          title={lang === "zh" ? "全词匹配" : "Whole word"}>
          ab
        </button>

        <button type="button" onClick={goToPrev} disabled={!hasMatches} className={navBtn}>
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={goToNext} disabled={!hasMatches} className={navBtn}>
          <ChevronDown size={14} />
        </button>

        {allowReplace && (
          <button type="button" onClick={() => setShowReplace((v) => !v)}
            className={`${toggleBase} ${showReplace ? toggleOn : toggleOff} text-[10px]`}>
            {lang === "zh" ? "替换" : "Rep"}
          </button>
        )}

        <button type="button" onClick={onClose}
          className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Replace row */}
      {allowReplace && showReplace && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--bg-input)] text-xs">
          <input
            value={replaceVal}
            onChange={(e) => setReplaceVal(e.currentTarget.value)}
            placeholder={lang === "zh" ? "替换为…" : "Replace with…"}
            className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
            onKeyDown={(e) => { if (e.key === "Enter") handleReplace(); }}
          />
          <button type="button" onClick={handleReplace} disabled={!hasMatches || !isTextareaMode}
            className="rounded px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            {lang === "zh" ? "替换" : "Replace"}
          </button>
          <button type="button" onClick={handleReplaceAll} disabled={!hasMatches || !isTextareaMode}
            className="rounded px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            {lang === "zh" ? "全部" : "All"}
          </button>
        </div>
      )}
    </div>
  );
}

export default SearchReplace;
