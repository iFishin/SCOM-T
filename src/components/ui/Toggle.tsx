type ToggleProps = {
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function Toggle({ checked, onChange, disabled, className = "" }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange && onChange(!checked)}
      className={[
        "inline-flex items-center",
        "h-6 w-11 rounded-full p-0.5 transition-colors duration-150",
        checked ? "bg-[var(--accent)]" : "bg-[var(--bg-input)] border border-[var(--border)]",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        "focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "bg-white rounded-full w-4 h-4 shadow transform transition-transform duration-150",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

export default Toggle;
