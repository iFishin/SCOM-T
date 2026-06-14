import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "../ui/Button";
import { t } from "../../i18n";
import type { Lang } from "../../i18n";

const APP_VERSION = "0.1.0";

const EASTER_EGG_LINES = [
  "> Initializing handshake protocol...",
  "> Signal acquired at 115200 baud",
  "> Handshake sequence complete.",
  "> Access granted.",
];

export function AboutPanel({ lang }: { lang: Lang }) {
  const [clickCount, setClickCount] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const [revealed, setRevealed] = useState(0);

  const eggActive = revealed > 0;
  const typingDone = revealed > EASTER_EGG_LINES.length;

  const [nudging, setNudging] = useState(false);

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
            <div className="text-[11px] text-[var(--text-muted)]">v{APP_VERSION}</div>
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
              A serial communication tool rewritten with Tauri,
              suitable for development and debugging.
            </p>
            <p className="italic opacity-70 mt-1">
              ( Previously: Python edition and C++ edition &mdash;
              both archived, as is tradition. )
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
        View on GitHub
      </Button>

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
