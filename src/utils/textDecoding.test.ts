import { describe, it, expect } from "vitest";
import { LosslessTextDecoder, decodeBytes } from "./textDecoding";
import { normalizeEncoding } from "./encoding";

describe("decodeBytes / utf-8", () => {
  it("keeps valid multi-byte text intact", () => {
    expect(decodeBytes([0xe4, 0xb8, 0xad], "utf-8")).toBe("中");
  });

  it("escapes invalid bytes instead of emitting U+FFFD", () => {
    expect(decodeBytes([0xff, 0x41], "utf-8")).toBe("\\xFFA");
    expect(decodeBytes([0xaa, 0xfb])).not.toContain("\uFFFD");
  });
});

describe("decodeBytes / gb18030", () => {
  it("decodes GBK-encoded Chinese", () => {
    // "中文" as GBK/GB18030
    expect(decodeBytes([0xd6, 0xd0, 0xce, 0xc4], "gb18030")).toBe("中文");
  });

  it("keeps ASCII untouched", () => {
    expect(decodeBytes([0x4f, 0x4b, 0x0d, 0x0a], "gb18030")).toBe("OK\r\n");
  });

  it("escapes a stray 0xFF (the module-restart noise from #59)", () => {
    expect(decodeBytes([0x37, 0xff, 0x0d], "gb18030")).toBe("7\\xFF\r");
  });

  it("escapes an invalid lead byte and keeps the ASCII byte after it", () => {
    // 0x81 only starts a two-byte sequence; 0x20 can never be its trail.
    expect(decodeBytes([0x81, 0x20], "gb18030")).toBe("\\x81 ");
  });

  it("escapes a dangling lead byte at the end of a complete chunk", () => {
    expect(decodeBytes([0xd6], "gb18030")).toBe("\\xD6");
  });
});

describe("decodeBytes / other charsets", () => {
  it("decodes Big5", () => {
    expect(decodeBytes([0xa4, 0xa4], "big5")).toBe("中");
  });

  it("decodes Shift_JIS", () => {
    // "あ" = 82 A0
    expect(decodeBytes([0x82, 0xa0], "shift_jis")).toBe("あ");
  });

  it("maps every byte in windows-1252", () => {
    expect(decodeBytes([0x80], "windows-1252")).toBe("€");
    // 单字节字符集没有非法序列，0xFF 也有对应字符。
    expect(decodeBytes([0xff], "windows-1252")).toBe("ÿ");
  });
});

describe("LosslessTextDecoder", () => {
  it("carries a split multi-byte character across chunks", () => {
    const decoder = new LosslessTextDecoder("gb18030");
    expect(decoder.decode([0xd6])).toBe("");
    expect(decoder.decode([0xd0])).toBe("中");
  });

  it("flushes a dangling sequence as escaped bytes", () => {
    const decoder = new LosslessTextDecoder("gb18030");
    expect(decoder.decode([0xd6])).toBe("");
    expect(decoder.flush()).toBe("\\xD6");
    expect(decoder.flush()).toBe("");
  });

  it("drops the carry when the encoding changes", () => {
    const decoder = new LosslessTextDecoder("gb18030");
    expect(decoder.decode([0xd6])).toBe("");

    decoder.setEncoding("windows-1252");
    // 若 carry 没被清掉，D6 D0 会被拼成 GBK 的「中」。
    expect(decoder.decode([0xd0])).toBe("Ð");
    expect(decoder.flush()).toBe("");
  });

  it("carries only the trailing half character, not the bytes before it", () => {
    const decoder = new LosslessTextDecoder("gb18030");
    expect(decoder.decode([0xd6, 0xd0, 0xce])).toBe("中");
    expect(decoder.decode([0xc4])).toBe("文");
  });

  it("escapes invalid bytes while still carrying a trailing half char", () => {
    const decoder = new LosslessTextDecoder("gb18030");
    // 0xFF 非法，0xCE 是下一个字的开头：一个转义、一个留到下一块。
    expect(decoder.decode([0xff, 0xce])).toBe("\\xFF");
    expect(decoder.decode([0xc4])).toBe("文");
  });

  it("keeps a trailing 0x0D with its own chunk instead of deferring it", () => {
    const decoder = new LosslessTextDecoder("gb18030");
    // 0xFF 非法、0x0D 是独立的回车：不能把 CR 一起推迟到下一块，
    // 否则换行会跑到下一行去。
    expect(decoder.decode([0x37, 0xff, 0x0d])).toBe("7\\xFF\r");
    expect(decoder.flush()).toBe("");
  });

  it("decodes a long valid stream without dropping anything", () => {
    const decoder = new LosslessTextDecoder("gb18030");
    const source = "AT+QRST\r\nOK\r\n";
    const bytes = Array.from(source, (ch) => ch.charCodeAt(0));
    let out = "";
    for (const byte of bytes) out += decoder.decode([byte]);
    expect(out).toBe(source);
  });
});

describe("normalizeEncoding", () => {
  it("accepts the documented labels", () => {
    expect(normalizeEncoding("gb18030")).toBe("gb18030");
    expect(normalizeEncoding("big5")).toBe("big5");
  });

  it("maps common aliases onto the canonical label", () => {
    expect(normalizeEncoding("GBK")).toBe("gb18030");
    expect(normalizeEncoding("gb2312")).toBe("gb18030");
    expect(normalizeEncoding("UTF8")).toBe("utf-8");
    expect(normalizeEncoding(" SJIS ")).toBe("shift_jis");
    expect(normalizeEncoding("latin1")).toBe("windows-1252");
  });

  it("falls back to utf-8 for anything unknown", () => {
    expect(normalizeEncoding("rot13")).toBe("utf-8");
    expect(normalizeEncoding(undefined)).toBe("utf-8");
    expect(normalizeEncoding(42)).toBe("utf-8");
  });
});
