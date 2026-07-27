import { useCallback } from "react";
import type { SerialConfig, ReceiveMode, SendMode, SerialLogEntry, PortSummary, TcpClientInfo, TcpConnectionStatus, TcpServerStatus } from "../hooks/useSerialPort.ts";
import type { MockSerialConfig } from "../hooks/useSettings.ts";
import type { Lang } from "../i18n.ts";
import { useSessionManager } from "../hooks/useSessionManager.ts";
import { SessionTabBar } from "./SessionTabBar.tsx";
import { SessionPanel } from "./SessionPanel.tsx";

export type SessionData = {
  ports: PortSummary[];
  logs: SerialLogEntry[];
  isConnected: boolean;
  isBusy: boolean;
  statusText: string;
  connectedPort: { path: string; baudRate: number } | null;
  error: string | null;
  fileSendProgress: number | null;
  logCapWarning: boolean;
  config: SerialConfig;
  connectionType: string;
  tcpConnectionStatus: TcpConnectionStatus;
  tcpServerStatus: TcpServerStatus;
  tcpServerClients: TcpClientInfo[];
  latencyMs: number | null;
  signalStates: { rts: boolean; dtr: boolean; cts: boolean; dsr: boolean; cd: boolean; ri: boolean };
  txBytes: number;
  rxBytes: number;
  txRate: number;
  rxRate: number;
  latencyHistory: number[];
  refreshPorts: () => Promise<number>;
  openPort: () => Promise<void>;
  closePort: () => Promise<void>;
  sendData: (value: string, sendMode: SendMode, appendNewline: "" | "\r\n" | "\r" | "\n") => Promise<void>;
  sendFile: (filePath: string) => Promise<number | void>;
  clearLogs: () => void;
  tcpServerBroadcast?: (data: number[]) => Promise<void>;
  setSignals: (rts: boolean, dtr: boolean) => Promise<void>;
  getSignalHistory: () => { rts: boolean; dtr: boolean; cts: boolean; dsr: boolean; cd: boolean; ri: boolean }[];
};

type SessionManagerProps = {
  lang: Lang;
  receiveMode: ReceiveMode;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  onSessionData: (data: SessionData) => void;
};

export function SessionManager({ lang, receiveMode, portFilterMode, mockSerial, onSessionData }: SessionManagerProps) {
  const {
    sessions,
    activeSessionId,
    createSession,
    closeSession,
    renameSession,
    updateSessionConfig,
    setActive,
    maxSessions,
  } = useSessionManager();

  const handleSessionData = useCallback((id: string, data: SessionData) => {
    if (id === activeSessionId) {
      onSessionData(data);
    }
  }, [activeSessionId, onSessionData]);

  // Notify App.tsx of the active session's config changes
  const handleConfigChange = useCallback((config: SerialConfig) => {
    updateSessionConfig(activeSessionId, config);
  }, [activeSessionId, updateSessionConfig]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <SessionTabBar
        sessions={sessions}
        activeSessionId={activeSessionId}
        maxSessions={maxSessions}
        lang={lang}
        onSelect={setActive}
        onClose={closeSession}
        onCreate={createSession}
        onRename={renameSession}
      />
      <div className="flex-1 min-h-0 relative">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="absolute inset-0 flex flex-col min-h-0"
            style={{ display: session.id === activeSessionId ? "flex" : "none" }}
          >
            <SessionPanel
              session={session}
              lang={lang}
              receiveMode={receiveMode}
              portFilterMode={portFilterMode}
              mockSerial={mockSerial}
              onConfigChange={handleConfigChange}
              onData={(data) => handleSessionData(session.id, data)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}