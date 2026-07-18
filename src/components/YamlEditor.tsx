import { useRef, useState, useCallback } from "react";
import { Search } from "lucide-react";
import { highlightYaml, formatYaml } from "../utils/yamlHighlighter.ts";
import { SearchReplace } from "./SearchReplace.tsx";
import type { MatchRange } from "../hooks/useSearch.ts";
import { Button } from "./ui/Button.tsx";
import { LineNumbers } from "./ui/LineNumbers.tsx";

type Props = {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  lang: "zh" | "en";
};

/** Walk text nodes inside a parent element and find the total text offset for a given node+offset */
function getTextOffset(root: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const tn = walker.currentNode as Text;
    if (tn === node) return total + offset;
    total += tn.textContent?.length ?? 0;
  }
  return total;
}

/** Walk text nodes and place the caret at the given text offset */
function setCaretAtOffset(root: HTMLElement, targetOffset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  let accumulated = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const tn = walker.currentNode as Text;
    const len = tn.textContent?.length ?? 0;
    if (accumulated + len >= targetOffset) {
      const range = document.createRange();
      range.setStart(tn, targetOffset - accumulated);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    accumulated += len;
  }
}

export function YamlEditor({ value, onChange, error, lang }: Props) {
  const editorRef = useRef<HTMLPreElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMatches] = useState<MatchRange[]>([]);
  const [searchCurrentIdx] = useState(-1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const supressInputRef = useRef(false);

  /* ── Format ── */
  const handleFormat = useCallback(() => {
    const formatted = formatYaml(value);
    if (formatted && formatted !== value) {
      onChange(formatted);
    } else if (!formatted && value.trim()) {
      setErrorMsg(lang === "zh" ? "YAML 格式错误，无法格式化" : "Invalid YAML, cannot format");
    }
  }, [value, onChange, lang]);

  /* ── contentEditable input handler ── */
  const handleInput = useCallback(() => {
    if (supressInputRef.current) return;
    const el = editorRef.current;
    if (!el) return;

    // Save caret position before re-render
    const sel = window.getSelection();
    let savedOffset = 0;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      savedOffset = getTextOffset(el, range.startContainer, range.startOffset);
    }

    // Extract plain text (strips any rich formatting from paste)
    const plainText = el.textContent ?? "";

    // Notify parent (triggers re-render with new highlighted HTML)
    onChange(plainText);

    // After React re-renders, restore caret
    requestAnimationFrame(() => {
      if (editorRef.current) {
        // Clamp offset to valid range
        const totalLen = editorRef.current.textContent?.length ?? 0;
        setCaretAtOffset(editorRef.current, Math.min(savedOffset, totalLen));
      }
    });
  }, [onChange]);

  /* ── Prevent Enter from inserting <div> (keep everything in <pre>) ── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
      // Tab → insert 2 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode("  "));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        // Trigger input event
        editorRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    [],
  );

  /* ── Search close: refocus editor ── */
  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const highlightedHtml = highlightYaml(value, searchMatches, searchCurrentIdx);

  return (
    <div
      className={`min-h-0 flex-1 overflow-hidden rounded-lg border flex flex-col ${
        error ? "border-red-500 dark:border-red-700" : "border-[var(--border)]"
      } bg-[var(--bg-surface)]`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--border)] shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={handleFormat} className="text-[11px] px-2 py-0.5">
          {lang === "zh" ? "格式化" : "Format"}
        </Button>
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className={`rounded p-1 transition-colors ${
            searchOpen
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
          }`}
          title={lang === "zh" ? "搜索 (Ctrl+F)" : "Search (Ctrl+F)"}
        >
          <Search size={13} />
        </button>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <SearchReplace
          value={value}
          onValueChange={onChange}
          allowReplace
          onClose={handleSearchClose}
          lang={lang}
        />
      )}

      {/* Editor area — unified scroll container */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 overflow-auto bg-[var(--bg-input)]"
      >
        {/* Line numbers — sticky left, scrolls vertically with content */}
        <div className="sticky left-0 top-0 z-10 shrink-0 self-start">
          <LineNumbers text={value + "\n"} className="min-h-full" />
        </div>

        {/* Vertical ruler line at column ~20 */}
        <div
          className="absolute z-20 inset-y-0 w-px pointer-events-none"
          style={{
            left: "calc(5ch + 20ch + 16px)",
            background: "color-mix(in srgb, var(--accent) 15%, transparent)",
          }}
        />

        {/* contentEditable editor — inline syntax highlighting */}
        <pre
          ref={editorRef}
          contentEditable="plaintext-only"
          className="flex-1 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all outline-none p-3 text-[var(--text-primary)]"
          style={{ fontFamily: "var(--mono-font-family)" }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
      </div>

      {/* Error bar */}
      {(error || errorMsg) && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error || errorMsg}
        </div>
      )}
    </div>
  );
}

export default YamlEditor;
