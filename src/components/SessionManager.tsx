import { useCallback, useEffect, useRef, useState } from "react";
import { ConfigPanel } from "./ConfigPanel.tsx";
import { ReceiveLog } from "./ReceiveLog.tsx";
import { useSerialPort, BAUD_RATES, DATA_BITS_OPTIONS, PARITY_OPTIONS, STOP_BITS_OPTIONS } from "../hooks/useSerialPort.ts";
import type { LogDisplayMode, ReceiveMode, SendMode, SerialConfig } from "../hooks/useSerialPort.ts";
import type { MockSerialConfig } from "../hooks/useSettings.ts";
import type { Lang } from "../i18n.ts";
import { useSessionManager } from "../hooks/useSessionManager.ts";
import type { SerialSession } from "../hooks/useSessionManager.ts";
import { useLogFile } from "../hooks/useLogFile.ts";
import { SessionTabBar } from "./SessionTabBar.tsx";
import { appendCrashLog, readCrashLog, clearCrashLog } from "../utils/crashRecoveryLog.ts";
import type { SerialLogEntry } from "../serial/types.ts";

// ── Types ──

export type ActiveSessionData = {
  sessionId: string;
  config: SerialConfig;
  logs: import("../hooks/useSerialPort.ts").SerialLogEntry[];
  isConnected: boolean;
  isBusy: boolean;
  statusText: string;
  connectedPort: { path: string; baudRate: number } | null;
  error: string | null;
  fileSendProgress: number | null;
  logCapWarning: boolean;
  sendQueue: string[];
  ports: import("../hooks/useSerialPort.ts").PortSummary[];
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
  sendData: (value: string, sendMode: SendMode, appendNewline: string) => Promise<void>;
  sendFile: (filePath: string) => Promise<number | void>;
  closePort: () => Promise<void>;
  clearLogs: (target: "all" | "received" | "sent") => void;
  refreshPorts: () => Promise<number>;
  setSignals: (rts: boolean, dtr: boolean) => Promise<void>;
  clearSerialBuffer: () => Promise<void>;
  getSignalHistory: () => { time: number; rts: boolean; dtr: boolean; cts: boolean; dsr: boolean; cd: boolean; ri: boolean }[];
};

// ── Crash-recovery log writer: always-on, independent of the user's optional
// "save to file" — batches entries and flushes periodically so an unclean
// exit (crash/reload) loses at most one flush interval's worth of data. ──

function useCrashLogWriter(sessionId: string) {
  const pendingRef = useRef<SerialLogEntry[]>([]);
  const writingRef = useRef(false);

  const flush = useCallback(async () => {
    if (writingRef.current || pendingRef.current.length === 0) return;
    const batch = pendingRef.current.slice();
    writingRef.current = true;
    try {
      await appendCrashLog(sessionId, batch);
      pendingRef.current.splice(0, batch.length);
    } catch {
      // best-effort; leave batch queued for the next tick
    } finally {
      writingRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    const timer = setInterval(() => void flush(), 2000);
    return () => clearInterval(timer);
  }, [flush]);

  const enqueue = useCallback((entry: SerialLogEntry) => {
    pendingRef.current.push(entry);
  }, []);

  return enqueue;
}

// ── SessionContent: each session has its own serial port ──

function SessionContent({
  sessionId,
  config,
  lang,
  receiveMode,
  displayMode,
  onDisplayModeChange,
  portFilterMode,
  mockSerial,
  rxIdleFlushMs,
  logBatchFlushMs,
  onConfigChange,
  onDataRef,
  isActive,
  onActiveData,
  onAddToPrompts,
  initialLogs,
}: {
  sessionId: string;
  config: SerialConfig;
  lang: Lang;
  receiveMode: ReceiveMode;
  displayMode: LogDisplayMode;
  onDisplayModeChange: (mode: LogDisplayMode) => void;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  rxIdleFlushMs?: number;
  logBatchFlushMs?: number;
  onConfigChange: (config: SerialConfig) => void;
  onDataRef: React.MutableRefObject<ActiveSessionData | null>;
  isActive: boolean;
  onActiveData?: (data: ActiveSessionData) => void;
  onAddToPrompts?: (payload: string) => void;
  initialLogs?: SerialLogEntry[];
}) {
  const serial = useSerialPort({ config, receiveMode, portFilterMode, mockSerial, rxIdleFlushMs, logBatchFlushMs, initialLogs });
  const logFile = useLogFile();
  const enqueueCrashLog = useCrashLogWriter(sessionId);

  // Keep the ref up-to-date with the latest serial data
  useEffect(() => {
    const data: ActiveSessionData = {
      sessionId,
      config,
      logs: serial.logs,
      isConnected: serial.isConnected,
      isBusy: serial.isBusy,
      statusText: serial.statusText,
      connectedPort: serial.connectedPort,
      error: serial.error,
      fileSendProgress: serial.fileSendProgress,
      logCapWarning: serial.logCapWarning,
      sendQueue: serial.sendQueue,
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
      clearLogs: (t: "all" | "received" | "sent") => serial.clearLogs(t),
      refreshPorts: serial.refreshPorts,
      setSignals: serial.setSignals,
      clearSerialBuffer: serial.clearSerialBuffer,
      getSignalHistory: serial.getSignalHistory,
    };
    onDataRef.current = data;
    if (isActive) onActiveData?.(data);
  }, [
    config, serial.logs, serial.isConnected, serial.isBusy, serial.statusText,
    serial.connectedPort, serial.error, serial.fileSendProgress,
    serial.logCapWarning, serial.ports, serial.tcpConnectionStatus,
    serial.tcpServerStatus, serial.tcpServerClients, serial.latencyMs,
    serial.txBytes, serial.rxBytes, serial.txRate, serial.rxRate,
    serial.latencyHistory, serial.signalStates, isActive, onActiveData,
    onDataRef,
  ]);

  // Persist from the uncapped ordered stream so UI clearing/retention cannot drop file entries.
  useEffect(() => serial.subscribeLogs(logFile.enqueueLog), [serial.subscribeLogs, logFile.enqueueLog]);
  // Always-on crash-recovery persistence, independent of the user's optional real-time save.
  useEffect(() => serial.subscribeLogs(enqueueCrashLog), [serial.subscribeLogs, enqueueCrashLog]);

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
      <ReceiveLog
        logs={serial.logs}
        lang={lang}
        logCapWarning={serial.logCapWarning}
        sendQueue={serial.sendQueue}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
        onClearAll={() => serial.clearLogs("all")}
        onClearReceived={() => serial.clearLogs("received")}
        onClearSent={() => serial.clearLogs("sent")}
        savePath={logFile.savePath}
        realTimeLog={logFile.realTime}
        onSelectLogFile={logFile.selectLogFile}
        onToggleRealTime={() => logFile.setRealTime((v) => !v)}
        onFlushLogs={() => logFile.flushAll(serial.logs)}
        onCloseLogFile={logFile.closeLogFile}
        onAddToPrompts={onAddToPrompts}
      />
    </div>
  );
}

// ── SessionManager ──

type SessionManagerProps = {
  lang: Lang;
  receiveMode: ReceiveMode;
  displayMode: LogDisplayMode;
  onDisplayModeChange: (mode: LogDisplayMode) => void;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  rxIdleFlushMs?: number;
  logBatchFlushMs?: number;
  onActiveSessionData?: (data: ActiveSessionData) => void;
  onAddToPrompts?: (payload: string) => void;
  onSessionsChange?: (sessions: SerialSession[]) => void;
};

export function SessionManager({
  lang,
  receiveMode,
  displayMode,
  onDisplayModeChange,
  portFilterMode,
  mockSerial,
  rxIdleFlushMs,
  logBatchFlushMs,
  onActiveSessionData,
  onAddToPrompts,
  onSessionsChange,
}: SessionManagerProps) {
  const {
    sessions,
    activeSessionId,
    createSession,
    closeSession,
    renameSession,
    updateSessionConfig,
    setActive,
    reorderSession,
    maxSessions,
  } = useSessionManager(onSessionsChange);

  // Store per-session data refs, only the active one is synced to App.tsx
  const sessionDataRefs = useRef<Record<string, { current: ActiveSessionData | null }>>({});

  // Crash-recovery logs recovered per session, loaded once at mount for each session id seen.
  // SessionContent (and its useSerialPort, which seeds logs via a useState lazy initializer)
  // must not mount until this check resolves — otherwise the initial empty state "wins" and
  // the recovered logs, once loaded, have no way back in.
  const [recoveredLogs, setRecoveredLogs] = useState<Record<string, SerialLogEntry[]>>({});
  const [checkedSessions, setCheckedSessions] = useState<Set<string>>(new Set());
  const recoveryStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const session of sessions) {
      if (recoveryStartedRef.current.has(session.id)) continue;
      recoveryStartedRef.current.add(session.id);
      void readCrashLog(session.id).then((entries) => {
        void clearCrashLog(session.id);
        if (entries.length > 0) {
          setRecoveredLogs((prev) => ({ ...prev, [session.id]: entries }));
        }
        setCheckedSessions((prev) => new Set(prev).add(session.id));
      });
    }
  }, [sessions]);

  const handleConfigChange = useCallback((sessionId: string, newConfig: SerialConfig) => {
    updateSessionConfig(sessionId, newConfig);
  }, [updateSessionConfig]);

  const handleCloseSession = useCallback((sessionId: string) => {
    closeSession(sessionId);
    void clearCrashLog(sessionId);
  }, [closeSession]);

  // Sync active session data to App.tsx
  const syncRef = useRef(onActiveSessionData);
  syncRef.current = onActiveSessionData;

  useEffect(() => {
    const ref = sessionDataRefs.current[activeSessionId];
    if (ref?.current) {
      syncRef.current?.(ref.current);
    }
  });

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <SessionTabBar
        sessions={sessions}
        activeSessionId={activeSessionId}
        maxSessions={maxSessions}
        lang={lang}
        onSelect={setActive}
        onClose={handleCloseSession}
        onCreate={createSession}
        onRename={renameSession}
        onReorder={reorderSession}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {sessions.map((session) => {
          if (!sessionDataRefs.current[session.id]) {
            sessionDataRefs.current[session.id] = { current: null };
          }
          if (!checkedSessions.has(session.id)) {
            // Wait for the crash-recovery check to resolve before mounting SessionContent,
            // so useSerialPort's initialLogs (a useState lazy initializer) sees the real data
            // instead of racing it and locking in an empty log list.
            return null;
          }
          return (
            <div
              key={session.id}
              className="flex flex-col min-h-0 flex-1"
              style={{ display: session.id === activeSessionId ? "flex" : "none" }}
            >
              <SessionContent
                sessionId={session.id}
                config={session.config}
                lang={lang}
                receiveMode={receiveMode}
                displayMode={displayMode}
                onDisplayModeChange={onDisplayModeChange}
                portFilterMode={portFilterMode}
                mockSerial={mockSerial}
                rxIdleFlushMs={rxIdleFlushMs}
                logBatchFlushMs={logBatchFlushMs}
                onConfigChange={(config) => handleConfigChange(session.id, config)}
                onDataRef={sessionDataRefs.current[session.id]}
                isActive={session.id === activeSessionId}
                onActiveData={onActiveSessionData}
                onAddToPrompts={onAddToPrompts}
                initialLogs={recoveredLogs[session.id]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}