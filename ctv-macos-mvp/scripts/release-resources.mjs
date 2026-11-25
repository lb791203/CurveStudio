// Shared helpers for the release resource whitelist (release-resources.json).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function loadWhitelist(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "release-resources.json"), "utf8"));
}

const TEXT_EXTENSIONS = new Set([".csv", ".txt", ".json", ".cgats", ".it8"]);

// Text data is hashed with LF line endings, so a Windows checkout (core.autocrlf) pins the same content.
export function sha256(file) {
  return sha256Bytes(file, fs.readFileSync(file));
}

export function sha256Bytes(file, bytes) {
  if (TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) bytes = Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function embeddedAssetFailures(manifest, allowed, dataHashes) {
  if (!Array.isArray(manifest?.paths) || !manifest.paths.every((key) => typeof key === "string")) {
    return ["no readable embedded asset manifest"];
  }
  const paths = new Set(manifest.paths);
  const expected = new Set([...allowed].map((name) => `/${name}`));
  const failures = [];
  for (const key of paths) {
    if (!expected.has(key)) failures.push(`non-whitelisted embedded resource: ${key}`);
  }
  for (const key of expected) {
    if (!paths.has(key)) failures.push(`missing embedded resource: ${key}`);
  }
  if (paths.size !== manifest.paths.length) failures.push("duplicate embedded asset keys");
  for (const [file, hash] of Object.entries(dataHashes)) {
    const bytes = manifest.data?.[file];
    if (!Array.isArray(bytes) || !bytes.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      failures.push(`unreadable embedded data: ${file}`);
    } else if (sha256Bytes(file, Buffer.from(bytes)) !== hash) {
      failures.push(`embedded data hash mismatch: ${file}`);
    }
  }
  return failures;
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
