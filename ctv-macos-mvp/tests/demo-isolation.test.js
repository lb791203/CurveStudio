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

test("review #5: demo audit data is only fetched from the explicit sample entry", () => {
  const fetches = [...app.matchAll(/audit-report-demo\.json/g)].map((match) => match.index);
  const sampleBody = functionBody("loadSelectedSample");
  const sampleStart = app.indexOf(sampleBody);
  for (const index of fetches) {
    assert.ok(index > sampleStart && index < sampleStart + sampleBody.length, "audit demo referenced outside loadSelectedSample");
  }
});
