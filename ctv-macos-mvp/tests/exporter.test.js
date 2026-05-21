import assert from "node:assert/strict";
import test from "node:test";

import { g7ReportArchive, projectArchive, summarizeCurveSafety, toG7VerificationCsv, toPrinergyCsv, toSimpleRipCsv } from "../src/exporter.js";

test("projectArchive persists curve overrides for JSON restore", () => {
  const archive = projectArchive({
    jobId: "job-1",
    runId: "run-1",
    suggestedArchivePath: "jobs/job-1/runs/run-1.json",
    job: { customer: "Demo", press: "KBA" },
    standard: { id: "gracol2013_crpc6", name: "GRACoL2013 CRPC6" },
    iccProfile: { id: "icc-1", profileName: "Mock Press Profile", colorSpace: "CMYK", pcs: "Lab" },
    labReferenceSource: "ICC sampled reference (24 patches)",
    iccStandardPair: {
      status: "pass",
      labReference: { label: "Mock Press Profile", source: "imported-icc", sampledCount: 24 },
      toneTarget: { standardName: "GRACoL2013 CRPC6", targetName: "ISO B" },
      messages: ["paired"],
    },
    targetSnapshot: { name: "ISO B", points: [[50, 14]] },
    settings: { mode: "tvi" },
    diagnosis: { title: "Ready" },
    importInfo: { sourceFormat: "Manual", metadata: {}, fields: [], rawRows: [], warnings: [] },
    rawInput: "",
    manualRows: [],
    measurements: [],
    results: [{ channel: "C", tone: 50, outputTone: 43.5, autoOutputTone: 46, overrideLocked: true }],
    curveQuality: { status: "Warning", warnings: 1, dangers: 0, total: 1, message: "Curve warning" },
    curveSafety: [{ level: "warning", channel: "C", tone: 50, type: "折点突变", message: "C 50% risk" }],
    curveOverrides: { "C:50.000": { locked: true, outputTone: 43.5 } },
    labRows: [],
    g7: { status: "Data Incomplete" },
    generatedAt: "2026-05-16T00:00:00.000Z",
  });

  assert.equal(archive.curveOverrides["C:50.000"].outputTone, 43.5);
  assert.equal(archive.results[0].overrideLocked, true);
  assert.equal(archive.results[0].autoOutputTone, "46.00");
  assert.equal(archive.curveQuality.status, "Warning");
  assert.equal(archive.curveSafety[0].type, "折点突变");
  assert.equal(archive.iccProfile.profileName, "Mock Press Profile");
  assert.equal(archive.iccStandardPair.labReference.label, "Mock Press Profile");
});

test("RIP exports include curve quality metadata and row comments", () => {
  const context = {
    standard: { id: "gracol2013_crpc6", name: "GRACoL2013 CRPC6" },
    job: { customer: "Demo", press: "KBA", paper: "", device: "" },
    algorithm: "tvi",
    calculationFormula: "TVI",
    deltaFormula: "ΔE76",
    targetName: "ISO B",
    iccStandardPair: {
      labReference: { label: "Mock ICC" },
      toneTarget: { standardName: "GRACoL2013 CRPC6" },
    },
    compensationRatio: 50,
    measurementCondition: "M1",
    suggestedArchivePath: "jobs/demo/runs/run.json",
    curveQuality: summarizeCurveSafety([{ level: "warning", channel: "K", tone: 70, type: "折点突变", message: "K 70% kink" }]),
    curveSafety: [{ level: "warning", channel: "K", tone: 70, type: "折点突变", message: "K 70% kink" }],
  };
  const rows = [{ channel: "K", tone: 70, outputTone: 68.4, metricName: "TVI", metricMethod: "reported_tone" }];

  const simple = toSimpleRipCsv(rows, context);
  const prinergy = toPrinergyCsv(rows, context);

  assert.match(simple, /# curve_quality_status=Warning/);
  assert.match(simple, /# lab_reference=Mock ICC/);
  assert.match(simple, /# tone_target=GRACoL2013 CRPC6 \/ ISO B/);
  assert.match(simple, /channel,input,output,quality,comment/);
  assert.match(simple, /Warning,metric=TVI/);
  assert.match(prinergy, /折点突变:K 70% kink/);
});

test("G7 exports include verification, NPDC, gray balance and Lab sections", () => {
  const context = {
    generatedAt: "2026-05-18T00:00:00.000Z",
    standard: { id: "gracol2013_crpc6", name: "GRACoL2013 CRPC6" },
    job: { customer: "Demo", press: "KBA", paper: "Coated", device: "i1" },
    settings: { mode: "g7" },
    algorithm: "g7",
    calculationFormula: "G7",
    deltaFormula: "ΔE76",
    targetName: "G7 NPDC MVP",
    compensationRatio: 50,
    measurementCondition: "M1",
    suggestedArchivePath: "jobs/demo/runs/run.json",
    g7: {
      status: "Fail",
      kOnlyCount: 23,
      labPatchCount: 53,
      grayPatchCount: 21,
      p2pPatchCount: 300,
      maxDeltaE: 10.8,
      weightedAverage: 5.1,
      maxGrayCh: 14.8,
      maxNpdcDelta: 1.9,
      conclusion: {
        title: "G7 未通过，需修正后复测",
        summary: "灰平衡最大 Ch",
        priorityItems: ["Fail: 灰平衡最大 Ch"],
        recommendations: ["灰平衡 Ch 超限时，优先检查 CMY 中性灰。"],
      },
      missing: [],
      verificationRows: [{ item: "灰平衡最大 Ch", value: 14.8, tolerance: "Pass <=3 / Fail >6", status: "Fail", message: "超过失败阈值" }],
      completenessRows: [{ item: "K-only NPDC", count: 23, required: ">=5", status: "Pass" }],
      npdcRows: [{ tone: 50, measured: 64, target: 63, deltaTone: 1, deltaL: 2 }],
      grayBalanceRows: [{ label: "CMY Gray 50", a: 4, b: 5, chroma: 6.4, deltaE: 7 }],
    },
    labRows: [{ label: "C 100%", source: "Measurement", cmyk: { c: 100, m: 0, y: 0, k: 0 }, lab: { l: 55, a: -35, b: -50 }, referenceLab: { l: 56, a: -36, b: -51 }, deltaE: 1.7, status: "Pass" }],
  };

  const csv = toG7VerificationCsv(context);
  const json = g7ReportArchive(context);

  assert.match(csv, /# G7_SUMMARY/);
  assert.match(csv, /# G7_CONCLUSION/);
  assert.match(csv, /# G7_VERIFICATION/);
  assert.match(csv, /# G7_NPDC/);
  assert.match(csv, /# G7_GRAY_BALANCE/);
  assert.match(csv, /# LAB_DELTA_E/);
  assert.match(csv, /灰平衡最大 Ch/);
  assert.match(csv, /优先检查 CMY 中性灰/);
  assert.equal(json.type, "g7-verification-report");
  assert.equal(json.g7.status, "Fail");
});
