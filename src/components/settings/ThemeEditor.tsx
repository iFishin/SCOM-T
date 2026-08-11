import { RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import type { ThemeSettings, ThemeStylePreset } from "../../hooks/useSettings.ts";
import { DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME } from "../../hooks/useSettings.ts";
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

/** 整体风格预设 —— 应用即固化：直接把各组值展开进 theme，可再手动微调。 */
const STYLE_PRESETS: {
  id: Exclude<ThemeStylePreset, "custom">;
  label: string;
  zh: string;
  /** 应用到 theme 的字段（可省略则保留当前值） */
  apply: (theme: ThemeSettings) => Partial<ThemeSettings>;
}[] = [
  {
    id: "classic",
    label: "Classic",
    zh: "经典",
    apply: (theme) => {
      const base = theme.mode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
      // 经典：回到该 mode 的默认值（不包括 mode 本身）
      const { mode: _m, ...rest } = base;
      return { ...rest, stylePreset: "classic" as const };
    },
  },
  {
    id: "modern",
    label: "Modern",
    zh: "现代圆润",
    apply: (theme) => ({
      radiusSm: 0.5,
      radiusMd: 0.75,
      radiusLg: 1,
      panelPadding: 0.625,
      controlGap: 0.4375,
      accentDark: theme.mode === "dark" ? "#10b981" : "#047857",
      accentLight: theme.mode === "dark" ? "#064e3b" : "#d1fae5",
      bgHover: theme.mode === "dark" ? "#064e3b" : "#f0fdf4",
      stylePreset: "modern" as const,
    }),
  },
  {
    id: "sharp",
    label: "Flat",
    zh: "扁平锐利",
    apply: (theme) => ({
      radiusSm: 0,
      radiusMd: 0,
      radiusLg: 0,
      panelPadding: 0.5,
      controlGap: 0.375,
      border: theme.mode === "dark" ? "#334155" : "#cbd5e1",
      borderFocus: theme.mode === "dark" ? "#059669" : "#047857",
      bgHover: theme.mode === "dark" ? "#0f2137" : "#e2e8f0",
      stylePreset: "sharp" as const,
    }),
  },
];

function RemInput({ label, value, onChange, min = 0.125, max = 2, step = 0.125 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          const v = Math.max(min, Math.min(max, Number(draft) || value));
          setDraft(String(v));
          onChange(Math.round(v * 1000) / 1000);
        }}
        className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
      />
      <span className="text-[10px] text-[var(--text-muted)]">rem</span>
    </label>
  );
}

export function ThemeEditor({ theme, lang, onThemeChange, onThemeReset }: { theme: ThemeSettings; lang?: string; onThemeChange: (t: ThemeSettings) => void; onThemeReset: (mode?: ThemeSettings["mode"]) => void }) {
  const [fontSizeDraft, setFontSizeDraft] = useState(String(theme.fontSize));
  const [previewType, setPreviewType] = useState<"simple" | "components">("simple");
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  useEffect(() => {
    setFontSizeDraft(String(theme.fontSize));
  }, [theme.fontSize]);

  /** 手动改动增强项时标记为「自定义」，并应用 patch。 */
  const patch = (patch: Partial<ThemeSettings>) => {
    onThemeChange({ ...theme, ...patch, stylePreset: "custom" as const });
  };

  const applyPreset = (id: Exclude<ThemeStylePreset, "custom">) => {
    const preset = STYLE_PRESETS.find((p) => p.id === id)!;
    onThemeChange({ ...theme, ...preset.apply(theme) });
  };

  const activePreset: ThemeStylePreset =
    theme.stylePreset === "modern" || theme.stylePreset === "sharp" || theme.stylePreset === "classic"
      ? theme.stylePreset
      : "custom";

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

      {/* 整体风格预设 */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-xs font-semibold">整体风格预设</div>
        <div className="mb-1.5 flex flex-wrap gap-2">
          {STYLE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                activePreset === preset.id
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              {lang === "zh" ? preset.zh : preset.label}
            </Button>
          ))}
          <Button
            type="button"
            disabled
            className={`cursor-default rounded-lg border px-3 py-1.5 text-xs ${
              activePreset === "custom"
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] text-[var(--text-muted)]"
            }`}
            title={lang === "zh" ? "当前为手动微调效果" : "Currently customized"}
          >
            {lang === "zh" ? "自定义" : "Custom"}
          </Button>
        </div>
        <div className="text-[10px] text-[var(--text-muted)] opacity-70">
          {lang === "zh"
            ? "选择预设一键调整圆角、配色与间距，之后仍可手动微调任意项。"
            : "Presets tune radius, colors and spacing. You can still tweak any value afterwards."}
        </div>
      </div>

      {/* 基础颜色 */}
      <div className="grid gap-3 md:grid-cols-2">
        <ColorField label="主背景" value={theme.bgPrimary} onChange={(value) => patch({ bgPrimary: value })} />
        <ColorField label="面板背景" value={theme.bgSurface} onChange={(value) => patch({ bgSurface: value })} />
        <ColorField label="输入框背景" value={theme.bgInput} onChange={(value) => patch({ bgInput: value })} />
        <ColorField label="主文字" value={theme.textPrimary} onChange={(value) => patch({ textPrimary: value })} />
        <ColorField label="次要文字" value={theme.textMuted} onChange={(value) => patch({ textMuted: value })} />
        <ColorField label="边框" value={theme.border} onChange={(value) => patch({ border: value })} />
        <ColorField label="强调色" value={theme.accent} onChange={(value) => patch({ accent: value })} />
      </div>

      {/* 增强颜色 */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-xs font-semibold">进阶颜色</div>
        <div className="text-[10px] text-[var(--text-muted)] mb-3">
          {lang === "zh" ? "悬停、占位符、聚焦与强调色的细分控制。" : "Hover, placeholder, focus and accent shades."}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ColorField label="悬停背景" value={theme.bgHover!} onChange={(v) => patch({ bgHover: v })} />
          <ColorField label="占位符文字" value={theme.textPlaceholder!} onChange={(v) => patch({ textPlaceholder: v })} />
          <ColorField label="聚焦边框" value={theme.borderFocus!} onChange={(v) => patch({ borderFocus: v })} />
          <ColorField label="强调色（深）" value={theme.accentDark!} onChange={(v) => patch({ accentDark: v })} />
          <ColorField label="强调色（浅）" value={theme.accentLight!} onChange={(v) => patch({ accentLight: v })} />
          <ColorField label="强调色（淡化）" value={theme.accentMuted!} onChange={(v) => patch({ accentMuted: v })} />
        </div>
      </div>

      {/* 圆角与间距 */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-xs font-semibold">圆角与间距</div>
        <div className="text-[10px] text-[var(--text-muted)] mb-3">
          {lang === "zh" ? "单位 rem，随界面字号等比缩放。" : "In rem, scales with the UI font size."}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <RemInput label="小圆角" value={theme.radiusSm ?? 0.375} onChange={(v) => patch({ radiusSm: v })} />
          <RemInput label="中圆角" value={theme.radiusMd ?? 0.5} onChange={(v) => patch({ radiusMd: v })} />
          <RemInput label="大圆角" value={theme.radiusLg ?? 0.75} onChange={(v) => patch({ radiusLg: v })} />
          <RemInput label="面板内边距" value={theme.panelPadding ?? 0.5} onChange={(v) => patch({ panelPadding: v })} />
          <RemInput label="控件间距" value={theme.controlGap ?? 0.375} onChange={(v) => patch({ controlGap: v })} />
        </div>
      </div>

      {/* 强调色预设 */}
      <div>
        <div className="mb-2 text-xs text-[var(--text-muted)]">强调色预设</div>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((accent) => (
            <Button
              key={accent.color}
              type="button"
              onClick={() => patch({ accent: accent.color })}
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
            onChange={(e) => patch({ fontFamily: e.currentTarget.value })}
            placeholder="Segoe UI, sans-serif"
            className="rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="grid grid-cols-[100px_1fr] items-center gap-2 text-xs">
          <span className="text-[var(--text-muted)]">等宽字体（日志）</span>
          <input
            value={theme.monoFontFamily}
            onChange={(e) => patch({ monoFontFamily: e.currentTarget.value })}
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
                patch({ fontSize: v });
              }}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">字重</span>
            <select
              value={theme.fontWeight}
              onChange={(e) => patch({ fontWeight: Number(e.currentTarget.value) })}
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
              onClick={() => patch({ fontFamily: preset.value })}
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
