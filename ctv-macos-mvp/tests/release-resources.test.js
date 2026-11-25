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
  const ok = verifyBinary("/index.html\0/src/app.js\0/samples/g7-demo-synthetic.txt\0");
  assert.equal(ok.status, 0, ok.stderr);
  for (const bad of ["/samples/kba-presets.json", "/samples/audit-report-demo.json", "/reference-data/standards/cgats21-iso15339/CGATS21-2-CRPC6.txt", "/reference-data/targets/p2p/P2P51.txt"]) {
    const result = verifyBinary(`/src/app.js\0${bad}\0`);
    assert.notEqual(result.status, 0, bad);
  }
});

test("release build runs the bundle resource gate", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["verify:release"], /verify:bundle/);
  assert.match(fs.readFileSync("scripts/notarize-macos.mjs", "utf8"), /verify-bundle\.mjs", "--binary"/);
  assert.match(fs.readFileSync("../.github/workflows/windows-installer.yml", "utf8"), /verify-bundle\.mjs --binary/);
});
