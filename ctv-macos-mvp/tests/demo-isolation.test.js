import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

function functionBody(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const next = app.indexOf("\nfunction ", start + 10);
  const nextAsync = app.indexOf("\nasync function ", start + 10);
  const end = Math.min(...[next, nextAsync].filter((index) => index > 0));
  return app.slice(start, end);
}

test("review #5: importing a measurement file never loads demo audit data", () => {
  const body = functionBody("importMeasurementText");
  assert.doesNotMatch(body, /audit-report-demo|loadAuditReportStandard|applyAuditReportJobFields|applyAuditReportImportMetadata/);
  assert.doesNotMatch(app, /detectAuditReportForImport/);
  // Parse and validate first; only then touch state.
  assert.ok(body.indexOf("parseImportText") < body.indexOf("state.auditReport"));
});

test("review #1/#5: no demo audit report or press presets are bundled or referenced", () => {
  assert.doesNotMatch(app, /audit-report-demo\.json|kba-presets\.json/);
});

test("review M6: a slow standard request cannot overwrite a later selection", () => {
  const body = functionBody("loadStandard");
  assert.match(body, /const request = \+\+standardRequestSeq/);
  assert.match(body, /if \(request !== standardRequestSeq\) return;/);
});
