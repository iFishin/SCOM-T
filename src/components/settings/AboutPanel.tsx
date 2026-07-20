import { useState, useEffect, useMemo } from "react";
import { ExternalLink, RefreshCw, Download, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";

const BUILD_TIME = __BUILD_TIME__;

const GITHUB_REPO = "iFishin/SCOM-T";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "latest" }
  | { status: "available"; version: string; url: string; body: string }
  | { status: "error"; message: string };

function formatBuildTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

const EASTER_EGG_LINES = [
  "> Initializing handshake protocol...",
  "> Signal acquired at 115200 baud",
  "> Handshake sequence complete.",
  "> Access granted.",
];

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
};

const SEVERITY_STYLES: Record<string, { dot: string; text: string; border: string; label: string }> = {
  info: {
    dot: "bg-blue-500",
    text: "text-[var(--text-primary)]",
    border: "border-[var(--border)]",
    label: "Info",
  },
  warning: {
    dot: "bg-amber-500",
    text: "text-amber-600",
    border: "border-amber-500/30",
    label: "Warning",
  },
  important: {
    dot: "bg-rose-500",
    text: "text-rose-600",
    border: "border-rose-500/30",
    label: "Important",
  },
};

const DEFAULT_NOTIFICATION_URL = "https://raw.githubusercontent.com/iFishin/notifications/main/scom-t/notifications.json";

export function AboutPanel({ lang }: { lang: Lang }) {
  const [version, setVersion] = useState("0.1.0");
  const [clickCount, setClickCount] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const [revealed, setRevealed] = useState(0);

  const eggActive = revealed > 0;
  const typingDone = revealed > EASTER_EGG_LINES.length;

  const [nudging, setNudging] = useState(false);

  const [updateCheck, setUpdateCheck] = useState<CheckState>({ status: "idle" });

  const [rawItems, setRawItems] = useState<NotificationItem[]>([]);
  const [notificationError, setNotificationError] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [seenIds, setSeenIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("scom_t_notification_seen");
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });

  useEffect(() => {
    let cancelled = false;
    fetch(DEFAULT_NOTIFICATION_URL)
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        if (data) {
          // Normalize: single object or array
          const list: NotificationItem[] = Array.isArray(data) ? data : [data];
          const valid = list.filter((n) => n.title || n.body);
          setRawItems(valid);
          setNotificationError(valid.length === 0);
        } else {
          setRawItems([]);
          setNotificationError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNotificationError(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Filter by version range, keep only the latest 3
  const displayItems = useMemo(() => {
    return rawItems
      .filter((item) => {
        if (item.minVersion && compareVersion(version, item.minVersion) < 0) return false;
        if (item.maxVersion && compareVersion(version, item.maxVersion) > 0) return false;
        return true;
      })
      .slice(0, 3);
  }, [rawItems, version]);

  // Mark once-type notifications as seen when displayed
  useEffect(() => {
    const newIds = new Set(seenIds);
    let changed = false;
    for (const item of displayItems) {
      if (item.display === "once" && item.id && !newIds.has(item.id)) {
        newIds.add(item.id);
        changed = true;
      }
    }
    if (changed) {
      try {
        localStorage.setItem("scom_t_notification_seen", JSON.stringify([...newIds]));
      } catch { /* quota exceeded, ignore */ }
      setSeenIds(newIds);
    }
  }, [displayItems]);

  // Expand first notification by default
  useEffect(() => {
    if (displayItems.length > 0) {
      const firstKey = displayItems[0].id ?? "0";
      setExpandedItems((prev) => prev.has(firstKey) ? prev : new Set([firstKey]));
    }
  }, [displayItems]);

  async function checkForUpdate() {
    setUpdateCheck({ status: "checking" });
    try {
      const res = await fetch(GITHUB_API);
      if (!res.ok) {
        setUpdateCheck({ status: "error", message: `GitHub API: ${res.status} ${res.statusText}` });
        return;
      }
      const data = await res.json();
      const latestTag: string = (data.tag_name || "").replace(/^v/, "");
      const currentVer = version.replace(/^v/, "");
      if (compareVersion(latestTag, currentVer) > 0) {
        setUpdateCheck({
          status: "available",
          version: latestTag,
          url: data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
          body: data.body || "",
        });
      } else {
        setUpdateCheck({ status: "latest" });
      }
    } catch (err) {
      setUpdateCheck({ status: "error", message: String(err) });
    }
  }

  /** Compare semver strings, returns >0 if a > b */
  function compareVersion(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  useEffect(() => {
    if (clickCount > 0) return; // already discovered — stop hinting

    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const delay = 2000 + Math.random() * 3000; // 2-5s
      timer = setTimeout(() => {
        setNudging(true);
        setTimeout(() => setNudging(false), 1100); // match animation duration
        schedule();
      }, delay);
    };

    schedule();

    return () => clearTimeout(timer);
  }, [clickCount]);

  useEffect(() => {
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch {
        // not in Tauri context (dev), keep default
      }
    })();
  }, []);

  const handleLogoClick = () => {
    if (typingDone) return;

    const next = clickCount + 1;
    setClickCount(next);
    setShakeKey((k) => k + 1);

    if (next >= 3 && revealed === 0) {
      setTimeout(() => setGlitching(true), 420);
      setTimeout(() => setGlitching(false), 770);

      setTimeout(() => {
        const total = EASTER_EGG_LINES.length + 1;
        for (let i = 1; i <= total; i++) {
          setTimeout(() => setRevealed(i), i * 350);
        }
      }, 820);
    }
  };

  const shakeClass =
    shakeKey > 0
      ? clickCount >= 3
        ? "shake-intense"
        : clickCount === 2
          ? "shake-medium"
          : "shake-subtle"
      : "";

  return (
    <div className="flex flex-col gap-5 py-2">
      {/* ── Horizontal split: icon (left) + info (right) ── */}
      <div className="flex gap-6 items-start">
        {/* Left: icon + name + version */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <span key={shakeKey} className="inline-block">
            <img
              src="/favicon.png"
              alt="SCOM-T"
              onClick={handleLogoClick}
              className={`w-24 h-24 rounded-2xl transition-shadow duration-300 select-none
                ${nudging ? "welcome-nudge" : ""}
                ${shakeClass}
                ${glitching ? "glitch" : ""}
                ${eggActive ? "shadow-lg shadow-[var(--accent)]/25" : "shadow-sm"}
                hover:shadow-md hover:scale-105 cursor-pointer`}
            />
          </span>
          <div className="text-center">
            <div className="text-lg font-bold tracking-tight">SCOM-T</div>
            <div className="text-[11px] text-[var(--text-muted)]">v{version}</div>
            <div className="text-[10px] text-[var(--text-muted)]/60">{formatBuildTime(BUILD_TIME)}</div>
          </div>
        </div>

        {/* Right: author, repo, description */}
        <div className="flex flex-col gap-3 min-w-0 pt-0.5">
          {/* Info grid */}
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs items-center">
            <span className="text-[var(--text-muted)]">Author</span>
            <span className="font-medium text-[var(--text-primary)]">iFsihin</span>
            <span className="text-[var(--text-muted)]">Repository</span>
            <span className="font-medium text-[var(--text-primary)] truncate min-w-0">
              github.com/iFishin/SCOM-T
            </span>
          </div>

          {/* Description */}
          <div className="text-xs text-[var(--text-muted)] leading-relaxed">
            <p>
              {t("scom_t_description_1", lang)}
            </p>
            <p className="italic opacity-70 mt-1">
              {t("scom_t_description_2", lang)}
            </p>
          </div>
        </div>
      </div>

      {/* ── GitHub button ── */}
      <Button
        variant="primary"
        onClick={() => window.open("https://github.com/iFishin/SCOM-T", "_blank")}
        className="w-full justify-center gap-2"
      >
        <ExternalLink size={14} />
        {t("scom_t_view_on_github", lang)}
      </Button>

      {/* ── Notification (from default URL) ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-3">
          <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">
            {t("notification", lang)}
          </div>
          {notificationError && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-500">
              <AlertCircle size={12} />
              {t("notification_fetch_error", lang)}
            </div>
          )}
          {rawItems.length === 0 && !notificationError && (
            <div className="text-[11px] text-[var(--text-muted)] animate-pulse">
              {t("notification_loading", lang)}
            </div>
          )}
          {displayItems.length > 0 && (
            <div className="flex flex-col gap-2">
              {displayItems.map((n, i) => {
                const s = SEVERITY_STYLES[n.severity ?? "info"];
                const key = n.id ?? `${i}`;
                const expanded = expandedItems.has(key);
                return (
                  <div
                    key={key}
                    className={`rounded-lg border overflow-hidden ${s.border} bg-[var(--bg-primary)]`}
                  >
                    {/* Header row — always visible, click to toggle */}
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
                                : s.label}
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
          {rawItems.length > 0 && displayItems.length === 0 && !notificationError && (
            <div className="text-[11px] text-[var(--text-muted)]">
              {lang === "zh" ? "暂无通知" : "No notifications"}
            </div>
          )}
        </div>

      {/* ── Update check ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {t("update_check", lang)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={checkForUpdate}
            disabled={updateCheck.status === "checking"}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw size={12} className={updateCheck.status === "checking" ? "animate-spin" : ""} />
            {t("update_check_btn", lang)}
          </Button>
        </div>

        {updateCheck.status === "checking" && (
          <div className="mt-2 text-[11px] text-[var(--text-muted)] animate-pulse">
            {t("update_checking", lang)}
          </div>
        )}

        {updateCheck.status === "latest" && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600">
            <CheckCircle size={12} />
            {t("update_latest", lang)} (v{version})
          </div>
        )}

        {updateCheck.status === "available" && (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <Download size={13} />
              {t("update_available", lang)} v{updateCheck.version}
            </div>
            {updateCheck.body && (
              <div className="mt-1 max-h-20 overflow-y-auto text-[10px] text-emerald-600/80 leading-relaxed whitespace-pre-wrap">
                {updateCheck.body}
              </div>
            )}
            <div className="mt-1.5 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => window.open(updateCheck.url, "_blank")}
                className="flex items-center gap-1 text-[10px]"
              >
                <Download size={11} />
                {t("update_download", lang)}
              </Button>
            </div>
          </div>
        )}

        {updateCheck.status === "error" && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-rose-500">
            <AlertCircle size={12} />
            {t("update_error", lang)}: {updateCheck.message}
          </div>
        )}
      </div>

      {/* ── Easter egg (retro terminal) ── */}
      <div
        className={`w-full overflow-hidden transition-all duration-500 ease-in-out
          ${eggActive ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="rounded-xl border border-[var(--border)] bg-[#0f172a] p-3.5 font-mono text-xs leading-relaxed shadow-inner">
          {EASTER_EGG_LINES.slice(0, revealed).map((line, i) => (
            <div key={i} className="text-slate-300">
              {line}
            </div>
          ))}

          {revealed > EASTER_EGG_LINES.length && (
            <div className="mt-2.5 border-t border-[var(--border)] pt-2.5 font-sans text-[11px] leading-relaxed text-[var(--text-muted)] not-italic">
              {t("developer_text", lang)}
            </div>
          )}

          {eggActive && !typingDone && (
            <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse ml-0.5 align-middle" />
          )}

          {typingDone && (
            <div className="mt-2 text-center text-[10px] text-[var(--text-muted)]/40">
              // end of transmission
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AboutPanel;
