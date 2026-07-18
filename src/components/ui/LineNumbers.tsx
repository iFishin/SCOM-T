import { useMemo } from "react";

type LineNumbersProps = {
  text: string;
  className?: string;
};

/**
 * Renders line numbers for a block of text.
 * Syncs scroll with a companion textarea via a connected scroll container.
 * Pass through scroll container ref via the parent.
 */
export function LineNumbers({ text, className = "" }: LineNumbersProps) {
  const lines = useMemo(() => text.split("\n"), [text]);

  return (
    <div
      className={`pointer-events-none select-none overflow-hidden border-r border-[var(--border)] bg-[var(--bg-input)] py-2 text-right font-mono text-xs leading-relaxed text-[var(--text-muted)] ${className}`}
      style={{
        minWidth: `${Math.max(3, String(lines.length).length + 1)}ch`,
        paddingRight: "0.5rem",
        paddingLeft: "0.5rem",
      }}
      aria-hidden
    >
      {lines.map((_, i) => (
        <div key={i}>{i + 1}</div>
      ))}
    </div>
  );
}

export default LineNumbers;
