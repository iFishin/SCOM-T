import { RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import type { ThemeSettings } from "../../hooks/useSettings.ts";
import { ColorField } from "./ColorField.tsx";
import { Button } from "../ui/Button.tsx";
import ComponentPreview from "../ui/ComponentPreview.tsx";

const ACCENTS = [
  { name: "Emerald", color: "#10b981" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Purple", color: "#8b5cf6" },
  { name: "Orange", color: "#f97316" },
  { name: "Rose", color: "#f43f5e" },
];

export function ThemeEditor({ theme, lang, onThemeChange, onThemeReset }: { theme: ThemeSettings; lang?: string; onThemeChange: (t: ThemeSettings) => void; onThemeReset: (mode?: ThemeSettings["mode"]) => void }) {
  const [fontSizeDraft, setFontSizeDraft] = useState(String(theme.fontSize));
  const [previewType, setPreviewType] = useState<"simple" | "components">("simple");
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  useEffect(() => {
    setFontSizeDraft(String(theme.fontSize));
  }, [theme.fontSize]);

  void lang;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">主题颜色</div>
          <div className="text-xs text-[var(--text-muted)]">背景、文字、边框和强调色会实时应用。</div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => onThemeReset(theme.mode)}
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-input)]"
          >
            <RotateCcw size={13} />
            重置
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ColorField label="主背景" value={theme.bgPrimary} onChange={(value) => onThemeChange({ ...theme, bgPrimary: value })} />
        <ColorField label="面板背景" value={theme.bgSurface} onChange={(value) => onThemeChange({ ...theme, bgSurface: value })} />
        <ColorField label="输入框背景" value={theme.bgInput} onChange={(value) => onThemeChange({ ...theme, bgInput: value })} />
        <ColorField label="主文字" value={theme.textPrimary} onChange={(value) => onThemeChange({ ...theme, textPrimary: value })} />
        <ColorField label="次要文字" value={theme.textMuted} onChange={(value) => onThemeChange({ ...theme, textMuted: value })} />
        <ColorField label="边框" value={theme.border} onChange={(value) => onThemeChange({ ...theme, border: value })} />
        <ColorField label="强调色" value={theme.accent} onChange={(value) => onThemeChange({ ...theme, accent: value })} />
      </div>

      <div>
        <div className="mb-2 text-xs text-[var(--text-muted)]">强调色预设</div>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((accent) => (
            <Button
              key={accent.color}
              type="button"
              onClick={() => onThemeChange({ ...theme, accent: accent.color })}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
            >
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: accent.color }} />
              {accent.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)]">
        <div className="flex items-center justify-between p-3">
          <div className="mb-0 text-xs font-semibold">预览</div>
          <div className="flex items-center gap-2">
            <select
              value={previewType}
              onChange={(e) => setPreviewType(e.currentTarget.value as "simple" | "components")}
              className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none"
            >
              <option value="simple">简单预览</option>
              <option value="components">组件示例</option>
            </select>
            <Button
              type="button"
              onClick={() => setPreviewCollapsed((c) => !c)}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
              aria-expanded={!previewCollapsed}
            >
              {previewCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </Button>
          </div>
        </div>

        {!previewCollapsed ? (
          <div className="p-4">
            {previewType === "simple" ? (
              <div className="flex items-center gap-2">
                <Button type="button" className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white">主要按钮</Button>
                <Button type="button" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)]">次要按钮</Button>
                <span className="text-xs text-[var(--text-muted)]">这是主题预览文本</span>
              </div>
            ) : (
              <ComponentPreview />
            )}
          </div>
        ) : (
          <div className="px-4 pb-3 text-xs text-[var(--text-muted)]">预览已收起</div>
        )}
      </div>

      {/* Font settings */}
      <div className="space-y-3">
        <div className="text-sm font-semibold">字体设置</div>

        <label className="grid grid-cols-[100px_1fr] items-center gap-2 text-xs">
          <span className="text-[var(--text-muted)]">界面字体</span>
          <input
            value={theme.fontFamily}
            onChange={(e) => onThemeChange({ ...theme, fontFamily: e.currentTarget.value })}
            placeholder="Segoe UI, sans-serif"
            className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="grid grid-cols-[100px_1fr] items-center gap-2 text-xs">
          <span className="text-[var(--text-muted)]">等宽字体（日志）</span>
          <input
            value={theme.monoFontFamily}
            onChange={(e) => onThemeChange({ ...theme, monoFontFamily: e.currentTarget.value })}
            placeholder="Consolas, monospace"
            className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 font-mono text-xs outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">字号 (px)</span>
            <input
              type="number"
              min={10}
              max={24}
              value={fontSizeDraft}
              onChange={(e) => setFontSizeDraft(e.currentTarget.value)}
              onBlur={(e) => {
                const v = Math.max(10, Math.min(24, Number(e.currentTarget.value) || 13));
                setFontSizeDraft(String(v));
                onThemeChange({ ...theme, fontSize: v });
              }}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">字重</span>
            <select
              value={theme.fontWeight}
              onChange={(e) => onThemeChange({ ...theme, fontWeight: Number(e.currentTarget.value) })}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
            >
              <option value={300}>300 · 细体</option>
              <option value={400}>400 · 常规</option>
              <option value={500}>500 · 中等</option>
              <option value={600}>600 · 半粗</option>
              <option value={700}>700 · 粗体</option>
            </select>
          </label>
        </div>

        <div className="mt-1 flex flex-wrap gap-2">
          {[
            { label: "Segoe UI", value: "Segoe UI, PingFang SC, Microsoft YaHei, sans-serif" },
            { label: "系统默认", value: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif" },
            { label: "JetBrains Mono", value: "JetBrains Mono, Consolas, monospace" },
            { label: "Noto Sans SC", value: "Noto Sans SC, PingFang SC, sans-serif" },
          ].map((preset) => (
            <Button
              key={preset.label}
              type="button"
              onClick={() => onThemeChange({ ...theme, fontFamily: preset.value })}
              className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-input)]"
              style={{ fontFamily: preset.value }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
