import React from "react";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  props,
  ref
) {
  const { className = "", ...rest } = props;
  const cls = ["select", className].filter(Boolean).join(" ");
  return <select ref={ref} className={cls} {...rest} />;
});

export default Select;
