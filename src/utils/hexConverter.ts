export function parseHexString(input: string): number[] {
  const normalized = input.replace(/\s+/g, "").toUpperCase();

  if (!normalized) {
    throw new Error("HEX 内容不能为空。");
  }

  if (!/^[0-9A-F]+$/.test(normalized)) {
    throw new Error("HEX 格式无效，只允许 0-9 和 A-F。");
  }

  if (normalized.length % 2 !== 0) {
    throw new Error("HEX 长度必须为偶数。");
  }

  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 2) {
    bytes.push(Number.parseInt(normalized.slice(index, index + 2), 16));
  }

  return bytes;
}

export function bytesToHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

/** Print a non-text byte as a reversible `\xHH` token instead of U+FFFD. */
function escapeByte(byte: number): string {
  return `\\x${(byte & 0xff).toString(16).padStart(2, "0").toUpperCase()}`;
}

type DecodedChunk = { text: string; carry: number[] };

/**
 * Strict UTF-8 decoding that NEVER produces U+FFFD.
 *
 * - Valid UTF-8 sequences become characters (Chinese text stays intact).
 * - Invalid bytes (0xAA, 0xFB, isolated continuation bytes, overlong forms…)
 *   become printable `\xHH` tokens, so no byte is silently lost.
 * - A literal backslash is doubled so the mapping stays unambiguous.
 * - A trailing incomplete sequence is returned in `carry` for the next chunk.
 *
 * This is the fix for the "方块加问号" corruption: TextDecoder with
 * `fatal:false` replaces every invalid byte with U+FFFD, which is three bytes
 * (EF BF BD) once re-encoded — see issue #36 / #37.
 */
function decodeUtf8Lossless(
  bytes: number[] | Uint8Array,
  carry: number[] = [],
): DecodedChunk {
  const input = carry.concat(Array.from(bytes));
  let text = "";
  let i = 0;

  while (i < input.length) {
    const b0 = input[i];

    if (b0 < 0x80) {
      if (b0 === 0x5c) text += "\\\\";
      else if (b0 === 0x0a || b0 === 0x0d || b0 === 0x09) text += String.fromCharCode(b0);
      else if (b0 < 0x20 || b0 === 0x7f) text += escapeByte(b0);
      else text += String.fromCharCode(b0);
      i += 1;
      continue;
    }

    let needed = 0;
    let codePoint = 0;
    let min = 0;
    if (b0 >= 0xc2 && b0 <= 0xdf) {
      needed = 1; codePoint = b0 & 0x1f; min = 0x80;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      needed = 2; codePoint = b0 & 0x0f; min = 0x800;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      needed = 3; codePoint = b0 & 0x07; min = 0x10000;
    } else {
      // 0x80-0xC1 (isolated continuation / overlong lead), 0xF5-0xFF
      text += escapeByte(b0);
      i += 1;
      continue;
    }

    if (i + needed >= input.length) {
      return { text, carry: input.slice(i) };
    }

    let valid = true;
    for (let k = 1; k <= needed; k++) {
      const bk = input[i + k];
      if (bk < 0x80 || bk > 0xbf) { valid = false; break; }
      codePoint = (codePoint << 6) | (bk & 0x3f);
    }
    if (
      !valid ||
      codePoint < min ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      text += escapeByte(b0);
      i += 1;
      continue;
    }

    text += String.fromCodePoint(codePoint);
    i += needed + 1;
  }

  return { text, carry: [] };
}

/** Decode transport bytes into display text without losing any byte. */
export function bytesToAscii(bytes: number[] | Uint8Array): string {
  const { text, carry } = decodeUtf8Lossless(bytes);
  return text + carry.map(escapeByte).join("");
}

/**
 * Stateful decoder for transports that may split one UTF-8 character across
 * chunks (TCP). Reuse one instance per connection and call reset() on reconnect.
 */
export class Utf8ByteDecoder {
  private carry: number[] = [];

  decode(bytes: number[] | Uint8Array): string {
    const result = decodeUtf8Lossless(bytes, this.carry);
    this.carry = result.carry;
    return result.text;
  }

  /** Emit any dangling incomplete sequence at connection close. */
  flush(): string {
    const text = this.carry.map(escapeByte).join("");
    this.carry = [];
    return text;
  }

  reset(): void {
    this.carry = [];
  }
}

export function normalizePluginPayload(payload: unknown): number[] {
  if (payload instanceof Uint8Array) {
    return Array.from(payload);
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => Number(item) & 0xff);
  }

  if (typeof payload === "string") {
    // The plugin may hand us an already-decoded string. Do NOT use
    // TextEncoder here: any byte >0x7F would be expanded to UTF-8 (EF BF BD).
    return payloadToBytes(payload, "ascii");
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    return (payload as { data: number[] }).data.map((item) => Number(item) & 0xff);
  }

  return [];
}

let _timestampFormat: "time" | "datetime" | "none" = "datetime";

export function setTimestampFormat(format: "time" | "datetime" | "none") {
  _timestampFormat = format;
}

/** Always store the full datetime in log entries. */
export function formatTimestamp(date: Date | number = new Date()): string {
  const value = typeof date === "number" ? new Date(date) : date;
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  const seconds = `${value.getSeconds()}`.padStart(2, "0");
  const milliseconds = `${value.getMilliseconds()}`.padStart(3, "0");

  return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}]`;
}

/**
 * Format a stored timestamp for display based on the current setting.
 * The stored timestamp is always `[YYYY-MM-DD HH:mm:ss.mmm]`.
 * If format is "time", only the time part is shown.
 * If format is "none", an empty string is returned.
 */
export function displayTimestamp(raw: string): string {
  if (_timestampFormat === "none") return "";
  if (_timestampFormat === "time") {
    // Strip the date part: `[YYYY-MM-DD HH:mm:ss.mmm]` → `[HH:mm:ss.mmm]`
    return raw.replace(/^\[\d{4}-\d{2}-\d{2}\s+/, "[");
  }
  return raw;
}

/** Convert a string payload (ascii or hex-mode) back to bytes. */
export function payloadToBytes(payload: string, mode: "ascii" | "hex"): number[] {
  if (mode === "hex") {
    try {
      return parseHexString(payload);
    } catch {
      return [];
    }
  }

  // Inverse of bytesToAscii: `\xHH` tokens -> one byte, `\\` -> a literal
  // backslash, ASCII -> one byte, everything above U+007F -> its UTF-8 bytes.
  //
  // Encoding >U+007F as UTF-8 (not as a single Latin-1 byte) is what makes this
  // a TRUE inverse: a character like "é" is only ever produced by the byte pair
  // C3 A9 (a lone 0xE9 is invalid UTF-8 and decodes to `\xE9`), so mapping it
  // back to 0xE9 would silently change the traffic.
  const bytes: number[] = [];
  for (let i = 0; i < payload.length; i++) {
    const ch = payload[i];
    if (ch === "\\") {
      if (payload[i + 1] === "\\") {
        bytes.push(0x5c);
        i += 1;
        continue;
      }
      const hex = payload.slice(i + 2, i + 4);
      if (payload[i + 1] === "x" && /^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        i += 3;
        continue;
      }
      bytes.push(0x5c);
      continue;
    }

    const codePoint = payload.codePointAt(i)!;
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else {
      bytes.push(...new TextEncoder().encode(String.fromCodePoint(codePoint)));
      if (codePoint > 0xffff) i += 1; // skip the low surrogate
    }
  }
  return bytes;
}

/** Format bytes as a classic hex dump (up to `maxBytes`). Returns lines of [offset, hex, ascii]. */
export function formatHexDump(
  bytes: number[],
  maxBytes = 2048,
): { offset: string; hex: string; ascii: string }[] {
  const slice = bytes.slice(0, maxBytes);
  const lines: { offset: string; hex: string; ascii: string }[] = [];
  const bytesPerLine = 16;

  for (let i = 0; i < slice.length; i += bytesPerLine) {
    const line = slice.slice(i, i + bytesPerLine);
    const offset = i.toString(16).padStart(8, "0").toUpperCase();
    const hexParts: string[] = [];
    const asciiChars: string[] = [];
    for (let j = 0; j < bytesPerLine; j++) {
      if (j < line.length) {
        hexParts.push(line[j].toString(16).padStart(2, "0").toUpperCase());
        asciiChars.push(line[j] >= 0x20 && line[j] <= 0x7e ? String.fromCharCode(line[j]) : ".");
      } else {
        hexParts.push("  ");
        asciiChars.push(" ");
      }
      if (j === 7) hexParts.push(""); // extra space at midpoint
    }
    const hexStr = hexParts.join(" ");
    lines.push({
      offset,
      hex: hexStr,
      ascii: asciiChars.join(""),
    });
  }

  return lines;
}
