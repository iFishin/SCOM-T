import { homeDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists, readDir, remove } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import yaml from "js-yaml";
import {
  parseResponseSetDoc,
  serializeResponseSetDoc,
} from "../utils/responseSetYaml.ts";
import type { ResponseSet } from "../utils/responseSetYaml.ts";

// Re-exported so existing importers keep a single entry point.
export type { ResponseSet, ResponseSetCommand } from "../utils/responseSetYaml.ts";
export { parseResponseSetDoc, serializeResponseSetDoc } from "../utils/responseSetYaml.ts";

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
