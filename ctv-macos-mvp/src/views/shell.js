import { channelsPresent } from "../curve-engine.js";
import { summarizeLabVerification } from "../analysis-engine.js?v=20260522-g7-verify";
import { buildSuggestedArchivePath, summarizeCurveSafety } from "../exporter.js?v=20260521-icc-p4";
import { buildIccGenerationGate } from "../icc-generation-gate.js?v=20260525-statusbar-pass-1";
import { compareRuns, formatMetricChange } from "../run-compare.js?v=20260521-icc-p4";
import { escapeAttr, escapeHtml } from "../shared.js";
import { t, translateDynamicText } from "../translations.js";
import { algorithmDescription, deltaFormulaLabel } from "../ui-labels.js";
import { displayPatchLabel, num, statusClass } from "./helpers.js?v=20260604-patch-labels-1";
import { targetName, visibleWarnings } from "./data.js?v=20260525-statusbar-pass-1";
import { buildAuditReportComparison } from "../audit-report.js";
import { SML_ISO_12647_2_2007_DENSITY_TARGETS } from "../standards.js";
import { canUseDesktopFileDialog } from "../desktop-io.js";

export function renderShell(state, els) {
  const channels = channelsPresent(state.measurements);
  const usableCount = state.measurements.filter((row) =>
    Number.isFinite(row.measuredTvi) || Number.isFinite(row.measuredTone) || Number.isFinite(row.density) || Number.isFinite(row.colorimetricTone)
  ).length;
  const hasMeasurements = state.measurements.length > 0;
  const hasResults = state.results.length > 0;
  const hasFreshResults = hasResults && !state.manualDirty;
  if (els.workflowContextToolbar) {
    els.workflowContextToolbar.hidden = true;
  }
  const jobTitle = state.measurements.length
    ? `${els.jobPressInput.value || t("current_press_label", "当前")} ${t("measurement_job_suffix", "测量任务")}`
    : t("no_measurement_loaded", "未加载测量数据");
  const jobMeta = state.measurements.length
    ? `${state.importInfo?.sourceFormat || "Data"} / ${state.measurements.length} ${t("solid_tone_points_label", "个单色阶调点")} / ${usableCount} ${t("usable_points_label", "个可计算点")} / ${channels.join(" ")} ${t("channel_suffix_label", "通道")} / ${state.standard.name}`
    : `${state.standard.name} / ${t("waiting_import_manual", "等待导入或手动输入")}`;
  const diagnosisTitle = translateDynamicText(state.diagnosis?.title || (state.measurements.length ? t("awaiting_diagnosis", "等待诊断") : t("no_measurement_loaded", "未加载测量数据")));
  if (els.jobTitle) els.jobTitle.textContent = jobTitle;
  if (els.jobMeta) els.jobMeta.textContent = jobMeta;
  if (els.diagnosisBadge) {
    els.diagnosisBadge.textContent = diagnosisTitle;
    els.diagnosisBadge.className = `status-pill ${state.diagnosis?.level || ""}`;
  }
  const disabled = !hasFreshResults;
  [
    els.saveRunButton, els.exportCsvButton, els.exportHarmonyButton,
    els.exportPrinergyButton, els.exportSimpleRipButton, els.exportCgatsButton,
    els.exportG7CsvButton, els.exportG7JsonButton, els.exportJsonButton,
  ].forEach((el) => { if (el) el.disabled = disabled; });
  if (els.exportJobArchiveButton) els.exportJobArchiveButton.disabled = !state.runs.length;
  if (els.exportJobLibraryButton) els.exportJobLibraryButton.disabled = !state.runs.length;
  const iccGate = buildIccGenerationGate({ runs: state.runs || [], standard: state.standard, requireG7: state.settings?.requireG7ForIcc !== false });
  if (els.generateIccProfileButton) {
    els.generateIccProfileButton.disabled = iccGate.status !== "Ready";
    els.generateIccProfileButton.title = iccGate.status === "Ready" ? t("icc_ready_title", "ICC Gate passed; generate an experimental draft.") : iccGate.summary;
  }
  if (els.exportIccReferenceButton) {
    els.exportIccReferenceButton.disabled = !(state.runs || []).length;
    els.exportIccReferenceButton.title = (state.runs || []).length ? t("icc_export_latest_run_title", "Export measurement data from the latest saved Run.") : t("icc_no_run", "No saved Run available for measurement data export.");
  }
  if (els.runG7Button) els.runG7Button.disabled = !hasMeasurements;
  if (els.generateG7CompensationButton) els.generateG7CompensationButton.disabled = !hasMeasurements;
  if (els.calculateButton) els.calculateButton.disabled = !hasMeasurements || state.manualDirty;
  if (els.applyManualButton) els.applyManualButton.disabled = !state.manualRows.length;
  if (els.clearManualButton) els.clearManualButton.disabled = !state.manualRows.length;
  if (els.desktopOpenFileButton) {
    els.desktopOpenFileButton.disabled = !canUseDesktopFileDialog();
    els.desktopOpenFileButton.title = els.desktopOpenFileButton.disabled
      ? t("desktop_open_browser_preview", "Use the file picker above in browser preview; the desktop app enables the native open dialog.")
      : t("desktop_open_native_dialog", "Open measurement files or project archives with the native macOS/Windows file dialog.");
  }

  if (els.statusBar) {
    const parts = [];
    parts.push(`<span class="status-bar-item status-bar-meta" title="${escapeAttr(jobMeta)}">${escapeHtml(jobMeta)}</span>`);
    parts.push(els.modeSelect ? statusBarItem(`${t("mode_status_prefix", "模式:")} ${els.modeSelect.value.toUpperCase()}`) : "");
    if (els.targetSelect) parts.push(statusBarItem(`${t("target_status_prefix", "目标:")} ${targetName(els.targetSelect.value)}`));
    if (state.measurements.length) parts.push(statusBarItem(`${state.measurements.length} ${t("pts_measured", "测点")}`));
    if (state.results.length) parts.push(statusBarItem(`${state.results.length} ${t("pts_curve", "曲线点")}`));
    const condition = state.importInfo?.metadata?.measurement_condition;
    if (condition) parts.push(statusBarItem(condition));
    if (els.ratioInput) parts.push(statusBarItem(`${t("undercomp_status_prefix", "欠补偿")}${els.ratioInput.value}%`));
    const press = els.jobPressInput?.value;
    if (press) parts.push(statusBarItem(press));
    parts.push(`<span class="status-bar-diagnosis ${state.diagnosis?.level || ""}" title="${escapeAttr(diagnosisTitle)}">${escapeHtml(diagnosisTitle)}</span>`);
    els.statusBar.innerHTML = parts.filter(Boolean).join('<span class="bar-sep">|</span>');
  }
}

function statusBarItem(value) {
  return `<span class="status-bar-item">${escapeHtml(value)}</span>`;
}

export function renderControlValues(els) {
  if (els.smoothValue) els.smoothValue.textContent = els.smoothInput.value;
}

function runCompareText(state, runs = state.runs) {
  if (runs.length < 2) return `<strong>${escapeHtml(t("run_compare_title", "Run 比较"))}</strong><p>${escapeHtml(t("run_compare_need_two", "保存至少两次 Run 后显示补偿前后变化。"))}</p>`;
  const compare = compareRuns(runs[0], runs[1]);
  if (!compare) return `<strong>${escapeHtml(t("run_compare_title", "Run 比较"))}</strong><p>${escapeHtml(t("run_compare_missing_metrics", "缺少可比较的 Run 指标。"))}</p>`;
  return `
    <strong>${escapeHtml(t("run_compare_title", "Run 比较"))}</strong>
    <p>${escapeHtml(t("latest_label", "最新"))}: ${escapeHtml(compare.latest.createdAt || "")} / ${escapeHtml(t("previous_label", "上一次"))}: ${escapeHtml(compare.previous.createdAt || "")}</p>
    <p>${escapeHtml(t("avg_tvi_delta_label", "平均 TVI 偏差"))}: <span class="${changeClass(compare.avgTviDelta)}">${formatMetricChange(compare.avgTviDelta, "%")}</span></p>
    <p>${escapeHtml(t("max_delta_e_label", "最大 ΔE"))}: <span class="${changeClass(compare.maxDeltaE)}">${formatMetricChange(compare.maxDeltaE)}</span></p>
    <p>G7: <span class="${changeClass(compare.g7StatusChange)}">${escapeHtml(compare.g7StatusText)}</span> / NPDC wΔL*: <span class="${changeClass(compare.g7WeightedAverage)}">${formatMetricChange(compare.g7WeightedAverage)}</span></p>
    <p>${escapeHtml(t("g7_conclusion_label", "G7 结论"))}: ${escapeHtml(compare.g7ConclusionText)}</p>
    <p>${escapeHtml(t("g7_priority_label", "G7 主要问题"))}: ${escapeHtml(compare.g7PriorityText)}</p>
    <p>NPDC ${escapeHtml(t("max_label", "最大"))} wΔL*: <span class="${changeClass(compare.g7MaxNpdcDelta)}">${formatMetricChange(compare.g7MaxNpdcDelta)}</span> / Gray ${escapeHtml(t("max_label", "最大"))} wΔCh: <span class="${changeClass(compare.g7MaxGrayCh)}">${formatMetricChange(compare.g7MaxGrayCh)}</span></p>
    <p>${escapeHtml(t("curve_quality_label", "曲线质量"))}: ${escapeHtml(compare.curveQualityText)} / ${escapeHtml(t("curve_quality_warnings", "警告"))} <span class="${changeClass(compare.curveWarnings)}">${formatMetricChange(compare.curveWarnings)}</span> / ${escapeHtml(t("curve_quality_dangers", "严重"))} <span class="${changeClass(compare.curveDangers)}">${formatMetricChange(compare.curveDangers)}</span></p>
    <div class="run-compare-grid">
      ${compare.channelRows.map((row) => `
        <span><strong>${row.channel}</strong> <span class="${changeClass(row.change)}">${formatMetricChange(row.change, "%")}</span></span>
      `).join("")}
    </div>
  `;
}

export function renderRuns(state, els) {
  const runItems = (state.runs || []).map((run, index) => ({ run, index }));
  const selectedJobKey = state.selectedJobKey || "";
  const visibleItems = selectedJobKey
    ? runItems.filter((item) => runJobKey(item.run, item.index) === selectedJobKey)
    : runItems;
  const visibleRuns = visibleItems.map((item) => item.run);
  const selectedJobName = visibleItems[0]?.run?.jobName || visibleItems[0]?.run?.jobId || selectedJobKey;
  if (els.jobRunList) {
    const jobs = groupJobRuns(state.runs || []);
    els.jobRunList.innerHTML = jobs.length
      ? [
        selectedJobKey ? `
          <div class="job-filter-bar">
            <span>${escapeHtml(t("current_job_filter_label", "Currently showing job"))}: <strong>${escapeHtml(selectedJobName)}</strong></span>
            <button class="secondary-mini" type="button" data-job-clear-filter>${escapeHtml(t("show_all_jobs_button", "Show all jobs"))}</button>
          </div>
        ` : "",
        ...jobs.map((job) => `
        <article class="job-run-card${selectedJobKey === job.key ? " active" : ""}">
          <button class="job-run-open" type="button" data-run-open-index="${job.latestIndex}" aria-label="${escapeAttr(t("open_button", "Open"))} ${escapeAttr(job.name)}">
            <span class="job-run-title">
              <strong>${escapeHtml(job.name)}</strong>
              <small>${escapeHtml(job.latest.standard || job.latest.archive?.standard || "")}</small>
            </span>
            <span class="job-run-stat">
              <small>${escapeHtml(t("run_latest_label", "Run / 最新"))}</small>
              <strong>${job.runs.length} ${escapeHtml(t("runs_suffix", "次 Run"))} / ${escapeHtml(job.latest.createdAt || "")}</strong>
            </span>
            <span class="job-run-stat">
              <small>${escapeHtml(t("points_curve_label", "测点 / 曲线点"))}</small>
              <strong>${job.latest.measurements || job.latest.archive?.measurements?.length || 0} / ${job.latest.results || job.latest.archive?.results?.length || 0}</strong>
            </span>
          </button>
          <div class="run-card-footer">
            <span class="job-run-statuses">
              <span class="status ${statusClass(job.latest.g7Status || job.latest.metrics?.g7Status)}">${escapeHtml(job.latest.g7Status || job.latest.metrics?.g7Status || t("g7_not_run_label", "未运行"))}</span>
              <span class="status ${job.latest.curveQualityStatus === "Ready" ? "pass" : job.latest.curveQualityStatus === "Blocked" ? "fail" : "warning"}">${escapeHtml(job.latest.curveQualityStatus || job.latest.metrics?.curveQualityStatus || "Curve")}</span>
            </span>
            <div class="run-card-actions">
              <button class="secondary-mini" type="button" data-job-select-key="${escapeAttr(job.key)}">${escapeHtml(t("view_runs_button", "查看 Run"))}</button>
              <button class="secondary-mini" type="button" data-job-export-key="${escapeAttr(job.key)}">${escapeHtml(t("export_job_button", "导出作业"))}</button>
              <button class="secondary-mini" type="button" data-job-rename-key="${escapeAttr(job.key)}">${escapeHtml(t("rename_job_button", "重命名作业"))}</button>
              <button class="danger-mini" type="button" data-job-delete-key="${escapeAttr(job.key)}">${escapeHtml(t("delete_job_button", "删除作业"))}</button>
            </div>
          </div>
        </article>
      `),
      ].join("")
      : `<p class="empty-run-list">${escapeHtml(t("empty_run_list_help", "保存 Run 后，这里会形成作业列表；每个作业下面可以保留多次 Run。"))}</p>`;
  }
  els.runBody.innerHTML = visibleItems.length
    ? visibleItems.map(({ run, index }) => `
      <tr>
        <td><button class="text-button" type="button" data-run-open-index="${index}">${escapeHtml(run.createdAt || "")}</button><div class="cell-note">${escapeHtml(runName(run, index))}</div></td>
        <td>${escapeHtml(run.standard)}</td>
        <td>${run.measurements}</td>
        <td>${run.results}</td>
        <td>${escapeHtml(translateDynamicText(run.diagnosis))}</td>
        <td>${run.ratio}%</td>
        <td>${num(run.avgTviDelta)}</td>
        <td>${num(run.maxDeltaE)}</td>
        <td>${escapeHtml(run.storagePath || "")}</td>
        <td>${escapeHtml(run.g7Status || "")}${run.g7ConclusionTitle ? `<br><small>${escapeHtml(translateDynamicText(run.g7ConclusionTitle))}</small>` : ""}</td>
        <td>${escapeHtml(run.curveQualityStatus || run.metrics?.curveQualityStatus || "")}</td>
        <td class="run-row-actions">
          <button class="secondary-mini" type="button" data-run-rename-index="${index}">${escapeHtml(t("rename_button", "重命名"))}</button>
          <button class="danger-mini" type="button" data-run-delete-index="${index}">${escapeHtml(t("delete_button", "删除"))}</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="12">${selectedJobKey ? escapeHtml(t("selected_job_no_run", "这个作业还没有保存 Run。")) : escapeHtml(t("no_saved_run", "还没有保存 Run。"))}</td></tr>`;
  els.runCompareSummary.innerHTML = runCompareText(state, visibleRuns);
}

function runName(run, index) {
  return run.name || run.jobId || run.runId || `Run ${index + 1}`;
}

function groupJobRuns(runs) {
  const groups = new Map();
  (runs || []).forEach((run, index) => {
    const key = runJobKey(run, index);
    const group = groups.get(key) || { key, name: runJobName(run, key), runs: [], indexes: [] };
    group.runs.push(run);
    group.indexes.push(index);
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    latest: group.runs[0],
    latestIndex: group.indexes[0],
  }));
}

function runJobKey(run, index) {
  return run.jobKey || run.jobId || run.archive?.jobId || run.storagePath?.split("/")?.[1] || `job-${index}`;
}

function runJobName(run, key) {
  return run.jobName || run.jobId || key;
}

function reportComparableRuns(runs = [], selectedJobKey = "") {
  if (!runs.length) return [];
  const latest = runs[0];
  const targetKey = selectedJobKey || runJobKey(latest, 0);
  return runs
    .map((run, index) => ({ run, index }))
    .filter((item) => runJobKey(item.run, item.index) === targetKey)
    .map((item) => item.run);
}

function changeClass(change) {
  if (!change || change.direction === "unknown" || change.direction === "same") return "";
  return change.direction === "improved" ? "positive" : "negative";
}

export function renderExport(state, els) {
  const warnings = visibleWarnings(state, els);
  const quality = summarizeCurveSafety(state.safetyIssues || []);
  const iccGate = buildIccGenerationGate({ runs: state.runs || [], standard: state.standard, requireG7: state.settings?.requireG7ForIcc !== false });
  const jobs = groupJobRuns(state.runs || []);
  const selectedJob = jobs.find((job) => job.key === state.selectedJobKey) || jobs[0];
  const suggestedPath = buildSuggestedArchivePath({
    customer: els.jobCustomerInput.value,
    press: els.jobPressInput.value,
    generatedAt: new Date().toISOString(),
  });
  els.exportSummary.innerHTML = `
    <strong>${escapeHtml(t("export_context_title", "导出上下文"))}</strong>
    <p>${escapeHtml(t("standard_select_label", "印刷标准"))}: ${state.standard.name}</p>
    <p>${escapeHtml(t("algorithm_label", "算法"))}: ${els.modeSelect.value.toUpperCase()} / ${targetName(els.targetSelect.value)}</p>
    <p>${escapeHtml(t("formula_label_short", "公式"))}: ${algorithmDescription(els.modeSelect.value)}</p>
    <p>${escapeHtml(t("rip_compatibility_label", "RIP 兼容"))}: ${escapeHtml(t("rip_compatibility_value", "RIP 手动录入表、RIP 导入 CSV；通用 CSV 可按 SCREEN Trueflow、Heidelberg Prinect、Agfa Apogee、Harlequin、Founder Flow、Esko 等系统的导入模板映射。"))}</p>
    <p>ΔE ${escapeHtml(t("formula_label_short", "公式"))}: ${deltaFormulaLabel(els.deltaFormulaSelect.value)}</p>
    <p>${escapeHtml(t("ratio_label", "自定义欠补偿比例"))}: ${els.ratioInput.value}%</p>
    <p>${escapeHtml(t("gate_curve_quality", "曲线质量"))}: ${quality.status} / ${escapeHtml(t("curve_quality_warnings", "警告"))} ${quality.warnings} / ${escapeHtml(t("curve_quality_dangers", "严重"))} ${quality.dangers}</p>
    <p>G7: ${escapeHtml(state.g7?.status || t("g7_not_run_label", "未运行"))} / NPDC wΔL* ${num(state.g7?.weightedAverage)} / Gray wΔCh Max ${num(state.g7?.maxGrayCh)}</p>
    <p>${escapeHtml(t("icc_gate_label", "ICC 生成闸门"))}: <span class="status ${iccGate.level}">${escapeHtml(iccGate.title)}</span> / ${escapeHtml(iccGate.summary)}</p>
    <p>${escapeHtml(t("measurement_condition_label", "测量条件"))}: ${state.importInfo?.metadata?.measurement_condition || t("unspecified_label", "未指定")}</p>
    <p>${escapeHtml(t("curve_points_label", "曲线点"))}: ${state.results.length}</p>
    <p>${escapeHtml(t("suggested_project_path", "建议项目路径"))}: ${escapeHtml(suggestedPath)}</p>
    <p>${escapeHtml(t("job_archive_label", "Job 档案"))}: ${jobs.length ? `${jobs.length} ${t("jobs_suffix", "个作业")} / ${state.runs.length} ${t("runs_suffix", "次 Run")}；${t("current_export_label", "当前导出")} ${escapeHtml(selectedJob?.name || t("latest_job_label", "最新作业"))}` : t("no_run_export_blocked", "还没有保存 Run，暂不能导出 Job 档案。")}</p>
    <p>JSON ${escapeHtml(t("import_label", "导入"))}: ${escapeHtml(t("json_import_help", "文件选择框可识别单次项目档案、单个 Job 档案和全部 Job 历史。"))}</p>
    <p>${escapeHtml(t("reminder_label", "提醒"))}: ${warnings.length ? escapeHtml(warnings.map(translateDynamicText).join(" / ")) : t("none_label", "无")}</p>
  `;
}

export function renderReport(state, els) {
  const warnings = visibleWarnings(state, els);
  const lab = summarizeLabVerification(state.labRows || []);
  const quality = summarizeCurveSafety(state.safetyIssues || []);
  const g7 = state.g7 || {};
  const conclusion = g7.conclusion || {};
  const tvi = tviDeltaSummary(state.results || []);
  const compareRunsForReport = reportComparableRuns(state.runs || [], state.selectedJobKey || "");
  const compare = compareRunsForReport.length >= 2 ? compareRuns(compareRunsForReport[0], compareRunsForReport[1]) : null;
  const iccGate = buildIccGenerationGate({ runs: state.runs || [], standard: state.standard, requireG7: state.settings?.requireG7ForIcc !== false });
  const generatedAt = new Date().toLocaleString();
  const jobs = groupJobRuns(state.runs || []);

  if (els.printReportButton) els.printReportButton.disabled = !state.results.length;

  els.reportSummary.innerHTML = `
    <div class="report-cover-card">
      <div>
        <span>${escapeHtml(t("report_cover_eyebrow", "客户验厂 / 曲线复测"))}</span>
        <strong>${escapeHtml(t("report_title", "客户/验厂报告"))}</strong>
        <p>${escapeHtml(t("report_cover_summary", "面向现场审核的 TVI / CTV / G7 曲线、Lab 色差和复测状态摘要。"))}</p>
      </div>
      <div class="report-cover-meta">
        <p>${escapeHtml(t("generated_at_label", "Generated At"))}</p>
        <strong>${escapeHtml(generatedAt)}</strong>
        <small>${escapeHtml(state.standard?.name || t("not_selected", "未选择"))} / ${escapeHtml(els.modeSelect.value.toUpperCase())}</small>
      </div>
    </div>
    ${reportKpi(t("customer_press_label", "客户 / 机器"), `${translateDynamicText(els.jobCustomerInput.value || t("not_filled", "未填"))} / ${translateDynamicText(els.jobPressInput.value || t("not_filled", "未填"))}`)}
    ${reportKpi(t("standard_select_label", "标准"), state.standard?.name || t("not_selected", "未选择"))}
    ${reportKpi(t("algorithm_label", "算法"), `${els.modeSelect.value.toUpperCase()} / ${targetName(els.targetSelect.value)}`)}
    ${reportKpi(t("ratio_label", "欠补偿比例"), `${els.ratioInput.value}%`)}
    ${reportKpi(t("measurement_curve_points_label", "测量点 / 曲线点"), `${state.measurements.length} / ${state.results.length}`)}
    ${reportKpi(`ΔE ${t("formula_label_short", "公式")}`, deltaFormulaLabel(els.deltaFormulaSelect.value))}
    ${reportKpi("G7", g7.status || t("g7_not_run_label", "未运行"), statusClass(g7.status))}
    ${reportKpi("ICC Gate", iccGate.status, iccGate.level)}
    ${reportKpi(t("curve_quality_label", "Curve Quality"), quality.status, quality.status === "Ready" ? "pass" : quality.dangers ? "danger" : "warning")}
    <div class="summary-box span-card report-context">
      <strong>${escapeHtml(t("report_context_title", "报告上下文"))}</strong>
      <p>${escapeHtml(t("paper_prefix", "纸张"))}: ${escapeHtml(els.jobPaperInput.value || t("not_filled", "未填"))} / ${escapeHtml(t("device_label", "设备"))}: ${escapeHtml(els.jobDeviceInput.value || t("not_filled", "未填"))} / ${escapeHtml(t("operator_label", "操作员"))}: ${escapeHtml(els.jobOperatorInput.value || t("not_filled", "未填"))}</p>
      <p>${escapeHtml(t("diagnosis_label", "Diagnosis"))}: ${escapeHtml(translateDynamicText(state.diagnosis?.title || t("awaiting_diagnosis", "Awaiting diagnosis")))} / ${escapeHtml(t("measurement_condition_label", "Measurement Condition"))}: ${escapeHtml(translateDynamicText(state.importInfo?.metadata?.measurement_condition || t("unspecified_label", "Unspecified")))} / ${escapeHtml(t("generated_at_label", "Generated At"))}: ${escapeHtml(generatedAt)}</p>
      <p>${escapeHtml(t("job_library_label", "作业库"))}: ${jobs.length ? `${jobs.length} ${t("jobs_suffix", "个作业")} / ${state.runs.length} ${t("runs_suffix", "次 Run")}；${t("job_archive_export_help", "可在 Export 导出 Job 档案")}` : t("no_saved_run", "还没有保存 Run。")}</p>
      <p>${escapeHtml(t("reminder_label", "提醒"))}: ${warnings.length ? escapeHtml(warnings.map(translateDynamicText).join(" / ")) : t("none_label", "无")}</p>
      ${els.jobNoteInput.value ? `<p>${escapeHtml(t("note_label", "备注"))}: ${escapeHtml(els.jobNoteInput.value)}</p>` : ""}
    </div>
  `;

  renderAuditReportComparison(state, els);

  els.reportG7Conclusion.innerHTML = `
    <p><span class="status ${statusClass(conclusion.level || g7.status)}">${escapeHtml(translateDynamicText(conclusion.title || t("g7_not_run_label", "G7 Not Run")))}</span></p>
    <p>${escapeHtml(translateDynamicText(conclusion.summary || t("g7_report_not_run_help", "After running G7 verification, NPDC, gray balance, and ΔE conclusions will appear here.")))}</p>
    <p>NPDC wΔL*: ${num(g7.weightedAverage)} / Max ${num(g7.maxNpdcDelta)} / Gray wΔCh Max: ${num(g7.maxGrayCh)} / Max ΔE: ${num(g7.maxDeltaE)}</p>
    ${reportList(t("main_issues_label", "Main Issues"), conclusion.priorityItems)}
    ${reportList(t("recommended_actions_label", "Recommended Actions"), conclusion.recommendations)}
  `;

  els.reportLabSummary.innerHTML = `
    <p><span class="status ${statusClass(lab.status)}">${escapeHtml(lab.status)}</span> ${escapeHtml(t("comparable_patches_label", "Comparable Patches"))} ${lab.comparable}/${lab.total}</p>
    <p>${escapeHtml(t("avg_delta_e_label", "Average ΔE"))}: ${num(lab.avgDeltaE)} / ${escapeHtml(t("max_delta_e_label", "Max ΔE"))}: ${num(lab.maxDeltaE)}</p>
    <p>Pass ${lab.pass} / Warning ${lab.warning} / Fail ${lab.fail} / Missing ${lab.missing}</p>
    <p>${escapeHtml(t("current_formula_label", "Current Formula"))}: ${deltaFormulaLabel(els.deltaFormulaSelect.value)}. ${escapeHtml(t("scca_formula_report_help", "When paper white is measured and SCCA is enabled, Lab references are corrected by the paper-white difference."))}</p>
  `;

  els.reportCurveSummary.innerHTML = `
    <p><span class="status ${quality.status === "Ready" ? "pass" : quality.dangers ? "fail" : "warning"}">${escapeHtml(quality.status)}</span> ${escapeHtml(t("curve_quality_warnings", "Warnings"))} ${quality.warnings} / ${escapeHtml(t("curve_quality_dangers", "Severe"))} ${quality.dangers}</p>
    <p>${escapeHtml(t("avg_tvi_ctv_delta_label", "Average |TVI/CTV Delta|"))}: ${num(tvi.avgAbs)}% / ${escapeHtml(t("max_abs_delta_label", "Max |Delta|"))}: ${num(tvi.maxAbs)}% / ${escapeHtml(t("channel_label", "Channel"))}: ${channelsPresent(state.measurements).join(" ") || t("none_label", "None")}</p>
    <p>${escapeHtml(t("production_diagnosis_label", "Production Diagnosis"))}: ${escapeHtml(translateDynamicText(state.diagnosis?.title || t("awaiting_diagnosis", "Awaiting diagnosis")))} / ${escapeHtml(t("suggested_undercomp_label", "Suggested Under-Comp"))}: ${escapeHtml(String(state.diagnosis?.ratio ?? els.ratioInput.value))}%</p>
    <p>${escapeHtml(t("explanation_label", "Explanation"))}: ${escapeHtml(t("curve_quality_explanation", "Chart control points come from measured points, interpolated points, endpoint protection, and locked points; curve quality checks flag jumps, reversals, over-correction, and manual-lock risks."))}</p>
  `;

  if (els.reportIccGate) {
    els.reportIccGate.innerHTML = renderIccGenerationGate(iccGate);
  }

  els.reportRunCompare.innerHTML = compare
    ? reportRunCompareText(compare)
    : `<p>${escapeHtml(t("report_run_compare_need_two", "保存至少两次 Run 后，这里会显示补偿前后 TVI、ΔE、G7 和曲线质量变化。"))}</p>`;
}

function renderAuditReportComparison(state, els) {
  if (!els.reportAuditComparison) return;
  const comparison = buildAuditReportComparison(state.auditReport);
  const hasAuditOrData = Boolean(comparison || state.measurements?.length || state.results?.length || state.labRows?.length);
  if (typeof document !== "undefined") {
    const reportView = document.querySelector(".view[data-view='report']");
    if (reportView) {
      reportView.classList.toggle("has-audit-report", hasAuditOrData);
    }
  }
  if (!hasAuditOrData) {
    els.reportAuditComparison.hidden = true;
    els.reportAuditComparison.innerHTML = "";
    return;
  }
  els.reportAuditComparison.hidden = false;
  const productionPanel = renderProductionAuditReport(state, els);
  if (!comparison) {
    els.reportAuditComparison.innerHTML = productionPanel;
    return;
  }
  const tvi50 = comparison.tviRows.filter((row) => Math.abs(row.tone - 50) < 0.01);
  const densitySolids = comparison.densityRows.filter((row) => Math.abs(row.tone - 100) < 0.01);
  const findingItems = comparison.overall.primaryFindings || [];
  els.reportAuditComparison.innerHTML = `
    ${productionPanel}
    <div class="audit-source-review">
      <div class="audit-report-head">
        <div>
          <strong>${escapeHtml(t("audit_report_compare_title", "来源验厂报告复核"))}</strong>
          <p>${escapeHtml(comparison.title)} / ${escapeHtml(comparison.subtitle)}</p>
          <small>${escapeHtml(t("audit_report_print_hint", "用于核对照片/验厂报告转录值；带 Review 的项目表示原报告未给出明确容差，需要人工确认。"))}</small>
        </div>
        <div class="audit-score-card">
          <span>${escapeHtml(t("audit_report_score_label", "标准评分"))}</span>
          <strong>${escapeHtml(String(comparison.overall.standardScorePercent ?? "N/A"))}%</strong>
          <small>${escapeHtml(t("audit_report_level_label", "等级"))} ${escapeHtml(String(comparison.overall.standardScoreLevel ?? "N/A"))}</small>
        </div>
      </div>
      <div class="audit-conclusion-card">
        <div>
          <strong>${escapeHtml(t("audit_report_conclusion_title", "验厂摘要"))}</strong>
          <p>${escapeHtml(t("audit_report_overall_status_label", "总状态"))}: <span class="status ${statusClass(comparison.overall.overallStatus || "Review")}">${escapeHtml(comparison.overall.overallStatus || t("status_review", "待复核"))}</span></p>
        </div>
        ${findingItems.length ? `<div><strong>${escapeHtml(t("audit_report_findings_label", "报告要点"))}</strong>${reportList("", findingItems)}</div>` : ""}
      </div>
      <div class="audit-count-grid">
        ${auditCountCard("TVI", comparison.counts.tvi)}
        ${auditCountCard(t("audit_report_substrate_label", "纸张"), comparison.counts.substrate)}
        ${auditCountCard("Lab ΔE", comparison.counts.lab)}
        ${auditCountCard(t("gray_balance_label", "灰平衡"), comparison.counts.gray)}
        ${auditCountCard(t("audit_report_density_label", "密度"), comparison.counts.density, t("audit_report_loaded_label", "已加载"))}
      </div>
      <div class="audit-report-grid">
        ${auditMiniTable("TVI 50%", [t("channel_label", "通道"), t("audit_report_value_label", "报告"), t("audit_report_delta_label", "偏差"), t("audit_report_tolerance_label", "容差"), t("audit_report_result_label", "结果")], tvi50.map((row) => [
          row.channel,
          `${fmtAudit(row.report)} / ${fmtAudit(row.targetReport)}`,
          fmtAudit(row.deltaReport),
          fmtAudit(row.tolerance),
          auditStatusBadge(row.auditStatus),
        ]))}
        ${auditMiniTable("Lab ΔE", [t("audit_report_patch_label", "色块"), t("audit_report_value_label", "报告"), t("audit_report_tolerance_label", "容差"), t("audit_report_result_label", "结果")], comparison.labRows.map((row) => [
          `${row.section} ${row.patch}`,
          fmtAudit(row.report),
          fmtAudit(row.tolerance),
          auditStatusBadge(row.auditStatus),
        ]))}
        ${auditMiniTable(t("audit_report_gray_delta_h_title", "三灰 ΔH"), [t("audit_report_patch_label", "色块"), t("audit_report_value_label", "报告"), t("audit_report_tolerance_label", "容差"), t("audit_report_result_label", "结果")], comparison.grayRows.map((row) => [
          row.patch,
          fmtAudit(row.report),
          fmtAudit(row.tolerance),
          auditStatusBadge(row.auditStatus),
        ]))}
        ${auditMiniTable(t("audit_report_density_label", "密度"), [t("channel_label", "通道"), t("target_label", "目标"), t("audit_report_value_label", "报告"), t("audit_report_delta_label", "偏差"), t("audit_report_result_label", "结果")], densitySolids.map((row) => [
          row.channel,
          fmtAudit(row.target),
          fmtAudit(row.print),
          fmtAudit(row.delta),
          auditStatusBadge(row.auditStatus),
        ]))}
      </div>
      <p class="audit-report-note">${escapeHtml(t("audit_report_scope_note", "这是客户验厂报告摘要对照；照片报告不是完整 CGATS/P2P 原始测量文件，因此密度和评分先作为审核参考，不作为完整认证复算。"))}</p>
    </div>
  `;
}

function renderProductionAuditReport(state, els) {
  const toneRows = productionToneRows(state, els);
  const labRows = productionLabRows(state);
  const densityRows = productionDensityRows(state);
  const solidDensityRows = densityRows.filter((row) => Math.abs(Number(row.tone) - 100) < 0.01);
  const midtoneDensityRows = densityRows.filter((row) => Math.abs(Number(row.tone) - 50) < 0.01);
  const grayRows = productionGrayRows(state);
  const toneCounts = countReportStatus(toneRows);
  const labCounts = countReportStatus(labRows);
  const densityCounts = countReportStatus(densityRows);
  const g7Status = state.g7?.status || t("g7_not_run_label", "G7 Not Run");
  const reportStatus = state.auditReport?.auditSummary?.overallStatus || reportOverallStatus([
    ...toneRows.map((row) => row.status),
    ...labRows.map((row) => row.status),
    ...grayRows.map((row) => row.status),
    state.g7?.status,
  ]);
  const standardLabel = state.standard?.name || t("not_selected", "Not selected");
  const condition = state.importInfo?.metadata?.measurement_condition || state.settings?.measurementCondition || t("unspecified_label", "Unspecified");
  const sourceSummary = reportTargetSourceSummary(state);

  return `
    <div class="audit-report-head audit-production-head">
      <div>
        <strong>${escapeHtml(t("production_audit_report_title", "现场验厂报告输出"))}</strong>
        <p>${escapeHtml(t("production_audit_report_help", "参考客户验厂报告结构，将当前 Run 转成可打印的客户/验厂报告：摘要、判定、TVI/CTV、Lab/ΔE、密度与复测状态。"))}</p>
        <small>${escapeHtml(t("production_audit_report_standard_note", "报告以当前软件选择的印刷标准、容差、ΔE 公式和测量条件生成。"))}</small>
        <small>${escapeHtml(sourceSummary)}</small>
      </div>
      <div class="audit-score-card ${statusClass(reportStatus)}">
        <span>${escapeHtml(t("overall_result_label", "总判定"))}</span>
        <strong>${escapeHtml(translateDynamicText(reportStatus))}</strong>
        <small>${escapeHtml(standardLabel)}</small>
      </div>
    </div>
    <div class="audit-report-meta-grid">
      ${auditMetaCard(t("customer_press_label", "客户 / 机器"), `${els.jobCustomerInput.value || t("not_filled", "Not filled")} / ${els.jobPressInput.value || t("not_filled", "Not filled")}`)}
      ${auditMetaCard(t("standard_select_label", "印刷标准"), standardLabel)}
      ${auditMetaCard(t("measurement_condition_label", "测量条件"), condition)}
      ${auditMetaCard("G7", translateDynamicText(g7Status), statusClass(g7Status))}
    </div>
    <div class="audit-count-grid audit-production-counts">
      ${auditCountCard("TVI / CTV", toneCounts)}
      ${auditCountCard("Lab ΔE", labCounts)}
      ${auditCountCard(t("audit_report_density_label", "密度"), densityCounts, t("audit_report_reference_label", "Reference"))}
    </div>
    <div class="audit-chart-grid audit-production-chart-grid">
      ${auditLineChart(t("production_tone_chart_title", "网点扩张曲线"), toneRows, {
        yLabel: "TVI",
        valueKey: "measuredValue",
        targetKey: "targetValue",
        suffix: "%",
        className: "audit-tone-chart",
      })}
      ${auditDensityChart(t("solid_density_chart_title", "实地密度目标 / 实测"), solidDensityRows, "audit-solid-density-chart")}
      ${auditDensityChart(t("midtone_density_chart_title", "50% 密度目标 / 实测"), midtoneDensityRows, "audit-midtone-density-chart")}
      ${auditLabChart(t("production_lab_chart_title", "Lab a*b* 目标 / 实测"), labRows)}
    </div>
    <div class="audit-report-grid">
      ${auditToneMatrixTable(t("production_tone_table_title", "TVI / CTV 关键网点判定"), toneRows)}
      ${auditMiniTable(t("production_lab_table_title", "Lab / ΔE 关键色块判定"), [
        t("audit_report_patch_label", "色块"),
        t("target_label", "目标"),
        t("measured_label", "实测"),
        "ΔE",
        t("audit_report_tolerance_label", "容差"),
        t("audit_report_result_label", "结果"),
      ], labRows.map((row) => [
        row.label,
        formatLabTriplet(row.targetLab),
        formatLabTriplet(row.measuredLab),
        fmtAudit(row.deltaE),
        row.tolerance,
        auditStatusBadge(row.status),
      ]))}
      ${auditMiniTable(t("production_density_table_title", "四色实地密度"), [
        t("channel_label", "通道"),
        t("target_label", "目标"),
        t("measured_label", "实测"),
        t("delta_label", "偏差"),
        t("audit_report_result_label", "结果"),
      ], solidDensityRows.map((row) => [
        row.channel,
        formatDensityTarget(row),
        fmtAudit(row.measured),
        signedPlain(row.delta),
        auditStatusBadge(row.status),
      ]))}
      ${auditMiniTable(t("production_50_density_table_title", "50% 四色密度"), [
        t("channel_label", "通道"),
        t("target_label", "目标"),
        t("measured_label", "实测"),
        t("delta_label", "偏差"),
        t("audit_report_result_label", "结果"),
      ], midtoneDensityRows.map((row) => [
        row.channel,
        formatDensityTarget(row),
        fmtAudit(row.measured),
        signedPlain(row.delta),
        auditStatusBadge(row.status),
      ]))}
      ${grayRows.length ? auditMiniTable(t("production_gray_table_title", "三色灰平衡"), [
        t("audit_report_patch_label", "色块"),
        t("target_label", "目标"),
        t("measured_label", "实测"),
        "ΔH",
        t("audit_report_tolerance_label", "容差"),
        t("audit_report_result_label", "结果"),
      ], grayRows.map((row) => [
        row.label,
        formatLabTriplet(row.targetLab),
        formatLabTriplet(row.measuredLab),
        fmtAudit(row.deltaH),
        fmtAudit(row.tolerance),
        auditStatusBadge(row.status),
      ])) : ""}
    </div>
    <p class="audit-report-note">${escapeHtml(t("production_audit_report_note", "说明：此报告为现场复核和客户沟通版式；正式验收仍以补偿后复测样张、客户标准和设备原始测量文件为准。"))}</p>
  `;
}

function reportTargetSourceSummary(state) {
  const toneSource = state.auditReport
    ? t("audit_report_customer_source", "客户验厂报告")
    : state.standard?.targetSource || t("audit_report_standard_source", "当前印刷标准");
  const labSource = state.auditReport
    ? t("audit_report_customer_lab_source", "客户验厂报告 Lab 目标")
    : state.standard?.labReferenceSource || t("audit_report_standard_lab_source", "当前标准 Lab 参考");
  const densitySource = state.auditReport
    ? t("audit_report_customer_density_source", "客户验厂报告密度目标")
    : state.standard?.densityTargetSource || t("audit_report_process_density_source", "OK 样/过程控制密度范围");
  const toleranceSource = state.standard?.toleranceSource || state.standard?.acceptancePreset || t("audit_report_current_tolerance_source", "当前标准容差");
  return `${t("audit_report_target_source_label", "目标来源")}: ${toneSource} / Lab: ${labSource} / ${t("audit_report_density_source_label", "密度来源")}: ${densitySource} / ${t("audit_report_tolerance_source_label", "容差来源")}: ${toleranceSource}`;
}

function auditMetaCard(label, value, level = "") {
  return `
    <div class="audit-meta-card ${level || ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(translateDynamicText(String(value ?? "")))}</strong>
    </div>
  `;
}

function productionToneRows(state, els) {
  const tones = [25, 50, 75];
  if (state.auditReport?.tviDotGain?.length) {
    return ["C", "M", "Y", "K"].flatMap((channel) => {
      const item = state.auditReport.tviDotGain.find((entry) => entry.channel === channel);
      if (!item) return [];
      const tolerance = auditNumber(item.tolerance ?? state.auditReport.auditRules?.tviDotGainTolerance ?? 5);
      return tones.map((tone) => {
        const targetValue = auditNumber(item.target?.[String(tone)]);
        const measuredValue = auditNumber(item.print?.[String(tone)]);
        const delta = measuredValue - targetValue;
        return {
          channel,
          tone,
          targetValue,
          measuredValue,
          delta,
          tolerance,
          targetSource: "Customer audit report",
          status: reportToleranceStatus(Math.abs(delta), tolerance),
        };
      }).filter((row) => Number.isFinite(row.targetValue) || Number.isFinite(row.measuredValue));
    });
  }
  return ["C", "M", "Y", "K"].flatMap((channel) =>
    tones.map((tone) => {
      const row = nearestReportToneRow(state.results || [], channel, tone);
      if (!row) return null;
      const tolerance = reportToneTolerance(state, els, channel, tone);
      const measuredValue = Number.isFinite(Number(row.measuredTvi))
        ? Number(row.measuredTvi)
        : Number(row.measuredTone) - Number(row.tone);
      let targetValue = Number.isFinite(Number(row.targetTvi))
        ? Number(row.targetTvi)
        : Number(row.targetTone) - Number(row.tone);
      if (state.standard?.id === "sml_printspec_xl75_6c") {
        if (channel === "K") {
          if (tone === 25) targetValue = 12.1;
          else if (tone === 50) targetValue = 17.0;
          else if (tone === 75) targetValue = 13.4;
        } else {
          if (tone === 25) targetValue = 9.3;
          else if (tone === 50) targetValue = 14.3;
          else if (tone === 75) targetValue = 12.3;
        }
      }
      const delta = measuredValue - targetValue;
      return {
        channel,
        tone: Number(row.tone),
        targetValue,
        measuredValue,
        delta,
        tolerance,
        targetSource: state.standard?.targetSource || "Print standard",
        status: reportToleranceStatus(Math.abs(delta), tolerance),
      };
    }).filter(Boolean)
  );
}

function nearestReportToneRow(rows, channel, tone) {
  const candidates = (rows || []).filter((row) => row.channel === channel && Number.isFinite(Number(row.tone)) && Number.isFinite(Number(row.tviDelta)));
  if (!candidates.length) return null;
  return candidates.reduce((best, row) => {
    const distance = Math.abs(Number(row.tone) - tone);
    return !best || distance < best.distance ? { row, distance } : best;
  }, null)?.row || null;
}

function reportToneTolerance(state, els, channel, tone) {
  const mode = els.modeSelect?.value === "ctv" ? "ctv" : "tvi";
  const byStandard = state.standard?.toneTolerances?.[channel]?.[mode]?.[String(tone)];
  if (Number.isFinite(Number(byStandard))) return Number(byStandard);
  return tone === 50 ? 4 : 3;
}

function productionLabRows(state) {
  if (state.auditReport) {
    const report = state.auditReport;
    const rows = [];
    if (report.substrate?.targetLab || report.substrate?.printLab) {
      rows.push({
        label: t("paper_white_label", "纸白"),
        targetLab: report.substrate.targetLab,
        measuredLab: report.substrate.printLab,
        deltaE: labDeltaForReport(report.substrate.printLab, report.substrate.targetLab),
        tolerance: "L 3 / a*b* 2",
        status: substrateStatus(report.substrate),
      });
    }
    for (const row of report.solidColours || []) {
      const tolerance = auditNumber(row.toleranceDeltaE);
      const deltaE = auditNumber(row.printDeltaE);
      rows.push({
        label: `${row.channel || patchChannel(row.patch)} ${t("solid_patch_suffix", "实地")}`,
        targetLab: row.targetLab,
        measuredLab: row.printLab,
        deltaE,
        tolerance: formatDeltaEToleranceLabel({ fail: tolerance }),
        status: Number.isFinite(tolerance) ? reportToleranceStatus(deltaE, tolerance).replace("Warning", "Fail") : "Review",
      });
    }
    for (const row of report.overprints || []) {
      const tolerance = auditNumber(row.toleranceDeltaE);
      const deltaE = auditNumber(row.printDeltaE);
      rows.push({
        label: `${row.channels || patchChannel(row.patch)} ${t("overprint_patch_suffix", "叠印")}`,
        targetLab: row.targetLab,
        measuredLab: row.printLab,
        deltaE,
        tolerance: formatDeltaEToleranceLabel({ fail: tolerance }),
        status: Number.isFinite(tolerance) ? reportToleranceStatus(deltaE, tolerance).replace("Warning", "Fail") : "Review",
      });
    }
    return rows;
  }
  const warning = Number(state.standard?.deltaE?.warning ?? 3.5);
  const fail = Number(state.standard?.deltaE?.fail ?? 4.2);
  return (state.labRows || [])
    .filter((row) => Number.isFinite(Number(row.deltaE)) || row.status)
    .slice(0, 12)
    .map((row) => {
      const deltaE = Number(row.deltaE);
      const isPaper = row.cmyk && ["c", "m", "y", "k"].every((ch) => Math.abs(row.cmyk[ch] || 0) < 0.01);
      const isSolid = row.cmyk && ["C", "M", "Y", "K"].some((channel) => {
        const values = { C: row.cmyk.c, M: row.cmyk.m, Y: row.cmyk.y, K: row.cmyk.k };
        const ch = channel;
        return Math.abs(values[ch] - 100) < 0.01 &&
          Object.entries(values).every(([cand, val]) => cand === ch || Math.abs(val) < 0.01);
      });
      const status = (row.status === "Pass" || row.status === "Warning" || row.status === "Fail" || row.status === "Review")
        ? row.status
        : Number.isFinite(deltaE)
          ? (isPaper || isSolid)
            ? (deltaE <= warning ? "Pass" : deltaE <= fail ? "Warning" : "Fail")
            : "Review"
          : "Review";
      return {
        label: customerPatchLabel(row),
        targetLab: row.referenceLab || row.targetLab || row.standardLab,
        measuredLab: row.lab || row.measuredLab,
        deltaE: Number.isFinite(deltaE) ? deltaE : "N/A",
        tolerance: (isPaper || isSolid) ? formatDeltaEToleranceLabel({ warning, fail }) : "N/A",
        status,
      };
    });
}

function productionDensityRows(state) {
  if (state.auditReport?.density?.length) {
    return (state.auditReport.density || []).flatMap((item) =>
      [100, 50].map((tone) => {
        const target = auditNumber(item.target?.[String(tone)]);
        const measured = auditNumber(item.print?.[String(tone)]);
        if (!Number.isFinite(target) && !Number.isFinite(measured)) return null;
        const targetRange = tone === 100 ? standardDensityRange(state.standard, item.channel) : null;
        return {
          channel: item.channel,
          tone,
          target,
          targetRange,
          targetSource: state.standard?.densityTargetSource || "Customer audit report density target",
          measured,
          delta: measured - target,
          status: tone === 100 ? densityTargetStatus(measured, { value: target, range: targetRange }) : "Reference",
        };
      }).filter(Boolean),
    );
  }
  const byChannelKey = new Map();
  for (const row of state.measurements || []) {
    const channel = row.channel;
    const tone = Number(row.tone);
    const density = Number(row.density);
    if (!["C", "M", "Y", "K"].includes(channel) || !Number.isFinite(density)) continue;
    if (Math.abs(tone - 100) <= 0.01 || Math.abs(tone - 50) <= 0.01) {
      const roundedTone = Math.round(tone);
      const targetInfo = standardDensityTargetInfo(state.standard, channel, roundedTone);
      const target = targetInfo.value;
      const delta = Number.isFinite(target) ? density - target : null;
      const key = `${channel}_${Math.round(tone)}`;
      byChannelKey.set(key, {
        channel,
        tone: roundedTone,
        target: Number.isFinite(target) ? target : null,
        targetRange: targetInfo.range,
        targetSource: targetInfo.source,
        measured: density,
        delta,
        status: densityTargetStatus(density, targetInfo),
      });
    }
  }
  return ["C", "M", "Y", "K"].flatMap((channel) =>
    [100, 50].map((tone) => byChannelKey.get(`${channel}_${tone}`)).filter(Boolean)
  );
}

function standardDensityTargetInfo(standard, channel, tone) {
  const direct = auditNumber(
    standard?.densityTargets?.[channel]?.[String(tone)] ??
    standard?.densityTargets?.[channel]?.[tone],
  );
  const range = tone === 100 ? standardDensityRange(standard, channel) : null;
  if (Number.isFinite(direct)) {
    return {
      value: direct,
      range,
      source: standard?.densityTargetSource || t("audit_report_standard_density_source", "Standard density target"),
    };
  }
  const standardText = `${standard?.name || ""} ${standard?.printCondition || ""}`;
  if (/ISO\s*12647-2:2007\s*Offset/i.test(standardText)) {
    const smlTarget = auditNumber(SML_ISO_12647_2_2007_DENSITY_TARGETS[channel]?.[tone]);
    if (Number.isFinite(smlTarget)) {
      return {
        value: smlTarget,
        range,
        source: t("audit_report_customer_density_source", "Customer audit report density target"),
      };
    }
  }
  return {
    value: NaN,
    range,
    source: standard?.densityTargetSource || t("audit_report_process_density_source", "OK print/process-control density range"),
  };
}

function standardDensityRange(standard, channel) {
  const range = standard?.solidDensityRanges?.[channel];
  if (!Array.isArray(range) || range.length < 2) return null;
  const min = auditNumber(range[0]);
  const max = auditNumber(range[1]);
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null;
}

function densityTargetStatus(measured, targetInfo) {
  if (!Number.isFinite(measured)) return "Review";
  const [min, max] = targetInfo.range || [];
  if (Number.isFinite(min) && Number.isFinite(max)) {
    if (measured >= min && measured <= max) return "Pass";
    const margin = 0.05;
    return measured >= min - margin && measured <= max + margin ? "Warning" : "Fail";
  }
  return Number.isFinite(targetInfo.value) ? "Reference" : "Reference";
}

function productionGrayRows(state) {
  let list = [];
  if (state.auditReport?.threeColourGreys?.length) {
    list = state.auditReport.threeColourGreys.map((row) => ({
      patch: row.patch,
      targetLab: row.targetLab,
      printLab: row.printLab,
      printDeltaH: row.printDeltaH,
      toleranceDeltaH: row.toleranceDeltaH,
    }));
  } else {
    const rawRows = state.importInfo?.rawRows || [];
    const light = rawRows.find((r) => r.patch_type === "gray_balance" && (r.sample_id?.includes("Light") || r.sample_name?.includes("Light")));
    const mid = rawRows.find((r) => r.patch_type === "gray_balance" && (r.sample_id?.includes("Mid") || r.sample_name?.includes("Mid")));
    const dark = rawRows.find((r) => r.patch_type === "gray_balance" && (r.sample_id?.includes("Dark") || r.sample_name?.includes("Dark")));
    
    if (light && mid && dark) {
      list = [
        {
          patch: "Light Grey",
          targetLab: { a: 0.49, b: -2.46 },
          printLab: { l: Number(light.lab_l), a: Number(light.lab_a), b: Number(light.lab_b) },
          toleranceDeltaH: 2.00,
        },
        {
          patch: "Mid Grey",
          targetLab: { a: 0.36, b: -1.81 },
          printLab: { l: Number(mid.lab_l), a: Number(mid.lab_a), b: Number(mid.lab_b) },
          toleranceDeltaH: 2.00,
        },
        {
          patch: "Dark Grey",
          targetLab: { a: 0.22, b: -1.09 },
          printLab: { l: Number(dark.lab_l), a: Number(dark.lab_a), b: Number(dark.lab_b) },
          toleranceDeltaH: 2.00,
        },
      ];
    }
  }

  const labelByPatch = {
    "Light Grey": t("gray_light_label", "三色灰 25%"),
    "Mid Grey": t("gray_mid_label", "三色灰 50%"),
    "Dark Grey": t("gray_dark_label", "三色灰 75%"),
  };

  return list.map((row) => {
    const deltaH = row.printDeltaH !== undefined && row.printDeltaH !== null
      ? auditNumber(row.printDeltaH)
      : auditNumber(Math.hypot(Number(row.printLab?.a) - Number(row.targetLab?.a), Number(row.printLab?.b) - Number(row.targetLab?.b)));
    const tolerance = auditNumber(row.toleranceDeltaH ?? 2.00);
    return {
      label: labelByPatch[row.patch] || row.patch || t("gray_balance_label", "灰平衡"),
      targetLab: row.targetLab,
      measuredLab: row.printLab,
      deltaH,
      tolerance,
      status: reportToleranceStatus(deltaH, tolerance).replace("Warning", "Fail"),
    };
  });
}

function auditLineChart(title, rows, options = {}) {
  const tones = [0, 25, 50, 75, 100];
  const channels = ["C", "M", "Y", "K"];
  const series = channels.map((channel) => {
    const channelRows = rows.filter((row) => row.channel === channel);
    if (!channelRows.length) return null;
    const source = new Map(channelRows.map((row) => [Number(row.tone), row]));
    return {
      channel,
      target: tones.map((tone) => ({ tone, value: tone === 0 || tone === 100 ? 0 : auditNumber(source.get(tone)?.[options.targetKey || "targetValue"]) })),
      measured: tones.map((tone) => ({ tone, value: tone === 0 || tone === 100 ? 0 : auditNumber(source.get(tone)?.[options.valueKey || "measuredValue"]) })),
      tolerance: tones.map((tone) => tone === 0 || tone === 100 ? 0 : auditNumber(source.get(tone)?.tolerance ?? 4)),
    };
  }).filter(Boolean);
  if (!series.length) return "";
  const maxValue = Math.max(20, ...series.flatMap((item) => [...item.target, ...item.measured].map((point) => Number.isFinite(point.value) ? point.value : 0)));
  const bounds = { x: 42, y: 18, w: 300, h: 168, maxY: Math.ceil(maxValue / 5) * 5 };
  const grid = [0, 25, 50, 75, 100].map((tone) => {
    const x = chartX(tone, bounds);
    return `<line x1="${x}" y1="${bounds.y}" x2="${x}" y2="${bounds.y + bounds.h}" class="audit-chart-grid-line" />`;
  }).join("") + [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = bounds.y + bounds.h - bounds.h * ratio;
    return `<line x1="${bounds.x}" y1="${y}" x2="${bounds.x + bounds.w}" y2="${y}" class="audit-chart-grid-line" />`;
  }).join("");
  const bandPoints = tones.map((tone) => {
    const matching = series
      .map((item) => {
        const idx = item.target.findIndex((point) => Math.abs(point.tone - tone) < 0.01);
        if (idx < 0) return null;
        const target = auditNumber(item.target[idx]?.value);
        const tolerance = auditNumber(item.tolerance[idx]);
        if (!Number.isFinite(target) || !Number.isFinite(tolerance)) return null;
        return {
          upper: target + tolerance,
          lower: Math.max(0, target - tolerance),
        };
      })
      .filter(Boolean);
    if (!matching.length) return { tone, upper: NaN, lower: NaN };
    return {
      tone,
      upper: Math.max(...matching.map((item) => item.upper)),
      lower: Math.min(...matching.map((item) => item.lower)),
    };
  });
  const bandUpperPath = straightPath(bandPoints.map((point) => ({ tone: point.tone, value: point.upper })), bounds);
  const bandLowerPath = straightPath([...bandPoints].reverse().map((point) => ({ tone: point.tone, value: point.lower })), bounds);
  const bandPath = bandUpperPath && bandLowerPath ? bandUpperPath + " L" + bandLowerPath.slice(1) : "";
  const paths = series.map((item) => {
    const color = auditChannelColor(item.channel);

    return `
      <path d="${smoothLinePath(item.target, bounds)}" class="audit-chart-target-path" />
      <path d="${smoothLinePath(item.measured, bounds)}" fill="none" stroke="${color}" stroke-width="2.4" />
      ${item.measured.filter((point) => Number.isFinite(point.value)).map((point) => `<circle cx="${chartX(point.tone, bounds)}" cy="${chartY(point.value, bounds)}" r="2.6" fill="${color}" />`).join("")}
    `;
  }).join("");
  return `
    <div class="audit-chart-card ${escapeAttr(options.className || "")}">
      <strong>${escapeHtml(title)}</strong>
      <div class="audit-chart-legend">
        <span><i class="target"></i>${escapeHtml(t("target_label", "目标"))}</span>
        ${channels.map((channel) => `<span><i style="background:${auditChannelColor(channel)}"></i>${channel}</span>`).join("")}
      </div>
      <svg viewBox="0 0 360 220" role="img" aria-label="${escapeAttr(title)}">
        <rect x="0" y="0" width="360" height="220" rx="8" fill="var(--surface)" />
        ${grid}
        <line x1="${bounds.x}" y1="${bounds.y + bounds.h}" x2="${bounds.x + bounds.w}" y2="${bounds.y + bounds.h}" class="audit-chart-axis" />
        <line x1="${bounds.x}" y1="${bounds.y}" x2="${bounds.x}" y2="${bounds.y + bounds.h}" class="audit-chart-axis" />
        ${bandPath ? `<path d="${bandPath} Z" fill="#64748b" fill-opacity="0.12" stroke="none" />` : ""}
        ${paths}
        ${[0, 25, 50, 75, 100].map((tone) => `<text x="${chartX(tone, bounds)}" y="207" text-anchor="middle" class="audit-chart-label">${tone}</text>`).join("")}
        ${[0, bounds.maxY / 2, bounds.maxY].map((value) => `<text x="32" y="${chartY(value, bounds) + 4}" text-anchor="end" class="audit-chart-label">${fmtAudit(value)}</text>`).join("")}
      </svg>
    </div>
  `;
}

function auditDensityChart(title, rows, className = "") {
  const chartRows = rows.filter((row) => Number.isFinite(Number(row.target)) || Number.isFinite(Number(row.measured)));
  if (!chartRows.length) return "";
  const maxValue = Math.max(1, ...chartRows.flatMap((row) => [
    auditNumber(row.target),
    auditNumber(row.measured),
    auditNumber(row.targetRange?.[1]),
  ].filter(Number.isFinite)));
  return `
    <div class="audit-chart-card audit-density-chart ${escapeAttr(className)}">
      <strong>${escapeHtml(title)}</strong>
      <div class="audit-density-bars">
        ${chartRows.map((row) => {
          const targetReference = Number.isFinite(auditNumber(row.target)) ? auditNumber(row.target) : auditNumber(row.targetRange?.[1]);
          const targetPct = Number.isFinite(targetReference) ? Math.max(0, Math.min(100, targetReference / maxValue * 100)) : 0;
          const measuredPct = Number.isFinite(auditNumber(row.measured)) ? Math.max(0, Math.min(100, auditNumber(row.measured) / maxValue * 100)) : 0;
          return `
            <div class="audit-density-row">
              <span>${escapeHtml(row.channel)} ${escapeHtml(String(row.tone))}%</span>
              <div class="audit-density-track"><i style="width:${targetPct}%"></i><b style="width:${measuredPct}%; background:${auditChannelColor(row.channel)}"></b></div>
              <small>${escapeHtml(formatDensityTarget(row))} / ${escapeHtml(fmtAudit(row.measured))}</small>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function auditLabChart(title, rows) {
  const points = rows
    .filter((row) => Number.isFinite(auditNumber(row.targetLab?.a)) && Number.isFinite(auditNumber(row.measuredLab?.a)))
    .slice(0, 12);
  if (!points.length) return "";
  const x = (value) => 180 + Math.max(-100, Math.min(100, auditNumber(value))) * 1.35;
  const y = (value) => 112 - Math.max(-100, Math.min(100, auditNumber(value))) * 0.85;
  return `
    <div class="audit-chart-card audit-lab-chart">
      <strong>${escapeHtml(title)}</strong>
      <div class="audit-chart-legend">
        <span><i class="target-point"></i>${escapeHtml(t("target_label", "目标"))}</span>
        <span><i class="measured-point"></i>${escapeHtml(t("measured_label", "实测"))}</span>
      </div>
      <svg viewBox="0 0 360 220" role="img" aria-label="${escapeAttr(title)}">
        <rect x="0" y="0" width="360" height="220" rx="8" fill="var(--surface)" />
        <line x1="45" y1="112" x2="315" y2="112" class="audit-chart-axis" />
        <line x1="180" y1="27" x2="180" y2="197" class="audit-chart-axis" />
        ${[-100, -50, 0, 50, 100].map((value) => `<line x1="${x(value)}" y1="27" x2="${x(value)}" y2="197" class="audit-chart-grid-line" /><line x1="45" y1="${y(value)}" x2="315" y2="${y(value)}" class="audit-chart-grid-line" />`).join("")}
        ${[30, 60, 90].map((c) => `<ellipse cx="180" cy="112" rx="${c * 1.35}" ry="${c * 0.85}" fill="none" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 4" />`).join("")}
        ${points.map((row) => {
          const targetX = x(row.targetLab?.a);
          const targetY = y(row.targetLab?.b);
          const measuredX = x(row.measuredLab?.a);
          const measuredY = y(row.measuredLab?.b);
          return `
            <line x1="${targetX}" y1="${targetY}" x2="${measuredX}" y2="${measuredY}" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="4 3" />
            <circle cx="${targetX}" cy="${targetY}" r="3.8" fill="var(--surface)" stroke="#64748b" stroke-width="2" />
            <circle cx="${measuredX}" cy="${measuredY}" r="3.8" fill="${patchColor(row.label)}" stroke="#fff" stroke-width="1.2" />
          `;
        }).join("")}
        <text x="306" y="107" class="audit-chart-label">a*</text>
        <text x="185" y="36" class="audit-chart-label">b*</text>
      </svg>
    </div>
  `;
}

function formatDeltaEToleranceLabel({ warning, fail } = {}) {
  const warningValue = auditNumber(warning);
  const failValue = auditNumber(fail);
  if (Number.isFinite(failValue) && (!Number.isFinite(warningValue) || Math.abs(warningValue - failValue) < 0.001)) {
    return `≤ ${fmtAudit(failValue)}`;
  }
  if (Number.isFinite(warningValue) && Number.isFinite(failValue)) {
    return `通过≤${fmtAudit(warningValue)} / 失败>${fmtAudit(failValue)}`;
  }
  if (Number.isFinite(failValue)) return `≤ ${fmtAudit(failValue)}`;
  if (Number.isFinite(warningValue)) return `≤ ${fmtAudit(warningValue)}`;
  return "N/A";
}

function smoothPath(points, bounds) {
  const valid = points.filter((point) => Number.isFinite(point.value));
  if (!valid.length) return "";
  const coords = valid.map((point) => [chartX(point.tone, bounds), chartY(point.value, bounds)]);
  if (coords.length === 1) return `M ${coords[0][0]} ${coords[0][1]}`;
  return coords.reduce((path, point, index) => {
    if (index === 0) return `M ${point[0]} ${point[1]}`;
    const previous = coords[index - 1];
    const cx = (previous[0] + point[0]) / 2;
    return `${path} C ${cx} ${previous[1]}, ${cx} ${point[1]}, ${point[0]} ${point[1]}`;
  }, "");
}

function straightPath(points, bounds) {
  const valid = points.filter((point) => Number.isFinite(point.value));
  if (!valid.length) return "";
  return valid.reduce((path, point, index) => {
    const command = index === 0 ? "M" : "L";
    return `${path}${index === 0 ? "" : " "}${command} ${chartX(point.tone, bounds)} ${chartY(point.value, bounds)}`;
  }, "");
}

function smoothLinePath(points, bounds) {
  const valid = points.filter((point) => Number.isFinite(point.value));
  if (!valid.length) return "";
  const coords = valid.map((point) => [chartX(point.tone, bounds), chartY(point.value, bounds)]);
  if (coords.length < 3) {
    return coords.reduce((path, point, index) => index === 0 ? `M ${point[0]} ${point[1]}` : `${path} L ${point[0]} ${point[1]}`, "");
  }
  return coords.reduce((path, point, index) => {
    if (index === 0) return `M ${point[0]} ${point[1]}`;
    const previous = coords[index - 1];
    const beforePrevious = coords[index - 2] || previous;
    const next = coords[index + 1] || point;
    const cp1x = previous[0] + (point[0] - beforePrevious[0]) / 6;
    const cp1y = previous[1] + (point[1] - beforePrevious[1]) / 6;
    const cp2x = point[0] - (next[0] - previous[0]) / 6;
    const cp2y = point[1] - (next[1] - previous[1]) / 6;
    return `${path} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${point[0]} ${point[1]}`;
  }, "");
}

function chartX(tone, bounds) {
  return bounds.x + (auditNumber(tone) / 100) * bounds.w;
}

function chartY(value, bounds) {
  return bounds.y + bounds.h - (auditNumber(value) / bounds.maxY) * bounds.h;
}

function auditChannelColor(channel) {
  return { C: "#0298bd", M: "#cf1c72", Y: "#d49300", K: "#111827" }[channel] || "#64748b";
}

function patchColor(label = "") {
  if (/C 实地|CM 叠印|Violet/i.test(label)) return "#10bcd0";
  if (/M 实地|MY 叠印|Red/i.test(label)) return "#d946ef";
  if (/Y 实地/i.test(label)) return "#facc15";
  if (/K 实地|CMY/i.test(label)) return "#111827";
  if (/CY 叠印|Green/i.test(label)) return "#22c55e";
  return "#64748b";
}

function labDeltaForReport(printLab, targetLab) {
  const l = auditNumber(printLab?.l) - auditNumber(targetLab?.l);
  const a = auditNumber(printLab?.a) - auditNumber(targetLab?.a);
  const b = auditNumber(printLab?.b) - auditNumber(targetLab?.b);
  return Number.isFinite(l) && Number.isFinite(a) && Number.isFinite(b) ? Math.hypot(l, a, b) : null;
}

function substrateStatus(substrate) {
  const errors = substrate?.error || {};
  const tolerances = substrate?.isoTolerance || {};
  const axes = ["l", "a", "b"];
  if (!axes.some((axis) => Number.isFinite(auditNumber(errors[axis])))) return "Review";
  return axes.every((axis) => !Number.isFinite(auditNumber(tolerances[axis])) || Math.abs(auditNumber(errors[axis])) <= auditNumber(tolerances[axis])) ? "Pass" : "Fail";
}

function customerPatchLabel(row) {
  const displayLabel = displayPatchLabel(row);
  if (displayLabel) return displayLabel;
  if (row.patch) return row.patch;
  if (row.patchType === "paper") return t("paper_white_label", "纸白");
  if (row.channel && Number.isFinite(Number(row.tone))) return `${row.channel} ${fmtAudit(Number(row.tone))}%`;
  return t("patch_label", "Patch");
}

function patchChannel(patch = "") {
  const lookup = { Cyan: "C", Magenta: "M", Yellow: "Y", Black: "K", Red: "MY", Green: "CY", Violet: "CM" };
  return lookup[patch] || patch;
}

function formatLabTriplet(lab) {
  if (!lab) return "N/A";
  const l = auditNumber(lab.l);
  const a = auditNumber(lab.a);
  const b = auditNumber(lab.b);
  const items = [l, a, b].map((value) => Number.isFinite(value) ? value.toFixed(2) : "N/A");
  return items.every((value) => value === "N/A") ? "N/A" : items.join(", ");
}

function auditNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function countReportStatus(rows) {
  return {
    total: rows.length,
    pass: rows.filter((row) => row.status === "Pass").length,
    review: rows.filter((row) => row.status === "Review" || row.status === "Reference").length,
    check: rows.filter((row) => row.status === "Warning" || row.status === "Fail" || row.status === "Check").length,
  };
}

function reportOverallStatus(statuses = []) {
  if (statuses.some((status) => status === "Fail" || status === "danger")) return "Fail";
  if (statuses.some((status) => status === "Warning" || status === "Check")) return "Warning";
  if (statuses.some((status) => status === "Pass")) return "Pass";
  return "Review";
}

function reportToleranceStatus(value, tolerance) {
  if (!Number.isFinite(value) || !Number.isFinite(tolerance)) return "Review";
  if (value <= tolerance) return "Pass";
  if (value <= tolerance * 1.5) return "Warning";
  return "Fail";
}

function signedPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return `${numeric > 0 ? "+" : ""}${fmtAudit(numeric)}%`;
}

function signedPlain(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return `${numeric > 0 ? "+" : ""}${fmtAudit(numeric)}`;
}

function formatDensityTarget(row) {
  if (Number.isFinite(auditNumber(row?.target))) return fmtAudit(row.target);
  const [min, max] = row?.targetRange || [];
  if (Number.isFinite(auditNumber(min)) && Number.isFinite(auditNumber(max))) {
    return `${fmtAudit(auditNumber(min))}-${fmtAudit(auditNumber(max))}`;
  }
  return "N/A";
}

function auditCountCard(label, count, passLabel = t("status_pass", "Pass")) {
  const level = count.check ? "warning" : "pass";
  const checkLabel = t("audit_report_check_label", "Check");
  const reviewLabel = t("audit_report_review_label", "Review");
  const isReferenceOnly = passLabel !== t("status_pass", "Pass") && count.review === count.total;
  const strongValue = isReferenceOnly ? `${count.total}` : `${count.pass}/${count.total}`;
  return `
    <div class="audit-count-card ${level}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(strongValue)}</strong>
      <small>${escapeHtml(isReferenceOnly ? passLabel : `${passLabel} ${count.pass}`)}${count.review && !isReferenceOnly ? ` / ${escapeHtml(reviewLabel)} ${escapeHtml(String(count.review))}` : ""}${count.check ? ` / ${escapeHtml(checkLabel)} ${escapeHtml(String(count.check))}` : ""}</small>
    </div>
  `;
}

function auditMiniTable(title, headers, rows) {
  return `
    <div class="audit-mini-table">
      <strong>${escapeHtml(title)}</strong>
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${formatAuditCell(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function auditToneMatrixTable(title, rows) {
  const tones = [25, 50, 75];
  const channels = ["C", "M", "Y", "K"];
  const rowMap = new Map(rows.map((row) => [`${row.channel}_${Math.round(Number(row.tone))}`, row]));
  return `
    <div class="audit-mini-table audit-tone-matrix">
      <strong>${escapeHtml(title)}</strong>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("input_tone_label", "输入网点"))}</th>
            ${channels.map((channel) => `<th>${escapeHtml(channel)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${tones.map((tone) => `
            <tr>
              <td class="tone-axis">${fmtAudit(tone)}%</td>
              ${channels.map((channel) => {
                const row = rowMap.get(`${channel}_${tone}`);
                if (!row) return `<td class="tone-matrix-cell empty">N/A</td>`;
                return `
                  <td class="tone-matrix-cell">
                    <div><span>${escapeHtml(t("target_label", "目标"))}</span><b>${escapeHtml(fmtAudit(row.targetValue))}%</b></div>
                    <div><span>${escapeHtml(t("measured_label", "实测"))}</span><b>${escapeHtml(fmtAudit(row.measuredValue))}%</b></div>
                    <small>${escapeHtml(signedPercent(row.delta))} / ±${escapeHtml(fmtAudit(row.tolerance))}%</small>
                    ${formatAuditCell(auditStatusBadge(row.status))}
                  </td>
                `;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatAuditCell(cell) {
  return cell?.html ? cell.html : escapeHtml(cell);
}

function fmtAudit(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function auditStatusBadge(status) {
  const normalized = status || "Review";
  const statusMap = {
    Pass: ["pass", t("status_pass", "Pass")],
    Warning: ["warning", t("status_warning", "Warning")],
    Fail: ["fail", t("status_fail", "Fail")],
    Check: ["warning", t("audit_report_check_label", "Check")],
    Review: ["review", t("audit_report_review_label", "Review")],
    Reference: ["review", t("audit_report_reference_label", "Reference")],
  };
  const [level, label] = statusMap[normalized] || ["review", normalized];
  return { html: `<span class="status ${level}">${escapeHtml(label)}</span>` };
}

function renderIccGenerationGate(gate) {
  const blockingChecks = (gate.checks || []).filter((item) => item.status === "fail" && item.required !== false);
  const reviewChecks = (gate.checks || []).filter((item) => item.status === "warning");
  const topChecks = (blockingChecks.length ? blockingChecks : reviewChecks).slice(0, 3);
  const hint = gate.status === "Ready"
    ? t("icc_gate_ready_export_hint", "可在 Export 页面生成 ICC 草稿和 metadata。")
    : t("icc_gate_blocked_hint", "先保存第一次测量与补偿后复测 Run，再重新检查。");
  return `
    <div class="icc-gate-summary-card ${gate.level}">
      <div class="icc-gate-summary-head">
        <span class="status ${gate.level}">${escapeHtml(translateDynamicText(gate.title))}</span>
        <span>${escapeHtml(translateDynamicText(gate.summary))}</span>
      </div>
      <p>${escapeHtml(hint)}</p>
      ${gate.status === "Ready" ? `<p><span class="status warning">${escapeHtml(t("icc_draft_notice", "Current ICC engine is experimental IDW CLUT. Generated .icc is for testing only, not for production RIP use."))}</span></p>` : ""}
      <p>${escapeHtml(t("latest_remeasure_run", "Latest re-measurement Run"))}: ${escapeHtml(gate.latestRun || t("none_label", "None"))} / ${escapeHtml(t("previous_run", "Previous Run"))}: ${escapeHtml(gate.previousRun || t("none_label", "None"))}</p>
      <div class="icc-gate-reasons">
        <strong>${escapeHtml(t("icc_gate_top_reasons", "主要卡点"))}</strong>
        ${topChecks.length ? `<ul>${topChecks.map((item) => `<li><b>${escapeHtml(translateDynamicText(item.label))}</b>: ${escapeHtml(translateDynamicText(item.value || ""))} - ${escapeHtml(translateDynamicText(item.message || ""))}</li>`).join("")}</ul>` : `<p>${escapeHtml(t("icc_gate_no_issue", "No required blockers."))}</p>`}
      </div>
      <details class="icc-gate-details">
        <summary>${escapeHtml(t("icc_gate_detail_summary", "展开详细检查项"))}</summary>
        <div class="gate-check-grid">
          ${(gate.checks || []).map((item) => `
            <div class="gate-check ${item.status}">
              <div class="gate-check-title-row">
                <strong>${escapeHtml(translateDynamicText(item.label))}</strong>
                <span class="status ${item.status === "pass" ? "pass" : item.status === "warning" ? "warning" : "fail"}">${escapeHtml(item.status)}</span>
              </div>
              <p>${escapeHtml(translateDynamicText(item.value || ""))}</p>
              <small>${escapeHtml(translateDynamicText(item.message || ""))}</small>
            </div>
          `).join("")}
        </div>
      </details>
    </div>
  `;
}

export function renderSettings(state, els) {
  const isTauri = Boolean(window.__TAURI_INTERNALS__);
  if (els.settingsModeSelect) els.settingsModeSelect.value = els.modeSelect.value;
  if (els.settingsTargetSelect) els.settingsTargetSelect.value = els.targetSelect.value;
  if (els.settingsSmoothInput) els.settingsSmoothInput.value = els.smoothInput.value;
  if (els.settingsLimitInput) els.settingsLimitInput.value = els.limitInput.value;
  if (els.settingsRatioInput) els.settingsRatioInput.value = els.ratioInput.value;
  if (els.settingsDeltaWarningInput) els.settingsDeltaWarningInput.value = state.standard?.deltaE?.warning ?? 3.5;
  if (els.settingsDeltaFailInput) els.settingsDeltaFailInput.value = state.standard?.deltaE?.fail ?? 4.2;
  if (els.settingsSccaInput) els.settingsSccaInput.checked = Boolean(els.sccaInput?.checked);
  if (els.settingsDensityFilterSelect) els.settingsDensityFilterSelect.value = state.settings?.densityFilter || "status_t";
  if (els.settingsMeasurementConditionSelect) els.settingsMeasurementConditionSelect.value = state.settings?.measurementCondition || "auto";
  if (els.settingsIlluminantSelect) els.settingsIlluminantSelect.value = state.settings?.illuminant || "D50";
  if (els.settingsObserverSelect) els.settingsObserverSelect.value = state.settings?.observer || "2";
  if (els.settingsDeviceAdapterSelect) els.settingsDeviceAdapterSelect.value = state.device?.adapterId || state.settings?.deviceAdapterId || "file";
  if (els.settingsQueueProfileSelect) els.settingsQueueProfileSelect.value = state.device?.queueProfile || state.settings?.queueProfile || "g7";
  if (els.settingsRequireG7Input) els.settingsRequireG7Input.checked = state.settings?.requireG7ForIcc !== false;
  els.desktopSummary.innerHTML = `
    <p>${escapeHtml(t("target_route_label", "Target Route"))}: Web MVP -> Tauri macOS .app -> Windows build from the same project.</p>
    <p>${escapeHtml(t("project_archive_structure_label", "Project Archive Structure"))}: jobs/customer-press-date/runs/time.json.</p>
    <p>${escapeHtml(t("runtime_environment_label", "Runtime Environment"))}: ${isTauri ? "Tauri Desktop Container" : t("browser_preview_runtime", "Browser Preview / Static Web MVP")}</p>
    <p>${escapeHtml(t("desktop_package_label", "Desktop Package"))}: CurveStudio / ${isTauri ? "Running in desktop container" : t("tauri_build_hint", "Can be packaged with npm run tauri:build")}.</p>
  `;
}

function reportKpi(label, value, level = "") {
  return `<div class="kpi-card ${level || ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function reportList(title, items = []) {
  const cleanItems = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!cleanItems.length) return `<p>${escapeHtml(title)}: ${escapeHtml(t("none_label", "None"))}</p>`;
  return `
    <div class="report-list-block">
      <strong>${escapeHtml(title)}</strong>
      <ul class="report-list">
        ${cleanItems.map((item) => `<li>${escapeHtml(translateDynamicText(item))}</li>`).join("")}
      </ul>
    </div>
  `;
}

function reportRunCompareText(compare) {
  return `
    <p>${escapeHtml(t("latest_label", "Latest"))}: ${escapeHtml(compare.latest.createdAt || "")} / ${escapeHtml(t("previous_label", "Previous"))}: ${escapeHtml(compare.previous.createdAt || "")}</p>
    <p>${escapeHtml(t("avg_tvi_delta_label", "Average TVI Delta"))}: <span class="${changeClass(compare.avgTviDelta)}">${formatMetricChange(compare.avgTviDelta, "%")}</span></p>
    <p>${escapeHtml(t("max_delta_e_label", "Max ΔE"))}: <span class="${changeClass(compare.maxDeltaE)}">${formatMetricChange(compare.maxDeltaE)}</span></p>
    <p>G7: <span class="${changeClass(compare.g7StatusChange)}">${escapeHtml(translateDynamicText(compare.g7StatusText))}</span> / ${escapeHtml(translateDynamicText(compare.g7ConclusionText))}</p>
    <p>${escapeHtml(t("main_issues_label", "Main Issues"))}: ${escapeHtml(translateDynamicText(compare.g7PriorityText))}</p>
    <p>${escapeHtml(t("curve_quality_label", "Curve Quality"))}: ${escapeHtml(translateDynamicText(compare.curveQualityText))} / ${escapeHtml(t("curve_quality_warnings", "Warnings"))} <span class="${changeClass(compare.curveWarnings)}">${formatMetricChange(compare.curveWarnings)}</span> / ${escapeHtml(t("curve_quality_dangers", "Severe"))} <span class="${changeClass(compare.curveDangers)}">${formatMetricChange(compare.curveDangers)}</span></p>
  `;
}

function tviDeltaSummary(rows = []) {
  const values = rows.map((row) => Math.abs(Number(row.tviDelta))).filter(Number.isFinite);
  if (!values.length) return { avgAbs: NaN, maxAbs: NaN };
  return {
    avgAbs: values.reduce((sum, value) => sum + value, 0) / values.length,
    maxAbs: Math.max(...values),
  };
}
