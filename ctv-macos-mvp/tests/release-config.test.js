import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildAuditReportComparison } from "../src/audit-report.js";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("release scripts use pinned Tauri CLI and npm lockfile", () => {
  assert.ok(fs.existsSync("package-lock.json"), "package-lock.json is required for reproducible installs and npm audit");
  assert.equal(packageJson.devDependencies?.["@tauri-apps/cli"], "2.11.4");
  assert.equal(packageJson.scripts?.["macos:release:notarize"], "node scripts/notarize-macos.mjs");
  assert.ok(fs.existsSync("scripts/notarize-macos.mjs"), "macOS notarization script is required for external distribution");
  for (const [name, script] of Object.entries(packageJson.scripts || {})) {
    assert.doesNotMatch(script, /@tauri-apps\/cli@latest/, `${name} must not use @latest`);
  }
});

test("Tauri desktop configs disable global API and define CSP", () => {
  for (const configPath of ["src-tauri/tauri.conf.json", "src-tauri/tauri.windows.conf.json"]) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.app?.withGlobalTauri, false, `${configPath} should not expose global Tauri API`);
    assert.equal(
      config.app?.security?.csp,
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http://localhost:4173 ws://localhost:4173; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      `${configPath} should define the desktop CSP`
    );
  }
});

test("desktop SDK commands do not report fake calibration success", () => {
  const mainRs = fs.readFileSync("src-tauri/src/main.rs", "utf8");
  const cargoToml = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
  assert.doesNotMatch(mainRs, /X-Rite calibration completed/i);
  assert.doesNotMatch(mainRs, /Calibration completed successfully/i);
  assert.doesNotMatch(cargoToml, /\bhidapi\b/i, "HID dependency should stay out until real SDK/protocol support is implemented");
});

test("macOS notarization workflow requires Developer ID, hardened runtime and stapling", () => {
  const notarizeScript = fs.readFileSync("scripts/notarize-macos.mjs", "utf8");
  assert.match(notarizeScript, /Developer ID Application/);
  assert.match(notarizeScript, /APPLE_SIGNING_IDENTITY/);
  assert.match(notarizeScript, /APPLE_NOTARY_PROFILE/);
  assert.match(notarizeScript, /"notarytool",\s*"submit"/);
  assert.match(notarizeScript, /"stapler",\s*"staple"/);
  assert.match(notarizeScript, /"spctl",\s*\["--assess"/);
  assert.match(notarizeScript, /"--options",\s*"runtime"/);
  assert.ok(fs.existsSync("src-tauri/entitlements.plist"), "macOS hardened runtime signing should use an explicit entitlements file");
});

test("customer audit report comparison keeps TVI, Lab, gray and density evidence", () => {
  const comparison = buildAuditReportComparison({
    job: { customerName: "SML Viet Nam", machineModel: "XL-75-6C" },
    source: { software: "PrintSpec" },
    standard: { name: "ISO 12647-2:2007 Offset" },
    auditSummary: { status: "Check" },
    auditRules: { tviDotGainTolerance: 5 },
    tviDotGain: [
      {
        channel: "C",
        target: { 25: 11.5, 50: 16, 75: 11.5 },
        print: { 25: 11.3, 50: 17.2, 75: 12 },
      },
    ],
    solidColours: [
      {
        patch: "C solid",
        targetLab: { l: 54, a: -36, b: -49 },
        printLab: { l: 57.68, a: -35.8, b: -47.25 },
        printDeltaE: 4.08,
        toleranceDeltaE: 5,
      },
    ],
    overprints: [
      {
        patch: "CM overprint",
        targetLab: { l: 24, a: 16, b: -45 },
        printLab: { l: 28.14, a: 16.12, b: -44.93 },
        printDeltaE: 4.14,
        toleranceDeltaE: 5,
      },
    ],
    threeColourGreys: [
      {
        patch: "CMY gray 50",
        targetLab: { l: 58, a: 0, b: 0 },
        printLab: { l: 58.2, a: 1.1, b: 0.2 },
        printDeltaH: 1.12,
        toleranceDeltaH: 2,
      },
    ],
    density: [
      {
        channel: "C",
        target: { 100: 1.4, 50: 0.49 },
        print: { 100: 1.26, 50: 0.5 },
      },
    ],
  });

  assert.equal(comparison.title, "SML Viet Nam / XL-75-6C");
  assert.equal(comparison.standard.name, "ISO 12647-2:2007 Offset");
  assert.equal(comparison.tviRows.length, 3);
  assert.equal(comparison.labRows.length, 2);
  assert.equal(comparison.grayRows.length, 1);
  assert.equal(comparison.densityRows.length, 2);
  assert.deepEqual(comparison.counts.density, { total: 2, pass: 0, review: 2, check: 0 });
  assert.equal(comparison.densityRows.find((row) => row.tone === 100)?.target, 1.4);
  assert.equal(comparison.densityRows.find((row) => row.tone === 50)?.target, 0.49);
});
