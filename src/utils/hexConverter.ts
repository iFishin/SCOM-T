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

/**
 * 无损解码实现搬到 `textDecoding.ts`（要支持多种字符集了）。
 * 这里保留同名导出，既有调用点和测试都不用改。
 */
export {
  bytesToAscii,
  Utf8ByteDecoder,
  LosslessTextDecoder,
  decodeBytes,
} from "./textDecoding.ts";

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
  bytes: number[] | Uint8Array,
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
