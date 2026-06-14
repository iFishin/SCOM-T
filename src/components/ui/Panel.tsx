import React from "react";

type Props = {
  as?: React.ElementType;
  className?: string;
} & React.HTMLAttributes<HTMLElement>;

export const Panel = React.forwardRef<HTMLElement, Props>(function Panel({ as: Component = "div", className = "", children, ...rest }, ref) {
  const Comp = Component as any;
  const cls = ["panel", className].filter(Boolean).join(" ");
  return (
    <Comp ref={ref as any} className={cls} {...(rest as any)}>
      {children}
    </Comp>
  );
});

Panel.displayName = "Panel";

export default Panel;
