import { useRef, useState, useMemo, useCallback } from "react";
import { Search } from "lucide-react";
import { Button } from "./ui/Button";
import { SearchReplace } from "./SearchReplace.tsx";
import type { Lang } from "../i18n.ts";

type BatchEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  lang: Lang;
};

export function BatchEditor({ value, onChange, placeholder, lang }: BatchEditorProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const lines = useMemo(() => value.split("\n"), [value]);

  const syncScroll = useCallback(() => {
    if (lineRef.current && textRef.current) {
      lineRef.current.scrollTop = textRef.current.scrollTop;
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+F / Cmd+F to toggle search
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      setSearchOpen((v) => !v);
    }
  }

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
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded border border-[var(--border)]">
        {/* Line numbers */}
        <div
          ref={lineRef}
          className="pointer-events-none select-none overflow-hidden border-r border-[var(--border)] bg-[var(--bg-input)] py-2 text-right font-mono text-xs leading-relaxed text-[var(--text-muted)]"
          style={{ minWidth: `${Math.max(3, String(lines.length).length)}ch`, paddingRight: "0.5rem", paddingLeft: "0.5rem" }}
          aria-hidden
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textRef}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 resize-none border-0 bg-[var(--bg-input)] p-2 font-mono text-xs leading-relaxed text-[var(--text-primary)] outline-none"
          spellCheck={false}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1">
        <span className="text-[10px] text-[var(--text-muted)]">
          {lang === "zh" ? `${lines.length} 行` : `${lines.length} lines`}
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
