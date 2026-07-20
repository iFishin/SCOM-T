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

/** Shared monospace font style for pixel-perfect alignment between textarea and LineNumbers */
const MONO_STYLE = {
  fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
  fontSize: "12px",
  lineHeight: "20px",
};

export function BatchEditor({ value, onChange, placeholder, lang }: BatchEditorProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const valRef = useRef(value);
  valRef.current = value;
  const [searchOpen, setSearchOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);

  const lines = value.split("\n");

  /** Track cursor line — use valRef to avoid stale closure */
  const updateCursorLine = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const line = valRef.current.substring(0, el.selectionStart).split("\n").length;
    setCursorLine(line);
  }, []);

  /** Sync line numbers scroll with textarea scroll */
  const handleScroll = useCallback(() => {
    if (numRef.current && textRef.current) {
      numRef.current.scrollTop = textRef.current.scrollTop;
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.currentTarget.value);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      setSearchOpen((v) => !v);
    }
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

      {/* Editor area */}
      <div className="flex min-h-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-input)]">
        {/* Line numbers */}
        <LineNumbers
          ref={numRef}
          text={value}
          activeLine={cursorLine}
          className="shrink-0"
        />

        {/* Plain textarea — font styles explicitly set to match LineNumbers exactly */}
        <textarea
          ref={textRef}
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyUp={updateCursorLine}
          onMouseUp={updateCursorLine}
          onClick={updateCursorLine}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          className="overflow-y-auto resize-none flex-1 min-w-0 border-0 bg-transparent py-2 px-3 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] placeholder:opacity-65"
          style={MONO_STYLE}
        />
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
