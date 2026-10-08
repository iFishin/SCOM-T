import { describe, it, expect } from "vitest";
import { compareVersion } from "./versionCheck";

describe("compareVersion", () => {
  it("treats equal versions as equal", () => {
    expect(compareVersion("0.3.89", "0.3.89")).toBe(0);
  });

  it("compares numerically, not lexically", () => {
    expect(compareVersion("0.3.10", "0.3.9")).toBeGreaterThan(0);
    expect(compareVersion("0.3.9", "0.3.10")).toBeLessThan(0);
    expect(compareVersion("0.10.0", "0.9.9")).toBeGreaterThan(0);
  });

  it("pads missing segments with zero", () => {
    expect(compareVersion("0.4", "0.4.0")).toBe(0);
    expect(compareVersion("1", "1.0.1")).toBeLessThan(0);
    expect(compareVersion("1.0.1", "1")).toBeGreaterThan(0);
  });

  it("strips a leading v", () => {
    expect(compareVersion("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersion("v1.3.0", "v1.2.9")).toBeGreaterThan(0);
  });

  it("compares major/minor/patch in priority order", () => {
    expect(compareVersion("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersion("1.5.0", "1.4.99")).toBeGreaterThan(0);
  });
});
