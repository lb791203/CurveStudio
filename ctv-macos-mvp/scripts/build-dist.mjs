import fs from "node:fs";
import path from "node:path";
import { allowedFiles, loadWhitelist, sha256 } from "./release-resources.mjs";

// Copies only whitelisted files (release-resources.json) into dist/, so nothing else can
// reach the desktop app by accident. Data files must match their pinned SHA-256.
const root = process.cwd();
const dist = path.join(root, "dist");
const whitelist = loadWhitelist(root);

for (const [file, hash] of Object.entries(whitelist.data)) {
  const actual = sha256(path.join(root, file));
  if (actual !== hash) {
    console.error(`${file} changed (sha256 ${actual}); review it is self-made/synthetic, then run node scripts/verify-bundle.mjs --update-hashes`);
    process.exit(1);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
for (const file of allowedFiles(root, whitelist)) {
  const target = path.join(dist, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}

console.log(`Built desktop frontend in ${path.relative(root, dist)}/`);
