type DividerProps = {
  className?: string;
  orientation?: "horizontal" | "vertical";
};

export function Divider({ className = "", orientation = "horizontal" }: DividerProps) {
  return (
    <hr
      className={`border-[var(--border)] ${
        orientation === "vertical"
          ? "mx-1 inline-block h-4 w-px self-center border-0 bg-[var(--border)]"
          : "my-1 w-full border-t"
      } ${className}`}
    />
  );
}

export default Divider;
