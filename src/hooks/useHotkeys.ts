import { useEffect } from "react";
import type { HotkeyConfig } from "./useSettings.ts";
import { matchShortcut } from "../utils/shortcutUtils.ts";

export function useHotkeys(
  hotkeys: HotkeyConfig[],
  isConnected: boolean,
  onHotkeySend: (hotkey: HotkeyConfig) => void,
) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't intercept when user is typing in an input/textarea/select
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (!isConnected) return;
      const matched = hotkeys.find(
        (hotkey) => hotkey.shortcut && matchShortcut(hotkey.shortcut, event),
      );
      if (!matched) return;
      event.preventDefault();
      onHotkeySend(matched);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hotkeys, isConnected, onHotkeySend]);
}
