import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Filesystem-level tests for the per-tab config fork. Tauri's fs/path plugins
 * are mocked with an in-memory map so the read → write → naming flow can be
 * exercised without a real app shell.
 */
const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: async () => "/home/u",
  join: async (...parts: string[]) => parts.join("/").replace(/\/+/g, "/"),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async (path: string) =>
    files.has(path) || [...files.keys()].some((f) => f.startsWith(`${path}/`)),
  mkdir: async () => {},
  readDir: async (dir: string) =>
    [...files.keys()]
      .filter((f) => f.startsWith(`${dir}/`))
      .map((f) => ({ name: f.slice(dir.length + 1) })),
  readTextFile: async (path: string) => {
    const text = files.get(path);
    if (text === undefined) throw new Error(`ENOENT: ${path}`);
    return text;
  },
  writeTextFile: async (path: string, text: string) => {
    files.set(path, text);
  },
}));

import { forkConfigForSession, configFilePath } from "./sessionConfigFile";
import { parseYamlToRows } from "./yamlConfig";

const ROOT = "/home/u/SCOM-T";
const PROMPTS = `${ROOT}/prompts`;

const SAMPLE = `Commands:
  - command: AT+VER
    hex_mode: false
    line_ending: CRLF
    timeout: 0
    order: 1
`;

beforeEach(() => {
  files.clear();
});

describe("forkConfigForSession", () => {
  it("copies the source tab's file into a new per-session file", async () => {
    files.set(`${ROOT}/prompts.yaml`, SAMPLE);

    const name = await forkConfigForSession("串口2", "prompts.yaml");

    expect(name).toBe("prompts-串口2.yaml");
    expect(files.get(`${PROMPTS}/prompts-串口2.yaml`)).toBe(SAMPLE);
    // The source must be left untouched.
    expect(files.get(`${ROOT}/prompts.yaml`)).toBe(SAMPLE);
  });

  it("seeds from prompts.yaml when the source tab has no file yet", async () => {
    files.set(`${ROOT}/prompts.yaml`, SAMPLE);

    const name = await forkConfigForSession("串口3", "missing.yaml");

    expect(files.get(`${PROMPTS}/${name}`)).toBe(SAMPLE);
  });

  it("writes a blank template when there is nothing to copy", async () => {
    const name = await forkConfigForSession("串口2", undefined);

    const written = files.get(`${PROMPTS}/${name}`)!;
    const parsed = parseYamlToRows(written);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    expect(parsed.rows).toHaveLength(10);
    expect(parsed.rows.every((r) => r.command === "")).toBe(true);
  });

  it("reuses an existing per-session file instead of piling up copies", async () => {
    files.set(`${ROOT}/prompts.yaml`, SAMPLE);
    files.set(`${PROMPTS}/prompts-串口2.yaml`, "Commands: []\n");

    const name = await forkConfigForSession("串口2", "prompts.yaml");

    expect(name).toBe("prompts-串口2.yaml");
    // The old file is the tab's remembered config — it must not be clobbered.
    expect(files.get(`${PROMPTS}/prompts-串口2.yaml`)).toBe("Commands: []\n");
    expect(files.has(`${PROMPTS}/prompts-串口2-2.yaml`)).toBe(false);
  });

  it("resolves prompts.yaml and named files to different paths", async () => {
    expect(await configFilePath("prompts.yaml")).toBe(`${ROOT}/prompts.yaml`);
    expect(await configFilePath("prompts-串口2.yaml")).toBe(`${PROMPTS}/prompts-串口2.yaml`);
  });
});
