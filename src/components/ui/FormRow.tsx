import React from "react";

type Props = {
  label?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function FormRow({ label, children, className = "" }: Props) {
  return (
    <div className={["flex items-center gap-3", className].filter(Boolean).join(" ")}> 
      {label ? <div className="w-32 text-sm text-[var(--text-muted)]">{label}</div> : null}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default FormRow;
