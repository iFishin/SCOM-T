import type { SerialLogEntry } from "./types";

/**
 * Index of the first entry newer than `seq`, i.e. the start of the not-yet
 * processed slice.
 *
 * The live log buffer drops its head once it hits the configured cap, so a
 * remembered *index* drifts: it would replay lines that are still present and
 * skip ones that arrived while the buffer was full. Sequence numbers are
 * monotonic per session, so they survive trimming.
 *
 * Returns `logs.length` when everything has already been seen, which lets the
 * caller treat "nothing to do" and "everything is new" with the same branch.
 */
export function findFirstEntryAfterSeq(logs: SerialLogEntry[], seq: number): number {
  if (seq <= 0) return 0;
  let lo = 0;
  let hi = logs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (logs[mid].seq <= seq) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
