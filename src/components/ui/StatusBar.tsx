import { Plug, Unplug, FolderOpen, Save } from "lucide-react";

type StatusBarProps = {
  isConnected: boolean;
  statusText: string;
  currentPortLabel: string;
  onOpenConfigDir?: () => void;
  configDirTooltip?: string;
  latencyMs?: number | null;
  /** Log file info for display */
  logFileName?: string | null;
  realTimeLog?: boolean;
};

export function StatusBar({
  isConnected,
  statusText,
  currentPortLabel,
  onOpenConfigDir,
  configDirTooltip,
  latencyMs,
  logFileName,
  realTimeLog,
}: StatusBarProps) {
  return (
    <footer className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs">
      <span className={`flex items-center gap-1.5 ${isConnected ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
        {isConnected
          ? <Plug size={12} className="shrink-0" />
          : <Unplug size={12} className="shrink-0" />
        }
        {statusText}
      </span>
      {latencyMs !== undefined && latencyMs !== null && (
        <span className="text-[var(--text-muted)]">
          {latencyMs < 10 ? "<10ms" : `${latencyMs}ms`}
        </span>
      )}

      {/* Log file indicator */}
      {logFileName && (
        <span className="flex items-center gap-1 text-[var(--text-muted)]" title={logFileName}>
          <span className="relative">
            <Save size={11} />
            <span
              className={`absolute -right-0.5 -top-0.5 block h-1.5 w-1.5 rounded-full ${
                realTimeLog ? "bg-[var(--accent)]" : "bg-amber-400"
              }`}
            />
          </span>
          <span className="max-w-[120px] truncate">{logFileName}</span>
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
