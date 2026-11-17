import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SerialLogEntry } from "../serial/types.ts";

/**
 * In-memory stand-in for the Tauri fs plugin. Only the handful of commands this
 * module uses are implemented, but they follow the real semantics that matter
 * here: append creates the file, stat/rename/remove throw on a missing path,
 * and FileHandle.read returns null at EOF.
 */
const { files, calls } = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  calls: { readTextFile: 0, open: 0, seek: 0 },
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: async () => "/home/tester",
  join: async (...parts: string[]) => parts.join("/"),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  SeekMode: { Start: 0, Current: 1, End: 2 },
  mkdir: async () => {},
  exists: async (path: string) => files.has(path),
  readTextFile: async (path: string) => {
    calls.readTextFile++;
    const file = files.get(path);
    if (!file) throw new Error(`ENOENT: ${path}`);
    return new TextDecoder().decode(file);
  },
  writeTextFile: async (
    path: string,
    data: string,
    options?: { append?: boolean },
  ) => {
    const next = new TextEncoder().encode(data);
    const previous = options?.append ? files.get(path) : undefined;
    if (!previous) {
      files.set(path, next);
      return;
    }
    const merged = new Uint8Array(previous.length + next.length);
    merged.set(previous);
    merged.set(next, previous.length);
    files.set(path, merged);
  },
  stat: async (path: string) => {
    const file = files.get(path);
    if (!file) throw new Error(`ENOENT: ${path}`);
    return { size: file.length };
  },
  remove: async (path: string) => {
    if (!files.delete(path)) throw new Error(`ENOENT: ${path}`);
  },
  rename: async (from: string, to: string) => {
    const file = files.get(from);
    if (!file) throw new Error(`ENOENT: ${from}`);
    files.set(to, file);
    files.delete(from);
  },
  open: async (path: string) => {
    calls.open++;
    const file = files.get(path);
    if (!file) throw new Error(`ENOENT: ${path}`);
    let position = 0;
    return {
      seek: async (offset: number) => {
        calls.seek++;
        position = offset;
        return position;
      },
      read: async (buffer: Uint8Array) => {
        const count = Math.min(buffer.length, file.length - position);
        if (count <= 0) return null;
        buffer.set(file.subarray(position, position + count));
        position += count;
        return count;
      },
      close: async () => {},
    };
  },
}));

import {
  appendCrashLog,
  clearCrashLog,
  encodeEntry,
  readCrashLog,
  MAX_RESTORE_ENTRIES,
} from "./crashRecoveryLog.ts";

const DIR = "/home/tester/SCOM-T/crash-recovery";
const logPath = (id: string) => `${DIR}/${id}.jsonl`;
const backupPath = (id: string) => `${logPath(id)}.1`;

function entry(seq: number, payload = "AT+CSQ"): SerialLogEntry {
  return {
    id: String(seq),
    direction: seq % 2 === 0 ? "received" : "sent",
    mode: "ascii",
    payload,
    rawBytes: Uint8Array.from([0x41, 0x54]),
    timestamp: "[10:42:07.114]",
    seq,
    complete: true,
  };
}

function seed(id: string, text: string): void {
  files.set(logPath(id), new TextEncoder().encode(text));
}

const jsonl = (entries: SerialLogEntry[]) =>
  entries.map(encodeEntry).join("\n") + "\n";

beforeEach(() => {
  files.clear();
  calls.readTextFile = 0;
  calls.open = 0;
  calls.seek = 0;
});

describe("readCrashLog", () => {
  it("returns an empty list when there is no leftover log", async () => {
    await expect(readCrashLog("s1")).resolves.toEqual([]);
  });

  it("parses a small log with readTextFile and keeps the order", async () => {
    seed("s1", jsonl([entry(1), entry(2), entry(3)]));

    const entries = await readCrashLog("s1");

    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(calls.readTextFile).toBe(1);
    expect(calls.open).toBe(0);
  });

  it("skips a torn line instead of failing the whole restore", async () => {
    seed("s1", `${encodeEntry(entry(1))}\n{"id":"2","payload":"hal\n${encodeEntry(entry(3))}\n`);

    const entries = await readCrashLog("s1");

    expect(entries.map((e) => e.seq)).toEqual([1, 3]);
  });

  it("reads only the tail of an oversized log, dropping the cut first line", async () => {
    // ~200 bytes per record × 12000 ≈ 2.4 MB, past the 512 KB tail window.
    const many = Array.from({ length: 12000 }, (_, i) =>
      entry(i, "A".repeat(160)),
    );
    seed("s1", jsonl(many));

    const entries = await readCrashLog("s1");

    expect(calls.readTextFile).toBe(0);
    expect(calls.open).toBe(1);
    expect(calls.seek).toBe(1);
    // Capped for the UI, and the newest records survive.
    expect(entries).toHaveLength(MAX_RESTORE_ENTRIES);
    expect(entries[entries.length - 1].seq).toBe(11999);
    expect(entries[0].seq).toBe(11999 - MAX_RESTORE_ENTRIES + 1);
    // The partially-read first line must not turn into a malformed entry.
    expect(entries.every((e) => typeof e.seq === "number")).toBe(true);
  });

  it("returns an empty list when the leftover file has no parseable lines", async () => {
    files.set(logPath("s1"), new Uint8Array([0xff, 0xfe, 0x00]));
    await expect(readCrashLog("s1")).resolves.toEqual([]);
  });
});

describe("appendCrashLog", () => {
  it("appends without rotating while the log is small", async () => {
    seed("s1", jsonl([entry(1)]));

    await appendCrashLog("s1", [entry(2)]);

    expect(files.has(backupPath("s1"))).toBe(false);
    const text = new TextDecoder().decode(files.get(logPath("s1")));
    expect(text.trim().split("\n")).toHaveLength(2);
  });

  it("rotates to a single backup once the file passes the size limit", async () => {
    seed("s1", jsonl([entry(1)]));
    // Pretend the live log already reached the 2 MB ceiling.
    files.set(logPath("s1"), new Uint8Array(3 * 1024 * 1024));

    await appendCrashLog("s1", [entry(2)]);

    expect(files.get(backupPath("s1"))?.length).toBe(3 * 1024 * 1024);
    const live = new TextDecoder().decode(files.get(logPath("s1")));
    expect(live).toContain('"seq":2');

    // Second rotation replaces the old backup instead of stacking files.
    files.set(logPath("s1"), new Uint8Array(3 * 1024 * 1024));
    await appendCrashLog("s1", [entry(3)]);

    expect(files.get(backupPath("s1"))?.length).toBe(3 * 1024 * 1024);
    expect(
      [...files.keys()].filter((k) => k.startsWith(logPath("s1"))).sort(),
    ).toEqual([logPath("s1"), backupPath("s1")].sort());
    expect(new TextDecoder().decode(files.get(logPath("s1")))).toContain('"seq":3');
  });
});

describe("clearCrashLog", () => {
  it("removes the live log and its backup", async () => {
    seed("s1", jsonl([entry(1)]));
    files.set(backupPath("s1"), new Uint8Array([0x0a]));

    await clearCrashLog("s1");

    expect(files.has(logPath("s1"))).toBe(false);
    expect(files.has(backupPath("s1"))).toBe(false);
  });

  it("does not throw when there is nothing to clear", async () => {
    await expect(clearCrashLog("missing")).resolves.toBeUndefined();
  });
});
