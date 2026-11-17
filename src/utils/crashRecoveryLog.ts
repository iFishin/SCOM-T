import type { SerialLogEntry } from "../serial/types.ts";

const CRASH_DIR = "SCOM-T/crash-recovery";

/**
 * A session log is rotated once it grows past this. One previous file is kept,
 * so a session can hold at most ~2× this on disk no matter how long it runs.
 * Without rotation a day-long loop could leave hundreds of MB behind, which is
 * what made startup re-reads blow up memory.
 *
 * 2 MB is deliberately small: recovery only ever hands back MAX_RESTORE_ENTRIES
 * entries, and a typical line is a few hundred bytes, so the useful tail fits
 * well under this. Anything beyond it is bytes we would read and throw away.
 */
const MAX_LOG_BYTES = 2 * 1024 * 1024;

/**
 * Startup only reads the tail of a large leftover log. Restoring the whole file
 * is never worth it: recovered entries go straight into React state and are all
 * rendered, so a 500 MB file would freeze the app before it even opens.
 *
 * Sized to cover the restore cap with room for long entries: 512 KB still holds
 * a thousand-plus typical lines, and it is a single allocation at startup
 * instead of a multi-hundred-MB string.
 */
const TAIL_READ_BYTES = 512 * 1024;

/**
 * Hard cap on how many recovered entries are handed back to the UI. The live
 * view keeps 10k entries, but those arrive gradually; restoring thousands at
 * once is a much heavier first paint, and the tail is what matters for
 * diagnosing a crash anyway.
 *
 * 1000 is the tail that actually helps: enough context around the crash, small
 * enough that the first paint after a bad shutdown is not itself the freeze.
 */
export const MAX_RESTORE_ENTRIES = 1_000;

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

/**
 * Move an oversized log aside before appending. Keeps exactly one backup; the
 * older one is dropped. If the rename is refused (permissions, missing scope),
 * the oversized file is removed instead — losing old recovery data is far
 * better than letting the file grow without bound.
 */
async function rotateIfNeeded(path: string, incomingBytes: number): Promise<void> {
  const { stat, rename, remove } = await import("@tauri-apps/plugin-fs");
  const size = await stat(path).then((info) => info.size).catch(() => 0);
  if (size === 0 || size + incomingBytes <= MAX_LOG_BYTES) return;

  const backup = `${path}.1`;
  await remove(backup).catch(() => {});
  try {
    await rename(path, backup);
  } catch {
    await remove(path).catch(() => {});
  }
}

/**
 * Serialize one entry for the on-disk log. `rawBytes` is written as a plain
 * number array so existing files stay readable, but the in-memory form is a
 * Uint8Array (see types.ts) — a JS number array costs roughly ten times the
 * bytes it carries, and at 10k live entries that adds up.
 */
export function encodeEntry(entry: SerialLogEntry): string {
  const { rawBytes, ...rest } = entry;
  if (!rawBytes || rawBytes.length === 0) return JSON.stringify(rest);
  return JSON.stringify({ ...rest, rawBytes: Array.from(rawBytes) });
}

function decodeEntry(line: string): SerialLogEntry | null {
  try {
    const parsed = JSON.parse(line) as Omit<SerialLogEntry, "rawBytes"> & {
      rawBytes?: number[] | null;
    };
    if (Array.isArray(parsed.rawBytes) && parsed.rawBytes.length > 0) {
      return { ...parsed, rawBytes: Uint8Array.from(parsed.rawBytes) };
    }
    const { rawBytes: _ignored, ...rest } = parsed;
    return rest;
  } catch {
    return null;
  }
}

/** Append entries as JSON Lines — machine-parseable, byte-safe for binary/multi-line payloads. */
export async function appendCrashLog(sessionId: string, entries: SerialLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await ensureCrashDir();
  const text = entries.map(encodeEntry).join("\n") + "\n";
  const path = await crashLogPath(sessionId);
  await rotateIfNeeded(path, new TextEncoder().encode(text).length);
  await writeTextFile(path, text, { append: true });
}

/** Read at most `limit` bytes from the end of a file, without loading the rest. */
async function readTail(path: string, size: number, limit: number): Promise<string> {
  const { open, SeekMode } = await import("@tauri-apps/plugin-fs");
  const file = await open(path, { read: true });
  try {
    const start = Math.max(0, size - limit);
    await file.seek(start, SeekMode.Start);
    const buffer = new Uint8Array(Math.min(limit, size - start));
    const read = await file.read(buffer);
    const bytes = read === null ? buffer.subarray(0, 0) : buffer.subarray(0, read);
    // The first line is very likely cut mid-record; parseEntries drops it.
    return new TextDecoder().decode(bytes);
  } finally {
    await file.close().catch(() => {});
  }
}

function parseEntries(text: string, dropFirstLine: boolean): SerialLogEntry[] {
  const lines = text.split("\n");
  if (dropFirstLine) lines.shift();

  const entries: SerialLogEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip malformed lines (torn write mid-crash, or a half line at the tail cut).
    const entry = decodeEntry(trimmed);
    if (entry) entries.push(entry);
  }
  return entries.length > MAX_RESTORE_ENTRIES ? entries.slice(-MAX_RESTORE_ENTRIES) : entries;
}

/** Read back any leftover crash-recovery log for a session, if present. */
export async function readCrashLog(sessionId: string): Promise<SerialLogEntry[]> {
  const { stat, readTextFile } = await import("@tauri-apps/plugin-fs");
  const path = await crashLogPath(sessionId);
  const size = await stat(path).then((info) => info.size).catch(() => -1);
  if (size < 0) return [];

  if (size <= TAIL_READ_BYTES) {
    const text = await readTextFile(path).catch(() => "");
    return text ? parseEntries(text, false) : [];
  }

  const text = await readTail(path, size, TAIL_READ_BYTES).catch(() => "");
  return text ? parseEntries(text, true) : [];
}

/** Remove a session's crash-recovery log, e.g. after explicit restore/discard or session close. */
export async function clearCrashLog(sessionId: string): Promise<void> {
  const { remove } = await import("@tauri-apps/plugin-fs");
  const path = await crashLogPath(sessionId);
  await remove(path).catch(() => {});
  await remove(`${path}.1`).catch(() => {});
}
