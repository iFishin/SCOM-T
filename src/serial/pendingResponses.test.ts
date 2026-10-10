import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PendingResponses } from "./pendingResponses";
import type { PendingEntry } from "./pendingResponses";

function entry(onComplete?: () => void): PendingEntry {
  return { timer: setTimeout(() => {}, 10_000), onComplete };
}

describe("PendingResponses", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tracks size and membership", () => {
    const reg = new PendingResponses();
    expect(reg.size).toBe(0);
    reg.set(1, entry());
    expect(reg.size).toBe(1);
    expect(reg.has(1)).toBe(true);
    expect(reg.get(1)).toBeDefined();
  });

  it("clear settles the entry exactly once and drops it", () => {
    const reg = new PendingResponses();
    const done = vi.fn();
    reg.set(1, entry(done));
    reg.clear(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(0);
    // Second clear is a no-op.
    reg.clear(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("clear cancels the entry's timer", () => {
    const reg = new PendingResponses();
    const timer = setTimeout(() => {
      throw new Error("timer should have been cleared");
    }, 1000);
    reg.set(1, { timer });
    reg.clear(1);
    expect(() => vi.runAllTimers()).not.toThrow();
  });

  it("clear on an unknown row is a no-op", () => {
    const reg = new PendingResponses();
    expect(() => reg.clear(99)).not.toThrow();
    expect(reg.size).toBe(0);
  });

  it("set replaces an existing wait and settles the old one (no hang)", () => {
    const reg = new PendingResponses();
    const first = vi.fn();
    const second = vi.fn();
    reg.set(1, entry(first));
    reg.set(1, entry(second));
    expect(first).toHaveBeenCalledTimes(1); // superseded wait must not hang
    expect(second).not.toHaveBeenCalled();
    expect(reg.size).toBe(1);
    reg.clear(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clearAll settles every outstanding wait", () => {
    const reg = new PendingResponses();
    const a = vi.fn();
    const b = vi.fn();
    reg.set(1, entry(a));
    reg.set(2, entry(b));
    reg.clearAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(0);
  });

  it("forEach visits every entry and allows deletion during iteration", () => {
    const reg = new PendingResponses();
    reg.set(1, entry());
    reg.set(2, entry());
    reg.set(3, entry());
    const seen: number[] = [];
    reg.forEach((_e, rowId) => {
      seen.push(rowId);
      reg.clear(rowId);
    });
    expect(seen.sort()).toEqual([1, 2, 3]);
    expect(reg.size).toBe(0);
  });
});
