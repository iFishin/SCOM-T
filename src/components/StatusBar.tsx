import { Wifi, WifiOff } from "lucide-react";

type StatusBarProps = {
  isConnected: boolean;
  statusText: string;
  currentPortLabel: string;
};

export function StatusBar({ isConnected, statusText, currentPortLabel }: StatusBarProps) {
  return (
    <footer className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs">
      <span className={`flex items-center gap-1.5 ${isConnected ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
        {isConnected
          ? <Wifi size={12} className="shrink-0" />
          : <WifiOff size={12} className="shrink-0" />
        }
        {statusText}
      </span>
      <span className="ml-auto text-[var(--text-muted)]">{currentPortLabel}</span>
    </footer>
  );
}
