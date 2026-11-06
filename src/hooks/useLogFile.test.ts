import { describe, it, expect } from "vitest";
import { enqueueCapped, formatLogEntry } from "./useLogFile";
import type { SerialLogEntry } from "./useSerialPort";

function entry(over: Partial<SerialLogEntry>): SerialLogEntry {
  return {
    id: "e1",
    direction: "received",
    mode: "ascii",
    payload: "OK\r\n",
    timestamp: "[2026-11-06 20:00:00.000]",
    seq: 1,
    ...over,
  };
}

describe("formatLogEntry", () => {
  it("writes ascii entries decoded, without trailing CR/LF", () => {
    expect(formatLogEntry(entry({ payload: "OK\r\n" }))).toBe(
      "[2026-11-06 20:00:00.000] [RX] [ASCII] OK\n",
    );
  });

  it("writes hex entries as hex, never as decoded text (#36)", () => {
    const line = formatLogEntry(
      entry({
        mode: "hex",
        payload: "AA 55 01 00 00 FB AC",
        rawBytes: [0xaa, 0x55, 0x01, 0x00, 0x00, 0xfb, 0xac],
      }),
    );
    expect(line).toBe("[2026-11-06 20:00:00.000] [RX] [HEX] AA 55 01 00 00 FB AC\n");
    expect(line).not.toContain("\ufffd");
  });

  it("decodes rawBytes losslessly for ascii entries", () => {
    const line = formatLogEntry(
      entry({ mode: "ascii", payload: "ignored", rawBytes: [0xff, 0x4f, 0x4b] }),
    );
    expect(line).toContain("\\xFFOK");
    expect(line).not.toContain("\ufffd");
  });

  it("skips entries that are only line endings", () => {
    expect(formatLogEntry(entry({ payload: "\r\n" }))).toBe("");
  });
});

describe("enqueueCapped", () => {
  it("appends while under the cap", () => {
    const q = [1, 2];
    expect(enqueueCapped(q, 3, 5)).toBe(0);
    expect(q).toEqual([1, 2, 3]);
  });

  it("keeps the newest and drops the oldest once full", () => {
    const q = [1, 2, 3];
    expect(enqueueCapped(q, 4, 3)).toBe(1);
    expect(q).toEqual([2, 3, 4]);
  });

  it("reports how many were dropped for a large overrun", () => {
    const q = [1, 2, 3, 4];
    // Cap shrank (or a big batch arrived): drop down to the cap in one go.
    const dropped = enqueueCapped(q, 5, 2);
    expect(dropped).toBe(3);
    expect(q).toEqual([4, 5]);
  });

  it("treats a zero cap as 'keep nothing old'", () => {
    const q = ["a"];
    enqueueCapped(q, "b", 1);
    expect(q).toEqual(["b"]);
  });
});
