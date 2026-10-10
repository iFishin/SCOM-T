import { describe, it, expect } from "vitest";
import { enqueueCapped } from "./useLogFile";

describe("enqueueCapped", () => {
  it("appends while under the cap", () => {
    const q = [1, 2];
    expect(enqueueCapped(q, 3, 5)).toBe(0);
    expect(q).toEqual([1, 2, 3]);
  });

  it("keeps the newest and drops the oldest once full", () => {
    const q = [1, 2, 3];
    expect(enqueueCapped(q, 4, 3)).toBe(1);
    expect(q).toEqual([2, 3, 4]);
  });

  it("reports how many were dropped for a large overrun", () => {
    const q = [1, 2, 3, 4];
    // Cap shrank (or a big batch arrived): drop down to the cap in one go.
    const dropped = enqueueCapped(q, 5, 2);
    expect(dropped).toBe(3);
    expect(q).toEqual([4, 5]);
  });

  it("treats a zero cap as 'keep nothing old'", () => {
    const q = ["a"];
    enqueueCapped(q, "b", 1);
    expect(q).toEqual(["b"]);
  });
});
