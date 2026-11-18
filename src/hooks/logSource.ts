import { useEffect, useState } from "react";
import type { SerialLogEntry } from "../serial/types";

/**
 * Live log buffer exposed as a subscribable source rather than a React prop.
 *
 * The buffer changes on every render batch (~20 Hz while data flows). Passing
 * the array down from the app shell meant every batch re-rendered the whole
 * tree — layout, status bar, prompt table, dialogs — just to update one list.
 * With a source, only the components that actually paint logs subscribe, and
 * the shell re-renders at its own (much slower) pace.
 */
export type LogSource = {
  /** Current buffer. Identity changes on every batch; safe to compare. */
  get: () => SerialLogEntry[];
  /** Called after every batch or clear. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
};

const EMPTY_LOGS: SerialLogEntry[] = [];

export const EMPTY_LOG_SOURCE: LogSource = {
  get: () => EMPTY_LOGS,
  subscribe: () => () => {},
};

/**
 * Subscribe to a log source, falling back to a plain prop when no source is
 * available (tests, storybook, or a session that has no live buffer yet).
 */
export function useLogStream(
  source: LogSource | undefined,
  fallback: SerialLogEntry[],
): SerialLogEntry[] {
  const [logs, setLogs] = useState<SerialLogEntry[]>(() => (source ? source.get() : fallback));

  useEffect(() => {
    if (!source) return;
    // The source may have advanced between render and effect.
    setLogs(source.get());
    return source.subscribe(() => setLogs(source.get()));
  }, [source]);

  return source ? logs : fallback;
}
