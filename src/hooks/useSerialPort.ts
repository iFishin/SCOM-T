import { useCallback, useEffect, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  bytesToAscii,
  bytesToHex,
  formatTimestamp,
} from "../utils/hexConverter.ts";
import { encodeSendPayload } from "../utils/sendPayload.ts";
import { enderStringToBytes } from "../utils/enderOptions.ts";
import { appLogger } from "../utils/appLogger.ts";

import type { ISerialService } from "../serial/SerialService.ts";
import {
  TauriSerialService,
  MockSerialService,
  isMockPort,
  listAvailablePorts,
} from "../serial/SerialService.ts";
import type { ITcpClientService } from "../tcp/TcpClientService.ts";
import { TauriTcpClientService } from "../tcp/TcpClientService.ts";
import type { ITcpServerService } from "../tcp/TcpServerService.ts";
import { TauriTcpServerService } from "../tcp/TcpServerService.ts";
import type {
  PortSummary,
  SerialLogEntry,
  ReceiveMode,
  SendMode,
} from "../serial/types.ts";
import type {
  ConnectionType,
  TcpConnectionStatus,
  TcpServerStatus,
  TcpClientInfo,
  TcpProtocol,
} from "../tcp/types.ts";
import type { MockSerialConfig } from "./useSettings.ts";
import { SerialEventJournal } from "../serial/SerialEventJournal.ts";
import { SerialTextFramer } from "../serial/SerialTextFramer.ts";

// ── Re-export types from the new service layers for backward compatibility ──

export type {
  SendMode,
  ReceiveMode,
  SerialLogDirection,
  LogSource,
  LogDisplayMode,
  SerialLogEntry,
  PortSummary,
  SelectOption,
} from "../serial/types.ts";

export type {
  ConnectionType,
  TcpProtocol,
  TcpConnectionStatus,
  TcpServerStatus,
  TcpClientInfo,
} from "../tcp/types.ts";

export {
  BAUD_RATES,
  DATA_BITS_OPTIONS,
  PARITY_OPTIONS,
  STOP_BITS_OPTIONS,
  FLOW_CONTROL_OPTIONS,
} from "../serial/types.ts";

// ── Combined config (serial + TCP, backward compatible) ──

export type SerialConfig = {
  path: string;
  baudRate: number;
  dataBits: "5" | "6" | "7" | "8";
  parity: "none" | "odd" | "even";
  stopBits: "1" | "1.5" | "2";
  flowControl: "none" | "software" | "hardware";
  rts: boolean;
  dtr: boolean;
  // TCP / remote fields
  connectionType: ConnectionType;
  tcpHost: string;
  tcpPort: number;
  tcpProtocol: TcpProtocol;
};

// A plugin read event is keyed only by serial path, so only one hook may own a
// real port at a time. Mock ports are independent and do not use this registry.
const serialPortOwners = new Map<string, symbol>();

function claimSerialPort(path: string, owner: symbol): boolean {
  const currentOwner = serialPortOwners.get(path);
  if (currentOwner && currentOwner !== owner) return false;
  serialPortOwners.set(path, owner);
  return true;
}

function releaseSerialPort(path: string | null, owner: symbol): void {
  if (path && serialPortOwners.get(path) === owner) {
    serialPortOwners.delete(path);
  }
}

// ── Hook ──

export function useSerialPort({
  config,
  receiveMode,
  portFilterMode = "default",
  mockSerial,
  rxIdleFlushMs = 50,
  logBatchFlushMs = 50,
}: {
  config: SerialConfig;
  receiveMode: ReceiveMode;
  portFilterMode?: "default" | "all";
  mockSerial?: MockSerialConfig;
  rxIdleFlushMs?: number;
  logBatchFlushMs?: number;
}) {
  const serialRef = useRef<ISerialService | null>(null);
  const portOwnerRef = useRef(Symbol("serial-session"));
  const claimedPortRef = useRef<string | null>(null);
  const tcpClientRef = useRef<ITcpClientService | null>(null);
  const tcpServerRef = useRef<ITcpServerService | null>(null);
  const receiveModeRef = useRef(receiveMode);
  const configRef = useRef(config);
  const mockSerialRef = useRef(mockSerial);
  const rxIdleFlushMsRef = useRef(50);
  const logBatchFlushMsRef = useRef(50);
  const journalRef = useRef(new SerialEventJournal());
  const logSubscribersRef = useRef(new Set<(entry: SerialLogEntry) => void>());
  // Keep configRef in sync so callback closures always read latest config
  configRef.current = config;
  const seqCounter = useRef(0);
  // Batch pending log entries to reduce React state updates
  const MAX_LOGS = 10_000;
  const BATCH_MAX_SIZE = 50;
  const pendingLogsRef = useRef<SerialLogEntry[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Current write-queue contents: text of commands queued but not yet fully sent.
  const [sendQueue, setSendQueue] = useState<string[]>([]);
  const sendQueueRef = useRef<string[]>([]);
  // Track last write to serial for echo suppression in TCP server mode
  const lastWriteRef = useRef<{ data: Uint8Array; time: number } | null>(null);
  // TCP latency measurement
  const lastTcpSendRef = useRef<number>(0);
  // Byte-preserving receive framer. We accumulate bytes until a newline, but a
  // device may send lines WITHOUT a trailing newline (e.g. "standalone:...").
  // A short idle timer (reset on every chunk) flushes such lines after RX goes
  // quiet, so they surface promptly without truncating USB-split multi-chunk
  // lines (those arrive within milliseconds and keep resetting the timer).
  const textFramerRef = useRef(new SerialTextFramer());
  const frameFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Idle flush for newline-less device lines. The plugin dispatch interval is
  // 5ms; if a device splits one line across USB chunks with gaps bigger than
  // this idle value, the line gets truncated. Tuned via settings
  // (rxIdleFlushMs), default 50ms covers the observed 34ms inter-chunk gaps.
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [logCapWarning, setLogCapWarning] = useState(false);
  const logCapWarningRef = useRef(false);
  const [ports, setPorts] = useState<PortSummary[]>([]);
  const [logs, setLogs] = useState<SerialLogEntry[]>([]);
  const logsRef = useRef<SerialLogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [statusText, setStatusText] = useState("未连接");
  const [error, setError] = useState<string | null>(null);
  const [connectedPort, setConnectedPort] = useState<{
    path: string;
    baudRate: number;
  } | null>(null);
  const [fileSendProgress, setFileSendProgress] = useState<number | null>(null);

  // ── Visualization states ──
  const [txBytes, setTxBytes] = useState(0);
  const [rxBytes, setRxBytes] = useState(0);
  const [txRate, setTxRate] = useState(0);
  const [rxRate, setRxRate] = useState(0);
  const txBytesRef = useRef(0);
  const rxBytesRef = useRef(0);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [signalStates, setSignalStates] = useState<{
    cts: boolean;
    dsr: boolean;
    cd: boolean;
    ri: boolean;
  }>({
    cts: false,
    dsr: false,
    cd: false,
    ri: false,
  });
  const signalHistoryRef = useRef<
    {
      time: number;
      rts: boolean;
      dtr: boolean;
      cts: boolean;
      dsr: boolean;
      cd: boolean;
      ri: boolean;
    }[]
  >([]);
  const MAX_SIGNAL_HISTORY = 300;

  // TCP-specific state
  const [tcpConnectionStatus, setTcpConnectionStatus] =
    useState<TcpConnectionStatus>("disconnected");
  const [tcpServerStatus, setTcpServerStatus] =
    useState<TcpServerStatus>("stopped");
  const [tcpServerClients, setTcpServerClients] = useState<TcpClientInfo[]>([]);

  useEffect(() => {
    receiveModeRef.current = receiveMode;
  }, [receiveMode]);

  useEffect(() => {
    mockSerialRef.current = mockSerial;
  }, [mockSerial]);

  useEffect(() => {
    rxIdleFlushMsRef.current = rxIdleFlushMs;
  }, [rxIdleFlushMs]);

  useEffect(() => {
    logBatchFlushMsRef.current = logBatchFlushMs;
  }, [logBatchFlushMs]);

  // ── Rate calculation (every 1s) ──
  useEffect(() => {
    const interval = setInterval(() => {
      setTxRate(txBytesRef.current);
      setRxRate(rxBytesRef.current);
      setTxBytes((prev) => prev + txBytesRef.current);
      setRxBytes((prev) => prev + rxBytesRef.current);
      txBytesRef.current = 0;
      rxBytesRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Signal state polling (when connected via serial) ──
  useEffect(() => {
    if (!isConnected || config.connectionType !== "serial") {
      setSignalStates({ cts: false, dsr: false, cd: false, ri: false });
      return;
    }
    const interval = setInterval(async () => {
      const svc = serialRef.current;
      if (svc) {
        const states = await svc.readSignals();
        setSignalStates(states);
        // Record history snapshot with RTS/DTR from current config
        const cfg = configRef.current;
        signalHistoryRef.current.push({
          time: Date.now(),
          rts: cfg.rts,
          dtr: cfg.dtr,
          ...states,
        });
        if (signalHistoryRef.current.length > MAX_SIGNAL_HISTORY) {
          signalHistoryRef.current =
            signalHistoryRef.current.slice(-MAX_SIGNAL_HISTORY);
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isConnected, config.connectionType, config.rts, config.dtr]);

  // ── Latency history (keep last 60 values) ──
  useEffect(() => {
    if (latencyMs === null) return;
    setLatencyHistory((prev) => {
      const next = [...prev, latencyMs];
      if (next.length > 60) next.splice(0, next.length - 60);
      return next;
    });
  }, [latencyMs]);

  function toMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  // ── Service helpers ──

  function getSerial(portPath?: string): ISerialService {
    // If portPath is provided and it's a mock port, use MockSerialService
    if (portPath && isMockPort(portPath)) {
      if (
        !serialRef.current ||
        !(serialRef.current instanceof MockSerialService)
      ) {
        // Dispose existing service if any
        if (serialRef.current) {
          serialRef.current.dispose().catch(() => undefined);
        }
        serialRef.current = new MockSerialService(mockSerialRef.current);
        // Wire up serial data callback
        serialRef.current.onData((data: Uint8Array) => {
          const rxEvent = journalRef.current.recordRx(data);
          const bytes = Array.from(rxEvent.bytes);
          rxBytesRef.current += bytes.length;

          // Line-buffer ASCII data without dropping bytes.
          if (receiveModeRef.current === "ascii") {
            bufferAsciiChunk(bytes, rxEvent.seq);
          } else {
            appendLog(
              {
                direction: "received",
                mode: "hex",
                payload: bytesToHex(bytes),
                rawBytes: [...bytes],
                complete: true,
                journalSeqStart: rxEvent.seq,
                journalSeqEnd: rxEvent.seq,
              },
              formatTimestamp(rxEvent.timestamp),
            );
          }
        });

        // Wire up serial disconnect callback
        serialRef.current.onDisconnect(() => {
          flushLineBuffer();
          serialRef.current = null;
          setIsConnected(false);
          setConnectedPort(null);
          setStatusText("模拟串口已断开");
          setError(null);
        });
      }
      return serialRef.current;
    }

    if (!serialRef.current || serialRef.current instanceof MockSerialService) {
      // Dispose mock service if switching to real serial
      if (serialRef.current) {
        serialRef.current.dispose().catch(() => undefined);
      }
      serialRef.current = new TauriSerialService();
      // Wire up serial data callback
      serialRef.current.onData((data: Uint8Array) => {
        const rxEvent = journalRef.current.recordRx(data);
        const bytes = Array.from(rxEvent.bytes);
        rxBytesRef.current += bytes.length;

        // Echo suppression: in TCP server mode, skip data matching what we just wrote
        const lastWrite = lastWriteRef.current;
        if (configRef.current.connectionType === "tcp-server" && lastWrite) {
          const elapsed = Date.now() - lastWrite.time;
          if (
            elapsed < 150 &&
            data.length === lastWrite.data.length &&
            data.every((b, i) => b === lastWrite.data[i])
          ) {
            lastWriteRef.current = null;
            return;
          }
          lastWriteRef.current = null;
        }

        // TCP server broadcast: forward raw bytes BEFORE line-buffering
        if (configRef.current.connectionType === "tcp-server") {
          const ts = formatTimestamp(new Date());
          const prefix = new TextEncoder().encode(`${ts} `);
          const dataWithTs = Array.from(prefix).concat(bytes);
          void getTcpServer().broadcast(dataWithTs);
        }

        // Line-buffer ASCII data without dropping bytes.
        if (receiveModeRef.current === "ascii") {
          bufferAsciiChunk(bytes, rxEvent.seq);
        } else {
          // Hex mode: emit each chunk as-is
          appendLog(
            {
              direction: "received",
              mode: "hex",
              payload: bytesToHex(bytes),
              complete: true,
              journalSeqStart: rxEvent.seq,
              journalSeqEnd: rxEvent.seq,
            },
            formatTimestamp(rxEvent.timestamp),
          );
        }
      });

      // Wire up serial disconnect callback
      serialRef.current.onDisconnect(() => {
        flushLineBuffer(); // flush any remaining buffered data
        serialRef.current = null;
        releaseClaimedPort();
        setIsConnected(false);
        setConnectedPort(null);
        setStatusText("串口已断开");
        setError("设备已断开连接或被系统回收，请重新扫描并打开串口。");
      });
    }
    return serialRef.current;
  }

  function getTcpClient(): ITcpClientService {
    if (!tcpClientRef.current) {
      const svc = new TauriTcpClientService();

      svc.onData((data: Uint8Array) => {
        const bytes = Array.from(data);
        rxBytesRef.current += bytes.length;
        const formatted =
          receiveModeRef.current === "hex"
            ? bytesToHex(bytes)
            : bytesToAscii(bytes);

        // Try to parse the server timestamp prefix from the data
        const TS_RE = /^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]\s/;
        let serverTs: string | undefined;
        let displayPayload = formatted;
        const tsMatch = formatted.match(TS_RE);
        if (tsMatch) {
          serverTs = tsMatch[1];
          displayPayload = formatted.slice(tsMatch[0].length);
        }

        appendLog({
          direction: "received",
          source: "tcp-client",
          mode: receiveModeRef.current,
          payload: displayPayload,
          serverTs,
        });

        // RTT measurement: time since last TCP send
        const lastSend = lastTcpSendRef.current;
        if (lastSend > 0) {
          setLatencyMs(Date.now() - lastSend);
        }
      });

      svc.onConnected(() => {
        const cfg = configRef.current;
        setTcpConnectionStatus("connected");
        setIsConnected(true);
        setConnectedPort({
          path: `${cfg.tcpHost}:${cfg.tcpPort}`,
          baudRate: cfg.baudRate,
        });
        setStatusText("TCP已连接");
        setError(null);
      });

      svc.onDisconnected((reason: string) => {
        setTcpConnectionStatus("disconnected");
        setIsConnected(false);
        setConnectedPort(null);
        setStatusText("TCP已断开");
        if (reason !== "用户断开连接") {
          setError(`TCP断开：${reason}`);
        }
      });

      tcpClientRef.current = svc;
    }
    return tcpClientRef.current;
  }

  function getTcpServer(): ITcpServerService {
    if (!tcpServerRef.current) {
      const svc = new TauriTcpServerService();

      svc.onData((_clientId: string, data: Uint8Array) => {
        const bytes = Array.from(data);
        rxBytesRef.current += bytes.length;
        const formatted =
          receiveModeRef.current === "hex"
            ? bytesToHex(bytes)
            : bytesToAscii(bytes);

        // Forward data to serial port through the same FIFO lifecycle path.
        const s = serialRef.current;
        if (!s) return;
        const transferId = journalRef.current.allocateTransferId();
        void sendSerialBytes(
          s,
          bytes,
          {
            direction: "sent",
            source: "tcp-server",
            mode: receiveModeRef.current,
            payload: formatted,
          },
          transferId,
          () => {
            lastWriteRef.current = { data, time: Date.now() };
          },
        ).catch((error) => {
          appLogger.error(
            "Serial",
            `TCP-server serial forward failed: ${toMessage(error)}`,
          );
        });
      });

      svc.onClientConnected((client) => {
        setTcpServerClients((prev) => [...prev, client]);
      });

      svc.onClientDisconnected((clientId) => {
        setTcpServerClients((prev) => prev.filter((c) => c.id !== clientId));
      });

      svc.onStarted(() => {
        setTcpServerStatus("running");
        setIsConnected(true);
        setStatusText("TCP服务器运行中");
      });

      svc.onStopped(() => {
        setTcpServerStatus("stopped");
        setIsConnected(false);
        setStatusText("TCP服务器已停止");
      });

      tcpServerRef.current = svc;
    }
    return tcpServerRef.current;
  }

  function releaseClaimedPort() {
    releaseSerialPort(claimedPortRef.current, portOwnerRef.current);
    claimedPortRef.current = null;
  }

  function claimConfiguredPort(path: string): boolean {
    if (isMockPort(path)) return true;
    if (claimedPortRef.current && claimedPortRef.current !== path) {
      releaseClaimedPort();
    }
    if (!claimSerialPort(path, portOwnerRef.current)) return false;
    claimedPortRef.current = path;
    return true;
  }

  function cleanupServices() {
    flushPendingLogs(); // flush any pending log entries before cleanup
    // Drain and reset the byte-preserving framer for this session.
    flushLineBuffer();
    resetTextFramer();

    if (tcpClientRef.current) {
      tcpClientRef.current.dispose();
      tcpClientRef.current = null;
    }
    if (tcpServerRef.current) {
      tcpServerRef.current.dispose();
      tcpServerRef.current = null;
    }
    if (serialRef.current) {
      serialRef.current.dispose().catch(() => undefined);
      serialRef.current = null;
    }
    releaseClaimedPort();
  }

  // ── Port scanning ──

  async function refreshPorts(): Promise<number> {
    try {
      const mockEnabled = mockSerialRef.current?.enabled === true;
      const result = await listAvailablePorts(portFilterMode, mockEnabled);
      setPorts(result);
      setError(null);
      return result.length;
    } catch (refreshError) {
      setError(`扫描串口失败：${toMessage(refreshError)}`);
      appLogger.error("Serial", `Port scan failed: ${toMessage(refreshError)}`);
      return 0;
    }
  }

  // ── Logging (batched) ──

  function applyLogs(nextLogs: SerialLogEntry[]) {
    logsRef.current = nextLogs;
    setLogs(nextLogs);
  }

  function appendLog(
    entry: Omit<SerialLogEntry, "id" | "timestamp" | "seq">,
    overrideTs?: string,
  ) {
    const seq = ++seqCounter.current;
    const logEntry: SerialLogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: overrideTs ?? formatTimestamp(),
      seq,
    };
    pendingLogsRef.current.push(logEntry);
    for (const subscriber of logSubscribersRef.current) subscriber(logEntry);
    if (pendingLogsRef.current.length >= BATCH_MAX_SIZE) {
      flushPendingLogs();
    } else {
      scheduleBatchFlush();
    }
  }

  const subscribeLogs = useCallback(
    (subscriber: (entry: SerialLogEntry) => void): (() => void) => {
      logSubscribersRef.current.add(subscriber);
      return () => logSubscribersRef.current.delete(subscriber);
    },
    [],
  );

  function scheduleBatchFlush() {
    if (batchTimerRef.current) return;
    batchTimerRef.current = setTimeout(flushPendingLogs, logBatchFlushMsRef.current);
  }

  function flushPendingLogs() {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    const pending = pendingLogsRef.current;
    if (pending.length === 0) return;
    pendingLogsRef.current = [];

    // If pending is very large (render queue backed up), coalesce into fewer entries
    // to avoid drowning React in a single setState.
    if (pending.length > 200) {
      const truncated = pending.slice(0, 200);
      pendingLogsRef.current = pending.slice(200);
      scheduleBatchFlush();
      const current = logsRef.current;
      const next =
        current.length === 0 ? truncated : [...current, ...truncated];
      if (next.length > MAX_LOGS) {
        if (!logCapWarningRef.current) {
          logCapWarningRef.current = true;
          setTimeout(() => setLogCapWarning(true), 0);
        }
        applyLogs(next.slice(next.length - MAX_LOGS));
      } else {
        applyLogs(next);
      }
      return;
    }

    const current = logsRef.current;
    const next = current.length === 0 ? pending : [...current, ...pending];
    if (next.length > MAX_LOGS) {
      if (!logCapWarningRef.current) {
        logCapWarningRef.current = true;
        setTimeout(() => setLogCapWarning(true), 0);
      }
      applyLogs(next.slice(next.length - MAX_LOGS));
    } else {
      applyLogs(next);
    }
  }

  // ── Byte-preserving ASCII framing ──

  /**
   * Drain buffered bytes as one incomplete RX line. Used on idle timeout (so
   * newline-less device lines like "standalone:..." surface promptly) and on
   * session close. USB-split chunks of ONE line are never drained here because
   * the idle timer resets on every incoming chunk — only a genuine pause
   * (> rxIdleFlushMsRef.current) triggers the flush.
   */
  function flushLineBuffer() {
    if (frameFlushTimerRef.current) {
      clearTimeout(frameFlushTimerRef.current);
      frameFlushTimerRef.current = null;
    }
    const pending = textFramerRef.current.drain().pending;
    if (pending.length === 0) return;

    const payload = bytesToAscii(pending);
    if (!payload) return;
    appendLog({
      direction: "received",
      mode: "ascii",
      payload,
      rawBytes: [...pending],
      complete: false,
    });
  }

  /** Arm a one-shot idle flush so newline-less lines still surface promptly. */
  function armFrameIdleFlush() {
    if (frameFlushTimerRef.current) clearTimeout(frameFlushTimerRef.current);
    frameFlushTimerRef.current = setTimeout(() => {
      frameFlushTimerRef.current = null;
      flushLineBuffer();
    }, rxIdleFlushMsRef.current);
  }

  function resetTextFramer() {
    if (frameFlushTimerRef.current) {
      clearTimeout(frameFlushTimerRef.current);
      frameFlushTimerRef.current = null;
    }
    const pendingBytes = textFramerRef.current.getPending().length;
    if (pendingBytes > 0) {
      appLogger.warn(
        "Serial",
        `Resetting text framer with ${pendingBytes} pending bytes at session boundary`,
      );
    }
    textFramerRef.current.reset();
  }

  function bufferAsciiChunk(bytes: number[], journalSeq: number) {
    if (bytes.length === 0) return;

    // Accumulate incomplete bytes until a newline. A device may deliver one
    // logical line split across many USB chunks (e.g. echo "ver" + "sion\r\n");
    // those arrive within milliseconds, so the idle timer keeps resetting and
    // the whole line reassembles when "\n" arrives — never truncated.
    textFramerRef.current.feed(bytes);
    const frames = textFramerRef.current.takeFrames();

    for (const frame of frames) {
      const frameBytes = [...frame.line, ...frame.ending];
      const payload = bytesToAscii(frameBytes);
      appendLog({
        direction: "received",
        mode: "ascii",
        payload,
        rawBytes: [...frameBytes],
        complete: true,
        journalSeqStart: journalSeq,
        journalSeqEnd: journalSeq,
      });
    }

    // If bytes remain without a newline (e.g. a newline-less "standalone:..."
    // message), arm an idle flush so they surface promptly once RX goes quiet.
    if (textFramerRef.current.hasPending()) {
      armFrameIdleFlush();
    }
  }

  // ── Open / Close ──

  async function openPort() {
    resetTextFramer(); // start a new session without carrying bytes from a closed port

    if (config.connectionType === "tcp-client") {
      setIsBusy(true);
      setError(null);
      try {
        await getTcpClient().connect(
          config.tcpHost,
          config.tcpPort,
          config.tcpProtocol,
        );
      } catch (err) {
        setTcpConnectionStatus("disconnected");
        setError(`TCP连接失败：${toMessage(err)}`);
      } finally {
        setIsBusy(false);
      }
      return;
    }

    if (config.connectionType === "tcp-server") {
      setIsBusy(true);
      setError(null);
      try {
        if (!config.path) {
          throw new Error("请先选择串口。");
        }
        if (!claimConfiguredPort(config.path)) {
          throw new Error(
            `串口 ${config.path} 已被其他标签占用，请先关闭该标签中的连接。`,
          );
        }
        await getSerial(config.path).open({
          path: config.path,
          baudRate: config.baudRate,
          dataBits: config.dataBits,
          parity: config.parity,
          stopBits: config.stopBits,
          flowControl: config.flowControl,
          rts: config.rts,
          dtr: config.dtr,
        });
        if (serialRef.current?.isOpen) {
          await getTcpServer().start(config.tcpPort, config.tcpProtocol);
        }
      } catch (err) {
        if (serialRef.current) {
          await serialRef.current.close().catch(() => undefined);
          serialRef.current = null;
        }
        releaseClaimedPort();
        setIsConnected(false);
        setConnectedPort(null);
        setTcpServerStatus("stopped");
        setError(`启动失败：${toMessage(err)}`);
      } finally {
        setIsBusy(false);
      }
      return;
    }

    // Serial mode
    setIsBusy(true);
    setError(null);
    try {
      if (!config.path) {
        throw new Error("请先选择串口。");
      }
      if (!claimConfiguredPort(config.path)) {
        throw new Error(
          `串口 ${config.path} 已被其他标签占用，请先关闭该标签中的连接。`,
        );
      }

      await getSerial(config.path).open({
        path: config.path,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        parity: config.parity,
        stopBits: config.stopBits,
        flowControl: config.flowControl,
        rts: config.rts,
        dtr: config.dtr,
      });

      setIsConnected(true);
      setConnectedPort({ path: config.path, baudRate: config.baudRate });
      setStatusText("已连接");
    } catch (openError) {
      releaseClaimedPort();
      serialRef.current = null;
      setIsConnected(false);
      setConnectedPort(null);
      setStatusText("连接失败");
      setError(`打开串口失败：${toMessage(openError)}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function closePort() {
    flushPendingLogs(); // flush any pending log entries before closing
    // TCP client disconnect
    if (
      config.connectionType === "tcp-client" &&
      tcpConnectionStatus === "connected"
    ) {
      if (tcpClientRef.current) {
        setIsBusy(true);
        try {
          await tcpClientRef.current.disconnect();
        } catch (err) {
          setError(`断开失败：${toMessage(err)}`);
        } finally {
          setTcpConnectionStatus("disconnected");
          setIsConnected(false);
          setConnectedPort(null);
          setStatusText("TCP已断开");
          setIsBusy(false);
        }
      }
      return;
    }

    // TCP server stop (also close serial)
    if (
      config.connectionType === "tcp-server" &&
      tcpServerStatus === "running"
    ) {
      setIsBusy(true);
      try {
        if (tcpServerRef.current) {
          await tcpServerRef.current.stop();
        }
        if (serialRef.current) {
          await serialRef.current.close();
        }
      } catch (err) {
        setError(`停止失败：${toMessage(err)}`);
      } finally {
        releaseClaimedPort();
        setTcpServerStatus("stopped");
        setIsConnected(false);
        setConnectedPort(null);
        setStatusText("已停止");
        setIsBusy(false);
      }
      return;
    }

    // Serial port close
    setIsBusy(true);
    try {
      flushLineBuffer(); // flush any remaining buffered data
      if (serialRef.current) {
        await serialRef.current.close();
      }
      serialRef.current = null;
      releaseClaimedPort();
      setIsConnected(false);
      setConnectedPort(null);
      setStatusText("未连接");
      setError(null);
    } catch (closeError) {
      setError(`关闭串口失败：${toMessage(closeError)}`);
    } finally {
      setIsBusy(false);
    }
  }

  // ── Send ──

  function pushSendQueue(label: string) {
    sendQueueRef.current = [...sendQueueRef.current, label];
    setSendQueue(sendQueueRef.current);
  }

  function popSendQueue() {
    const next = sendQueueRef.current.slice(1);
    sendQueueRef.current = next;
    setSendQueue(next);
  }

  async function sendSerialBytes(
    service: ISerialService,
    bytes: number[],
    txEntry: Omit<SerialLogEntry, "id" | "timestamp" | "seq">,
    transferId = journalRef.current.allocateTransferId(),
    onDispatch?: () => void,
  ) {
    pushSendQueue(txEntry.payload);
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        popSendQueue();
      }
    };
    try {
      await service.sendBinary(bytes, {
        onDispatch: (dispatchedBytes) => {
          onDispatch?.();
          const event = journalRef.current.recordTxDispatched(
            transferId,
            dispatchedBytes,
          );
          appendLog(
            {
              ...txEntry,
              rawBytes: Array.from(dispatchedBytes),
              transferId,
              complete: true,
              journalSeqStart: event.seq,
              journalSeqEnd: event.seq,
            },
            formatTimestamp(event.timestamp),
          );
        },
        onComplete: (completedBytes) => {
          settle();
          journalRef.current.recordTxCompleted(transferId, completedBytes);
        },
        onError: (failedBytes, error) => {
          settle();
          journalRef.current.recordTxFailed(transferId, failedBytes, error);
        },
      });
    } catch (error) {
      settle();
      throw error;
    }
  }

  async function sendData(
    value: string,
    sendMode: SendMode,
    appendNewline: string,
  ) {
    if (config.connectionType === "tcp-client") {
      await sendTcpData(value, sendMode, appendNewline);
      return;
    }

    const s = serialRef.current;
    if (!s) {
      const notOpenError = new Error("串口未打开，无法发送数据。");
      setError(notOpenError.message);
      throw notOpenError;
    }

    setIsBusy(true);
    setError(null);

    try {
      const bytes = encodeSendPayload(value, sendMode, appendNewline);
      const termBytes = enderStringToBytes(appendNewline || "");
      const txEntry: Omit<SerialLogEntry, "id" | "timestamp" | "seq"> = {
        direction: "sent",
        mode: sendMode,
        payload:
          sendMode === "hex"
            ? bytesToHex(bytes)
            // ASCII 日志只显示用户输入的命令；结尾符以字节追加到线上，单独存
            // terminator 供显示为 [0D 0A]，避免形如字面文本 \r\n 的误导。
            : value,
        ...(sendMode === "ascii" && termBytes.length > 0
          ? { terminator: bytesToHex(termBytes) }
          : {}),
      };

      await sendSerialBytes(s, bytes, txEntry);
      txBytesRef.current += bytes.length;
    } catch (sendError) {
      setError(`发送失败：${toMessage(sendError)}`);
      throw sendError;
    } finally {
      setIsBusy(false);
    }
  }

  async function sendTcpData(
    value: string,
    sendMode: import("../serial/types.ts").SendMode,
    appendNewline: string,
  ) {
    setError(null);
    try {
      const bytes = encodeSendPayload(value, sendMode, appendNewline);
      const termBytes = enderStringToBytes(appendNewline || "");

      if (!tcpClientRef.current) {
        throw new Error("TCP 未连接");
      }
      lastTcpSendRef.current = Date.now();
      const txTs = formatTimestamp(); // timestamp BEFORE write
      await tcpClientRef.current.send(bytes);
      txBytesRef.current += bytes.length;
      appendLog(
        {
          direction: "sent",
          mode: sendMode,
          payload:
            sendMode === "hex"
              ? bytesToHex(bytes)
              // 与 sendData 一致：日志只显示命令本身，结尾符以字节追加到线上，
              // 单独存 terminator 供显示为 [0D 0A]。
              : value,
          ...(sendMode === "ascii" && termBytes.length > 0
            ? { terminator: bytesToHex(termBytes) }
            : {}),
        },
        txTs,
      );
    } catch (err) {
      setError(`TCP发送失败：${toMessage(err)}`);
      throw err;
    }
  }

  // ── File send ──

  async function sendFile(filePath: string) {
    const s = serialRef.current;
    if (!s) {
      setError("串口未打开，无法发送文件。");
      return;
    }

    setIsBusy(true);
    setError(null);
    setFileSendProgress(0);

    try {
      const bytes = await readFile(filePath);
      const total = bytes.length;
      if (total === 0) {
        throw new Error("文件内容为空。");
      }

      const CHUNK_SIZE = 256;
      let lastReportedPct = -1;
      for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
        const chunk = Array.from(
          bytes.slice(offset, Math.min(offset + CHUNK_SIZE, total)),
        );
        await sendSerialBytes(s, chunk, {
          direction: "sent",
          mode: "hex",
          payload: bytesToHex(chunk),
        });
        txBytesRef.current += chunk.length;
        const pct = Math.min(
          100,
          Math.round(((offset + CHUNK_SIZE) / total) * 100),
        );
        if (pct !== lastReportedPct) {
          lastReportedPct = pct;
          setFileSendProgress(pct);
        }
      }

      setFileSendProgress(100);
    } catch (sendFileError) {
      setError(`发送文件失败：${toMessage(sendFileError)}`);
    } finally {
      setIsBusy(false);
      setTimeout(() => setFileSendProgress(null), 1000);
    }
  }

  // ── Clear logs ──

  function clearLogs(target: "all" | "sent" | "received") {
    if (target === "all") {
      pendingLogsRef.current = [];
      applyLogs([]);
      return;
    }
    const next = logsRef.current.filter((item) => item.direction !== target);
    pendingLogsRef.current = pendingLogsRef.current.filter(
      (item) => item.direction !== target,
    );
    applyLogs(next);
  }

  // ── TCP Client ──

  async function tcpConnect() {
    setTcpConnectionStatus("connecting");
    setError(null);
    try {
      await getTcpClient().connect(
        config.tcpHost,
        config.tcpPort,
        config.tcpProtocol,
      );
    } catch (err) {
      setTcpConnectionStatus("disconnected");
      setError(`TCP连接失败：${toMessage(err)}`);
    }
  }

  async function tcpDisconnect() {
    if (tcpClientRef.current) {
      try {
        await tcpClientRef.current.disconnect();
      } catch (err) {
        setError(`断开失败：${toMessage(err)}`);
      }
    }
    setTcpConnectionStatus("disconnected");
    setIsConnected(false);
    setConnectedPort(null);
    setStatusText("TCP已断开");
  }

  // ── TCP Server ──

  async function tcpServerStart() {
    setTcpServerStatus("starting");
    setError(null);
    try {
      await getTcpServer().start(config.tcpPort, config.tcpProtocol);
    } catch (err) {
      setTcpServerStatus("stopped");
      setError(`TCP服务器启动失败：${toMessage(err)}`);
    }
  }

  async function tcpServerStop() {
    if (tcpServerRef.current) {
      try {
        await tcpServerRef.current.stop();
      } catch (err) {
        setError(`停止TCP服务器失败：${toMessage(err)}`);
      }
    }
    setTcpServerStatus("stopped");
    setTcpServerClients([]);
  }

  async function tcpServerBroadcast(data: number[]) {
    if (tcpServerRef.current) {
      await tcpServerRef.current.broadcast(data).catch(() => undefined);
    }
  }

  async function setSignals(rts: boolean, dtr: boolean) {
    await serialRef.current?.setSignals(rts, dtr).catch(() => undefined);
  }

  async function clearSerialBuffer() {
    if (config.connectionType !== "serial") return;
    // Clear both input and output buffers to discard stale data
    await serialRef.current?.clearBuffer("all").catch(() => undefined);
  }

  // ── Init / Cleanup ──

  useEffect(() => {
    void refreshPorts();
    return () => {
      cleanupServices();
    };
  }, []);

  return {
    ports,
    logs,
    isConnected,
    isBusy,
    statusText,
    connectedPort,
    error,
    fileSendProgress,
    logCapWarning,
    sendQueue,
    subscribeLogs,
    refreshPorts,
    openPort,
    closePort,
    sendData,
    sendFile,
    clearLogs,
    // TCP-specific
    connectionType: config.connectionType,
    tcpConnectionStatus,
    tcpServerStatus,
    tcpServerClients,
    latencyMs,
    tcpConnect,
    tcpDisconnect,
    tcpServerStart,
    tcpServerStop,
    tcpServerBroadcast,
    setSignals,
    clearSerialBuffer,
    // Visualization states
    txBytes,
    rxBytes,
    txRate,
    rxRate,
    latencyHistory,
    signalStates,
    getSignalHistory: () => signalHistoryRef.current,
  };
}
