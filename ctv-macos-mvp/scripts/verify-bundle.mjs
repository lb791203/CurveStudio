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
// Tauri embeds the frontend as an asset table keyed by "/<path>". In a Mach-O binary those
// keys sit back to back with no separator, and can run straight into the next symbol:
//   "…application/json/src/features.js/src/exporter.jsIllegalEventName…"
// The scan therefore reads keys key by key:
//   - a whitelisted key must be present (plain substring test);
//   - every key-like path under a frontend root is read up to its extension. An extension is only
//     complete when no lowercase letter or digit follows (".js" vs ".json"), so an uppercase
//     symbol name may follow, but ".", "-" or "_" may not ("src/app.js.bak" is another file);
//   - colour or measurement data (.icc .icm .cxf .it8 .cgats) anywhere in the binary must be
//     whitelisted, whatever folder it sits in.
const ROOTS = String.raw`(?:samples|reference-data|src|assets|profiles)`;
const EXTENSIONS = String.raw`(?:json|txt|csv|js|jsx|mjs|ts|map|css|html|svg|png|it8|cgats|icc|icm|cxf)`;
const RESOURCE_PATH_SOURCE = String.raw`(${ROOTS}\/[A-Za-z0-9._\/-]+?\.${EXTENSIONS})(?![a-z0-9])`;
const RESOURCE_PATH = new RegExp(RESOURCE_PATH_SOURCE);
const RESOURCE_PATH_GLOBAL = new RegExp(RESOURCE_PATH_SOURCE, "g");
const DATA_FILE_GLOBAL = /([A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:icc|icm|cxf|it8|cgats))(?![a-z0-9])/gi;
const PATH_TAIL = /^[._-][A-Za-z0-9._-]*/;

if (args[0] === "--binary") {
  const binaries = args.slice(1);
  if (!binaries.length) failures.push("no binary given");
  for (const binary of binaries) {
    // A directory (e.g. CurveStudio.app/Contents/MacOS or an unpacked installer) is scanned
    // file by file, and the resource paths found are pooled per argument.
    const targets = fs.existsSync(binary) && fs.statSync(binary).isDirectory() ? walk(binary) : [binary];
    if (!targets.length) failures.push(`no files in ${binary}`);
    const found = new Set();
    const present = new Set();
    for (const target of targets) {
      const result = checkBinary(target);
      for (const file of result.found) found.add(file);
      for (const file of result.present) present.add(file);
    }
    // The embedded resource list must be exactly the whitelist: a file with no resource paths
    // at all (wrong file, compressed or stripped assets) is a failure, not a pass.
    const expected = [...allowed].filter((file) => RESOURCE_PATH.test(`/${file}`));
    // Presence is a plain substring test, so how neighbouring keys are packed cannot hide a file.
    const missing = expected.filter((file) => !present.has(file));
    if (!found.size && !present.size) failures.push(`${binary}: no embedded resource paths found (not the app binary, or assets not inspectable)`);
    else if (missing.length) {
      failures.push(`${binary}: embedded resources do not match the whitelist, missing ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5})` : ""}`);
      for (const file of missing.slice(0, 3)) showContext(targets, file);
    }
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
    return { found: new Set(), present: new Set() };
  }
  const text = fs.readFileSync(binary).toString("latin1");
  const found = new Set();
  for (const match of text.matchAll(RESOURCE_PATH_GLOBAL)) {
    const tail = text.slice(match.index + match[0].length).match(PATH_TAIL)?.[0] || "";
    // "src/app.js" followed by ".bak" is the key "src/app.js.bak", not src/app.js.
    found.add(match[1] + tail);
  }
  const allowedNames = new Set([...allowed].map((file) => path.posix.basename(file)));
  for (const match of text.matchAll(DATA_FILE_GLOBAL)) {
    if (!allowedNames.has(match[1])) failures.push(`${path.basename(binary)} embeds non-whitelisted data file: ${match[1]}`);
  }
  const present = new Set([...allowed].filter((file) => text.includes(file)));
  for (const file of found) {
    if (!allowed.has(file)) failures.push(`${path.basename(binary)} embeds non-whitelisted resource: ${file}`);
  }
  for (const name of whitelist.forbidden) {
    if (name !== "reference-data/" && text.includes(name)) failures.push(`${path.basename(binary)} contains forbidden resource name: ${name}`);
  }
  const embeddedData = Object.keys(whitelist.data).filter((file) => found.has(file)).length;
  console.log(`${path.basename(binary)}: ${found.size} embedded resource paths, ${embeddedData} whitelisted data files`);
  return { found, present };
}

function forbiddenName(file) {
  return whitelist.forbidden.some((name) => file.includes(name));
}

// Diagnostics for a mismatch: print the bytes around where the missing name appears.
function showContext(targets, file) {
  const name = path.posix.basename(file);
  for (const target of targets) {
    const text = fs.readFileSync(target).toString("latin1");
    let index = text.indexOf(name);
    let shown = 0;
    while (index !== -1 && shown < 3) {
      const snippet = text.slice(Math.max(0, index - 60), index + name.length + 60).replace(/[^\x20-\x7e]/g, "·");
      console.error(`  context ${path.basename(target)}@${index}: ${snippet}`);
      index = text.indexOf(name, index + 1);
      shown += 1;
    }
  }
}
