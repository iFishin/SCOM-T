import type { SerialLogEntry } from "../serial/types.ts";

const CRASH_DIR = "SCOM-T/crash-recovery";

async function crashDirPath(): Promise<string> {
  const { join, homeDir } = await import("@tauri-apps/api/path");
  return join(await homeDir(), CRASH_DIR);
}

async function crashLogPath(sessionId: string): Promise<string> {
  const { join } = await import("@tauri-apps/api/path");
  return join(await crashDirPath(), `${sessionId}.jsonl`);
}

async function ensureCrashDir(): Promise<void> {
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  await mkdir(await crashDirPath(), { recursive: true }).catch(() => {});
}

/** Append entries as JSON Lines — machine-parseable, byte-safe for binary/multi-line payloads. */
export async function appendCrashLog(sessionId: string, entries: SerialLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await ensureCrashDir();
  const text = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const path = await crashLogPath(sessionId);
  await writeTextFile(path, text, { append: true });
}

/** Read back any leftover crash-recovery log for a session, if present. */
export async function readCrashLog(sessionId: string): Promise<SerialLogEntry[]> {
  const { exists, readTextFile } = await import("@tauri-apps/plugin-fs");
  const path = await crashLogPath(sessionId);
  if (!(await exists(path).catch(() => false))) return [];
  const text = await readTextFile(path).catch(() => "");
  if (!text) return [];
  const entries: SerialLogEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as SerialLogEntry);
    } catch {
      // skip malformed line (e.g. torn write mid-crash)
    }
  }
  return entries;
}

/** Remove a session's crash-recovery log, e.g. after explicit restore/discard or session close. */
export async function clearCrashLog(sessionId: string): Promise<void> {
  const { remove } = await import("@tauri-apps/plugin-fs");
  const path = await crashLogPath(sessionId);
  await remove(path).catch(() => {});
}
