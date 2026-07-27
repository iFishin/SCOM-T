import { useCallback, useEffect } from "react";
import { ConfigPanel } from "./ConfigPanel.tsx";
import { ReceiveLog } from "./ReceiveLog.tsx";
import { useSerialPort, BAUD_RATES, DATA_BITS_OPTIONS, PARITY_OPTIONS, STOP_BITS_OPTIONS } from "../hooks/useSerialPort.ts";
import type { ReceiveMode, SendMode, SerialConfig, SerialLogEntry, PortSummary } from "../hooks/useSerialPort.ts";
import type { MockSerialConfig } from "../hooks/useSettings.ts";
import type { Lang } from "../i18n.ts";
import { useSessionManager } from "../hooks/useSessionManager.ts";
import { SessionTabBar } from "./SessionTabBar.tsx";

// ── Types ──

export type ActiveSessionData = {
  logs: SerialLogEntry[];
  isConnected: boolean;
  isBusy: boolean;
  statusText: string;
  connectedPort: { path: string; baudRate: number } | null;
  error: string | null;
  fileSendProgress: number | null;
  logCapWarning: boolean;
  ports: PortSummary[];
  tcpConnectionStatus: string;
  tcpServerStatus: string;
  tcpServerClients: { id: string; address: string }[];
  latencyMs: number | null;
  tcpServerBroadcast?: (data: number[]) => Promise<void>;
  txBytes: number;
  rxBytes: number;
  txRate: number;
  rxRate: number;
  latencyHistory: number[];
  signalStates: { rts: boolean; dtr: boolean; cts: boolean; dsr: boolean; cd: boolean; ri: boolean };
  sendData: (value: string, sendMode: SendMode, appendNewline: "" | "\r\n" | "\r" | "\n") => Promise<void>;
  sendFile: (filePath: string) => Promise<number | void>;
  closePort: () => Promise<void>;
  clearLogs: (target: "all" | "received" | "sent") => void;
  refreshPorts: () => Promise<number>;
  setSignals: (rts: boolean, dtr: boolean) => Promise<void>;
  getSignalHistory: () => { rts: boolean; dtr: boolean; cts: boolean; dsr: boolean; cd: boolean; ri: boolean }[];
};

// ── SessionContent: one per session, each has its own useSerialPort ──

function SessionContent({
  config,
  lang,
  receiveMode,
  portFilterMode,
  mockSerial,
  onConfigChange,
  onData,
}: {
  config: SerialConfig;
  lang: Lang;
  receiveMode: ReceiveMode;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  onConfigChange: (config: SerialConfig) => void;
  onData: (data: ActiveSessionData) => void;
}) {
  const serial = useSerialPort({ config, receiveMode, portFilterMode, mockSerial });

  useEffect(() => {
    onData({
      logs: serial.logs,
      isConnected: serial.isConnected,
      isBusy: serial.isBusy,
      statusText: serial.statusText,
      connectedPort: serial.connectedPort,
      error: serial.error,
      fileSendProgress: serial.fileSendProgress,
      logCapWarning: serial.logCapWarning,
      ports: serial.ports,
      tcpConnectionStatus: serial.tcpConnectionStatus,
      tcpServerStatus: serial.tcpServerStatus,
      tcpServerClients: serial.tcpServerClients,
      latencyMs: serial.latencyMs,
      tcpServerBroadcast: serial.tcpServerBroadcast,
      txBytes: serial.txBytes,
      rxBytes: serial.rxBytes,
      txRate: serial.txRate,
      rxRate: serial.rxRate,
      latencyHistory: serial.latencyHistory,
      signalStates: { ...serial.signalStates, rts: config.rts, dtr: config.dtr },
      sendData: serial.sendData,
      sendFile: serial.sendFile,
      closePort: serial.closePort,
      clearLogs: (t) => serial.clearLogs(t),
      refreshPorts: serial.refreshPorts,
      setSignals: serial.setSignals,
      getSignalHistory: serial.getSignalHistory,
    });
  }, [
    serial.logs, serial.isConnected, serial.isBusy, serial.statusText,
    serial.connectedPort, serial.error, serial.fileSendProgress,
    serial.logCapWarning, serial.ports, serial.tcpConnectionStatus,
    serial.tcpServerStatus, serial.tcpServerClients, serial.latencyMs,
    serial.tcpServerBroadcast, serial.txBytes, serial.rxBytes,
    serial.txRate, serial.rxRate, serial.latencyHistory, serial.signalStates,
    serial.sendData, serial.sendFile, serial.closePort, serial.clearLogs,
    serial.refreshPorts, serial.setSignals, serial.getSignalHistory,
    onData,
  ]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="min-h-0 overflow-y-auto shrink-0">
        <ConfigPanel
          ports={serial.ports}
          config={config}
          baudRates={BAUD_RATES}
          dataBitsOptions={DATA_BITS_OPTIONS}
          parityOptions={PARITY_OPTIONS}
          stopBitsOptions={STOP_BITS_OPTIONS}
          isConnected={serial.isConnected}
          isBusy={serial.isBusy}
          lang={lang}
          tcpConnectionStatus={serial.tcpConnectionStatus}
          tcpServerStatus={serial.tcpServerStatus}
          tcpServerClients={serial.tcpServerClients}
          onRefresh={() => { serial.refreshPorts(); return Promise.resolve(); }}
          onConfigChange={onConfigChange}
          onOpen={serial.openPort}
          onClose={serial.closePort}
          onSetSignals={serial.setSignals}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ReceiveLog
          logs={serial.logs}
          lang={lang}
          logCapWarning={serial.logCapWarning}
          onClearAll={() => serial.clearLogs("all")}
          onClearReceived={() => serial.clearLogs("received")}
          onClearSent={() => serial.clearLogs("sent")}
        />
      </div>
    </div>
  );
}

// ── SessionManager ──

type SessionManagerProps = {
  lang: Lang;
  receiveMode: ReceiveMode;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  onActiveSessionData?: (data: ActiveSessionData) => void;
};

export function SessionManager({ lang, receiveMode, portFilterMode, mockSerial, onActiveSessionData }: SessionManagerProps) {
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

  const handleConfigChange = useCallback((sessionId: string, newConfig: SerialConfig) => {
    updateSessionConfig(sessionId, newConfig);
  }, [updateSessionConfig]);

  const handleSessionData = useCallback((data: ActiveSessionData) => {
    onActiveSessionData?.(data);
  }, [onActiveSessionData]);

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
            <SessionContent
              config={session.config}
              lang={lang}
              receiveMode={receiveMode}
              portFilterMode={portFilterMode}
              mockSerial={mockSerial}
              onConfigChange={(config) => handleConfigChange(session.id, config)}
              onData={handleSessionData}
            />
          </div>
        ))}
      </div>
    </div>
  );
}