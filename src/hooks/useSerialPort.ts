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
export type LogDisplayMode = "card" | "text";

export type SerialLogEntry = {
  id: string;
  direction: SerialLogDirection;
  mode: SendMode | ReceiveMode;
  payload: string;
  timestamp: string;
  seq: number;
};

export type SerialConfig = {
  path: string;
  baudRate: number;
  dataBits: "5" | "6" | "7" | "8";
  parity: "none" | "odd" | "even";
  stopBits: "1" | "1.5" | "2";
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
      // Return count so caller can show a toast when no ports found
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
      // Keep logs sorted by seq to preserve chronological order
      return next.sort((a, b) => a.seq - b.seq);
    });
  }

  async function closePort() {
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
        const formatted =
          receiveModeRef.current === "hex"
            ? bytesToHex(bytes)
            : bytesToAscii(bytes);

        appendLog({
          direction: "received",
          mode: receiveModeRef.current,
          payload: formatted,
        });
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
    const currentPort = portRef.current;
    if (!currentPort) {
      setError("串口未打开，无法发送数据。");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      if (sendMode === "hex") {
        // For hex mode, parse the hex payload and append newline bytes (if any)
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
      // 保留进度条 1 秒后清除，让用户能看到 100%
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
  };
}
