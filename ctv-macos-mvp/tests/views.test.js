import assert from "node:assert/strict";
import test from "node:test";

import { renderCurve, statusText } from "../src/views/analysis.js";
import { renderMeasurement, renderStandard, visibleWarnings } from "../src/views/data.js";
import { renderInstrument } from "../src/views/instrument.js";
import { renderExport, renderReport, renderRuns, renderShell } from "../src/views/shell.js";

function els(overrides = {}) {
  return {
    modeSelect: { value: "ctv" },
    targetSelect: { value: "linear" },
    deltaFormulaSelect: { value: "de2000" },
    ratioInput: { value: "50" },
    jobCustomerInput: { value: "Demo" },
    jobPressInput: { value: "KBA" },
    workflowContextToolbar: { hidden: false },
    jobTitle: { textContent: "" },
    jobMeta: { textContent: "" },
    diagnosisBadge: { textContent: "", className: "" },
    measurementSummary: { innerHTML: "" },
    standardSummary: { innerHTML: "" },
    targetCurveBody: { innerHTML: "" },
    standardPatchBody: { innerHTML: "" },
    iccProfileSummary: { innerHTML: "" },
    measurementPatchPreview: { innerHTML: "" },
    importAuditSummary: { innerHTML: "" },
    manualHealthSummary: { innerHTML: "" },
    exportSummary: { innerHTML: "" },
    instrumentVerificationSummary: { innerHTML: "" },
    instrumentVerificationBody: { innerHTML: "" },
    compensationSimulationSummary: { innerHTML: "" },
    compensationSimulationBody: { innerHTML: "" },
    deviceAdapterSelect: { value: "" },
    deviceConnectButton: { disabled: false },
    deviceDisconnectButton: { disabled: false },
    deviceCalibrateButton: { disabled: false },
    deviceReadPatchButton: { disabled: false },
    deviceAdapterSummary: { innerHTML: "" },
    deviceQueueBody: { innerHTML: "" },
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
    standardPatchMap: new Map(),
    importInfo: { warnings: ["import warning"], metadata: {} },
    manualDirty: false,
    manualRows: [],
    storageWarning: "",
    measurements: [],
    results: [],
    runs: [],
    device: {
      adapterId: "file",
      connected: false,
      calibrated: false,
      queue: [],
      queueIndex: 0,
      message: "",
    },
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

test("renderMeasurement shows unloaded file prompt and patch empty state", () => {
  const localEls = els();
  renderMeasurement(state({ importInfo: null }), localEls);

  assert.match(localEls.measurementSummary.innerHTML, /未加载文件/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /测量文件色块预览/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /未加载测量文件/);
});

test("renderMeasurement renders patch preview from imported raw rows", () => {
  const localEls = els();
  renderMeasurement(state({
    importInfo: {
      sourceFormat: "CGATS",
      warnings: [],
      metadata: {},
      rawRows: [
        { sample_id: "PAPER", cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 95, lab_a: 0, lab_b: -2 },
        { sample_id: "C50", cmyk_c: 50, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 70, lab_a: -25, lab_b: -35 },
      ],
    },
    measurements: [{ channel: "C", tone: 50 }],
  }), localEls);

  assert.match(localEls.measurementSummary.innerHTML, /来源: CGATS/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /2 个色块/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /对应色彩导表/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /分类\/用途/);
  assert.equal((localEls.measurementPatchPreview.innerHTML.match(/patch-swatch/g) || []).length, 2);
  assert.match(localEls.measurementPatchPreview.innerHTML, /C50/);
});

test("renderMeasurement lays P2P coordinate patches as a compact target guide", () => {
  const localEls = els();
  const rawRows = [];
  for (let row = 0; row < 25; row += 1) {
    const rowName = String.fromCharCode(65 + row);
    for (let column = 1; column <= 12; column += 1) {
      rawRows.push({
        sample_name: `${rowName}${column}`,
        cmyk_c: (column % 4) * 25,
        cmyk_m: (row % 5) * 20,
        cmyk_y: (column % 3) * 35,
        cmyk_k: row === 0 ? 0 : Math.min(100, row * 4),
        lab_l: 95 - row,
        lab_a: column - 6,
        lab_b: row - 12,
      });
    }
  }

  renderMeasurement(state({
    importInfo: {
      sourceFormat: "CGATS/IT8",
      warnings: [],
      metadata: {},
      rawRows,
    },
    measurements: [{ channel: "K", tone: 50 }],
  }), localEls);

  assert.match(localEls.measurementPatchPreview.innerHTML, /300 个色块 \/ 12 列 x 25 行/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /按导表坐标显示/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /--patch-cols: 12/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /点击色块查看数值/);
  assert.equal((localEls.measurementPatchPreview.innerHTML.match(/data-patch-index=/g) || []).length, 300);
  assert.doesNotMatch(localEls.measurementPatchPreview.innerHTML, /open>/);
});

test("renderMeasurement marks selected patch and shows inspector values", () => {
  const localEls = els();
  renderMeasurement(state({
    importInfo: {
      sourceFormat: "CGATS",
      warnings: [],
      metadata: {},
      rawRows: [
        { sample_name: "A1", cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 95, lab_a: 0, lab_b: -2 },
        { sample_name: "B1", cmyk_c: 50, cmyk_m: 25, cmyk_y: 0, cmyk_k: 0, lab_l: 70, lab_a: -25, lab_b: -35 },
      ],
    },
    selectedPatchIndex: 1,
    measurements: [{ channel: "C", tone: 50 }],
  }), localEls);

  assert.match(localEls.measurementPatchPreview.innerHTML, /class="patch-swatch[^"]* selected"/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /aria-pressed="true"/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /当前色块 B1/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /50.00 \/ 25.00 \/ 0.00 \/ 0.00/);
  assert.match(localEls.measurementPatchPreview.innerHTML, /70.00 \/ -25.00 \/ -35.00/);
});

test("renderStandard shows imported ICC metadata as color reference", () => {
  const localEls = els({ targetSelect: { value: "isoA" } });
  renderStandard(state({
    standard: {
      name: "GRACoL2013 CRPC6",
      printCondition: "CGATS21-2 CRPC6",
      target: "isoA",
      deltaE: { warning: 3.5, fail: 4.2 },
      g7: { enabled: true, npdcAverage: 1.5, npdcMax: 3, grayAverage: 1.5, grayMax: 3 },
    },
    iccProfile: {
      profileName: "Mock Press Profile",
      fileName: "mock.icc",
      deviceClass: "output",
      colorSpace: "CMYK",
      pcs: "Lab",
      version: "4.3.0",
      renderingIntent: "relative",
      mediaWhitePoint: { l: 95.2, a: 0.1, b: -2.1 },
      tagCount: 3,
    },
  }), localEls);

  assert.match(localEls.standardSummary.innerHTML, /Lab Reference/);
  assert.match(localEls.standardSummary.innerHTML, /Tone Target/);
  assert.match(localEls.standardSummary.innerHTML, /Mock Press Profile/);
  assert.match(localEls.iccProfileSummary.innerHTML, /Mock Press Profile/);
  assert.match(localEls.iccProfileSummary.innerHTML, /TVI\/CTV\/G7 目标仍需单独选择/);
});

test("renderStandard shows ICC characterization sampled preview", () => {
  const localEls = els({ targetSelect: { value: "isoA" } });
  renderStandard(state({
    standard: {
      name: "GRACoL2013 CRPC6",
      printCondition: "CGATS21-2 CRPC6",
      target: "isoA",
      deltaE: { warning: 3.5, fail: 4.2 },
      g7: { enabled: true, npdcAverage: 1.5, npdcMax: 3, grayAverage: 1.5, grayMax: 3 },
    },
    iccProfile: {
      profileName: "Mock Press Profile",
      fileName: "mock.icc",
      deviceClass: "output",
      colorSpace: "CMYK",
      pcs: "Lab",
      version: "4.3.0",
      renderingIntent: "relative",
      mediaWhitePoint: { l: 95.2, a: 0.1, b: -2.1 },
      tagCount: 4,
      characterization: {
        status: "sampled",
        sourceTag: "A2B1",
        transformType: "mft2",
        reason: "已用 A2B1 / mft2 采样 2 个参考色块。",
        sampledCount: 2,
        patchCount: 2,
        capabilities: { a2b: ["A2B1:mft2"], b2a: [], hasChromaticAdaptation: true },
        rows: [
          { name: "Paper", group: "paper", cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 95, a: 0, b: -2 }, source: "ICC sampled reference" },
          { name: "C50", group: "single-channel-ramp", cmyk: { c: 50, m: 0, y: 0, k: 0 }, lab: { l: 70, a: -25, b: -35 }, source: "ICC sampled reference" },
        ],
      },
    },
  }), localEls);

  assert.match(localEls.iccProfileSummary.innerHTML, /ICC Characterization Preview/);
  assert.match(localEls.iccProfileSummary.innerHTML, /A2B1/);
  assert.match(localEls.iccProfileSummary.innerHTML, /mft2/);
  assert.match(localEls.iccProfileSummary.innerHTML, /ICC sampled reference/);
  assert.equal((localEls.iccProfileSummary.innerHTML.match(/icc-preview-swatch/g) || []).length, 2);
});

test("renderShell keeps workflow context in the bottom status bar", () => {
  const localEls = els({
    statusBar: { innerHTML: "" },
    saveRunButton: { disabled: false },
    exportCsvButton: { disabled: false },
    exportHarmonyButton: { disabled: false },
    exportPrinergyButton: { disabled: false },
    exportSimpleRipButton: { disabled: false },
    exportCgatsButton: { disabled: false },
    exportG7CsvButton: { disabled: false },
    exportG7JsonButton: { disabled: false },
    exportJsonButton: { disabled: false },
    calculateButton: { disabled: false },
    applyManualButton: { disabled: false },
    clearManualButton: { disabled: false },
  });

  renderShell(state({ activeView: "standard" }), localEls);
  assert.equal(localEls.workflowContextToolbar.hidden, true);
  assert.match(localEls.statusBar.innerHTML, /未加载测量数据/);

  renderShell(state({ activeView: "curve", measurements: [{ channel: "K", measuredTone: 50 }] }), localEls);
  assert.equal(localEls.workflowContextToolbar.hidden, true);
  assert.match(localEls.jobTitle.textContent, /KBA 测量任务/);
  assert.doesNotMatch(localEls.statusBar.innerHTML, /KBA 测量任务/);
  assert.match(localEls.statusBar.innerHTML, /KBA/);
  assert.match(localEls.statusBar.innerHTML, /等待诊断/);
});

test("statusText and export summary use full shared warnings", () => {
  const localState = state({
    manualDirty: true,
    results: [{ metricName: "TVI fallback", metricMethod: "reported_tone" }],
    selectedJobKey: "job-a",
    runs: [
      { jobKey: "job-a", jobName: "客户A KBA105", createdAt: "Run1", standard: "GRACoL", measurements: 60, results: 60 },
    ],
  });
  const localEls = els();

  assert.match(statusText(localState, localEls), /手动测量表已修改/);

  renderExport(localState, localEls);

  assert.match(localEls.exportSummary.innerHTML, /手动测量表已修改/);
  assert.match(localEls.exportSummary.innerHTML, /ΔE2000/);
  assert.match(localEls.exportSummary.innerHTML, /Job 档案/);
  assert.match(localEls.exportSummary.innerHTML, /客户A KBA105/);
});

test("renderCurve channel filter preserves filtered row override keys", () => {
  const localEls = els({
    resultBody: { innerHTML: "" },
    ripEntryBody: { innerHTML: "" },
    curveAcceptanceSummary: { innerHTML: "" },
    compensationSimulationSummary: { innerHTML: "" },
    compensationSimulationBody: { innerHTML: "" },
    measurementChart: { innerHTML: "" },
    curveChart: { innerHTML: "" },
    safetySummary: { innerHTML: "" },
    statusText: { textContent: "" },
  });
  const baseRow = {
    tone: 50,
    measuredTone: 65,
    targetTone: 60,
    measuredTvi: 15,
    targetTvi: 10,
    tviDelta: 5,
    theoreticalCorrection: -5,
    compensationRatio: 50,
    theoreticalOutputTone: 45,
    productionOutputTone: 47.5,
    correction: -2.5,
    outputTone: 47.5,
    metricName: "TVI",
    metricMethod: "reported_tone",
  };
  const localState = state({
    activeCurveChannel: "K",
    results: [
      { ...baseRow, channel: "C", autoOutputTone: 46 },
      { ...baseRow, channel: "K", autoOutputTone: 47.5 },
    ],
    safetyIssues: [],
  });

  renderCurve(localState, localEls);

  assert.doesNotMatch(localEls.resultBody.innerHTML, /data-curve-key="C:50\.000"/);
  assert.match(localEls.resultBody.innerHTML, /data-curve-key="K:50\.000"/);
  assert.match(localEls.resultBody.innerHTML, />K</);
  assert.match(localEls.compensationSimulationSummary.innerHTML, /模拟验证/);
});

test("renderCurve keeps RIP acceptance table focused on review rows", () => {
  const localEls = els({
    resultBody: { innerHTML: "" },
    ripEntryBody: { innerHTML: "" },
    curveAcceptanceSummary: { innerHTML: "" },
    compensationSimulationSummary: { innerHTML: "" },
    compensationSimulationBody: { innerHTML: "" },
    measurementChart: { innerHTML: "" },
    curveChart: { innerHTML: "" },
    safetySummary: { innerHTML: "" },
    statusText: { textContent: "" },
  });
  const baseRow = {
    measuredTone: 50,
    targetTone: 50,
    measuredTvi: 0,
    targetTvi: 0,
    tviDelta: 0,
    theoreticalCorrection: 0,
    compensationRatio: 50,
    theoreticalOutputTone: 0,
    productionOutputTone: 0,
    correction: 0,
    metricName: "CTV",
    metricMethod: "iso_20654_lab",
  };
  const localState = state({
    activeCurveChannel: "all",
    results: [
      { ...baseRow, channel: "K", tone: 50, outputTone: 50, measuredTone: 50, targetTone: 50 },
      { ...baseRow, channel: "K", tone: 75, outputTone: 75.7, measuredTone: 73, targetTone: 75, correction: 0.7 },
    ],
    safetyIssues: [],
  });

  renderCurve(localState, localEls);

  assert.doesNotMatch(localEls.ripEntryBody.innerHTML, /50\.00%/);
  assert.match(localEls.ripEntryBody.innerHTML, /75\.00%/);
  assert.match(localEls.ripEntryBody.innerHTML, /增加点/);
});

test("renderRuns compares latest run against previous run", () => {
  const localEls = els({ jobRunList: { innerHTML: "" } });
  const localState = state({
    runs: [
      {
        jobKey: "job-a",
        jobName: "Demo KBA",
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
        jobKey: "job-a",
        jobName: "Demo KBA",
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
  assert.match(localEls.jobRunList.innerHTML, /data-run-open-index="0"/);
  assert.match(localEls.jobRunList.innerHTML, /data-job-select-key="job-a"/);
  assert.match(localEls.jobRunList.innerHTML, /data-job-export-key="job-a"/);
  assert.match(localEls.jobRunList.innerHTML, /data-job-rename-key="job-a"/);
  assert.match(localEls.jobRunList.innerHTML, /data-job-delete-key="job-a"/);
  assert.match(localEls.runBody.innerHTML, /data-run-delete-index="1"/);
});

test("renderRuns shows renamed Run names in cards and table rows", () => {
  const localEls = els({ jobRunList: { innerHTML: "" } });
  renderRuns(state({
    runs: [{
      jobKey: "job-a",
      jobName: "客户A KBA105",
      name: "客户A KBA105 第一次",
      createdAt: "Run1",
      standard: "GRACoL",
      measurements: 60,
      results: 60,
      diagnosis: "生产可补偿",
      ratio: 45,
      avgTviDelta: 2,
      maxDeltaE: 4,
      storagePath: "jobs/a/run1.json",
      g7Status: "Warning",
      curveQualityStatus: "Ready",
    }],
  }), localEls);

  assert.match(localEls.jobRunList.innerHTML, /客户A KBA105/);
  assert.match(localEls.runBody.innerHTML, /客户A KBA105 第一次/);
});

test("renderRuns groups multiple runs under one job card", () => {
  const localEls = els({ jobRunList: { innerHTML: "" } });
  renderRuns(state({
    runs: [
      { jobKey: "job-a", jobName: "客户A KBA105", name: "第二次", createdAt: "Run2", standard: "GRACoL", measurements: 60, results: 60, ratio: 45, avgTviDelta: 3, maxDeltaE: 4, g7Status: "Pass", curveQualityStatus: "Ready" },
      { jobKey: "job-a", jobName: "客户A KBA105", name: "第一次", createdAt: "Run1", standard: "GRACoL", measurements: 60, results: 60, ratio: 45, avgTviDelta: 6, maxDeltaE: 5, g7Status: "Fail", curveQualityStatus: "Warning" },
      { jobKey: "job-b", jobName: "客户B KBA162", name: "第一次", createdAt: "Run1", standard: "GRACoL", measurements: 60, results: 60, ratio: 50, avgTviDelta: 2, maxDeltaE: 3, g7Status: "Warning", curveQualityStatus: "Ready" },
    ],
  }), localEls);

  assert.match(localEls.jobRunList.innerHTML, /客户A KBA105/);
  assert.match(localEls.jobRunList.innerHTML, /2 次 Run/);
  assert.match(localEls.jobRunList.innerHTML, /客户B KBA162/);
  assert.equal((localEls.jobRunList.innerHTML.match(/job-run-card/g) || []).length, 2);
});

test("renderRuns filters run table to selected job", () => {
  const localEls = els({ jobRunList: { innerHTML: "" } });
  renderRuns(state({
    selectedJobKey: "job-b",
    runs: [
      { jobKey: "job-a", jobName: "客户A KBA105", name: "A 第一次", createdAt: "Run A", standard: "GRACoL", measurements: 60, results: 60, ratio: 45, avgTviDelta: 3, maxDeltaE: 4, g7Status: "Pass", curveQualityStatus: "Ready" },
      { jobKey: "job-b", jobName: "客户B KBA162", name: "B 第一次", createdAt: "Run B", standard: "GRACoL", measurements: 60, results: 60, ratio: 50, avgTviDelta: 2, maxDeltaE: 3, g7Status: "Warning", curveQualityStatus: "Ready" },
    ],
  }), localEls);

  assert.match(localEls.jobRunList.innerHTML, /当前只显示作业/);
  assert.match(localEls.jobRunList.innerHTML, /data-job-clear-filter/);
  assert.match(localEls.jobRunList.innerHTML, /job-run-card active/);
  assert.match(localEls.runBody.innerHTML, /B 第一次/);
  assert.doesNotMatch(localEls.runBody.innerHTML, /A 第一次/);
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
  assert.match(localEls.reportSummary.innerHTML, /作业库/);
  assert.match(localEls.reportG7Conclusion.innerHTML, /G7 未通过，需修正后复测/);
  assert.match(localEls.reportLabSummary.innerHTML, /最大 ΔE/);
  assert.match(localEls.reportCurveSummary.innerHTML, /曲线质量|平均 \|TVI\/CTV 偏差\|/);
  assert.match(localEls.reportRunCompare.innerHTML, /已解决/);
  assert.doesNotMatch(localEls.reportRunCompare.innerHTML, /<strong>Run 对比/);
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

  assert.match(localEls.deviceAdapterSummary.innerHTML, /文件导入/);
  assert.match(localEls.instrumentVerificationSummary.innerHTML, /仪器 \/ 厂商 CTV 对照/);
  assert.match(localEls.instrumentVerificationSummary.innerHTML, /X-Rite i1Pro CGATS/);
  assert.match(localEls.instrumentVerificationBody.innerHTML, /C50/);
  assert.match(localEls.instrumentVerificationBody.innerHTML, /Missing Instrument CTV/);
});

test("renderInstrument shows DeviceAdapter queue state", () => {
  const localEls = els();
  renderInstrument(state({
    manualRows: [{ source: "仪器测量" }],
    device: {
      adapterId: "mock",
      connected: true,
      calibrated: true,
      queue: [
        { patchType: "paper", channel: "Paper", tone: "", label: "纸白" },
        { patchType: "tone", channel: "C", tone: 50, label: "C 50%" },
      ],
      queueIndex: 1,
      message: "模拟设备已连接",
    },
  }), localEls);

  assert.equal(localEls.deviceAdapterSelect.value, "mock");
  assert.equal(localEls.deviceConnectButton.disabled, true);
  assert.equal(localEls.deviceReadPatchButton.disabled, false);
  assert.match(localEls.deviceAdapterSummary.innerHTML, /队列: 1\/2/);
  assert.match(localEls.deviceAdapterSummary.innerHTML, /仪器测量点: 1/);
  assert.match(localEls.deviceQueueBody.innerHTML, /C 50%/);
  assert.match(localEls.deviceQueueBody.innerHTML, /当前/);
});
