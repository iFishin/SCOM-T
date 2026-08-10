import { parseHexString } from "./hexConverter.ts";
import type { SendMode } from "../serial/types.ts";
import { enderStringToBytes } from "./enderOptions.ts";

export type AppendNewline = string;

export class SendCancelledError extends Error {
  constructor() {
    super("Send cancelled");
    this.name = "SendCancelledError";
  }
}

export function encodeSendPayload(
  value: string,
  sendMode: SendMode,
  appendNewline: AppendNewline,
): number[] {
  // The terminator is a byte-string (each char = one byte, 0-255). It must be
  // extracted via charCodeAt, NOT TextEncoder — TextEncoder UTF-8 expands any
  // byte >0x7F (e.g. 0xFF → EF BF BD), corrupting custom hex terminators.
  const newlineBytes = enderStringToBytes(appendNewline || "");

  if (sendMode === "hex") {
    const normalized = (value || "").replace(/\s+/g, "");
    const bytes = normalized ? parseHexString(value).concat(newlineBytes) : newlineBytes;
    if (bytes.length === 0) throw new Error("发送内容不能为空。");
    return bytes;
  }

  // Encode the command (UTF-8) separately from the terminator (byte-string).
  const cmdBytes = Array.from(new TextEncoder().encode(value));
  const bytes = cmdBytes.concat(newlineBytes);
  if (bytes.length === 0) throw new Error("发送内容不能为空。");
  return bytes;
}
