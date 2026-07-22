import { Component } from "react";
import { appLogger } from "../../utils/appLogger.ts";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
  info: string;
  countdown: number;
};

/**
 * Catches rendering errors (white screen) and logs them via appLogger.
 * Shows a fallback UI with:
 * - Error details
 * - Countdown auto-reload (15s)
 * - Manual reload button
 * - Copy error info button
 */
export class ErrorBoundary extends Component<Props, State> {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, info: "", countdown: 15 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const stack = info.componentStack ?? "";
    appLogger.error("React", `Render error: ${error.message}\n${stack}`);
    this.setState({ info: stack });

    // Auto-reload countdown
    this.timer = setInterval(() => {
      this.setState((s) => {
        if (s.countdown <= 1) {
          this.reload();
          return { countdown: 0 };
        }
        return { countdown: s.countdown - 1 };
      });
    }, 1000);
  }

  componentWillUnmount() {
    if (this.timer) clearInterval(this.timer);
  }

  reload = () => {
    window.location.reload();
  };

  copyErrorInfo = () => {
    const text = `Error: ${this.state.error?.message}\nStack: ${this.state.info}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] p-8">
          <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/30">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e81123" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <div className="text-lg font-semibold text-[var(--text-primary)]">
            SCOM-T 遇到问题
          </div>

          <div className="max-w-md text-center text-sm text-[var(--text-muted)]">
            程序发生了渲染异常，已在日志中记录。{this.state.countdown > 0
              ? `${this.state.countdown}s 后将自动重新加载`
              : "请点击下方按钮重新加载"}
          </div>

          {this.state.error && (
            <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {this.state.error.message}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={this.reload}
              className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            >
              立即重新加载
            </button>
            <button
              onClick={this.copyErrorInfo}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              复制错误信息
            </button>
          </div>

          {/* ── System tray fallback hint ── */}
          <div className="mt-4 text-center text-[11px] text-[var(--text-muted)] opacity-50">
            如果无法恢复，右键系统托盘图标 → 重新加载
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
