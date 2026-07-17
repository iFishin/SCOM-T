import { useState, useEffect } from "react";
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

type NotificationData = {
  title?: string;
  body?: string;
  severity?: "info" | "warning" | "important";
  link?: string;
  date?: string;
};

export function AboutPanel({ lang, notificationUrl }: { lang: Lang; notificationUrl?: string }) {
  const [version, setVersion] = useState("0.1.0");
  const [clickCount, setClickCount] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const [revealed, setRevealed] = useState(0);

  const eggActive = revealed > 0;
  const typingDone = revealed > EASTER_EGG_LINES.length;

  const [nudging, setNudging] = useState(false);

  const [updateCheck, setUpdateCheck] = useState<CheckState>({ status: "idle" });

  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [notificationError, setNotificationError] = useState(false);

  useEffect(() => {
    if (!notificationUrl) {
      setNotification(null);
      setNotificationError(false);
      return;
    }
    let cancelled = false;
    fetch(notificationUrl)
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        if (data && (data.title || data.body)) {
          setNotification(data as NotificationData);
          setNotificationError(false);
        } else {
          setNotification(null);
          setNotificationError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNotificationError(true);
      });
    return () => { cancelled = true; };
  }, [notificationUrl]);

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

      {/* ── Notification (custom URL) ── */}
      {notificationUrl && (
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
          {!notification && !notificationError && (
            <div className="text-[11px] text-[var(--text-muted)] animate-pulse">
              {t("notification_loading", lang)}
            </div>
          )}
          {notification && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2.5">
              {notification.date && (
                <div className="text-[10px] text-[var(--text-muted)]/60 mb-1">{notification.date}</div>
              )}
              {notification.title && (
                <div className="text-xs font-semibold text-[var(--text-primary)] mb-1">{notification.title}</div>
              )}
              {notification.body && (
                <div className="text-[11px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
                  {notification.body}
                </div>
              )}
              {notification.link && (
                <a
                  href={notification.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
                >
                  <ExternalLink size={11} />
                  {t("notification_link", lang)}
                </a>
              )}
            </div>
          )}
        </div>
      )}

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
