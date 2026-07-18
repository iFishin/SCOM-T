type TagVariant = "default" | "primary" | "success" | "warning" | "danger" | "info";
type TagSize = "sm" | "md";

type TagProps = {
  variant?: TagVariant;
  size?: TagSize;
  children: React.ReactNode;
  className?: string;
  /** If true, renders as a filled badge instead of outlined */
  filled?: boolean;
};

const VARIANT_CLASS: Record<TagVariant, { outlined: string; filled: string }> = {
  default: {
    outlined: "border-[var(--border)] text-[var(--text-muted)]",
    filled: "bg-[var(--bg-input)] text-[var(--text-muted)] border-transparent",
  },
  primary: {
    outlined: "border-[var(--accent)] text-[var(--accent-dark)]",
    filled: "bg-[var(--accent)] text-white border-transparent",
  },
  success: {
    outlined: "border-emerald-300 text-emerald-700 dark:border-emerald-600 dark:text-emerald-300",
    filled: "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-800/30 dark:text-emerald-200",
  },
  warning: {
    outlined: "border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300",
    filled: "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-800/30 dark:text-amber-200",
  },
  danger: {
    outlined: "border-rose-300 text-rose-700 dark:border-rose-600 dark:text-rose-300",
    filled: "bg-rose-100 text-rose-800 border-transparent dark:bg-rose-800/30 dark:text-rose-200",
  },
  info: {
    outlined: "border-sky-300 text-sky-700 dark:border-sky-600 dark:text-sky-300",
    filled: "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-800/30 dark:text-sky-200",
  },
};

export function Tag({
  variant = "default",
  size = "sm",
  children,
  className = "",
  filled = false,
}: TagProps) {
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
  const colors = filled ? VARIANT_CLASS[variant].filled : VARIANT_CLASS[variant].outlined;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-semibold uppercase leading-none ${sizeClass} ${colors} ${className}`}
    >
      {children}
    </span>
  );
}

export default Tag;
