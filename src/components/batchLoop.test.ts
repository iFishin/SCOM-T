import { describe, it, expect } from "vitest";
import { runBatchLoop, type BatchLoopDeps } from "./batchLoop";

type Harness = {
  sends: number[];
  delays: number[];
  steps: Array<[number, number]>;
  setAborted: (v: boolean) => void;
  run: () => Promise<void>;
};

/** Virtual-clock harness: no real timers, no React, no serial port. */
function harness(over: Partial<BatchLoopDeps> & { sendCostMs?: number } = {}): Harness {
  let clock = 0;
  let aborted = false;
  const sends: number[] = [];
  const delays: number[] = [];
  const steps: Array<[number, number]> = [];
  const { sendCostMs = 0, ...rest } = over;

  const deps: BatchLoopDeps = {
    intervals: ["1000", "1000", "1000"],
    totalLoops: 2,
    loopInterval: "3000",
    now: () => clock,
    send: async (i) => {
      sends.push(i);
      clock += sendCostMs;
    },
    delay: async (ms) => {
      delays.push(ms);
      clock += ms;
    },
    isAborted: () => aborted,
    onStep: (loop, i) => steps.push([loop, i]),
    ...rest,
  };

  return {
    sends,
    delays,
    steps,
    setAborted: (v) => {
      aborted = v;
    },
    run: () => runBatchLoop(deps),
  };
}

describe("runBatchLoop (issue #35)", () => {
  it("pauses between sends, but NOT after the final send of the final loop", async () => {
    const h = harness();
    await h.run();

    // 3 rows x 2 loops = 6 sends; the trailing gap after send #6 is skipped
    // so the Stop button reverts immediately (root cause of the reported lag).
    expect(h.sends).toEqual([0, 1, 2, 0, 1, 2]);
    expect(h.delays).toEqual([1000, 1000, 1000, 1000, 1000]);
    expect(h.steps).toEqual([
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
    ]);
  });

  it("single row / single loop never waits", async () => {
    const h = harness({ intervals: ["5000"], totalLoops: 1 });
    await h.run();
    expect(h.sends).toEqual([0]);
    expect(h.delays).toEqual([]);
  });

  it("blank per-row interval falls back to the global default", async () => {
    const h = harness({ intervals: [undefined, undefined], totalLoops: 1 });
    await h.run();
    expect(h.sends).toEqual([0, 1]);
    expect(h.delays).toEqual([3000]);
  });

  it("a longer per-row interval overrides the global one", async () => {
    const h = harness({ intervals: ["8000", ""], totalLoops: 1 });
    await h.run();
    expect(h.delays).toEqual([8000]);
  });

  it("subtracts time already spent sending / waiting for a response", async () => {
    // Per-row 1000 -> 800 left; blank rows fall back to global 3000 -> 2800.
    // The final send still skips its trailing gap.
    const h = harness({
      sendCostMs: 200,
      intervals: ["1000", undefined, ""],
      totalLoops: 2,
    });
    await h.run();
    expect(h.delays).toEqual([800, 2800, 2800, 800, 2800]);
  });

  it("skips the gap when sending already consumed it", async () => {
    const h = harness({ sendCostMs: 1500, intervals: ["1000", "1000"], totalLoops: 1 });
    await h.run();
    expect(h.delays).toEqual([]);
  });

  it("aborts immediately, including mid-wait", async () => {
    const h = harness();
    await h.run();
    expect(h.sends).toHaveLength(6);

    const h2 = harness();
    h2.setAborted(true);
    await h2.run();
    expect(h2.sends).toEqual([]);
    expect(h2.delays).toEqual([]);
  });

  it("does nothing for an empty row list or zero loops", async () => {
    const empty = harness({ intervals: [] });
    await empty.run();
    expect(empty.sends).toEqual([]);

    const zero = harness({ totalLoops: 0 });
    await zero.run();
    expect(zero.sends).toEqual([]);
  });
});
