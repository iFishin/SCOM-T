import { useState, useCallback, useEffect, useRef } from "react";
import { X, Search, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/Button.tsx";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";

type Props = {
  text: string;
  lang: Lang;
  onApply: (result: string) => void;
  onClose: () => void;
};

type Preset = {
  name: string;
  pattern: string;
  replacement: string;
};

const PRESETS_PATH = "SCOM-T/regex-presets.json";

const DEFAULT_PRESETS: Preset[] = [
  { name: "清除时间戳", pattern: "\\[\\d{2}:\\d{2}:\\d{2}\\.\\d{3}\\]", replacement: "" },
  { name: "清除日志级别", pattern: "\\[ERROR\\]|\\[WARN\\]|\\[INFO\\]|\\[DEBUG\\]", replacement: "" },
  { name: "保留AT指令", pattern: ".*(?=AT\\+).*", replacement: "$&" },
  { name: "删除空行", pattern: "^\\s*\\n", replacement: "" },
];

export function RegexCleanDialog({ text, lang, onApply, onClose }: Props) {
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const applyRegex = useCallback((pat: string, repl: string) => {
    setError(null);
    try {
      let flags = "g";
      let cleanPattern = pat;
      const inlineFlags = cleanPattern.match(/^\(\?([imsx-]+)\)/);
      if (inlineFlags) {
        const flagStr = inlineFlags[1];
        if (flagStr.includes("i")) flags += "i";
        if (flagStr.includes("m")) flags += "m";
        if (flagStr.includes("s")) flags += "s";
        cleanPattern = cleanPattern.slice(inlineFlags[0].length);
      }
      const re = new RegExp(cleanPattern, flags);
      const result = text.replace(re, repl);
      setPreview(result);
      return result;
    } catch (e) {
      setError(String(e));
      setPreview(null);
      return null;
    }
  }, [text]);

  const handlePreview = useCallback(() => {
    applyRegex(pattern, replacement);
  }, [applyRegex, pattern, replacement]);

  const handleApply = useCallback(() => {
    if (preview !== null) onApply(preview);
  }, [preview, onApply]);

  const handlePresetClick = useCallback((preset: Preset) => {
    setPattern(preset.pattern);
    setReplacement(preset.replacement);
    const result = applyRegex(preset.pattern, preset.replacement);
    if (result !== null) onApply(result);
  }, [applyRegex, onApply]);

  const handleDeletePreset = useCallback(async (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    const list = presets.filter((_, i) => i !== idx);
    await savePresets(list);
  }, [presets, savePresets]);

  const handleSavePreset = useCallback(async () => {
    const name = presetName.trim();
    if (!name || !pattern) return;
    const list = [...presets, { name, pattern, replacement }];
    await savePresets(list);
    setPresetName("");
    setSaving(false);
  }, [presetName, pattern, replacement, presets, savePresets]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
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
        <div className="p-4 space-y-3">
          {/* Presets */}
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1.5 flex items-center justify-between">
              <span>{lang === "zh" ? "预设" : "Presets"}</span>
              {!saving && (
                <button type="button" onClick={() => setSaving(true)}
                  className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:opacity-80 transition-opacity"
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
                <Button type="button" variant="primary" size="sm" onClick={handleSavePreset} disabled={!presetName.trim() || !pattern} className="text-[10px] px-2 py-1">
                  {lang === "zh" ? "保存" : "Save"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSaving(false); setPresetName(""); }} className="text-[10px] px-2 py-1">
                  {t("close", lang)}
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p, i) => (
                <div key={i} className="group relative">
                  <button type="button" onClick={() => handlePresetClick(p)}
                    className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] whitespace-nowrap"
                  >
                    {p.name}
                  </button>
                  <button type="button" onClick={(e) => handleDeletePreset(e, i)}
                    className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-500"
                  >
                    <Trash2 size={8} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-[var(--border)]" />

          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              {lang === "zh" ? "正则表达式" : "Regex Pattern"}
            </div>
            <input value={pattern} onChange={(e) => setPattern(e.currentTarget.value)}
              placeholder={lang === "zh" ? "例如: \\[\\d+:\\d+:\\d+\\] 匹配时间戳..." : "e.g. \\[\\d+:\\d+:\\d+\\] to match timestamps..."}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              spellCheck={false}
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">
              {lang === "zh" ? "替换为" : "Replacement"}
            </div>
            <input value={replacement} onChange={(e) => setReplacement(e.currentTarget.value)}
              placeholder={lang === "zh" ? "替换文本（留空则删除匹配）" : "Replacement text (empty = remove match)"}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          {preview !== null && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <Search size={12} />
                {lang === "zh" ? "预览结果" : "Preview"}
                <span className="text-[10px] opacity-60">
                  ({lang === "zh" ? `${text.length} → ${preview.length} 字符` : `${text.length} → ${preview.length} chars`})
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-input)] px-4 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
            {t("close", lang)}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handlePreview} disabled={!pattern} className="text-xs">
            {lang === "zh" ? "预览" : "Preview"}
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