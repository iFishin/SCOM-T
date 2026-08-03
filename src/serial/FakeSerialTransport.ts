/**
 * FakeSerialTransport: Test double for TauriSerialService transport layer.
 * Simulates the Tauri serial plugin API for deterministic testing of partial writes,
 * FIFO behavior, dispatch timing, and error conditions.
 */

export interface SerialTransport {
  /** Open the transport connection */
  open(): Promise<void>;
  /** Close the transport connection */
  close(): Promise<void>;
  /** Write binary data; may return partial write count */
  writeBinary(data: number[]): Promise<number>;
  /** Start listening for data events */
  startListening(): Promise<void>;
  /** Stop listening for data events */
  stopListening(): Promise<void>;
  /** Register a data callback */
  listen(callback: (data: unknown) => void, once: boolean): Promise<() => void>;
  /** Register a disconnect callback */
  disconnected(callback: () => void): Promise<void>;
  /** Cancel all listeners */
  cancelAllListeners(): Promise<void>;
  /** Set RTS signal */
  writeRequestToSend(value: boolean): Promise<void>;
  /** Set DTR signal */
  writeDataTerminalReady(value: boolean): Promise<void>;
  /** Clear buffer */
  clearBuffer(bufferType: any): Promise<void>;
  /** Read CTS signal */
  readClearToSend(): Promise<boolean>;
  /** Read DSR signal */
  readDataSetReady(): Promise<boolean>;
  /** Read CD signal */
  readCarrierDetect(): Promise<boolean>;
  /** Read RI signal */
  readRingIndicator(): Promise<boolean>;
}

export interface FakeSerialTransportOptions {
  /**
   * Function that controls how much data writeBinary actually writes.
   * Returns the number of bytes written (0 to data.length).
   * Called for each write attempt.
   */
  writeChunkSize?: (attemptCount: number, totalLength: number) => number;
  /**
   * Simulated delay before write returns (in ms)
   */
  writeDelay?: number;
  /**
   * Simulated delay before data callback fires (in ms)
   */
  readDelay?: number;
  /**
   * If true, will hold data and call callback after readDelay
   */
  simulateReceiveBuffer?: boolean;
}

/**
 * FakeSerialTransport: A test double that simulates serial port behavior.
 * Supports:
 * - Partial writes (configurable via writeChunkSize callback)
 * - Deterministic timing (configurable delays)
 * - FIFO data queue (if simulateReceiveBuffer=true)
 * - Signal state tracking
 * - Dispatch callback timing verification
 */
export class FakeSerialTransport implements SerialTransport {
  private _isOpen = false;
  private _isListening = false;
  private dataCallback: ((data: unknown) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  private unlistenCallback: (() => void) | null = null;
  private writeAttempts = 0;
  private rxQueue: Uint8Array[] = [];
  private writeInputs: number[][] = [];
  private transmittedBytes: number[] = [];

  // Configuration
  private writeChunkSizeFn: (attemptCount: number, totalLength: number) => number;
  private writeDelay: number;
  private readDelay: number;
  private simulateReceiveBuffer: boolean;

  // Signal states
  private rts = false;
  private dtr = false;
  private cts = true;
  private dsr = true;
  private cd = true;
  private ri = false;

  // For tracking dispatch order
  private writeDispatchTimestamps: number[] = [];
  private readDispatchTimestamps: number[] = [];

  constructor(options: FakeSerialTransportOptions = {}) {
    this.writeChunkSizeFn = options.writeChunkSize ?? ((_, total) => total);
    this.writeDelay = options.writeDelay ?? 0;
    this.readDelay = options.readDelay ?? 0;
    this.simulateReceiveBuffer = options.simulateReceiveBuffer ?? false;
  }

  async open(): Promise<void> {
    if (this._isOpen) throw new Error("Transport already open");
    this._isOpen = true;
  }

  async close(): Promise<void> {
    this._isOpen = false;
    this._isListening = false;
    if (this.unlistenCallback) {
      this.unlistenCallback();
    }
  }

  async writeBinary(data: number[]): Promise<number> {
    if (!this._isOpen) throw new Error("Transport not open");

    this.writeAttempts += 1;
    const chunkSize = this.writeChunkSizeFn(this.writeAttempts, data.length);
    const written = Math.min(chunkSize, data.length);

    this.writeInputs.push([...data]);
    // Record the bytes that actually reach the wire (partial-write slice).
    this.transmittedBytes.push(...data.slice(0, written));

    if (this.writeDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.writeDelay));
    }

    this.writeDispatchTimestamps.push(Date.now());
    return written;
  }

  async startListening(): Promise<void> {
    if (!this._isOpen) throw new Error("Transport not open");
    this._isListening = true;
  }

  async stopListening(): Promise<void> {
    this._isListening = false;
  }

  async listen(callback: (data: unknown) => void, _once: boolean): Promise<() => void> {
    if (!this._isOpen) throw new Error("Transport not open");
    this.dataCallback = callback;

    this.unlistenCallback = () => {
      this.dataCallback = null;
    };

    return this.unlistenCallback;
  }

  async disconnected(callback: () => void): Promise<void> {
    if (!this._isOpen) throw new Error("Transport not open");
    this.disconnectCallback = callback;
  }

  async cancelAllListeners(): Promise<void> {
    if (this.unlistenCallback) {
      this.unlistenCallback();
    }
  }

  async writeRequestToSend(value: boolean): Promise<void> {
    this.rts = value;
  }

  async writeDataTerminalReady(value: boolean): Promise<void> {
    this.dtr = value;
  }

  async clearBuffer(_bufferType: any): Promise<void> {
    this.rxQueue = [];
  }

  async readClearToSend(): Promise<boolean> {
    return this.cts;
  }

  async readDataSetReady(): Promise<boolean> {
    return this.dsr;
  }

  async readCarrierDetect(): Promise<boolean> {
    return this.cd;
  }

  async readRingIndicator(): Promise<boolean> {
    return this.ri;
  }

  /**
   * Simulate receiving data. In reality this would come from the serial port,
   * but for testing we control it explicitly.
   */
  simulateReceive(data: Uint8Array | number[]): void {
    if (!this._isListening) return;

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (this.simulateReceiveBuffer) {
      this.rxQueue.push(bytes);
      if (this.dataCallback) {
        setTimeout(() => {
          if (this.rxQueue.length > 0 && this.dataCallback) {
            const chunk = this.rxQueue.shift()!;
            this.readDispatchTimestamps.push(Date.now());
            this.dataCallback(Array.from(chunk));
          }
        }, this.readDelay);
      }
    } else {
      if (this.dataCallback) {
        setTimeout(() => {
          this.readDispatchTimestamps.push(Date.now());
          if (this.dataCallback) {
            this.dataCallback(Array.from(bytes));
          }
        }, this.readDelay);
      }
    }
  }

  /** Trigger the disconnect callback (simulate device removal) */
  simulateDisconnect(): void {
    if (this.disconnectCallback) {
      this._isOpen = false;
      this._isListening = false;
      this.disconnectCallback();
    }
  }

  // ── Getters for testing assertions ──

  get isOpen(): boolean {
    return this._isOpen;
  }

  get isListening(): boolean {
    return this._isListening;
  }

  get signals() {
    return { rts: this.rts, dtr: this.dtr, cts: this.cts, dsr: this.dsr, cd: this.cd, ri: this.ri };
  }

  get writeAttemptCount(): number {
    return this.writeAttempts;
  }

  get writeTimestamps(): number[] {
    return [...this.writeDispatchTimestamps];
  }

  get writes(): number[][] {
    return this.writeInputs.map((data) => [...data]);
  }

  /** Every byte actually placed on the wire, in order. */
  get transmitted(): number[] {
    return [...this.transmittedBytes];
  }

  get readTimestamps(): number[] {
    return [...this.readDispatchTimestamps];
  }

  /** Reset counters for next test */
  reset(): void {
    this.writeAttempts = 0;
    this.writeDispatchTimestamps = [];
    this.writeInputs = [];
    this.transmittedBytes = [];
    this.readDispatchTimestamps = [];
    this.rxQueue = [];
  }

  // Setters for signal simulation
  setSignalStates(signals: Partial<Record<'cts' | 'dsr' | 'cd' | 'ri', boolean>>): void {
    if (signals.cts !== undefined) this.cts = signals.cts;
    if (signals.dsr !== undefined) this.dsr = signals.dsr;
    if (signals.cd !== undefined) this.cd = signals.cd;
    if (signals.ri !== undefined) this.ri = signals.ri;
  }
}
