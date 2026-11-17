import { describe, it, expect } from "vitest";
import { MatchLogBuffer, MATCH_LOG_LIMIT } from "./matchLogBuffer.ts";
import type { MatchLogEntry } from "./matchLogBuffer.ts";

const entry = (detail: string, status: MatchLogEntry["status"] = "info"): MatchLogEntry => ({
  rowId: 1,
  command: "AT",
  status,
  detail,
});

const details = (buf: MatchLogBuffer) => buf.snapshot().map((e) => e.detail);

describe("MatchLogBuffer", () => {
  it("keeps the newest entry first", () => {
    const buf = new MatchLogBuffer();
    buf.push([entry("a"), entry("b")]);
    expect(details(buf)).toEqual(["b", "a"]);
  });

  it("prepends later batches above earlier ones", () => {
    const buf = new MatchLogBuffer();
    buf.push([entry("a")]);
    buf.push([entry("b"), entry("c")]);
    expect(details(buf)).toEqual(["c", "b", "a"]);
  });

  it("drops the oldest entries past the cap", () => {
    const buf = new MatchLogBuffer();
    for (let i = 0; i < MATCH_LOG_LIMIT + 20; i++) buf.push([entry(`e${i}`)]);
    expect(buf.size).toBe(MATCH_LOG_LIMIT);
    expect(details(buf)[0]).toBe(`e${MATCH_LOG_LIMIT + 19}`);
    expect(details(buf)).not.toContain("e0");
  });

  it("keeps the newest entries of an oversized single batch", () => {
    const buf = new MatchLogBuffer();
    const batch = Array.from({ length: MATCH_LOG_LIMIT + 5 }, (_, i) => entry(`b${i}`));
    buf.push(batch);
    expect(buf.size).toBe(MATCH_LOG_LIMIT);
    expect(details(buf)[0]).toBe(`b${MATCH_LOG_LIMIT + 4}`);
    // The five oldest of the batch are the ones cut.
    expect(details(buf)).not.toContain("b4");
  });

  it("does not mutate the batch it was given", () => {
    const buf = new MatchLogBuffer();
    const batch = [entry("a"), entry("b")];
    buf.push(batch);
    expect(batch.map((e) => e.detail)).toEqual(["a", "b"]);
  });

  it("reports error and success rollups without counting info lines", () => {
    const buf = new MatchLogBuffer();
    buf.push([entry("recv")]);
    expect(buf.stats()).toEqual({ count: 1, hasError: false, hasSuccess: false });

    buf.push([entry("fail", "error")]);
    expect(buf.stats()).toEqual({ count: 2, hasError: true, hasSuccess: false });

    buf.push([entry("ok", "success")]);
    expect(buf.stats()).toEqual({ count: 3, hasError: true, hasSuccess: true });
  });

  it("drops stale status flags together with the entries that carried them", () => {
    const buf = new MatchLogBuffer();
    buf.push([entry("fail", "error")]);
    // Fill past the cap so the error entry is pushed out.
    for (let i = 0; i < MATCH_LOG_LIMIT; i++) buf.push([entry(`e${i}`)]);
    expect(buf.stats()).toEqual({ count: MATCH_LOG_LIMIT, hasError: false, hasSuccess: false });
  });

  it("clears everything", () => {
    const buf = new MatchLogBuffer();
    buf.push([entry("a", "error")]);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.snapshot()).toEqual([]);
    expect(buf.stats()).toEqual({ count: 0, hasError: false, hasSuccess: false });
  });
});
