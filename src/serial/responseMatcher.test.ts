import { describe, it, expect } from "vitest";
import { createMatcherState, feedMatcher, isEmptySpec } from "./responseMatcher";
import type { MatcherSpec, MatcherState } from "./responseMatcher";

/** Feed a list of chunks in order, returning the final result. */
function feedAll(spec: MatcherSpec, chunks: string[]) {
  let state: MatcherState = createMatcherState();
  let matched: number[] = [];
  let done = false;
  for (const c of chunks) {
    const r = feedMatcher(state, spec, c);
    state = r.state;
    matched = matched.concat(r.matched);
    done = r.done;
  }
  return { state, matched, done };
}

describe("responseMatcher", () => {
  describe("all mode (sequential)", () => {
    it("matches a single expectation", () => {
      const r = feedAll({ expected: ["OK"] }, ["\r\nOK\r\n"]);
      expect(r.done).toBe(true);
      expect(r.matched).toEqual([0]);
    });

    it("requires all expectations in order", () => {
      const spec: MatcherSpec = { expected: ["OK", "RDY"] };
      expect(feedAll(spec, ["\r\nOK\r\n"]).done).toBe(false);
      expect(feedAll(spec, ["\r\nOK\r\n", "RDY\r\n"]).done).toBe(true);
    });

    it("does not satisfy expectations that arrive out of order", () => {
      const r = feedAll({ expected: ["OK", "RDY"] }, ["RDY\r\n", "OK\r\n"]);
      expect(r.done).toBe(false);
      // The second expectation ("RDY") was consumed by nothing and never counted.
      expect(r.matched).not.toContain(1);
    });

    it("consumes the matched slice so duplicates match distinct occurrences", () => {
      const r = feedAll({ expected: ["OK", "OK"] }, ["OK and OK"]);
      expect(r.done).toBe(true);
      expect(r.matched).toEqual([0, 1]);
    });

    it("does not double-count a single occurrence for a repeated expectation", () => {
      const r = feedAll({ expected: ["OK", "OK"] }, ["only one OK here"]);
      expect(r.done).toBe(false);
      expect(r.matched).toEqual([0]);
    });

    it("matches across chunk boundaries", () => {
      const r = feedAll({ expected: ["+CSQ: 25,0"] }, ["+CSQ: ", "25,0\r\n"]);
      expect(r.done).toBe(true);
    });

    it("skips empty/whitespace expectations", () => {
      const r = feedAll({ expected: ["", "OK", "  "] }, ["OK"]);
      expect(r.done).toBe(true);
      expect(r.matched).toEqual([1]);
    });

    it("is satisfied immediately when every expectation is blank", () => {
      const r = feedAll({ expected: ["", "   "] }, [""]);
      expect(r.done).toBe(true);
    });
  });

  describe("any mode", () => {
    it("is satisfied by the first expectation that appears", () => {
      const r = feedAll({ expected: ["OK", "ERROR"], matchMode: "any" }, ["ERROR"]);
      expect(r.done).toBe(true);
      expect(r.matched).toEqual([1]);
    });

    it("is satisfied regardless of order", () => {
      const r = feedAll({ expected: ["A", "B", "C"], matchMode: "any" }, ["xxx B xxx"]);
      expect(r.done).toBe(true);
      expect(r.matched).toEqual([1]);
    });

    it("stays unsatisfied when nothing matches", () => {
      const r = feedAll({ expected: ["OK", "RDY"], matchMode: "any" }, ["garbage"]);
      expect(r.done).toBe(false);
      expect(r.matched).toEqual([]);
    });

    it("remains done on subsequent feeds once satisfied", () => {
      let state = feedMatcher(createMatcherState(), { expected: ["OK"], matchMode: "any" }, "OK");
      expect(state.done).toBe(true);
      const again = feedMatcher(state.state, { expected: ["OK"], matchMode: "any" }, "more");
      expect(again.done).toBe(true);
    });
  });

  describe("regex expectations", () => {
    it("matches a regex pattern", () => {
      const r = feedAll(
        { expected: ["\\+CSQ:\\s*\\d+,\\d+"], isRegex: [true] },
        ["\r\n+CSQ: 25,0\r\n"],
      );
      expect(r.done).toBe(true);
    });

    it("mixes regex and literal entries", () => {
      const r = feedAll(
        { expected: ["\\+CSQ:\\s*\\d+,\\d+", "OK"], isRegex: [true, false] },
        ["+CSQ: 12,99\r\nOK\r\n"],
      );
      expect(r.done).toBe(true);
      expect(r.matched).toEqual([0, 1]);
    });

    it("falls back to literal matching for an invalid regex", () => {
      // "(" is an invalid regex, but the literal text contains it.
      const r = feedAll({ expected: ["("], isRegex: [true] }, ["value (x)"]);
      expect(r.done).toBe(true);
    });

    it("supports regex in any mode", () => {
      const r = feedAll(
        { expected: ["READY", "\\d{3}"], isRegex: [false, true], matchMode: "any" },
        ["code 404"],
      );
      expect(r.done).toBe(true);
      expect(r.matched).toEqual([1]);
    });
  });

  describe("buffer bounding", () => {
    it("caps the buffer and keeps a suffix for cross-chunk matches", () => {
      const big = "x".repeat(70000);
      const r = feedMatcher(createMatcherState(), { expected: ["never"] }, big);
      expect(r.state.buffer.length).toBeLessThanOrEqual(65536);
    });

    it("still matches an expectation within the retained suffix after a huge chunk", () => {
      // Fill past the cap, then deliver the real content at the tail.
      const filler = "x".repeat(70000);
      let state = feedMatcher(createMatcherState(), { expected: ["OK"] }, filler);
      state = feedMatcher(state.state, { expected: ["OK"] }, "\r\nOK\r\n");
      expect(state.done).toBe(true);
    });
  });

  describe("isEmptySpec", () => {
    it("is true for empty or blank-only specs", () => {
      expect(isEmptySpec({ expected: [] })).toBe(true);
      expect(isEmptySpec({ expected: ["", "  "] })).toBe(true);
    });
    it("is false when any expectation has content", () => {
      expect(isEmptySpec({ expected: ["", "OK"] })).toBe(false);
    });
  });
});
