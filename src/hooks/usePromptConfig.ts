import { homeDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists, readDir, remove } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { serializeToYaml, parseYamlToRows, type PromptRow } from "../utils/yamlConfig.ts";

const CONFIG_SUBDIR = "SCOM-T/prompts";

async function configDir(): Promise<string> {
  const home = await homeDir();
  return await join(home, CONFIG_SUBDIR);
}

export function usePromptConfig() {
  async function ensureConfigDir(): Promise<string> {
    const dir = await configDir();
    const ok = await exists(dir);
    if (!ok) {
      await mkdir(dir, { recursive: true });
    }
    return dir;
  }

  async function saveConfig(name: string, rows: PromptRow[]): Promise<void> {
    const dir = await ensureConfigDir();
    const yaml = serializeToYaml(rows);
    const path = await join(dir, `${name}.yaml`);
    await writeTextFile(path, yaml);
  }

  async function loadConfig(name: string): Promise<PromptRow[]> {
    const dir = await ensureConfigDir();
    const path = await join(dir, `${name}.yaml`);
    const text = await readTextFile(path);
    const result = parseYamlToRows(text);
    if (!result.valid) throw new Error(result.error);
    return result.rows;
  }

  async function listConfigs(): Promise<string[]> {
    try {
      const dir = await configDir();
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

  async function deleteConfig(name: string): Promise<void> {
    const dir = await ensureConfigDir();
    const path = await join(dir, `${name}.yaml`);
    await remove(path);
  }

  async function openConfigDir(): Promise<void> {
    const dir = await ensureConfigDir();
    await revealItemInDir(dir);
  }

  return { saveConfig, loadConfig, listConfigs, deleteConfig, openConfigDir };
}
