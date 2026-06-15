import { Wifi, WifiOff, FolderOpen } from "lucide-react";

type StatusBarProps = {
  isConnected: boolean;
  statusText: string;
  currentPortLabel: string;
  onOpenConfigDir?: () => void;
  configDirTooltip?: string;
  latencyMs?: number | null;
};

export function StatusBar({
  isConnected,
  statusText,
  currentPortLabel,
  onOpenConfigDir,
  configDirTooltip,
  latencyMs,
}: StatusBarProps) {
  return (
    <footer className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs">
      <span className={`flex items-center gap-1.5 ${isConnected ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
        {isConnected
          ? <Wifi size={12} className="shrink-0" />
          : <WifiOff size={12} className="shrink-0" />
        }
        {statusText}
      </span>
      {latencyMs !== undefined && latencyMs !== null && (
        <span className="text-[var(--text-muted)]">
          {latencyMs < 10 ? "<10ms" : `${latencyMs}ms`}
        </span>
      )}
      {onOpenConfigDir && (
        <button
          type="button"
          onClick={onOpenConfigDir}
          className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          title={configDirTooltip ?? "Open config folder"}
        >
          <FolderOpen size={12} />
        </button>
      )}
      <span className="ml-auto text-[var(--text-muted)]">{currentPortLabel}</span>
    </footer>
  );
}

export default StatusBar;
