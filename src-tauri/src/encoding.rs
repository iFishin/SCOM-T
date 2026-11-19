//! 文本 → 字节编码。
//!
//! 浏览器只有 `TextEncoder`（固定 UTF-8），没有 GBK / Big5 的编码器，
//! 所以非 UTF-8 的发送走这里。用 `encoding_rs` —— 它和浏览器的
//! `TextDecoder` 一样实现 WHATWG Encoding Standard，两边认的标签和码表
//! 完全一致，不会出现"能看懂设备回的中文、却发不出中文指令"的错配。
//!
//! 编不出来的字符（比如往 GB18030 里塞 emoji）直接报错并指出是哪个字符，
//! 不做静默替换 —— 串口上是设备在收，悄悄发一串 `&#128512;` 比报错更糟。

use encoding_rs::{EncoderResult, Encoding};

/// 按 WHATWG 标签把文本编码成字节。
#[tauri::command]
pub fn encode_text(text: String, encoding: String) -> Result<Vec<u8>, String> {
    let enc = Encoding::for_label(encoding.trim().as_bytes())
        .ok_or_else(|| format!("不支持的字符编码：{encoding}"))?;

    // UTF-8 就是原始字节，顺手省掉一次查表。
    if enc == encoding_rs::UTF_8 {
        return Ok(text.into_bytes());
    }

    let mut out = Vec::with_capacity(text.len() * 2);
    let mut encoder = enc.new_encoder();
    let mut buf = [0u8; 16];

    for ch in text.chars() {
        let mut unit = [0u8; 4];
        let piece = ch.encode_utf8(&mut unit);
        let (result, read, written) =
            encoder.encode_from_utf8_without_replacement(piece, &mut buf, true);

        // 单字符输入只有三种结局：写完、编不出来（Unmappable）、缓冲不够。
        // 后两种都当作"这个字符发不出去"，直接拒绝，不做静默替换。
        if !matches!(result, EncoderResult::InputEmpty) || read < piece.len() {
            return Err(format!(
                "字符“{ch}”无法用 {} 编码。请换一种编码，或把这条指令改成 HEX 发送。",
                enc.name()
            ));
        }

        out.extend_from_slice(&buf[..written]);
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_roundtrip() {
        assert_eq!(encode_text("AT".into(), "utf-8".into()).unwrap(), b"AT");
        assert_eq!(
            encode_text("中".into(), "utf-8".into()).unwrap(),
            vec![0xe4, 0xb8, 0xad]
        );
    }

    #[test]
    fn gb18030_encodes_chinese() {
        assert_eq!(
            encode_text("中文".into(), "gb18030".into()).unwrap(),
            vec![0xd6, 0xd0, 0xce, 0xc4]
        );
    }

    #[test]
    fn gbk_alias_resolves() {
        assert_eq!(
            encode_text("中".into(), "gbk".into()).unwrap(),
            encode_text("中".into(), "gb18030".into()).unwrap()
        );
    }

    #[test]
    fn ascii_is_identical_across_encodings() {
        for label in ["gb18030", "big5", "shift_jis", "euc-kr", "windows-1252"] {
            assert_eq!(
                encode_text("AT+QRST?".into(), label.into()).unwrap(),
                b"AT+QRST?",
                "label={label}"
            );
        }
    }

    #[test]
    fn gb18030_covers_full_unicode() {
        // GB18030 用四字节区间覆盖了全部码位，emoji 也能编出来 ——
        // 这也是它比 GBK 更适合当默认中文编码的原因。
        assert_eq!(
            encode_text("😀".into(), "gb18030".into()).unwrap(),
            vec![0x94, 0x39, 0xfc, 0x36]
        );
    }

    #[test]
    fn unmappable_character_is_reported() {
        let err = encode_text("中".into(), "windows-1252".into()).unwrap_err();
        assert!(err.contains("中"), "{err}");
    }

    #[test]
    fn unknown_label_is_rejected() {
        assert!(encode_text("A".into(), "not-a-charset".into()).is_err());
    }
}
