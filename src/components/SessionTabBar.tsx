import { Plus, X } from "lucide-react";
import type { Lang } from "../i18n";
import type { SerialSession } from "../hooks/useSessionManager";

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
}: {
  session: SerialSession;
  isActive: boolean;
  canClose: boolean;
  lang: Lang;
  onSelect: () => void;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer transition-colors shrink-0 border-r border-[var(--border)] ${
        isActive
          ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      }`}
      onClick={onSelect}
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