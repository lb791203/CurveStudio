// Release gate for bundled resources.
//   node scripts/verify-bundle.mjs [dist]              check the built frontend tree
//   node scripts/verify-bundle.mjs --binary <file...>   scan packaged app binaries / installers
//   node scripts/verify-bundle.mjs --update-hashes      re-pin data file hashes after review
// The frontend tree must match release-resources.json exactly (data files by SHA-256).
// Binaries are scanned for embedded asset paths; any path outside the whitelist, or any
// forbidden name, fails the release.
import fs from "node:fs";
import path from "node:path";
import { allowedFiles, loadWhitelist, sha256, toPosix, walk } from "./release-resources.mjs";

const root = process.cwd();
const whitelist = loadWhitelist(root);
const args = process.argv.slice(2);
const failures = [];

if (args[0] === "--update-hashes") {
  for (const file of Object.keys(whitelist.data)) whitelist.data[file] = sha256(path.join(root, file));
  fs.writeFileSync(path.join(root, "release-resources.json"), `${JSON.stringify(whitelist, null, 2)}\n`);
  console.log("Updated data hashes in release-resources.json");
  process.exit(0);
}

const allowed = new Set(allowedFiles(root, whitelist));

if (args[0] === "--binary") {
  const binaries = args.slice(1);
  if (!binaries.length) failures.push("no binary given");
  for (const binary of binaries) {
    // A directory (e.g. CurveStudio.app/Contents/MacOS) is scanned file by file.
    const targets = fs.existsSync(binary) && fs.statSync(binary).isDirectory() ? walk(binary) : [binary];
    if (!targets.length) failures.push(`no files in ${binary}`);
    for (const target of targets) checkBinary(target);
  }
} else {
  checkDist(path.resolve(root, args[0] || "dist"));
}

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("Bundle resource check passed.");

function checkDist(dist) {
  if (!fs.existsSync(dist)) {
    failures.push(`${path.relative(root, dist)} does not exist; run npm run build:dist first`);
    return;
  }
  const present = new Set(walk(dist).map((file) => toPosix(path.relative(dist, file))));
  for (const file of present) {
    if (!allowed.has(file)) failures.push(`not whitelisted: ${file}`);
    if (forbiddenName(file)) failures.push(`forbidden resource: ${file}`);
  }
  for (const file of allowed) if (!present.has(file)) failures.push(`missing from bundle: ${file}`);
  for (const [file, hash] of Object.entries(whitelist.data)) {
    const target = path.join(dist, file);
    if (fs.existsSync(target) && sha256(target) !== hash) failures.push(`hash mismatch: ${file}`);
  }
}

function checkBinary(binary) {
  if (!fs.existsSync(binary)) {
    failures.push(`binary not found: ${binary}`);
    return;
  }
  const text = fs.readFileSync(binary).toString("latin1");
  const found = new Set();
  for (const match of text.matchAll(/(?:^|[\/\\])((?:samples|reference-data|src)\/[A-Za-z0-9._\/-]+\.(?:json|txt|csv|js|css|it8|cgats))/g)) {
    found.add(match[1]);
  }
  for (const file of found) {
    if (!allowed.has(file)) failures.push(`${path.basename(binary)} embeds non-whitelisted resource: ${file}`);
  }
  for (const name of whitelist.forbidden) {
    if (name !== "reference-data/" && text.includes(name)) failures.push(`${path.basename(binary)} contains forbidden resource name: ${name}`);
  }
  const embeddedData = Object.keys(whitelist.data).filter((file) => found.has(file)).length;
  console.log(`${path.basename(binary)}: ${found.size} embedded resource paths, ${embeddedData} whitelisted data files`);
}

function forbiddenName(file) {
  return whitelist.forbidden.some((name) => file.includes(name));
}
