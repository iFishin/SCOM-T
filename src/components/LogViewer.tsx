import { useCallback, useRef, useState } from "react";
import { Search, X, Trash2 } from "lucide-react";
import { SearchReplace } from "./SearchReplace.tsx";
import { highlightText, type MatchRange } from "../hooks/useSearch.ts";
import type { Lang } from "../i18n.ts";

type LogViewerProps = {
  lang: Lang;
  logFiles: string[];
  selectedFile: string | null;
  content: string;
  onSelectFile: (name: string) => void;
  onDeleteFile: (name: string) => void;
  onClose: () => void;
};

export function LogViewer({ lang, logFiles, selectedFile, content, onSelectFile, onDeleteFile, onClose }: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMatches, setSearchMatches] = useState<MatchRange[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [searchRegex, setSearchRegex] = useState<RegExp | null>(null);

  const handleMatchesChange = useCallback((matches: MatchRange[], idx: number, regex: RegExp | null) => {
    setSearchMatches(matches);
    setSearchIndex(idx);
    setSearchRegex(regex);
  }, []);

  const currentMatchLine = searchIndex >= 0 && searchIndex < searchMatches.length
    ? content.substring(0, searchMatches[searchIndex].start).split("\n").length - 1
    : -1;

  const lines = content.split("\n");

  return (
    <div className="flex h-[75vh] w-[85vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {lang === "zh" ? "程序日志" : "App Logs"}
        </span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setSearchOpen((v) => !v)}
            className={`rounded p-1 transition-colors ${searchOpen ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"}`}
            title={lang === "zh" ? "搜索" : "Search"}
          ><Search size={14} /></button>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-48 shrink-0 flex-col border-r border-[var(--border)]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">{lang === "zh" ? "日志文件" : "Log Files"}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {logFiles.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">{lang === "zh" ? "暂无日志文件" : "No log files"}</div>
            ) : logFiles.map((name) => (
              <div key={name} className={`group flex items-center border-b border-[var(--border)]/50 text-xs transition-colors ${name === selectedFile ? "bg-[var(--accent)]/10 text-[var(--accent-dark)]" : "text-[var(--text-primary)] hover:bg-[var(--bg-input)]"}`}>
                <button type="button" onClick={() => onSelectFile(name)} className="flex-1 truncate px-3 py-2 text-left">{name}</button>
                <button type="button" onClick={() => onDeleteFile(name)} className="shrink-0 px-2 py-2 text-[var(--text-muted)] opacity-0 transition-colors hover:text-rose-500 group-hover:opacity-100" title={lang === "zh" ? "删除" : "Delete"}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
          {selectedFile ? (
            <>
              {searchOpen && (
                <SearchReplace
                  text={content}
                  scrollRef={scrollRef}
                  onMatchesChange={handleMatchesChange}
                  onClose={() => { setSearchOpen(false); setSearchMatches([]); setSearchIndex(-1); setSearchRegex(null); }}
                  lang={lang}
                />
              )}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-[20px]">
                {lines.map((line, i) => {
                  let color = "text-[var(--text-primary)]";
                  let bg = "";
                  if (line.includes("] [ERROR]")) { color = "text-red-600 dark:text-red-400"; bg = "bg-red-50 dark:bg-red-950/30"; }
                  else if (line.includes("] [WARN]")) { color = "text-amber-600 dark:text-amber-400"; bg = "bg-amber-50 dark:bg-amber-950/30"; }
                  else if (line.includes("] [INFO]")) { color = "text-sky-600 dark:text-sky-400"; }
                  else if (line.includes("] [DEBUG]")) { color = "text-[var(--text-muted)]"; }
                  const isCurrentLine = i === currentMatchLine;
                  return (
                    <div key={i} className={bg}>
                      <span className={"select-none mr-3 text-right opacity-40 shrink-0 " + color}>{i + 1}</span>
                      <span className={color}>
                        {searchRegex
                          ? highlightText(line, searchRegex).map((seg, si) =>
                              seg.match
                                ? <mark key={si} className={isCurrentLine ? "hl-search-current" : "hl-search-match"}>{seg.text}</mark>
                                : <span key={si}>{seg.text}</span>
                            )
                          : line}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
              {lang === "zh" ? "选择一个日志文件查看" : "Select a log file to view"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LogViewer;