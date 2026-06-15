import { useEffect, useRef, useCallback } from "react";

export type ContextMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  separator?: boolean;
  onClick: () => void;
};

type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const focusable = listRef.current?.querySelectorAll<HTMLButtonElement>(
          "li:not(.separator) button:not(:disabled)",
        );
        if (!focusable || focusable.length === 0) return;
        const current = document.activeElement;
        let idx = Array.from(focusable).indexOf(current as HTMLButtonElement);
        idx = e.key === "ArrowDown" ? (idx + 1) % focusable.length : (idx - 1 + focusable.length) % focusable.length;
        focusable[idx]?.focus();
      }
      if (e.key === "Enter") {
        (document.activeElement as HTMLButtonElement)?.click();
      }
    },
    [onClose],
  );

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    // Clamp position to viewport
    const rect = menu.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, clampedX)}px`;
    menu.style.top = `${Math.max(8, clampedY)}px`;

    // Focus first item
    requestAnimationFrame(() => {
      const first = listRef.current?.querySelector<HTMLButtonElement>(
        "li:not(.separator) button:not(:disabled)",
      );
      first?.focus();
    });

    // Global click outside listener
    const handleClick = (e: MouseEvent) => {
      if (menu && !menu.contains(e.target as Node)) {
        onClose();
      }
    };
    // Also close on contextmenu elsewhere
    const handleContext = (e: MouseEvent) => {
      if (menu && !menu.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClick, true);
    document.addEventListener("contextmenu", handleContext, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("contextmenu", handleContext, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [x, y, onClose, handleKeyDown]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[9999] min-w-40 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] py-1 shadow-xl"
      style={{ left: x, top: y }}
    >
      <ul ref={listRef} className="m-0 list-none p-0">
        {items.map((item) =>
          item.separator ? (
            <li key={item.id} className="separator my-1 border-t border-[var(--border)]" />
          ) : (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-input)] disabled:opacity-30 disabled:cursor-not-allowed focus:bg-[var(--bg-input)] focus:outline-none"
              >
                {item.label}
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
