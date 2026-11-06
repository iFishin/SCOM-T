import { describe, it, expect } from "vitest";
import { serializeToYaml, parseYamlToRows } from "./yamlConfig";
import type { PromptRow } from "./yamlConfig";

function row(over: Partial<PromptRow> = {}): PromptRow {
  return {
    id: 1,
    selected: false,
    command: "AT",
    isHex: false,
    ender: "\r\n",
    interval: "",
    ...over,
  };
}

function roundTrip(rows: PromptRow[]): PromptRow[] {
  const parsed = parseYamlToRows(serializeToYaml(rows));
  if (!parsed.valid) throw new Error(parsed.error);
  return parsed.rows;
}

describe("yamlConfig", () => {
  it("round-trips a basic command", () => {
    const [out] = roundTrip([row({ command: "AT+CSQ" })]);
    expect(out.command).toBe("AT+CSQ");
    expect(out.ender).toBe("\r\n");
    expect(out.isHex).toBe(false);
  });

  it("normalizes duplicate or invalid orders into unique positive ids (#11)", () => {
    const yaml = [
      "Commands:",
      "  - order: 1",
      "    command: AT",
      "  - order: 1",
      "    command: AT+CSQ",
      "  - order: 0",
      "    command: ATI",
      "  - command: AT+GMR",
    ].join("\n");
    const parsed = parseYamlToRows(yaml);
    if (!parsed.valid) throw new Error(parsed.error);
    const ids = parsed.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
  });

  it("round-trips expected responses and per-entry regex flags", () => {
    const [out] = roundTrip([
      row({
        expectedResponses: ["\\+CSQ:\\s*\\d+,\\d+", "OK"],
        expectedResponseRegex: [true, false],
      }),
    ]);
    expect(out.expectedResponses).toEqual(["\\+CSQ:\\s*\\d+,\\d+", "OK"]);
    expect(out.expectedResponseRegex).toEqual([true, false]);
  });

  it("persists matchMode 'any'", () => {
    const [out] = roundTrip([row({ expectedResponses: ["OK", "RDY"], matchMode: "any" })]);
    expect(out.matchMode).toBe("any");
  });

  it("omits matchMode when it is the default 'all'", () => {
    const yamlText = serializeToYaml([row({ matchMode: "all", expectedResponses: ["OK"] })]);
    expect(yamlText).not.toContain("match_mode");
    const [out] = roundTrip([row({ matchMode: "all", expectedResponses: ["OK"] })]);
    expect(out.matchMode).toBeUndefined();
  });

  it("preserves hex mode, ender, timeout, device and note", () => {
    const [out] = roundTrip([
      row({ command: "AA BB", isHex: true, ender: "\n", interval: "1500", device: "dev1", note: "hello" }),
    ]);
    expect(out.isHex).toBe(true);
    expect(out.ender).toBe("\n");
    expect(out.interval).toBe("1500");
    expect(out.device).toBe("dev1");
    expect(out.note).toBe("hello");
  });

  it("rejects a non-array Commands value", () => {
    const parsed = parseYamlToRows("Commands: nope");
    expect(parsed.valid).toBe(false);
  });

  it("accepts an empty document as zero rows", () => {
    const parsed = parseYamlToRows("");
    expect(parsed.valid).toBe(true);
    if (parsed.valid) expect(parsed.rows).toEqual([]);
  });
});
