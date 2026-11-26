import { homeDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { serializeToYaml, type PromptRow } from "./yamlConfig.ts";

/**
 * Per-tab prompt config files.
 *
 * `prompts.yaml` is the legacy/global default and lives at `~/SCOM-T/prompts.yaml`;
 * every other config lives in `~/SCOM-T/prompts/<name>.yaml`. Sessions bind to a
 * file by name (see `SerialSession.groupId`), so two tabs that pick the same file
 * end up in the same instruction group (issue #60).
 */
export const DEFAULT_CONFIG_FILE = "prompts.yaml";

const CONFIG_ROOT = "SCOM-T";
const PROMPTS_SUBDIR = "prompts";

/** Absolute path of a config file name, matching the rules PromptPanel uses. */
export async function configFilePath(fileName: string): Promise<string> {
  const home = await homeDir();
  if (fileName === DEFAULT_CONFIG_FILE) {
    return join(home, CONFIG_ROOT, DEFAULT_CONFIG_FILE);
  }
  return join(home, CONFIG_ROOT, PROMPTS_SUBDIR, fileName);
}

export async function readConfigText(fileName: string): Promise<string | null> {
  try {
    return await readTextFile(await configFilePath(fileName));
  } catch {
    return null;
  }
}

export async function writeConfigText(fileName: string, text: string): Promise<void> {
  const path = await configFilePath(fileName);
  const home = await homeDir();
  const dir = await join(home, CONFIG_ROOT, PROMPTS_SUBDIR);
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeTextFile(path, text);
}

/** `prompts.yaml` plus every `*.yaml` / `*.yml` under `~/SCOM-T/prompts`. */
export async function listConfigFiles(): Promise<string[]> {
  const names = new Set<string>([DEFAULT_CONFIG_FILE]);
  try {
    const dir = await join(await homeDir(), CONFIG_ROOT, PROMPTS_SUBDIR);
    if (await exists(dir)) {
      for (const entry of await readDir(dir)) {
        const name = entry.name ?? "";
        if (name.endsWith(".yaml") || name.endsWith(".yml")) names.add(name);
      }
    }
  } catch {
    // Unreadable directory: fall back to the reserved default only.
  }
  return [...names].sort();
}

/** Filesystem-safe fragment for a generated file name. */
export function sanitizeSessionName(name: string): string {
  const cleaned = (name ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 40);
  return cleaned || "session";
}

/**
 * Non-colliding file name for a new session, e.g. "串口2" -> `prompts-串口2.yaml`.
 * Comparison is case-insensitive because macOS/Windows filesystems are.
 */
export function sessionConfigFileName(sessionName: string, existing: string[]): string {
  const base = `prompts-${sanitizeSessionName(sessionName)}`;
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  let candidate = `${base}.yaml`;
  let suffix = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}.yaml`;
    suffix += 1;
  }
  return candidate;
}

/**
 * The stable slot a tab name maps to. Reusing it (instead of forking yet
 * another copy) keeps `prompts/` from filling up with `-2`, `-3` files when
 * tabs are closed and re-opened.
 */
export function preferredSessionConfigFileName(sessionName: string): string {
  return `prompts-${sanitizeSessionName(sessionName)}.yaml`;
}

/** Serialized blank config, used when there is nothing to copy from. */
export function blankConfigText(rowCount = 10): string {
  const rows: PromptRow[] = Array.from({ length: Math.max(1, rowCount) }, (_, i) => ({
    id: i + 1,
    selected: false,
    command: "",
    isHex: false,
    ender: "\r\n",
    interval: "",
  }));
  return serializeToYaml(rows);
}

/**
 * Create an independent config for a new session, seeded from the tab it was
 * opened from (falling back to `prompts.yaml`, then to a blank template).
 * Returns the file name.
 *
 * A tab name owns a stable file: if `prompts-<name>.yaml` already exists (the
 * tab was closed before), the new tab reuses it instead of piling up copies.
 */
export async function forkConfigForSession(
  sessionName: string,
  sourceFile?: string,
): Promise<string> {
  const existing = await listConfigFiles();
  const preferred = preferredSessionConfigFileName(sessionName);
  const alreadyThere = existing.find((n) => n.toLowerCase() === preferred.toLowerCase());
  if (alreadyThere) return alreadyThere;

  const fileName = sessionConfigFileName(sessionName, existing);

  let text: string | null = null;
  if (sourceFile) text = await readConfigText(sourceFile);
  if (text === null) text = await readConfigText(DEFAULT_CONFIG_FILE);
  if (text === null) text = blankConfigText();

  await writeConfigText(fileName, text);
  return fileName;
}
