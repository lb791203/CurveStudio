// Shared helpers for the release resource whitelist (release-resources.json).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function loadWhitelist(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "release-resources.json"), "utf8"));
}

export function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Every file the release may contain, relative to the app root (forward slashes).
export function allowedFiles(root, whitelist = loadWhitelist(root)) {
  const files = [...whitelist.code.files];
  for (const [dir, extensions] of Object.entries(whitelist.code.directories)) {
    for (const file of walk(path.join(root, dir))) {
      if (extensions.includes(path.extname(file))) files.push(toPosix(path.relative(root, file)));
    }
  }
  files.push(...Object.keys(whitelist.data));
  return files.sort();
}

export function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === ".DS_Store") return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}
