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

export function formatTimestamp(date = new Date()): string {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  const milliseconds = `${date.getMilliseconds()}`.padStart(3, "0");

  return `[${hours}:${minutes}:${seconds}.${milliseconds}]`;
}
