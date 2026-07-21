import { useState } from "react";
import { X, ExternalLink, Bell } from "lucide-react";
import { Button } from "../ui/Button";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";

type NotificationItem = {
  id?: string;
  title?: string;
  body?: string;
  severity?: "info" | "warning" | "important";
  link?: string;
  date?: string;
  minVersion?: string;
  maxVersion?: string;
  display?: "once" | "always";
  mode?: "badge" | "card";
};

const SEVERITY_STYLES: Record<string, { dot: string; text: string; border: string }> = {
  info: { dot: "bg-blue-500", text: "text-[var(--text-primary)]", border: "border-[var(--border)]" },
  warning: { dot: "bg-amber-500", text: "text-amber-600", border: "border-amber-500/30" },
  important: { dot: "bg-rose-500", text: "text-rose-600", border: "border-rose-500/30" },
};

type NotificationHistoryProps = {
  lang: Lang;
  items: NotificationItem[];
  onClose: () => void;
};

export function NotificationHistory({ lang, items, onClose }: NotificationHistoryProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set(items.length > 0 ? [items[0]?.id ?? "0"] : []));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex w-[540px] max-w-full max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell size={15} />
            <span className="text-sm font-semibold">{lang === "zh" ? "历史通知" : "Notification History"}</span>
          </div>
          <Button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-input)]">
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-xs text-[var(--text-muted)]">
              {lang === "zh" ? "暂无通知" : "No notifications"}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((n, i) => {
                const s = SEVERITY_STYLES[n.severity ?? "info"];
                const key = n.id ?? `${i}`;
                const expanded = expandedItems.has(key);
                return (
                  <div key={key} className={`rounded-lg border overflow-hidden ${s.border} bg-[var(--bg-primary)]`}>
                    {/* Header row */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(expandedItems);
                        if (expanded) next.delete(key); else next.add(key);
                        setExpandedItems(next);
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-input)]"
                    >
                      {/* Severity dot */}
                      <span className={`inline-block w-2 h-2 shrink-0 rounded-full ${s.dot}`} />
                      {/* Mode badge */}
                      {n.mode === "card" && (
                        <span className="shrink-0 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                          {lang === "zh" ? "卡片" : "Card"}
                        </span>
                      )}
                      {/* Title */}
                      <span className="flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
                        {n.title ?? "Untitled"}
                      </span>
                      {/* Date */}
                      {n.date && (
                        <span className="shrink-0 text-[10px] text-[var(--text-muted)]/60">{n.date}</span>
                      )}
                      {/* Expand arrow */}
                      <svg
                        className={`shrink-0 h-3 w-3 text-[var(--text-muted)] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>

                    {/* Expanded content */}
                    {expanded && (
                      <div className="border-t border-[var(--border)] px-2.5 py-2 space-y-1.5">
                        {n.severity && n.severity !== "info" && (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-semibold ${s.text}`}>
                              {lang === "zh"
                                ? n.severity === "warning" ? "⚠ 警告" : "🔴 重要"
                                : n.severity === "warning" ? "Warning" : "Important"}
                            </span>
                          </div>
                        )}
                        {n.body && (
                          <div className="text-[11px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
                            {n.body}
                          </div>
                        )}
                        {n.link && (
                          <a
                            href={n.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
                          >
                            <ExternalLink size={11} />
                            {t("notification_link", lang)}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
          <span>{items.length} {lang === "zh" ? "条通知" : "notifications"}</span>
          <Button variant="primary" size="sm" onClick={onClose} className="text-xs">
            {t("dialog_close", lang)}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NotificationHistory;