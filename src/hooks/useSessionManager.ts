import { useCallback, useState } from "react";
import type { SerialConfig } from "./useSerialPort.ts";

const MAX_SESSIONS = 4;
const STORAGE_KEY = "scom_t_sessions";

export type SerialSession = {
  id: string;
  name: string;
  config: SerialConfig;
};

function defaultConfig(): SerialConfig {
  return {
    path: "",
    baudRate: 115200,
    dataBits: "8",
    parity: "none",
    stopBits: "1",
    flowControl: "none",
    rts: false,
    dtr: false,
    connectionType: "serial",
    tcpHost: "",
    tcpPort: 23,
    tcpProtocol: "rfc2217",
  };
}

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function loadSessions(): SerialSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SerialSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, MAX_SESSIONS);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveSessions(sessions: SerialSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

export function useSessionManager(onSessionsChange?: (sessions: SerialSession[]) => void) {
  const [sessions, setSessions] = useState<SerialSession[]>(() => {
    const loaded = loadSessions();
    if (loaded.length === 0) {
      return [{ id: generateId(), name: "串口1", config: defaultConfig() }];
    }
    return loaded;
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]?.id ?? "");

  const persist = useCallback((next: SerialSession[]) => {
    setSessions(next);
    saveSessions(next);
    onSessionsChange?.(next);
  }, [onSessionsChange]);

  function createSession() {
    if (sessions.length >= MAX_SESSIONS) return;
    const count = sessions.length + 1;
    const newSession: SerialSession = {
      id: generateId(),
      name: `串口${count}`,
      config: defaultConfig(),
    };
    const next = [...sessions, newSession];
    persist(next);
    setActiveSessionId(newSession.id);
  }

  function closeSession(id: string) {
    if (sessions.length <= 1) return;
    const next = sessions.filter((s) => s.id !== id);
    persist(next);
    if (activeSessionId === id) {
      setActiveSessionId(next[0]?.id ?? "");
    }
  }

  function renameSession(id: string, name: string) {
    const next = sessions.map((s) => (s.id === id ? { ...s, name } : s));
    persist(next);
  }

  function updateSessionConfig(id: string, config: Partial<SerialConfig>) {
    const next = sessions.map((s) =>
      s.id === id ? { ...s, config: { ...s.config, ...config } } : s
    );
    persist(next);
  }

  function setActive(id: string) {
    setActiveSessionId(id);
  }

  function reorderSession(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const from = sessions.findIndex((s) => s.id === draggedId);
    if (from < 0) return;
    const next = [...sessions];
    const [moved] = next.splice(from, 1);
    // Recompute the target's index *after* removal (rather than reusing its
    // pre-removal index) so the insertion point is consistent regardless of
    // drag direction — otherwise removing `from` shifts everything after it
    // left by one only when from < to, making forward/backward drags land on
    // opposite sides of the target.
    const to = next.findIndex((s) => s.id === targetId);
    if (to < 0) return;
    next.splice(to, 0, moved);
    persist(next);
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  return {
    sessions,
    activeSessionId,
    activeSession,
    createSession,
    closeSession,
    renameSession,
    updateSessionConfig,
    setActive,
    reorderSession,
    maxSessions: MAX_SESSIONS,
  };
}