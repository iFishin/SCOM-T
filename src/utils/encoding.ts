/**
 * 字符编码清单。
 *
 * 全部取自 WHATWG Encoding Standard 的标签，因此浏览器原生 `TextDecoder`
 * 与 Rust 侧 `encoding_rs` 解析结果完全一致 —— 接收和发送不会出现
 * "能看懂但发不出去" 的错配。
 *
 * 刻意不支持 UTF-16/UTF-32：这类编码的换行符是双字节（0A 00），
 * 现有的按 0x0A 分行逻辑会把一个字符劈成两半。
 */

export const TEXT_ENCODINGS = [
  "utf-8",
  "gb18030",
  "big5",
  "shift_jis",
  "euc-kr",
  "windows-1252",
] as const;

export type TextEncoding = (typeof TEXT_ENCODINGS)[number];

export const DEFAULT_ENCODING: TextEncoding = "utf-8";

/** 下拉框里显示的名字，后面括号里是它覆盖的常见叫法。 */
export const ENCODING_LABELS: Record<TextEncoding, string> = {
  "utf-8": "UTF-8",
  gb18030: "GB18030（GBK / GB2312）",
  big5: "Big5（繁体中文）",
  "shift_jis": "Shift_JIS（日文）",
  "euc-kr": "EUC-KR（韩文）",
  "windows-1252": "Windows-1252（西欧）",
};

/** 手改 config.yaml 时可能写进来的别名，统一收敛到标准标签。 */
const ALIASES: Record<string, TextEncoding> = {
  "utf8": "utf-8",
  "utf-8": "utf-8",
  "unicode": "utf-8",
  "gbk": "gb18030",
  "gb2312": "gb18030",
  "gb-2312": "gb18030",
  "gb18030": "gb18030",
  "cp936": "gb18030",
  "big5": "big5",
  "big-5": "big5",
  "cp950": "big5",
  "sjis": "shift_jis",
  "shift-jis": "shift_jis",
  "shift_jis": "shift_jis",
  "cp932": "shift_jis",
  "euckr": "euc-kr",
  "euc-kr": "euc-kr",
  "cp949": "euc-kr",
  "cp1252": "windows-1252",
  "windows-1252": "windows-1252",
  "latin1": "windows-1252",
  "iso-8859-1": "windows-1252",
};

export function isTextEncoding(value: unknown): value is TextEncoding {
  return typeof value === "string" && (TEXT_ENCODINGS as readonly string[]).includes(value);
}

/** 归一化：别名与大小写都接受，无法识别时回落到默认编码。 */
export function normalizeEncoding(
  value: unknown,
  fallback: TextEncoding = DEFAULT_ENCODING,
): TextEncoding {
  if (typeof value !== "string") return fallback;
  const key = value.trim().toLowerCase();
  return ALIASES[key] ?? fallback;
}
