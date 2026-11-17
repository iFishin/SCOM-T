/**
 * Newest-first ring buffer for the response-matching trace.
 *
 * The trace used to be a React state array, written once per received line.
 * A 50 ms log batch could contain dozens of lines, so one batch meant dozens
 * of `setState` calls and dozens of full panel re-renders. Accumulating here
 * and publishing once per batch removes that amplification, and keeping the
 * buffer outside React lets the panel skip the array update entirely while the
 * dialog is closed — the header badge only reads `stats()`.
 */

export type MatchLogEntry = {
  rowId: number;
  command: string;
  status: "info" | "pending" | "success" | "error";
  detail: string;
  received?: string;
  expected?: string;
};

/** Newest-first cap. Older entries are never displayed. */
export const MATCH_LOG_LIMIT = 100;

export type MatchLogStats = {
  count: number;
  hasError: boolean;
  hasSuccess: boolean;
};

export const EMPTY_MATCH_LOG_STATS: MatchLogStats = {
  count: 0,
  hasError: false,
  hasSuccess: false,
};

export function sameMatchLogStats(a: MatchLogStats, b: MatchLogStats): boolean {
  return a.count === b.count && a.hasError === b.hasError && a.hasSuccess === b.hasSuccess;
}

export class MatchLogBuffer {
  private entries: MatchLogEntry[] = [];

  /**
   * Entries, newest first. The array is never mutated in place — `push` builds
   * a new one — so handing it to React state is safe and skips a copy.
   */
  snapshot(): MatchLogEntry[] {
    return this.entries;
  }

  get size(): number {
    return this.entries.length;
  }

  /** Append a batch given in chronological order; the newest line ends up first. */
  push(batch: readonly MatchLogEntry[]): void {
    if (batch.length === 0) return;
    const newestFirst = batch.length > MATCH_LOG_LIMIT
      ? batch.slice(-MATCH_LOG_LIMIT).reverse()
      : batch.slice().reverse();
    const merged = newestFirst.concat(this.entries);
    // `slice` copies, which matters: callers must not be able to mutate the
    // buffer's array through a snapshot they kept.
    this.entries = merged.length > MATCH_LOG_LIMIT ? merged.slice(0, MATCH_LOG_LIMIT) : merged;
  }

  stats(): MatchLogStats {
    let hasError = false;
    let hasSuccess = false;
    for (const entry of this.entries) {
      if (entry.status === "error") hasError = true;
      else if (entry.status === "success") hasSuccess = true;
      if (hasError && hasSuccess) break;
    }
    return { count: this.entries.length, hasError, hasSuccess };
  }

  clear(): void {
    this.entries = [];
  }
}
