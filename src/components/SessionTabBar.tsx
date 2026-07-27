import { useState } from "react";
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
}: SessionTabBarProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);

  function handleContextMenu(e: React.MouseEvent, sessionId: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, sessionId });
  }

  const ctxMenuItems: ContextMenuItem[] = ctxMenu ? [
    {
      id: "rename",
      label: lang === "zh" ? "重命名" : "Rename",
      onClick: () => {
        const session = sessions.find((s) => s.id === ctxMenu.sessionId);
        if (session) {
          const newName = window.prompt(
            lang === "zh" ? `重命名会话「${session.name}」:` : `Rename session "${session.name}":`,
            session.name
          );
          if (newName && newName.trim()) onRename(ctxMenu.sessionId, newName.trim());
        }
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

  return (
    <div className="flex items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-input)] shrink-0 overflow-x-auto">
      {sessions.map((session) => (
        <SessionTab
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          canClose={sessions.length > 1}
          lang={lang}
          onSelect={() => onSelect(session.id)}
          onClose={() => onClose(session.id)}
          onRename={(name) => onRename(session.id, name)}
          onContextMenu={(e) => handleContextMenu(e, session.id)}
        />
      ))}
      {sessions.length < maxSessions && (
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
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

function SessionTab({
  session,
  isActive,
  canClose,
  lang,
  onSelect,
  onClose,
  onRename,
  onContextMenu,
}: {
  session: SerialSession;
  isActive: boolean;
  canClose: boolean;
  lang: Lang;
  onSelect: () => void;
  onClose: () => void;
  onRename: (name: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer transition-colors shrink-0 border-r border-[var(--border)] ${
        isActive
          ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      }`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onDoubleClick={() => {
        const newName = window.prompt(
          lang === "zh" ? `重命名会话「${session.name}」:` : `Rename session "${session.name}":`,
          session.name
        );
        if (newName && newName.trim()) onRename(newName.trim());
      }}
    >
      <span className="truncate max-w-[80px]">{session.name}</span>
      {canClose && (
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
}