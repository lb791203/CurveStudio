import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAuditReportComparison, auditMeasurementCsv } from "../src/audit-report.js";
import { parseImportText } from "../src/curve-engine.js";

const report = JSON.parse(fs.readFileSync("samples/sml-printspec-audit-example.json", "utf8"));

test("SML PrintSpec audit report example matches recomputed TVI and Lab values", () => {
  const csv = auditMeasurementCsv(report);
  const parsed = parseImportText(csv);
  const comparison = buildAuditReportComparison(report);

  assert.equal(parsed.measurements.length, 20);
  assert.equal(comparison.counts.tvi.pass, 20);
  assert.equal(comparison.counts.lab.pass, 4);
  assert.equal(comparison.counts.lab.review, 4);
  assert.equal(comparison.counts.gray.pass, 3);
  assert.equal(comparison.counts.substrate.pass, 3);
  assert.equal(comparison.recomputeCounts.lab.pass, 8);
  assert.equal(comparison.counts.density.review, 20);

  const cyan50 = comparison.tviRows.find((row) => row.channel === "C" && row.tone === 50);
  assert.deepEqual(
    {
      computed: cyan50.computed,
      report: cyan50.report,
      targetComputed: cyan50.targetComputed,
      targetReport: cyan50.targetReport,
      deltaComputed: cyan50.deltaComputed,
      deltaReport: cyan50.deltaReport,
      tolerance: cyan50.tolerance,
      auditStatus: cyan50.auditStatus,
      recomputeStatus: cyan50.recomputeStatus,
    },
    {
      computed: 17.2,
      report: 17.2,
      targetComputed: 14.3,
      targetReport: 14.3,
      deltaComputed: 2.9,
      deltaReport: 2.9,
      tolerance: 5,
      auditStatus: "Pass",
      recomputeStatus: "Pass",
    },
  );

  assert.equal(comparison.labRows.find((row) => row.patch === "Cyan").computed, 4.08);
  assert.equal(comparison.labRows.find((row) => row.patch === "Cyan").auditStatus, "Pass");
  assert.equal(comparison.labRows.find((row) => row.patch === "Red").auditStatus, "Review");
  assert.equal(comparison.grayRows.find((row) => row.patch === "Mid Grey").computed, 1.99);
  assert.equal(comparison.grayRows.find((row) => row.patch === "Mid Grey").auditStatus, "Pass");
});
