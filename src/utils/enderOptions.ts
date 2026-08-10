import { parseHexString, bytesToHex } from "./hexConverter.ts";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import type { CustomEnder } from "../hooks/useSettings.ts";

/** A dropdown entry for the terminator select. */
export type EnderOption = { label: string; value: string };

/**
 * Bytes → byte-string. A terminator is carried as a JS string where each char
 * is one byte (0-255), so arbitrary byte sequences (including 0x00 / 0xFF) can
 * round-trip losslessly. TextEncoder must NOT be used here — it UTF-8 expands
 * any byte >0x7F.
 */
export function bytesToEnderString(bytes: number[]): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b & 0xff);
  return s;
}

/**
 * Byte-string → bytes. Inverse of {@link bytesToEnderString}.
 */
export function enderStringToBytes(s: string): number[] {
  const bytes: number[] = [];
  for (const ch of s) bytes.push(ch.charCodeAt(0) & 0xff);
  return bytes;
}

/**
 * 若 value 未出现在下拉选项里（例如引用了已删除的自定义结尾符），追加一个占位
 * 项，避免下拉框显示成「无结尾符」而发送时仍在追加该字节串。字节串本身保留，
 * 因此发送行为不变，只是让状态可见。
 */
export function appendEnderFallback(options: EnderOption[], value: string, lang: Lang): EnderOption[] {
  if (!value || options.some((o) => o.value === value)) return options;
  const hex = bytesToHex(enderStringToBytes(value));
  return [
    ...options,
    {
      label: lang === "zh" ? `已删除自定义结尾符 (${hex})` : `Deleted terminator (${hex})`,
      value,
    },
  ];
}

/**
 * Build the full terminator dropdown option list: the four built-ins
 * (None / CRLF / LF / CR) plus every valid custom ender.
 */
export function buildEnderOptions(customEnders: CustomEnder[], lang: Lang): EnderOption[] {
  const builtins: EnderOption[] = [
    { label: t("ender_crlf", lang), value: "\r\n" },
    { label: t("ender_none", lang), value: "" },
    { label: t("ender_lf", lang), value: "\n" },
    { label: t("ender_cr", lang), value: "\r" },
  ];

  const customs: EnderOption[] = [];
  for (const e of customEnders || []) {
    if (!e || typeof e.hex !== "string") continue;
    let bytes: number[];
    try {
      bytes = parseHexString(e.hex);
    } catch {
      continue; // skip invalid entries
    }
    if (bytes.length === 0) continue;
    customs.push({
      label: e.label || bytesToHex(bytes),
      value: bytesToEnderString(bytes),
    });
  }

  return [...builtins, ...customs];
}
