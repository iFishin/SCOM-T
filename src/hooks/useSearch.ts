import { useCallback, useMemo, useState } from "react";

export type SearchOptions = {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
};

export type MatchRange = {
  start: number;
  end: number;
};

export type UseSearchResult = {
  searchQuery: string;
  searchMatches: MatchRange[];
  searchIndex: number;
  searchRegex: RegExp | null;
  handleSearch: (query: string, opts: SearchOptions) => void;
  handleNavigate: (idx: number) => void;
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

/** Split text into match segments. Each segment has `text` and whether it's a match or current. */
export function highlightText(
  text: string,
  regex: RegExp | null,
  currentStart?: number,
  currentEnd?: number,
): { text: string; match: boolean; current: boolean }[] {
  if (!regex) return [{ text, match: false, current: false }];
  const segments: { text: string; match: boolean; current: boolean }[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) segments.push({ text: text.slice(lastIdx, m.index), match: false, current: false });
    const isCurrent = currentStart !== undefined && currentEnd !== undefined
      && m.index >= currentStart && m.index < currentEnd;
    segments.push({ text: m[0], match: true, current: isCurrent });
    lastIdx = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (lastIdx < text.length) segments.push({ text: text.slice(lastIdx), match: false, current: false });
  return segments.length ? segments : [{ text, match: false, current: false }];
}

/**
 * Unified search hook for log/text views.
 * Maintains query, matches, and current index.
 * Provides `searchRegex` for rendering highlights.
 */
export function useSearch(text: string): UseSearchResult {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  });
  const [searchMatches, setSearchMatches] = useState<MatchRange[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);

  const searchRegex = useMemo(
    () => buildSearchRegex(searchQuery, searchOptions),
    [searchQuery, searchOptions],
  );

  const handleSearch = useCallback((query: string, opts: SearchOptions) => {
    setSearchQuery(query);
    setSearchOptions(opts);
    const results = searchInText(text, query, opts);
    setSearchMatches(results);
    setSearchIndex(results.length > 0 ? 0 : -1);
  }, [text]);

  const handleNavigate = useCallback((idx: number) => {
    setSearchIndex(Math.max(0, Math.min(idx, searchMatches.length - 1)));
  }, [searchMatches.length]);

  return { searchQuery, searchMatches, searchIndex, searchRegex, handleSearch, handleNavigate };
}
