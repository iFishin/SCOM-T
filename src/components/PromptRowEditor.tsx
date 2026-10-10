import { Download, Plus, Trash2 } from "lucide-react";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import type { PromptRow } from "./promptRow.ts";

type PromptRowEditorProps = {
  row: PromptRow;
  lang: Lang;
  /** Available response sets, for the save-to / import-from dropdowns. */
  responseSetOptions: { id: string; name: string }[];
  /** Whether the "capture from last receive" action is available. */
  canCapture: boolean;
  onUpdate: (patch: Partial<PromptRow>) => void;
  onSaveToResponseSet: (responseSetId: string) => void;
  onImportFromResponseSet: (responseSetId: string) => void;
  onCapture: () => void;
};

/**
 * Expanded editor for a single command row: expected responses with per-entry
 * regex toggles, the all/any match mode, and the response-set save/import
 * shortcuts. Presentational — all I/O is delegated through the callbacks.
 */
export function PromptRowEditor({
  row,
  lang,
  responseSetOptions,
  canCapture,
  onUpdate,
  onSaveToResponseSet,
  onImportFromResponseSet,
  onCapture,
}: PromptRowEditorProps) {
  const responses = row.expectedResponses ?? [];
  const nonEmptyCount = responses.filter((r) => r.trim()).length;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-theme-10 font-semibold text-[var(--text-muted)]">
          {t("prompt_expected_responses", lang)}
        </label>
        {responseSetOptions.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onSaveToResponseSet(e.target.value);
              }}
              className="text-theme-10 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--text-muted)] max-w-[90px]"
            >
              <option value="">{lang === "zh" ? "保存到..." : "Save to..."}</option>
              {responseSetOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
            <span className="w-px h-3 bg-[var(--border)]" />
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onImportFromResponseSet(e.target.value);
              }}
              className="text-theme-10 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--text-primary)] max-w-[130px]"
            >
              <option value="">{lang === "zh" ? "从响应集导入..." : "Import from set..."}</option>
              {responseSetOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {responses.map((resp, j) => {
          const isRegex = row.expectedResponseRegex?.[j] ?? false;
          return (
            <div key={j} className="flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const regex = row.expectedResponseRegex
                    ? [...row.expectedResponseRegex]
                    : responses.map(() => false);
                  regex[j] = !regex[j];
                  onUpdate({ expectedResponseRegex: regex });
                }}
                className={`shrink-0 mt-1 px-1.5 py-0.5 text-theme-9 font-mono rounded border transition-colors ${
                  isRegex
                    ? "bg-amber-100 border-amber-300 text-amber-700"
                    : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-muted)]"
                }`}
                title={isRegex
                  ? (lang === "zh" ? "正则模式" : "Regex mode")
                  : (lang === "zh" ? "文本模式" : "Text mode")
                }
              >
                {isRegex ? ".*" : "Abc"}
              </button>
              <textarea
                value={resp}
                onChange={(e) => {
                  const next = [...responses];
                  next[j] = e.target.value;
                  const filtered = next.filter((r) => r.trim() !== "");
                  onUpdate({ expectedResponses: filtered.length > 0 ? filtered : undefined });
                }}
                placeholder={isRegex
                  ? (lang === "zh" ? "正则表达式" : "Regex pattern")
                  : (lang === "zh" ? "期望响应内容" : "Expected response")
                }
                className="flex-1 text-theme-11 bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 resize-y focus:outline-none focus:border-[var(--accent)] min-h-[24px]"
                rows={Math.max(1, (resp.match(/\n/g)?.length || 0) + 1)}
              />
              <button
                type="button"
                onClick={() => {
                  const kept = responses.filter((_, k) => k !== j);
                  const regex = row.expectedResponseRegex?.filter((_, k) => k !== j);
                  onUpdate({
                    expectedResponses: kept.length > 0 ? kept : undefined,
                    expectedResponseRegex: regex && regex.length > 0 ? regex : undefined,
                  });
                }}
                className="text-rose-400 hover:text-rose-600 p-1 mt-1"
              >
                <Trash2 size={10} />
              </button>
            </div>
          );
        })}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = [...responses, ""];
              const regex = row.expectedResponseRegex
                ? [...row.expectedResponseRegex, false]
                : undefined;
              onUpdate({ expectedResponses: next, expectedResponseRegex: regex });
            }}
            className="flex items-center gap-1 text-theme-10 text-[var(--text-muted)] hover:text-[var(--accent)] px-1 py-0.5"
          >
            <Plus size={10} />
            {lang === "zh" ? "添加期望结果" : "Add Response"}
          </button>
          {nonEmptyCount >= 2 && (
            <div
              className="flex items-center rounded border border-[var(--border)] overflow-hidden"
              title={lang === "zh" ? "多条期望结果的匹配方式" : "How multiple expectations match"}
            >
              <button
                type="button"
                onClick={() => onUpdate({ matchMode: "all" })}
                className={`px-2 py-0.5 text-theme-9 transition-colors ${(row.matchMode ?? "all") === "all" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--bg-input)]"}`}
              >
                {t("response_set_match_all", lang)}
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ matchMode: "any" })}
                className={`px-2 py-0.5 text-theme-9 transition-colors ${row.matchMode === "any" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--bg-input)]"}`}
              >
                {t("response_set_match_any", lang)}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCapture}
          disabled={!canCapture}
          className="flex items-center gap-1 text-theme-10 text-[var(--text-muted)] hover:text-emerald-600 px-1 py-0.5 disabled:opacity-40 disabled:hover:text-[var(--text-muted)]"
          title={lang === "zh" ? "从最近一次接收中采集实际响应" : "Capture actual response from last receive"}
        >
          <Download size={10} />
          {lang === "zh" ? "采集响应" : "Capture"}
        </button>
      </div>
    </div>
  );
}
