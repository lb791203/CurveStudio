import {
  buildDiagnosticRows,
  calculateCompensation,
  parseImportText,
  targetSeries,
  toCgatsText,
  toCsv,
  toHarmonyCsv,
  upsertTarget,
} from "./curve-engine.js?v=20260521-icc-p4";
import { analyzeCurveSafety, buildLabVerificationRows, diagnosePress, g7Preview } from "./analysis-engine.js?v=20260522-g7-verify";
import { applyCurveOverrides, curveRowKey, pruneCurveOverrides } from "./curve-overrides.js";
import { buildSuggestedArchivePath, g7ReportArchive, projectArchive, summarizeCurveSafety, toG7VerificationCsv, toPrinergyCsv, toSimpleRipCsv, withExportHeader } from "./exporter.js?v=20260524-standards-runs";
import { renderStandard as _renderStandard, renderMeasurement as _renderMeasurement, targetName } from "./views/data.js?v=20260524-tone-tolerance-note";
import { renderAnalyze as _renderAnalyze, renderCurve as _renderCurve, renderG7 as _renderG7 } from "./views/analysis.js?v=20260525-statusbar-pass-1";
import { renderInstrument as _renderInstrument } from "./views/instrument.js?v=20260521-icc-p4";
import { renderShell as _renderShell, renderControlValues as _renderControlValues, renderRuns as _renderRuns, renderExport as _renderExport, renderReport as _renderReport, renderSettings as _renderSettings } from "./views/shell.js?v=20260602-audit-report-print-1";
import { buildG7Compensation } from "./g7-compensation.js";
import { renderCurveChart, renderMeasurementChart, renderLabChromaticityChart, renderG7Charts, renderCompensationSimulationChart } from "./chart-renderer.js?v=20260523-lab-fill";
import { buildIccGenerationGate } from "./icc-generation-gate.js?v=20260525-statusbar-pass-1";
import { DEVICE_ADAPTERS, buildMeasurementQueue, buildSdkMeasurementRow, calibrateDeviceState, changeDeviceAdapterState, connectDeviceState, disconnectDeviceState, readDevicePatchState, sdkDeviceLabel, isTauriAvailable } from "./device-adapter.js";
import { inspectImport } from "./import-inspector.js?v=20260525-statusbar-pass-1";
import { buildIccStandardPair } from "./icc-pairing.js?v=20260521-icc-p4";
import { parseIccProfile } from "./icc-profile.js?v=20260521-icc-p4";
import { openTextFileDesktop, saveTextFileDesktop, saveBinaryFileDesktop } from "./desktop-io.js";
import { buildIccExportPackage, exportMeasurementToCgats } from "./icc-generator.js";
import { t, updateDomTranslations, getLanguage, setLanguage } from "./translations.js";
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
import { clearStoredProject, compactProjectArchiveForRun, loadLastProject, loadStoredRuns, saveLastProject, saveRunsAndLastProject, saveStoredRuns } from "./run-store.js?v=20260524-clear-current-run";
import { buildCompensationSimulation } from "./compensation-simulation.js";
import { buildRunMetrics } from "./run-compare.js?v=20260521-icc-p4";
import { STANDARD_LIBRARY, addOrUpdateCustomStandard, buildPatchMap, cmykKey, isCustomStandard, makeCustomStandard, removeCustomStandard, setCustomStandards, standardById, targetOptions } from "./standards.js?v=20260524-standards-files";
import { algorithmDescription, deltaFormulaLabel } from "./ui-labels.js";
import { auditMeasurementCsv } from "./audit-report.js";

const CUSTOM_STANDARDS_KEY = "ctv-custom-standards";
const HIDDEN_STANDARDS_KEY = "ctv-hidden-standards";

const els = {
  fileInput: document.querySelector("#fileInput"),
  desktopOpenFileButton: document.querySelector("#desktopOpenFileButton"),
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
  exportJobArchiveButton: document.querySelector("#exportJobArchiveButton"),
  exportJobLibraryButton: document.querySelector("#exportJobLibraryButton"),
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
  standardIccInput: document.querySelector("#standardIccInput"),
  customStandardFileInput: document.querySelector("#customStandardFileInput"),
  saveCustomStandardButton: document.querySelector("#saveCustomStandardButton"),
  exportStandardButton: document.querySelector("#exportStandardButton"),
  deleteCustomStandardButton: document.querySelector("#deleteCustomStandardButton"),
  restoreStandardListButton: document.querySelector("#restoreStandardListButton"),
  applyCustomTargetButton: document.querySelector("#applyCustomTargetButton"),
  runG7Button: document.querySelector("#runG7Button"),
  generateG7CompensationButton: document.querySelector("#generateG7CompensationButton"),
  modeSelect: document.querySelector("#modeSelect"),
  targetSelect: document.querySelector("#targetSelect"),
  standardSelect: document.querySelector("#standardSelect"),
  toneToleranceNote: document.querySelector("#toneToleranceNote"),
  smoothInput: document.querySelector("#smoothInput"),
  smoothValue: document.querySelector("#smoothValue"),
  limitInput: document.querySelector("#limitInput"),
  ratioInput: document.querySelector("#ratioInput"),
  customTvi25Input: document.querySelector("#customTvi25Input"),
  customTvi50Input: document.querySelector("#customTvi50Input"),
  customTvi75Input: document.querySelector("#customTvi75Input"),
  g7EnabledInput: document.querySelector("#g7EnabledInput"),
  g7NpdcAverageInput: document.querySelector("#g7NpdcAverageInput"),
  g7NpdcMaxInput: document.querySelector("#g7NpdcMaxInput"),
  g7GrayAverageInput: document.querySelector("#g7GrayAverageInput"),
  g7GrayMaxInput: document.querySelector("#g7GrayMaxInput"),
  g7GrayInflectionInput: document.querySelector("#g7GrayInflectionInput"),
  sccaInput: document.querySelector("#sccaInput"),
  deltaFormulaSelect: document.querySelector("#deltaFormulaSelect"),
  settingsModeSelect: document.querySelector("#settingsModeSelect"),
  settingsTargetSelect: document.querySelector("#settingsTargetSelect"),
  settingsSmoothInput: document.querySelector("#settingsSmoothInput"),
  settingsLimitInput: document.querySelector("#settingsLimitInput"),
  settingsRatioInput: document.querySelector("#settingsRatioInput"),
  settingsDensityFilterSelect: document.querySelector("#settingsDensityFilterSelect"),
  settingsDeltaWarningInput: document.querySelector("#settingsDeltaWarningInput"),
  settingsDeltaFailInput: document.querySelector("#settingsDeltaFailInput"),
  settingsSccaInput: document.querySelector("#settingsSccaInput"),
  settingsMeasurementConditionSelect: document.querySelector("#settingsMeasurementConditionSelect"),
  settingsIlluminantSelect: document.querySelector("#settingsIlluminantSelect"),
  settingsObserverSelect: document.querySelector("#settingsObserverSelect"),
  settingsDeviceAdapterSelect: document.querySelector("#settingsDeviceAdapterSelect"),
  settingsQueueProfileSelect: document.querySelector("#settingsQueueProfileSelect"),
  settingsRequireG7Input: document.querySelector("#settingsRequireG7Input"),
  applySettingsButton: document.querySelector("#applySettingsButton"),
  resetSettingsButton: document.querySelector("#resetSettingsButton"),
  manualBody: document.querySelector("#manualBody"),
  measurementChart: document.querySelector("#measurementChart"),
  curveChart: document.querySelector("#curveChart"),
  labChromaticityChart: document.querySelector("#labChromaticityChart"),
  g7CmyNpdcChart: document.querySelector("#g7CmyNpdcChart"),
  g7NpdcChart: document.querySelector("#g7NpdcChart"),
  g7GrayChart: document.querySelector("#g7GrayChart"),
  g7WeightedChart: document.querySelector("#g7WeightedChart"),
  resultBody: document.querySelector("#resultBody"),
  compensationSimulationSummary: document.querySelector("#compensationSimulationSummary"),
  compensationSimulationChart: document.querySelector("#compensationSimulationChart"),
  compensationSimulationBody: document.querySelector("#compensationSimulationBody"),
  labBody: document.querySelector("#labBody"),
  labDetailBody: document.querySelector("#labDetailBody"),
  labDetailSummary: document.querySelector("#labDetailSummary"),
  verificationChecklistSummary: document.querySelector("#verificationChecklistSummary"),
  verificationChecklistBody: document.querySelector("#verificationChecklistBody"),
  jobRunList: document.querySelector("#jobRunList"),
  runBody: document.querySelector("#runBody"),
  g7NpdcBody: document.querySelector("#g7NpdcBody"),
  g7GrayBody: document.querySelector("#g7GrayBody"),
  g7NpdcVerificationBody: document.querySelector("#g7NpdcVerificationBody"),
  g7GrayVerificationBody: document.querySelector("#g7GrayVerificationBody"),
  g7ColorspaceBody: document.querySelector("#g7ColorspaceBody"),
  g7NpdcSummary: document.querySelector("#g7NpdcSummary"),
  g7GraySummary: document.querySelector("#g7GraySummary"),
  g7CmySummary: document.querySelector("#g7CmySummary"),
  g7KNpdcSummary: document.querySelector("#g7KNpdcSummary"),
  g7GrayChartSummary: document.querySelector("#g7GrayChartSummary"),
  g7WeightedSummary: document.querySelector("#g7WeightedSummary"),
  g7CompensationSummary: document.querySelector("#g7CompensationSummary"),
  g7CompensationBody: document.querySelector("#g7CompensationBody"),
  targetCurveBody: document.querySelector("#targetCurveBody"),
  toneToleranceBody: document.querySelector("#toneToleranceBody"),
  standardPatchBody: document.querySelector("#standardPatchBody"),
  iccProfileSummary: document.querySelector("#iccProfileSummary"),
  diagnosisCards: document.querySelector("#diagnosisCards"),
  diagnosisBadge: document.querySelector("#diagnosisBadge"),
  safetySummary: document.querySelector("#safetySummary"),
  manualHealthSummary: document.querySelector("#manualHealthSummary"),
  importAuditSummary: document.querySelector("#importAuditSummary"),
  g7Cards: document.querySelector("#g7Cards"),
  g7PanelButtons: document.querySelectorAll("[data-g7-panel-button]"),
  g7ChartGrid: document.querySelector("#g7ChartGrid"),
  g7QuickTablesSection: document.querySelector("#g7QuickTablesSection"),
  g7CompensationSection: document.querySelector("#g7CompensationSection"),
  g7CertificationSummarySection: document.querySelector("#g7CertificationSummarySection"),
  g7CertificationTablesSection: document.querySelector("#g7CertificationTablesSection"),
  g7ColorspaceSection: document.querySelector("#g7ColorspaceSection"),
  standardSummary: document.querySelector("#standardSummary"),
  measurementSummary: document.querySelector("#measurementSummary"),
  measurementPatchPreview: document.querySelector("#measurementPatchPreview"),
  instrumentVerificationSummary: document.querySelector("#instrumentVerificationSummary"),
  instrumentVerificationBody: document.querySelector("#instrumentVerificationBody"),
  deviceAdapterSelect: document.querySelector("#deviceAdapterSelect"),
  deviceConnectButton: document.querySelector("#deviceConnectButton"),
  deviceDisconnectButton: document.querySelector("#deviceDisconnectButton"),
  deviceCalibrateButton: document.querySelector("#deviceCalibrateButton"),
  deviceReadPatchButton: document.querySelector("#deviceReadPatchButton"),
  deviceAdapterSummary: document.querySelector("#deviceAdapterSummary"),
  deviceQueueBody: document.querySelector("#deviceQueueBody"),
  exportSummary: document.querySelector("#exportSummary"),
  reportSummary: document.querySelector("#reportSummary"),
  reportAuditComparison: document.querySelector("#reportAuditComparison"),
  reportG7Conclusion: document.querySelector("#reportG7Conclusion"),
  reportLabSummary: document.querySelector("#reportLabSummary"),
  reportCurveSummary: document.querySelector("#reportCurveSummary"),
  reportIccGate: document.querySelector("#reportIccGate"),
  reportRunCompare: document.querySelector("#reportRunCompare"),
  desktopSummary: document.querySelector("#desktopSummary"),
  runCompareSummary: document.querySelector("#runCompareSummary"),
  statusText: document.querySelector("#statusText"),
  statusBar: document.querySelector("#statusBar"),
  workflowContextToolbar: document.querySelector("#workflowContextToolbar"),
  jobTitle: document.querySelector("#jobTitle"),
  jobMeta: document.querySelector("#jobMeta"),
  ctvModeWarning: document.querySelector("#ctvModeWarning"),
  jobCustomerInput: document.querySelector("#jobCustomerInput"),
  jobPressInput: document.querySelector("#jobPressInput"),
  jobPaperInput: document.querySelector("#jobPaperInput"),
  jobDeviceInput: document.querySelector("#jobDeviceInput"),
  jobOperatorInput: document.querySelector("#jobOperatorInput"),
  jobNoteInput: document.querySelector("#jobNoteInput"),
  textPromptDialog: document.querySelector("#textPromptDialog"),
  textPromptTitle: document.querySelector("#textPromptTitle"),
  textPromptInput: document.querySelector("#textPromptInput"),
  textPromptOkButton: document.querySelector("#textPromptOkButton"),
  textPromptCancelButton: document.querySelector("#textPromptCancelButton"),
  helpCenterButton: document.querySelector("#helpCenterButton"),
  aboutButton: document.querySelector("#aboutButton"),
  settingsUpdateButton: document.querySelector("#settingsUpdateButton"),
  settingsHelpButton: document.querySelector("#settingsHelpButton"),
  settingsAboutButton: document.querySelector("#settingsAboutButton"),
  productInfoDialog: document.querySelector("#productInfoDialog"),
  productInfoCloseButton: document.querySelector("#productInfoCloseButton"),
  productInfoTabs: document.querySelectorAll("[data-product-info-tab]"),
  productInfoPanels: document.querySelectorAll("[data-product-info-panel]"),
  checkUpdateButton: document.querySelector("#checkUpdateButton"),
  updateStatusText: document.querySelector("#updateStatusText"),
  generateIccProfileButton: document.querySelector("#generateIccProfileButton"),
  exportIccReferenceButton: document.querySelector("#exportIccReferenceButton"),
  langToggle: document.querySelector("#langToggle"),
};

const state = {
  activeView: "measurement",
  importInfo: null,
  standardId: "gracol2013_crpc6",
  standard: standardById("gracol2013_crpc6"),
  standardImport: null,
  standardLoading: false,
  standardPatchMap: new Map(),
  hiddenStandardIds: new Set(),
  iccProfile: null,
  manualRows: [],
  measurements: [],
  results: [],
  diagnosis: null,
  labRows: [],
  safetyIssues: [],
  g7: null,
  g7Compensation: null,
  activeG7Panel: "overview",
  curveOverrides: {},
  runs: [],
  ratioAuto: true,
  manualDirty: false,
  storageWarning: "",
  activeCurveChannel: "all",
  selectedPatchIndex: null,
  selectedJobKey: "",
  auditReport: null,
  lastSavedRunSignature: "",
  settings: {
    densityFilter: "status_t",
    measurementCondition: "auto",
    illuminant: "D50",
    observer: "2",
    deviceAdapterId: "file",
    queueProfile: "g7",
    requireG7ForIcc: true,
  },
  device: {
    adapterId: "file",
    connected: false,
    calibrated: false,
    queueProfile: "g7",
    queue: buildMeasurementQueue("g7"),
    queueIndex: 0,
    message: "",
  },
};

let kbaPresetCache = null;

initialize();

async function initialize() {
  // Initialize theme from localStorage
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
    const icon = document.getElementById("themeIcon");
    if (icon) icon.innerHTML = "&#x2600;"; // Sun
  }

  // Initialize language from localStorage (default to "zh")
  const savedLang = localStorage.getItem("lang") || "zh";
  updateDomTranslations(savedLang);

  loadCustomStandards();
  loadHiddenStandards();
  populateSelects();
  loadRuns();
  attachEvents();
  await loadStandard("gracol2013_crpc6");
  if (!await restoreLastProjectDraft()) {
    render();
  }
}

function attachEvents() {
  // Bind theme toggle event
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isDark = document.body.classList.toggle("dark-theme");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      const icon = document.getElementById("themeIcon");
      if (icon) {
        icon.innerHTML = isDark ? "&#x2600;" : "&#x263E;";
      }
      
      // Redraw charts
      if (state.results.length) {
        const filtered = state.activeCurveChannel && state.activeCurveChannel !== "all"
          ? state.results.filter((row) => row.channel === state.activeCurveChannel)
          : state.results;
        renderCurveChart(els.curveChart, filtered, state.safetyIssues);
        renderMeasurementChart(els.measurementChart, state.results, targetSeries(els.targetSelect.value), els.modeSelect.value);
      }
      if (state.labRows.length) {
        renderLabChromaticityChart(els.labChromaticityChart, state.labRows);
      }
      if (state.g7) {
        renderG7Charts({
          npdcChart: els.g7NpdcChart,
          grayChart: els.g7GrayChart,
          cmyNpdcChart: els.g7CmyNpdcChart,
          weightedChart: els.g7WeightedChart,
        }, state.g7, targetSeries("g7"));
      }
    });
  }

  // Bind curve chart dragging events
  els.curveChart?.addEventListener("mousedown", handleCurveDragStart);
  els.compensationSimulationChart?.addEventListener("mousedown", handleCurveDragStart);
  window.addEventListener("mousemove", handleCurveDragMove);
  window.addEventListener("mouseup", handleCurveDragEnd);

  // Bind chart hover tooltips events
  [els.curveChart, els.measurementChart].forEach((svg) => {
    if (svg) {
      svg.addEventListener("mousemove", handleMouseMove);
      svg.addEventListener("mouseleave", hideHover);
    }
  });

  document.querySelectorAll("[data-step-button]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.stepButton));
  });

  document.querySelectorAll("[data-sub-view-button]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.subViewButton));
  });

  els.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json") && await restoreProjectFromText(text)) {
      event.target.value = "";
      return;
    }
    importMeasurementText(text, { sourceName: file.name });
    event.target.value = "";
  });

  els.parseButton.addEventListener("click", parseAndCalculate);
  els.desktopOpenFileButton?.addEventListener("click", openWithDesktopDialog);
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
  els.standardIccInput?.addEventListener("change", importStandardIcc);
  els.customStandardFileInput?.addEventListener("change", importCustomStandardFile);
  els.saveCustomStandardButton?.addEventListener("click", saveCustomStandard);
  els.exportStandardButton?.addEventListener("click", exportCurrentStandard);
  els.deleteCustomStandardButton?.addEventListener("click", deleteOrHideStandard);
  els.restoreStandardListButton?.addEventListener("click", restoreStandardList);
  els.applyCustomTargetButton.addEventListener("click", applyCustomTarget);
  els.runG7Button.addEventListener("click", () => {
    state.g7 = currentG7Preview();
    state.activeG7Panel = "overview";
    renderG7();
    switchView("g7");
  });
  els.generateG7CompensationButton?.addEventListener("click", () => {
    state.g7 = currentG7Preview();
    state.g7Compensation = currentG7Compensation();
    state.activeG7Panel = "compensation";
    renderG7();
    renderReport();
    switchView("g7");
  });
  els.deviceAdapterSelect?.addEventListener("change", changeDeviceAdapter);
  els.deviceConnectButton?.addEventListener("click", connectDevice);
  els.deviceDisconnectButton?.addEventListener("click", disconnectDevice);
  els.deviceCalibrateButton?.addEventListener("click", calibrateDevice);
  els.deviceReadPatchButton?.addEventListener("click", readDevicePatch);
  els.exportCsvButton.addEventListener("click", () => download("ctv-compensation-curve.csv", withExportHeader(toCsv(state.results), exportContext()), "text/csv"));
  els.exportHarmonyButton.addEventListener("click", () => download("rip-manual-entry.csv", withExportHeader(toHarmonyCsv(state.results), exportContext()), "text/csv"));
  els.exportPrinergyButton.addEventListener("click", () => download("rip-input-output.csv", toPrinergyCsv(state.results, exportContext()), "text/csv"));
  els.exportSimpleRipButton.addEventListener("click", () => download("rip-simple-input-output.csv", toSimpleRipCsv(state.results, exportContext()), "text/csv"));
  els.exportCgatsButton.addEventListener("click", () => download("ctv-compensation-curve.cgats.txt", withExportHeader(toCgatsText(state.results), exportContext()), "text/plain"));
  els.exportG7CsvButton.addEventListener("click", () => download("g7-verification-report.csv", toG7VerificationCsv(exportContext()), "text/csv"));
  els.exportG7JsonButton.addEventListener("click", () => download("g7-verification-report.json", JSON.stringify(g7ReportArchive(exportContext()), null, 2), "application/json"));
  els.exportJsonButton.addEventListener("click", () => download("ctv-project-export.json", JSON.stringify(projectArchive(exportContext()), null, 2), "application/json"));
  els.generateIccProfileButton?.addEventListener("click", () => {
    const gate = currentIccGenerationGate(state.runs);
    if (gate.status !== "Ready") {
      const reasons = gate.checks
        .filter((check) => check.status === "fail" && check.required !== false)
        .map((check) => `- ${check.label}: ${check.message}`)
        .join("\n");
      window.alert(`${t("icc_gate_blocked_alert", "ICC 生成闸门未通过，不能生成 ICC。")}\n\n${gate.status}: ${gate.summary}\n${reasons || ""}`);
      return;
    }
    try {
      const pkg = buildIccExportPackage(gate, state.runs, {
        standard: state.standard,
        measurementCondition: state.runs?.[0]?.archive?.measurementCondition || measurementConditionForExport(),
        jobCustomer: els.jobCustomerInput.value,
        jobPress: els.jobPressInput.value,
        jobId: state.runs?.[0]?.jobId,
      });
      downloadBinary(pkg.filename, pkg.iccBuffer, "application/octet-stream", { allowWithoutResults: true, skipManualDirty: true });
      download(pkg.metadataFilename, JSON.stringify(pkg.metadata, null, 2), "application/json", { allowWithoutResults: true, skipManualDirty: true });
    } catch (err) {
      window.alert(err.message || err);
    }
  });
  els.exportIccReferenceButton?.addEventListener("click", () => {
    const latestRun = state.runs?.[0];
    if (!latestRun) {
      window.alert(t("icc_no_run", "没有已保存的 Run，无法导出测量数据。"));
      return;
    }
    try {
      const txt = exportMeasurementToCgats(latestRun);
      download("icc-scattered-measurements.latest-run.cgats.txt", txt, "text/plain", { allowWithoutResults: true, skipManualDirty: true });
    } catch (err) {
      window.alert(err.message || err);
    }
  });
  els.langToggle?.addEventListener("click", () => {
    const lang = getLanguage() === "zh" ? "en" : "zh";
    localStorage.setItem("lang", lang);
    updateDomTranslations(lang);
    switchView(state.activeView);
    populateSelects();
    render();
  });
  els.helpCenterButton?.addEventListener("click", () => openProductInfo("help"));
  els.aboutButton?.addEventListener("click", () => openProductInfo("about"));
  els.settingsHelpButton?.addEventListener("click", () => openProductInfo("help"));
  els.settingsAboutButton?.addEventListener("click", () => openProductInfo("about"));
  els.settingsUpdateButton?.addEventListener("click", () => openProductInfo("updates"));
  els.productInfoCloseButton?.addEventListener("click", closeProductInfo);
  els.productInfoDialog?.addEventListener("click", (event) => {
    if (event.target === els.productInfoDialog) closeProductInfo();
  });
  els.productInfoTabs?.forEach((button) => {
    button.addEventListener("click", () => setProductInfoTab(button.dataset.productInfoTab));
  });
  els.checkUpdateButton?.addEventListener("click", () => {
    setProductInfoTab("updates");
    if (els.updateStatusText) {
      els.updateStatusText.textContent = "当前版本 0.1.12；在线更新服务尚未启用。市场版将通过应用市场更新，官网版后续接入检查更新。";
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.productInfoDialog?.hidden) closeProductInfo();
  });
  els.exportJobArchiveButton?.addEventListener("click", exportSelectedJobArchive);
  els.exportJobLibraryButton?.addEventListener("click", exportJobLibraryArchive);
  els.printReportButton.addEventListener("click", () => window.print());
  els.manualBody.addEventListener("input", updateManualCell);
  els.manualBody.addEventListener("change", updateManualCell);
  els.manualBody.addEventListener("click", deleteManualRow);
  els.manualBody.addEventListener("paste", pasteManualTable);
  els.resultBody.addEventListener("change", updateCurveOverride);
  els.resultBody.addEventListener("input", updateCurveOverride);
  els.resultBody.addEventListener("keydown", handleCurveOutputKeydown);
  els.toneToleranceBody?.addEventListener("input", updateStandardToleranceFromUi);
  els.toneToleranceBody?.addEventListener("change", updateStandardToleranceFromUi);
  els.jobRunList.addEventListener("click", restoreRunFromList);
  els.runBody.addEventListener("click", restoreRunFromList);
  els.measurementPatchPreview?.addEventListener("click", selectMeasurementPatch);

  document.querySelectorAll(".channel-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".channel-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.activeCurveChannel = tab.dataset.channel || "all";
      _renderCurve(state, els);
    });
  });
  els.g7PanelButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeG7Panel = button.dataset.g7PanelButton || "overview";
      renderG7();
    });
  });
  els.standardSelect.addEventListener("change", () => loadStandard(els.standardSelect.value));
  for (const input of g7ToleranceInputs()) {
    input.addEventListener("change", updateG7TolerancesFromUi);
    input.addEventListener("input", updateG7TolerancesFromUi);
  }
  els.sccaInput.addEventListener("change", () => calculate({ preserveRatio: true }));
  els.deltaFormulaSelect.addEventListener("change", () => calculate({ preserveRatio: true }));
  els.applySettingsButton?.addEventListener("click", applySettingsToCalculation);
  els.resetSettingsButton?.addEventListener("click", resetSettingsDefaults);

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

function openProductInfo(tab = "help") {
  setProductInfoTab(tab);
  if (els.productInfoDialog) els.productInfoDialog.hidden = false;
  setTimeout(() => {
    const activeTab = [...(els.productInfoTabs || [])].find((button) => button.classList.contains("active"));
    activeTab?.focus();
  }, 0);
}

function closeProductInfo() {
  if (els.productInfoDialog) els.productInfoDialog.hidden = true;
}

function setProductInfoTab(tab = "help") {
  const selected = ["help", "updates", "about"].includes(tab) ? tab : "help";
  els.productInfoTabs?.forEach((button) => {
    const active = button.dataset.productInfoTab === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  els.productInfoPanels?.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.productInfoPanel === selected);
  });
}

function populateSelects() {
  els.targetSelect.innerHTML = targetOptions().map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  if (els.settingsTargetSelect) els.settingsTargetSelect.innerHTML = targetOptions().map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  els.standardSelect.innerHTML = visibleStandardLibrary().map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  if (els.deviceAdapterSelect) els.deviceAdapterSelect.innerHTML = DEVICE_ADAPTERS.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  if (els.settingsDeviceAdapterSelect) els.settingsDeviceAdapterSelect.innerHTML = DEVICE_ADAPTERS.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
}

function visibleStandardLibrary() {
  const visible = STANDARD_LIBRARY.filter((item) => !state.hiddenStandardIds.has(item.id));
  return visible.length ? visible : STANDARD_LIBRARY;
}

function firstVisibleStandardId(fallback = "gracol2013_crpc6") {
  return visibleStandardLibrary()[0]?.id || fallback;
}

function refreshTargetSelect(selected = els.targetSelect.value) {
  els.targetSelect.innerHTML = targetOptions().map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  els.targetSelect.value = selected;
  if (els.settingsTargetSelect) {
    els.settingsTargetSelect.innerHTML = targetOptions().map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
    els.settingsTargetSelect.value = selected;
  }
}

function loadCustomStandards() {
  try {
    const items = JSON.parse(localStorage.getItem(CUSTOM_STANDARDS_KEY) || "[]");
    setCustomStandards(Array.isArray(items) ? items : []);
  } catch {
    setCustomStandards([]);
  }
}

function loadHiddenStandards() {
  try {
    const ids = JSON.parse(localStorage.getItem(HIDDEN_STANDARDS_KEY) || "[]");
    state.hiddenStandardIds = new Set(Array.isArray(ids) ? ids : []);
  } catch {
    state.hiddenStandardIds = new Set();
  }
}

function persistHiddenStandards() {
  try {
    localStorage.setItem(HIDDEN_STANDARDS_KEY, JSON.stringify([...state.hiddenStandardIds]));
    return true;
  } catch (error) {
    window.alert(`标准列表保存失败：${error.message || error}`);
    return false;
  }
}

function persistCustomStandards(items) {
  try {
    localStorage.setItem(CUSTOM_STANDARDS_KEY, JSON.stringify(items));
    return true;
  } catch (error) {
    window.alert(`自定义标准保存失败：${error.message || error}`);
    return false;
  }
}

async function loadStandard(id) {
  state.standardId = id;
  state.standard = cloneData(standardById(id));
  state.standardImport = null;
  state.standardPatchMap = new Map();
  state.iccProfile = null;
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

async function importStandardIcc(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const profile = parseIccProfile(await file.arrayBuffer(), { fileName: file.name });
    state.iccProfile = profile;
    state.standard = {
      ...state.standard,
      iccReference: {
        id: profile.id,
        fileName: profile.fileName,
        profileName: profile.profileName,
        colorSpace: profile.colorSpace,
        pcs: profile.pcs,
        deviceClass: profile.deviceClass,
      },
    };
    if (state.measurements.length || state.manualRows.length) {
      calculate({ preserveRatio: true });
    } else {
      renderStandard();
      renderExport();
      renderReport();
    }
  } catch (error) {
    state.iccProfile = {
      fileName: file.name,
      profileName: "ICC 导入失败",
      source: "icc-metadata",
      error: error.message,
      importedAt: new Date().toISOString(),
    };
    renderStandard();
  } finally {
    event.target.value = "";
  }
}

async function saveCustomStandard() {
  const id = isCustomStandard(state.standard?.id) ? state.standard.id : undefined;
  const name = isCustomStandard(state.standard?.id) ? state.standard.name : `${state.standard.name} 自定义`;
  const custom = makeCustomStandard(state.standard, {
    id,
    name,
    printCondition: state.standard.printCondition,
    target: els.targetSelect.value || state.standard.target,
  });
  const items = addOrUpdateCustomStandard(custom);
  if (!persistCustomStandards(items)) return;
  populateSelects();
  await loadStandard(custom.id);
}

async function importCustomStandardFile(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const source = parsed?.standard && typeof parsed.standard === "object" ? parsed.standard : parsed;
    if (!source || typeof source !== "object") throw new Error("文件内容不是有效的标准 JSON。");
    const importedId = String(source.id || "").trim();
    const keepImportedId = importedId.startsWith("custom_") && !STANDARD_LIBRARY.some((item) => item.id === importedId && !isCustomStandard(importedId));
    const custom = makeCustomStandard(source, {
      id: keepImportedId ? importedId : undefined,
      name: source.name || file.name.replace(/\.json$/i, ""),
      printCondition: source.printCondition,
      target: source.target,
    });
    const items = addOrUpdateCustomStandard(custom);
    if (!persistCustomStandards(items)) return;
    populateSelects();
    await loadStandard(custom.id);
  } catch (error) {
    window.alert(`标准文件导入失败：${error.message || error}`);
  } finally {
    event.target.value = "";
  }
}

async function exportCurrentStandard() {
  if (!state.standard?.id) return;
  const exportStandard = {
    ...state.standard,
    exportedAt: new Date().toISOString(),
    fileType: "CurveStudio standard",
  };
  const filename = `${slug(state.standard.name || "curvestudio-standard")}.standard.json`;
  await download(filename, JSON.stringify(exportStandard, null, 2), "application/json", {
    allowWithoutResults: true,
    skipManualDirty: true,
  });
}

async function deleteOrHideStandard() {
  if (!state.standard?.id) return;
  const name = state.standard.name;
  if (isCustomStandard(state.standard.id)) {
    if (!window.confirm(`删除自定义标准「${name}」？`)) return;
    const items = removeCustomStandard(state.standard.id);
    if (!persistCustomStandards(items)) return;
  } else {
    if (!window.confirm(`从列表隐藏内置标准「${name}」？可用「恢复标准列表」找回。`)) return;
    state.hiddenStandardIds.add(state.standard.id);
    if (!persistHiddenStandards()) return;
  }
  populateSelects();
  await loadStandard(firstVisibleStandardId());
}

async function restoreStandardList() {
  state.hiddenStandardIds = new Set();
  if (!persistHiddenStandards()) return;
  populateSelects();
  await loadStandard(state.standard?.id || firstVisibleStandardId());
}

function updateStandardToleranceFromUi(event) {
  const target = event.target;
  if (target?.matches?.("[data-tone-tolerance]")) {
    const channel = target.dataset.channel;
    const metric = target.dataset.metric;
    const tone = target.dataset.tone;
    const value = Number(target.value);
    if (!channel || !metric || !tone || !Number.isFinite(value)) return;
    state.standard = {
      ...state.standard,
      toneTolerances: {
        ...(state.standard.toneTolerances || {}),
        [channel]: {
          ...(state.standard.toneTolerances?.[channel] || {}),
          [metric]: {
            ...(state.standard.toneTolerances?.[channel]?.[metric] || {}),
            [tone]: value,
          },
        },
      },
    };
    renderExport();
    renderReport();
    return;
  }
  if (target?.matches?.("[data-channel-target]")) {
    const channel = target.dataset.channelTarget;
    if (!channel) return;
    state.standard = {
      ...state.standard,
      channelTargets: {
        ...(state.standard.channelTargets || {}),
        [channel]: target.value,
      },
    };
    renderStandard();
    renderExport();
    renderReport();
  }
}

function g7ToleranceInputs() {
  return [
    els.g7EnabledInput,
    els.g7NpdcAverageInput,
    els.g7NpdcMaxInput,
    els.g7GrayAverageInput,
    els.g7GrayMaxInput,
    els.g7GrayInflectionInput,
  ].filter(Boolean);
}

function updateG7TolerancesFromUi() {
  state.standard.g7 = {
    enabled: els.g7EnabledInput?.checked !== false,
    npdcAverage: inputNumber(els.g7NpdcAverageInput, 1.5),
    npdcMax: inputNumber(els.g7NpdcMaxInput, 3),
    grayAverage: inputNumber(els.g7GrayAverageInput, 1.5),
    grayMax: inputNumber(els.g7GrayMaxInput, 3),
    grayInflection: els.g7GrayInflectionInput?.value || "",
  };
  state.g7 = currentG7Preview();
  renderStandard();
  renderG7();
  renderExport();
  renderReport();
}

function inputNumber(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseAndCalculate(options = {}) {
  if (!options.skipConfirm && !confirmDataOverwrite(t("confirm_parse_overwrite", "解析文本数据会替换当前工作区数据。"))) return;
  if (!options.preserveAuditReport) state.auditReport = null;
  state.importInfo = parseImportText(els.rawInput.value, { densityFilter: state.settings.densityFilter });
  state.measurements = state.importInfo.measurements;
  state.manualRows = [];
  state.manualDirty = false;
  state.curveOverrides = {};
  state.selectedPatchIndex = null;
  state.ratioAuto = true;
  calculate();
}

function importMeasurementText(text) {
  state.auditReport = null;
  const incoming = parseImportText(text, { densityFilter: state.settings.densityFilter });
  if (!incoming.measurements.length) {
    window.alert(t("import_no_usable_measurements", "导入文件没有可计算测点，请检查文件格式或测量字段。"));
    return false;
  }
  saveCurrentRun({ switchToJob: false, namePrefix: t("run_name_previous_import", "上一份测量"), skipIfUnchanged: true });
  loadImportedMeasurement(incoming, text);
  saveCurrentRun({ switchToJob: false, namePrefix: t("run_name_imported_measurement", "导入测量") });
  render();
  return true;
}

function loadImportedMeasurement(importInfo, text) {
  state.importInfo = importInfo;
  state.measurements = importInfo.measurements;
  state.manualRows = [];
  state.manualDirty = false;
  state.curveOverrides = {};
  state.selectedPatchIndex = null;
  state.ratioAuto = true;
  els.rawInput.value = text;
  calculate();
}


async function loadSelectedSample() {
  if (!confirmDataOverwrite(t("confirm_sample_overwrite", "载入示例会替换当前工作区数据。"))) return;
  const selected = els.sampleSelect.value;
  if (selected === "kba105" || selected === "kba162") {
    await loadManualPreset(selected);
    return;
  }
  const samplePaths = {
    sample: "./samples/sample-measurements.csv",
    ctvLab: "./samples/ctv-lab-demo.csv",
    kba162Curve5Run1: "./reference-data/measurements/kba162-shenghui/kba162-p2p51-curve5-run1.txt",
    kba162Curve5Run2: "./reference-data/measurements/kba162-shenghui/kba162-p2p51-curve5-run2.txt",
    p2p51: "./reference-data/measurements/g7-training/P2P51_2019-01-24_13h28_M1_3-2.txt",
    tc1617: "./reference-data/measurements/g7-training/G7_T1617_P2_1_M1.txt",
    smlPrintSpecAudit: "./samples/sml-printspec-audit-example.json",
  };
  if (selected === "smlPrintSpecAudit") {
    const report = await responseJson(samplePaths.smlPrintSpecAudit);
    state.auditReport = report;
    els.rawInput.value = auditMeasurementCsv(report);
    els.jobCustomerInput.value = report.job?.customerName || els.jobCustomerInput.value;
    els.jobPressInput.value = report.job?.machineModel || report.job?.pressPrinter || els.jobPressInput.value;
    els.jobPaperInput.value = report.job?.substrateName || els.jobPaperInput.value;
    els.jobDeviceInput.value = report.source?.software || els.jobDeviceInput.value;
    els.jobNoteInput.value = `${report.source?.software || "Audit report"} summary sample; not a full CGATS/P2P measurement file.`;
    parseAndCalculate({ skipConfirm: true, preserveAuditReport: true });
    switchView("report");
    return;
  }
  const response = await fetch(samplePaths[selected] || samplePaths.sample);
  els.rawInput.value = await response.text();
  state.auditReport = null;
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
  if (selected === "kba162Curve5Run1" || selected === "kba162Curve5Run2") {
    els.modeSelect.value = "ctv";
    els.targetSelect.value = "linear";
    calculate({ preserveRatio: true });
    switchView("measurement");
  }
}

async function responseJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot load ${path}: ${response.status}`);
  return response.json();
}

async function loadManualPreset(key) {
  const preset = (await loadKbaPresets())[key];
  if (!preset) return;
  state.auditReport = null;
  state.manualRows = kbaPresetRows(preset);
  state.manualDirty = false;
  state.curveOverrides = {};
  state.selectedPatchIndex = null;
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

function changeDeviceAdapter() {
  state.device = changeDeviceAdapterState(state.device, els.deviceAdapterSelect.value);
  renderInstrument();
}

async function connectDevice() {
  if (state.device.adapterId === "sdk" && isTauriAvailable()) {
    state.device.message = "正在扫描 USB 仪器...";
    renderInstrument();
    try {
      const devices = await window.__TAURI__.core.invoke("sdk_scan_devices");
      if (!devices || devices.length === 0) {
        state.device.connected = false;
        state.device.message = "未扫描到支持的 Techkon 或 X-Rite 仪器。";
      } else {
        const dev = devices[0];
        state.device.connected = true;
        state.device.vendorId = dev.vendor_id;
        state.device.productId = dev.product_id;
        state.device.productName = dev.product_string || "未知设备";
        state.device.message = `已连接设备: ${sdkDeviceLabel(dev)}`;
      }
    } catch (e) {
      state.device.connected = false;
      state.device.message = `连接失败: ${e}`;
    }
    renderInstrument();
    return;
  }

  state.device = connectDeviceState(state.device);
  renderInstrument();
}

function disconnectDevice() {
  state.device = disconnectDeviceState(state.device);
  renderInstrument();
}

async function calibrateDevice() {
  if (state.device.adapterId === "sdk" && isTauriAvailable()) {
    if (!state.device.connected) {
      state.device.message = "请先连接设备。";
      renderInstrument();
      return;
    }
    state.device.message = "正在校准白板，请勿移动设备...";
    renderInstrument();
    try {
      const res = await window.__TAURI__.core.invoke("sdk_calibrate", {
        vendorId: state.device.vendorId,
        productId: state.device.productId
      });
      state.device.calibrated = true;
      state.device.message = `白板校准成功: ${res}`;
    } catch (e) {
      state.device.calibrated = false;
      state.device.message = `校准失败: ${e}`;
    }
    renderInstrument();
    return;
  }

  state.device = calibrateDeviceState(state.device);
  renderInstrument();
}

async function readDevicePatch() {
  if (state.device.adapterId === "sdk" && isTauriAvailable()) {
    if (!state.device.connected) {
      state.device.message = "请先连接设备。";
      renderInstrument();
      return;
    }
    state.device.message = "正在读取色块，请按下仪器测量键...";
    renderInstrument();
    try {
      const queue = state.device.queue || buildMeasurementQueue(state.device.queueProfile || "press-basic");
      const queueIndex = Number(state.device.queueIndex || 0);
      const item = queue[queueIndex];
      if (!item) {
        state.device.message = "测量队列已完成。";
        renderInstrument();
        return;
      }

      const res = await window.__TAURI__.core.invoke("sdk_read_patch", {
        vendorId: state.device.vendorId,
        productId: state.device.productId
      });

      const row = buildSdkMeasurementRow(item, res);

      state.device.queueIndex = queueIndex + 1;
      state.device.message = `已成功读取 ${item.label} (L*:${row.labL.toFixed(2)}, a*:${row.labA.toFixed(2)}, b*:${row.labB.toFixed(2)})`;

      state.manualRows.push(row);
      markManualDirty();
      renderManualTable();
      renderMeasurement();
    } catch (e) {
      state.device.message = `读取失败: ${e}`;
    }
    renderInstrument();
    return;
  }

  const result = readDevicePatchState(state.device);
  state.device = result.device;
  const row = result.row;
  if (!row) {
    renderInstrument();
    return;
  }
  state.manualRows.push(row);
  markManualDirty();
  renderManualTable();
  renderMeasurement();
  renderInstrument();
}

function clearManualRows() {
  if (!confirmDataOverwrite(t("confirm_clear_current", "清空会删除当前工作区数据。"))) return;
  state.manualRows = [];
  state.importInfo = null;
  state.measurements = [];
  state.results = [];
  state.manualDirty = false;
  state.curveOverrides = {};
  state.selectedPatchIndex = null;
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
      instrumentCtv: Number.isFinite(row.instrumentCtv) ? row.instrumentCtv : undefined,
      instrumentCtvMethod: row.instrumentCtvMethod,
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
  state.selectedPatchIndex = null;
  els.rawInput.value = manualRowsToCsv(state.manualRows.map(normalizeManualRow));
  calculate();
}

function selectMeasurementPatch(event) {
  const target = event.target.closest("[data-patch-index]");
  if (!target || !els.measurementPatchPreview.contains(target)) return;
  state.selectedPatchIndex = Number(target.dataset.patchIndex);
  renderMeasurement();
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
    rawRows: state.importInfo?.rawRows || [],
    standardPatchMap: labReferencePatchMap(),
    warning: state.standard.deltaE.warning,
    fail: state.standard.deltaE.fail,
    scca: els.sccaInput.checked,
    formula: els.deltaFormulaSelect.value,
  });
  state.safetyIssues = analyzeCurveSafety(state.results);
  state.g7 = currentG7Preview();
  if (state.g7Compensation) state.g7Compensation = currentG7Compensation();
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

function applySettingsToCalculation() {
  const previousDensityFilter = state.settings.densityFilter;
  if (els.settingsModeSelect) els.modeSelect.value = els.settingsModeSelect.value;
  if (els.settingsTargetSelect) els.targetSelect.value = els.settingsTargetSelect.value;
  if (els.modeSelect.value === "ctv") els.targetSelect.value = "linear";
  if (els.modeSelect.value === "g7") els.targetSelect.value = "g7";
  if (els.settingsSmoothInput) els.smoothInput.value = clampNumber(Number(els.settingsSmoothInput.value), 0, 4, 2);
  if (els.settingsLimitInput) els.limitInput.value = clampNumber(Number(els.settingsLimitInput.value), 1, 40, 18);
  if (els.settingsRatioInput) els.ratioInput.value = clampNumber(Number(els.settingsRatioInput.value), 0, 100, 50);
  if (els.settingsSccaInput) els.sccaInput.checked = els.settingsSccaInput.checked;
  const deltaWarning = clampNumber(Number(els.settingsDeltaWarningInput?.value), 0, 20, 3.5);
  const deltaFail = clampNumber(Number(els.settingsDeltaFailInput?.value), deltaWarning, 30, 4.2);
  state.standard = {
    ...state.standard,
    deltaE: {
      ...(state.standard.deltaE || {}),
      warning: deltaWarning,
      fail: deltaFail,
    },
  };
  state.settings = {
    ...state.settings,
    densityFilter: els.settingsDensityFilterSelect?.value || "status_t",
    measurementCondition: els.settingsMeasurementConditionSelect?.value || "auto",
    illuminant: els.settingsIlluminantSelect?.value || "D50",
    observer: els.settingsObserverSelect?.value || "2",
    deviceAdapterId: els.settingsDeviceAdapterSelect?.value || state.device.adapterId || "file",
    queueProfile: els.settingsQueueProfileSelect?.value || state.device.queueProfile || "g7",
    requireG7ForIcc: els.settingsRequireG7Input ? els.settingsRequireG7Input.checked : true,
  };
  if (state.device.adapterId !== state.settings.deviceAdapterId) {
    state.device = changeDeviceAdapterState(state.device, state.settings.deviceAdapterId);
  }
  if (state.device.queueProfile !== state.settings.queueProfile) {
    state.device = {
      ...state.device,
      queueProfile: state.settings.queueProfile,
      queue: buildMeasurementQueue(state.settings.queueProfile),
      queueIndex: 0,
    };
  }
  if (els.deviceAdapterSelect) els.deviceAdapterSelect.value = state.device.adapterId;
  if (previousDensityFilter !== state.settings.densityFilter && els.rawInput.value.trim() && state.importInfo?.sourceFormat !== "Manual Table") {
    state.importInfo = parseImportText(els.rawInput.value, { densityFilter: state.settings.densityFilter });
    state.measurements = state.importInfo.measurements;
    state.curveOverrides = {};
    state.selectedPatchIndex = null;
  }
  state.ratioAuto = false;
  renderControlValues();
  calculate({ preserveRatio: true });
  renderSettings();
}

function resetSettingsDefaults() {
  if (els.settingsModeSelect) els.settingsModeSelect.value = "tvi";
  if (els.settingsTargetSelect) els.settingsTargetSelect.value = state.standard.target || "iso_tvi_a";
  if (els.settingsSmoothInput) els.settingsSmoothInput.value = 2;
  if (els.settingsLimitInput) els.settingsLimitInput.value = 18;
  if (els.settingsRatioInput) els.settingsRatioInput.value = 50;
  if (els.settingsDeltaWarningInput) els.settingsDeltaWarningInput.value = 3.5;
  if (els.settingsDeltaFailInput) els.settingsDeltaFailInput.value = 4.2;
  if (els.settingsSccaInput) els.settingsSccaInput.checked = false;
  if (els.settingsDensityFilterSelect) els.settingsDensityFilterSelect.value = "status_t";
  if (els.settingsMeasurementConditionSelect) els.settingsMeasurementConditionSelect.value = "auto";
  if (els.settingsIlluminantSelect) els.settingsIlluminantSelect.value = "D50";
  if (els.settingsObserverSelect) els.settingsObserverSelect.value = "2";
  if (els.settingsDeviceAdapterSelect) els.settingsDeviceAdapterSelect.value = "file";
  if (els.settingsQueueProfileSelect) els.settingsQueueProfileSelect.value = "g7";
  if (els.settingsRequireG7Input) els.settingsRequireG7Input.checked = true;
  if (els.deltaFormulaSelect) els.deltaFormulaSelect.value = "de76";
  applySettingsToCalculation();
}

function render() {
  renderShell(state, els);
  renderStandard(state, els);
  renderMeasurement(state, els);
  renderInstrument(state, els);
  renderManualTable();
  renderAnalyze(state, els);
  renderCurve(state, els);
  renderG7(state, els);
  renderRuns(state, els);
  renderExport(state, els);
  renderReport(state, els);
  renderSettings(state, els);
  updateDomTranslations(getLanguage());
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

function renderInstrument() {
  _renderInstrument(state, els);
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
  const context = {
    generatedAt,
    job,
    jobId: pathParts[1] || "job",
    runId: (pathParts.at(-1) || generatedAt).replace(/\.json$/, ""),
    suggestedArchivePath,
    standard: state.standard,
    iccProfile: state.iccProfile,
    labReferenceSource: labReferenceSource(),
    iccStandardPair: currentIccStandardPair(),
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
      deltaEWarning: state.standard.deltaE?.warning,
      deltaEFail: state.standard.deltaE?.fail,
      calculationFormula: algorithmDescription(els.modeSelect.value),
      scca: Boolean(els.sccaInput.checked),
      densityFilter: state.settings.densityFilter,
      measurementCondition: state.settings.measurementCondition,
      effectiveMeasurementCondition: measurementConditionForExport(),
      illuminant: state.settings.illuminant,
      observer: state.settings.observer,
      deviceAdapterId: state.device.adapterId,
      queueProfile: state.device.queueProfile,
      requireG7ForIcc: state.settings.requireG7ForIcc,
    },
    algorithm: els.modeSelect.value,
    calculationFormula: algorithmDescription(els.modeSelect.value),
    deltaFormula: deltaFormulaLabel(els.deltaFormulaSelect.value),
    targetName: targetName(els.targetSelect.value),
    compensationRatio: els.ratioInput.value,
    ripCompatibility: t("rip_compatibility_value", "RIP 手动录入表、RIP 导入 CSV；通用 CSV 可按 SCREEN Trueflow、Heidelberg Prinect、Agfa Apogee、Harlequin、Founder Flow、Esko 等系统的导入模板映射。"),
    measurementCondition: measurementConditionForExport(),
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
  context.iccGenerationGate = currentIccGenerationGate(state.runs);
  return context;
}

async function download(filename, content, type, options = {}) {
  if (!options.allowWithoutResults && !state.results.length && !filename.includes("project")) return;
  if (!options.skipManualDirty && state.manualDirty && !filename.includes("project")) {
    window.alert(t("manual_dirty_warning", "手动测量表已修改，请先点击「应用测量表」重新生成曲线后再导出。"));
    return;
  }
  try {
    const desktop = await saveTextFileDesktop({ filename, contents: content });
    if (desktop.handled) return;
  } catch (error) {
    window.alert(t("desktop_save_failed", `桌面保存失败，已改用浏览器下载：${error.message || error}`));
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadBinary(filename, content, type, options = {}) {
  if (!options.allowWithoutResults && !state.results.length) return;
  if (!options.skipManualDirty && state.manualDirty) {
    window.alert(t("manual_dirty_warning", "手动测量表已修改，请先点击「应用测量表」重新生成曲线后再导出。"));
    return;
  }
  try {
    const desktop = await saveBinaryFileDesktop({ filename, contents: content });
    if (desktop.handled) return;
  } catch (error) {
    window.alert(t("desktop_save_failed", `桌面保存失败，已改用浏览器下载：${error.message || error}`));
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function openWithDesktopDialog() {
  try {
    const result = await openTextFileDesktop();
    if (!result.handled || result.canceled) return;
    if (String(result.path || "").toLowerCase().endsWith(".json") && await restoreProjectFromText(result.contents)) return;
    importMeasurementText(result.contents, { sourceName: result.path || "" });
  } catch (error) {
    window.alert(`桌面打开文件失败：${error.message || error}`);
  }
}

function askText(title, initialValue = "") {
  if (!els.textPromptDialog || !els.textPromptInput || !els.textPromptOkButton || !els.textPromptCancelButton) {
    return Promise.resolve(window.prompt(title, initialValue));
  }
  return new Promise((resolve) => {
    const cleanup = (value) => {
      els.textPromptDialog.hidden = true;
      els.textPromptOkButton.removeEventListener("click", onOk);
      els.textPromptCancelButton.removeEventListener("click", onCancel);
      els.textPromptDialog.removeEventListener("click", onBackdrop);
      els.textPromptInput.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keydown", onKeydown);
      resolve(value);
    };
    const onOk = () => cleanup(els.textPromptInput.value);
    const onCancel = () => cleanup("");
    const onBackdrop = (event) => {
      if (event.target === els.textPromptDialog) cleanup("");
    };
    const onKeydown = (event) => {
      if (event.key === "Enter") onOk();
      if (event.key === "Escape") onCancel();
    };
    els.textPromptTitle.textContent = title;
    els.textPromptInput.value = initialValue;
    els.textPromptDialog.hidden = false;
    els.textPromptOkButton.addEventListener("click", onOk);
    els.textPromptCancelButton.addEventListener("click", onCancel);
    els.textPromptDialog.addEventListener("click", onBackdrop);
    els.textPromptInput.addEventListener("keydown", onKeydown);
    document.addEventListener("keydown", onKeydown);
    setTimeout(() => {
      els.textPromptInput.focus();
      els.textPromptInput.select();
    }, 0);
  });
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function confirmDataOverwrite(message) {
  const hasExistingData = state.manualRows.length || state.measurements.length || state.results.length;
  if (!hasExistingData) return true;
  return window.confirm(`${message}\n\n${t("confirm_overwrite_detail", "当前工作区只保留一份测量数据；继续会替换当前手动表、导入数据、曲线结果和人工锁定点。已保存的 Job / Run 历史不会被覆盖。若要保留当前测量，请先取消并点击「保存当前作业 / Run」。")}`);
}

const viewToStepMap = {
  job: "acquisition",
  standard: "setup",
  settings: "setup",
  measurement: "acquisition",
  manual: "acquisition",
  instrument: "acquisition",
  analyze: "diagnose",
  g7: "diagnose",
  curve: "curves",
  report: "delivery",
  export: "delivery"
};

const stepDefaultViewMap = {
  setup: "standard",
  acquisition: "measurement",
  diagnose: "analyze",
  curves: "curve",
  delivery: "report"
};

function switchView(view) {
  if (stepDefaultViewMap[view]) {
    view = stepDefaultViewMap[view];
  }
  
  const step = viewToStepMap[view] || "setup";
  state.activeView = view;
  
  const appShell = document.querySelector(".app-shell");
  if (appShell) {
    appShell.setAttribute("data-active-step", step);
  }

  const stepNames = {
    setup: t("step_setup", "标准设置"),
    acquisition: t("step_acquisition", "第 1 步：导入测量"),
    diagnose: t("step_diagnose", "第 2 步：分析诊断"),
    curves: t("step_curves", "第 3 步：生成曲线"),
    delivery: t("step_delivery", "第 4 步：复测归档")
  };
  const stepIndicator = document.getElementById("currentStepName");
  if (stepIndicator) {
    stepIndicator.textContent = stepNames[step] || "";
  }

  document.querySelectorAll("[data-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });

  document.querySelectorAll("[data-step-button]").forEach((item) => {
    item.classList.toggle("active", item.dataset.stepButton === step);
  });

  document.querySelectorAll("[data-sub-view-button]").forEach((item) => {
    item.classList.toggle("active", item.dataset.subViewButton === view);
  });

  if (view === "report") _renderReport(state, els);
  if (view === "export") _renderExport(state, els);
  if (els.workflowContextToolbar) els.workflowContextToolbar.hidden = true;
}

function saveRun() {
  saveCurrentRun({ switchToJob: true });
}

function saveCurrentRun(options = {}) {
  if (!state.results.length) return;
  if (state.manualDirty) {
    window.alert("手动测量表已修改，请先点击「应用测量表」重新生成曲线后再保存 Run。");
    return null;
  }
  const signature = currentRunSignature();
  if (options.skipIfUnchanged && signature && signature === state.lastSavedRunSignature) return null;
  const context = exportContext();
  const archive = projectArchive(context);
  const metrics = buildRunMetrics({
    results: state.results,
    labRows: state.labRows,
    g7: state.g7,
    curveQuality: context.curveQuality,
  });
  const jobName = jobDisplayName(context);
  const historyArchive = compactProjectArchiveForRun(archive);
  const run = {
    name: options.namePrefix ? `${options.namePrefix} / ${context.runId}` : context.runId,
    jobKey: context.jobId,
    jobName,
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
    archive: historyArchive,
  };
  const nextRuns = [run, ...state.runs].slice(0, 24);
  const gate = currentIccGenerationGate(nextRuns);
  const storableGate = storableIccGenerationGate(gate);
  run.iccGenerationGate = storableGate;
  run.archive = { ...run.archive, iccGenerationGate: storableGate };
  const saved = saveRunsAndLastProject(nextRuns, { ...archive, iccGenerationGate: storableGate });
  if (!saved.ok) {
    state.storageWarning = saved.warning;
    if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(saved.warning);
    _renderRuns(state, els);
    _renderReport(state, els);
    return null;
  }
  state.storageWarning = "";
  state.runs = nextRuns;
  state.lastSavedRunSignature = signature;
  state.selectedJobKey = run.jobKey;
  _renderRuns(state, els);
  _renderReport(state, els);
  if (options.switchToJob !== false) switchView("job");
  return run;
}

function storableIccGenerationGate(gate) {
  if (!gate || typeof gate !== "object") return null;
  return {
    status: gate.status,
    summary: gate.summary,
    checks: Array.isArray(gate.checks)
      ? gate.checks.map((check) => ({
        id: check.id,
        label: check.label,
        status: check.status,
        required: check.required,
        message: check.message,
      }))
      : [],
  };
}

function currentRunSignature() {
  if (!state.measurements.length && !state.results.length) return "";
  return JSON.stringify({
    job: {
      customer: els.jobCustomerInput.value,
      press: els.jobPressInput.value,
      paper: els.jobPaperInput.value,
    },
    settings: {
      mode: els.modeSelect.value,
      target: els.targetSelect.value,
      ratio: els.ratioInput.value,
      smooth: els.smoothInput.value,
      limit: els.limitInput.value,
    },
    measurements: state.measurements.map((row) => [
      row.channel,
      Number(row.tone).toFixed(2),
      finiteSignature(row.measuredTone),
      finiteSignature(row.measuredTvi),
      finiteSignature(row.colorimetricTone),
      finiteSignature(row.density),
    ]),
    overrides: state.curveOverrides,
  });
}

function finiteSignature(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(4)) : "";
}

function clearRuns() {
  if (!window.confirm("清空当前 Run / 当前工作区？\n已保存的 Job / Run 历史不会删除。")) return;
  clearCurrentWorkspace();
  clearStoredProject();
  state.storageWarning = "";
  render();
}

function clearCurrentWorkspace() {
  state.importInfo = null;
  state.manualRows = [];
  state.measurements = [];
  state.results = [];
  state.diagnosis = null;
  state.labRows = [];
  state.safetyIssues = [];
  state.g7 = null;
  state.g7Compensation = null;
  state.curveOverrides = {};
  state.manualDirty = false;
  state.selectedPatchIndex = null;
  state.lastSavedRunSignature = "";
  state.activeCurveChannel = "all";
  if (els.rawInput) els.rawInput.value = "";
  if (els.fileInput) els.fileInput.value = "";
}

async function restoreRunFromList(event) {
  const jobClearFilterTarget = event.target?.closest?.("[data-job-clear-filter]");
  if (jobClearFilterTarget) {
    state.selectedJobKey = "";
    _renderRuns(state, els);
    return;
  }
  const jobSelectTarget = event.target?.closest?.("[data-job-select-key]");
  if (jobSelectTarget) {
    state.selectedJobKey = jobSelectTarget.dataset.jobSelectKey || "";
    _renderRuns(state, els);
    els.runBody?.closest(".table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const jobExportTarget = event.target?.closest?.("[data-job-export-key]");
  if (jobExportTarget) {
    exportJobArchive(jobExportTarget.dataset.jobExportKey);
    return;
  }
  const jobRenameTarget = event.target?.closest?.("[data-job-rename-key]");
  if (jobRenameTarget) {
    await renameJob(jobRenameTarget.dataset.jobRenameKey);
    return;
  }
  const jobDeleteTarget = event.target?.closest?.("[data-job-delete-key]");
  if (jobDeleteTarget) {
    deleteJob(jobDeleteTarget.dataset.jobDeleteKey);
    return;
  }
  const renameTarget = event.target?.closest?.("[data-run-rename-index]");
  if (renameTarget) {
    await renameRun(Number(renameTarget.dataset.runRenameIndex));
    return;
  }
  const deleteTarget = event.target?.closest?.("[data-run-delete-index]");
  if (deleteTarget) {
    deleteRun(Number(deleteTarget.dataset.runDeleteIndex));
    return;
  }
  const openTarget = event.target?.closest?.("[data-run-open-index]");
  if (!openTarget) return;
  const run = state.runs[Number(openTarget.dataset.runOpenIndex)];
  if (!run?.archive) return;
  await restoreProjectArchive(run.archive);
}

async function renameRun(index) {
  const run = state.runs[index];
  if (!run) return;
  const currentName = run.name || run.jobId || run.runId || `Run ${index + 1}`;
  const nextName = await askText("输入新的 Run 名称", currentName);
  if (!nextName || nextName.trim() === currentName) return;
  state.runs = state.runs.map((item, itemIndex) => itemIndex === index ? { ...item, name: nextName.trim() } : item);
  persistRunsOnly();
}

function deleteRun(index) {
  const run = state.runs[index];
  if (!run) return;
  const label = run.name || run.jobId || run.runId || run.createdAt || `Run ${index + 1}`;
  if (!window.confirm(`删除这次 Run？\n${label}\n此操作只删除本机历史列表，不会影响已导出的文件。`)) return;
  state.runs = state.runs.filter((_, itemIndex) => itemIndex !== index);
  persistRunsOnly();
}

async function renameJob(jobKey) {
  const runs = state.runs.filter((run, index) => runJobKey(run, index) === jobKey);
  if (!runs.length) return;
  const currentName = runs[0].jobName || runs[0].jobId || jobKey;
  const nextName = await askText("输入新的作业名称", currentName);
  if (!nextName || nextName.trim() === currentName) return;
  state.runs = state.runs.map((run, index) =>
    runJobKey(run, index) === jobKey ? { ...run, jobKey, jobName: nextName.trim() } : run
  );
  persistRunsOnly();
}

function deleteJob(jobKey) {
  const runs = state.runs.filter((run, index) => runJobKey(run, index) === jobKey);
  if (!runs.length) return;
  const label = runs[0].jobName || runs[0].jobId || jobKey;
  if (!window.confirm(`删除整个作业及其 ${runs.length} 次 Run？\n${label}\n此操作只删除本机历史列表，不会影响已导出的文件。`)) return;
  state.runs = state.runs.filter((run, index) => runJobKey(run, index) !== jobKey);
  if (state.selectedJobKey === jobKey) state.selectedJobKey = "";
  persistRunsOnly();
}

function runJobKey(run, index) {
  return run.jobKey || run.jobId || run.archive?.jobId || run.storagePath?.split("/")?.[1] || `job-${index}`;
}

function exportJobArchive(jobKey) {
  const runs = state.runs
    .map((run, index) => ({ run, index }))
    .filter((item) => runJobKey(item.run, item.index) === jobKey);
  if (!runs.length) return;
  const jobName = runs[0].run.jobName || runs[0].run.jobId || jobKey;
  const archive = {
    schemaVersion: 1,
    type: "ctv-job-archive",
    exportedAt: new Date().toISOString(),
    job: {
      key: jobKey,
      name: jobName,
      runCount: runs.length,
    },
    runs: runs.map((item) => item.run),
  };
  download(`${slug(jobName)}-job-project.json`, JSON.stringify(archive, null, 2), "application/json");
}

function exportSelectedJobArchive() {
  const jobKey = state.selectedJobKey || runJobKey(state.runs[0] || {}, 0);
  if (!jobKey) return;
  exportJobArchive(jobKey);
}

function exportJobLibraryArchive() {
  if (!state.runs.length) return;
  const archive = {
    schemaVersion: 1,
    type: "ctv-job-library-archive",
    exportedAt: new Date().toISOString(),
    jobCount: new Set(state.runs.map((run, index) => runJobKey(run, index))).size,
    runCount: state.runs.length,
    runs: state.runs,
  };
  download("ctv-job-library-project.json", JSON.stringify(archive, null, 2), "application/json");
}

function jobDisplayName(context) {
  return [context.job.customer, context.job.press].filter(Boolean).join(" / ") || context.jobId;
}

function persistRunsOnly() {
  const compactRuns = state.runs.map((run) => ({
    ...run,
    archive: run.archive ? compactProjectArchiveForRun(run.archive) : run.archive,
  }));
  const saved = saveStoredRuns(compactRuns);
  if (!saved.ok) {
    state.storageWarning = saved.warning;
    window.alert(saved.warning);
  } else {
    state.storageWarning = "";
    state.runs = compactRuns;
  }
  _renderRuns(state, els);
  _renderReport(state, els);
}

function persistCurrentProjectDraft() {
  if (!state.measurements.length && !state.results.length) return;
  const saved = saveLastProject(projectArchive(exportContext()));
  state.storageWarning = saved.ok ? "" : saved.warning;
}

function loadRuns() {
  state.runs = loadStoredRuns();
}

async function restoreLastProjectDraft() {
  const archive = loadLastProject();
  if (!archive || (!archive.measurements && !archive.results && !archive.manualRows)) return false;
  await restoreProjectArchive(archive);
  return true;
}

async function restoreProjectFromText(text) {
  let archive;
  try {
    archive = JSON.parse(text);
  } catch {
    return false;
  }
  if ((archive?.type === "ctv-job-archive" || archive?.type === "ctv-job-library-archive") && Array.isArray(archive.runs)) {
    restoreJobArchive(archive);
    return true;
  }
  if (!archive || (!archive.job && !archive.measurements && !archive.results)) return false;
  if (!confirmDataOverwrite(t("confirm_json_overwrite", "导入 JSON 项目档案会替换当前工作区数据。"))) return true;
  await restoreProjectArchive(archive);
  return true;
}

function restoreJobArchive(archive) {
  const incomingRuns = archive.runs
    .filter((run) => run && typeof run === "object")
    .map((run, index) => ({
      ...run,
      jobKey: run.jobKey || archive.job?.key || runJobKey(run, index),
      jobName: run.jobName || archive.job?.name || run.jobId || archive.job?.key || `Job ${index + 1}`,
    }));
  if (!incomingRuns.length) return;
  const existingKeys = new Set(state.runs.map((run, index) => runIdentity(run, index)));
  state.runs = [
    ...incomingRuns.filter((run, index) => !existingKeys.has(runIdentity(run, index))),
    ...state.runs,
  ].slice(0, 24);
  state.selectedJobKey = incomingRuns[0].jobKey || "";
  persistRunsOnly();
  switchView("job");
}

function runIdentity(run, index) {
  return [
    runJobKey(run, index),
    run.runId || "",
    run.createdAt || "",
    run.storagePath || "",
  ].join("|");
}

async function restoreProjectArchive(archive) {
  if (archive.targetSnapshot && archive.settings?.target && !targetOptions().some((item) => item.id === archive.settings.target)) {
    upsertTarget(archive.settings.target, archive.targetSnapshot);
    refreshTargetSelect(archive.settings.target);
  }
  if (archive.standard?.id) {
    if (archive.standard.custom && !STANDARD_LIBRARY.some((item) => item.id === archive.standard.id)) {
      const items = addOrUpdateCustomStandard(archive.standard);
      persistCustomStandards(items);
      populateSelects();
    }
    await loadStandard(archive.standard.id);
  }
  state.iccProfile = archive.iccProfile || null;
  if (state.iccProfile && !state.iccProfile.error) {
    state.standard = {
      ...state.standard,
      iccReference: {
        id: state.iccProfile.id,
        fileName: state.iccProfile.fileName,
        profileName: state.iccProfile.profileName,
        colorSpace: state.iccProfile.colorSpace,
        pcs: state.iccProfile.pcs,
        deviceClass: state.iccProfile.deviceClass,
      },
    };
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
    els.sccaInput.checked = Boolean(archive.settings.scca);
    if (archive.settings.deltaEWarning !== undefined || archive.settings.deltaEFail !== undefined) {
      state.standard = {
        ...state.standard,
        deltaE: {
          ...(state.standard.deltaE || {}),
          warning: archive.settings.deltaEWarning ?? state.standard.deltaE?.warning ?? 3.5,
          fail: archive.settings.deltaEFail ?? state.standard.deltaE?.fail ?? 4.2,
        },
      };
    }
    state.settings = {
      ...state.settings,
      densityFilter: archive.settings.densityFilter || state.settings.densityFilter,
      measurementCondition: archive.settings.measurementCondition || state.settings.measurementCondition,
      illuminant: archive.settings.illuminant || state.settings.illuminant,
      observer: archive.settings.observer || state.settings.observer,
      deviceAdapterId: archive.settings.deviceAdapterId || state.settings.deviceAdapterId,
      queueProfile: archive.settings.queueProfile || state.settings.queueProfile,
      requireG7ForIcc: archive.settings.requireG7ForIcc !== false,
    };
    state.device = {
      ...state.device,
      adapterId: state.settings.deviceAdapterId,
      queueProfile: state.settings.queueProfile,
      queue: buildMeasurementQueue(state.settings.queueProfile),
      queueIndex: 0,
    };
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
  state.lastSavedRunSignature = currentRunSignature();
  switchView("job");
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "job";
}

function currentImportAudit() {
  return inspectImport({
    importInfo: state.importInfo,
    measurements: state.measurements,
    results: state.results,
    mode: els.modeSelect.value,
  });
}

function labReferencePatchMap() {
  const map = new Map(state.standardPatchMap);
  const rows = state.iccProfile?.characterization?.rows || [];
  for (const row of rows) {
    if (!row?.lab || !row.cmyk) continue;
    map.set(cmykKey(row.cmyk), {
      lab: row.lab,
      source: "icc-sampled",
      name: row.name,
      cmyk: row.cmyk,
    });
  }
  return map;
}

function labReferenceSource() {
  const sampled = state.iccProfile?.characterization?.sampledCount || 0;
  if (sampled > 0) return `ICC sampled reference (${sampled} patches)`;
  if (state.standardPatchMap.size) return "built-in standard reference";
  return "none";
}

function currentIccStandardPair() {
  return buildIccStandardPair({
    iccProfile: state.iccProfile,
    standard: state.standard,
    targetName: targetName(els.targetSelect.value),
    standardPatchCount: state.standardPatchMap.size || 0,
  });
}

function currentIccGenerationGate(runs = state.runs) {
  return buildIccGenerationGate({
    runs,
    standard: state.standard,
    requireG7: state.settings.requireG7ForIcc !== false,
  });
}

function measurementConditionForExport() {
  const fileCondition = state.importInfo?.metadata?.measurement_condition;
  if (fileCondition) return fileCondition;
  return state.settings.measurementCondition === "auto" ? "unspecified" : state.settings.measurementCondition;
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
    standardPatchMap: labReferencePatchMap(),
    deltaEFormula: els.deltaFormulaSelect.value,
    tolerances: {
      ...(state.standard.g7 || {}),
      deltaEWeighted: state.standard.deltaE?.warning,
      deltaEMax: state.standard.deltaE?.fail ? Math.max(state.standard.deltaE.fail * 2, 8) : 8,
    },
  });
}

function currentG7Compensation() {
  return buildG7Compensation({
    g7: state.g7,
    baseRows: state.results,
    ratio: Number(els.ratioInput.value) / 100,
    limit: Number(els.limitInput.value),
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
  if (event.type === "input" && field === "outputTone") {
    const lockInput = target.closest("tr")?.querySelector("[data-curve-field='locked']");
    if (lockInput) lockInput.checked = true;
    const numericValue = Number(target.value);
    if (!Number.isFinite(numericValue)) return;
    const row = state.results.find((item) => curveRowKey(item) === key);
    if (!row) return;
    const value = clampNumber(numericValue, 0, 100, row.outputTone);
    state.curveOverrides[key] = { locked: true, outputTone: value };
    state.curveOverrides = pruneCurveOverrides(state.results, state.curveOverrides);
    state.results = applyCurveOverrides(state.results, state.curveOverrides);
    persistCurrentProjectDraft();
    return;
  }
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
  if (state.g7Compensation) state.g7Compensation = currentG7Compensation();
  renderShell(state, els);
  _renderAnalyze(state, els);
  _renderCurve(state, els);
  _renderG7(state, els);
  _renderInstrument(state, els);
  _renderExport(state, els);
  _renderReport(state, els);
  persistCurrentProjectDraft();
}

function handleCurveOutputKeydown(event) {
  const target = event.target;
  if (target?.dataset?.curveField !== "outputTone") return;
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const step = Number(target.step) || 0.1;
  const direction = event.key === "ArrowUp" ? 1 : -1;
  const min = Number.isFinite(Number(target.min)) ? Number(target.min) : 0;
  const max = Number.isFinite(Number(target.max)) ? Number(target.max) : 100;
  const current = Number(target.value);
  const fallback = Number(target.getAttribute("value"));
  const base = Number.isFinite(current) ? current : Number.isFinite(fallback) ? fallback : 0;
  const next = clampNumber(base + direction * step, min, max, base);
  target.value = next.toFixed(stepDecimals(step));
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function stepDecimals(step) {
  const text = String(step);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function updateManualCell(event) {
  if (!updateManualRowFromEvent(state.manualRows, event)) return;
  markManualDirty();
  renderShell(state, els);
  _renderMeasurement(state, els);
  _renderInstrument(state, els);
  _renderExport(state, els);
  _renderReport(state, els);
}

function deleteManualRow(event) {
  if (!deleteManualRowFromEvent(state.manualRows, event)) return;
  markManualDirty();
  renderManualTable();
  _renderMeasurement(state, els);
  _renderInstrument(state, els);
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
  _renderInstrument(state, els);
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

let activeDragPoint = null;

function handleCurveDragStart(event) {
  const target = event.target;
  if (!target || !target.dataset.draggablePoint) return;
  
  event.preventDefault();
  const channel = target.dataset.channel;
  const tone = Number(target.dataset.tone);
  const key = `${channel}:${tone.toFixed(3)}`;
  const svg = target.ownerSVGElement || event.currentTarget || els.curveChart;
  
  activeDragPoint = {
    channel,
    tone,
    key,
    svg,
    dragKind: target.dataset.dragKind || "curve-output",
  };
  target.classList.add("dragging");
  
  const tooltip = document.getElementById("chart-tooltip");
  if (tooltip) tooltip.hidden = true;
}

function handleCurveDragMove(event) {
  if (!activeDragPoint) return;
  
  event.preventDefault();
  const svg = activeDragPoint.svg;
  
  let yVal = chartYValueFromEvent(svg, event);
  if (!Number.isFinite(yVal)) return;
  if (activeDragPoint.dragKind === "compensation-simulation") {
    yVal = outputToneForSimulatedGain(activeDragPoint.channel, activeDragPoint.tone, yVal);
  }
  yVal = clampNumber(yVal, 0, 100, 0);
  yVal = Math.round(yVal * 10) / 10;
  
  const key = activeDragPoint.key;
  state.curveOverrides[key] = { locked: true, outputTone: yVal };
  state.results = applyCurveOverrides(state.results, state.curveOverrides);
  
  const tableRow = document.querySelector(`input[data-curve-field="outputTone"][data-curve-key="${key}"]`);
  if (tableRow) {
    tableRow.value = yVal.toFixed(1);
    const checkbox = tableRow.closest("tr")?.querySelector(`input[data-curve-field="locked"][data-curve-key="${key}"]`);
    if (checkbox) checkbox.checked = true;
  }
  
  const filtered = state.activeCurveChannel && state.activeCurveChannel !== "all"
    ? state.results.filter((row) => row.channel === state.activeCurveChannel)
    : state.results;
  
  renderCurveChartsOnly(filtered);
}

function handleCurveDragEnd(event) {
  if (!activeDragPoint) return;
  
  document.querySelectorAll(".chart-dot.dragging").forEach((dot) => dot.classList.remove("dragging"));
  
  activeDragPoint = null;
  
  state.curveOverrides = pruneCurveOverrides(state.results, state.curveOverrides);
  state.results = applyCurveOverrides(state.results, state.curveOverrides);
  state.safetyIssues = analyzeCurveSafety(state.results);
  state.g7 = currentG7Preview();
  if (state.g7Compensation) state.g7Compensation = currentG7Compensation();
  
  renderShell(state, els);
  _renderAnalyze(state, els);
  _renderCurve(state, els);
  _renderG7(state, els);
  _renderInstrument(state, els);
  _renderExport(state, els);
  _renderReport(state, els);
  persistCurrentProjectDraft();
}

function chartYValueFromEvent(svg, event) {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

  const padTop = Number(svg.dataset.chartPadTop) || 42;
  const padBottom = Number(svg.dataset.chartPadBottom) || 48;
  const height = Number(svg.dataset.chartHeight) || 420;
  const yMin = Number(svg.dataset.chartYMin);
  const yMax = Number(svg.dataset.chartYMax);
  const min = Number.isFinite(yMin) ? yMin : 0;
  const max = Number.isFinite(yMax) ? yMax : 100;
  const plotH = height - padTop - padBottom;
  if (plotH <= 0 || max <= min) return NaN;
  const value = max - ((svgP.y - padTop) / plotH) * (max - min);
  return Math.max(min, Math.min(max, value));
}

function outputToneForSimulatedGain(channel, tone, simulatedGain) {
  const desiredSimulatedTone = Number(tone) + Number(simulatedGain);
  const points = state.results
    .filter((row) => row.channel === channel && Number.isFinite(Number(row.tone)) && Number.isFinite(Number(row.measuredTone)))
    .map((row) => ({ tone: Number(row.tone), measuredTone: Number(row.measuredTone) }))
    .sort((a, b) => a.tone - b.tone);
  if (!points.length || !Number.isFinite(desiredSimulatedTone)) return Number(tone);
  if (desiredSimulatedTone <= points[0].measuredTone) return points[0].tone;
  const last = points[points.length - 1];
  if (desiredSimulatedTone >= last.measuredTone) return last.tone;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (desiredSimulatedTone <= right.measuredTone) {
      const span = right.measuredTone - left.measuredTone;
      if (Math.abs(span) < 0.001) return left.tone;
      const ratio = (desiredSimulatedTone - left.measuredTone) / span;
      return left.tone + ratio * (right.tone - left.tone);
    }
  }
  return Number(tone);
}

function renderCurveChartsOnly(filtered) {
  renderCurveChart(els.curveChart, filtered, state.safetyIssues);
  if (els.compensationSimulationChart) {
    renderCompensationSimulationChart(els.compensationSimulationChart, buildCompensationSimulation(filtered));
  }
}

function handleMouseMove(event) {
  const tooltip = document.getElementById("chart-tooltip");
  if (!tooltip) return;
  
  const svg = event.currentTarget;
  const isCurveChart = svg.id === "curveChart";
  const isMeasChart = svg.id === "measurementChart";
  if (!isCurveChart && !isMeasChart) return;
  
  if (activeDragPoint) {
    tooltip.hidden = true;
    return;
  }

  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

  const pad = { left: 58, right: 24, top: 42, bottom: 48 };
  const width = 720;
  const height = 420;
  const plotW = width - pad.left - pad.right;

  if (svgP.x < pad.left - 10 || svgP.x > width - pad.right + 10 ||
      svgP.y < pad.top - 10 || svgP.y > height - pad.bottom + 10) {
    hideHover();
    return;
  }

  const dots = Array.from(svg.querySelectorAll(".chart-dot"));
  if (!dots.length) {
    hideHover();
    return;
  }

  let closestDot = null;
  let minDistance = Infinity;
  
  for (const dot of dots) {
    if (dot.classList.contains("reference-dot")) continue;

    const cx = Number(dot.getAttribute("cx"));
    const cy = Number(dot.getAttribute("cy"));
    if (isNaN(cx) || isNaN(cy)) continue;

    const dist = (cx - svgP.x) ** 2 + (cy - svgP.y) ** 2;
    if (dist < minDistance) {
      minDistance = dist;
      closestDot = dot;
    }
  }

  if (closestDot && minDistance < 2500) {
    const cx = Number(closestDot.getAttribute("cx"));
    const cy = Number(closestDot.getAttribute("cy"));
    
    let hoverLine = svg.querySelector(".hover-line");
    let hoverHighlight = svg.querySelector(".hover-highlight");
    
    if (!hoverLine || !hoverHighlight) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "chart-hover-group");
      g.setAttribute("style", "pointer-events: none;");
      
      hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hoverLine.setAttribute("class", "hover-line");
      hoverLine.setAttribute("stroke", "#3b82f6");
      hoverLine.setAttribute("stroke-width", "1");
      hoverLine.setAttribute("stroke-dasharray", "3 3");
      
      hoverHighlight = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hoverHighlight.setAttribute("class", "hover-highlight");
      hoverHighlight.setAttribute("fill", "none");
      hoverHighlight.setAttribute("stroke", "#3b82f6");
      hoverHighlight.setAttribute("stroke-width", "2");
      hoverHighlight.setAttribute("r", "7");
      
      g.appendChild(hoverLine);
      g.appendChild(hoverHighlight);
      svg.appendChild(g);
    }
    
    hoverLine.setAttribute("x1", cx);
    hoverLine.setAttribute("y1", pad.top);
    hoverLine.setAttribute("x2", cx);
    hoverLine.setAttribute("y2", height - pad.bottom);
    hoverLine.style.display = "block";
    
    hoverHighlight.setAttribute("cx", cx);
    hoverHighlight.setAttribute("cy", cy);
    hoverHighlight.style.display = "block";

    const channel = closestDot.dataset.dotChannel;
    const tone = Number(closestDot.dataset.dotX);
    const row = state.results.find((r) => r.channel === channel && Math.abs(r.tone - tone) < 0.01);
    
    if (row) {
      const mode = els.modeSelect.value;
      const isCtv = mode === "ctv";
      
      const channelColors = { C: "#0891b2", M: "#be185d", Y: "#ca8a04", K: "#111827" };
      const chColor = channelColors[channel] || "#2563eb";
      
      let html = `
        <div class="chart-tooltip-header">
          <span class="chart-tooltip-badge" style="background-color: ${chColor}">${channel}</span>
          <strong>阶调 ${tone}%</strong>
        </div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">实测 ${isCtv ? "CTV" : "TVI"}:</span>
          <span class="chart-tooltip-value">${signed(row.measuredTvi)}%</span>
        </div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">目标 ${isCtv ? "CTV" : "TVI"}:</span>
          <span class="chart-tooltip-value">${row.targetTvi.toFixed(1)}%</span>
        </div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">实测偏差:</span>
          <span class="chart-tooltip-value ${Math.abs(row.tviDelta) > (isCtv ? 3 : 4) ? "negative" : "positive"}">${signed(row.tviDelta)}%</span>
        </div>
        <div class="chart-tooltip-row" style="border-top: 1px dashed rgba(0,0,0,0.08); padding-top: 4px; margin-top: 4px;">
          <span class="chart-tooltip-label">补偿输出:</span>
          <span class="chart-tooltip-value" style="color: var(--blue);">${row.outputTone.toFixed(1)}%</span>
        </div>
      `;
      
      if (document.body.classList.contains("dark-theme")) {
        html = html.replace("rgba(0,0,0,0.08)", "rgba(255,255,255,0.08)");
      }
      
      tooltip.innerHTML = html;
      tooltip.hidden = false;
      positionChartTooltip(tooltip, event);
    } else {
      tooltip.hidden = true;
    }
  } else {
    hideHover();
  }
}

function hideHover() {
  const tooltip = document.getElementById("chart-tooltip");
  if (tooltip) tooltip.hidden = true;
  
  const hoverLines = document.querySelectorAll(".hover-line");
  const hoverHighlights = document.querySelectorAll(".hover-highlight");
  hoverLines.forEach(l => l.style.display = "none");
  hoverHighlights.forEach(h => h.style.display = "none");
}

function positionChartTooltip(tooltip, event) {
  const offset = 14;
  const margin = 8;
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  const rect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  let left = event.clientX + offset;
  let top = event.clientY + offset;

  if (left + rect.width + margin > viewportWidth) {
    left = event.clientX - rect.width - offset;
  }
  if (top + rect.height + margin > viewportHeight) {
    top = event.clientY - rect.height - offset;
  }

  left = Math.max(margin, Math.min(left, viewportWidth - rect.width - margin));
  top = Math.max(margin, Math.min(top, viewportHeight - rect.height - margin));
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function signed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}`;
}
