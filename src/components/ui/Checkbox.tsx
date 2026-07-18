import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode;
  className?: string;
};

export const Checkbox = React.forwardRef<HTMLInputElement, Props>(function Checkbox(
  { label, className = "", ...rest },
  ref
) {
  return (
    <label className={["checkbox-wrap", className].filter(Boolean).join(" ")}>
      <input ref={ref} type="checkbox" {...rest} />
      <span className="checkbox-box" aria-hidden>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      {label ? <span className="text-sm text-[var(--text-primary)]">{label}</span> : null}
    </label>
  );
});

export default Checkbox;
