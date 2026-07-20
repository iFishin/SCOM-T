import { forwardRef, useMemo } from "react";

type LineNumbersProps = {
  text: string;
  className?: string;
  /** 1-indexed line number to highlight (cursor row) */
  activeLine?: number;
};

/**
 * Renders line numbers for a block of text.
 * The root element is the scroll container — set its scrollTop
 * to sync with a companion textarea.
 */
export const LineNumbers = forwardRef<HTMLDivElement, LineNumbersProps>(
  function LineNumbers({ text, className = "", activeLine }: LineNumbersProps, ref) {
    const lines = useMemo(() => text.split("\n"), [text]);

    return (
      <div
        ref={ref}
        className={`pointer-events-none select-none overflow-hidden border-r border-[var(--border)] bg-[var(--bg-input)] py-2 text-right font-mono text-xs leading-[20px] text-[var(--text-muted)] ${className}`}
        style={{
          minWidth: `${Math.max(3, String(lines.length).length + 1)}ch`,
          paddingRight: "0.5rem",
          paddingLeft: "0.5rem",
        }}
        aria-hidden
      >
        {lines.map((_, i) => {
          const lineNum = i + 1;
          return (
            <div
              key={i}
              className={
                lineNum === activeLine
                  ? "bg-[var(--accent)]/10 text-[var(--accent-dark)] font-bold"
                  : ""
              }
            >
              {lineNum}
            </div>
          );
        })}
      </div>
    );
  },
);

export default LineNumbers;
