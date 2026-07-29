import { homeDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists, readDir, remove } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import yaml from "js-yaml";

// ── Types ──

export type ResponseSetCommand = {
  command: string;
  commandRegex?: boolean;
  expectedResponses: string[];
  expectedResponseRegex?: boolean[];
  matchMode: "all" | "any";
};

export type ResponseSet = {
  id: string;
  name: string;
  description?: string;
  commands: ResponseSetCommand[];
};

// ── YAML shape ──

interface YamlResponseSet {
  name: string;
  description?: string;
  commands: {
    command: string;
    command_regex?: boolean;
    expected_responses?: string[];
    expected_responses_regex?: boolean[];
    match_mode?: "all" | "any";
  }[];
}

// ── Persistence ──

const RESPONSES_SUBDIR = "SCOM-T/responses";

async function responseSetsDir(): Promise<string> {
  const home = await homeDir();
  return await join(home, RESPONSES_SUBDIR);
}

async function ensureDir(): Promise<string> {
  const dir = await responseSetsDir();
  const ok = await exists(dir);
  if (!ok) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9一-鿿_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "unnamed";
}

// ── Hook ──

export function useResponseSet() {
  async function listResponseSets(): Promise<string[]> {
    try {
      const dir = await responseSetsDir();
      const ok = await exists(dir);
      if (!ok) return [];
      const entries = await readDir(dir);
      return entries
        .filter((e) => !e.name?.startsWith(".") && e.name?.endsWith(".yaml"))
        .map((e) => e.name!.replace(/\.yaml$/, ""))
        .sort();
    } catch {
      return [];
    }
  }

  async function loadResponseSet(name: string): Promise<ResponseSet | null> {
    try {
      const dir = await ensureDir();
      const path = await join(dir, `${sanitizeFileName(name)}.yaml`);
      const text = await readTextFile(path);
      const raw = yaml.load(text) as YamlResponseSet | null;
      if (!raw || typeof raw !== "object") return null;
      return {
        id: name,
        name: raw.name || name,
        description: raw.description,
        commands: Array.isArray(raw.commands)
          ? raw.commands.map((c) => {
              const responses = Array.isArray(c.expected_responses) ? c.expected_responses.map(String) : [];
              const regex = Array.isArray(c.expected_responses_regex) ? c.expected_responses_regex : [];
              return {
                command: c.command || "",
                commandRegex: c.command_regex === true,
                expectedResponses: responses,
                expectedResponseRegex: regex.length === responses.length ? regex : undefined,
                matchMode: c.match_mode === "any" ? ("any" as const) : ("all" as const),
              };
            }).filter((c) => c.command)
          : [],
      };
    } catch {
      return null;
    }
  }

  async function saveResponseSet(name: string, set: ResponseSet): Promise<void> {
    const dir = await ensureDir();
    const yamlDoc: YamlResponseSet = {
      name: set.name,
      description: set.description,
      commands: set.commands.map((c) => {
        const hasRegex = c.expectedResponseRegex?.some(Boolean);
        return {
          command: c.command,
          command_regex: c.commandRegex || undefined,
          expected_responses: c.expectedResponses.length > 0 ? c.expectedResponses : undefined,
          expected_responses_regex: hasRegex ? c.expectedResponseRegex : undefined,
          match_mode: c.matchMode === "any" ? "any" : undefined,
        };
      }),
    };
    const yamlText = yaml.dump(yamlDoc, { indent: 2, lineWidth: -1, noRefs: true, quotingType: "'" });
    const path = await join(dir, `${sanitizeFileName(name)}.yaml`);
    await writeTextFile(path, yamlText);
  }

  async function deleteResponseSet(name: string): Promise<void> {
    try {
      const dir = await ensureDir();
      const path = await join(dir, `${sanitizeFileName(name)}.yaml`);
      await remove(path);
    } catch {
      // ignore
    }
  }

  async function openResponseSetsDir(): Promise<void> {
    const dir = await ensureDir();
    await revealItemInDir(dir);
  }

  /**
   * Match commands from a response set against prompt rows by command name.
   * Returns an array of updates to apply to the grid.
   */
  function applyToGrid(
    responseSet: ResponseSet,
    promptRows: { id: number; command: string }[],
  ): { rowId: number; expectedResponses: string[]; expectedResponseRegex?: boolean[]; matchMode: "all" | "any" }[] {
    const results: { rowId: number; expectedResponses: string[]; expectedResponseRegex?: boolean[]; matchMode: "all" | "any" }[] = [];
    for (const row of promptRows) {
      if (!row.command.trim()) continue;
      const matched = responseSet.commands.find((c) => {
        if (c.commandRegex) {
          try {
            return new RegExp(c.command).test(row.command.trim());
          } catch {
            return false;
          }
        }
        return c.command.trim().toUpperCase() === row.command.trim().toUpperCase();
      });
      if (matched && matched.expectedResponses.length > 0) {
        results.push({
          rowId: row.id,
          expectedResponses: [...matched.expectedResponses],
          expectedResponseRegex: matched.expectedResponseRegex ? [...matched.expectedResponseRegex] : undefined,
          matchMode: matched.matchMode,
        });
      }
    }
    return results;
  }

  return {
    listResponseSets,
    loadResponseSet,
    saveResponseSet,
    deleteResponseSet,
    openResponseSetsDir,
    applyToGrid,
  };
}