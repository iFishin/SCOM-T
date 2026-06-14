import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: number;
};

export const IconButton = React.forwardRef<HTMLButtonElement, Props>(function IconButton(
  { children, size = 16, className = "", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={[
        "inline-flex items-center justify-center rounded-[var(--radius-md)] p-1",
        "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-dark)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1",
        "transition-colors duration-150",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;
