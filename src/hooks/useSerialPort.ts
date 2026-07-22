import { useEffect, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { bytesToAscii, bytesToHex, formatTimestamp, parseHexString } from "../utils/hexConverter.ts";
import { appLogger } from "../utils/appLogger.ts";

import type { ISerialService } from "../serial/SerialService.ts";
import { TauriSerialService, listAvailablePorts } from "../serial/SerialService.ts";
import type { ITcpClientService } from "../tcp/TcpClientService.ts";
import { TauriTcpClientService } from "../tcp/TcpClientService.ts";
import type { ITcpServerService } from "../tcp/TcpServerService.ts";
import { TauriTcpServerService } from "../tcp/TcpServerService.ts";
import type { PortSummary, SerialLogEntry, ReceiveMode, SendMode } from "../serial/types.ts";
import type { ConnectionType, TcpConnectionStatus, TcpServerStatus, TcpClientInfo, TcpProtocol } from "../tcp/types.ts";

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

// ── Hook ──

export function useSerialPort({
  config,
  receiveMode,
}: {
  config: SerialConfig;
  receiveMode: ReceiveMode;
}) {
  const serialRef = useRef<ISerialService | null>(null);
  const tcpClientRef = useRef<ITcpClientService | null>(null);
  const tcpServerRef = useRef<ITcpServerService | null>(null);
  const receiveModeRef = useRef(receiveMode);
  const configRef = useRef(config);
  // Keep configRef in sync so callback closures always read latest config
  configRef.current = config;
  const seqCounter = useRef(0);
  // Batch pending log entries to reduce React state updates
  const MAX_LOGS = 10_000;
  const BATCH_FLUSH_MS = 50;
  const BATCH_MAX_SIZE = 50;
  const pendingLogsRef = useRef<SerialLogEntry[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last write to serial for echo suppression in TCP server mode
  const lastWriteRef = useRef<{ data: Uint8Array; time: number } | null>(null);
  // TCP latency measurement
  const lastTcpSendRef = useRef<number>(0);
  // Line buffer for serial data: accumulate bytes and emit on newline
  const lineBufferRef = useRef<number[]>([]);
  const lineFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [logCapWarning, setLogCapWarning] = useState(false);
  const logCapWarningRef = useRef(false);
  const [ports, setPorts] = useState<PortSummary[]>([]);
  const [logs, setLogs] = useState<SerialLogEntry[]>([]);
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
  const [signalStates, setSignalStates] = useState<{ cts: boolean; dsr: boolean; cd: boolean; ri: boolean }>({
    cts: false,
    dsr: false,
    cd: false,
    ri: false,
  });
  const signalHistoryRef = useRef<{ time: number; rts: boolean; dtr: boolean; cts: boolean; dsr: boolean; cd: boolean; ri: boolean }[]>([]);
  const MAX_SIGNAL_HISTORY = 300;

  // TCP-specific state
  const [tcpConnectionStatus, setTcpConnectionStatus] = useState<TcpConnectionStatus>("disconnected");
  const [tcpServerStatus, setTcpServerStatus] = useState<TcpServerStatus>("stopped");
  const [tcpServerClients, setTcpServerClients] = useState<TcpClientInfo[]>([]);

  useEffect(() => {
    receiveModeRef.current = receiveMode;
  }, [receiveMode]);

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
          signalHistoryRef.current = signalHistoryRef.current.slice(-MAX_SIGNAL_HISTORY);
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

  function getSerial(): ISerialService {
    if (!serialRef.current) {
      serialRef.current = new TauriSerialService();
      // Wire up serial data callback
      serialRef.current.onData((data: Uint8Array) => {
        const bytes = Array.from(data);
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

        // Line-buffer ASCII data: accumulate bytes and flush on \n
        if (receiveModeRef.current === "ascii") {
          for (const b of bytes) {
            lineBufferRef.current.push(b);
            if (b === 0x0A) {
              // \n — flush complete line, include \n in payload
              const payload = bytesToAscii(lineBufferRef.current);
              lineBufferRef.current = [];
              if (payload) {
                appendLog({ direction: "received", mode: "ascii", payload });
              }
            }
          }
          // Reset flush timer for any remaining incomplete data
          resetLineFlushTimer();
        } else {
          // Hex mode: emit each chunk as-is
          appendLog({
            direction: "received",
            mode: "hex",
            payload: bytesToHex(bytes),
          });
        }
      });

      // Wire up serial disconnect callback
      serialRef.current.onDisconnect(() => {
        flushLineBuffer(); // flush any remaining buffered data
        serialRef.current = null;
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
        setConnectedPort({ path: `${cfg.tcpHost}:${cfg.tcpPort}`, baudRate: cfg.baudRate });
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

        appendLog({
          direction: "sent",
          source: "tcp-server",
          mode: receiveModeRef.current,
          payload: formatted,
        });

        // Record the write for echo suppression
        lastWriteRef.current = { data, time: Date.now() };

        // Forward data to serial port
        const s = serialRef.current;
        if (s) {
          s.sendBinary(bytes).catch(() => undefined);
        }
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

  function cleanupServices() {
    flushPendingLogs(); // flush any pending log entries before cleanup
    // Flush and clean up line buffer
    if (lineFlushTimerRef.current) clearTimeout(lineFlushTimerRef.current);
    lineFlushTimerRef.current = null;
    lineBufferRef.current = [];

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
  }

  // ── Port scanning ──

  async function refreshPorts(): Promise<number> {
    try {
      const result = await listAvailablePorts();
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

  function appendLog(entry: Omit<SerialLogEntry, "id" | "timestamp" | "seq">) {
    const seq = ++seqCounter.current;
    pendingLogsRef.current.push({
      ...entry,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: formatTimestamp(),
      seq,
    });
    if (pendingLogsRef.current.length >= BATCH_MAX_SIZE) {
      flushPendingLogs();
    } else {
      scheduleBatchFlush();
    }
  }

  function scheduleBatchFlush() {
    if (batchTimerRef.current) return;
    batchTimerRef.current = setTimeout(flushPendingLogs, BATCH_FLUSH_MS);
  }

  function flushPendingLogs() {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    const pending = pendingLogsRef.current;
    if (pending.length === 0) return;
    pendingLogsRef.current = [];
    setLogs((current) => {
      if (current.length === 0) return pending;
      const next = [...current, ...pending];
      if (next.length > MAX_LOGS) {
        if (!logCapWarningRef.current) {
          logCapWarningRef.current = true;
          setTimeout(() => setLogCapWarning(true), 0);
        }
        return next.slice(next.length - MAX_LOGS);
      }
      return next;
    });
  }

  // ── Line buffer for ASCII receive ──

  /** Flush accumulated bytes as a complete log entry */
  function flushLineBuffer() {
    const buf = lineBufferRef.current;
    lineBufferRef.current = [];
    if (lineFlushTimerRef.current) {
      clearTimeout(lineFlushTimerRef.current);
      lineFlushTimerRef.current = null;
    }
    if (buf.length === 0) return;

    const payload = bytesToAscii(buf);
    if (!payload) return;

    appendLog({ direction: "received", mode: "ascii", payload });
  }

  function resetLineFlushTimer() {
    if (lineFlushTimerRef.current) clearTimeout(lineFlushTimerRef.current);
    lineFlushTimerRef.current = setTimeout(flushLineBuffer, 100);
  }

  function clearLineBuffer() {
    if (lineFlushTimerRef.current) clearTimeout(lineFlushTimerRef.current);
    lineFlushTimerRef.current = null;
    lineBufferRef.current = [];
  }

  // ── Open / Close ──

  async function openPort() {
    clearLineBuffer(); // clear any stale buffered data from previous session

    if (config.connectionType === "tcp-client") {
      setIsBusy(true);
      setError(null);
      try {
        await getTcpClient().connect(config.tcpHost, config.tcpPort, config.tcpProtocol);
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
        await getSerial().open({
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

      await getSerial().open({
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
    if (config.connectionType === "tcp-client" && tcpConnectionStatus === "connected") {
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
    if (config.connectionType === "tcp-server" && tcpServerStatus === "running") {
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

  async function sendData(
    value: string,
    sendMode: SendMode,
    appendNewline: "" | "\r\n" | "\r" | "\n",
  ) {
    if (config.connectionType === "tcp-client") {
      await sendTcpData(value, sendMode, appendNewline);
      return;
    }

    const s = serialRef.current;
    if (!s) {
      setError("串口未打开，无法发送数据。");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      if (sendMode === "hex") {
        const newlineBytes = appendNewline
          ? Array.from(new TextEncoder().encode(appendNewline))
          : [];
        let bytes: number[] = [];

        const hasPayload = (value || "").replace(/\s+/g, "") !== "";
        if (hasPayload) {
          const parsed = parseHexString(value);
          bytes = parsed.concat(newlineBytes);
        } else if (newlineBytes.length > 0) {
          bytes = newlineBytes;
        }

        if (!bytes || bytes.length === 0) {
          throw new Error("发送内容不能为空。");
        }

        appendLog({
          direction: "sent",
          mode: sendMode,
          payload: bytesToHex(bytes),
        });
        txBytesRef.current += bytes.length;
        await s.sendBinary(bytes);
      } else {
        const finalValue = `${value}${appendNewline}`;
        if (!finalValue) {
          throw new Error("发送内容不能为空。");
        }

        appendLog({
          direction: "sent",
          mode: sendMode,
          payload: finalValue,
        });
        txBytesRef.current += new TextEncoder().encode(finalValue).length;
        await s.sendText(finalValue);
      }
    } catch (sendError) {
      setError(`发送失败：${toMessage(sendError)}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function sendTcpData(
    value: string,
    sendMode: import("../serial/types.ts").SendMode,
    appendNewline: "" | "\r\n" | "\r" | "\n",
  ) {
    setError(null);
    try {
      let bytes: number[];

      if (sendMode === "hex") {
        const newlineBytes = appendNewline
          ? Array.from(new TextEncoder().encode(appendNewline))
          : [];
        const hasPayload = (value || "").replace(/\s+/g, "") !== "";
        if (hasPayload) {
          bytes = parseHexString(value).concat(newlineBytes);
        } else if (newlineBytes.length > 0) {
          bytes = newlineBytes;
        } else {
          throw new Error("发送内容不能为空。");
        }
      } else {
        const finalValue = `${value}${appendNewline}`;
        if (!finalValue) throw new Error("发送内容不能为空。");
        bytes = Array.from(new TextEncoder().encode(finalValue));
      }

      appendLog({
        direction: "sent",
        mode: sendMode,
        payload:
          sendMode === "hex"
            ? bytesToHex(bytes)
            : new TextDecoder().decode(new Uint8Array(bytes)),
      });

      if (!tcpClientRef.current) {
        throw new Error("TCP 未连接");
      }
      lastTcpSendRef.current = Date.now();
      txBytesRef.current += bytes.length;
      await tcpClientRef.current.send(bytes);
    } catch (err) {
      setError(`TCP发送失败：${toMessage(err)}`);
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

      const CHUNK_SIZE = 16;
      for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
        const chunk = Array.from(bytes.slice(offset, offset + CHUNK_SIZE));
        await s.sendBinary(chunk);
        txBytesRef.current += chunk.length;
        setFileSendProgress(
          Math.min(100, Math.round(((offset + CHUNK_SIZE) / total) * 100)),
        );
      }

      setFileSendProgress(100);
      appendLog({
        direction: "sent",
        mode: "ascii",
        payload: `[文件] ${filePath} (${total} bytes)`,
      });
    } catch (sendFileError) {
      setError(`发送文件失败：${toMessage(sendFileError)}`);
    } finally {
      setIsBusy(false);
      setTimeout(() => setFileSendProgress(null), 1000);
    }
  }

  // ── Clear logs ──

  function clearLogs(target: "all" | "sent" | "received") {
    setLogs((current) => {
      if (target === "all") return [];
      return current.filter((item) => item.direction !== target);
    });
  }

  // ── TCP Client ──

  async function tcpConnect() {
    setTcpConnectionStatus("connecting");
    setError(null);
    try {
      await getTcpClient().connect(config.tcpHost, config.tcpPort, config.tcpProtocol);
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
