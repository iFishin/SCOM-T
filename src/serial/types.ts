import type { PortInfo } from "tauri-plugin-serialplugin-api";

// ── Send / Receive modes ──

export type SendMode = "ascii" | "hex";
export type ReceiveMode = "ascii" | "hex";

// ── Logging ──

export type SerialLogDirection = "sent" | "received";
export type LogSource = "serial" | "tcp-client" | "tcp-server";
export type LogDisplayMode = "card" | "text" | "hex";

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

// ── Port ──

export type PortSummary = {
  path: string;
  label: string;
  detail: PortInfo;
};

export type SelectOption<T extends string> = {
  label: string;
  value: T;
};

// ── Serial config ──

export type SerialConfig = {
  path: string;
  baudRate: number;
  dataBits: "5" | "6" | "7" | "8";
  parity: "none" | "odd" | "even";
  stopBits: "1" | "1.5" | "2";
  flowControl: "none" | "software" | "hardware";
  rts: boolean;
  dtr: boolean;
};

// ── Constants ──

export const BAUD_RATES = [
  50, 75, 110, 134, 150, 200, 300, 600, 1200, 1800, 2400, 4800,
  9600, 14400, 19200, 28800, 38400, 57600, 76800, 115200,
  128000, 144000, 153600, 230400, 256000, 307200, 460800, 576000, 614400,
  691200, 921600,
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

export const FLOW_CONTROL_OPTIONS: SelectOption<SerialConfig["flowControl"]>[] = [
  { label: "无", value: "none" },
  { label: "软件 (XON/XOFF)", value: "software" },
  { label: "硬件 (RTS/CTS)", value: "hardware" },
];
