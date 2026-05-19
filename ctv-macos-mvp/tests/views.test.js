import assert from "node:assert/strict";
import test from "node:test";

import { statusText } from "../src/views/analysis.js";
import { visibleWarnings } from "../src/views/data.js";
import { renderInstrument } from "../src/views/instrument.js";
import { renderExport, renderReport, renderRuns } from "../src/views/shell.js";

function els(overrides = {}) {
  return {
    modeSelect: { value: "ctv" },
    targetSelect: { value: "linear" },
    deltaFormulaSelect: { value: "de2000" },
    ratioInput: { value: "50" },
    jobCustomerInput: { value: "Demo" },
    jobPressInput: { value: "KBA" },
    exportSummary: { innerHTML: "" },
    instrumentVerificationSummary: { innerHTML: "" },
    instrumentVerificationBody: { innerHTML: "" },
    reportSummary: { innerHTML: "" },
    reportG7Conclusion: { innerHTML: "" },
    reportLabSummary: { innerHTML: "" },
    reportCurveSummary: { innerHTML: "" },
    reportRunCompare: { innerHTML: "" },
    printReportButton: { disabled: false },
    runBody: { innerHTML: "" },
    runCompareSummary: { innerHTML: "" },
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    standard: { name: "GRACoL2013 CRPC6" },
    importInfo: { warnings: ["import warning"], metadata: {} },
    manualDirty: false,
    storageWarning: "",
    measurements: [],
    results: [],
    ...overrides,
  };
}

test("visibleWarnings keeps non-import warnings available after view split", () => {
  const warnings = visibleWarnings(state({
    manualDirty: true,
    storageWarning: "storage warning",
    results: [
      { metricName: "TVI fallback", metricMethod: "reported_tone" },
      { metricName: "TVI", metricMethod: "status_t_spectral" },
    ],
  }), els());

  assert.ok(warnings.some((item) => item.includes("手动测量表已修改")));
  assert.ok(warnings.some((item) => item.includes("CTV 模式需要")));
  assert.ok(warnings.some((item) => item.includes("ISO 5-3 Status-T 加权")));
  assert.ok(warnings.includes("storage warning"));
});

test("statusText and export summary use full shared warnings", () => {
  const localState = state({
    manualDirty: true,
    results: [{ metricName: "TVI fallback", metricMethod: "reported_tone" }],
  });
  const localEls = els();

  assert.match(statusText(localState, localEls), /手动测量表已修改/);

  renderExport(localState, localEls);

  assert.match(localEls.exportSummary.innerHTML, /手动测量表已修改/);
  assert.match(localEls.exportSummary.innerHTML, /ΔE2000/);
});

test("renderRuns compares latest run against previous run", () => {
  const localEls = els();
  const localState = state({
    runs: [
      {
        createdAt: "Run2",
        standard: "GRACoL",
        measurements: 10,
        results: 60,
        diagnosis: "复测",
        ratio: 45,
        avgTviDelta: 4,
        maxDeltaE: 3,
        storagePath: "jobs/demo/run2.json",
        g7Status: "Pass",
        g7ConclusionTitle: "G7 预检通过",
        g7PriorityItems: [],
        curveQualityStatus: "Ready",
        metrics: {
          avgTviDelta: 4,
          maxDeltaE: 3,
          g7Status: "Pass",
          g7ConclusionTitle: "G7 预检通过",
          g7PriorityItems: [],
          g7WeightedAverage: 1,
          g7MaxNpdcDelta: 2,
          g7MaxGrayCh: 2,
          curveWarnings: 0,
          curveDangers: 0,
          curveQualityStatus: "Ready",
          channelTvi: { C: 4, M: 4, Y: 4, K: 4 },
        },
      },
      {
        createdAt: "Run1",
        standard: "GRACoL",
        measurements: 10,
        results: 60,
        diagnosis: "初测",
        ratio: 45,
        avgTviDelta: 8,
        maxDeltaE: 5,
        storagePath: "jobs/demo/run1.json",
        g7Status: "Fail",
        g7ConclusionTitle: "G7 未通过，需修正后复测",
        g7PriorityItems: ["Fail: 灰平衡最大 Ch"],
        curveQualityStatus: "Warning",
        metrics: {
          avgTviDelta: 8,
          maxDeltaE: 5,
          g7Status: "Fail",
          g7ConclusionTitle: "G7 未通过，需修正后复测",
          g7PriorityItems: ["Fail: 灰平衡最大 Ch"],
          g7WeightedAverage: 3,
          g7MaxNpdcDelta: 6,
          g7MaxGrayCh: 4,
          curveWarnings: 2,
          curveDangers: 1,
          curveQualityStatus: "Warning",
          channelTvi: { C: 8, M: 8, Y: 8, K: 8 },
        },
      },
    ],
  });

  renderRuns(localState, localEls);

  assert.match(localEls.runCompareSummary.innerHTML, /平均 TVI 偏差/);
  assert.match(localEls.runCompareSummary.innerHTML, /8.00% -> 4.00%/);
  assert.match(localEls.runCompareSummary.innerHTML, /Fail -&gt; Pass/);
  assert.match(localEls.runCompareSummary.innerHTML, /G7 结论/);
  assert.match(localEls.runCompareSummary.innerHTML, /已解决: Fail: 灰平衡最大 Ch/);
  assert.match(localEls.runBody.innerHTML, /Ready/);
});

test("renderReport summarizes field report sections", () => {
  const localEls = els({
    jobPaperInput: { value: "Coated" },
    jobDeviceInput: { value: "X-Rite eXact" },
    jobOperatorInput: { value: "LB" },
    jobNoteInput: { value: "复测" },
  });
  const localState = state({
    standard: { name: "GRACoL2013 CRPC6" },
    measurements: [{ channel: "K", tone: 50, measuredTone: 66 }],
    results: [{ channel: "K", tone: 50, tviDelta: 4.5 }],
    diagnosis: { title: "生产可补偿", ratio: 50 },
    safetyIssues: [{ level: "warning", message: "中间调跳变" }],
    labRows: [
      { status: "Pass", deltaE: 1.2 },
      { status: "Fail", deltaE: 6.3 },
      { status: "Missing Target", deltaE: NaN },
    ],
    g7: {
      status: "Fail",
      weightedAverage: 2.8,
      maxDeltaE: 6.3,
      maxNpdcDelta: 1.9,
      maxGrayCh: 7.1,
      conclusion: {
        level: "danger",
        title: "G7 未通过，需修正后复测",
        summary: "Gray Ch",
        priorityItems: ["Fail: 灰平衡最大 Ch"],
        recommendations: ["复测灰平衡"],
      },
    },
    runs: [
      {
        createdAt: "Run2",
        metrics: { avgTviDelta: 3, maxDeltaE: 4, g7Status: "Warning", g7ConclusionTitle: "边界", g7PriorityItems: [], curveWarnings: 1, curveDangers: 0, curveQualityStatus: "Warning", channelTvi: { K: 3 } },
      },
      {
        createdAt: "Run1",
        metrics: { avgTviDelta: 7, maxDeltaE: 8, g7Status: "Fail", g7ConclusionTitle: "失败", g7PriorityItems: ["Fail: 灰平衡最大 Ch"], curveWarnings: 2, curveDangers: 1, curveQualityStatus: "Blocked", channelTvi: { K: 7 } },
      },
    ],
  });

  renderReport(localState, localEls);

  assert.match(localEls.reportSummary.innerHTML, /GRACoL2013 CRPC6|生产可补偿/);
  assert.match(localEls.reportG7Conclusion.innerHTML, /G7 未通过，需修正后复测/);
  assert.match(localEls.reportLabSummary.innerHTML, /最大 ΔE/);
  assert.match(localEls.reportCurveSummary.innerHTML, /曲线质量|平均 \|TVI\/CTV 偏差\|/);
  assert.match(localEls.reportRunCompare.innerHTML, /Run 对比|已解决/);
  assert.equal(localEls.printReportButton.disabled, false);
});

test("renderInstrument shows i1Pro cross verification rows", () => {
  const localEls = els();
  const localState = state({
    measurements: [
      { channel: "C", tone: 50, sampleId: "C50", sourceFormat: "X-Rite i1Pro CGATS", colorimetricTone: 50.2, colorimetricMethod: "iso_20654_lab", instrumentCtv: 49.9, instrumentCtvMethod: "ctv" },
      { channel: "M", tone: 50, sampleId: "M50", sourceFormat: "Techkon CSV", colorimetricTone: 52.2, colorimetricMethod: "iso_20654_lab" },
    ],
  });

  renderInstrument(localState, localEls);

  assert.match(localEls.instrumentVerificationSummary.innerHTML, /仪器交叉验证/);
  assert.match(localEls.instrumentVerificationSummary.innerHTML, /X-Rite i1Pro CGATS/);
  assert.match(localEls.instrumentVerificationBody.innerHTML, /C50/);
  assert.match(localEls.instrumentVerificationBody.innerHTML, /Missing Instrument CTV/);
});
