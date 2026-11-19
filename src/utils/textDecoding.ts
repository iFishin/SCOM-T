/**
 * 字节 → 文本的无损解码。
 *
 * 契约：**任何字节都不会被静默丢掉**。能解码的按所选字符集解成文字，
 * 解不出来的字节输出可逆的 `\xHH` 转义，绝不产生 U+FFFD（方块问号，
 * 见 #36 / #37）。字面反斜杠加倍，保证 `\xHH` 不会与真实的反斜杠混淆。
 *
 * UTF-8 用手写实现，是默认路径，热路径上零分配（除结果字符串本身）。
 * 其他编码走浏览器原生 `TextDecoder`：先整块解，抛错时才逐字节回退 ——
 * 只有在真的出现非法字节时才会走慢路径。
 */

import { DEFAULT_ENCODING, type TextEncoding } from "./encoding.ts";

/** 把不可解码的字节写成可逆的 `\xHH`。 */
export function escapeByte(byte: number): string {
  return `\\x${(byte & 0xff).toString(16).padStart(2, "0").toUpperCase()}`;
}

type DecodedChunk = { text: string; carry: number[] };

/**
 * 判断这串字节是不是"合法的开头但还没凑齐"—— 比如 GBK 的单个 `0xD6`。
 * 只看前缀不够：非法字节单独喂进去也会抛错，所以要区分两种情况。
 */
function isIncompletePrefix(encoding: TextEncoding, bytes: Uint8Array): boolean {
  const probe = new TextDecoder(encoding, { fatal: true });
  try {
    return probe.decode(bytes, { stream: true }).length === 0;
  } catch {
    return false;
  }
}

/**
 * Strict UTF-8 decoding that NEVER produces U+FFFD.
 *
 * - Valid UTF-8 sequences become characters (Chinese text stays intact).
 * - Invalid bytes (0xAA, 0xFB, isolated continuation bytes, overlong forms…)
 *   become printable `\xHH` tokens, so no byte is silently lost.
 * - A literal backslash is doubled so the mapping stays unambiguous.
 * - A trailing incomplete sequence is returned in `carry` for the next chunk.
 */
function decodeUtf8Lossless(
  bytes: number[] | Uint8Array,
  carry: number[] = [],
): DecodedChunk {
  const input = carry.length > 0 ? carry.concat(Array.from(bytes)) : Array.from(bytes);
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

/**
 * 有状态的流式解码器。串口/TCP 的分片可能把一个多字节字符劈成两半，
 * 半截序列会被留在 carry 里等下一块，不会变成乱码。
 *
 * 一个连接复用一个实例；切换编码时调 setEncoding()，它会清空 carry。
 */
export class LosslessTextDecoder {
  private encoding: TextEncoding;
  private strict: TextDecoder | null = null;
  private carry: number[] = [];

  constructor(encoding: TextEncoding = DEFAULT_ENCODING) {
    this.encoding = encoding;
    this.build();
  }

  get currentEncoding(): TextEncoding {
    return this.encoding;
  }

  setEncoding(encoding: TextEncoding): void {
    if (encoding === this.encoding) return;
    this.encoding = encoding;
    this.carry = [];
    this.build();
  }

  private build(): void {
    // UTF-8 有手写的无损实现，不用 TextDecoder（后者会把非法字节变成 U+FFFD）。
    this.strict = this.encoding === "utf-8"
      ? null
      // 不加 ignoreBOM：WHATWG 只在 UTF-8/UTF-16 上做 BOM 处理，这些单/多字节
      // 传统编码本来就不会剥 BOM，而 Node 的实现在 ignoreBOM 下会把 0xFF 吞掉。
      : new TextDecoder(this.encoding, { fatal: true });
  }

  decode(bytes: number[] | Uint8Array): string {
    if (this.encoding === "utf-8") {
      const result = decodeUtf8Lossless(bytes, this.carry);
      this.carry = result.carry;
      return result.text;
    }

    if (bytes.length === 0) return "";

    let view: Uint8Array;
    if (this.carry.length === 0) {
      view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    } else {
      view = new Uint8Array(this.carry.length + bytes.length);
      view.set(this.carry, 0);
      view.set(bytes, this.carry.length);
    }
    this.carry = [];

    try {
      return this.strict!.decode(view);
    } catch {
      // 最常见的原因是末尾正好是一个多字节字符的前半截（串口分片边界总是
      // 劈在字中间）。先把末尾 1–3 个字节摘出来，确认它们确实是"合法但
      // 未完成"的前缀、且剩余部分能干净解出，就直接留作 carry —— 比逐字节
      // 回退快一个数量级。
      const maxTail = Math.min(3, view.length - 1);
      for (let tail = 1; tail <= maxTail; tail += 1) {
        const tailBytes = view.subarray(view.length - tail);
        if (!isIncompletePrefix(this.encoding, tailBytes)) continue;
        try {
          const text = this.strict!.decode(view.subarray(0, view.length - tail));
          this.carry = Array.from(tailBytes);
          return text;
        } catch {
          // 剩余部分自己也有问题，不只是尾部半截。
        }
      }
      // 有非法字节，或者整块本身就是半截：逐字节定位。
      return this.decodeLossy(Array.from(view));
    }
  }

  /**
   * 逐字节回退。把每个字节单独喂给严格模式解码器：
   * - 返回空串 = 多字节字符的开头，继续等；
   * - 抛错 = 前面挂起的字节解不出来，转义掉，再用干净状态重试当前字节；
   * - 结尾仍有挂起字节 = 合法的半截序列，留到下一块。
   */
  private decodeLossy(input: number[]): string {
    const fresh = () => new TextDecoder(this.encoding, { fatal: true });
    let out = "";
    let decoder = fresh();
    let pendingStart = 0;
    let i = 0;

    while (i < input.length) {
      let piece = "";
      let failed = false;
      try {
        piece = decoder.decode(Uint8Array.of(input[i]), { stream: true });
      } catch {
        failed = true;
      }

      if (!failed) {
        if (piece.length > 0) {
          out += piece;
          pendingStart = i + 1;
        }
        i += 1;
        continue;
      }

      if (i > pendingStart) {
        // 挂起的首字节被这个字节证伪了，它在这个字符集里非法。
        for (let k = pendingStart; k < i; k += 1) out += escapeByte(input[k]);
        decoder = fresh();
        pendingStart = i;
        // 不推进 i：用干净状态再试一次当前字节，单字节合法就正常解出来。
        continue;
      }

      out += escapeByte(input[i]);
      i += 1;
      decoder = fresh();
      pendingStart = i;
    }

    if (pendingStart < input.length) {
      const tail = input.slice(pendingStart);
      let flushed = "";
      let incomplete = true;
      try {
        // 严格模式下 flush 会为"半截序列"抛错 —— 那正是要留到下一块的 carry。
        flushed = decoder.decode();
        incomplete = false;
      } catch {
        incomplete = true;
      }
      if (incomplete) this.carry = tail;
      else out += flushed;
    }

    return out;
  }

  /** 连接关闭时把挂起的半截序列转义输出，保证字节不丢。 */
  flush(): string {
    if (this.carry.length === 0) return "";
    const text = this.carry.map(escapeByte).join("");
    this.carry = [];
    return text;
  }

  reset(): void {
    this.carry = [];
  }
}

/**
 * 解码一段**完整**的字节（已按行/帧切好）。末尾的半截序列直接转义，
 * 因为没有下一块可以等。
 */
export function decodeBytes(
  bytes: number[] | Uint8Array,
  encoding: TextEncoding = DEFAULT_ENCODING,
): string {
  if (encoding === "utf-8") {
    const { text, carry } = decodeUtf8Lossless(bytes);
    return text + carry.map(escapeByte).join("");
  }
  const decoder = new LosslessTextDecoder(encoding);
  const text = decoder.decode(bytes);
  return text + decoder.flush();
}

/** 兼容旧调用点：按 UTF-8 解码一段完整字节。需要别的字符集用 decodeBytes。 */
export function bytesToAscii(bytes: number[] | Uint8Array): string {
  return decodeBytes(bytes, DEFAULT_ENCODING);
}

/** 兼容旧调用点：固定 UTF-8 的流式解码器。 */
export class Utf8ByteDecoder extends LosslessTextDecoder {
  constructor() {
    super("utf-8");
  }
}
