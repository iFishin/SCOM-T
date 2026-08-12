import { useState, useCallback, useEffect, useRef } from "react";
import { X, Plus, Trash2, Pin, Search, AlertCircle, Replace, ListFilter, Slice } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/Button.tsx";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";

type Props = {
  text: string;
  lang: Lang;
  onApply: (result: string) => void;
  onClose: () => void;
};

type Mode = "replace" | "keep" | "drop" | "extract";

type Preset = {
  name: string;
  pattern: string;
  replacement: string;
  mode?: Mode;
  pinned?: boolean;
};

const PRESETS_PATH = "SCOM-T/regex-presets.json";

const DEFAULT_PRESETS: Preset[] = [
  { name: "消除时间戳", pattern: "\\[20(.*?)\\]", replacement: "", pinned: true },
  { name: "只保留AT指令", pattern: String.raw`(?i)(AT\+[^（）<>\n\t\\\r\u4e00-\u9fa5]+)`, replacement: "", mode: "extract", pinned: true },
  { name: "删除空行", pattern: "(?m)^\\s*\\n", replacement: "", pinned: true },
  { name: "删除前后空白", pattern: "^\\s+|\\s+$", replacement: "", pinned: true },
];

/** 模式卡片定义：图标 + 名称 + 说明。 */
const MODE_CARDS: { mode: Mode; icon: LucideIcon; nameZh: string; nameEn: string; descZh: string; descEn: string }[] = [
  { mode: "replace", icon: Replace, nameZh: "替换", nameEn: "Replace", descZh: "用替换文本替换所有匹配", descEn: "Replace all matches with the replacement" },
  { mode: "extract", icon: Slice, nameZh: "提取", nameEn: "Extract", descZh: "只保留匹配的部分，删除其它行", descEn: "Keep only matched parts, drop other lines" },
  { mode: "keep", icon: ListFilter, nameZh: "保留行", nameEn: "Keep Lines", descZh: "仅保留匹配正则的行", descEn: "Keep only lines that match" },
  { mode: "drop", icon: Trash2, nameZh: "删除行", nameEn: "Remove Lines", descZh: "删除匹配正则的行", descEn: "Remove lines that match" },
];

/** 把文本按正则切分成 匹配/非匹配 段，用于高亮。 */
function splitByRegex(text: string, re: RegExp): { text: string; matched: boolean }[] {
  const parts: { text: string; matched: boolean }[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), matched: false });
    if (m[0]) parts.push({ text: m[0], matched: true });
    last = m.index + m[0].length;
    if (m[0].length === 0) g.lastIndex++;
  }
  if (last < text.length) parts.push({ text: text.slice(last), matched: false });
  return parts;
}

export function RegexCleanDialog({ text, lang, onApply, onClose }: Props) {
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");
  const [mode, setMode] = useState<Mode>("replace");
  const [preview, setPreview] = useState<string | null>(null);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");
  const loaded = useRef(false);

  // Load presets on mount
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const { join, homeDir } = await import("@tauri-apps/api/path");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await join(await homeDir(), PRESETS_PATH);
        const raw = await readTextFile(path);
        setPresets(JSON.parse(raw));
      } catch { setPresets(DEFAULT_PRESETS); }
    })();
  }, []);

  // Save presets to file
  const savePresets = useCallback(async (list: Preset[]) => {
    setPresets(list);
    try {
      const { join, homeDir } = await import("@tauri-apps/api/path");
      const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
      const dir = await join(await homeDir(), "SCOM-T");
      await mkdir(dir, { recursive: true }).catch(() => {});
      const path = await join(await homeDir(), PRESETS_PATH);
      await writeTextFile(path, JSON.stringify(list, null, 2));
    } catch { /* ignore */ }
  }, []);

  /** 解析正则（含 (?imx) 内联标志），非法时返回 null。 */
  const buildRegExp = useCallback((pat: string): { re: RegExp; inlineFlags: string } | null => {
    try {
      let flags = "g";
      let clean = pat;
      const inline = clean.match(/^\(\?([imsx-]+)\)/);
      let inlineFlags = "";
      if (inline) {
        inlineFlags = inline[1].replace(/-.*/, "");
        for (const f of inlineFlags) if (!flags.includes(f)) flags += f;
        clean = clean.slice(inline[0].length);
      }
      return { re: new RegExp(clean, flags), inlineFlags };
    } catch {
      return null;
    }
  }, []);

  const applyRegex = useCallback((pat: string, repl: string, m: Mode) => {
    const built = buildRegExp(pat);
    if (!built) {
      setRegexError(lang === "zh" ? "正则表达式语法错误" : "Invalid regex syntax");
      setPreview(null);
      setMatchCount(null);
      return;
    }
    setRegexError(null);

    let result: string;
    let count: number | null = null;
    if (m === "replace") {
      result = text.replace(built.re, repl);
      count = (text.match(built.re) || []).length;
    } else {
      // keep / drop / extract：逐行匹配。用不含 g 的正则，避免 lastIndex 状态导致逐行匹配错乱。
      const lineRe = new RegExp(built.re.source, built.inlineFlags);
      const lines = text.split("\n");
      if (m === "extract") {
        // 提取：保留匹配的捕获组1（或整个匹配），丢弃不匹配行
        result = lines
          .map((l) => {
            const mm = lineRe.exec(l);
            if (!mm) return null;
            return mm.length > 1 && mm[1] !== undefined ? mm[1] : mm[0];
          })
          .filter((x): x is string => x !== null)
          .join("\n");
        count = lines.filter((l) => lineRe.test(l)).length;
      } else {
        const kept = m === "keep"
          ? lines.filter((l) => lineRe.test(l))
          : lines.filter((l) => !lineRe.test(l));
        result = kept.join("\n");
        count = lines.filter((l) => lineRe.test(l)).length;
      }
    }
    setPreview(result);
    setMatchCount(count);
    return result;
  }, [text, buildRegExp, lang]);

  // 输入变化时自动刷新预览
  useEffect(() => {
    if (pattern) applyRegex(pattern, replacement, mode);
    else { setPreview(null); setMatchCount(null); setRegexError(null); }
  }, [pattern, replacement, mode, applyRegex]);

  const handleApply = useCallback(() => {
    if (preview !== null) onApply(preview);
  }, [preview, onApply]);

  const handlePresetClick = useCallback((preset: Preset) => {
    setPattern(preset.pattern);
    setReplacement(preset.replacement);
    const m = preset.mode ?? "replace";
    setMode(m);
    applyRegex(preset.pattern, preset.replacement, m);
  }, [applyRegex]);

  const handleTogglePin = useCallback((e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    const list = presets.map((pp, ii) => ii === i ? { ...pp, pinned: !pp.pinned } : pp);
    savePresets(list);
  }, [presets, savePresets]);

  const handleDeletePreset = useCallback(async (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    const list = presets.filter((_, i) => i !== idx);
    await savePresets(list);
  }, [presets, savePresets]);

  const handleSavePreset = useCallback(async () => {
    const name = presetName.trim();
    if (!name || !pattern) return;
    const entry: Preset = { name, pattern, replacement, mode, pinned: true };
    const idx = presets.findIndex((p) => p.name === name);
    const list = idx >= 0
      ? presets.map((p, i) => i === idx ? entry : p)
      : [...presets, entry];
    await savePresets(list);
    setPresetName("");
    setSaving(false);
  }, [presetName, pattern, replacement, mode, presets, savePresets]);

  const pinnedPresets = presets.filter((p) => p.pinned === true);
  const allPresets = presets;

  const regexInvalid = pattern !== "" && regexError !== null;

  // 预览高亮段（仅替换模式对原文高亮；keep/drop 也高亮匹配行）
  let highlightParts: { text: string; matched: boolean }[] = [];
  if (pattern && !regexError) {
    const built = buildRegExp(pattern);
    if (built) {
      if (mode === "replace") {
        highlightParts = splitByRegex(text, built.re);
      } else {
        const lineRe = new RegExp(built.re.source, built.inlineFlags);
        highlightParts = text.split("\n").map((l) => ({ text: l, matched: lineRe.test(l) }));
      }
    }
  }

  const modeCard = (m: (typeof MODE_CARDS)[number]) => {
    const active = mode === m.mode;
    return (
      <button
        key={m.mode}
        type="button"
        onClick={() => setMode(m.mode)}
        className={`flex flex-1 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${
          active
            ? "border-[var(--accent)] bg-[var(--accent)]/10"
            : "border-[var(--border)] bg-[var(--bg-input)] hover:border-[var(--accent)]"
        }`}
      >
        <span className={`flex items-center gap-1.5 text-theme-12 font-semibold ${active ? "text-[var(--accent-dark)]" : "text-[var(--text-primary)]"}`}>
          <m.icon size={16} />
          {lang === "zh" ? m.nameZh : m.nameEn}
        </span>
        <span className="text-theme-10 text-[var(--text-muted)] leading-snug">
          {lang === "zh" ? m.descZh : m.descEn}
        </span>
      </button>
    );
  };

  const renderPresetChip = (p: Preset, i: number) => {
    const ModeIcon = p.mode === "keep" ? ListFilter : p.mode === "drop" ? Trash2 : p.mode === "extract" ? Slice : Replace;
    return (
      <div key={i} className="group relative flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--bg-input)] pl-1.5 pr-1 py-1 text-theme-11 transition-colors hover:border-[var(--accent)]">
        <button
          type="button"
          onClick={(e) => handleTogglePin(e, i)}
          className={`transition-colors w-4 text-center ${p.pinned ? "text-[var(--accent)]" : "text-[var(--text-muted)] opacity-30 hover:opacity-100"}`}
          title={p.pinned ? (lang === "zh" ? "取消固定（从侧边栏移除）" : "Unpin from sidebar") : (lang === "zh" ? "固定到侧边栏" : "Pin to sidebar")}
        >
          <Pin size={11} />
        </button>
        <ModeIcon size={12} className="opacity-70" />
        <button type="button" onClick={() => handlePresetClick(p)}
          className="text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
        >
          {p.name}
        </button>
        <button type="button" onClick={(e) => handleDeletePreset(e, i)}
          className="flex h-3.5 w-3.5 items-center justify-center text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-500"
        >
          <Trash2 size={8} />
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-[640px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {lang === "zh" ? "正则清洗" : "Regex Clean"}
          </span>
          <button type="button" onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
          ><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto p-4">
          {/* 模式选择 */}
          <div>
            <div className="mb-1.5 text-theme-11 font-semibold text-[var(--text-muted)]">
              {lang === "zh" ? "清洗模式" : "Clean Mode"}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {MODE_CARDS.map(modeCard)}
            </div>
          </div>

          {/* 正则 + 替换 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-theme-11 font-semibold text-[var(--text-muted)]">
                {lang === "zh" ? "正则表达式" : "Regex Pattern"}
              </div>
              <input
                value={pattern}
                onChange={(e) => setPattern(e.currentTarget.value)}
                placeholder={lang === "zh" ? "例如 \\[\\d+:\\d+:\\d+\\] 匹配时间戳…" : "e.g. \\[\\d+:\\d+:\\d+\\] match timestamps…"}
                spellCheck={false}
                className={`w-full rounded border bg-[var(--bg-input)] px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] outline-none ${
                  regexInvalid ? "border-rose-500" : "border-[var(--border)] focus:border-[var(--accent)]"
                }`}
              />
              {regexInvalid && (
                <div className="mt-1 flex items-center gap-1 text-theme-10 text-rose-500">
                  <AlertCircle size={11} />
                  {regexError}
                </div>
              )}
            </div>
            {mode === "replace" && (
              <div>
                <div className="mb-1 text-theme-11 font-semibold text-[var(--text-muted)]">
                  {lang === "zh" ? "替换为" : "Replacement"}
                </div>
                <input
                  value={replacement}
                  onChange={(e) => setReplacement(e.currentTarget.value)}
                  placeholder={lang === "zh" ? "替换文本，可用 $1 引用分组（留空=删除）" : "Replacement, use $1 for groups (empty=remove)"}
                  spellCheck={false}
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </div>
            )}
          </div>

          {/* 预设 */}
          <div>
            <div className="mb-1.5 text-theme-11 font-semibold text-[var(--text-muted)] flex items-center justify-between">
              <span>{lang === "zh" ? "预设" : "Presets"}</span>
              {!saving && (
                <button type="button" onClick={() => setSaving(true)}
                  className="flex items-center gap-1 text-theme-10 text-[var(--accent)] hover:opacity-80 transition-opacity"
                >
                  <Plus size={11} />
                  {lang === "zh" ? "保存当前" : "Save Current"}
                </button>
              )}
            </div>
            {saving && (
              <div className="flex items-center gap-1 mb-2">
                <input value={presetName} onChange={(e) => setPresetName(e.currentTarget.value)}
                  placeholder={lang === "zh" ? "预设名称..." : "Preset name..."}
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); if (e.key === "Escape") { setSaving(false); setPresetName(""); } }}
                  autoFocus
                />
                <Button type="button" variant="primary" size="sm" onClick={handleSavePreset} disabled={!presetName.trim() || !pattern} className="text-theme-10 px-2 py-1">
                  {lang === "zh" ? "保存" : "Save"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSaving(false); setPresetName(""); }} className="text-theme-10 px-2 py-1">
                  {t("close", lang)}
                </Button>
              </div>
            )}

            {/* 固定组 */}
            {pinnedPresets.length > 0 && (
              <div className="mb-1.5">
                <div className="mb-1 flex items-center gap-1 text-theme-10 text-[var(--text-muted)] opacity-70">
                  <Pin size={10} />
                  {lang === "zh" ? "固定（显示在批量编辑器侧边栏）" : "Pinned (shown in batch sidebar)"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pinnedPresets.map((p) => renderPresetChip(p, presets.indexOf(p)))}
                </div>
              </div>
            )}

            {/* 全部预设 */}
            {allPresets.length > 0 && (
              <div>
                <div className="mb-1 text-theme-10 text-[var(--text-muted)] opacity-70">
                  {lang === "zh" ? "全部预设" : "All presets"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allPresets.map((p) => renderPresetChip(p, presets.indexOf(p)))}
                </div>
              </div>
            )}
            {allPresets.length === 0 && (
              <div className="text-theme-10 text-[var(--text-muted)] opacity-60">
                {lang === "zh" ? "暂无预设，点击「保存当前」创建。" : "No presets yet. Save the current rule to create one."}
              </div>
            )}
          </div>

          {/* 预览 */}
          {pattern !== "" && !regexInvalid && (
            <div>
              <div className="mb-1 text-theme-11 font-semibold text-[var(--text-muted)] flex items-center gap-1">
                <Search size={12} />
                {lang === "zh" ? "预览" : "Preview"}
                {matchCount !== null && (
                  <span className="text-theme-10 opacity-60">
                    · {lang === "zh" ? `${matchCount} 处匹配` : `${matchCount} matches`} · {text.length} → {preview?.length ?? 0} {lang === "zh" ? "字符" : "chars"}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* 原文 */}
                <div className="min-h-24 max-h-40 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-input)] p-2 text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap break-all">
                  <div className="mb-1 text-theme-10 opacity-60">{lang === "zh" ? "原文" : "Original"}</div>
                  {highlightParts.length > 0 ? (
                    highlightParts.map((p, i) => (
                      p.matched ? (
                        <mark key={i} className="rounded bg-amber-200 px-0 text-amber-900 dark:bg-amber-700/60 dark:text-amber-100">{p.text}</mark>
                      ) : (
                        <span key={i}>{p.text}</span>
                      )
                    ))
                  ) : (
                    text
                  )}
                </div>
                {/* 结果 */}
                <div className="min-h-24 max-h-40 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-input)] p-2 text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap break-all">
                  <div className="mb-1 text-theme-10 opacity-60">{lang === "zh" ? "结果" : "Result"}</div>
                  {preview !== null ? preview : (lang === "zh" ? "（无匹配）" : "(no match)")}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-input)] px-4 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
            {t("close", lang)}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={handleApply} disabled={preview === null} className="text-xs">
            {lang === "zh" ? "应用" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default RegexCleanDialog;
