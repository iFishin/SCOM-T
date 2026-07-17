import { useState, useRef, useCallback, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { SerialLogEntry } from "./useSerialPort";

function formatLogEntry(log: SerialLogEntry): string {
  const dir = log.direction === "received" ? "RX" : "TX";
  const ts = log.timestamp.replace(/^\[|\]$/g, "");
  return `[${ts}] [${dir}] [${log.mode.toUpperCase()}] ${log.payload}\n`;
}

export function useLogFile() {
  const [savePath, setSavePath] = useState<string | null>(null);
  const [realTime, setRealTime] = useState(false);
  const lastSeqRef = useRef(0);
  const writingRef = useRef(false);
  const logCountRef = useRef(0);
  const logsRef = useRef<SerialLogEntry[]>([]);

  /** Sync latest logs from the hook (ref-based, no re-render) */
  const syncLogs = useCallback((logs: SerialLogEntry[]) => {
    logsRef.current = logs;
  }, []);

  /** Core write: flush all pending entries to disk */
  const doWrite = useCallback(async () => {
    if (!savePath || !realTime || writingRef.current) return;
    const logs = logsRef.current;
    const pending = logs.filter((l) => l.seq > lastSeqRef.current);
    if (pending.length === 0) return;

    writingRef.current = true;
    try {
      const text = pending.map(formatLogEntry).join("");
      await invoke("append_to_file", { path: savePath, content: text });
      lastSeqRef.current = pending[pending.length - 1].seq;
      logCountRef.current += pending.length;
    } catch (err) {
      console.error("Log write failed:", err);
    } finally {
      writingRef.current = false;
    }
  }, [savePath, realTime]);

  // Periodic flush timer — drives writes on a schedule instead of React effects
  useEffect(() => {
    if (!savePath || !realTime) return;
    doWrite(); // flush immediately when starting
    const timer = setInterval(doWrite, 2000);
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
      setSavePath(result);
      setRealTime(false);
      lastSeqRef.current = 0;
      logCountRef.current = 0;
    }
  }, []);

  /** Flush ALL unwritten logs at once — used for manual save */
  const flushAll = useCallback(
    async (logs: SerialLogEntry[]) => {
      if (!savePath || logs.length === 0) return;

      const pending = logs.filter((l) => l.seq > lastSeqRef.current);
      if (pending.length === 0) return;

      try {
        const text = pending.map(formatLogEntry).join("");
        await invoke("append_to_file", { path: savePath, content: text });
        lastSeqRef.current = pending[pending.length - 1].seq;
        logCountRef.current += pending.length;
      } catch (err) {
        console.error("Log flush failed:", err);
      }
    },
    [savePath],
  );

  const closeLogFile = useCallback(() => {
    setSavePath(null);
    setRealTime(false);
    lastSeqRef.current = 0;
    logCountRef.current = 0;
  }, []);

  return {
    savePath,
    realTime,
    setRealTime,
    selectLogFile,
    syncLogs,
    flushAll,
    closeLogFile,
  };
}