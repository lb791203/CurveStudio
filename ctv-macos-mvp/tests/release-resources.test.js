import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { allowedFiles, loadWhitelist, sha256 } from "../scripts/release-resources.mjs";

const root = process.cwd();

function verifyBinary(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-bundle-"));
  const file = path.join(dir, "app.bin");
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(contents, "latin1"), Buffer.from([0])]));
  return spawnSync(process.execPath, ["scripts/verify-bundle.mjs", "--binary", file], { cwd: root, encoding: "utf8" });
}

test("review #1: release whitelist only holds self-made or synthetic data and matches pinned hashes", () => {
  const whitelist = loadWhitelist(root);
  assert.deepEqual(Object.keys(whitelist.data).sort(), ["samples/ctv-lab-demo.csv", "samples/g7-demo-synthetic.txt", "samples/sample-measurements.csv"]);
  for (const [file, hash] of Object.entries(whitelist.data)) assert.equal(sha256(path.join(root, file)), hash, file);
  const files = allowedFiles(root, whitelist);
  assert.ok(files.every((file) => !whitelist.forbidden.some((name) => file.includes(name))));
  assert.ok(!files.some((file) => file.startsWith("reference-data/")));
});

test("review #1: binary scan rejects third-party or old customer resources", () => {
  const ok = verifyBinary(fullManifest());
  assert.equal(ok.status, 0, ok.stderr);
  for (const bad of ["/samples/kba-presets.json", "/samples/audit-report-demo.json", "/reference-data/standards/cgats21-iso15339/CGATS21-2-CRPC6.txt", "/reference-data/targets/p2p/P2P51.txt"]) {
    const result = verifyBinary(`${fullManifest()}${bad}\0`);
    assert.notEqual(result.status, 0, bad);
  }
});

test("re-review M8: a file without any embedded resource paths fails the binary scan", () => {
  const result = verifyBinary("just some bytes, no asset table");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no embedded resource paths/);
});

test("re-review M8: the embedded resource list must match the whitelist, not just avoid bad names", () => {
  const result = verifyBinary("/index.html\0/src/app.js\0/samples/g7-demo-synthetic.txt\0");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /do not match the whitelist/);
});

function fullManifest() {
  return allowedFiles(root, loadWhitelist(root)).map((file) => `/${file}\0`).join("");
}

test("release build runs the bundle resource gate", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["verify:release"], /verify:bundle/);
  assert.match(fs.readFileSync("scripts/notarize-macos.mjs", "utf8"), /verify-bundle\.mjs", "--binary"/);
  assert.match(fs.readFileSync("../.github/workflows/windows-installer.yml", "utf8"), /verify-bundle\.mjs --binary/);
  // re-review M8: the final artefacts are checked too (unpacked NSIS/MSI, mounted stapled DMG).
  assert.match(fs.readFileSync("../.github/workflows/windows-installer.yml", "utf8"), /verify-bundle\.mjs --binary \$nsisDir[\s\S]*verify-bundle\.mjs --binary \$msiDir/);
  assert.match(fs.readFileSync("scripts/notarize-macos.mjs", "utf8"), /verifyFinalDmg\(dmgPath\)/);
  // round-3 M8: a macOS CI job runs the gate on a real Mach-O build.
  assert.match(fs.readFileSync("../.github/workflows/macos-bundle-gate.yml", "utf8"), /verify-bundle\.mjs --binary "\$APP\/Contents\/MacOS"/);
});

test("sample hashes ignore CRLF line endings from a Windows checkout", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crlf-"));
  const lf = path.join(dir, "lf.csv");
  const crlf = path.join(dir, "crlf.csv");
  fs.writeFileSync(lf, "a,b\n1,2\n");
  fs.writeFileSync(crlf, "a,b\r\n1,2\r\n");
  assert.equal(sha256(crlf), sha256(lf));
});

test("round-3 M8: asset keys packed back to back (Mach-O) are split, not read as one path", () => {
  // Tauri's asset table in a macOS binary: keys with no separator between them.
  const packed = allowedFiles(root, loadWhitelist(root)).map((file) => `/${file}`).join("");
  const result = verifyBinary(packed);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /src\/features\.js\/src/);
  // ".json" is not cut at ".js".
  const bad = verifyBinary(`${packed}/samples/kba-presets.json`);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /kba-presets\.json/);
});

test("round-3 M8: keys followed directly by a symbol name (real macOS build) are still found", () => {
  // Bytes seen in the macOS CI build: "…Tauri-Invoke-Keyapplication/json/src/features.js/src/exporter.jsIllegalEventName…"
  const files = allowedFiles(root, loadWhitelist(root));
  const packed = files.map((file, index) => `${index % 2 ? "IllegalEventName" : "Tauri-Invoke-Keyapplication/json"}/${file}`).join("") + "IllegalEventNameTokioOneshotRecv";
  const result = verifyBinary(packed);
  assert.equal(result.status, 0, result.stderr);
  // …but a .json next to a whitelisted .js of the same name is still caught.
  const js = files.find((file) => file.endsWith(".js"));
  const extra = verifyBinary(`${files.map((file) => `/${file}`).join("")}/${js}on`);
  assert.notEqual(extra.status, 0);
});

test("round-4 M8: an extra .icc and an extra file sharing a whitelisted prefix are rejected", () => {
  const files = allowedFiles(root, loadWhitelist(root));
  const packed = files.map((file) => `/${file}`).join("");
  for (const extra of ["/data/press.csv", "/samples/SAMPLE-MEASUREMENTS.CSV", "/samples/sample-measurements.CSV", "/other/targets.txt", "/samples/press-profile.icc", "/profiles/CRPC6.icc", "/src/app.js.bak", "/src/app.js-old.js", "/samples/sample-measurements.csv.orig", "/src/app.jsx"]) {
    const result = verifyBinary(`${packed}${extra}IllegalEventName`);
    assert.notEqual(result.status, 0, extra);
    assert.match(result.stderr, /non-whitelisted/, extra);
  }
  // The same extras in the middle of the packed table, followed by the next key.
  const middle = verifyBinary(packed.replace("/src/app.js", "/src/app.js.bak/src/app.js"));
  assert.notEqual(middle.status, 0);
});
