import { describe, it, expect } from "vitest";
import { encodeSendPayload, SendCancelledError } from "./sendPayload";

describe("encodeSendPayload", () => {
  it("appends CRLF to an ascii command", () => {
    expect(encodeSendPayload("AT", "ascii", "\r\n")).toEqual([0x41, 0x54, 0x0d, 0x0a]);
  });

  it("sends the command alone when the terminator is empty", () => {
    expect(encodeSendPayload("AT", "ascii", "")).toEqual([0x41, 0x54]);
  });

  it("keeps a custom terminator as raw bytes, not UTF-8", () => {
    // A custom ender of byte 0xFF must stay one byte, not become EF BF BD.
    expect(encodeSendPayload("AT", "ascii", "ÿ")).toEqual([0x41, 0x54, 0xff]);
  });

  it("encodes utf-8 command bytes for ascii mode", () => {
    expect(encodeSendPayload("中", "ascii", "")).toEqual([0xe4, 0xb8, 0xad]);
  });

  it("parses hex mode and appends the terminator bytes", () => {
    expect(encodeSendPayload("AA BB", "hex", "\r\n")).toEqual([0xaa, 0xbb, 0x0d, 0x0a]);
  });

  it("allows a hex payload of only a terminator", () => {
    expect(encodeSendPayload("  ", "hex", "\r\n")).toEqual([0x0d, 0x0a]);
  });

  it("throws on a wholly empty payload", () => {
    expect(() => encodeSendPayload("", "ascii", "")).toThrow();
    expect(() => encodeSendPayload("   ", "hex", "")).toThrow();
  });

  it("throws on invalid hex", () => {
    expect(() => encodeSendPayload("ZZ", "hex", "")).toThrow();
  });
});

describe("SendCancelledError", () => {
  it("carries a recognisable name", () => {
    expect(new SendCancelledError().name).toBe("SendCancelledError");
  });
});
