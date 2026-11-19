import { useState, useRef, useCallback, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { SerialLogEntry } from "./useSerialPort";
import { bytesToHex } from "../utils/hexConverter";
import { decodeBytes } from "../utils/textDecoding";
import { DEFAULT_ENCODING, type TextEncoding } from "../utils/encoding";

/**
 * Upper bound on entries buffered while the log file cannot be written.
 * The queue is only drained by successful writes, so a persistently failing
 * path (disk full, deleted directory) would otherwise grow without bound.
 */
const MAX_PENDING_ENTRIES = 5_000;

/**
 * Append to a queue that is only drained by successful writes, dropping the
 * oldest entries past `max`. Returns how many were dropped.
 */
export function enqueueCapped<T>(queue: T[], entry: T, max: number): number {
  queue.push(entry);
  if (queue.length <= max) return 0;
  const dropped = queue.length - max;
  queue.splice(0, dropped);
  return dropped;
}

export function formatLogEntry(
  log: SerialLogEntry,
  encoding: TextEncoding = DEFAULT_ENCODING,
): string {
  const dir = log.direction === "received" ? "RX" : "TX";
  const ts = log.timestamp.replace(/^\[|\]$/g, "");
  // 与屏幕上完全同一套解码：HEX 条目写成十六进制文本，ASCII 条目按当前
  // 字符集无损解码。绝不用 TextDecoder 的默认替换行为 —— 非法字节会变成
  // U+FFFD，.log 文件里就成了 "?" 而不是真实流量（#36 / #37）。
  const rawPayload = log.rawBytes && log.rawBytes.length > 0
    ? (log.mode === "hex" ? bytesToHex(log.rawBytes) : decodeBytes(log.rawBytes, encoding))
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
  /** 写进 .log 文件的文本用哪套字符集解码，默认 UTF-8。 */
  encoding?: TextEncoding;
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
  const pendingOverflowWarnedRef = useRef(false);
  const onStateChangeRef = useRef(options?.onStateChange);
  onStateChangeRef.current = options?.onStateChange;
  // 读的是写入那一刻的设置，不是 this render 的快照 —— 日志可能在切换
  // 字符集之后才从队列里落盘。
  const encodingRef = useRef<TextEncoding>(options?.encoding ?? DEFAULT_ENCODING);
  encodingRef.current = options?.encoding ?? DEFAULT_ENCODING;

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
    // The queue is only drained by successful writes. If the target path keeps
    // failing (disk full, revoked permission, deleted directory) it would grow
    // without bound, so keep the newest and drop the oldest past the cap.
    const dropped = enqueueCapped(pendingRef.current, entry, MAX_PENDING_ENTRIES);
    if (dropped > 0 && !pendingOverflowWarnedRef.current) {
      pendingOverflowWarnedRef.current = true;
      console.warn(
        `Log file queue exceeded ${MAX_PENDING_ENTRIES} entries; dropping oldest. ` +
        `Check that the log path is writable (${savePathRef.current}).`,
      );
    }
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
        const text = batch.map((entry) => formatLogEntry(entry, encodingRef.current)).join("");
        if (text) await invoke("append_to_file", { path, content: text });
        pendingRef.current.splice(0, batch.length);
        logCountRef.current += batch.length;
        // Writing works again — let a future stall warn afresh.
        pendingOverflowWarnedRef.current = false;
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
    const text = logs.map((entry) => formatLogEntry(entry, encodingRef.current)).join("");
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
