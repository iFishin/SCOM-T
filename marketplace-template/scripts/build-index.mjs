import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

const DIR = "response-sets";

function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".yaml"));

  const index = files.map((file) => {
    const id = file.replace(/\.yaml$/, "");
    const raw = readFileSync(join(DIR, file), "utf8");
    const doc = yaml.load(raw);

    if (!doc || typeof doc !== "object" || typeof doc.name !== "string") {
      throw new Error(`${file}: missing required "name" field`);
    }

    return {
      id,
      name: doc.name,
      description: typeof doc.description === "string" ? doc.description : undefined,
    };
  });

  writeFileSync("index.json", JSON.stringify(index, null, 2) + "\n");
  console.log(`Wrote index.json with ${index.length} entries.`);
}

main();
