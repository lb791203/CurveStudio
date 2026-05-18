import {
  buildDiagnosticRows,
  calculateCompensation,
  parseImportText,
  targetSeries,
  toCgatsText,
  toCsv,
  toHarmonyCsv,
  upsertTarget,
} from "./curve-engine.js?v=20260518-report-view";
import { analyzeCurveSafety, buildLabVerificationRows, diagnosePress, g7Preview } from "./analysis-engine.js?v=20260518-report-view";
import { applyCurveOverrides, curveRowKey, pruneCurveOverrides } from "./curve-overrides.js";
import { buildSuggestedArchivePath, g7ReportArchive, projectArchive, summarizeCurveSafety, toG7VerificationCsv, toPrinergyCsv, toSimpleRipCsv, withExportHeader } from "./exporter.js?v=20260518-report-view";
import { renderStandard as _renderStandard, renderMeasurement as _renderMeasurement, targetName } from "./views/data.js";
import { renderAnalyze as _renderAnalyze, renderCurve as _renderCurve, renderG7 as _renderG7 } from "./views/analysis.js?v=20260518-report-view";
import { renderShell as _renderShell, renderControlValues as _renderControlValues, renderRuns as _renderRuns, renderExport as _renderExport, renderReport as _renderReport, renderSettings as _renderSettings } from "./views/shell.js?v=20260518-report-view";
import { inspectImport } from "./import-inspector.js";
import {
  canCalculateCurve,
  defaultManualRow,
  deleteManualRowFromEvent,
  enrichManualColorimetricRow,
  enrichManualDensityRow,
  labFromManual,
  labReferenceByChannel,
  manualRowsToCsv,
  manualTemplateRows,
  normalizeManualRow,
  paperDensityFromRows,
  parseManualPaste,
  renderManualTable as renderManualRowsTable,
  solidDensityByChannel,
  updateManualRowFromEvent,
} from "./manual-table.js";
import { clearStoredRuns, loadStoredRuns, saveRunsAndLastProject } from "./run-store.js";
import { buildRunMetrics } from "./run-compare.js?v=20260518-report-view";
import { STANDARD_LIBRARY, buildPatchMap, standardById, targetOptions } from "./standards.js";
import { algorithmDescription, deltaFormulaLabel } from "./ui-labels.js";

const els = {
  fileInput: document.querySelector("#fileInput"),
  rawInput: document.querySelector("#rawInput"),
  parseButton: document.querySelector("#parseButton"),
  calculateButton: document.querySelector("#calculateButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  exportHarmonyButton: document.querySelector("#exportHarmonyButton"),
  exportPrinergyButton: document.querySelector("#exportPrinergyButton"),
  exportSimpleRipButton: document.querySelector("#exportSimpleRipButton"),
  exportCgatsButton: document.querySelector("#exportCgatsButton"),
  exportG7CsvButton: document.querySelector("#exportG7CsvButton"),
  exportG7JsonButton: document.querySelector("#exportG7JsonButton"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  printReportButton: document.querySelector("#printReportButton"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  sampleSelect: document.querySelector("#sampleSelect"),
  addManualRowButton: document.querySelector("#addManualRowButton"),
  templateFieldButton: document.querySelector("#templateFieldButton"),
  template2575Button: document.querySelector("#template2575Button"),
  templateFullRampButton: document.querySelector("#templateFullRampButton"),
  templateG7Button: document.querySelector("#templateG7Button"),
  manualModeSelect: document.querySelector("#manualModeSelect"),
  insertManualModeButton: document.querySelector("#insertManualModeButton"),
  applyManualButton: document.querySelector("#applyManualButton"),
  clearManualButton: document.querySelector("#clearManualButton"),
  saveRunButton: document.querySelector("#saveRunButton"),
  clearRunsButton: document.querySelector("#clearRunsButton"),
  reloadStandardButton: document.querySelector("#reloadStandardButton"),
  applyCustomTargetButton: document.querySelector("#applyCustomTargetButton"),
  runG7Button: document.querySelector("#runG7Button"),
  modeSelect: document.querySelector("#modeSelect"),
  targetSelect: document.querySelector("#targetSelect"),
  standardSelect: document.querySelector("#standardSelect"),
  smoothInput: document.querySelector("#smoothInput"),
  smoothValue: document.querySelector("#smoothValue"),
  limitInput: document.querySelector("#limitInput"),
  ratioInput: document.querySelector("#ratioInput"),
  customTvi25Input: document.querySelector("#customTvi25Input"),
  customTvi50Input: document.querySelector("#customTvi50Input"),
  customTvi75Input: document.querySelector("#customTvi75Input"),
  sccaInput: document.querySelector("#sccaInput"),
  deltaFormulaSelect: document.querySelector("#deltaFormulaSelect"),
  manualBody: document.querySelector("#manualBody"),
  measurementChart: document.querySelector("#measurementChart"),
  curveChart: document.querySelector("#curveChart"),
  g7NpdcChart: document.querySelector("#g7NpdcChart"),
  g7GrayChart: document.querySelector("#g7GrayChart"),
  resultBody: document.querySelector("#resultBody"),
  ripEntryBody: document.querySelector("#ripEntryBody"),
  labBody: document.querySelector("#labBody"),
  runBody: document.querySelector("#runBody"),
  g7NpdcBody: document.querySelector("#g7NpdcBody"),
  g7GrayBody: document.querySelector("#g7GrayBody"),
  targetCurveBody: document.querySelector("#targetCurveBody"),
  standardPatchBody: document.querySelector("#standardPatchBody"),
  diagnosisCards: document.querySelector("#diagnosisCards"),
  diagnosisBadge: document.querySelector("#diagnosisBadge"),
  safetySummary: document.querySelector("#safetySummary"),
  curveAcceptanceSummary: document.querySelector("#curveAcceptanceSummary"),
  manualHealthSummary: document.querySelector("#manualHealthSummary"),
  importAuditSummary: document.querySelector("#importAuditSummary"),
  g7Cards: document.querySelector("#g7Cards"),
  standardSummary: document.querySelector("#standardSummary"),
  measurementSummary: document.querySelector("#measurementSummary"),
  exportSummary: document.querySelector("#exportSummary"),
  reportSummary: document.querySelector("#reportSummary"),
  reportG7Conclusion: document.querySelector("#reportG7Conclusion"),
  reportLabSummary: document.querySelector("#reportLabSummary"),
  reportCurveSummary: document.querySelector("#reportCurveSummary"),
  reportRunCompare: document.querySelector("#reportRunCompare"),
  desktopSummary: document.querySelector("#desktopSummary"),
  runCompareSummary: document.querySelector("#runCompareSummary"),
  statusText: document.querySelector("#statusText"),
  jobTitle: document.querySelector("#jobTitle"),
  jobMeta: document.querySelector("#jobMeta"),
  ctvModeWarning: document.querySelector("#ctvModeWarning"),
  jobCustomerInput: document.querySelector("#jobCustomerInput"),
  jobPressInput: document.querySelector("#jobPressInput"),
  jobPaperInput: document.querySelector("#jobPaperInput"),
  jobDeviceInput: document.querySelector("#jobDeviceInput"),
  jobOperatorInput: document.querySelector("#jobOperatorInput"),
  jobNoteInput: document.querySelector("#jobNoteInput"),
};

const state = {
  activeView: "job",
  importInfo: null,
  standardId: "gracol2013_crpc6",
  standard: standardById("gracol2013_crpc6"),
  standardImport: null,
  standardLoading: false,
  standardPatchMap: new Map(),
  manualRows: [],
  measurements: [],
  results: [],
  diagnosis: null,
  labRows: [],
  safetyIssues: [],
  g7: null,
  curveOverrides: {},
  runs: [],
  ratioAuto: true,
  manualDirty: false,
  storageWarning: "",
};

let kbaPresetCache = null;

initialize();

async function initialize() {
  populateSelects();
  loadRuns();
  attachEvents();
  await loadStandard("gracol2013_crpc6");
  render();
}

function attachEvents() {
  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewButton));
  });

  els.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    if (!confirmDataOverwrite("导入文件会覆盖当前手动表、导入数据和曲线结果，是否继续？")) {
      event.target.value = "";
      return;
    }
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json") && await restoreProjectFromText(text)) return;
    els.rawInput.value = text;
    parseAndCalculate({ skipConfirm: true });
  });

  els.parseButton.addEventListener("click", parseAndCalculate);
  els.calculateButton.addEventListener("click", () => calculate({ preserveRatio: true }));
  els.loadSampleButton.addEventListener("click", loadSelectedSample);
  els.addManualRowButton.addEventListener("click", addManualRow);
  els.templateFieldButton.addEventListener("click", () => addManualTemplate("field"));
  els.template2575Button.addEventListener("click", () => addManualTemplate("2575"));
  els.templateFullRampButton.addEventListener("click", () => addManualTemplate("full"));
  els.templateG7Button.addEventListener("click", () => addManualTemplate("g7"));
  els.insertManualModeButton.addEventListener("click", () => addManualTemplate(els.manualModeSelect.value));
  els.applyManualButton.addEventListener("click", applyManualRows);
  els.clearManualButton.addEventListener("click", clearManualRows);
  els.saveRunButton.addEventListener("click", saveRun);
  els.clearRunsButton.addEventListener("click", clearRuns);
  els.reloadStandardButton.addEventListener("click", () => loadStandard(els.standardSelect.value));
  els.applyCustomTargetButton.addEventListener("click", applyCustomTarget);
  els.runG7Button.addEventListener("click", () => {
    state.g7 = currentG7Preview();
    renderG7();
    switchView("g7");
  });
  els.exportCsvButton.addEventListener("click", () => download("ctv-compensation-curve.csv", withExportHeader(toCsv(state.results), exportContext()), "text/csv"));
  els.exportHarmonyButton.addEventListener("click", () => download("harmony-manual-entry.csv", withExportHeader(toHarmonyCsv(state.results), exportContext()), "text/csv"));
  els.exportPrinergyButton.addEventListener("click", () => download("prinergy-input-output.csv", toPrinergyCsv(state.results, exportContext()), "text/csv"));
  els.exportSimpleRipButton.addEventListener("click", () => download("rip-simple-input-output.csv", toSimpleRipCsv(state.results, exportContext()), "text/csv"));
  els.exportCgatsButton.addEventListener("click", () => download("ctv-compensation-curve.cgats.txt", withExportHeader(toCgatsText(state.results), exportContext()), "text/plain"));
  els.exportG7CsvButton.addEventListener("click", () => download("g7-verification-report.csv", toG7VerificationCsv(exportContext()), "text/csv"));
  els.exportG7JsonButton.addEventListener("click", () => download("g7-verification-report.json", JSON.stringify(g7ReportArchive(exportContext()), null, 2), "application/json"));
  els.exportJsonButton.addEventListener("click", () => download("ctv-project-export.json", JSON.stringify(projectArchive(exportContext()), null, 2), "application/json"));
  els.printReportButton.addEventListener("click", () => window.print());
  els.manualBody.addEventListener("input", updateManualCell);
  els.manualBody.addEventListener("change", updateManualCell);
  els.manualBody.addEventListener("click", deleteManualRow);
  els.manualBody.addEventListener("paste", pasteManualTable);
  els.resultBody.addEventListener("change", updateCurveOverride);
  els.resultBody.addEventListener("input", updateCurveOverride);
  els.standardSelect.addEventListener("change", () => loadStandard(els.standardSelect.value));
  els.sccaInput.addEventListener("change", () => calculate({ preserveRatio: true }));
  els.deltaFormulaSelect.addEventListener("change", () => calculate({ preserveRatio: true }));

  els.modeSelect.addEventListener("change", handleModeChange);
  for (const el of [els.targetSelect, els.smoothInput, els.limitInput]) {
    el.addEventListener("change", () => calculate({ preserveRatio: true }));
  }
  els.smoothInput.addEventListener("input", renderControlValues);
  els.ratioInput.addEventListener("change", () => {
    state.ratioAuto = false;
    calculate({ preserveRatio: true });
  });
}

function populateSelects() {
  els.targetSelect.innerHTML = targetOptions().map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  els.standardSelect.innerHTML = STANDARD_LIBRARY.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
}

function refreshTargetSelect(selected = els.targetSelect.value) {
  els.targetSelect.innerHTML = targetOptions().map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  els.targetSelect.value = selected;
}

async function loadStandard(id) {
  state.standardId = id;
  state.standard = standardById(id);
  state.standardImport = null;
  state.standardPatchMap = new Map();
  state.standardLoading = Boolean(state.standard.referencePath);
  els.standardSelect.value = state.standard.id;
  els.targetSelect.value = state.standard.target;
  renderStandard();

  if (state.standard.referencePath) {
    try {
      const response = await fetch(state.standard.referencePath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.standardImport = parseImportText(await response.text());
      state.standardPatchMap = buildPatchMap(state.standardImport.rawRows);
    } catch (error) {
      state.standardImport = { warnings: [`标准文件加载失败: ${error.message}`], rawRows: [] };
      state.standardPatchMap = new Map();
    }
  }

  state.standardLoading = false;
  calculate({ preserveRatio: true });
}

function parseAndCalculate(options = {}) {
  if (!options.skipConfirm && !confirmDataOverwrite("解析文本数据会覆盖当前手动表、导入数据和曲线结果，是否继续？")) return;
  state.importInfo = parseImportText(els.rawInput.value);
  state.measurements = state.importInfo.measurements;
  state.manualRows = [];
  state.manualDirty = false;
  state.curveOverrides = {};
  state.ratioAuto = true;
  calculate();
}

async function loadSelectedSample() {
  if (!confirmDataOverwrite("载入示例会覆盖当前手动表、导入数据和曲线结果，是否继续？")) return;
  const selected = els.sampleSelect.value;
  if (selected === "kba105" || selected === "kba162") {
    await loadManualPreset(selected);
    return;
  }
  const samplePaths = {
    sample: "./samples/sample-measurements.csv",
    ctvLab: "./samples/ctv-lab-demo.csv",
    p2p51: "./reference-data/measurements/g7-training/P2P51_2019-01-24_13h28_M1_3-2.txt",
    tc1617: "./reference-data/measurements/g7-training/G7_T1617_P2_1_M1.txt",
  };
  const response = await fetch(samplePaths[selected] || samplePaths.sample);
  els.rawInput.value = await response.text();
  parseAndCalculate({ skipConfirm: true });
  if (selected === "ctvLab") {
    els.modeSelect.value = "ctv";
    els.targetSelect.value = "linear";
    calculate({ preserveRatio: true });
    switchView("curve");
  }
  if (selected === "p2p51" || selected === "tc1617") {
    els.modeSelect.value = "g7";
    els.targetSelect.value = "g7";
    calculate({ preserveRatio: true });
    switchView("g7");
  }
}

async function loadManualPreset(key) {
  const preset = (await loadKbaPresets())[key];
  if (!preset) return;
  state.manualRows = kbaPresetRows(preset);
  state.manualDirty = false;
  state.curveOverrides = {};
  els.jobPressInput.value = preset.press;
  els.modeSelect.value = "tvi";
  els.targetSelect.value = state.standard.target || "isoB";
  state.ratioAuto = true;
  applyManualRows();
  switchView("curve");
}

async function loadKbaPresets() {
  if (kbaPresetCache) return kbaPresetCache;
  const response = await fetch("./samples/kba-presets.json");
  if (!response.ok) throw new Error(`KBA preset load failed: HTTP ${response.status}`);
  kbaPresetCache = await response.json();
  return kbaPresetCache;
}

function kbaPresetRows(preset) {
  return Object.entries(preset.channels || {}).flatMap(([channel, data]) => (
    (data.points || []).map(([tone, measuredTone]) => defaultManualRow({
      patchType: "tone",
      channel,
      tone,
      measuredTone,
      density: data.density ?? "",
      source: preset.source,
      note: "",
    }))
  ));
}

function addManualRow() {
  state.manualRows.push(defaultManualRow());
  markManualDirty();
  renderManualTable();
  renderMeasurement();
}

function addManualTemplate(type) {
  state.manualRows.push(...manualTemplateRows(type, "手动"));
  markManualDirty();
  renderManualTable();
  renderMeasurement();
  switchView("measurement");
}

function clearManualRows() {
  if (!confirmDataOverwrite("清空会删除当前手动表、导入数据和曲线结果，是否继续？")) return;
  state.manualRows = [];
  state.importInfo = null;
  state.measurements = [];
  state.results = [];
  state.manualDirty = false;
  state.curveOverrides = {};
  els.rawInput.value = "";
  calculate({ preserveRatio: true });
}

function applyManualRows() {
  const normalizedRows = state.manualRows.map(normalizeManualRow);
  const solidDensities = solidDensityByChannel(normalizedRows);
  const paperDensity = paperDensityFromRows(normalizedRows);
  const labReferences = labReferenceByChannel(normalizedRows);
  const curveRows = normalizedRows
    .map((row) => enrichManualDensityRow(row, solidDensities, paperDensity))
    .map((row) => enrichManualColorimetricRow(row, labReferences))
    .filter((row) => canCalculateCurve(row));

  state.importInfo = {
    sourceFormat: "Manual Table",
    metadata: {},
    fields: ["patch_type", "channel", "tone", "measured_tone", "density", "lab_l", "lab_a", "lab_b", "source", "note"],
    rawRows: curveRows,
    measurements: curveRows.map((row) => ({
      patchType: row.patchType,
      channel: row.channel,
      tone: row.tone,
      measuredTone: Number.isFinite(row.measuredTone) ? row.measuredTone : undefined,
      measuredToneMethod: row.measuredToneMethod,
      density: Number.isFinite(row.density) ? row.density : undefined,
      solidDensity: Number.isFinite(solidDensities[row.channel]) ? solidDensities[row.channel] : undefined,
      paperDensity: Number.isFinite(paperDensity) ? paperDensity : undefined,
      colorimetricTone: Number.isFinite(row.colorimetricTone) ? row.colorimetricTone : undefined,
      colorimetricMethod: row.colorimetricMethod,
      lab: labFromManual(row),
      source: row.source,
      note: row.note,
      sourceFormat: "Manual Table",
    })),
    warnings: [],
  };
  state.measurements = state.importInfo.measurements;
  state.manualDirty = false;
  state.curveOverrides = {};
  els.rawInput.value = manualRowsToCsv(state.manualRows.map(normalizeManualRow));
  calculate();
}

function calculate(options = {}) {
  const baseOptions = calculationOptions();
  const diagnosticRows = buildDiagnosticRows(state.measurements, baseOptions);
  const diagnosisOptions = { solidDensityRanges: state.standard.solidDensityRanges };
  const preDiagnosis = diagnosePress(diagnosticRows, diagnosisOptions);
  const effectiveRatio = state.ratioAuto && !options.preserveRatio && diagnosticRows.length
    ? preDiagnosis.ratio
    : Number(els.ratioInput.value);
  if (Number(els.ratioInput.value) !== effectiveRatio) els.ratioInput.value = effectiveRatio;
  const calculatedRows = calculateCompensation(state.measurements, {
    ...baseOptions,
    compensationRatio: effectiveRatio,
  });
  state.curveOverrides = pruneCurveOverrides(calculatedRows, state.curveOverrides);
  state.results = applyCurveOverrides(calculatedRows, state.curveOverrides);
  state.diagnosis = diagnosePress(state.results.length ? state.results : diagnosticRows, diagnosisOptions);
  state.labRows = buildLabVerificationRows({
    manualRows: state.manualRows,
    measurements: state.measurements,
    standardPatchMap: state.standardPatchMap,
    warning: state.standard.deltaE.warning,
    fail: state.standard.deltaE.fail,
    scca: els.sccaInput.checked,
    formula: els.deltaFormulaSelect.value,
  });
  state.safetyIssues = analyzeCurveSafety(state.results);
  state.g7 = currentG7Preview();
  render();
}

function calculationOptions() {
  return {
    mode: els.modeSelect.value,
    target: els.targetSelect.value,
    smooth: els.smoothInput.value,
    limit: els.limitInput.value,
  };
}

function handleModeChange() {
  els.ctvModeWarning.hidden = true;
  if (els.modeSelect.value === "ctv") {
    els.targetSelect.value = "linear";
    warnIfCtvWillFallback();
  }
  if (els.modeSelect.value === "g7") {
    els.targetSelect.value = "g7";
  }
  calculate({ preserveRatio: true });
}

function applyCustomTarget() {
  const t25 = clampNumber(Number(els.customTvi25Input.value), 0, 40, 12);
  const t50 = clampNumber(Number(els.customTvi50Input.value), 0, 40, 16);
  const t75 = clampNumber(Number(els.customTvi75Input.value), 0, 40, 12);
  upsertTarget("custom_tvi", {
    name: `自定义 TVI ${t25}/${t50}/${t75}`,
    points: [[0, 0], [25, t25], [50, t50], [75, t75], [100, 0]],
  });
  refreshTargetSelect("custom_tvi");
  calculate({ preserveRatio: true });
}

function render() {
  renderShell(state, els);
  renderStandard(state, els);
  renderMeasurement(state, els);
  renderManualTable();
  renderAnalyze(state, els);
  renderCurve(state, els);
  renderG7(state, els);
  renderRuns(state, els);
  renderExport(state, els);
  renderReport(state, els);
  renderSettings(state, els);
}

function renderShell() {
  _renderControlValues(els);
  _renderShell(state, els);
}

function renderControlValues() {
  _renderControlValues(els);
}

function renderStandard() {
  _renderStandard(state, els);
}

function renderMeasurement() {
  _renderMeasurement(state, els);
}

function renderManualTable() {
  renderManualRowsTable(els.manualBody, state.manualRows);
}

function renderAnalyze() {
  _renderAnalyze(state, els);
}

function renderCurve() {
  _renderCurve(state, els);
}

function renderG7() {
  _renderG7(state, els);
}

function renderRuns() {
  _renderRuns(state, els);
}

function renderExport() {
  _renderExport(state, els);
}

function renderReport() {
  _renderReport(state, els);
}

function renderSettings() {
  _renderSettings(state, els);
}

function exportContext() {
  const generatedAt = new Date().toISOString();
  const job = {
    customer: els.jobCustomerInput.value,
    press: els.jobPressInput.value,
    paper: els.jobPaperInput.value,
    device: els.jobDeviceInput.value,
    operator: els.jobOperatorInput.value,
    note: els.jobNoteInput.value,
  };
  const suggestedArchivePath = buildSuggestedArchivePath({ ...job, generatedAt });
  const pathParts = suggestedArchivePath.split("/");
  return {
    generatedAt,
    job,
    jobId: pathParts[1] || "job",
    runId: (pathParts.at(-1) || generatedAt).replace(/\.json$/, ""),
    suggestedArchivePath,
    standard: state.standard,
    targetSnapshot: {
      name: targetName(els.targetSelect.value),
      points: targetSeries(els.targetSelect.value).map((point) => [point.tone, point.value]),
    },
    settings: {
      mode: els.modeSelect.value,
      target: els.targetSelect.value,
      smooth: Number(els.smoothInput.value),
      limit: Number(els.limitInput.value),
      compensationRatio: Number(els.ratioInput.value),
      deltaFormula: els.deltaFormulaSelect.value,
      calculationFormula: algorithmDescription(els.modeSelect.value),
    },
    algorithm: els.modeSelect.value,
    calculationFormula: algorithmDescription(els.modeSelect.value),
    deltaFormula: deltaFormulaLabel(els.deltaFormulaSelect.value),
    targetName: targetName(els.targetSelect.value),
    compensationRatio: els.ratioInput.value,
    measurementCondition: state.importInfo?.metadata?.measurement_condition || "unspecified",
    diagnosis: state.diagnosis,
    curveQuality: summarizeCurveSafety(state.safetyIssues),
    curveSafety: state.safetyIssues,
    importInfo: state.importInfo,
    rawInput: els.rawInput.value,
    manualRows: state.manualRows,
    measurements: state.measurements,
    results: state.results,
    curveOverrides: state.curveOverrides,
    labRows: state.labRows,
    g7: state.g7,
  };
}

function download(filename, content, type) {
  if (!state.results.length && !filename.includes("project")) return;
  if (state.manualDirty && !filename.includes("project")) {
    window.alert("手动测量表已修改，请先点击「应用测量表」重新生成曲线后再导出。");
    return;
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function confirmDataOverwrite(message) {
  const hasExistingData = state.manualRows.length || state.measurements.length || state.results.length;
  return !hasExistingData || window.confirm(message);
}

function switchView(view) {
  state.activeView = view;
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll("[data-view-button]").forEach((item) => item.classList.toggle("active", item.dataset.viewButton === view));
}

function saveRun() {
  if (!state.results.length) return;
  if (state.manualDirty) {
    window.alert("手动测量表已修改，请先点击「应用测量表」重新生成曲线后再保存 Run。");
    return;
  }
  const context = exportContext();
  const archive = projectArchive(context);
  const metrics = buildRunMetrics({
    results: state.results,
    labRows: state.labRows,
    g7: state.g7,
    curveQuality: context.curveQuality,
  });
  const run = {
    createdAt: new Date().toLocaleString(),
    jobId: context.jobId,
    runId: context.runId,
    storagePath: context.suggestedArchivePath,
    standard: state.standard.name,
    measurements: state.measurements.length,
    results: state.results.length,
    diagnosis: state.diagnosis?.title || "",
    ratio: Number(els.ratioInput.value),
    avgTviDelta: metrics.avgTviDelta,
    maxTviDelta: metrics.maxTviDelta,
    avgDeltaE: metrics.avgDeltaE,
    maxDeltaE: metrics.maxDeltaE,
    g7Status: metrics.g7Status,
    g7ConclusionTitle: metrics.g7ConclusionTitle,
    g7ConclusionLevel: metrics.g7ConclusionLevel,
    g7ConclusionSummary: metrics.g7ConclusionSummary,
    g7PriorityItems: metrics.g7PriorityItems,
    g7WeightedAverage: metrics.g7WeightedAverage,
    g7MaxNpdcDelta: metrics.g7MaxNpdcDelta,
    g7MaxGrayCh: metrics.g7MaxGrayCh,
    curveQualityStatus: metrics.curveQualityStatus,
    curveWarnings: metrics.curveWarnings,
    curveDangers: metrics.curveDangers,
    metrics,
    archive,
  };
  const nextRuns = [run, ...state.runs].slice(0, 12);
  const saved = saveRunsAndLastProject(nextRuns, archive);
  if (!saved.ok) {
    state.storageWarning = saved.warning;
    if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(saved.warning);
    _renderRuns(state, els);
    _renderReport(state, els);
    return;
  }
  state.storageWarning = "";
  state.runs = nextRuns;
  _renderRuns(state, els);
  _renderReport(state, els);
  switchView("job");
}

function clearRuns() {
  state.runs = [];
  state.storageWarning = "";
  clearStoredRuns();
  _renderRuns(state, els);
  _renderReport(state, els);
}

function loadRuns() {
  state.runs = loadStoredRuns();
}

async function restoreProjectFromText(text) {
  let archive;
  try {
    archive = JSON.parse(text);
  } catch {
    return false;
  }
  if (!archive || (!archive.job && !archive.measurements && !archive.results)) return false;
  await restoreProjectArchive(archive);
  return true;
}

async function restoreProjectArchive(archive) {
  if (archive.targetSnapshot && archive.settings?.target && !targetOptions().some((item) => item.id === archive.settings.target)) {
    upsertTarget(archive.settings.target, archive.targetSnapshot);
    refreshTargetSelect(archive.settings.target);
  }
  if (archive.standard?.id) {
    await loadStandard(archive.standard.id);
  }
  els.jobCustomerInput.value = archive.job?.customer || "";
  els.jobPressInput.value = archive.job?.press || "";
  els.jobPaperInput.value = archive.job?.paper || "";
  els.jobDeviceInput.value = archive.job?.device || "";
  els.jobOperatorInput.value = archive.job?.operator || "";
  els.jobNoteInput.value = archive.job?.note || "";
  if (archive.settings) {
    els.modeSelect.value = archive.settings.mode || "tvi";
    els.targetSelect.value = archive.settings.target || els.targetSelect.value;
    els.smoothInput.value = archive.settings.smooth ?? els.smoothInput.value;
    els.limitInput.value = archive.settings.limit ?? els.limitInput.value;
    els.ratioInput.value = archive.settings.compensationRatio ?? els.ratioInput.value;
    els.deltaFormulaSelect.value = archive.settings.deltaFormula || els.deltaFormulaSelect.value;
  }
  state.manualRows = Array.isArray(archive.manualRows) ? archive.manualRows : [];
  state.measurements = Array.isArray(archive.measurements) ? archive.measurements : [];
  state.importInfo = archive.importInfo || {
    sourceFormat: "JSON Project",
    metadata: archive.measurementMetadata || {},
    fields: [],
    rawRows: [],
    measurements: state.measurements,
    warnings: [],
  };
  if (!state.importInfo.measurements?.length) state.importInfo.measurements = state.measurements;
  els.rawInput.value = archive.rawInput || "";
  state.manualDirty = false;
  state.ratioAuto = false;
  state.curveOverrides = archive.curveOverrides || {};
  calculate({ preserveRatio: true });
  switchView("job");
}

function currentImportAudit() {
  return inspectImport({
    importInfo: state.importInfo,
    measurements: state.measurements,
    results: state.results,
    mode: els.modeSelect.value,
  });
}

function currentG7Preview() {
  const audit = currentImportAudit();
  return g7Preview({
    measurements: state.measurements,
    results: state.results,
    labRows: state.labRows,
    rawRows: state.importInfo?.rawRows || [],
    metadata: state.importInfo?.metadata || {},
    importKind: audit.kind,
    tolerances: {
      ...(state.standard.g7 || {}),
      deltaEWeighted: state.standard.deltaE?.warning,
      deltaEMax: state.standard.deltaE?.fail ? Math.max(state.standard.deltaE.fail * 2, 8) : 8,
    },
  });
}

function warnIfCtvWillFallback() {
  if (!state.measurements.length) return;
  if (state.measurements.some((row) => Number.isFinite(row.colorimetricTone))) {
    els.ctvModeWarning.hidden = true;
    return;
  }
  const detail = state.manualDirty
    ? "手动表已有改动，请先点击「应用测量表」；如果仍缺纸白、实地和阶调 Lab/XYZ，CTV 会降级。"
    : "当前数据缺少纸白、实地和阶调 Lab/XYZ，CTV 模式会降级为 TVI fallback。";
  els.ctvModeWarning.textContent = `⚠ ${detail}`;
  els.ctvModeWarning.hidden = false;
}

function markManualDirty() {
  if (!state.results.length && !state.measurements.length) return;
  state.manualDirty = true;
}

function updateCurveOverride(event) {
  const target = event.target;
  const key = target?.dataset?.curveKey;
  const field = target?.dataset?.curveField;
  if (!key || !field) return;
  const row = state.results.find((item) => curveRowKey(item) === key);
  if (!row) return;
  if (field === "locked") {
    if (target.checked) {
      state.curveOverrides[key] = { locked: true, outputTone: row.outputTone };
    } else {
      delete state.curveOverrides[key];
    }
  }
  if (field === "outputTone") {
    const numericValue = Number(target.value);
    if (!Number.isFinite(numericValue)) return;
    const value = clampNumber(numericValue, 0, 100, row.outputTone);
    state.curveOverrides[key] = { locked: true, outputTone: value };
    const lockInput = target.closest("tr")?.querySelector("[data-curve-field='locked']");
    if (lockInput) lockInput.checked = true;
  }
  state.curveOverrides = pruneCurveOverrides(state.results, state.curveOverrides);
  state.results = applyCurveOverrides(state.results, state.curveOverrides);
  state.safetyIssues = analyzeCurveSafety(state.results);
  state.g7 = currentG7Preview();
  renderShell(state, els);
  _renderAnalyze(state, els);
  _renderCurve(state, els);
  _renderG7(state, els);
  _renderExport(state, els);
  _renderReport(state, els);
}

function updateManualCell(event) {
  if (!updateManualRowFromEvent(state.manualRows, event)) return;
  markManualDirty();
  renderShell(state, els);
  _renderMeasurement(state, els);
  _renderExport(state, els);
  _renderReport(state, els);
}

function deleteManualRow(event) {
  if (!deleteManualRowFromEvent(state.manualRows, event)) return;
  markManualDirty();
  renderManualTable();
  _renderMeasurement(state, els);
  _renderReport(state, els);
}

function pasteManualTable(event) {
  const text = event.clipboardData?.getData("text/plain");
  if (!text) return;
  const parsed = parseManualPaste(text);
  if (!parsed.length) return;
  event.preventDefault();
  const preview = formatPastePreview(parsed);
  if (!window.confirm(preview)) return;
  state.manualRows.push(...parsed);
  markManualDirty();
  renderManualTable();
  _renderMeasurement(state, els);
  _renderReport(state, els);
}

function formatPastePreview(rows) {
  const channelCounts = rows.reduce((acc, row) => {
    acc[row.channel || ""] = (acc[row.channel || ""] || 0) + 1;
    return acc;
  }, {});
  const samples = rows.slice(0, 6).map((row) => [
    row.patchType || "tone",
    row.channel || "C",
    row.tone || "",
    row.measuredTone ? `网点${row.measuredTone}` : "",
    row.density ? `密度${row.density}` : "",
    row.labL ? `Lab ${row.labL}/${row.labA || ""}/${row.labB || ""}` : "",
  ].filter(Boolean).join(" "));
  return [
    `识别到 ${rows.length} 行，将追加到手动测量表。`,
    `通道/色块: ${Object.entries(channelCounts).map(([channel, count]) => `${channel || "未填"} ${count}`).join("，")}`,
    "预览:",
    ...samples,
    rows.length > samples.length ? `... 还有 ${rows.length - samples.length} 行` : "",
    "是否继续？",
  ].filter(Boolean).join("\n");
}
