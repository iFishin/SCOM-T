import { homeDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists, readDir, remove } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import yaml from "js-yaml";

// ── Types ──

export type ResponseSetCommand = {
  command: string;
  commandRegex?: boolean;
  isHex?: boolean;
  group?: string;
  description?: string;
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
    is_hex?: boolean;
    group?: string;
    description?: string;
    expected_responses?: string[];
    expected_responses_regex?: boolean[];
    match_mode?: "all" | "any";
  }[];
}

/** Parse a raw (already YAML-loaded) response-set document into a ResponseSet. */
export function parseResponseSetDoc(raw: unknown, fallbackName: string): ResponseSet | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const doc = raw as YamlResponseSet;
  return {
    id: fallbackName,
    name: doc.name || fallbackName,
    description: typeof doc.description === "string" ? doc.description : undefined,
    commands: Array.isArray(doc.commands)
      ? doc.commands.map((c) => {
          const responses = Array.isArray(c.expected_responses) ? c.expected_responses.map(String) : [];
          const regex = Array.isArray(c.expected_responses_regex) ? c.expected_responses_regex : [];
          return {
            command: c.command || "",
            commandRegex: c.command_regex === true,
            isHex: c.is_hex === true,
            group: typeof c.group === "string" ? c.group : undefined,
            description: typeof c.description === "string" ? c.description : undefined,
            expectedResponses: responses,
            expectedResponseRegex: regex.length === responses.length ? regex : undefined,
            matchMode: c.match_mode === "any" ? ("any" as const) : ("all" as const),
          };
        }).filter((c) => c.command)
      : [],
  };
}

/** Serialize a ResponseSet back into its YAML text form. */
export function serializeResponseSetDoc(set: ResponseSet): string {
  const yamlDoc: YamlResponseSet = {
    name: set.name,
    description: set.description,
    commands: set.commands.map((c) => {
      const hasRegex = c.expectedResponseRegex?.some(Boolean);
      return {
        command: c.command,
        command_regex: c.commandRegex || undefined,
        is_hex: c.isHex || undefined,
        group: c.group || undefined,
        description: c.description || undefined,
        expected_responses: c.expectedResponses.length > 0 ? c.expectedResponses : undefined,
        expected_responses_regex: hasRegex ? c.expectedResponseRegex : undefined,
        match_mode: c.matchMode === "any" ? "any" : undefined,
      };
    }),
  };
  return yaml.dump(yamlDoc, { indent: 2, lineWidth: -1, noRefs: true, quotingType: "'" });
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
      return parseResponseSetDoc(yaml.load(text), name);
    } catch {
      return null;
    }
  }

  async function saveResponseSet(name: string, set: ResponseSet): Promise<void> {
    const dir = await ensureDir();
    const path = await join(dir, `${sanitizeFileName(name)}.yaml`);
    await writeTextFile(path, serializeResponseSetDoc(set));
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

  return {
    listResponseSets,
    loadResponseSet,
    saveResponseSet,
    deleteResponseSet,
    openResponseSetsDir,
  };
}