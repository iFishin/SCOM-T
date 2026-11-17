import type { SerialLogEntry } from "../serial/types";

export type LogCommit = {
  logs: SerialLogEntry[];
  /** True when older entries had to be dropped to stay under the cap. */
  trimmed: boolean;
};

/**
 * Merge a freshly flushed batch into the live log buffer, keeping the newest
 * `max` entries.
 *
 * Kept as a pure function because this runs on every render batch (~20 Hz): it
 * is the one place where a bug turns into either unbounded growth or a buffer
 * that silently loses the newest traffic.
 */
export function commitLogBatch(
  current: readonly SerialLogEntry[],
  batch: readonly SerialLogEntry[],
  max: number,
): LogCommit {
  if (batch.length === 0) {
    return { logs: current as SerialLogEntry[], trimmed: false };
  }
  if (max <= 0) {
    return { logs: [], trimmed: true };
  }

  const merged = current.length === 0 ? batch.slice() : current.concat(batch);
  if (merged.length <= max) {
    return { logs: merged, trimmed: false };
  }
  return { logs: merged.slice(merged.length - max), trimmed: true };
}
