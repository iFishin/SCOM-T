import { resolveLoopGap } from "./promptRow";

/**
 * Testable driver for the batch send loop (issue #35).
 *
 * I/O is injected so the scheduling behaviour can be verified without a real
 * serial port, React tree, or wall-clock waiting. `PromptPanel` wires the real
 * send / wait / abort implementations into this.
 */
export type BatchLoopDeps = {
  /** Per-row interval strings, in send order. */
  intervals: readonly (string | undefined)[];
  totalLoops: number;
  /** Global loop interval; blank per-row values fall back to it. */
  loopInterval: string;
  now: () => number;
  send: (rowIndex: number) => Promise<void>;
  delay: (ms: number) => Promise<void>;
  isAborted: () => boolean;
  /** Called before each send, for UI progress updates. */
  onStep?: (loop: number, rowIndex: number) => void;
};

export async function runBatchLoop(deps: BatchLoopDeps): Promise<void> {
  const rowCount = deps.intervals.length;
  if (rowCount === 0 || deps.totalLoops <= 0) return;

  for (let loop = 0; loop < deps.totalLoops; loop++) {
    if (deps.isAborted()) return;

    for (let i = 0; i < rowCount; i++) {
      if (deps.isAborted()) return;
      deps.onStep?.(loop, i);

      const startedAt = deps.now();
      await deps.send(i);
      if (deps.isAborted()) return;

      // The final send must not wait out a trailing gap, otherwise the Stop
      // button lingers for one whole interval after the loop has finished.
      const isLast = loop === deps.totalLoops - 1 && i === rowCount - 1;
      const remaining = resolveLoopGap(
        deps.intervals[i],
        deps.loopInterval,
        deps.now() - startedAt,
      );
      if (!isLast && remaining > 0) await deps.delay(remaining);
    }
  }
}
