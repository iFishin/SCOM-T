import type { TcpClientInfo, TcpProtocol, TcpServerStatus } from "./types.ts";

// ── Interface ──

export interface ITcpServerService {
  start(listenPort: number, protocol: TcpProtocol): Promise<void>;
  stop(): Promise<void>;
  broadcast(data: number[]): Promise<void>;
  disconnectClient(clientId: string): Promise<void>;

  onData(cb: ((clientId: string, data: Uint8Array) => void) | null): void;
  onClientConnected(cb: ((client: TcpClientInfo) => void) | null): void;
  onClientDisconnected(cb: ((clientId: string) => void) | null): void;
  onStarted(cb: (() => void) | null): void;
  onStopped(cb: (() => void) | null): void;

  dispose(): void;

  readonly status: TcpServerStatus;
  readonly clients: TcpClientInfo[];
}

// ── Implementation ──

export class TauriTcpServerService implements ITcpServerService {
  private _status: TcpServerStatus = "stopped";
  private _clients: TcpClientInfo[] = [];

  private dataCallback: ((clientId: string, data: Uint8Array) => void) | null = null;
  private clientConnectedCallback: ((client: TcpClientInfo) => void) | null = null;
  private clientDisconnectedCallback: ((clientId: string) => void) | null = null;
  private startedCallback: (() => void) | null = null;
  private stoppedCallback: (() => void) | null = null;

  private unlisteners: (() => void)[] = [];
  private disposed = false;

  get status(): TcpServerStatus {
    return this._status;
  }

  get clients(): TcpClientInfo[] {
    return this._clients;
  }

  onData(cb: ((clientId: string, data: Uint8Array) => void) | null): void {
    this.dataCallback = cb;
  }

  onClientConnected(cb: ((client: TcpClientInfo) => void) | null): void {
    this.clientConnectedCallback = cb;
  }

  onClientDisconnected(cb: ((clientId: string) => void) | null): void {
    this.clientDisconnectedCallback = cb;
  }

  onStarted(cb: (() => void) | null): void {
    this.startedCallback = cb;
  }

  onStopped(cb: (() => void) | null): void {
    this.stoppedCallback = cb;
  }

  async start(listenPort: number, protocol: TcpProtocol): Promise<void> {
    this.throwIfDisposed();
    this.cleanupListeners();
    this._clients = [];

    const { listen } = await import("@tauri-apps/api/event");

    // Data from TCP client
    const un1 = await listen<{ clientId: string; data: number[] }>("tcp-server-data", (event) => {
      if (this.dataCallback) {
        this.dataCallback(event.payload.clientId, new Uint8Array(event.payload.data));
      }
    });
    this.unlisteners.push(un1);

    // Client connected
    const un2 = await listen<{ id: string; address: string }>("tcp-server-client-connected", (event) => {
      const client: TcpClientInfo = { id: event.payload.id, address: event.payload.address };
      this._clients = [...this._clients, client];
      this.clientConnectedCallback?.(client);
    });
    this.unlisteners.push(un2);

    // Client disconnected
    const un3 = await listen<{ id: string }>("tcp-server-client-disconnected", (event) => {
      this._clients = this._clients.filter((c) => c.id !== event.payload.id);
      this.clientDisconnectedCallback?.(event.payload.id);
    });
    this.unlisteners.push(un3);

    // Server started
    const un4 = await listen("tcp-server-started", () => {
      this._status = "running";
      this.startedCallback?.();
    });
    this.unlisteners.push(un4);

    // Server stopped
    const un5 = await listen("tcp-server-stopped", () => {
      this._status = "stopped";
      this.stoppedCallback?.();
    });
    this.unlisteners.push(un5);

    // Invoke start
    this._status = "starting";
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("tcp_server_start", { listenPort, protocol });
    } catch (err) {
      this._status = "stopped";
      this.cleanupListeners();
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.throwIfDisposed();
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("tcp_server_stop");
    } finally {
      this._status = "stopped";
      this._clients = [];
    }
  }

  async broadcast(data: number[]): Promise<void> {
    this.throwIfDisposed();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("tcp_server_broadcast", { data }).catch(() => undefined);
  }

  async disconnectClient(clientId: string): Promise<void> {
    this.throwIfDisposed();
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("tcp_server_disconnect_client", { clientId });
  }

  dispose(): void {
    this.disposed = true;
    this.dataCallback = null;
    this.clientConnectedCallback = null;
    this.clientDisconnectedCallback = null;
    this.startedCallback = null;
    this.stoppedCallback = null;
    this.cleanupListeners();
    this._status = "stopped";
    this._clients = [];
  }

  private cleanupListeners(): void {
    for (const un of this.unlisteners) un();
    this.unlisteners = [];
  }

  private throwIfDisposed(): void {
    if (this.disposed) throw new Error("TcpServerService 已释放");
  }
}
