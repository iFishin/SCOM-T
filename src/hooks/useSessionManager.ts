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

export function useSessionManager() {
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
  }, []);

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
    maxSessions: MAX_SESSIONS,
  };
}