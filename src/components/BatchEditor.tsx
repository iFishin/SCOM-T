import { useRef, useState, useCallback } from "react";
import { Search } from "lucide-react";
import { Button } from "./ui/Button";
import { LineNumbers } from "./ui/LineNumbers";
import { SearchReplace } from "./SearchReplace.tsx";
import type { Lang } from "../i18n.ts";

type BatchEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  lang: Lang;
};

export function BatchEditor({ value, onChange, placeholder, lang }: BatchEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);

  const lines = value.split("\n");

  // ── Sync content back when editing ──
  const handleInput = useCallback(() => {
    if (!contentRef.current) return;
    const text = contentRef.current.innerText || "";
    // Replace &nbsp; with space to match normal text
    onChange(text.replace(/ /g, " "));
  }, [onChange]);

  // ── Cursor tracking ──
  const updateCursorLine = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.focusNode || !contentRef.current) return;
    let node: Node | null = sel.focusNode;
    while (node && node !== contentRef.current) {
      if (node.parentNode === contentRef.current) {
        const children = Array.from(contentRef.current.children);
        const idx = children.indexOf(node as HTMLElement);
        setCursorLine(idx >= 0 ? idx + 1 : 1);
        return;
      }
      node = node.parentNode;
    }
  }, []);

  // ── Handle Enter in contenteditable (insert line) ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      setSearchOpen((v) => !v);
    }
    // Let default Enter behavior create new <div>
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search bar */}
      {searchOpen && (
        <div className="shrink-0 border-b border-[var(--border)]">
          <SearchReplace
            value={value}
            onValueChange={onChange}
            onClose={() => setSearchOpen(false)}
            lang={lang}
          />
        </div>
      )}

      {/* Single scroll container */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded border border-[var(--border)]">
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 overflow-auto bg-[var(--bg-input)]"
        >
          {/* Line numbers — sticky to left, scrolls vertically with content */}
          <div className="sticky left-0 top-0 z-10 shrink-0 self-start">
            <LineNumbers text={value} activeLine={cursorLine} className="min-h-full" />
          </div>

          {/* ContentEditable — each line is a <div> */}
          <div
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyUp={updateCursorLine}
            onMouseUp={updateCursorLine}
            onClick={updateCursorLine}
            onKeyDown={handleKeyDown}
            className="flex-1 whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-primary)] outline-none"
            data-placeholder={placeholder}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1">
        <span className="text-[10px] text-[var(--text-muted)]">
          {cursorLine}/{lines.length} {lang === "zh" ? "行" : "lines"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSearchOpen((v) => !v)}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors ${
              searchOpen
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Search size={12} />
            {lang === "zh" ? "搜索" : "Search"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default BatchEditor;
