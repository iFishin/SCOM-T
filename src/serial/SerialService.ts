import {
  ClearBuffer,
  DataBits,
  FlowControl,
  Parity,
  SerialPort,
  StopBits,
  type PortInfo,
} from "tauri-plugin-serialplugin-api";
import type { SerialConfig, PortSummary } from "./types.ts";
import type { MockSerialConfig } from "../hooks/useSettings.ts";
import { normalizePluginPayload } from "../utils/hexConverter.ts";
import { appLogger } from "../utils/appLogger.ts";
import type { SerialTransport } from "./FakeSerialTransport.ts";

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

export type SerialSendLifecycle = {
  onDispatch?: (data: Uint8Array) => void;
  onComplete?: (data: Uint8Array) => void;
  onError?: (data: Uint8Array, error: unknown) => void;
};

/** Runtime transport contract; production wraps SerialPort, tests inject a fake. */
export type SerialTransportFactory = (config: SerialConfig) => SerialTransport;

class TauriSerialTransportAdapter implements SerialTransport {
  constructor(private readonly port: SerialPort) {}

  open() { return this.port.open(); }
  close() { return this.port.close(); }
  writeBinary(data: number[]) { return this.port.writeBinary(data); }
  startListening() { return this.port.startListening(); }
  stopListening() { return this.port.stopListening(); }
  listen(callback: (data: unknown) => void, once: boolean) { return this.port.listen(callback, once); }
  disconnected(callback: () => void) { return this.port.disconnected(callback); }
  cancelAllListeners() { return this.port.cancelAllListeners(); }
  writeRequestToSend(value: boolean) { return this.port.writeRequestToSend(value); }
  writeDataTerminalReady(value: boolean) { return this.port.writeDataTerminalReady(value); }
  clearBuffer(bufferType: ClearBuffer) { return this.port.clearBuffer(bufferType); }
  readClearToSend() { return this.port.readClearToSend(); }
  readDataSetReady() { return this.port.readDataSetReady(); }
  readCarrierDetect() { return this.port.readCarrierDetect(); }
  readRingIndicator() { return this.port.readRingIndicator(); }
}

// ── Interface ──

export interface ISerialService {
  /** Open the serial port with the given config */
  open(config: SerialConfig): Promise<void>;
  /** Close and release the serial port */
  close(): Promise<void>;

  /** Send raw bytes */
  sendBinary(data: number[], lifecycle?: SerialSendLifecycle): Promise<void>;
  /** Send text string */
  sendText(text: string, lifecycle?: SerialSendLifecycle): Promise<void>;

  /** Set RTS/DTR signal levels */
  setSignals(rts: boolean, dtr: boolean): Promise<void>;

  /** Clear serial port buffer (input, output, or both) */
  clearBuffer(bufferType: "input" | "output" | "all"): Promise<void>;

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
  private transport: SerialTransport | null = null;
  private _path: string | null = null;
  private dataCallback: ((data: Uint8Array) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  /** internal listener reference for cleanup */
  private unlistenData: (() => void) | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly transportFactory?: SerialTransportFactory) {}

  get isOpen(): boolean {
    return this.transport !== null;
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

    // Force-close only for the production plugin transport. Test/injected
    // transports do not own a native path and must not invoke Tauri commands.
    if (!this.transportFactory) {
      await SerialPort.forceClose(config.path).catch(() => undefined);
    }

    const serial = this.transportFactory ? null : new SerialPort({
      path: config.path,
      baudRate: config.baudRate,
      dataBits: mapDataBits(config.dataBits),
      flowControl: mapFlowControl(config.flowControl),
      parity: mapParity(config.parity),
      stopBits: mapStopBits(config.stopBits),
      // Short dispatch interval: the plugin flushes accumulated RX bytes to JS
      // every `timeout` ms. Keeping it small (5ms) lets USB-split chunks of one
      // line reach JS within the 10ms idle-flush window, so lines are not
      // truncated while newline-less lines still surface promptly.
      timeout: 5,
    });
    const transport = this.transportFactory?.(config) ?? new TauriSerialTransportAdapter(serial!);

    try {
      await transport.open();

      // Apply RTS/DTR signals
      await transport.writeRequestToSend(config.rts).catch(() => undefined);
      await transport.writeDataTerminalReady(config.dtr).catch(() => undefined);

      // Attach the JS event listener before starting the native read thread so
      // bytes emitted immediately after listening starts cannot fall in a gap.
      this.unlistenData = await transport.listen(
        (payload: unknown) => {
          if (this.dataCallback) {
            const bytes = normalizePluginPayload(payload);
            this.dataCallback(new Uint8Array(bytes));
          }
        },
        false,
      );

      await transport.disconnected(() => {
        this.transport = null;
        this.port = null;
        this._path = null;
        if (this.disconnectCallback) {
          this.disconnectCallback();
        }
      });
      await transport.startListening();

      this.transport = transport;
      this.port = serial;
      this._path = config.path;
    } catch (error) {
      if (this.unlistenData) {
        this.unlistenData();
        this.unlistenData = null;
      }
      await transport.stopListening().catch(() => undefined);
      await transport.cancelAllListeners().catch(() => undefined);
      await transport.close().catch(() => undefined);
      this.transport = null;
      this.port = null;
      this._path = null;
      throw error;
    }
  }

  async close(): Promise<void> {
    const transport = this.transport;
    if (!transport) {
      this.port = null;
      this._path = null;
      return;
    }

    // Clean up listeners
    if (this.unlistenData) {
      this.unlistenData();
      this.unlistenData = null;
    }

    await transport.stopListening().catch(() => undefined);
    await transport.cancelAllListeners().catch(() => undefined);
    await transport.close().catch(() => undefined);

    this.transport = null;
    this.port = null;
    this._path = null;
  }

  private enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const queued = this.writeQueue.then(operation, operation);
    this.writeQueue = queued.catch(() => undefined);
    return queued;
  }

  private async writeAll(data: number[]): Promise<void> {
    const transport = this.transport;
    if (!transport) throw new Error("串口未打开，无法发送数据。");

    const startedAt = performance.now();
    let offset = 0;
    let calls = 0;
    const writtenChunks: string[] = [];
    const hexDump = (bytes: number[]) =>
      bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");

    // Try full write first; partial writes are rare for normal commands
    // but handled correctly when they occur (e.g. very large payloads).
    while (offset < data.length) {
      const chunk = offset === 0 ? data : data.slice(offset);
      const written = await transport.writeBinary(chunk);
      calls += 1;
      writtenChunks.push(`${chunk.length}->${written}`);
      if (!Number.isInteger(written) || written <= 0 || written > chunk.length) {
        throw new Error(`串口写入异常：第 ${calls} 次写入返回 ${written}，进度 ${offset}/${data.length} 字节。`);
      }
      offset += written;
      // If the first write completed the whole payload, we're done
      if (offset >= data.length) break;
    }

    const elapsedMs = Math.round(performance.now() - startedAt);
    if (calls > 1) {
      appLogger.warn("Serial", `Partial write recovered: ${data.length} bytes in ${calls} writes [${writtenChunks.join(" ")}] (${elapsedMs} ms) hex=${hexDump(data)}`);
    } else {
      appLogger.debug("Serial", `Wrote ${data.length} bytes (${elapsedMs} ms) hex=${hexDump(data)}`);
    }
  }

  async sendBinary(data: number[], lifecycle?: SerialSendLifecycle): Promise<void> {
    if (!this.transport) throw new Error("串口未打开，无法发送数据。");
    const immutable = new Uint8Array(data);
    await this.enqueueWrite(async () => {
      lifecycle?.onDispatch?.(immutable.slice());
      try {
        await this.writeAll(Array.from(immutable));
        lifecycle?.onComplete?.(immutable.slice());
      } catch (error) {
        lifecycle?.onError?.(immutable.slice(), error);
        throw error;
      }
    });
  }

  async sendText(text: string, lifecycle?: SerialSendLifecycle): Promise<void> {
    const bytes = Array.from(new TextEncoder().encode(text));
    await this.sendBinary(bytes, lifecycle);
  }

  async setSignals(rts: boolean, dtr: boolean): Promise<void> {
    if (!this.transport) return;
    await this.transport.writeRequestToSend(rts).catch(() => undefined);
    await this.transport.writeDataTerminalReady(dtr).catch(() => undefined);
  }

  async readSignals(): Promise<{ cts: boolean; dsr: boolean; cd: boolean; ri: boolean }> {
    if (!this.transport) return { cts: false, dsr: false, cd: false, ri: false };
    const [cts, dsr, cd, ri] = await Promise.all([
      this.transport.readClearToSend().catch(() => false),
      this.transport.readDataSetReady().catch(() => false),
      this.transport.readCarrierDetect().catch(() => false),
      this.transport.readRingIndicator().catch(() => false),
    ]);
    return { cts, dsr, cd, ri };
  }

  async clearBuffer(bufferType: "input" | "output" | "all"): Promise<void> {
    if (!this.transport) return;
    const map: Record<string, ClearBuffer> = {
      input: ClearBuffer.Input,
      output: ClearBuffer.Output,
      all: ClearBuffer.All,
    };
    await this.transport.clearBuffer(map[bufferType]).catch(() => undefined);
  }

  async dispose(): Promise<void> {
    this.dataCallback = null;
    this.disconnectCallback = null;
    await this.close();
  }
}

// ── Utility functions (not tied to a port instance) ──

// Mock serial port path constant
const MOCK_PORT_PATH = "__MOCK_SERIAL__";

export async function listAvailablePorts(
  filterMode: "default" | "all" = "default",
  mockEnabled: boolean = false
): Promise<PortSummary[]> {
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

  // Add mock serial port only if enabled in settings
  if (mockEnabled) {
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
  }

  return ports;
}

export async function forceClosePort(path: string): Promise<void> {
  await SerialPort.forceClose(path).catch(() => undefined);
}

// ── Mock Serial Service for testing ──

// Common AT command responses for mock serial
export const BUILTIN_MOCK_RESPONSES: Record<string, string> = {
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
  private responseDelay = 100;
  private allResponses: Record<string, string> = { ...BUILTIN_MOCK_RESPONSES };

  constructor(config?: MockSerialConfig) {
    if (config) {
      this.configure(config);
    }
  }

  configure(config: MockSerialConfig): void {
    this.responseDelay = config.responseDelay;

    // Start with built-in responses
    this.allResponses = { ...BUILTIN_MOCK_RESPONSES };

    // Add custom responses (enabled ones override built-in)
    if (config.customResponses) {
      for (const r of config.customResponses) {
        if (r.enabled && r.command) {
          this.allResponses[r.command.toUpperCase()] = r.response;
        }
      }
    }
  }

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

  async sendBinary(data: number[], lifecycle?: SerialSendLifecycle): Promise<void> {
    if (!this._isOpen) return;
    lifecycle?.onDispatch?.(new Uint8Array(data));

    const text = new TextDecoder().decode(new Uint8Array(data));
    const cmd = text.trim().replace(/\r?\n$/, "");

    // Find matching response (custom responses take priority)
    // Sort by key length descending so longer/more specific commands match first
    let response = "OK";
    const sortedKeys = Object.keys(this.allResponses).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (cmd.toUpperCase().startsWith(key)) {
        response = this.allResponses[key];
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
    lifecycle?.onComplete?.(new Uint8Array(data));
  }

  async sendText(text: string, lifecycle?: SerialSendLifecycle): Promise<void> {
    await this.sendBinary(Array.from(new TextEncoder().encode(text)), lifecycle);
  }

  async setSignals(_rts: boolean, _dtr: boolean): Promise<void> {
    // No-op for mock
  }

  async readSignals(): Promise<{ cts: boolean; dsr: boolean; cd: boolean; ri: boolean }> {
    return { cts: true, dsr: true, cd: true, ri: false };
  }

  async clearBuffer(_bufferType: "input" | "output" | "all"): Promise<void> {
    // No-op for mock
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
