import { describe, it, expect, vi } from "vitest";
import { createSignalPoller } from "./signalPoller";

type Signals = { cts: boolean };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Tests the 500ms signal-poll concurrency guard used by `useSerialPort`:
 * reads slower than a tick must not stack, and a late result after
 * disconnect/unmount must not reach React state.
 */
describe("createSignalPoller — useSerialPort signal polling", () => {
  it("does not stack requests when read takes longer than the tick", async () => {
    const pending = deferred<Signals>();
    const read = vi.fn(() => pending.promise);
    const onResult = vi.fn();
    const poller = createSignalPoller({ read, onResult });

    const first = poller.tick();
    await poller.tick(); // 500ms later, first read still in flight
    await poller.tick(); // and another tick
    expect(read).toHaveBeenCalledTimes(1);

    pending.resolve({ cts: true });
    await first;
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({ cts: true });

    // Once the slow read finishes, a new tick is allowed again.
    const next = deferred<Signals>();
    read.mockReturnValue(next.promise);
    const second = poller.tick();
    expect(read).toHaveBeenCalledTimes(2);
    next.resolve({ cts: false });
    await second;
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it("ignores a late result after dispose (disconnect / unmount)", async () => {
    const pending = deferred<Signals>();
    const onResult = vi.fn();
    const poller = createSignalPoller({ read: () => pending.promise, onResult });

    const inFlight = poller.tick();
    poller.dispose();
    pending.resolve({ cts: true });
    await inFlight;

    expect(onResult).not.toHaveBeenCalled();
    // Ticks after dispose do not even start a read.
    const read = vi.fn(() => pending.promise);
    const another = createSignalPoller({ read, onResult });
    another.dispose();
    await another.tick();
    expect(read).not.toHaveBeenCalled();
  });

  it("swallows a transient read failure and keeps the loop alive", async () => {
    const onError = vi.fn();
    const read = vi
      .fn<() => Promise<Signals>>()
      .mockRejectedValueOnce(new Error("port busy"))
      .mockResolvedValue({ cts: true });
    const onResult = vi.fn();
    const poller = createSignalPoller({ read, onResult, onError });

    await expect(poller.tick()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();

    await poller.tick();
    expect(onResult).toHaveBeenCalledWith({ cts: true });
  });
});
