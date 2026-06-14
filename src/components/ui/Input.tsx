import React from "react";

export const Input = React.forwardRef(function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>,
  ref: React.ForwardedRef<HTMLInputElement>
) {
  const { className = "", ...rest } = props;
  const cls = ["input", className].filter(Boolean).join(" ");
  return <input ref={ref} className={cls} {...rest} />;
});

export default Input;
