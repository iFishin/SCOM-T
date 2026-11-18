import { describe, it, expect } from "vitest";
import {
  sanitizeSessionName,
  sessionConfigFileName,
  preferredSessionConfigFileName,
  blankConfigText,
} from "./sessionConfigFile";
import { parseYamlToRows } from "./yamlConfig";

describe("sanitizeSessionName", () => {
  it("keeps a plain tab name", () => {
    expect(sanitizeSessionName("串口2")).toBe("串口2");
  });

  it("replaces path separators and reserved characters", () => {
    expect(sanitizeSessionName("a/b\\c:d*e?f\"g<h>i|j")).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("turns whitespace into single dashes", () => {
    expect(sanitizeSessionName("  My   Port  ")).toBe("My-Port");
  });

  it("falls back when nothing usable is left", () => {
    expect(sanitizeSessionName("...")).toBe("session");
    expect(sanitizeSessionName("")).toBe("session");
  });

  it("caps the length so filenames stay manageable", () => {
    expect(sanitizeSessionName("x".repeat(80)).length).toBe(40);
  });
});

describe("sessionConfigFileName", () => {
  it("derives a per-session file", () => {
    expect(sessionConfigFileName("串口2", ["prompts.yaml"])).toBe("prompts-串口2.yaml");
  });

  it("avoids an existing file", () => {
    expect(sessionConfigFileName("串口2", ["prompts-串口2.yaml"])).toBe("prompts-串口2-2.yaml");
  });

  it("keeps counting until a free name is found", () => {
    const existing = ["prompts-串口2.yaml", "prompts-串口2-2.yaml", "prompts-串口2-3.yaml"];
    expect(sessionConfigFileName("串口2", existing)).toBe("prompts-串口2-4.yaml");
  });

  it("treats names case-insensitively (macOS/Windows filesystems)", () => {
    expect(sessionConfigFileName("Port", ["prompts-Port.yaml"])).toBe("prompts-Port-2.yaml");
  });

  it("never returns the reserved default file", () => {
    expect(sessionConfigFileName("prompts", ["prompts.yaml"])).not.toBe("prompts.yaml");
  });
});

describe("preferredSessionConfigFileName", () => {
  it("maps a tab name to its stable slot", () => {
    expect(preferredSessionConfigFileName("串口2")).toBe("prompts-串口2.yaml");
  });

  it("sanitizes the tab name", () => {
    expect(preferredSessionConfigFileName("My Port")).toBe("prompts-My-Port.yaml");
  });
});

describe("blankConfigText", () => {
  it("round-trips to the requested number of empty rows", () => {
    const result = parseYamlToRows(blankConfigText(7));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.rows).toHaveLength(7);
    expect(result.rows.every((r) => r.command === "")).toBe(true);
    expect(result.rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("always produces at least one row", () => {
    const result = parseYamlToRows(blankConfigText(0));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.rows).toHaveLength(1);
  });
});
