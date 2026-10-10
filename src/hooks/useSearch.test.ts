import { describe, it, expect } from "vitest";
import { buildSearchRegex, searchInText, highlightText } from "./useSearch";
import type { SearchOptions } from "./useSearch";

const opts = (o: Partial<SearchOptions> = {}): SearchOptions => ({
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  ...o,
});

const ranges = (text: string, query: string, o: Partial<SearchOptions> = {}) =>
  searchInText(text, query, opts(o)).map((m) => text.slice(m.start, m.end));

describe("buildSearchRegex", () => {
  it("returns null for an empty query", () => {
    expect(buildSearchRegex("", opts())).toBeNull();
  });

  it("returns null for an invalid regex", () => {
    expect(buildSearchRegex("(", opts({ regex: true }))).toBeNull();
  });

  it("escapes regex metacharacters in literal mode", () => {
    expect(ranges("a.b aXb", "a.b")).toEqual(["a.b"]);
  });

  it("treats the query as a pattern in regex mode", () => {
    expect(ranges("a1 b22", "\\d+", { regex: true })).toEqual(["1", "22"]);
  });

  it("is case-insensitive by default and sensitive on request", () => {
    expect(ranges("OK ok", "ok")).toEqual(["OK", "ok"]);
    expect(ranges("OK ok", "ok", { caseSensitive: true })).toEqual(["ok"]);
  });
});

describe("whole-word matching", () => {
  it("matches a word-bounded query", () => {
    expect(ranges("OK! okay", "OK", { wholeWord: true })).toEqual(["OK"]);
  });

  it("does not match inside a longer word", () => {
    expect(ranges("CSQ XCSQ CSQY", "CSQ", { wholeWord: true })).toEqual(["CSQ"]);
  });

  it("matches an AT command that starts with a non-word character", () => {
    // Regression: `\b\+CSQ\b` never matched because no word char precedes "+".
    expect(ranges("+CSQ: 25,0", "+CSQ", { wholeWord: true })).toEqual(["+CSQ"]);
  });

  it("still rejects an AT command glued to a word character", () => {
    expect(ranges("X+CSQ +CSQ", "+CSQ", { wholeWord: true })).toEqual(["+CSQ"]);
  });

  it("matches a query with a non-word trailing character", () => {
    expect(ranges("+CSQ: 25,0", "25,0", { wholeWord: true })).toEqual(["25,0"]);
    expect(ranges("125,05 25,0", "25,0", { wholeWord: true })).toEqual(["25,0"]);
  });

  it("applies whole-word to regex queries too", () => {
    expect(ranges("abc ab", "a\\w", { regex: true, wholeWord: true })).toEqual(["ab"]);
  });
});

describe("searchInText", () => {
  it("returns every occurrence with correct offsets", () => {
    expect(searchInText("ab ab ab", "ab", opts())).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 8 },
    ]);
  });

  it("handles zero-length matches without looping forever", () => {
    expect(searchInText("abc", "", opts())).toEqual([]);
    expect(searchInText("abc", "x*", opts({ regex: true }))).toHaveLength(4);
  });

  it("returns nothing for empty text", () => {
    expect(searchInText("", "a", opts())).toEqual([]);
  });
});

describe("highlightText", () => {
  it("splits into non-match / match segments", () => {
    const re = buildSearchRegex("ab", opts())!;
    expect(highlightText("xaby", re)).toEqual([
      { text: "x", match: false, current: false },
      { text: "ab", match: true, current: false },
      { text: "y", match: false, current: false },
    ]);
  });

  it("flags the current match range", () => {
    const re = buildSearchRegex("ab", opts())!;
    const segs = highlightText("ab ab", re, 3, 5);
    expect(segs.filter((s) => s.current)).toEqual([{ text: "ab", match: true, current: true }]);
  });

  it("does not mutate the shared regex's lastIndex", () => {
    const re = buildSearchRegex("ab", opts())!;
    re.lastIndex = 1;
    highlightText("ab ab", re);
    expect(re.lastIndex).toBe(1);
  });

  it("returns one plain segment when there is no regex", () => {
    expect(highlightText("abc", null)).toEqual([{ text: "abc", match: false, current: false }]);
  });
});
