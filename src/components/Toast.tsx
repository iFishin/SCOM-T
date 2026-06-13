import { useEffect, useState } from "react";

export type ToastType = "error" | "warn" | "success" | "info";

export type ToastMessage = {
  id: string;
  type: ToastType;
  text: string;
};

const ICONS: Record<ToastType, string> = {
  error: "✕",
  warn: "⚠",
  success: "✓",
  info: "ℹ",
};

const COLORS: Record<ToastType, string> = {
  error:
    "border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-[#2a1018] dark:text-rose-200",
  warn:
    "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-[#1e1608] dark:text-amber-200",
  success:
    "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-[#0c1e14] dark:text-emerald-200",
  info:
    "border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-[#071420] dark:text-sky-200",
};

const ICON_COLORS: Record<ToastType, string> = {
  error: "text-rose-500",
  warn: "text-amber-500",
  success: "text-emerald-500",
  info: "text-sky-500",
};

const AUTO_CLOSE_MS = 4000;

function ToastItem({
  toast,
  onClose,
}: {
  toast: ToastMessage;
  onClose: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onClose(toast.id), 300);
    }, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <div
      className={`
        flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg
        transition-all duration-300
        ${visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}
        ${COLORS[toast.type]}
      `}
    >
      <span className={`mt-0.5 shrink-0 font-bold ${ICON_COLORS[toast.type]}`}>
        {ICONS[toast.type]}
      </span>
      <span className="flex-1 leading-snug">{toast.text}</span>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          setTimeout(() => onClose(toast.id), 300);
        }}
        className="ml-1 shrink-0 opacity-50 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onClose }: {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}

/** Hook — call pushToast() to show a new notification */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(text: string, type: ToastType = "error") {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
  }

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, pushToast, removeToast };
}
