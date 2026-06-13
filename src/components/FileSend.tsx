import { FolderOpen, File, Send } from "lucide-react";
import type { ToastType } from "./Toast.tsx";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";

type Props = {
  filePath: string;
  fileSendProgress: number | null;
  isBusy: boolean;
  lang: Lang;
  isConnected: boolean;
  onFileSelect: () => void;
  onFileSend: () => Promise<void>;
  onPushToast: (text: string, type?: ToastType) => void;
};

export function FileSend({
  filePath,
  fileSendProgress,
  isBusy,
  lang,
  isConnected,
  onFileSelect,
  onFileSend,
  onPushToast,
}: Props) {
  const isSendingFile = fileSendProgress !== null;

  function handleFileSend() {
    if (!isConnected) { onPushToast(t("toast_not_connected", lang), "warn"); return; }
    if (!filePath) { onPushToast(t("toast_select_file", lang), "warn"); return; }
    void onFileSend();
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-2">
      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        <File size={11} />
        {t("file", lang)}
      </div>
      <div className="flex gap-1.5">
        <div className="flex flex-1 items-center gap-1 overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5">
          <span className="truncate text-xs text-[var(--text-muted)]">{filePath || t("no_file", lang)}</span>
        </div>
        <button
          type="button"
          onClick={onFileSelect}
          disabled={isBusy}
          title={lang === "zh" ? "选择文件" : "Select file"}
          className="flex items-center gap-1 rounded border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
        >
          <FolderOpen size={13} />
        </button>
        <button
          type="button"
          onClick={handleFileSend}
          disabled={isBusy}
          className="flex items-center gap-1 rounded bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
        >
          <Send size={12} />
        </button>
      </div>
      {isSendingFile && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-input)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-100"
            style={{ width: `${fileSendProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}
