import { useState, useCallback } from "react";
import { X, Search } from "lucide-react";
import { Button } from "../ui/Button.tsx";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";

type Props = {
  text: string;
  lang: Lang;
  onApply: (result: string) => void;
  onClose: () => void;
};

export function RegexCleanDialog({ text, lang, onApply, onClose }: Props) {
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = useCallback(() => {
    setError(null);
    try {
      // Parse inline flags like (?i) from the pattern
      let flags = "g";
      let cleanPattern = pattern;
      const inlineFlags = cleanPattern.match(/^\(\?([imsx-]+)\)/);
      if (inlineFlags) {
        const flagStr = inlineFlags[1];
        if (flagStr.includes("i")) flags += "i";
        if (flagStr.includes("m")) flags += "m";
        if (flagStr.includes("s")) flags += "s";
        cleanPattern = cleanPattern.slice(inlineFlags[0].length);
      }
      const re = new RegExp(cleanPattern, flags);
      const result = text.replace(re, replacement);
      setPreview(result);
    } catch (e) {
      setError(String(e));
      setPreview(null);
    }
  }, [pattern, replacement, text]);

  const handleApply = useCallback(() => {
    if (preview !== null) {
      onApply(preview);
    }
  }, [preview, onApply]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-[520px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {lang === "zh" ? "正则清洗" : "Regex Clean"}
          </span>
          <button type="button" onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          ><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              {lang === "zh" ? "正则表达式" : "Regex Pattern"}
            </div>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.currentTarget.value)}
              placeholder={lang === "zh" ? "例如: \\[\\d+:\\d+:\\d+\\] 匹配时间戳..." : "e.g. \\[\\d+:\\d+:\\d+\\] to match timestamps..."}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              spellCheck={false}
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              {lang === "zh" ? "替换为" : "Replacement"}
            </div>
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.currentTarget.value)}
              placeholder={lang === "zh" ? "替换文本（留空则删除匹配）" : "Replacement text (empty = remove match)"}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          {preview !== null && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <Search size={12} />
                {lang === "zh" ? "预览结果" : "Preview"}
                <span className="text-[10px] opacity-60">
                  ({lang === "zh" ? `${text.length} → ${preview.length} 字符` : `${text.length} → ${preview.length} chars`})
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-input)] px-4 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
            {t("close", lang)}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handlePreview} disabled={!pattern} className="text-xs">
            {lang === "zh" ? "预览" : "Preview"}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={handleApply} disabled={preview === null} className="text-xs">
            {lang === "zh" ? "应用" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default RegexCleanDialog;