import { useState, useRef, useCallback, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { SerialLogEntry } from "./useSerialPort";

function formatLogEntry(log: SerialLogEntry): string {
  const dir = log.direction === "received" ? "RX" : "TX";
  const ts = log.timestamp.replace(/^\[|\]$/g, "");
  const payload = log.rawBytes
    ? new TextDecoder().decode(new Uint8Array(log.rawBytes))
    : log.payload;
  if (payload.length === 0) return `[${ts}] [${dir}] [${log.mode.toUpperCase()}]\n`;
  return `[${ts}] [${dir}] [${log.mode.toUpperCase()}] ${payload}${payload.endsWith("\n") ? "" : "\n"}`;
}

export function useLogFile() {
  const [savePath, setSavePath] = useState<string | null>(null);
  const [realTime, setRealTime] = useState(true);
  const savePathRef = useRef<string | null>(null);
  const realTimeRef = useRef(true);
  const writingRef = useRef(false);
  const pendingRef = useRef<SerialLogEntry[]>([]);
  const activeWriteRef = useRef<Promise<boolean> | null>(null);
  const logCountRef = useRef(0);

  useEffect(() => {
    savePathRef.current = savePath;
  }, [savePath]);

  useEffect(() => {
    realTimeRef.current = realTime;
  }, [realTime]);

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
    closeLogFile,
  };
}
