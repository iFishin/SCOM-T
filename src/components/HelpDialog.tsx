import { useState, useEffect, useCallback } from "react";
import { X, Loader2, RotateCcw, WifiOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Lang } from "../i18n.ts";
import { Button } from "./ui/Button.tsx";

/** 默认云端帮助文档仓库。文档文件 docs.zh.md / docs.en.md。 */
const DEFAULT_HELP_REPO =
  "https://raw.githubusercontent.com/iFishin/help/main/SCOM-T";

type HelpDialogProps = {
  open: boolean;
  lang: Lang;
  /** 帮助文档地址；支持 {lang} 占位符；空串用默认云端 URL。 */
  helpUrl?: string;
  onClose: () => void;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; markdown: string }
  | { status: "error" };

/** 解析最终帮助文档 URL（按当前语言）。 */
export function resolveHelpUrl(helpUrl: string | undefined, lang: Lang): string {
  if (helpUrl && helpUrl.trim()) {
    return helpUrl.trim().replace("{lang}", lang === "zh" ? "zh" : "en");
  }
  return `${DEFAULT_HELP_REPO}/docs.${lang === "zh" ? "zh" : "en"}.md`;
}

export function HelpDialog({ open, lang, helpUrl, onClose }: HelpDialogProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const load = useCallback(async () => {
    const url = resolveHelpUrl(helpUrl, lang);
    setState({ status: "loading" });
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setState({ status: "ready", markdown: text });
    } catch {
      setState({ status: "error" });
    }
  }, [helpUrl, lang]);

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setState({ status: "idle" });
    }
  }, [open, load]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-[720px] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {lang === "zh" ? "帮助文档" : "Help Docs"}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {lang === "zh" ? "在线文档，随版本更新" : "Online docs, kept up to date"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(state.status === "ready" || state.status === "error") && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void load()}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title={lang === "zh" ? "重新加载" : "Reload"}
              >
                <RotateCcw size={13} />
                {lang === "zh" ? "刷新" : "Reload"}
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-[360px] max-h-[72vh] overflow-y-auto p-5 text-sm">
          {state.status === "loading" && (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-xs">{lang === "zh" ? "正在加载帮助文档…" : "Loading help docs…"}</span>
            </div>
          )}

          {state.status === "error" && (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
              <WifiOff size={24} />
              <div className="text-xs text-center leading-relaxed">
                {lang === "zh"
                  ? "无法加载在线帮助文档，请检查网络连接。"
                  : "Failed to load online help docs. Please check your network."}
              </div>
              <Button
                type="button"
                variant="primary"
                onClick={() => void load()}
                className="flex items-center gap-1 rounded px-3 py-1 text-xs"
              >
                <RotateCcw size={12} />
                {lang === "zh" ? "重试" : "Retry"}
              </Button>
            </div>
          )}

          {state.status === "ready" && (
            <div className="help-md">
              <ReactMarkdown>{state.markdown}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HelpDialog;
