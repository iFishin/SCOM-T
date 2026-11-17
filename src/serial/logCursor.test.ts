import { describe, it, expect } from "vitest";
import { findFirstEntryAfterSeq } from "./logCursor.ts";
import type { SerialLogEntry } from "./types.ts";

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

describe("findFirstEntryAfterSeq", () => {
  it("starts at the beginning for an unset cursor", () => {
    expect(findFirstEntryAfterSeq(range(1, 5), 0)).toBe(0);
    expect(findFirstEntryAfterSeq(range(1, 5), -1)).toBe(0);
  });

  it("returns the first unseen index", () => {
    const logs = range(1, 10);
    expect(findFirstEntryAfterSeq(logs, 1)).toBe(1);
    expect(findFirstEntryAfterSeq(logs, 7)).toBe(7);
    expect(findFirstEntryAfterSeq(logs, 9)).toBe(9);
  });

  it("returns the length when everything was already processed", () => {
    const logs = range(1, 10);
    expect(findFirstEntryAfterSeq(logs, 10)).toBe(10);
    expect(findFirstEntryAfterSeq(logs, 99)).toBe(10);
  });

  it("survives a trimmed buffer instead of replaying the head", () => {
    // The cap dropped entries 1..5; a stale index would land on entry 6 and
    // re-feed it, while the seq cursor points past what was actually seen.
    const trimmed = range(6, 12);
    // seq 9 sits at index 3, so the next unseen entry (seq 10) is index 4.
    expect(findFirstEntryAfterSeq(trimmed, 9)).toBe(4);
    expect(findFirstEntryAfterSeq(trimmed, 5)).toBe(0);
  });

  it("handles an empty buffer", () => {
    expect(findFirstEntryAfterSeq([], 0)).toBe(0);
    expect(findFirstEntryAfterSeq([], 42)).toBe(0);
  });
});
