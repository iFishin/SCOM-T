type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const MAX_BUFFER = 1000;

/**
 * Cap on how much of an app log the viewer loads. The file is read into a
 * single string and split into lines, so an unbounded read is a direct path to
 * a huge heap allocation on a day-long session.
 */
const MAX_VIEW_BYTES = 4 * 1024 * 1024;

/**
 * Global app logger.
 * Writes daily log files to `~/SCOM-T/logs/app-YYYY-MM-DD.log` and keeps
 * an in-memory ring buffer for the UI viewer.
 *
 * Usage:
 *   import { appLogger } from "../utils/appLogger";
 *   appLogger.info("Serial", "Port opened");
 *   appLogger.error("TCP", "Connection lost");
 */
class AppLogger {
  private _ready = false;
  private _initPromise: Promise<void> | null = null;
  private _logDir = "";
  private _buffer: string[] = [];

  /** Whether the logger has finished initializing */
  get ready(): boolean {
    return this._ready;
  }

  /** Get a snapshot of the ring buffer for display */
  getBuffer(): string {
    return this._buffer.join("\n");
  }

  /**
   * Initialize: create log directory and register global error handlers.
   * Call once at app startup. Safe to call multiple times.
   */
  async init(): Promise<void> {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { mkdir } = await import("@tauri-apps/plugin-fs");
        const home = await homeDir();
        this._logDir = await join(home, "SCOM-T", "logs");
        await mkdir(this._logDir, { recursive: true }).catch(() => {});
        this._ready = true;

        // Global error handlers
        if (typeof window !== "undefined") {
          window.addEventListener("error", (e) => {
            this._writeSync("ERROR", "Global", `${e.message} (${e.filename}:${e.lineno})`);
          });
          window.addEventListener("unhandledrejection", (e) => {
            this._writeSync("ERROR", "Global", `Unhandled rejection: ${e.reason}`);
          });
        }
      } catch (e) {
        // Logger init failure is non-critical — fall back to console
        console.warn("Logger init failed:", e);
      }
    })();

    return this._initPromise;
  }

  // ── Public API ──

  debug(source: string, message: string): void {
    this._write("DEBUG", source, message);
  }

  info(source: string, message: string): void {
    this._write("INFO", source, message);
  }

  warn(source: string, message: string): void {
    this._write("WARN", source, message);
  }

  error(source: string, message: string): void {
    this._write("ERROR", source, message);
  }

  /** Get today's log file path (for the viewer) */
  async getTodayPath(): Promise<string | null> {
    if (!this._logDir) return null;
    const { join } = await import("@tauri-apps/api/path");
    const date = new Date().toISOString().slice(0, 10);
    return join(this._logDir, `app-${date}.log`);
  }

  /** List all available log files sorted newest-first */
  async listFiles(): Promise<string[]> {
    if (!this._logDir) return [];
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const entries = await readDir(this._logDir);
      return entries
        .filter((e) => e.name?.startsWith("app-") && e.name.endsWith(".log"))
        .map((e) => e.name!)
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /** Read the content of a log file by name, tail-only past a size cap. */
  async readFile(name: string): Promise<string> {
    if (!this._logDir) return "";
    const { join } = await import("@tauri-apps/api/path");
    const { stat, readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await join(this._logDir, name);
    try {
      const size = await stat(path).then((info) => info.size).catch(() => 0);
      if (size <= MAX_VIEW_BYTES) return await readTextFile(path);
      // A day-long session can leave a very large app log. Reading it whole
      // means a multi-MB string plus every line split out of it, so the viewer
      // gets the tail — which is what diagnostics actually need.
      return (await this.readTail(path, size)) ?? "";
    } catch {
      return "";
    }
  }

  private async readTail(path: string, size: number): Promise<string | null> {
    const { open, SeekMode } = await import("@tauri-apps/plugin-fs");
    const file = await open(path, { read: true });
    try {
      await file.seek(size - MAX_VIEW_BYTES, SeekMode.Start);
      const buffer = new Uint8Array(MAX_VIEW_BYTES);
      const read = await file.read(buffer);
      const text = new TextDecoder().decode(buffer.subarray(0, read ?? 0));
      // The window almost certainly starts mid-line; drop that fragment.
      const newline = text.indexOf("\n");
      return newline >= 0 ? text.slice(newline + 1) : text;
    } finally {
      await file.close().catch(() => {});
    }
  }


  /** Delete a log file by name */
  async deleteFile(name: string): Promise<void> {
    if (!this._logDir) return;
    const { join } = await import("@tauri-apps/api/path");
    const { remove } = await import("@tauri-apps/plugin-fs");
    const path = await join(this._logDir, name);
    await remove(path);
  }

  /**
   * Remove log files older than `days` days.
   * Call once at startup after init().
   */
  async cleanupOldFiles(days: number): Promise<void> {
    if (!this._logDir || days < 1) return;
    try {
      const { readDir, remove } = await import("@tauri-apps/plugin-fs");
      const { join } = await import("@tauri-apps/api/path");
      const entries = await readDir(this._logDir);
      const now = Date.now();
      const cutoff = days * 24 * 60 * 60 * 1000;

      for (const entry of entries) {
        if (!entry.name?.startsWith("app-") || !entry.name.endsWith(".log")) continue;
        // Parse date from filename: app-2026-07-22.log
        const datePart = entry.name.replace("app-", "").replace(".log", "");
        const ts = new Date(datePart).getTime();
        if (isNaN(ts)) continue;
        if (now - ts > cutoff) {
          const path = await join(this._logDir, entry.name);
          await remove(path).catch(() => {});
        }
      }
    } catch {
      // Silently ignore cleanup failures
    }
  }

  // ── Internal ──

  private _write(level: LogLevel, source: string, message: string): void {
    this._push(level, source, message);
    if (this._ready) {
      this._appendToFile(level, source, message).catch(() => {});
    } else {
      // Not ready yet — still log to console
      console.log(`[${level}] [${source}] ${message}`);
    }
  }

  /** Synchronous write used by error handlers (no await) */
  private _writeSync(level: LogLevel, source: string, message: string): void {
    this._push(level, source, message);
    // Can't await in sync context, fire and forget
    if (this._ready) {
      this._appendToFile(level, source, message);
    }
  }

  private _push(level: LogLevel, source: string, message: string): void {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] [${source}] ${message}`;
    this._buffer.push(line);
    if (this._buffer.length > MAX_BUFFER) this._buffer.shift();
  }

  private async _appendToFile(level: LogLevel, source: string, message: string): Promise<void> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { join } = await import("@tauri-apps/api/path");
      const date = new Date().toISOString().slice(0, 10);
      const path = await join(this._logDir, `app-${date}.log`);
      const ts = new Date().toISOString();
      const line = `[${ts}] [${level}] [${source}] ${message}\n`;
      await invoke("append_to_file", { path, content: line });
    } catch {
      // Silently ignore write failures
    }
  }
}

/** Global singleton */
export const appLogger = new AppLogger();
export default appLogger;
