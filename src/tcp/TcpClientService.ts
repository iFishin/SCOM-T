import type { TcpProtocol, TcpConnectionStatus } from "./types.ts";

// ── Interface ──

export interface ITcpClientService {
  connect(host: string, port: number, protocol: TcpProtocol): Promise<void>;
  disconnect(): Promise<void>;
  send(data: number[]): Promise<void>;

  onData(cb: ((data: Uint8Array) => void) | null): void;
  onConnected(cb: (() => void) | null): void;
  onDisconnected(cb: ((reason: string) => void) | null): void;

  dispose(): void;

  readonly status: TcpConnectionStatus;
}

// ── Implementation using Tauri invoke + event listeners ──

export class TauriTcpClientService implements ITcpClientService {
  private _status: TcpConnectionStatus = "disconnected";

  private dataCallback: ((data: Uint8Array) => void) | null = null;
  private connectedCallback: (() => void) | null = null;
  private disconnectedCallback: ((reason: string) => void) | null = null;

  private unlisteners: (() => void)[] = [];
  private disposed = false;

  get status(): TcpConnectionStatus {
    return this._status;
  }

  onData(cb: ((data: Uint8Array) => void) | null): void {
    this.dataCallback = cb;
  }

  onConnected(cb: (() => void) | null): void {
    this.connectedCallback = cb;
  }

  onDisconnected(cb: ((reason: string) => void) | null): void {
    this.disconnectedCallback = cb;
  }

  async connect(host: string, port: number, protocol: TcpProtocol): Promise<void> {
    this.throwIfDisposed();

    // Tear down any previous listeners
    this.cleanupListeners();

    const { listen } = await import("@tauri-apps/api/event");

    // TCP data received
    const un1 = await listen<{ data: number[] }>("tcp-data", (event) => {
      if (this.dataCallback) {
        this.dataCallback(new Uint8Array(event.payload.data));
      }
    });
    this.unlisteners.push(un1);

    // TCP connected
    const un2 = await listen("tcp-connected", () => {
      this._status = "connected";
      this.connectedCallback?.();
    });
    this.unlisteners.push(un2);

    // TCP disconnected
    const un3 = await listen<{ reason: string }>("tcp-disconnected", (event) => {
      this._status = "disconnected";
      this.disconnectedCallback?.(event.payload.reason);
    });
    this.unlisteners.push(un3);

    // Invoke connect
    this._status = "connecting";
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("tcp_connect", { host, port, protocol });
    } catch (err) {
      this._status = "disconnected";
      this.cleanupListeners();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.throwIfDisposed();
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("tcp_disconnect");
    } finally {
      this._status = "disconnected";
    }
  }

  async send(data: number[]): Promise<void> {
    this.throwIfDisposed();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("tcp_send", { data });
  }

  dispose(): void {
    this.disposed = true;
    this.dataCallback = null;
    this.connectedCallback = null;
    this.disconnectedCallback = null;
    this.cleanupListeners();
    this._status = "disconnected";
  }

  private cleanupListeners(): void {
    for (const un of this.unlisteners) un();
    this.unlisteners = [];
  }

  private throwIfDisposed(): void {
    if (this.disposed) throw new Error("TcpClientService 已释放");
  }
}
