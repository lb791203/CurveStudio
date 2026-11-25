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
const RESOURCE_PATH_SOURCE = String.raw`(?:^|[\/\\])((?:samples|reference-data|src)\/[A-Za-z0-9._\/-]+\.(?:json|txt|csv|js|css|it8|cgats))`;
const RESOURCE_PATH = new RegExp(RESOURCE_PATH_SOURCE);
const RESOURCE_PATH_GLOBAL = new RegExp(RESOURCE_PATH_SOURCE, "g");

if (args[0] === "--binary") {
  const binaries = args.slice(1);
  if (!binaries.length) failures.push("no binary given");
  for (const binary of binaries) {
    // A directory (e.g. CurveStudio.app/Contents/MacOS or an unpacked installer) is scanned
    // file by file, and the resource paths found are pooled per argument.
    const targets = fs.existsSync(binary) && fs.statSync(binary).isDirectory() ? walk(binary) : [binary];
    if (!targets.length) failures.push(`no files in ${binary}`);
    const found = new Set();
    for (const target of targets) for (const file of checkBinary(target)) found.add(file);
    // The embedded resource list must be exactly the whitelist: a file with no resource paths
    // at all (wrong file, compressed or stripped assets) is a failure, not a pass.
    const expected = [...allowed].filter((file) => RESOURCE_PATH.test(`/${file}`));
    const missing = expected.filter((file) => !found.has(file));
    if (!found.size) failures.push(`${binary}: no embedded resource paths found (not the app binary, or assets not inspectable)`);
    else if (missing.length) failures.push(`${binary}: embedded resources do not match the whitelist, missing ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5})` : ""}`);
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
    return new Set();
  }
  const text = fs.readFileSync(binary).toString("latin1");
  const found = new Set();
  for (const match of text.matchAll(RESOURCE_PATH_GLOBAL)) found.add(match[1]);
  for (const file of found) {
    if (!allowed.has(file)) failures.push(`${path.basename(binary)} embeds non-whitelisted resource: ${file}`);
  }
  for (const name of whitelist.forbidden) {
    if (name !== "reference-data/" && text.includes(name)) failures.push(`${path.basename(binary)} contains forbidden resource name: ${name}`);
  }
  const embeddedData = Object.keys(whitelist.data).filter((file) => found.has(file)).length;
  console.log(`${path.basename(binary)}: ${found.size} embedded resource paths, ${embeddedData} whitelisted data files`);
  return found;
}

function forbiddenName(file) {
  return whitelist.forbidden.some((name) => file.includes(name));
}
