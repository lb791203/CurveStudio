import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("release scripts use pinned Tauri CLI and npm lockfile", () => {
  assert.ok(fs.existsSync("package-lock.json"), "package-lock.json is required for reproducible installs and npm audit");
  assert.equal(packageJson.devDependencies?.["@tauri-apps/cli"], "2.11.4");
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

test("production audit report layout is print-safe and uses a stable chart grid", () => {
  const css = fs.readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.audit-production-chart-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(css, /\.audit-production-chart-grid \.audit-tone-chart,\s*\.audit-production-chart-grid \.audit-lab-chart\s*\{\s*grid-column:\s*1\s*;/);
  assert.doesNotMatch(css, /\.audit-production-chart-grid \.audit-tone-chart,\s*\.audit-production-chart-grid \.audit-lab-chart\s*\{\s*grid-column:\s*1 \/ -1\s*;/);
  assert.match(css, /\.audit-meta-card\s*\{[\s\S]*min-height:\s*72px/);
  assert.match(css, /@media print\s*\{[\s\S]*\.audit-chart-card\s*\{[\s\S]*break-inside:\s*avoid/);
});
