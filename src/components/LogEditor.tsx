import { useState, useRef, useCallback, useEffect } from "react";
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
 * Editable log viewer with line numbers, search/replace, and cursor-line highlight.
 * Uses a single scroll container — line numbers and `<div contenteditable>` share
 * the same scroll context so they are guaranteed to stay aligned.
 */
export function LogEditor({ initialContent, lang, onClose }: LogEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMatches, setSearchMatches] = useState<MatchRange[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [cursorLine, setCursorLine] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const lines = content.split("\n");

  // ── Cursor tracking ──
  const updateCursorLine = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.focusNode || !contentRef.current) return;
    let node: Node | null = sel.focusNode;
    let lineNum = 1;
    // Walk up to find the line <div> container
    while (node && node !== contentRef.current) {
      if (node.parentNode === contentRef.current) {
        // node is a direct child of the content div → it's a line
        const children = Array.from(contentRef.current.children);
        const idx = children.indexOf(node as HTMLElement);
        if (idx >= 0) lineNum = idx + 1;
        break;
      }
      node = node.parentNode;
    }
    setCursorLine(lineNum);

    // Also update content state on cursor move (selection may have been via keyboard)
    const text = contentRef.current.innerText || "";
    const newContent = text.replace(/ /g, " "); // &nbsp; → space
    setContent(newContent);
  }, []);

  // ── Keep content in sync when user edits ──
  const handleInput = useCallback(() => {
    if (!contentRef.current) return;
    const text = contentRef.current.innerText || "";
    setContent(text.replace(/ /g, " "));
  }, []);

  // ── Search ──
  const handleSearch = useCallback((query: string, opts: SearchOptions) => {
    const results = searchInText(content, query, opts);
    setSearchMatches(results);
    setSearchIndex(results.length > 0 ? 0 : -1);
  }, [content]);

  const handleNavigate = useCallback((idx: number) => {
    setSearchIndex(Math.max(0, Math.min(idx, searchMatches.length - 1)));
    // Scroll match into view
    if (!contentRef.current || !searchMatches.length) return;
    const match = searchMatches[Math.max(0, Math.min(idx, searchMatches.length - 1))];
    const lineOfs = content.substring(0, match.start).split("\n").length - 1;
    const lineEl = contentRef.current.children[lineOfs] as HTMLElement;
    lineEl?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [searchMatches, content]);

  // ── Set initial content and cursor ──
  useEffect(() => {
    if (!contentRef.current) return;
    // Populate line <div>s
    contentRef.current.innerHTML = lines
      .map((line: string) => `<div>${line}</div>`)
      .join("");
    // Focus and put cursor at end
    contentRef.current.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      const lastChild = contentRef.current.lastElementChild;
      if (lastChild) {
        const textNode = lastChild.firstChild;
        if (textNode) {
          range.setStartAfter(textNode);
          range.collapse(true);
        } else {
          range.setStart(lastChild, 0);
          range.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    setCursorLine(lines.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle keyboard for search toggle ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Copy ──
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch { /* ignore */ }
  }, [content]);

  // ── Render search-highlighted content ──
  // (placeholder for future inline highlight rendering)

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

      {/* ── Single scroll container ── */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 overflow-auto bg-[var(--bg-primary)]"
      >
        {/* Line numbers */}
        <div className="sticky left-0 top-0 z-10 shrink-0 self-start">
          <LineNumbers
            text={content}
            activeLine={cursorLine}
            className="min-h-full"
          />
        </div>

        {/* Editable content */}
        <div
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyUp={updateCursorLine}
          onMouseUp={updateCursorLine}
          onClick={updateCursorLine}
          className="flex-1 whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-primary)] outline-none"
          style={{ minHeight: "100%" }}
          spellCheck={false}
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
