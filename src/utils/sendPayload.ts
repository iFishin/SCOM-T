import { parseHexString } from "./hexConverter.ts";
import type { SendMode } from "../serial/types.ts";

export type AppendNewline = "" | "\r\n" | "\r" | "\n";

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
  const newlineBytes = appendNewline
    ? Array.from(new TextEncoder().encode(appendNewline))
    : [];

  if (sendMode === "hex") {
    const normalized = (value || "").replace(/\s+/g, "");
    const bytes = normalized ? parseHexString(value).concat(newlineBytes) : newlineBytes;
    if (bytes.length === 0) throw new Error("发送内容不能为空。");
    return bytes;
  }

  const finalValue = `${value}${appendNewline}`;
  if (!finalValue) throw new Error("发送内容不能为空。");
  return Array.from(new TextEncoder().encode(finalValue));
}
