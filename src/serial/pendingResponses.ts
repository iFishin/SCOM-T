/**
 * Registry of in-flight "waiting for a response" entries, keyed by command row.
 *
 * Owns the timer/dropping/settling rules so the callers (single send, batch
 * execution, batch stop) cannot drift apart — a dropped entry that is never
 * settled leaves its `await` hanging forever, and an entry that is never
 * dropped keeps matching later traffic and can flip a failed row back to
 * success.
 */

export type PendingEntry = {
  timer: ReturnType<typeof setTimeout>;
  /** Settles the caller's promise; called exactly once per entry. */
  onComplete?: () => void;
};

export class PendingResponses<T extends PendingEntry = PendingEntry> {
  private map = new Map<number, T>();

  get size(): number {
    return this.map.size;
  }

  has(rowId: number): boolean {
    return this.map.has(rowId);
  }

  get(rowId: number): T | undefined {
    return this.map.get(rowId);
  }

  /**
   * Register (or replace) a row's wait. Replacing settles the previous entry
   * first, so a superseded `await` resolves instead of hanging.
   */
  set(rowId: number, entry: T): void {
    this.clear(rowId);
    this.map.set(rowId, entry);
  }

  /** Settle and drop one row's wait. No-op when absent. */
  clear(rowId: number): void {
    const existing = this.map.get(rowId);
    if (!existing) return;
    clearTimeout(existing.timer);
    this.map.delete(rowId);
    existing.onComplete?.();
  }

  /** Settle and drop every wait. */
  clearAll(): void {
    for (const rowId of [...this.map.keys()]) {
      this.clear(rowId);
    }
  }

  forEach(cb: (entry: T, rowId: number) => void): void {
    this.map.forEach((entry, rowId) => cb(entry, rowId));
  }
}
