import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
  size?: "sm" | "md";
};

export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "default", size = "md", className = "", children, type = "button", ...rest },
  ref
) {
  // Base classes aim to work with global .btn/.btn-primary CSS tokens
  const base = "btn";
  const variantClass = variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "";
  const sizeClass = size === "sm" ? "text-xs" : "text-sm";
  const cls = [base, variantClass, sizeClass, className].filter(Boolean).join(" ");

  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {children}
    </button>
  );
});

export default Button;
