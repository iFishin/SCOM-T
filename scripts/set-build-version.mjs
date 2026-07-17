import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tauriPath = join(__dirname, "..", "src-tauri", "tauri.conf.json");
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const buildSuffix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const conf = JSON.parse(readFileSync(tauriPath, "utf-8"));
const original = conf.version;
const base = original.split("+")[0];

// Temporarily write build version
conf.version = `${base}+${buildSuffix}`;
writeFileSync(tauriPath, JSON.stringify(conf, null, 2) + "\n");
console.log(`Build version → ${conf.version}`);

// Run tauri build
const result = spawnSync("npx", ["tauri", "build", ...process.argv.slice(2)], {
  cwd: join(__dirname, ".."),
  stdio: "inherit",
  shell: true,
});

// Restore original dev version
const restored = JSON.parse(readFileSync(tauriPath, "utf-8"));
restored.version = original;
writeFileSync(tauriPath, JSON.stringify(restored, null, 2) + "\n");
console.log(`Restored → ${original}`);

process.exit(result.status ?? 1);
