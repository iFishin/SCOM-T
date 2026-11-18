import { useCallback, useEffect, useRef, useState } from "react";
import { ConfigPanel } from "./ConfigPanel.tsx";
import { ReceiveLog } from "./ReceiveLog.tsx";
import { useSerialPort, BAUD_RATES, DATA_BITS_OPTIONS, PARITY_OPTIONS, STOP_BITS_OPTIONS } from "../hooks/useSerialPort.ts";
import type { LogDisplayMode, ReceiveMode, SendMode, SerialConfig } from "../hooks/useSerialPort.ts";
import type { MockSerialConfig } from "../hooks/useSettings.ts";
import type { Lang } from "../i18n.ts";
import { useSessionManager, nextSessionName } from "../hooks/useSessionManager.ts";
import type { SerialSession } from "../hooks/useSessionManager.ts";
import { useLogFile } from "../hooks/useLogFile.ts";
import { SessionTabBar } from "./SessionTabBar.tsx";
import { appendCrashLog, readCrashLog, clearCrashLog } from "../utils/crashRecoveryLog.ts";
import { DEFAULT_CONFIG_FILE, forkConfigForSession } from "../utils/sessionConfigFile.ts";
import type { SerialLogEntry } from "../serial/types.ts";

// ── Types ──

export type ActiveSessionData = {
  sessionId: string;
  /** Prompt config file this tab edits (per-tab independence, issue #19). */
  activeConfigFile: string;
  config: SerialConfig;
  /**
   * Live log buffer as a subscription. Carrying the array itself here made the
   * app shell re-render on every 20 Hz log batch; consumers that paint logs
   * subscribe directly instead.
   */
  logSource: import("../hooks/logSource.ts").LogSource;
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

/**
 * Cap on queued-but-not-yet-written entries. The flush runs every 2s and is
 * skipped while a write is in flight, so a fast device can outrun it. Dropping
 * the oldest keeps the writer bounded; recovery context is the recent tail
 * anyway, same trade-off as MAX_RESTORE_ENTRIES.
 */
const MAX_CRASH_PENDING = 2_000;

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
    const overflow = pendingRef.current.length - MAX_CRASH_PENDING;
    if (overflow > 0) pendingRef.current.splice(0, overflow);
  }, []);

  return enqueue;
}

// ── SessionContent: each session has its own serial port ──

function SessionContent({
  sessionId,
  activeConfigFile,
  config,
  lang,
  receiveMode,
  displayMode,
  onDisplayModeChange,
  portFilterMode,
  mockSerial,
  rxIdleFlushMs,
  logBatchFlushMs,
  maxLogs,
  onConfigChange,
  onDataRef,
  isActive,
  onActiveData,
  onAddToPrompts,
  initialLogs,
  logSavePath,
  logRealTime,
  onLogFileStateChange,
  showLogPanel = true,
}: {
  sessionId: string;
  activeConfigFile: string;
  config: SerialConfig;
  lang: Lang;
  receiveMode: ReceiveMode;
  displayMode: LogDisplayMode;
  onDisplayModeChange: (mode: LogDisplayMode) => void;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  rxIdleFlushMs?: number;
  logBatchFlushMs?: number;
  /** Live-view entry cap; drives both heap use and how many rows get mounted. */
  maxLogs?: number;
  onConfigChange: (config: SerialConfig) => void;
  onDataRef: React.MutableRefObject<ActiveSessionData | null>;
  isActive: boolean;
  onActiveData?: (data: ActiveSessionData) => void;
  onAddToPrompts?: (payload: string) => void;
  initialLogs?: SerialLogEntry[];
  logSavePath?: string | null;
  logRealTime?: boolean;
  onLogFileStateChange?: (savePath: string | null, realTime: boolean) => void;
  /**
   * False in the grid layout, where the log panel is its own card rendered by
   * App. Rendering a second copy here only produced a few hundred clipped rows
   * per session, all of which still cost DOM and a 20 Hz subscription.
   */
  showLogPanel?: boolean;
}) {
  const serial = useSerialPort({ config, receiveMode, portFilterMode, mockSerial, rxIdleFlushMs, logBatchFlushMs, maxLogs, initialLogs });
  const logFile = useLogFile({ onStateChange: onLogFileStateChange });
  const enqueueCrashLog = useCrashLogWriter(sessionId);

  // Restore persisted log-file selection on startup (only if the file still exists).
  // Only the initially-active session restores, so multiple sessions don't all grab
  // the same file and write to it concurrently.
  const logRestoredRef = useRef(false);
  useEffect(() => {
    if (logRestoredRef.current || !isActive) return;
    logRestoredRef.current = true;
    void logFile.restore(logSavePath ?? null, logRealTime ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Keep the ref up-to-date with the latest serial data
  useEffect(() => {
    const data: ActiveSessionData = {
      sessionId,
      activeConfigFile,
      config,
      logSource: serial.logSource,
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
    sessionId, activeConfigFile, config, serial.logSource, serial.isConnected, serial.isBusy, serial.statusText,
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
      {showLogPanel && (
      <ReceiveLog
        logSource={serial.logSource}
        mounted={isActive}
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
        onFlushLogs={() => logFile.flushAll(serial.getLogs())}
        onDumpLogs={() => { void logFile.dumpLogs(serial.getLogs()); }}
        onCloseLogFile={logFile.closeLogFile}
        onAddToPrompts={onAddToPrompts}
      />
      )}
    </div>
  );
}

// ── SessionManager ──

/** Imperative surface App uses to change the active tab's prompt config. */
export type SessionManagerApi = {
  setConfigFile: (sessionId: string, fileName: string) => void;
  /** One-time migration of bindings that only existed in the settings mirror. */
  hydrateConfigFiles: (byId: Record<string, string>) => void;
};

type SessionManagerProps = {
  lang: Lang;
  receiveMode: ReceiveMode;
  displayMode: LogDisplayMode;
  onDisplayModeChange: (mode: LogDisplayMode) => void;
  portFilterMode: "default" | "all";
  mockSerial?: MockSerialConfig;
  rxIdleFlushMs?: number;
  logBatchFlushMs?: number;
  maxLogs?: number;
  onActiveSessionData?: (data: ActiveSessionData) => void;
  onAddToPrompts?: (payload: string) => void;
  onSessionsChange?: (sessions: SerialSession[]) => void;
  /** Lets App bind the active tab to another prompt config file. */
  apiRef?: React.MutableRefObject<SessionManagerApi | null>;
  logSavePath?: string | null;
  logRealTime?: boolean;
  onLogFileStateChange?: (savePath: string | null, realTime: boolean) => void;
  /**
   * False in the grid layout, where the log panel is its own card rendered by
   * App. Rendering a second copy here only produced a few hundred clipped rows
   * per session, all of which still cost DOM and a 20 Hz subscription.
   */
  showLogPanel?: boolean;
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
  maxLogs,
  onActiveSessionData,
  onAddToPrompts,
  onSessionsChange,
  apiRef,
  logSavePath,
  logRealTime,
  onLogFileStateChange,
  showLogPanel = true,
}: SessionManagerProps) {
  const {
    sessions,
    activeSessionId,
    activeSession,
    createSession,
    closeSession,
    renameSession,
    updateSessionConfig,
    setSessionConfigFile,
    hydrateConfigFiles,
    setActive,
    reorderSession,
    maxSessions,
  } = useSessionManager(onSessionsChange);

  // Expose the binding setter so App can switch the active tab's config file.
  // The handed-out object is stable; it forwards to the latest setter so a
  // re-render cannot leave App holding a stale closure or a null ref.
  const setConfigFileRef = useRef(setSessionConfigFile);
  setConfigFileRef.current = setSessionConfigFile;
  const hydrateConfigFilesRef = useRef(hydrateConfigFiles);
  hydrateConfigFilesRef.current = hydrateConfigFiles;
  useEffect(() => {
    if (!apiRef) return;
    const api: SessionManagerApi = {
      setConfigFile: (id, fileName) => setConfigFileRef.current(id, fileName),
      hydrateConfigFiles: (byId) => hydrateConfigFilesRef.current(byId),
    };
    apiRef.current = api;
    return () => {
      if (apiRef.current === api) apiRef.current = null;
    };
  }, [apiRef]);

  // Push the initial session list up once. Without this the mirrored
  // settings.sessions stays empty until the first tab mutation, so a tab's
  // config binding had no slot to live in.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const sessionsChangeRef = useRef(onSessionsChange);
  sessionsChangeRef.current = onSessionsChange;
  const notifiedInitialSessionsRef = useRef(false);
  useEffect(() => {
    if (notifiedInitialSessionsRef.current) return;
    notifiedInitialSessionsRef.current = true;
    sessionsChangeRef.current?.(sessionsRef.current);
  }, []);

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
      void (async () => {
        let entries: SerialLogEntry[] = [];
        try {
          entries = await readCrashLog(session.id);
        } catch {
          // Unreadable leftover log: fall through and drop it. Mounting the
          // session matters more than whatever history we could not parse.
        } finally {
          // Always clear, even when the read failed. Otherwise a file that
          // crashes the read is read again on every start, forever.
          await clearCrashLog(session.id);
          if (entries.length > 0) {
            setRecoveredLogs((prev) => ({ ...prev, [session.id]: entries }));
          }
          setCheckedSessions((prev) => new Set(prev).add(session.id));
        }
      })();
    }
  }, [sessions]);

  const handleConfigChange = useCallback((sessionId: string, newConfig: SerialConfig) => {
    updateSessionConfig(sessionId, newConfig);
  }, [updateSessionConfig]);

  /**
   * New tabs get their own prompt config file, seeded from the tab they were
   * opened from (a re-opened tab name reuses its previous file). Sharing one
   * `prompts.yaml` across every tab was exactly the behaviour issue #19 asked
   * to get rid of: editing commands in one tab silently rewrote another's.
   */
  const creatingSessionRef = useRef(false);
  const handleCreateSession = useCallback(async () => {
    if (creatingSessionRef.current || sessions.length >= maxSessions) return;
    creatingSessionRef.current = true;
    try {
      const name = nextSessionName(sessions.map((s) => s.name));
      const sourceFile = activeSession?.activeConfigFile ?? DEFAULT_CONFIG_FILE;
      let configFile = DEFAULT_CONFIG_FILE;
      try {
        configFile = await forkConfigForSession(name, sourceFile);
      } catch {
        // Filesystem unavailable — still let the tab open on the shared default.
      }
      createSession(configFile);
    } finally {
      creatingSessionRef.current = false;
    }
  }, [sessions, activeSession, createSession, maxSessions]);

  const handleCloseSession = useCallback((sessionId: string) => {
    closeSession(sessionId);
    void clearCrashLog(sessionId);
    // Drop everything still holding this session's log array. The data ref is
    // what App.tsx reads from, and the recovered-log entry is only needed
    // until SessionContent mounts — keeping either after the tab is gone pins
    // thousands of entries that can never be collected.
    delete sessionDataRefs.current[sessionId];
    setRecoveredLogs((prev) => {
      if (!(sessionId in prev)) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setCheckedSessions((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    recoveryStartedRef.current.delete(sessionId);
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
        onCreate={handleCreateSession}
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
                activeConfigFile={session.activeConfigFile ?? DEFAULT_CONFIG_FILE}
                config={session.config}
                lang={lang}
                receiveMode={receiveMode}
                displayMode={displayMode}
                onDisplayModeChange={onDisplayModeChange}
                portFilterMode={portFilterMode}
                mockSerial={mockSerial}
                rxIdleFlushMs={rxIdleFlushMs}
                logBatchFlushMs={logBatchFlushMs}
                maxLogs={maxLogs}
                onConfigChange={(config) => handleConfigChange(session.id, config)}
                onDataRef={sessionDataRefs.current[session.id]}
                isActive={session.id === activeSessionId}
                onActiveData={onActiveSessionData}
                onAddToPrompts={onAddToPrompts}
                initialLogs={recoveredLogs[session.id]}
                logSavePath={logSavePath}
                logRealTime={logRealTime}
                onLogFileStateChange={onLogFileStateChange}
                showLogPanel={showLogPanel}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}