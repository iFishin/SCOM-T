import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import {
  parseResponseSetDoc,
  serializeResponseSetDoc,
  type ResponseSet,
  type ResponseSetCommand,
} from "./responseSetYaml";

function cmd(over: Partial<ResponseSetCommand> = {}): ResponseSetCommand {
  return {
    command: "AT+CSQ",
    expectedResponses: ["+CSQ: 25,0", "OK"],
    matchMode: "all",
    ...over,
  };
}

function set(commands: ResponseSetCommand[], over: Partial<ResponseSet> = {}): ResponseSet {
  return { id: "file", name: "4G 基础", commands, ...over };
}

/** Compare only the fields that survive a round trip (absent vs undefined). */
function roundTrip(original: ResponseSet): ResponseSet {
  const parsed = parseResponseSetDoc(yaml.load(serializeResponseSetDoc(original)), "file");
  if (!parsed) throw new Error("parse returned null");
  return {
    ...parsed,
    commands: parsed.commands.map((c) => ({
      command: c.command,
      commandRegex: c.commandRegex || undefined,
      isHex: c.isHex || undefined,
      group: c.group,
      description: c.description,
      expectedResponses: c.expectedResponses,
      expectedResponseRegex: c.expectedResponseRegex,
      matchMode: c.matchMode,
    })),
  };
}

describe("response-set YAML round trip", () => {
  it("round-trips a full command", () => {
    const original = set([
      cmd({
        commandRegex: true,
        isHex: true,
        group: "网络",
        description: "信号查询",
        expectedResponseRegex: [true, false],
        matchMode: "any",
      }),
    ]);
    expect(roundTrip(original)).toEqual(original);
  });

  it("round-trips a minimal command with defaults filled in", () => {
    const original = set([cmd({ expectedResponses: ["OK"] })]);
    expect(roundTrip(original)).toEqual(original);
  });

  it("keeps the description on the set", () => {
    const original = set([cmd()], { description: "常用指令" });
    expect(roundTrip(original)).toEqual(original);
  });
});

describe("parseResponseSetDoc tolerance", () => {
  it("returns null for non-objects", () => {
    expect(parseResponseSetDoc(null, "f")).toBeNull();
    expect(parseResponseSetDoc("text", "f")).toBeNull();
    expect(parseResponseSetDoc(42, "f")).toBeNull();
    expect(parseResponseSetDoc([1, 2], "f")).toBeNull();
  });

  it("falls back to the file name when the doc name is missing", () => {
    const parsed = parseResponseSetDoc({ commands: [] }, "my-file");
    expect(parsed?.name).toBe("my-file");
    expect(parsed?.id).toBe("my-file");
  });

  it("coerces non-string expected responses to strings", () => {
    const parsed = parseResponseSetDoc(
      { name: "n", commands: [{ command: "AT", expected_responses: [1, true] }] },
      "f",
    );
    expect(parsed?.commands[0].expectedResponses).toEqual(["1", "true"]);
  });

  it("drops commands with empty command text", () => {
    const parsed = parseResponseSetDoc(
      { name: "n", commands: [{ command: "", expected_responses: ["OK"] }, { command: "AT" }] },
      "f",
    );
    expect(parsed?.commands.map((c) => c.command)).toEqual(["AT"]);
  });

  it("treats a missing commands array as empty", () => {
    const parsed = parseResponseSetDoc({ name: "n" }, "f");
    expect(parsed?.commands).toEqual([]);
  });

  it("drops a length-mismatched regex flag array", () => {
    const parsed = parseResponseSetDoc(
      { name: "n", commands: [{ command: "AT", expected_responses: ["A", "B"], expected_responses_regex: [true] }] },
      "f",
    );
    expect(parsed?.commands[0].expectedResponseRegex).toBeUndefined();
  });

  it("defaults match_mode to all", () => {
    const parsed = parseResponseSetDoc(
      { name: "n", commands: [{ command: "AT", match_mode: "whatever" }] },
      "f",
    );
    expect(parsed?.commands[0].matchMode).toBe("all");
  });
});
