import type { MatchMode } from "../serial/responseMatcher.ts";

export type PromptRowStatus = "idle" | "pending" | "success" | "error";

/**
 * One row of the command grid, as held in UI state.
 * `status` is UI-only and is dropped on serialization.
 */
export type PromptRow = {
  id: number;
  selected: boolean;
  command: string;
  isHex: boolean;
  ender: string;
  /** Per-row gap in ms (also the upper bound when waiting for a response). */
  interval: string;
  device?: string;
  note?: string;
  expectedResponses?: string[];
  expectedResponseRegex?: boolean[];
  matchMode?: MatchMode;
  status?: PromptRowStatus;
};

/** Default upper bound for a response wait when the row leaves interval blank. */
export const DEFAULT_RESPONSE_TIMEOUT_MS = 5000;

/** Hard cap so a typo cannot stall the batch loop for hours. */
export const MAX_INTERVAL_MS = 600_000;

/**
 * Parse a row interval into milliseconds.
 * Accepts "5000" as ms and "5s" / "5S" as seconds; blank or malformed input
 * falls back to `fallback`. A blank row means "no delay" for the batch loop,
 * while response waiting still needs a positive timeout.
 */
export function parseIntervalMs(raw: string | undefined, fallback = 0): number {
  if (!raw) return fallback;
  const match = /^(\d+(?:\.\d+)?)\s*(s|sec|ms)?$/i.exec(raw.trim());
  if (!match) return fallback;
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const ms = unit === "s" || unit === "sec" ? value * 1000 : value;
  if (!Number.isFinite(ms) || ms < 0) return fallback;
  return Math.min(Math.round(ms), MAX_INTERVAL_MS);
}
