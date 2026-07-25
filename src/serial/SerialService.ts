import {
  DataBits,
  FlowControl,
  Parity,
  SerialPort,
  StopBits,
  type PortInfo,
} from "tauri-plugin-serialplugin-api";
import type { SerialConfig, PortSummary } from "./types.ts";
import { normalizePluginPayload } from "../utils/hexConverter.ts";

// ── Mapping helpers (internal) ──

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

function mapFlowControl(value: SerialConfig["flowControl"]): FlowControl {
  return (
    {
      none: FlowControl.None,
      software: FlowControl.Software,
      hardware: FlowControl.Hardware,
    } as const
  )[value];
}

function formatPortLabel(port: PortInfo) {
  const meta = [port.manufacturer, port.product]
    .filter((item) => item && item !== "Unknown")
    .join(" / ");
  return meta ? `${port.path} · ${meta}` : port.path;
}

// ── Interface ──

export interface ISerialService {
  /** Open the serial port with the given config */
  open(config: SerialConfig): Promise<void>;
  /** Close and release the serial port */
  close(): Promise<void>;

  /** Send raw bytes */
  sendBinary(data: number[]): Promise<void>;
  /** Send text string */
  sendText(text: string): Promise<void>;

  /** Set RTS/DTR signal levels */
  setSignals(rts: boolean, dtr: boolean): Promise<void>;

  /** Read modem input signal states */
  readSignals(): Promise<{ cts: boolean; dsr: boolean; cd: boolean; ri: boolean }>;

  /** Register data callback (null to unregister) */
  onData(cb: ((data: Uint8Array) => void) | null): void;
  /** Register disconnect callback (null to unregister) */
  onDisconnect(cb: (() => void) | null): void;

  /** Release all resources */
  dispose(): Promise<void>;

  readonly isOpen: boolean;
  readonly path: string | null;
}

// ── Default implementation wrapping tauri-plugin-serialplugin ──

export class TauriSerialService implements ISerialService {
  private port: SerialPort | null = null;
  private _path: string | null = null;
  private dataCallback: ((data: Uint8Array) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  /** internal listener reference for cleanup */
  private unlistenData: (() => void) | null = null;

  get isOpen(): boolean {
    return this.port !== null;
  }

  get path(): string | null {
    return this._path;
  }

  onData(cb: ((data: Uint8Array) => void) | null): void {
    this.dataCallback = cb;
  }

  onDisconnect(cb: (() => void) | null): void {
    this.disconnectCallback = cb;
  }

  async open(config: SerialConfig): Promise<void> {
    // Close existing port first
    if (this.port) {
      await this.close();
    }

    // Force-close to release any stale handle
    await SerialPort.forceClose(config.path).catch(() => undefined);

    const serial = new SerialPort({
      path: config.path,
      baudRate: config.baudRate,
      dataBits: mapDataBits(config.dataBits),
      flowControl: mapFlowControl(config.flowControl),
      parity: mapParity(config.parity),
      stopBits: mapStopBits(config.stopBits),
      timeout: 50,
    });

    await serial.open();

    // Apply RTS/DTR signals
    await serial.writeRequestToSend(config.rts).catch(() => undefined);
    await serial.writeDataTerminalReady(config.dtr).catch(() => undefined);

    // Start listening and attach data handler
    await serial.startListening();
    this.unlistenData = await serial.listen(
      (payload: unknown) => {
        if (this.dataCallback) {
          const bytes = normalizePluginPayload(payload);
          this.dataCallback(new Uint8Array(bytes));
        }
      },
      false,
    );

    // Attach disconnect handler (fire-and-forget, cleaned via cancelAllListeners)
    await serial.disconnected(() => {
      this.port = null;
      this._path = null;
      if (this.disconnectCallback) {
        this.disconnectCallback();
      }
    });

    this.port = serial;
    this._path = config.path;
  }

  async close(): Promise<void> {
    const p = this.port;
    if (!p) {
      this._path = null;
      return;
    }

    // Clean up listeners
    if (this.unlistenData) {
      this.unlistenData();
      this.unlistenData = null;
    }

    await p.stopListening().catch(() => undefined);
    await p.cancelAllListeners().catch(() => undefined);
    await p.close().catch(() => undefined);

    this.port = null;
    this._path = null;
  }

  async sendBinary(data: number[]): Promise<void> {
    if (!this.port) throw new Error("串口未打开，无法发送数据。");
    await this.port.writeBinary(data);
  }

  async sendText(text: string): Promise<void> {
    if (!this.port) throw new Error("串口未打开，无法发送数据。");
    await this.port.write(text);
  }

  async setSignals(rts: boolean, dtr: boolean): Promise<void> {
    if (!this.port) return;
    await this.port.writeRequestToSend(rts).catch(() => undefined);
    await this.port.writeDataTerminalReady(dtr).catch(() => undefined);
  }

  async readSignals(): Promise<{ cts: boolean; dsr: boolean; cd: boolean; ri: boolean }> {
    if (!this.port) return { cts: false, dsr: false, cd: false, ri: false };
    const [cts, dsr, cd, ri] = await Promise.all([
      this.port.readClearToSend().catch(() => false),
      this.port.readDataSetReady().catch(() => false),
      this.port.readCarrierDetect().catch(() => false),
      this.port.readRingIndicator().catch(() => false),
    ]);
    return { cts, dsr, cd, ri };
  }

  async dispose(): Promise<void> {
    this.dataCallback = null;
    this.disconnectCallback = null;
    await this.close();
  }
}

// ── Utility functions (not tied to a port instance) ──

export async function listAvailablePorts(filterMode: "default" | "all" = "default"): Promise<PortSummary[]> {
  const result = await SerialPort.available_ports();
  const entries = Object.entries(result);

  // macOS: each physical port appears as both /dev/cu.* and /dev/tty.*
  // Filter based on user preference
  const seen = new Set<string>();
  const deduped = entries.filter(([portName]) => {
    const base = portName.replace(/^.*\//, ""); // last path component

    // If showing all ports, skip deduplication logic for tty.*
    if (filterMode === "all") {
      // Still deduplicate cu.* vs tty.* pairs, but keep tty.* if no cu.* exists
      if (base.startsWith("cu.")) {
        const key = base.replace(/^cu\./, "");
        if (seen.has(`tty.${key}`)) return false; // tty.* already seen, skip this cu.*
        seen.add(`cu.${key}`);
        return true;
      }
      if (base.startsWith("tty.")) {
        const key = base.replace(/^tty\./, "");
        if (seen.has(`cu.${key}`)) return false; // cu.* exists, skip this tty.*
        seen.add(`tty.${key}`);
        return true;
      }
      return true; // Non-macOS port, keep as-is
    }

    // Default mode: prefer cu.* over tty.*
    if (base.startsWith("cu.")) {
      const key = base.replace(/^cu\./, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
    if (base.startsWith("tty.")) {
      return false; // Always drop tty.* in default mode
    }
    return true;
  });

  const ports: PortSummary[] = deduped.map(([portName, port]) => {
    const detail = { ...port, path: portName };
    return {
      path: portName,
      label: formatPortLabel(detail),
      detail,
    };
  });

  // Add mock serial port for testing
  ports.unshift({
    path: MOCK_PORT_PATH,
    label: "[MOCK] 模拟串口 (AT指令测试)",
    detail: {
      path: MOCK_PORT_PATH,
      manufacturer: "SCOM-T",
      product: "Mock Serial",
      pid: "Unknown",
      serial_number: "Unknown",
      type: "Unknown",
      vid: "Unknown",
    },
  });

  return ports;
}

export async function forceClosePort(path: string): Promise<void> {
  await SerialPort.forceClose(path).catch(() => undefined);
}

// ── Mock Serial Service for testing ──

const MOCK_PORT_PATH = "__MOCK_SERIAL__";

// Common AT command responses for mock serial
const MOCK_AT_RESPONSES: Record<string, string> = {
  "AT": "OK",
  "ATE0": "OK",
  "ATE1": "OK",
  "AT+CPIN?": "+CPIN: READY\n\nOK",
  "AT+CSQ": "+CSQ: 25,0\n\nOK",
  "AT+CEREG?": "+CEREG: 0,1\n\nOK",
  "AT+CREG?": "+CREG: 0,1\n\nOK",
  "AT+CGREG?": "+CGREG: 0,1\n\nOK",
  "AT+CGMI": "+CGMI: SIMCOM\n\nOK",
  "AT+CGMM": "+CGMM: SIM800C\n\nOK",
  "AT+CGMR": "+CGMR: 1308B05SIM800C\n\nOK",
  "AT+CGSN": "+CGSN: 861234567890123\n\nOK",
  "AT+COPS?": '+COPS: 0,0,"China Mobile"\n\nOK',
  "AT+CGATT?": "+CGATT: 1\n\nOK",
  "AT+CFUN?": "+CFUN: 1\n\nOK",
  "AT+CCLK?": `+CCLK: "${new Date().toISOString().slice(2, 10)},${new Date().toTimeString().slice(0, 8)}+32"\n\nOK`,
  "AT+CMGF=1": "OK",
  "AT+HTTPINIT": "OK",
  "AT+HTTPTERM": "OK",
};

export class MockSerialService implements ISerialService {
  private _isOpen = false;
  private _path: string | null = null;
  private dataCallback: ((data: Uint8Array) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  private responseDelay = 100; // ms

  get isOpen(): boolean {
    return this._isOpen;
  }

  get path(): string | null {
    return this._path;
  }

  onData(cb: ((data: Uint8Array) => void) | null): void {
    this.dataCallback = cb;
  }

  onDisconnect(cb: (() => void) | null): void {
    this.disconnectCallback = cb;
  }

  async open(config: SerialConfig): Promise<void> {
    this._isOpen = true;
    this._path = config.path;
  }

  async close(): Promise<void> {
    const wasOpen = this._isOpen;
    this._isOpen = false;
    this._path = null;
    if (wasOpen && this.disconnectCallback) {
      this.disconnectCallback();
    }
  }

  async sendBinary(data: number[]): Promise<void> {
    if (!this._isOpen) return;

    const text = new TextDecoder().decode(new Uint8Array(data));
    const cmd = text.trim().replace(/\r?\n$/, "");

    // Find matching response
    let response = "OK";
    for (const [key, val] of Object.entries(MOCK_AT_RESPONSES)) {
      if (cmd.toUpperCase().startsWith(key)) {
        response = val;
        break;
      }
    }

    // Simulate delay and send response
    setTimeout(() => {
      if (this.dataCallback && this._isOpen) {
        const responseBytes = new TextEncoder().encode(response + "\r\n");
        this.dataCallback(responseBytes);
      }
    }, this.responseDelay);
  }

  async sendText(text: string): Promise<void> {
    await this.sendBinary(Array.from(new TextEncoder().encode(text)));
  }

  async setSignals(_rts: boolean, _dtr: boolean): Promise<void> {
    // No-op for mock
  }

  async readSignals(): Promise<{ cts: boolean; dsr: boolean; cd: boolean; ri: boolean }> {
    return { cts: true, dsr: true, cd: true, ri: false };
  }

  async dispose(): Promise<void> {
    await this.close();
  }
}

export function isMockPort(path: string): boolean {
  return path === MOCK_PORT_PATH;
}

export function getMockPortPath(): string {
  return MOCK_PORT_PATH;
}
