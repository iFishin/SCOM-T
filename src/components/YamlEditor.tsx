import { useRef, useState, useCallback } from "react";
import { Search } from "lucide-react";
import { formatYaml } from "../utils/yamlHighlighter.ts";
import { SearchReplace } from "./SearchReplace.tsx";
import { Button } from "./ui/Button.tsx";
import { LineNumbers } from "./ui/LineNumbers.tsx";

type Props = {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  lang: "zh" | "en";
};

const MONO_STYLE = {
  fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
  fontSize: "12px",
  lineHeight: "20px",
};

export function YamlEditor({ value, onChange, error, lang }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const valRef = useRef(value);
  valRef.current = value;
  const [searchOpen, setSearchOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ── Format ── */
  const handleFormat = useCallback(() => {
    const formatted = formatYaml(value);
    if (formatted && formatted !== value) {
      onChange(formatted);
    } else if (!formatted && value.trim()) {
      setErrorMsg(lang === "zh" ? "YAML 格式错误，无法格式化" : "Invalid YAML, cannot format");
    }
  }, [value, onChange, lang]);

  /* ── Sync line numbers scroll ── */
  const handleScroll = useCallback(() => {
    if (numRef.current && textRef.current) {
      numRef.current.scrollTop = textRef.current.scrollTop;
    }
  }, []);

  /* ── Tab → 2 spaces ── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const el = textRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const newVal = value.substring(0, start) + "  " + value.substring(end);
        onChange(newVal);
        requestAnimationFrame(() => {
          if (textRef.current) {
            textRef.current.selectionStart = textRef.current.selectionEnd = start + 2;
          }
        });
      }
    },
    [value, onChange],
  );

  /* ── Search close ── */
  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    requestAnimationFrame(() => textRef.current?.focus());
  }, []);

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

      {/* Editor area: line numbers + plain textarea */}
      <div className="flex min-h-0 flex-1 bg-[var(--bg-input)]">
        {/* Line numbers */}
        <LineNumbers
          ref={numRef}
          text={value + "\n"}
          className="shrink-0"
        />

        {/* Plain textarea — no syntax highlighting overlay, just like BatchEditor */}
        <textarea
          ref={textRef}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          wrap="off"
          className="overflow-y-auto resize-none flex-1 min-w-0 border-0 bg-transparent py-2 px-3 text-[var(--text-primary)] outline-none"
          style={MONO_STYLE}
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
