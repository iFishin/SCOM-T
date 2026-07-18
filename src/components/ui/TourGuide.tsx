import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./Button";

export type TourStep = {
  /** CSS selector of the element to highlight */
  target: string;
  title: string;
  content: string;
  /** Preferred tooltip placement (auto-adjusted if off-screen) */
  placement?: "bottom" | "top" | "left" | "right";
};

type TourGuideProps = {
  steps: TourStep[];
  lang: "zh" | "en";
  onFinish: () => void;
  onSkip: () => void;
};

const LABELS: Record<string, Record<string, string>> = {
  zh: { prev: "上一步", next: "下一步", skip: "跳过引导", done: "完成" },
  en: { prev: "Previous", next: "Next", skip: "Skip", done: "Done" },
};

export function TourGuide({ steps, lang, onFinish, onSkip }: TourGuideProps) {
  const [current, setCurrent] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef(true);
  const step = steps[current];
  const isLast = current === steps.length - 1;
  const L = LABELS[lang];

  // ── Measure target element ──
  const measure = useCallback(() => {
    const el = document.querySelector(step.target);
    if (!el) return setRect(null);
    setRect(el.getBoundingClientRect());
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch { /* ignore */ }
  }, [step.target]);

  useEffect(() => {
    mountRef.current = true;
    measure();
    let timer: ReturnType<typeof setTimeout>;
    const handle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (mountRef.current) measure(); }, 80);
    };
    window.addEventListener("scroll", handle, { capture: true, passive: true });
    window.addEventListener("resize", handle, { passive: true });
    return () => {
      mountRef.current = false;
      clearTimeout(timer);
      window.removeEventListener("scroll", handle, { capture: true });
      window.removeEventListener("resize", handle);
    };
  }, [measure]);

  // ── Keyboard: Escape=skip, ← → = navigate, Enter=finish ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onSkip(); return; }
      if (e.key === "ArrowRight" && !isLast) setCurrent((c) => c + 1);
      if (e.key === "ArrowLeft" && current > 0) setCurrent((c) => c - 1);
      if (e.key === "Enter" && isLast) onFinish();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [current, isLast, onSkip, onFinish]);

  // ── Compute tooltip position ──
  const tooltipStyle: React.CSSProperties = {};
  if (rect) {
    const gap = 10;
    const ww = window.innerWidth;
    const wh = window.innerHeight;

    switch (step.placement || "bottom") {
      case "bottom":
        tooltipStyle.top = Math.min(rect.bottom + gap, wh - 140);
        tooltipStyle.left = Math.max(10, Math.min(rect.left + rect.width / 2 - 160, ww - 340));
        break;
      case "top":
        tooltipStyle.left = Math.max(10, Math.min(rect.left + rect.width / 2 - 160, ww - 340));
        tooltipStyle.bottom = wh - Math.max(rect.top - gap, 10);
        break;
      case "left":
        tooltipStyle.top = Math.max(10, Math.min(rect.top + rect.height / 2 - 70, wh - 160));
        tooltipStyle.right = ww - Math.min(rect.left - gap, ww - 10);
        break;
      case "right":
        tooltipStyle.top = Math.max(10, Math.min(rect.top + rect.height / 2 - 70, wh - 160));
        tooltipStyle.left = Math.min(rect.right + gap, ww - 340);
        break;
    }
  }

  return (
    /* ── Overlay — pointer-events: none so clicks pass through ── */
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}
    >
      {/* Highlight window — transparent center, dark shadow around */}
      {rect && (
        <div
          style={{
            position: "absolute",
            left: rect.left - 8,
            top: rect.top - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            border: "2px solid var(--accent)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Step badge */}
      {rect && (
        <div
          style={{
            position: "absolute",
            left: rect.left - 8,
            top: rect.top - 24,
            pointerEvents: "none",
          }}
          className="text-[10px] font-semibold tracking-wider text-[var(--accent)]"
        >
          {current + 1} / {steps.length}
        </div>
      )}

      {/* ── Tooltip card ── */}
      {rect ? (
        <div
          ref={tooltipRef}
          style={{ position: "fixed", width: 320, pointerEvents: "auto", ...tooltipStyle }}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-xl"
        >
          <div className="px-4 pb-2 pt-3.5">
            <div className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
              {step.title}
            </div>
            <div className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">
              {step.content}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
            <button
              type="button"
              onClick={onSkip}
              className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              {L.skip}
            </button>
            <div className="flex items-center gap-1.5">
              {current > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setCurrent((c) => c - 1)} className="text-xs">
                  {L.prev}
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => (isLast ? onFinish() : setCurrent((c) => c + 1))}
                className="text-xs"
              >
                {isLast ? L.done : L.next}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Fallback — centered card when target not found */
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 360,
            pointerEvents: "auto",
          }}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-xl"
        >
          <div className="px-4 pb-2 pt-3.5">
            <div className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
              {step.title}
            </div>
            <div className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-muted)]">
              {step.content}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
            <button
              type="button"
              onClick={onSkip}
              className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              {L.skip}
            </button>
            <div className="flex items-center gap-1.5">
              {current > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setCurrent((c) => c - 1)} className="text-xs">
                  {L.prev}
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => (isLast ? onFinish() : setCurrent((c) => c + 1))}
                className="text-xs"
              >
                {isLast ? L.done : L.next}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TourGuide;
