import { useEffect } from "react";
import { ConfigPanel } from "./ConfigPanel.tsx";
import { ReceiveLog } from "./ReceiveLog.tsx";
import { useSerialPort, BAUD_RATES, DATA_BITS_OPTIONS, PARITY_OPTIONS, STOP_BITS_OPTIONS } from "../hooks/useSerialPort.ts";
import type { ReceiveMode, SerialConfig } from "../hooks/useSerialPort.ts";
import type { MockSerialConfig } from "../hooks/useSettings.ts";
import type { Lang } from "../i18n.ts";
import type { SerialSession } from "../hooks/useSessionManager.ts";
import type { SessionData } from "./SessionManager.tsx";

type SessionPanelProps = {
  session: SerialSession;
  lang: Lang;
  receiveMode: ReceiveMode;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  onConfigChange: (config: SerialConfig) => void;
  onData: (data: SessionData) => void;
};

export function SessionPanel({
  session,
  lang,
  receiveMode,
  portFilterMode,
  mockSerial,
  onConfigChange,
  onData,
}: SessionPanelProps) {
  const serial = useSerialPort({
    config: session.config,
    receiveMode,
    portFilterMode,
    mockSerial,
  });

  // Sync session's data to the parent
  useEffect(() => {
    onData({
      ports: serial.ports,
      logs: serial.logs,
      isConnected: serial.isConnected,
      isBusy: serial.isBusy,
      statusText: serial.statusText,
      connectedPort: serial.connectedPort,
      error: serial.error,
      fileSendProgress: serial.fileSendProgress,
      logCapWarning: serial.logCapWarning,
      config: session.config,
      connectionType: session.config.connectionType,
      tcpConnectionStatus: serial.tcpConnectionStatus,
      tcpServerStatus: serial.tcpServerStatus,
      tcpServerClients: serial.tcpServerClients,
      latencyMs: serial.latencyMs,
      signalStates: { ...serial.signalStates, rts: session.config.rts, dtr: session.config.dtr },
      txBytes: serial.txBytes,
      rxBytes: serial.rxBytes,
      txRate: serial.txRate,
      rxRate: serial.rxRate,
      latencyHistory: serial.latencyHistory,
      refreshPorts: serial.refreshPorts,
      openPort: serial.openPort,
      closePort: serial.closePort,
      sendData: serial.sendData,
      sendFile: serial.sendFile,
      clearLogs: () => serial.clearLogs("all"),
      tcpServerBroadcast: serial.tcpServerBroadcast,
      setSignals: serial.setSignals,
      getSignalHistory: serial.getSignalHistory,
    });
  }, [
    serial.ports, serial.logs, serial.isConnected, serial.isBusy,
    serial.statusText, serial.connectedPort, serial.error,
    serial.fileSendProgress, serial.logCapWarning,
    serial.tcpConnectionStatus, serial.tcpServerStatus,
    serial.tcpServerClients, serial.latencyMs, serial.signalStates,
    serial.txBytes, serial.rxBytes, serial.txRate, serial.rxRate,
    serial.latencyHistory,
    serial.refreshPorts, serial.openPort, serial.closePort,
    serial.sendData, serial.sendFile, serial.tcpServerBroadcast,
    serial.setSignals, serial.getSignalHistory,
    session.config, session.config.rts, session.config.dtr, onData,
  ]);

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-y-auto">
      <ConfigPanel
        ports={serial.ports}
        config={session.config}
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
      <ReceiveLog
        logs={serial.logs}
        lang={lang}
        logCapWarning={serial.logCapWarning}
        onClearAll={() => serial.clearLogs("all")}
        onClearReceived={() => serial.clearLogs("received")}
        onClearSent={() => serial.clearLogs("sent")}
      />
    </div>
  );
}