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

export function bytesToAscii(bytes: number[] | Uint8Array): string {
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

export function normalizePluginPayload(payload: unknown): number[] {
  if (payload instanceof Uint8Array) {
    return Array.from(payload);
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => Number(item) & 0xff);
  }

  if (typeof payload === "string") {
    return Array.from(new TextEncoder().encode(payload));
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    return (payload as { data: number[] }).data;
  }

  return [];
}

let _timestampFormat: "time" | "datetime" = "datetime";

export function setTimestampFormat(format: "time" | "datetime") {
  _timestampFormat = format;
}

export function formatTimestamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  const milliseconds = `${date.getMilliseconds()}`.padStart(3, "0");

  if (_timestampFormat === "datetime") {
    return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}]`;
  }
  return `[${hours}:${minutes}:${seconds}.${milliseconds}]`;
}

/** Convert a string payload (ascii or hex-mode) back to bytes */
export function payloadToBytes(payload: string, mode: "ascii" | "hex"): number[] {
  if (mode === "hex") {
    try {
      return parseHexString(payload);
    } catch {
      return [];
    }
  }
  return Array.from(new TextEncoder().encode(payload));
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
    const offset = i.toString(16).padStart(8, "0");
    const hexParts: string[] = [];
    const asciiChars: string[] = [];
    for (let j = 0; j < bytesPerLine; j++) {
      if (j < line.length) {
        hexParts.push(line[j].toString(16).padStart(2, "0"));
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
