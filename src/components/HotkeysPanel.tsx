import { t } from "../i18n.ts";
import { Button } from "./ui/Button.tsx";
import type { Lang } from "../i18n.ts";
import type { HotkeyConfig } from "../hooks/useSettings.ts";

type Props = {
  hotkeys: HotkeyConfig[];
  onHotkeySend: (hotkey: HotkeyConfig) => void;
  lang: Lang;
  borderless?: boolean;
};

export function HotkeysPanel({ hotkeys, onHotkeySend, lang, borderless }: Props) {
  return (
    <div className={`bg-[var(--bg-surface)] ${borderless ? "p-2" : "rounded-lg border border-[var(--border)] p-2"}`}>
      {/* Hide internal title when borderless — parent already shows it */}
      {!borderless && (
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          {t("hotkeys_title", lang)}
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        {hotkeys.map((hotkey) => (
          <Button
            key={hotkey.id}
            type="button"
            onClick={() => onHotkeySend(hotkey)}
            className="flex flex-col items-start gap-0.5 overflow-hidden px-2 py-1.5 text-xs"
          >
            <span className="truncate font-medium">{hotkey.label}</span>
            {hotkey.shortcut && (
              <span className="rounded bg-[var(--bg-input)] px-1 py-[1px] text-[9px] text-[var(--text-muted)] leading-tight">
                {hotkey.shortcut}
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}
