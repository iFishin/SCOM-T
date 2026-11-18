import { useCallback, useState } from "react";
import type { SerialConfig } from "./useSerialPort.ts";
import { DEFAULT_CONFIG_FILE } from "../utils/sessionConfigFile.ts";

const MAX_SESSIONS = 4;
const STORAGE_KEY = "scom_t_sessions";

export type SerialSession = {
  id: string;
  name: string;
  config: SerialConfig;
  /** 该标签页当前使用的指令配置文件，空/缺失时取全局默认 "prompts.yaml"。 */
  activeConfigFile?: string;
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

/** Smallest "串口N" not already in use, so closing + re-adding never collides. */
export function nextSessionName(existingNames: string[]): string {
  const taken = new Set(existingNames);
  for (let n = 1; n <= MAX_SESSIONS + 1; n++) {
    const name = `串口${n}`;
    if (!taken.has(name)) return name;
  }
  return `串口${existingNames.length + 1}`;
}

function loadSessions(): SerialSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SerialSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, MAX_SESSIONS).map((s) => ({
          ...s,
          // Corrupt/hand-edited storage must not put a non-string where the
          // config file name is expected.
          activeConfigFile:
            typeof s.activeConfigFile === "string" && s.activeConfigFile
              ? s.activeConfigFile
              : undefined,
        }));
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

  /**
   * @param activeConfigFile 新标签页绑定的指令配置文件；缺省沿用全局默认，
   *   SessionManager 新建标签页时会先派生一份独立配置再传进来。
   */
  function createSession(activeConfigFile?: string) {
    if (sessions.length >= MAX_SESSIONS) return;
    const newSession: SerialSession = {
      id: generateId(),
      name: nextSessionName(sessions.map((s) => s.name)),
      config: defaultConfig(),
      activeConfigFile: activeConfigFile || DEFAULT_CONFIG_FILE,
    };
    const next = [...sessions, newSession];
    persist(next);
    setActiveSessionId(newSession.id);
  }

  /** Bind a tab to another prompt config file. */
  const setSessionConfigFile = useCallback((id: string, fileName: string) => {
    const next = sessions.map((s) =>
      s.id === id ? { ...s, activeConfigFile: fileName } : s
    );
    persist(next);
  }, [sessions, persist]);

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
    setSessionConfigFile,
    setActive,
    reorderSession,
    maxSessions: MAX_SESSIONS,
  };
}