import { useEffect, useRef, useState } from "react";
import { GridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import type { Layout } from "react-grid-layout";
import { Button } from "../ui/Button";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";
import type { GridItemLayout } from "../../hooks/useSettings.ts";
import { GRID_ITEM_KEYS, GRID_ITEM_LABELS } from "../../hooks/useSettings.ts";

const CARD_COLORS: Record<string, string> = {
  config: "border-l-emerald-400",
  send: "border-l-sky-400",
  filesend: "border-l-violet-400",
  hotkeys: "border-l-amber-400",
  receive: "border-l-rose-400",
  prompts: "border-l-cyan-400",
};

type Props = {
  layout: GridItemLayout[];
  lang: Lang;
  onLayoutChange: (layout: GridItemLayout[]) => void;
  onReset: () => void;
};

export function LayoutEditor({ layout, lang, onLayoutChange, onReset }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--text-muted)]">
        {t("layout_drag_hint", lang)}
      </div>
      <div ref={containerRef} className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-0 overflow-hidden">
        {width > 0 && (
          <GridLayout
          width={width}
          layout={layout as unknown as Layout}
            gridConfig={{
              cols: 12,
              rowHeight: 20,
              margin: [6, 6],
              containerPadding: [0, 0] as const,
              maxRows: Infinity,
            }}
            dragConfig={{ enabled: true, bounded: false }}
            resizeConfig={{ enabled: true, handles: ['e', 's', 'se', 'w', 'n'] }}
            autoSize
            onLayoutChange={(newLayout: Layout) =>
              onLayoutChange(
                newLayout.map((item) => ({
                  i: item.i,
                  x: item.x,
                  y: item.y,
                  w: item.w,
                  h: item.h,
                  minW: layout.find((l) => l.i === item.i)?.minW ?? 2,
                  minH: layout.find((l) => l.i === item.i)?.minH ?? 2,
                }))
              )
            }
          >
            {GRID_ITEM_KEYS.map((key) => {
              const label = GRID_ITEM_LABELS[key][lang];
              const color = CARD_COLORS[key] ?? "border-l-gray-400";
              return (
                <div
                  key={key}
                  className={`flex cursor-grab flex-col overflow-hidden rounded-lg border border-[var(--border)] border-l-4 bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${color}`}
                >
                  <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                    <span className="text-[10px]">⠿</span>
                    {label}
                  </div>
                  <div className="flex flex-1 items-center justify-center p-1 text-[10px] text-[var(--text-muted)] opacity-50">
                    {key === "config" && "端口 · 波特率 · 高级"}
                    {key === "send" && "ASCII/HEX · Enter 发送"}
                    {key === "filesend" && "选择文件 · 发送"}
                    {key === "hotkeys" && "快捷指令按钮"}
                    {key === "receive" && "接收数据显示"}
                    {key === "prompts" && "指令网格 · YAML 配置"}
                  </div>
                </div>
              );
            })}
          </GridLayout>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-red-400 hover:text-red-400"
        >
          {t("layout_reset", lang)}
        </Button>
      </div>
    </div>
  );
}
