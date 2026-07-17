import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tauriPath = join(__dirname, "..", "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(tauriPath, "utf-8"));
const parts = conf.version.split("+")[0].split(".").map(Number);

const arg = process.argv[2];

if (arg === "major") {
  parts[0]++;
  parts[1] = 0;
  parts[2] = 0;
} else if (arg === "minor") {
  parts[1]++;
  parts[2] = 0;
} else {
  // default: patch
  parts[2]++;
}

const newVersion = parts.join(".");
conf.version = newVersion;
writeFileSync(tauriPath, JSON.stringify(conf, null, 2) + "\n");

console.log(`Version bumped → ${newVersion}`);
