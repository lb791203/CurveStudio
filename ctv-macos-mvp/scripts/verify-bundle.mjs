// Release gate for the staged frontend, the built app, and unpacked installers.
// The executable reports the actual Tauri asset table and the pinned sample data.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { allowedFiles, embeddedAssetFailures, loadWhitelist, sha256, toPosix, walk } from "./release-resources.mjs";

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
const MACOS_FILES = new Set(["Info.plist", "MacOS/curvestudio", "Resources/icon.icns", "_CodeSignature/CodeResources", "CodeResources"]);
const DATA_FILENAME = /\.(csv|tsv|txt|it8|cgats|cxf|rwxf|icc|icm)(\.|$)/i;

if (args[0] === "--binary") {
  const targets = args.slice(1);
  if (!targets.length) failures.push("no binary given");
  for (const target of targets) checkPackage(path.resolve(target));
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

function checkPackage(target) {
  if (!fs.existsSync(target)) {
    failures.push(`package not found: ${target}`);
    return;
  }
  const isDirectory = fs.statSync(target).isDirectory();
  const macBundle = isDirectory && path.basename(target) === "Contents";
  const files = isDirectory ? walk(target) : [target];
  const executables = [];
  for (const file of files) {
    const relative = toPosix(path.relative(target, file));
    if (macBundle ? relative === "MacOS/curvestudio" : /^curvestudio(?:\.exe)?$/i.test(path.basename(file))) {
      executables.push(file);
    }
    if (macBundle ? !MACOS_FILES.has(relative) : isDirectory && (DATA_FILENAME.test(relative) || forbiddenName(relative))) {
      failures.push(`non-whitelisted packaged file: ${relative}`);
    }
  }
  if (executables.length !== 1 || !fs.lstatSync(executables[0]).isFile()) {
    failures.push(`${target}: expected one CurveStudio executable`);
    return;
  }
  checkExecutable(executables[0]);
}

function checkExecutable(binary) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curvestudio-assets-"));
  const filename = path.join(dir, "assets.json");
  const dataFiles = Object.keys(whitelist.data);
  try {
    // Keep the known legacy markers check for native data outside the Tauri asset table.
    const bytes = fs.readFileSync(binary);
    for (const name of whitelist.forbidden) {
      if (name !== "reference-data/" && bytes.includes(name)) failures.push(`${binary}: contains forbidden resource name: ${name}`);
    }
    const run = spawnSync(binary, ["--verify-embedded-assets", filename, ...dataFiles], { encoding: "utf8", timeout: 15000, windowsHide: true });
    if (run.status !== 0) throw run.error || new Error(run.stderr?.trim() || `executable exited with ${run.status}`);
    const manifest = JSON.parse(fs.readFileSync(filename, "utf8"));
    const issues = embeddedAssetFailures(manifest, allowed, whitelist.data);
    for (const issue of issues) failures.push(`${binary}: ${issue}`);
    if (!issues.length) console.log(`${path.basename(binary)}: ${manifest.paths.length} embedded resources, ${dataFiles.length} samples verified by SHA-256`);
  } catch (error) {
    failures.push(`${binary}: could not read embedded asset manifest: ${error.message}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function forbiddenName(file) {
  return whitelist.forbidden.some((name) => file.toLowerCase().includes(name.toLowerCase()));
}
