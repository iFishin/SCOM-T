import { describe, it, expect } from "vitest";
import {
  bytesToEnderString,
  enderStringToBytes,
  buildEnderOptions,
  appendEnderFallback,
} from "./enderOptions";
import type { CustomEnder } from "../hooks/useSettings";

describe("ender byte-string round trip", () => {
  it("preserves arbitrary bytes including 0x00 and 0xFF", () => {
    const bytes = [0x00, 0x0d, 0x0a, 0xff, 0x80];
    expect(enderStringToBytes(bytesToEnderString(bytes))).toEqual(bytes);
  });

  it("maps an empty string to no bytes", () => {
    expect(enderStringToBytes("")).toEqual([]);
    expect(bytesToEnderString([])).toBe("");
  });
});

describe("buildEnderOptions", () => {
  it("includes the four built-ins first", () => {
    const opts = buildEnderOptions([], "en");
    expect(opts.map((o) => o.value)).toEqual(["\r\n", "", "\n", "\r"]);
  });

  it("appends valid custom enders as byte-strings", () => {
    const custom: CustomEnder[] = [{ id: "1", label: "ESC", hex: "1B" }];
    const opts = buildEnderOptions(custom, "en");
    const last = opts[opts.length - 1];
    expect(last.value).toBe("\x1b");
    expect(last.label).toBe("ESC");
  });

  it("skips custom enders with invalid or empty hex", () => {
    const custom: CustomEnder[] = [
      { id: "1", label: "bad", hex: "ZZ" },
      { id: "2", label: "empty", hex: "" },
      { id: "3", label: "ok", hex: "0A" },
    ];
    const opts = buildEnderOptions(custom, "en");
    expect(opts).toHaveLength(5); // 4 built-ins + 1 valid
    expect(opts[opts.length - 1].value).toBe("\n");
  });
});

describe("appendEnderFallback", () => {
  it("returns options unchanged when the value is already present", () => {
    const opts = buildEnderOptions([], "en");
    expect(appendEnderFallback(opts, "\r\n", "en")).toBe(opts);
  });

  it("returns options unchanged for an empty value", () => {
    const opts = buildEnderOptions([], "en");
    expect(appendEnderFallback(opts, "", "en")).toBe(opts);
  });

  it("appends a placeholder for a missing terminator, keeping its bytes", () => {
    const opts = buildEnderOptions([], "en");
    const result = appendEnderFallback(opts, "\x1b", "en");
    expect(result).toHaveLength(opts.length + 1);
    expect(result[result.length - 1].value).toBe("\x1b");
    expect(result[result.length - 1].label).toContain("1B");
  });
});
