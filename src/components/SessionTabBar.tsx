import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Lang } from "../i18n";
import type { SerialSession } from "../hooks/useSessionManager";
import { ContextMenu, type ContextMenuItem } from "./ui/ContextMenu.tsx";

type SessionTabBarProps = {
  sessions: SerialSession[];
  activeSessionId: string;
  maxSessions: number;
  lang: Lang;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onReorder: (draggedId: string, targetId: string) => void;
};

export function SessionTabBar({
  sessions,
  activeSessionId,
  maxSessions,
  lang,
  onSelect,
  onClose,
  onCreate,
  onRename,
  onReorder,
}: SessionTabBarProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rectsRef = useRef<Record<string, DOMRect>>({});
  const dragOffsetRef = useRef(0);
  const lastReorderAtRef = useRef(0);

  function handleContextMenu(e: React.MouseEvent, sessionId: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, sessionId });
  }

  const ctxMenuItems: ContextMenuItem[] = ctxMenu ? [
    {
      id: "rename",
      label: lang === "zh" ? "重命名" : "Rename",
      onClick: () => {
        setEditingSessionId(ctxMenu.sessionId);
        setCtxMenu(null);
      },
    },
    {
      id: "close",
      label: lang === "zh" ? "关闭" : "Close",
      disabled: sessions.length <= 1,
      onClick: () => {
        onClose(ctxMenu.sessionId);
        setCtxMenu(null);
      },
    },
  ] : [];

  // FLIP animation: whenever the session order changes, the tabs that moved
  // (excluding the one currently being dragged, which follows the pointer)
  // animate from their previous screen position to the new one instead of
  // snapping instantly — this is what makes reordering feel smooth.
  useLayoutEffect(() => {
    const prevRects = rectsRef.current;
    const nextRects: Record<string, DOMRect> = {};
    sessions.forEach((s) => {
      const el = tabRefs.current[s.id];
      if (el) nextRects[s.id] = el.getBoundingClientRect();
    });
    sessions.forEach((s) => {
      if (s.id === draggingIdRef.current) return;
      const el = tabRefs.current[s.id];
      const prev = prevRects[s.id];
      const next = nextRects[s.id];
      if (!el || !prev || !next) return;
      const dx = prev.left - next.left;
      if (Math.abs(dx) < 0.5) return;
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 160ms ease";
        el.style.transform = "";
      });
    });
    rectsRef.current = nextRects;
  }, [sessions]);

  function findTabIdAt(x: number, y: number): string | undefined {
    const container = containerRef.current;
    if (!container) return undefined;
    const tabEls = container.querySelectorAll<HTMLElement>("[data-session-tab-id]");
    for (const tabEl of tabEls) {
      const r = tabEl.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return tabEl.dataset.sessionTabId;
      }
    }
    return undefined;
  }

  function handlePointerDown(e: React.PointerEvent, sessionId: string) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    const initialRect = tabRefs.current[sessionId]?.getBoundingClientRect();
    const grabOffsetX = startX - (initialRect?.left ?? startX);
    dragOffsetRef.current = 0;

    function onMove(ev: PointerEvent) {
      if (!started) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
        started = true;
        suppressClickRef.current = true;
        draggingIdRef.current = sessionId;
        setDraggingId(sessionId);
      }
      const draggedEl = tabRefs.current[sessionId];
      if (draggedEl) {
        // Rebase against the tab's *current* rect (minus whatever transform we
        // already applied) rather than the pointer-down origin — a live reorder
        // shifts the tab's underlying flex position, and without rebasing here
        // that layout shift stacks on top of the transform, causing a jump.
        const rect = draggedEl.getBoundingClientRect();
        const baseLeft = rect.left - dragOffsetRef.current;
        const desiredLeft = ev.clientX - grabOffsetX;
        dragOffsetRef.current = desiredLeft - baseLeft;
        draggedEl.style.transition = "none";
        draggedEl.style.transform = `translateX(${dragOffsetRef.current}px)`;
      }
      const overId = findTabIdAt(ev.clientX, ev.clientY);
      if (overId && overId !== draggingIdRef.current) {
        setDragOverId(overId);
        // Live reorder as the dragged tab crosses a neighbor, throttled so it
        // doesn't thrash — this is what makes the drag feel like it's actually
        // carrying the tab through the list rather than only resolving on drop.
        const now = performance.now();
        if (now - lastReorderAtRef.current > 120) {
          lastReorderAtRef.current = now;
          onReorder(sessionId, overId);
        }
      } else if (!overId) {
        setDragOverId(null);
      }
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const draggedEl = tabRefs.current[sessionId];
      if (draggedEl) {
        draggedEl.style.transition = "transform 120ms ease";
        draggedEl.style.transform = "";
      }
      if (started) {
        const overId = findTabIdAt(ev.clientX, ev.clientY);
        if (overId && overId !== sessionId) {
          onReorder(sessionId, overId);
        }
      }
      draggingIdRef.current = null;
      setDraggingId(null);
      setDragOverId(null);
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div ref={containerRef} className="flex items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-input)] shrink-0 overflow-x-auto">
      {sessions.map((session) => (
        <SessionTab
          key={session.id}
          ref={(el) => { tabRefs.current[session.id] = el; }}
          session={session}
          isActive={session.id === activeSessionId}
          canClose={sessions.length > 1}
          lang={lang}
          onSelect={() => { if (!suppressClickRef.current) onSelect(session.id); }}
          onClose={() => onClose(session.id)}
          isEditing={editingSessionId === session.id}
          onStartRename={() => setEditingSessionId(session.id)}
          onCommitRename={(name) => {
            onRename(session.id, name);
            setEditingSessionId(null);
          }}
          onCancelRename={() => setEditingSessionId(null)}
          onContextMenu={(e) => handleContextMenu(e, session.id)}
          isDragging={draggingId === session.id}
          isDragOver={dragOverId === session.id && draggingId !== session.id}
          onPointerDown={(e) => handlePointerDown(e, session.id)}
        />
      ))}
      {sessions.length < maxSessions && (
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1 px-2 py-1.5 text-theme-10 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
          title={lang === "zh" ? "新建会话" : "New Session"}
        >
          <Plus size={12} />
        </button>
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

const SessionTab = forwardRef<HTMLDivElement, {
  session: SerialSession;
  isActive: boolean;
  canClose: boolean;
  lang: Lang;
  onSelect: () => void;
  onClose: () => void;
  isEditing: boolean;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isDragging: boolean;
  isDragOver: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}>(function SessionTab({
  session,
  isActive,
  canClose,
  lang,
  onSelect,
  onClose,
  isEditing,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onContextMenu,
  isDragging,
  isDragOver,
  onPointerDown,
}, ref) {
  const [draftName, setDraftName] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isEditing) return;
    cancelledRef.current = false;
    setDraftName(session.name);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [isEditing, session.name]);

  function commitRename() {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    const name = draftName.trim();
    if (name) onCommitRename(name);
    else onCancelRename();
  }

  function stopEditEvent(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  return (
    <div
      ref={ref}
      data-session-tab-id={session.id}
      className={`group flex items-center gap-1 px-2.5 py-1.5 text-theme-11 cursor-pointer transition-colors shrink-0 border-r border-[var(--border)] select-none ${
        isActive
          ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      } ${isDragging ? "opacity-40" : ""} ${isDragOver ? "ring-2 ring-inset ring-[var(--accent)]" : ""}`}
      onClick={() => { if (!isEditing) onSelect(); }}
      onContextMenu={onContextMenu}
      onDoubleClick={() => { if (!isEditing) onStartRename(); }}
      onPointerDown={(e) => { if (!isEditing) onPointerDown(e); }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={draftName}
          autoFocus
          aria-label={lang === "zh" ? "重命名会话" : "Rename session"}
          onChange={(e) => setDraftName(e.currentTarget.value)}
          onMouseDown={stopEditEvent}
          onClick={stopEditEvent}
          onDoubleClick={stopEditEvent}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelledRef.current = true;
              onCancelRename();
            }
          }}
          className="h-5 w-20 min-w-10 rounded border border-[var(--border-focus)] bg-[var(--bg-input)] px-1 text-theme-11 font-semibold text-[var(--text-primary)] outline-none shadow-[var(--shadow-focus)]"
        />
      ) : (
        <span className="truncate max-w-[80px]" title={session.name}>{session.name}</span>
      )}
      {canClose && !isEditing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-rose-500 transition-opacity p-0.5"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
});