import { describe, it, expect } from "vitest";
import { eventToShortcut, matchShortcut } from "./shortcutUtils";

/** Minimal KeyboardEvent stand-in — the helpers only read these three fields. */
function key(k: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) {
  return {
    key: k,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
  } as KeyboardEvent;
}

describe("eventToShortcut", () => {
  it("builds Ctrl+<key>", () => {
    expect(eventToShortcut(key("f", { ctrl: true }))).toBe("Ctrl+F");
  });

  it("builds Alt+<key>", () => {
    expect(eventToShortcut(key("1", { alt: true }))).toBe("Alt+1");
  });

  it("builds Ctrl+Alt+<key> in a stable order", () => {
    expect(eventToShortcut(key("k", { ctrl: true, alt: true }))).toBe("Ctrl+Alt+K");
  });

  it("normalises named keys", () => {
    expect(eventToShortcut(key("ArrowUp", { ctrl: true }))).toBe("Ctrl+Up");
    expect(eventToShortcut(key("Escape", { ctrl: true }))).toBe("Ctrl+Esc");
    expect(eventToShortcut(key(" ", { alt: true }))).toBe("Alt+Space");
  });

  it("uppercases single characters", () => {
    expect(eventToShortcut(key("a", { ctrl: true }))).toBe("Ctrl+A");
  });

  it("returns null with no modifier", () => {
    expect(eventToShortcut(key("a"))).toBeNull();
  });

  it("returns null when only a modifier is pressed", () => {
    expect(eventToShortcut(key("Control", { ctrl: true }))).toBeNull();
    expect(eventToShortcut(key("Shift", { shift: true }))).toBeNull();
    expect(eventToShortcut(key("Alt", { alt: true }))).toBeNull();
  });
});

describe("matchShortcut", () => {
  it("matches an exact shortcut", () => {
    expect(matchShortcut("Ctrl+S", key("s", { ctrl: true }))).toBe(true);
  });

  it("does not match a different modifier", () => {
    expect(matchShortcut("Ctrl+S", key("s", { alt: true }))).toBe(false);
  });
});
