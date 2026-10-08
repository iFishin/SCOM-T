/**
 * Response matcher for command-grid expected responses.
 *
 * Pure, framework-free logic extracted from PromptPanel so it can be unit
 * tested. Given an accumulating received-text buffer and a list of expected
 * responses, it decides when a command's expectations are satisfied.
 *
 * Two modes (mirrors the response-set "全部 / 任意" toggle):
 *   - "all": every expected response must appear, in order. Each match
 *     consumes the matched slice so later expectations search the remainder.
 *   - "any": a single expected response matching is enough.
 *
 * Each expected entry may independently be a regular expression; an invalid
 * pattern degrades to a literal substring match rather than throwing.
 */

export type MatchMode = "all" | "any";

export type MatcherSpec = {
  /** Expected response texts (literal, or regex source when isRegex[i]). */
  expected: string[];
  /** Per-entry regex flag; missing/false means literal match. */
  isRegex?: boolean[];
  /** Defaults to "all". */
  matchMode?: MatchMode;
};

export type MatcherState = {
  /** Accumulated, not-yet-consumed received text. */
  buffer: string;
  /** For "all": index of the next expectation to satisfy. */
  matchIndex: number;
  /** For "any": set once a single expectation has matched. */
  satisfied: boolean;
};

export type FeedResult = {
  state: MatcherState;
  /** Indices satisfied during this feed, in order (for logging). */
  matched: number[];
  /** True once the spec is satisfied (all matched, or any matched). */
  done: boolean;
};

/** Bound memory for long-running waits; keep a suffix for split-chunk matches. */
const BUFFER_CAP = 65536;
const BUFFER_KEEP = 4096;

/** A fresh, unsatisfied state. */
export function createMatcherState(): MatcherState {
  return { buffer: "", matchIndex: 0, satisfied: false };
}

/**
 * Try to match one expectation against `buffer`.
 * Returns the consumed length when matched, or -1 when it does not match.
 */
function matchOne(
  buffer: string,
  expected: string,
  isRegex: boolean,
): number {
  if (isRegex) {
    try {
      const m = new RegExp(expected).exec(buffer);
      if (m) return m.index + m[0].length;
    } catch {
      // Invalid regex — fall through to literal matching.
    }
  }
  const idx = buffer.indexOf(expected);
  return idx >= 0 ? idx + expected.length : -1;
}

/**
 * Feed a received chunk into the matcher, returning the next state plus what
 * matched. Does not mutate `prev`.
 */
export function feedMatcher(
  prev: MatcherState,
  spec: MatcherSpec,
  chunk: string,
): FeedResult {
  let buffer = prev.buffer + chunk;
  if (buffer.length > BUFFER_CAP) {
    buffer = buffer.slice(-BUFFER_KEEP);
  }

  const mode: MatchMode = spec.matchMode ?? "all";
  const matched: number[] = [];

  // "any": a single hit satisfies the spec.
  if (mode === "any") {
    if (prev.satisfied) {
      return { state: { ...prev, buffer }, matched, done: true };
    }
    for (let i = 0; i < spec.expected.length; i++) {
      const expected = spec.expected[i];
      if (!expected.trim()) continue;
      const isRegex = spec.isRegex?.[i] ?? false;
      const consumed = matchOne(buffer, expected, isRegex);
      if (consumed >= 0) {
        matched.push(i);
        return {
          state: { buffer: buffer.slice(consumed), matchIndex: prev.matchIndex, satisfied: true },
          matched,
          done: true,
        };
      }
    }
    return { state: { ...prev, buffer }, matched, done: false };
  }

  // "all": sequential, consuming matched slices.
  let matchIndex = prev.matchIndex;
  while (matchIndex < spec.expected.length) {
    const expected = spec.expected[matchIndex];
    if (!expected.trim()) {
      matchIndex++;
      continue;
    }
    const isRegex = spec.isRegex?.[matchIndex] ?? false;
    const consumed = matchOne(buffer, expected, isRegex);
    if (consumed < 0) break;
    matched.push(matchIndex);
    buffer = buffer.slice(consumed);
    matchIndex++;
  }

  return {
    state: { buffer, matchIndex, satisfied: prev.satisfied },
    matched,
    done: matchIndex >= spec.expected.length,
  };
}

/** True when the spec has no non-empty expectations (nothing to wait for). */
export function isEmptySpec(spec: MatcherSpec): boolean {
  return !spec.expected.some((e) => e.trim());
}
