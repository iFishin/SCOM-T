import { useState, useRef, useCallback } from "react";
import { X, Search, Copy, Check } from "lucide-react";
import { Button } from "./ui/Button";
import { LineNumbers } from "./ui/LineNumbers";
import { SearchReplace } from "./SearchReplace";
import type { SearchOptions, MatchRange } from "../hooks/useSearch";
import { searchInText } from "../hooks/useSearch";
import { t } from "../i18n";
import type { Lang } from "../i18n";

type LogEditorProps = {
  initialContent: string;
  lang: Lang;
  onClose: () => void;
};

/**
 * Log viewer with line numbers and search. Uses plain <textarea> for reliable input and scrolling.
 */
export function LogEditor({ initialContent, lang, onClose }: LogEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMatches, setSearchMatches] = useState<MatchRange[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [cursorLine, setCursorLine] = useState(1);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const valRef = useRef(content);
  valRef.current = content;

  const lines = content.split("\n");

  /** Track cursor line — use valRef to avoid stale closure */
  const updateCursorLine = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const line = valRef.current.substring(0, el.selectionStart).split("\n").length;
    setCursorLine(line);
  }, []);

  /** Sync scroll with line numbers */
  const handleScroll = useCallback(() => {
    if (numRef.current && textRef.current) {
      numRef.current.scrollTop = textRef.current.scrollTop;
    }
  }, []);

  // ── Search ──
  const handleSearch = useCallback((query: string, opts: SearchOptions) => {
    const results = searchInText(content, query, opts);
    setSearchMatches(results);
    setSearchIndex(results.length > 0 ? 0 : -1);
  }, [content]);

  const handleNavigate = useCallback((idx: number) => {
    setSearchIndex(Math.max(0, Math.min(idx, searchMatches.length - 1)));
    if (!textRef.current || !searchMatches.length) return;
    const match = searchMatches[Math.max(0, Math.min(idx, searchMatches.length - 1))];
    const lineOfs = content.substring(0, match.start).split("\n").length - 1;

    // Scroll textarea to approximately that line (20px leading)
    const LINE_HEIGHT = 20;
    textRef.current.scrollTop = Math.max(0, lineOfs * LINE_HEIGHT - 40);
  }, [searchMatches, content]);

  // ── Copy ──
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch { /* ignore */ }
  }, [content]);

  return (
    <div className="flex h-[70vh] w-[80vw] max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {t("log_editor_title", lang)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className={`rounded p-1 transition-colors ${
              searchOpen
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            }`}
            title={lang === "zh" ? "搜索 (Ctrl+F)" : "Search (Ctrl+F)"}
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Search bar ── */}
      {searchOpen && (
        <SearchReplace
          onSearch={handleSearch}
          matchCount={searchMatches.length}
          matchIndex={searchIndex}
          matches={searchMatches}
          onNavigate={handleNavigate}
          onClose={() => {
            setSearchOpen(false);
            setSearchMatches([]);
            setSearchIndex(-1);
          }}
          lang={lang}
        />
      )}

      {/* Editor area */}
      <div className="flex flex-1 min-h-0 bg-[var(--bg-primary)]">
        {/* Line numbers */}
        <LineNumbers
          ref={numRef}
          text={content}
          activeLine={cursorLine}
          className="shrink-0"
        />

        {/* Plain textarea */}
        <textarea
          ref={textRef}
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          onScroll={handleScroll}
          onKeyUp={updateCursorLine}
          onMouseUp={updateCursorLine}
          onClick={updateCursorLine}
          spellCheck={false}
          wrap="off"
          className="overflow-y-auto resize-none flex-1 min-w-0 border-0 bg-transparent py-2 px-3 text-[var(--text-primary)] outline-none"
          style={{
            fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
            fontSize: "12px",
            lineHeight: "20px",
          }}
        />
      </div>

      {/* ── Footer ── */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-input)] px-4 py-2">
        <span className="text-[10px] text-[var(--text-muted)]">
          {cursorLine}/{lines.length}{" "}
          {lang === "zh" ? "行" : "lines"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
        >
          {copyFeedback ? <Check size={12} /> : <Copy size={12} />}
          {copyFeedback
            ? lang === "zh" ? "已复制" : "Copied"
            : lang === "zh" ? "复制全部" : "Copy All"}
        </button>
        <Button variant="primary" size="sm" onClick={onClose} className="text-xs">
          {t("close", lang)}
        </Button>
      </div>
    </div>
  );
}

export default LogEditor;
