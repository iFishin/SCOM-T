import { describe, it, expect } from "vitest";
import {
  parseHexString,
  bytesToHex,
  bytesToAscii,
  normalizePluginPayload,
  formatHexDump,
  formatTimestamp,
  displayTimestamp,
  setTimestampFormat,
  payloadToBytes,
} from "./hexConverter";

describe("parseHexString", () => {
  it("parses space-separated hex", () => {
    expect(parseHexString("AA BB 0C")).toEqual([0xaa, 0xbb, 0x0c]);
  });
  it("parses unseparated lowercase hex", () => {
    expect(parseHexString("aabbcc")).toEqual([0xaa, 0xbb, 0xcc]);
  });
  it("rejects empty input", () => {
    expect(() => parseHexString("   ")).toThrow();
  });
  it("rejects non-hex characters", () => {
    expect(() => parseHexString("ZZ")).toThrow();
  });
  it("rejects odd length", () => {
    expect(() => parseHexString("ABC")).toThrow();
  });
});

describe("bytesToHex / bytesToAscii", () => {
  it("formats uppercase, space-separated, zero-padded", () => {
    expect(bytesToHex([0, 15, 255])).toBe("00 0F FF");
  });
  it("accepts Uint8Array", () => {
    expect(bytesToHex(new Uint8Array([1, 2]))).toBe("01 02");
  });
  it("decodes UTF-8 text", () => {
    expect(bytesToAscii([0x4f, 0x4b])).toBe("OK");
  });
});

describe("payloadToBytes", () => {
  it("round-trips ascii", () => {
    expect(payloadToBytes("AT", "ascii")).toEqual([0x41, 0x54]);
  });
  it("parses hex mode", () => {
    expect(payloadToBytes("0A 0B", "hex")).toEqual([0x0a, 0x0b]);
  });
  it("returns [] for invalid hex instead of throwing", () => {
    expect(payloadToBytes("nope", "hex")).toEqual([]);
  });
});

describe("normalizePluginPayload", () => {
  it("passes through Uint8Array", () => {
    expect(normalizePluginPayload(new Uint8Array([1, 2]))).toEqual([1, 2]);
  });
  it("encodes a string as UTF-8", () => {
    expect(normalizePluginPayload("OK")).toEqual([0x4f, 0x4b]);
  });
  it("masks an array to bytes", () => {
    expect(normalizePluginPayload([256, 257, -1])).toEqual([0, 1, 255]);
  });
  it("masks a { data } payload to bytes", () => {
    expect(normalizePluginPayload({ data: [256, 257, -1] })).toEqual([0, 1, 255]);
  });
  it("returns [] for unknown shapes", () => {
    expect(normalizePluginPayload(42)).toEqual([]);
    expect(normalizePluginPayload(null)).toEqual([]);
    expect(normalizePluginPayload({ other: 1 })).toEqual([]);
  });
});

describe("formatHexDump", () => {
  it("emits one line per 16 bytes with ascii gutter", () => {
    const bytes = Array.from({ length: 20 }, (_, i) => i);
    const lines = formatHexDump(bytes);
    expect(lines).toHaveLength(2);
    expect(lines[0].offset).toBe("00000000");
    expect(lines[1].offset).toBe("00000010");
    expect(lines[0].ascii).toBe("................");
  });
  it("renders printable bytes in the ascii column", () => {
    const [line] = formatHexDump([0x4f, 0x4b]);
    expect(line.ascii.startsWith("OK")).toBe(true);
  });
  it("respects maxBytes", () => {
    const lines = formatHexDump(Array.from({ length: 64 }, () => 0), 16);
    expect(lines).toHaveLength(1);
  });
});

describe("timestamp formatting", () => {
  const date = new Date(2026, 9, 9, 8, 5, 3, 42); // 2026-10-09 08:05:03.042

  it("stores full datetime", () => {
    expect(formatTimestamp(date)).toBe("[2026-10-09 08:05:03.042]");
  });

  it("displayTimestamp honours the current format", () => {
    const raw = formatTimestamp(date);
    setTimestampFormat("datetime");
    expect(displayTimestamp(raw)).toBe(raw);
    setTimestampFormat("time");
    expect(displayTimestamp(raw)).toBe("[08:05:03.042]");
    setTimestampFormat("none");
    expect(displayTimestamp(raw)).toBe("");
    setTimestampFormat("datetime");
  });

  it("accepts a numeric timestamp", () => {
    expect(formatTimestamp(date.getTime())).toBe("[2026-10-09 08:05:03.042]");
  });
});
