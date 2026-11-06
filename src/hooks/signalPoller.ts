/**
 * Serial signal polling guard.
 *
 * `readSignals()` can outlast the 500ms tick on a slow/unresponsive port.
 * Without an in-flight guard the requests stack up; without a disposed guard
 * a late result can call `setState` after disconnect/unmount.
 *
 * The interval itself stays in `useSerialPort`; this module owns only the
 * concurrency semantics, so it can be tested without a React renderer.
 */
export interface SignalPollerOptions<S> {
  read: () => Promise<S>;
  onResult: (states: S) => void;
  /** Transient read failures are swallowed by default; hook may observe them. */
  onError?: (error: unknown) => void;
}

export interface SignalPoller {
  /** One poll tick. Safe to call more often than `read` takes to resolve. */
  tick(): Promise<void>;
  dispose(): void;
}

export function createSignalPoller<S>(opts: SignalPollerOptions<S>): SignalPoller {
  let inFlight = false;
  let disposed = false;

  return {
    async tick(): Promise<void> {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        const states = await opts.read();
        // A result arriving after disconnect/unmount must not touch React state.
        if (disposed) return;
        opts.onResult(states);
      } catch (error) {
        // A transient read failure must not kill the loop or reject unhandled.
        opts.onError?.(error);
      } finally {
        inFlight = false;
      }
    },

    dispose(): void {
      disposed = true;
    },
  };
}
