import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncedSaver } from "./settingsPersistence";

/**
 * Tests the persistence semantics of `useSettings` (debounce + awaitable
 * flush on window close) without rendering the hook.
 */
describe("createDebouncedSaver — useSettings persistence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid changes into a single write of the newest value", async () => {
    const save = vi.fn(async () => true);
    const saver = createDebouncedSaver<string>(save, 500);

    saver.schedule("a");
    saver.schedule("b");
    saver.schedule("c");
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("c");
  });

  it("flush writes immediately and cancels the pending debounce (no double write)", async () => {
    const save = vi.fn(async () => true);
    const saver = createDebouncedSaver<string>(save, 500);

    saver.schedule("stale");
    // The close handler passes the render-latest value, which may be newer
    // than what reached the debounced saver.
    const ok = await saver.flush("fresh");

    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("fresh");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("propagates a failed write so the caller knows the config did not land", async () => {
    const saver = createDebouncedSaver<string>(async () => false, 500);
    saver.schedule("x");
    expect(await saver.flush()).toBe(false);
  });

  it("flush never saves before any settings were loaded", async () => {
    const save = vi.fn(async () => true);
    const saver = createDebouncedSaver<string>(save, 500);
    expect(await saver.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("dispose stops pending writes and any later flush", async () => {
    const save = vi.fn(async () => true);
    const saver = createDebouncedSaver<string>(save, 500);
    saver.schedule("x");
    saver.dispose();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(save).not.toHaveBeenCalled();
    expect(await saver.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("cancelPending keeps the latest value available for a later flush", async () => {
    const save = vi.fn(async () => true);
    const saver = createDebouncedSaver<string>(save, 500);
    saver.schedule("x");
    saver.cancelPending(); // mirrors the React effect cleanup on re-render

    await vi.advanceTimersByTimeAsync(1_000);
    expect(save).not.toHaveBeenCalled();
    expect(await saver.flush()).toBe(true);
    expect(save).toHaveBeenCalledWith("x");
  });
});
