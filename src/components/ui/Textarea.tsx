import React from "react";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  props,
  ref
) {
  const { className = "", ...rest } = props;
  const cls = ["textarea", className].filter(Boolean).join(" ");
  return <textarea ref={ref} className={cls} {...rest} />;
});

export default Textarea;
