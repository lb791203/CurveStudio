import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const entries = ["index.html", "src", "samples", "reference-data"];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

for (const entry of entries) {
  await fs.cp(path.join(root, entry), path.join(dist, entry), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`),
  });
}

console.log(`Built desktop frontend in ${path.relative(root, dist)}/`);
