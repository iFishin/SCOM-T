export type SearchOptions = {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
};

export type MatchRange = {
  start: number;
  end: number;
};

const SPECIAL_REGEX_CHARS = /[.*+?^${}()|[\]\\]/g;

function escapeRegex(str: string): string {
  return str.replace(SPECIAL_REGEX_CHARS, "\\$&");
}

/** Build a RegExp from a query and options. Returns null on invalid regex. */
export function buildSearchRegex(query: string, opts: SearchOptions): RegExp | null {
  if (!query) return null;

  let pattern: string;
  if (opts.regex) {
    pattern = query;
  } else {
    pattern = escapeRegex(query);
  }

  if (opts.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  try {
    return new RegExp(pattern, opts.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

/**
 * Search text and return all match ranges.
 * Pure function — no state, no side effects.
 */
export function searchInText(text: string, query: string, opts: SearchOptions): MatchRange[] {
  const regex = buildSearchRegex(query, opts);
  if (!regex || !text) return [];

  const results: MatchRange[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    results.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  return results;
}
