import { useState, useRef, useCallback, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { SerialLogEntry } from "./useSerialPort";

function formatLogEntry(log: SerialLogEntry): string {
  const dir = log.direction === "received" ? "RX" : "TX";
  const ts = log.timestamp.replace(/^\[|\]$/g, "");
  const rawPayload = log.rawBytes
    ? new TextDecoder().decode(new Uint8Array(log.rawBytes))
    : log.payload;
  // Drop trailing CR/LF so the formatter's own newline doesn't produce bare
  // empty lines in the file. Whitespace/newline-only chunks are skipped entirely.
  const payload = rawPayload.replace(/[\r\n]+$/, "");
  if (payload.length === 0) return "";
  return `[${ts}] [${dir}] [${log.mode.toUpperCase()}] ${payload}\n`;
}

export function useLogFile(options?: {
  initialSavePath?: string | null;
  initialRealTime?: boolean;
  onStateChange?: (savePath: string | null, realTime: boolean) => void;
}) {
  const [savePath, setSavePath] = useState<string | null>(options?.initialSavePath ?? null);
  const [realTime, setRealTime] = useState(options?.initialRealTime ?? true);
  const savePathRef = useRef<string | null>(options?.initialSavePath ?? null);
  const realTimeRef = useRef(options?.initialRealTime ?? true);
  const writingRef = useRef(false);
  const pendingRef = useRef<SerialLogEntry[]>([]);
  const activeWriteRef = useRef<Promise<boolean> | null>(null);
  const logCountRef = useRef(0);
  const onStateChangeRef = useRef(options?.onStateChange);
  onStateChangeRef.current = options?.onStateChange;

  useEffect(() => {
    savePathRef.current = savePath;
  }, [savePath]);

  useEffect(() => {
    realTimeRef.current = realTime;
  }, [realTime]);

  // Persist selection + mode so the next launch can auto-resume writing.
  // Skip the initial mount fire so we don't clobber persisted values before restore().
  const persistMountedRef = useRef(false);
  useEffect(() => {
    if (!persistMountedRef.current) {
      persistMountedRef.current = true;
      return;
    }
    onStateChangeRef.current?.(savePath, realTime);
  }, [savePath, realTime]);

  /** Receive every ordered log event before UI retention/clearing is applied. */
  const enqueueLog = useCallback((entry: SerialLogEntry) => {
    if (!savePathRef.current) return;
    pendingRef.current.push(entry);
  }, []);

  /** Compatibility no-op: persistence now consumes the uncapped event stream. */
  const syncLogs = useCallback((_logs: SerialLogEntry[]) => {}, []);

  /** Flush one stable prefix. Entries arriving during I/O remain queued. */
  const doWrite = useCallback(async (force = false): Promise<boolean> => {
    if (activeWriteRef.current) {
      await activeWriteRef.current;
      if (pendingRef.current.length === 0) return true;
    }

    const path = savePathRef.current;
    if (!path || (!force && !realTimeRef.current) || writingRef.current) return false;
    if (pendingRef.current.length === 0) return true;

    const batch = pendingRef.current.slice();
    writingRef.current = true;
    const write = (async () => {
      try {
        const text = batch.map(formatLogEntry).join("");
        if (text) await invoke("append_to_file", { path, content: text });
        pendingRef.current.splice(0, batch.length);
        logCountRef.current += batch.length;
        return true;
      } catch (err) {
        console.error("Log write failed:", err);
        return false;
      } finally {
        writingRef.current = false;
        activeWriteRef.current = null;
      }
    })();
    activeWriteRef.current = write;
    return write;
  }, []);

  useEffect(() => {
    if (!savePath || !realTime) return;
    void doWrite();
    const timer = setInterval(() => void doWrite(), 2000);
    return () => clearInterval(timer);
  }, [savePath, realTime, doWrite]);

  const selectLogFile = useCallback(async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const defaultName = `serial-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.log`;

    const result = await save({
      defaultPath: defaultName,
      filters: [
        { name: "Log Files", extensions: ["log", "txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (result) {
      if (savePathRef.current) {
        const flushed = await doWrite(true);
        if (!flushed && pendingRef.current.length > 0) {
          console.error("Cannot switch log files because pending entries could not be flushed.");
          return;
        }
      }
      pendingRef.current = [];
      savePathRef.current = result;
      realTimeRef.current = true;
      setSavePath(result);
      setRealTime(true);
      logCountRef.current = 0;
      void doWrite();
    }
  }, [doWrite]);

  /** Manual save flushes the uncapped queue; the argument remains API-compatible. */
  const flushAll = useCallback(async (_logs?: SerialLogEntry[]) => {
    await doWrite(true);
  }, [doWrite]);

  const restoredRef = useRef(false);
  /** Restore a previously-persisted log file selection on startup, but only if
   *  the file still exists on disk. Runs once. Returns the restored path or null. */
  const restore = useCallback(async (path: string | null, wantRealTime: boolean): Promise<string | null> => {
    if (restoredRef.current) return savePathRef.current;
    restoredRef.current = true;
    if (!path) return null;
    try {
      const { exists } = await import("@tauri-apps/plugin-fs");
      if (!(await exists(path))) return null;
    } catch {
      return null;
    }
    pendingRef.current = [];
    savePathRef.current = path;
    realTimeRef.current = wantRealTime;
    setSavePath(path);
    setRealTime(wantRealTime);
    logCountRef.current = 0;
    return path;
  }, []);

  /** Append the current on-screen log buffer to the file in one shot.
   *  Used to persist logs that already existed before a file was selected. */
  const dumpLogs = useCallback(async (logs: SerialLogEntry[]): Promise<boolean> => {
    const path = savePathRef.current;
    if (!path || logs.length === 0) return false;
    const text = logs.map(formatLogEntry).join("");
    if (!text) return false;
    try {
      await invoke("append_to_file", { path, content: text });
      return true;
    } catch (err) {
      console.error("Log dump failed:", err);
      return false;
    }
  }, []);

  const closeLogFile = useCallback(async () => {
    const flushed = await doWrite(true);
    if (!flushed && pendingRef.current.length > 0) {
      console.error("Log file remains open because pending entries could not be flushed.");
      return;
    }
    pendingRef.current = [];
    savePathRef.current = null;
    realTimeRef.current = false;
    setSavePath(null);
    setRealTime(false);
    logCountRef.current = 0;
  }, [doWrite]);

  return {
    savePath,
    realTime,
    setRealTime,
    selectLogFile,
    enqueueLog,
    syncLogs,
    flushAll,
    dumpLogs,
    restore,
    closeLogFile,
  };
}
