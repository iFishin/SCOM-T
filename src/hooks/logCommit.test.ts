import { describe, it, expect } from "vitest";
import { commitLogBatch } from "./logCommit.ts";
import type { SerialLogEntry } from "../serial/types.ts";

const entry = (seq: number): SerialLogEntry => ({
  id: `l${seq}`,
  direction: "received",
  mode: "ascii",
  payload: "OK",
  timestamp: "[t]",
  seq,
});

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => entry(from + i));

const seqs = (logs: SerialLogEntry[]) => logs.map((l) => l.seq);

describe("commitLogBatch", () => {
  it("appends without trimming while under the cap", () => {
    const result = commitLogBatch(range(1, 3), range(4, 5), 10);
    expect(seqs(result.logs)).toEqual([1, 2, 3, 4, 5]);
    expect(result.trimmed).toBe(false);
  });

  it("keeps the newest entries once the cap is exceeded", () => {
    const result = commitLogBatch(range(1, 8), range(9, 12), 10);
    expect(seqs(result.logs)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.trimmed).toBe(true);
  });

  it("keeps the tail when a single batch is larger than the cap", () => {
    const result = commitLogBatch([], range(1, 50), 10);
    expect(seqs(result.logs)).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    expect(result.trimmed).toBe(true);
  });

  it("returns the existing buffer unchanged for an empty batch", () => {
    const current = range(1, 3);
    const result = commitLogBatch(current, [], 10);
    expect(result.logs).toBe(current);
    expect(result.trimmed).toBe(false);
  });

  it("never mutates the arrays it was given", () => {
    const current = range(1, 3);
    const batch = range(4, 5);
    const result = commitLogBatch(current, batch, 10);
    expect(seqs(current)).toEqual([1, 2, 3]);
    expect(seqs(batch)).toEqual([4, 5]);
    expect(result.logs).not.toBe(current);
  });

  it("handles a zero cap without throwing", () => {
    expect(commitLogBatch(range(1, 3), range(4, 5), 0)).toEqual({ logs: [], trimmed: true });
  });

  it("stays at the cap across many batches", () => {
    let logs: SerialLogEntry[] = [];
    for (let i = 0; i < 100; i++) {
      logs = commitLogBatch(logs, range(i * 5 + 1, i * 5 + 5), 20).logs;
      expect(logs.length).toBeLessThanOrEqual(20);
    }
    expect(seqs(logs)).toEqual(range(481, 500).map((e) => e.seq));
  });
});
