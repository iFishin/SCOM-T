import { describe, it, expect } from "vitest";
import { validateResponseSetPayload } from "./useCloudMarketplace";

// js-yaml accepts JSON, so JSON.stringify keeps the fixtures readable.
const doc = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: "4G 基础",
    commands: [{ command: "AT+CSQ", expected_responses: ["OK"] }],
    ...over,
  });

describe("validateResponseSetPayload", () => {
  it("accepts a well-formed document", () => {
    const r = validateResponseSetPayload("file", doc());
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.set.id).toBe("file");
      expect(r.set.name).toBe("4G 基础");
      expect(r.set.commands).toHaveLength(1);
      expect(r.set.commands[0].matchMode).toBe("all");
    }
  });

  it("returns the full field mapping (delegated to the shared parser)", () => {
    const r = validateResponseSetPayload(
      "file",
      doc({
        commands: [
          {
            command: "AT+CSQ",
            command_regex: true,
            is_hex: true,
            group: "网络",
            description: "信号",
            expected_responses: ["\\d+", "OK"],
            expected_responses_regex: [true, false],
            match_mode: "any",
          },
        ],
      }),
    );
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.set.commands[0]).toEqual({
        command: "AT+CSQ",
        commandRegex: true,
        isHex: true,
        group: "网络",
        description: "信号",
        expectedResponses: ["\\d+", "OK"],
        expectedResponseRegex: [true, false],
        matchMode: "any",
      });
    }
  });

  it("rejects invalid YAML", () => {
    const r = validateResponseSetPayload("file", "name: [unclosed");
    expect(r.valid).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(validateResponseSetPayload("file", "just a string").valid).toBe(false);
    expect(validateResponseSetPayload("file", "").valid).toBe(false);
  });

  it("requires a non-blank name", () => {
    expect(validateResponseSetPayload("file", doc({ name: "" })).valid).toBe(false);
    expect(validateResponseSetPayload("file", doc({ name: "   " })).valid).toBe(false);
    expect(validateResponseSetPayload("file", doc({ name: undefined })).valid).toBe(false);
  });

  it("requires a commands array", () => {
    expect(validateResponseSetPayload("file", doc({ commands: undefined })).valid).toBe(false);
    expect(validateResponseSetPayload("file", doc({ commands: "nope" })).valid).toBe(false);
  });

  it("caps the command count", () => {
    const many = Array.from({ length: 501 }, () => ({ command: "AT" }));
    expect(validateResponseSetPayload("file", doc({ commands: many })).valid).toBe(false);
    const ok = Array.from({ length: 500 }, () => ({ command: "AT" }));
    expect(validateResponseSetPayload("file", doc({ commands: ok })).valid).toBe(true);
  });

  it("drops commands with blank command text", () => {
    const r = validateResponseSetPayload(
      "file",
      doc({ commands: [{ command: "" }, { command: "AT" }] }),
    );
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.set.commands.map((c) => c.command)).toEqual(["AT"]);
  });
});
