import type { KeyboardEvent as ReactKeyboardEvent } from "react";

function normalizeKey(key: string) {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key
    .replace("Arrow", "")
    .replace("Escape", "Esc")
    .replace("Control", "Ctrl");
}

export function eventToShortcut(event: KeyboardEvent | ReactKeyboardEvent): string | null {
  const parts: string[] = [];

  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");

  const key = normalizeKey(event.key);
  if (!parts.length || ["Ctrl", "Alt", "Shift", "Meta"].includes(key)) return null;

  parts.push(key);
  return parts.join("+");
}

export function matchShortcut(shortcut: string, event: KeyboardEvent) {
  return eventToShortcut(event) === shortcut;
}
