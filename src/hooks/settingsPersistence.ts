/**
 * Debounced persistence with an explicit, awaitable flush.
 *
 * Used by `useSettings`: settings change frequently, so writes are coalesced,
 * but closing the window must be able to await a write of the *latest* value
 * (`beforeunload` cannot await and Tauri does not always fire it).
 *
 * Extracted as a plain, dependency-free module so the flush / debounce
 * semantics can be tested deterministically without rendering the hook.
 */
export interface DebouncedSaver<T> {
  /** Record the newest value and (re)start the debounce timer. */
  schedule(value: T): void;
  /** Cancel a pending timer without discarding the newest value. */
  cancelPending(): void;
  /**
   * Cancel the timer and immediately persist. Passing `value` overrides the
   * newest value, which lets callers pass a ref holding the very latest state.
   * Returns the `save` result so callers can react to a failed write.
   */
  flush(value?: T): Promise<boolean>;
  /** Permanently stop this saver (e.g. on unmount). */
  dispose(): void;
}

export function createDebouncedSaver<T>(
  save: (value: T) => Promise<boolean>,
  delayMs = 500,
): DebouncedSaver<T> {
  let latest: T | undefined;
  let hasLatest = false;
  let handle: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const cancelTimer = () => {
    if (handle !== undefined) {
      clearTimeout(handle);
      handle = undefined;
    }
  };

  return {
    schedule(value: T) {
      latest = value;
      hasLatest = true;
      if (disposed) return;
      cancelTimer();
      handle = setTimeout(() => {
        handle = undefined;
        void save(latest as T);
      }, delayMs);
    },

    cancelPending() {
      cancelTimer();
    },

    async flush(value?: T): Promise<boolean> {
      cancelTimer();
      if (value !== undefined) {
        latest = value;
        hasLatest = true;
      }
      if (!hasLatest || disposed) return false;
      return save(latest as T);
    },

    dispose() {
      disposed = true;
      cancelTimer();
    },
  };
}
