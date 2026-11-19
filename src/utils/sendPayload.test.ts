import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encodeSendPayload, SendCancelledError } from "./sendPayload";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  // 假编码器：把每个字符编成 "0x80 | code" 一个字节，便于断言走了 Rust 这条路。
  invoke: vi.fn(async (command: string, args: { text: string; encoding: string }) => {
    if (command !== "encode_text") throw new Error(`unexpected command ${command}`);
    return Array.from(args.text, (ch) => 0x80 | (ch.charCodeAt(0) & 0x7f));
  }),
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.mocked(invoke).mockClear();
});

describe("encodeSendPayload", () => {
  it("appends CRLF to an ascii command", async () => {
    expect(await encodeSendPayload("AT", "ascii", "\r\n")).toEqual([0x41, 0x54, 0x0d, 0x0a]);
  });

  it("sends the command alone when the terminator is empty", async () => {
    expect(await encodeSendPayload("AT", "ascii", "")).toEqual([0x41, 0x54]);
  });

  it("keeps a custom terminator as raw bytes, not UTF-8", async () => {
    // A custom ender of byte 0xFF must stay one byte, not become EF BF BD.
    expect(await encodeSendPayload("AT", "ascii", "ÿ")).toEqual([0x41, 0x54, 0xff]);
  });

  it("encodes utf-8 command bytes for ascii mode", async () => {
    expect(await encodeSendPayload("中", "ascii", "")).toEqual([0xe4, 0xb8, 0xad]);
  });

  it("never asks the backend to encode utf-8", async () => {
    await encodeSendPayload("中", "ascii", "\r\n");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("delegates non-utf-8 text to the backend encoder", async () => {
    const bytes = await encodeSendPayload("AT", "ascii", "\r\n", "gb18030");

    expect(invoke).toHaveBeenCalledWith("encode_text", { text: "AT", encoding: "gb18030" });
    // 正文走后端，结尾符仍然按原始字节追加。
    expect(bytes).toEqual([0xc1, 0xd4, 0x0d, 0x0a]);
  });

  it("parses hex mode and appends the terminator bytes", async () => {
    expect(await encodeSendPayload("AA BB", "hex", "\r\n")).toEqual([0xaa, 0xbb, 0x0d, 0x0a]);
  });

  it("ignores the encoding setting in hex mode", async () => {
    expect(await encodeSendPayload("D6 D0", "hex", "", "gb18030")).toEqual([0xd6, 0xd0]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("allows a hex payload of only a terminator", async () => {
    expect(await encodeSendPayload("  ", "hex", "\r\n")).toEqual([0x0d, 0x0a]);
  });

  it("throws on a wholly empty payload", async () => {
    await expect(encodeSendPayload("", "ascii", "")).rejects.toThrow();
    await expect(encodeSendPayload("   ", "hex", "")).rejects.toThrow();
  });

  it("throws on invalid hex", async () => {
    await expect(encodeSendPayload("ZZ", "hex", "")).rejects.toThrow();
  });

  it("surfaces the backend error message", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("字符“中”无法用 windows-1252 编码。");
    await expect(encodeSendPayload("中", "ascii", "", "windows-1252")).rejects.toThrow(
      /windows-1252/,
    );
  });
});

describe("SendCancelledError", () => {
  it("carries a recognisable name", () => {
    expect(new SendCancelledError().name).toBe("SendCancelledError");
  });
});
