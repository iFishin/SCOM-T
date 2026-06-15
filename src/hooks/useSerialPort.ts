import { useEffect, useRef, useState } from "react";
import {
  DataBits,
  FlowControl,
  Parity,
  SerialPort,
  StopBits,
  type PortInfo,
} from "tauri-plugin-serialplugin-api";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  bytesToAscii,
  bytesToHex,
  formatTimestamp,
  normalizePluginPayload,
  parseHexString,
} from "../utils/hexConverter.ts";

export type SendMode = "ascii" | "hex";
export type ReceiveMode = "ascii" | "hex";
export type SerialLogDirection = "sent" | "received";
export type LogSource = "serial" | "tcp-client" | "tcp-server";
export type LogDisplayMode = "card" | "text";

export type SerialLogEntry = {
  id: string;
  direction: SerialLogDirection;
  source?: LogSource;
  mode: SendMode | ReceiveMode;
  payload: string;
  timestamp: string;
  /** Server-side timestamp embedded in TCP data stream, parsed for display */
  serverTs?: string;
  seq: number;
};

// ── TCP / Connection types ──

export type ConnectionType = "serial" | "tcp-client" | "tcp-server";
export type TcpProtocol = "raw" | "rfc2217";
export type TcpConnectionStatus = "disconnected" | "connecting" | "connected";
export type TcpServerStatus = "stopped" | "starting" | "running";

export type TcpClientInfo = {
  id: string;
  address: string;
};

export type SerialConfig = {
  path: string;
  baudRate: number;
  dataBits: "5" | "6" | "7" | "8";
  parity: "none" | "odd" | "even";
  stopBits: "1" | "1.5" | "2";
  // TCP / remote fields
  connectionType: ConnectionType;
  tcpHost: string;
  tcpPort: number;
  tcpProtocol: TcpProtocol;
};

export type PortSummary = {
  path: string;
  label: string;
  detail: PortInfo;
};

export type SelectOption<T extends string> = {
  label: string;
  value: T;
};

export const BAUD_RATES = [
  // 低速 (< 9600)
  50, 75, 110, 134, 150, 200, 300, 600, 1200, 1800, 2400, 4800,

  // 标准速率 (9600 - 115200)
  9600, 14400, 19200, 28800, 38400, 57600, 76800, 115200,

  // 高速 (128k - 921k)
  128000, 144000, 153600, 230400, 256000, 307200, 460800, 576000, 614400,
  691200, 921600,

  // 超高速 (1M - 4M)
  1000000, 1152000, 1500000, 1843200, 2000000, 2457600, 2500000, 2764800,
  3000000, 3500000, 3686400, 4000000,
];

export const DATA_BITS_OPTIONS: SelectOption<SerialConfig["dataBits"]>[] = [
  { label: "5", value: "5" },
  { label: "6", value: "6" },
  { label: "7", value: "7" },
  { label: "8", value: "8" },
];

export const PARITY_OPTIONS: SelectOption<SerialConfig["parity"]>[] = [
  { label: "无", value: "none" },
  { label: "奇校验", value: "odd" },
  { label: "偶校验", value: "even" },
];

export const STOP_BITS_OPTIONS: SelectOption<SerialConfig["stopBits"]>[] = [
  { label: "1", value: "1" },
  { label: "1.5", value: "1.5" },
  { label: "2", value: "2" },
];

function mapDataBits(value: SerialConfig["dataBits"]): DataBits {
  return (
    {
      "5": DataBits.Five,
      "6": DataBits.Six,
      "7": DataBits.Seven,
      "8": DataBits.Eight,
    } as const
  )[value];
}

function mapParity(value: SerialConfig["parity"]): Parity {
  return (
    {
      none: Parity.None,
      odd: Parity.Odd,
      even: Parity.Even,
    } as const
  )[value];
}

function mapStopBits(value: SerialConfig["stopBits"]): StopBits {
  if (value === "1.5") {
    throw new Error("当前串口插件不支持 1.5 停止位，请改用 1 或 2。");
  }

  return value === "2" ? StopBits.Two : StopBits.One;
}

function formatPortLabel(port: PortInfo) {
  const meta = [port.manufacturer, port.product]
    .filter((item) => item && item !== "Unknown")
    .join(" / ");

  return meta ? `${port.path} · ${meta}` : port.path;
}

export function useSerialPort({
  config,
  receiveMode,
}: {
  config: SerialConfig;
  receiveMode: ReceiveMode;
}) {
  const portRef = useRef<SerialPort | null>(null);
  const receiveModeRef = useRef(receiveMode);
  const seqCounter = useRef(0);
  // Track last write to serial for echo suppression in TCP server mode
  const lastWriteRef = useRef<{ data: Uint8Array; time: number } | null>(null);
  // TCP latency measurement
  const lastTcpSendRef = useRef<number>(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
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

  // TCP-specific state
  const [tcpConnectionStatus, setTcpConnectionStatus] = useState<TcpConnectionStatus>("disconnected");
  const [tcpServerStatus, setTcpServerStatus] = useState<TcpServerStatus>("stopped");
  const [tcpServerClients, setTcpServerClients] = useState<TcpClientInfo[]>([]);

  useEffect(() => {
    receiveModeRef.current = receiveMode;
  }, [receiveMode]);

  function toMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  async function refreshPorts(): Promise<number> {
    try {
      let result = await SerialPort.available_ports();
      if (Object.keys(result).length === 0) {
        result = await SerialPort.available_ports_direct();
      }

      const normalized = Object.entries(result).map(([portName, port]) => {
        const detail = { ...port, path: portName };
        return {
          path: portName,
          label: formatPortLabel(detail),
          detail,
        };
      });

      setPorts(normalized);
      setError(null);
      return normalized.length;
    } catch (refreshError) {
      setError(`扫描串口失败：${toMessage(refreshError)}`);
      return 0;
    }
  }

  function appendLog(entry: Omit<SerialLogEntry, "id" | "timestamp" | "seq">) {
    const seq = ++seqCounter.current;
    setLogs((current) => {
      const next = [
        ...current,
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: formatTimestamp(),
          seq,
        },
      ];
      return next.sort((a, b) => a.seq - b.seq);
    });
  }

  // ── TCP event listeners ──

  useEffect(() => {
    if (config.connectionType !== "tcp-client" && config.connectionType !== "tcp-server") return;

    const unlisteners: (() => void)[] = [];

    async function setup() {
      const { listen } = await import("@tauri-apps/api/event");

      if (config.connectionType === "tcp-client") {
        // TCP data received (from server, may include server timestamp prefix)
        const TS_RE = /^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]\s/;
        const un1 = await listen<{ data: number[] }>("tcp-data", (event) => {
          const bytes = new Uint8Array(event.payload.data);
          const formatted =
            receiveModeRef.current === "hex"
              ? bytesToHex(bytes)
              : bytesToAscii(bytes);

          // Try to parse the server timestamp prefix from the data
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
        unlisteners.push(un1);

        // TCP connected
        const un2 = await listen("tcp-connected", () => {
          setTcpConnectionStatus("connected");
          setIsConnected(true);
          setConnectedPort({ path: `${config.tcpHost}:${config.tcpPort}`, baudRate: config.baudRate });
          setStatusText("TCP已连接");
          setError(null);
        });
        unlisteners.push(un2);

        // TCP disconnected
        const un3 = await listen<{ reason: string }>("tcp-disconnected", (event) => {
          setTcpConnectionStatus("disconnected");
          setIsConnected(false);
          setConnectedPort(null);
          setStatusText("TCP已断开");
          if (event.payload.reason !== "用户断开连接") {
            setError(`TCP断开：${event.payload.reason}`);
          }
        });
        unlisteners.push(un3);
      }

      if (config.connectionType === "tcp-server") {
        // Data from TCP client → forward to serial port
        const un1 = await listen<{ clientId: string; data: number[] }>("tcp-server-data", async (event) => {
          const raw = event.payload.data;
          const bytes = new Uint8Array(raw);
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
          lastWriteRef.current = { data: bytes, time: Date.now() };

          const currentPort = portRef.current;
          if (currentPort) {
            try {
              await currentPort.writeBinary(raw);
            } catch {
              // Serial write failed — ignore
            }
          }
        });
        unlisteners.push(un1);

        const un2 = await listen<{ id: string; address: string }>("tcp-server-client-connected", (event) => {
          setTcpServerClients((prev) => [...prev, { id: event.payload.id, address: event.payload.address }]);
        });
        unlisteners.push(un2);

        const un3 = await listen<{ id: string }>("tcp-server-client-disconnected", (event) => {
          setTcpServerClients((prev) => prev.filter((c) => c.id !== event.payload.id));
        });
        unlisteners.push(un3);

        const un4 = await listen("tcp-server-started", () => {
          setTcpServerStatus("running");
          setIsConnected(true);
          setStatusText("TCP服务器运行中");
        });
        unlisteners.push(un4);

        const un5 = await listen("tcp-server-stopped", () => {
          setTcpServerStatus("stopped");
          setIsConnected(false);
          setStatusText("TCP服务器已停止");
        });
        unlisteners.push(un5);
      }
    }

    setup();

    return () => {
      for (const un of unlisteners) un();
    };
  }, [config.connectionType, config.tcpHost, config.tcpPort]);

  async function closePort() {
    // If TCP client is active, disconnect it first
    if (config.connectionType === "tcp-client" && tcpConnectionStatus === "connected") {
      await tcpDisconnect();
      return;
    }

    // If TCP server is running, stop it first
    if (config.connectionType === "tcp-server" && tcpServerStatus === "running") {
      await tcpServerStop();
      // Fall through to also close serial port
    }

    const currentPort = portRef.current;
    if (!currentPort) {
      setIsConnected(false);
      setConnectedPort(null);
      setStatusText("未连接");
      return;
    }

    setIsBusy(true);
    try {
      await currentPort.stopListening().catch(() => undefined);
      await currentPort.cancelAllListeners().catch(() => undefined);
      await currentPort.close();
      portRef.current = null;
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

  async function openPort() {
    if (config.connectionType === "tcp-client") {
      await tcpConnect();
      return;
    }

    if (config.connectionType === "tcp-server") {
      // For TCP server mode: first open serial port, then start TCP server
      await openSerialPort();
      if (portRef.current) {
        await tcpServerStart();
      }
      return;
    }

    await openSerialPort();
  }

  async function openSerialPort() {
    setIsBusy(true);
    setError(null);
    try {
      if (!config.path) {
        throw new Error("请先选择串口。");
      }

      if (portRef.current) {
        await closePort();
      }

      const serial = new SerialPort({
        path: config.path,
        baudRate: config.baudRate,
        dataBits: mapDataBits(config.dataBits),
        flowControl: FlowControl.None,
        parity: mapParity(config.parity),
        stopBits: mapStopBits(config.stopBits),
        timeout: 50,
      });

      await SerialPort.forceClose(config.path).catch(() => undefined);
      await serial.open();
      await serial.startListening();
      await serial.listen((payload) => {
        const bytes = normalizePluginPayload(payload);
        const dataArr = new Uint8Array(bytes);

        // Echo suppression: in TCP server mode, skip data that matches
        // what we just wrote to the serial port (driver echo / loopback)
        const lastWrite = lastWriteRef.current;
        if (config.connectionType === "tcp-server" && lastWrite) {
          const elapsed = Date.now() - lastWrite.time;
          if (
            elapsed < 150 &&
            dataArr.length === lastWrite.data.length &&
            dataArr.every((b, i) => b === lastWrite.data[i])
          ) {
            lastWriteRef.current = null;
            return; // Suppress echo — don't log or broadcast
          }
          // Clear stale write marker regardless
          lastWriteRef.current = null;
        }

        const formatted =
          receiveModeRef.current === "hex"
            ? bytesToHex(bytes)
            : bytesToAscii(bytes);

        appendLog({
          direction: "received",
          mode: receiveModeRef.current,
          payload: formatted,
        });

        // In TCP server mode, broadcast serial data to all connected TCP clients
        // with the server's local timestamp embedded in the data stream
        if (config.connectionType === "tcp-server") {
          const ts = formatTimestamp(new Date());
          const prefix = new TextEncoder().encode(`${ts} `);
          const dataWithTs = Array.from(prefix).concat(bytes);
          void tcpServerBroadcast(dataWithTs);
        }
      }, false);
      await serial.disconnected(() => {
        portRef.current = null;
        setIsConnected(false);
        setConnectedPort(null);
        setStatusText("串口已断开");
        setError("设备已断开连接或被系统回收，请重新扫描并打开串口。");
      });

      portRef.current = serial;
      setIsConnected(true);
      setConnectedPort({
        path: config.path,
        baudRate: config.baudRate,
      });
      setStatusText("已连接");
    } catch (openError) {
      portRef.current = null;
      setIsConnected(false);
      setConnectedPort(null);
      setStatusText("连接失败");
      setError(`打开串口失败：${toMessage(openError)}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function sendData(
    value: string,
    sendMode: SendMode,
    appendNewline: "" | "\r\n" | "\r" | "\n",
  ) {
    if (config.connectionType === "tcp-client") {
      await sendTcpData(value, sendMode, appendNewline);
      return;
    }

    const currentPort = portRef.current;
    if (!currentPort) {
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
        await currentPort.writeBinary(bytes);
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
        await currentPort.write(finalValue);
      }
    } catch (sendError) {
      setError(`发送失败：${toMessage(sendError)}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function sendFile(filePath: string) {
    const currentPort = portRef.current;
    if (!currentPort) {
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
        await currentPort.writeBinary(chunk);
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

  function clearLogs(target: "all" | "sent" | "received") {
    setLogs((current) => {
      if (target === "all") {
        return [];
      }

      return current.filter((item) => item.direction !== target);
    });
  }

  // ── TCP Client Actions ──

  async function tcpConnect() {
    setTcpConnectionStatus("connecting");
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tcp_connect", {
        host: config.tcpHost,
        port: config.tcpPort,
        protocol: config.tcpProtocol,
      });
      // isConnected and tcpConnectionStatus updated by event listener
    } catch (err) {
      setTcpConnectionStatus("disconnected");
      setError(`TCP连接失败：${toMessage(err)}`);
    }
  }

  async function tcpDisconnect() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tcp_disconnect");
      setTcpConnectionStatus("disconnected");
      setIsConnected(false);
      setConnectedPort(null);
      setStatusText("TCP已断开");
    } catch (err) {
      setError(`断开失败：${toMessage(err)}`);
    }
  }

  async function sendTcpData(
    value: string,
    sendMode: SendMode,
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

      const { invoke } = await import("@tauri-apps/api/core");
      lastTcpSendRef.current = Date.now();
      await invoke("tcp_send", { data: bytes });
    } catch (err) {
      setError(`TCP发送失败：${toMessage(err)}`);
    }
  }

  // ── TCP Server Actions ──

  async function tcpServerStart() {
    setTcpServerStatus("starting");
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tcp_server_start", {
        listenPort: config.tcpPort,
        protocol: config.tcpProtocol,
      });
    } catch (err) {
      setTcpServerStatus("stopped");
      setError(`TCP服务器启动失败：${toMessage(err)}`);
    }
  }

  async function tcpServerStop() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tcp_server_stop");
      setTcpServerStatus("stopped");
      setTcpServerClients([]);
    } catch (err) {
      setError(`停止TCP服务器失败：${toMessage(err)}`);
    }
  }

  async function tcpServerBroadcast(data: number[]) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tcp_server_broadcast", { data });
    } catch {
      // Broadcast failures are non-fatal
    }
  }

  useEffect(() => {
    void refreshPorts();

    return () => {
      const currentPort = portRef.current;
      if (currentPort) {
        void currentPort.stopListening().catch(() => undefined);
        void currentPort.cancelAllListeners().catch(() => undefined);
        void currentPort.close().catch(() => undefined);
      }
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
  };
}
