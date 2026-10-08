/**
 * Pure planning for importing a command response-set into the command grid.
 *
 * Extracted from PromptPanel so the matching rules are unit-testable:
 *   - rows take the first command that matches them (exact text after
 *     placeholder expansion, or a regex test when commandRegex is set);
 *   - commands matching no row become new rows (except regex commands, which
 *     are matchers, not literal commands);
 *   - matchMode / regex flags / notes / hex flags travel with the command.
 */

import type { MatchMode } from "../serial/responseMatcher.ts";

export const PLACEHOLDER_RE = /\{(\w+)\}/g;

export function collectPlaceholders(commands: string[]): string[] {
  const names = new Set<string>();
  for (const cmd of commands) {
    let m: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(cmd)) !== null) names.add(m[1]);
  }
  return [...names];
}

export function expandPlaceholders(cmd: string, values: Record<string, string>): string {
  return cmd.replace(PLACEHOLDER_RE, (_, name) => values[name] ?? `{${name}}`);
}

export type ImportCommand = {
  command: string;
  commandRegex?: boolean;
  isHex?: boolean;
  description?: string;
  expectedResponses: string[];
  expectedResponseRegex?: boolean[];
  matchMode?: MatchMode;
};

export type ImportRow = { id: number; command: string };

export type ImportUpdate = {
  rowId: number;
  expectedResponses?: string[];
  expectedResponseRegex?: boolean[];
  matchMode: MatchMode;
};

export type ImportNewRow = {
  command: string;
  isHex: boolean;
  note?: string;
  expectedResponses: string[];
  expectedResponseRegex?: boolean[];
  matchMode: MatchMode;
};

export type ImportPlan = {
  updates: ImportUpdate[];
  newRows: ImportNewRow[];
};

function payloadFor(c: ImportCommand): Omit<ImportUpdate, "rowId"> {
  return {
    expectedResponses: c.expectedResponses.length ? [...c.expectedResponses] : undefined,
    expectedResponseRegex: c.expectedResponseRegex ? [...c.expectedResponseRegex] : undefined,
    matchMode: c.matchMode ?? "all",
  };
}

function commandMatches(c: ImportCommand, rowCommand: string, placeholders: Record<string, string>): boolean {
  if (c.commandRegex) {
    try {
      return new RegExp(c.command).test(rowCommand);
    } catch {
      return false; // invalid regex — never matches
    }
  }
  const expanded = expandPlaceholders(c.command, placeholders).trim();
  return expanded.length > 0 && expanded.toUpperCase() === rowCommand.toUpperCase();
}

/** Compute what an import would do, without touching any state. */
export function planResponseImport(
  commands: ImportCommand[],
  rows: ImportRow[],
  placeholders: Record<string, string> = {},
): ImportPlan {
  const usedCommands = new Set<number>();
  const updates: ImportUpdate[] = [];

  for (const row of rows) {
    const rowCommand = row.command.trim();
    if (!rowCommand) continue;
    for (let i = 0; i < commands.length; i++) {
      if (commandMatches(commands[i], rowCommand, placeholders)) {
        usedCommands.add(i);
        updates.push({ rowId: row.id, ...payloadFor(commands[i]) });
        break;
      }
    }
  }

  const newRows: ImportNewRow[] = [];
  const seen = new Set<string>();
  const existing = new Set<string>();
  for (const row of rows) {
    const key = row.command.trim().toUpperCase();
    if (key) existing.add(key);
  }
  for (let i = 0; i < commands.length; i++) {
    if (usedCommands.has(i)) continue;
    const c = commands[i];
    if (c.commandRegex) continue;
    const expanded = expandPlaceholders(c.command, placeholders).trim();
    const key = expanded.toUpperCase();
    // Skip blanks, commands already present as a row, and duplicates within
    // this batch — a leftover command should add at most one new row.
    if (!expanded || existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    newRows.push({
      command: expanded,
      isHex: c.isHex || false,
      note: c.description || undefined,
      expectedResponses: [...c.expectedResponses],
      expectedResponseRegex: c.expectedResponseRegex ? [...c.expectedResponseRegex] : undefined,
      matchMode: c.matchMode ?? "all",
    });
  }

  return { updates, newRows };
}
