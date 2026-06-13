import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import type { HotkeyConfig } from "../hooks/useSettings.ts";

type Props = {
  hotkeys: HotkeyConfig[];
  onHotkeySend: (hotkey: HotkeyConfig) => void;
  lang: Lang;
};

export function HotkeysPanel({ hotkeys, onHotkeySend, lang }: Props) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-2">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        {t("hotkeys_title", lang)}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {hotkeys.map((hotkey) => (
          <button
            key={hotkey.id}
            type="button"
            onClick={() => onHotkeySend(hotkey)}
            className="group relative overflow-hidden rounded bg-[var(--accent)] px-2 py-2 text-left text-xs font-medium text-white transition-colors hover:bg-[var(--accent)]"
            title={hotkey.label}
          >
            <div className="truncate">{hotkey.label}</div>
            {hotkey.shortcut && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] opacity-0 transition-opacity group-hover:opacity-100">
                {hotkey.shortcut}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
