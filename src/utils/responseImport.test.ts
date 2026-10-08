import { describe, it, expect } from "vitest";
import {
  planResponseImport,
  collectPlaceholders,
  expandPlaceholders,
} from "./responseImport";
import type { ImportCommand, ImportRow } from "./responseImport";

const cmd = (over: Partial<ImportCommand> = {}): ImportCommand => ({
  command: "AT",
  expectedResponses: ["OK"],
  ...over,
});

const row = (id: number, command: string): ImportRow => ({ id, command });

describe("placeholders", () => {
  it("collects unique names across commands", () => {
    expect(collectPlaceholders(["AT+IPR={baud}", "AT+IPR={baud}", "AT+CGDCONT={apn}"]))
      .toEqual(["baud", "apn"]);
  });

  it("expands known names and leaves unknown ones intact", () => {
    expect(expandPlaceholders("AT+IPR={baud},{x}", { baud: "9600" })).toBe("AT+IPR=9600,{x}");
  });
});

describe("planResponseImport", () => {
  it("updates a row whose command matches exactly (case-insensitive)", () => {
    const plan = planResponseImport([cmd({ command: "at+csq" })], [row(1, "AT+CSQ")]);
    expect(plan.updates).toEqual([{ rowId: 1, expectedResponses: ["OK"], expectedResponseRegex: undefined, matchMode: "all" }]);
    expect(plan.newRows).toEqual([]);
  });

  it("adds a new row for a command matching nothing", () => {
    const plan = planResponseImport([cmd({ command: "AT+NEW" })], [row(1, "AT+CSQ")]);
    expect(plan.updates).toEqual([]);
    expect(plan.newRows).toHaveLength(1);
    expect(plan.newRows[0].command).toBe("AT+NEW");
  });

  it("applies both matched and unmatched commands in one pass", () => {
    const plan = planResponseImport(
      [cmd({ command: "AT+CSQ" }), cmd({ command: "AT+NEW" })],
      [row(1, "AT+CSQ")],
    );
    expect(plan.updates.map((u) => u.rowId)).toEqual([1]);
    expect(plan.newRows.map((r) => r.command)).toEqual(["AT+NEW"]);
  });

  it("matches commands by regex when commandRegex is set", () => {
    const plan = planResponseImport(
      [cmd({ command: "AT\\+CSQ.*", commandRegex: true })],
      [row(1, "AT+CSQ"), row(2, "AT+CSQ=0")],
    );
    expect(plan.updates.map((u) => u.rowId)).toEqual([1, 2]);
    expect(plan.newRows).toEqual([]);
  });

  it("never adds a regex command as a literal row", () => {
    const plan = planResponseImport([cmd({ command: "^NOPE$", commandRegex: true })], [row(1, "AT")]);
    expect(plan.updates).toEqual([]);
    expect(plan.newRows).toEqual([]);
  });

  it("treats an invalid regex as non-matching and does not add it", () => {
    const plan = planResponseImport([cmd({ command: "(", commandRegex: true })], [row(1, "AT")]);
    expect(plan.updates).toEqual([]);
    expect(plan.newRows).toEqual([]);
  });

  it("gives a row to the first matching command only", () => {
    const plan = planResponseImport(
      [cmd({ command: "AT", expectedResponses: ["A"] }), cmd({ command: "AT", expectedResponses: ["B"] })],
      [row(1, "AT")],
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].expectedResponses).toEqual(["A"]);
    // The second identical command is unused, so it lands as a new row — but
    // only once (deduped by command text).
    expect(plan.newRows.map((r) => r.command)).toEqual([]);
  });

  it("expands placeholders before matching and adding", () => {
    const plan = planResponseImport(
      [cmd({ command: "AT+IPR={baud}" })],
      [row(1, "AT+IPR=9600")],
      { baud: "9600" },
    );
    expect(plan.updates.map((u) => u.rowId)).toEqual([1]);
  });

  it("carries matchMode, regex flags, hex flag and note into new rows", () => {
    const plan = planResponseImport(
      [cmd({ command: "AT+X", matchMode: "any", isHex: true, description: "note", expectedResponseRegex: [true] })],
      [],
    );
    expect(plan.newRows[0]).toMatchObject({
      command: "AT+X",
      matchMode: "any",
      isHex: true,
      note: "note",
      expectedResponseRegex: [true],
    });
  });

  it("skips empty and blank commands", () => {
    const plan = planResponseImport([cmd({ command: "   " })], [row(1, "AT")]);
    expect(plan.updates).toEqual([]);
    expect(plan.newRows).toEqual([]);
  });

  it("ignores blank existing rows", () => {
    const plan = planResponseImport([cmd({ command: "" })], [row(1, "   ")]);
    expect(plan.updates).toEqual([]);
  });
});
