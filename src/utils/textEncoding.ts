/**
 * 文本 → 字节的编码入口。
 *
 * UTF-8 走浏览器原生的 `TextEncoder`（同步、零 IPC）；其他字符集浏览器没有
 * 对应的编码器（`TextEncoder` 在标准里只支持 UTF-8），转交 Rust 侧的
 * `encode_text`，由 `encoding_rs` 完成 —— 它和 `TextDecoder` 同为
 * WHATWG Encoding Standard 的实现，码表一致。
 */

import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_ENCODING, type TextEncoding } from "./encoding.ts";

function toMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

function hasTauriRuntime(): boolean {
  // Tauri 把 `__TAURI_INTERNALS__` 挂在 window 上，也就是 globalThis。
  return typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;
}

/**
 * 把文本按指定字符集编码成字节。编不出来的字符会抛错（错误信息里带具体
 * 字符），不会静默替换 —— 串口对面是设备，悄悄改写内容比报错更糟。
 */
export async function encodeTextToBytes(
  text: string,
  encoding: TextEncoding = DEFAULT_ENCODING,
): Promise<number[]> {
  if (encoding === "utf-8" || text.length === 0) {
    return Array.from(new TextEncoder().encode(text));
  }

  if (!hasTauriRuntime()) {
    throw new Error(
      `当前运行环境不支持 ${encoding} 编码，请改用 UTF-8 或使用桌面版。`,
    );
  }

  try {
    const bytes = await invoke<number[]>("encode_text", { text, encoding });
    return Array.from(bytes, (byte) => byte & 0xff);
  } catch (error) {
    throw new Error(toMessage(error));
  }
}
