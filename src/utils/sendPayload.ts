import { parseHexString } from "./hexConverter.ts";
import type { SendMode } from "../serial/types.ts";
import { enderStringToBytes } from "./enderOptions.ts";
import { DEFAULT_ENCODING, type TextEncoding } from "./encoding.ts";
import { encodeTextToBytes } from "./textEncoding.ts";

export type AppendNewline = string;

export class SendCancelledError extends Error {
  constructor() {
    super("Send cancelled");
    this.name = "SendCancelledError";
  }
}

/**
 * 把一条指令编成线上字节。
 *
 * HEX 模式与结尾符永远按字节走，不受字符集影响；ASCII 模式的正文按
 * `encoding` 编码（UTF-8 是同步的本地路径，其他字符集要过一次 Rust）。
 */
export async function encodeSendPayload(
  value: string,
  sendMode: SendMode,
  appendNewline: AppendNewline,
  encoding: TextEncoding = DEFAULT_ENCODING,
): Promise<number[]> {
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

  // Encode the command separately from the terminator (byte-string).
  const cmdBytes = await encodeTextToBytes(value, encoding);
  const bytes = cmdBytes.concat(newlineBytes);
  if (bytes.length === 0) throw new Error("发送内容不能为空。");
  return bytes;
}
