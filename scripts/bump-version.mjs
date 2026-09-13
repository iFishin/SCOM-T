import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const tauriPath = join(root, "src-tauri", "tauri.conf.json");
const pkgPath = join(root, "package.json");
const cargoPath = join(root, "src-tauri", "Cargo.toml");
const lockPath = join(root, "package-lock.json");

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
  parts[2]++;
}

const newVersion = parts.join(".");

// Update tauri.conf.json
conf.version = newVersion;
writeFileSync(tauriPath, JSON.stringify(conf, null, 2) + "\n");

// Update package.json
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Update Cargo.toml
let cargo = readFileSync(cargoPath, "utf-8");
cargo = cargo.replace(/^version = ".*"/m, `version = "${newVersion}"`);
writeFileSync(cargoPath, cargo);

// Update package-lock.json (root version + the "" workspace entry).
// npm writes this file with 2-space indent, so re-serializing only touches
// these two lines and leaves the rest byte-identical.
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
  lock.version = newVersion;
  if (lock.packages?.[""]) lock.packages[""].version = newVersion;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
}

console.log(`Version bumped → ${newVersion}`);
