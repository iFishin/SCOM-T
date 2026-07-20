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

export async function listAvailablePorts(): Promise<PortSummary[]> {
  const result = await SerialPort.available_ports();
  return Object.entries(result).map(([portName, port]) => {
    const detail = { ...port, path: portName };
    return {
      path: portName,
      label: formatPortLabel(detail),
      detail,
    };
  });
}

export async function forceClosePort(path: string): Promise<void> {
  await SerialPort.forceClose(path).catch(() => undefined);
}
