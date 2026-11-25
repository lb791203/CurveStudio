import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { allowedFiles, embeddedAssetFailures, loadWhitelist, sha256 } from "../scripts/release-resources.mjs";

const root = process.cwd();
const whitelist = loadWhitelist(root);
const allowed = allowedFiles(root, whitelist);
const fullManifest = () => ({
  paths: allowed.map((file) => `/${file}`),
  data: Object.fromEntries(Object.keys(whitelist.data).map((file) => [file, [...fs.readFileSync(file)]])),
});
const check = (manifest) => embeddedAssetFailures(manifest, allowed, whitelist.data);

test("release whitelist only holds self-made or synthetic data and matches pinned hashes", () => {
  assert.deepEqual(Object.keys(whitelist.data).sort(), ["samples/ctv-lab-demo.csv", "samples/g7-demo-synthetic.txt", "samples/sample-measurements.csv"]);
  for (const [file, hash] of Object.entries(whitelist.data)) assert.equal(sha256(path.join(root, file)), hash, file);
  assert.ok(allowed.every((file) => !whitelist.forbidden.some((name) => file.includes(name))));
  assert.deepEqual(check(fullManifest()), []);
});

test("packaged asset keys must exactly match the whitelist, including folder and case", () => {
  const manifest = fullManifest();
  const extras = [
    "/samples/kba-presets.json",
    "/samples/audit-report-demo.json",
    "/reference-data/standards/cgats21-iso15339/CGATS21-2-CRPC6.txt",
    "/reference-data/targets/p2p/P2P51.txt",
    "/data/press.csv",
    "/samples/press.CSV",
    "/samples/sample-measurements.CSV",
    "/private/samples/sample-measurements.csv",
    "/other/targets.txt",
    "/profiles/CRPC6.icc",
    "/src/app.js.bak",
    "/src/app.jsx",
    "/anywhere/raw-data",
  ];
  assert.deepEqual(check({ ...manifest, paths: [...manifest.paths, ...extras] }),
    extras.map((key) => `non-whitelisted embedded resource: ${key}`));
  const sample = "/samples/sample-measurements.csv";
  assert.deepEqual(check({ ...manifest, paths: manifest.paths.map((key) => key === sample ? `/private${key}` : key) }),
    [`non-whitelisted embedded resource: /private${sample}`, `missing embedded resource: ${sample}`]);
});

test("packaged samples must match the pinned content even when their paths match", () => {
  const manifest = fullManifest();
  const [first, second] = Object.keys(whitelist.data);
  manifest.data[first] = [...Buffer.from("different,contents")];
  delete manifest.data[second];
  assert.deepEqual(check(manifest), [`embedded data hash mismatch: ${first}`, `unreadable embedded data: ${second}`]);
});

test("a package without an executable asset manifest fails, and loose files fail the macOS whitelist", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-bundle-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const contents = path.join(dir, "Contents");
  const binary = path.join(contents, "MacOS", "curvestudio");
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, "strings alone cannot identify Tauri assets");
  fs.mkdirSync(path.join(contents, "Resources", "another"), { recursive: true });
  fs.writeFileSync(path.join(contents, "Resources", "another", "data.CSV"), "a,b");
  const result = spawnSync(process.execPath, ["scripts/verify-bundle.mjs", "--binary", contents], { cwd: root, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /could not read embedded asset manifest/);
  assert.match(result.stderr, /non-whitelisted packaged file: Resources\/another\/data\.CSV/);
});

test("release build runs the bundle resource gate", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["verify:release"], /verify:bundle/);
  const notary = fs.readFileSync("scripts/notarize-macos.mjs", "utf8");
  assert.match(notary, /verify-bundle\.mjs", "--binary", path\.join\(appPath, "Contents"\)/);
  assert.match(notary, /verifyFinalDmg\(dmgPath\)/);
  assert.match(notary, /verify-bundle\.mjs", "--binary", path\.join\(mountedApp, "Contents"\)/);
  const windows = fs.readFileSync("../.github/workflows/windows-installer.yml", "utf8");
  assert.match(windows, /verify-bundle\.mjs --binary \$nsisDir[\s\S]*verify-bundle\.mjs --binary \$msiDir/);
  assert.match(fs.readFileSync("../.github/workflows/macos-bundle-gate.yml", "utf8"), /verify-bundle\.mjs --binary "\$APP\/Contents"/);
});

test("sample hashes ignore CRLF line endings from a Windows checkout", () => {
  const manifest = fullManifest();
  const sample = "samples/sample-measurements.csv";
  manifest.data[sample] = [...Buffer.from(Buffer.from(manifest.data[sample]).toString("latin1").replace(/\r?\n/g, "\r\n"), "latin1")];
  assert.deepEqual(check(manifest), []);
});
