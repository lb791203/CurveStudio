import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditReportComparison, auditMeasurementCsv } from "../src/audit-report.js";
import { parseImportText } from "../src/curve-engine.js";

// Synthetic audit report (made-up numbers): the bundled demo report was removed.
const report = {
  job: { customerName: "示例客户", machineModel: "示例印机" },
  source: { software: "Synthetic" },
  standard: { name: "Synthetic print condition" },
  tviDotGain: [
    { channel: "C", target: { 0: 0, 25: 11, 50: 14, 75: 11, 100: 0 }, print: { 0: 0, 25: 12, 50: 16.5, 75: 12, 100: 0 } },
    { channel: "K", target: { 0: 0, 25: 14, 50: 17, 75: 13, 100: 0 }, print: { 0: 0, 25: 14.5, 50: 18, 75: 13.5, 100: 0 } },
  ],
  substrate: { targetLab: { l: 94, a: 0, b: -2 }, printLab: { l: 93, a: 0.5, b: -2.5 }, isoTolerance: { l: 3, a: 2, b: 2 }, error: { l: 1, a: 0.5, b: 0.5 } },
  solidColours: [{ patch: "Cyan", targetLab: { l: 55, a: -37, b: -50 }, printLab: { l: 56, a: -36, b: -49 }, toleranceDeltaE: 5, printDeltaE: 1.73 }],
  overprints: [{ patch: "Red", targetLab: { l: 47, a: 68, b: 48 }, printLab: { l: 49, a: 64, b: 40 }, toleranceDeltaE: null, printDeltaE: 9.17 }],
  threeColourGreys: [{ patch: "Mid Grey", targetLab: { l: null, a: 0, b: -1 }, printLab: { l: 58, a: 1, b: -0.5 }, toleranceDeltaH: 2, printDeltaH: 1.12 }],
  density: [{ channel: "C", target: { 100: 1.4 }, print: { 100: 1.35 } }],
};

test("audit report comparison recomputes TVI, Lab and gray values", () => {
  const parsed = parseImportText(auditMeasurementCsv(report));
  const comparison = buildAuditReportComparison(report);

  assert.equal(parsed.measurements.length, 10);
  assert.equal(comparison.counts.tvi.total, 10);
  assert.equal(comparison.recomputeCounts.tvi.check, 0);
  const cyan50 = comparison.tviRows.find((row) => row.channel === "C" && row.tone === 50);
  assert.equal(cyan50.deltaComputed, 2.5);
  assert.equal(cyan50.auditStatus, "Pass");
  assert.equal(comparison.labRows.find((row) => row.patch === "Cyan").computed, 1.73);
  assert.equal(comparison.labRows.find((row) => row.patch === "Red").auditStatus, "Review");
  assert.equal(comparison.grayRows.find((row) => row.patch === "Mid Grey").computed, 1.12);
  assert.equal(comparison.counts.substrate.pass, 3);
});
