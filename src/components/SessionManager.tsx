import { useCallback } from "react";
import { ConfigPanel } from "./ConfigPanel.tsx";
import { ReceiveLog } from "./ReceiveLog.tsx";
import { useSerialPort, BAUD_RATES, DATA_BITS_OPTIONS, PARITY_OPTIONS, STOP_BITS_OPTIONS } from "../hooks/useSerialPort.ts";
import type { ReceiveMode, SerialConfig } from "../hooks/useSerialPort.ts";
import type { MockSerialConfig } from "../hooks/useSettings.ts";
import type { Lang } from "../i18n.ts";
import { useSessionManager } from "../hooks/useSessionManager.ts";
import { SessionTabBar } from "./SessionTabBar.tsx";

type SessionManagerProps = {
  lang: Lang;
  receiveMode: ReceiveMode;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  onConfigChange?: (config: SerialConfig) => void;
  config: SerialConfig;
};

export function SessionManager({ lang, receiveMode, portFilterMode, mockSerial, onConfigChange, config }: SessionManagerProps) {
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

  const serial = useSerialPort({
    config,
    receiveMode,
    portFilterMode,
    mockSerial,
  });

  // Sync config changes from ConfigPanel to session manager
  const handleConfigChange = useCallback((newConfig: SerialConfig) => {
    updateSessionConfig(activeSessionId, newConfig);
    onConfigChange?.(newConfig);
  }, [activeSessionId, updateSessionConfig, onConfigChange]);

  // When active session changes, update the config in App.tsx
  const handleSelectSession = useCallback((id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setActive(id);
      onConfigChange?.(session.config);
    }
  }, [sessions, setActive, onConfigChange]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <SessionTabBar
        sessions={sessions}
        activeSessionId={activeSessionId}
        maxSessions={maxSessions}
        lang={lang}
        onSelect={handleSelectSession}
        onClose={closeSession}
        onCreate={createSession}
        onRename={renameSession}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
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
          onConfigChange={handleConfigChange}
          onOpen={serial.openPort}
          onClose={serial.closePort}
          onSetSignals={serial.setSignals}
        />
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