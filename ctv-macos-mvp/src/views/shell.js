import { channelsPresent } from "../curve-engine.js";
import { summarizeLabVerification } from "../analysis-engine.js?v=20260522-g7-verify";
import { buildSuggestedArchivePath, summarizeCurveSafety } from "../exporter.js?v=20260521-icc-p4";
import { buildIccGenerationGate } from "../icc-generation-gate.js?v=20260525-statusbar-pass-1";
import { compareRuns, formatMetricChange } from "../run-compare.js?v=20260521-icc-p4";
import { escapeAttr, escapeHtml } from "../shared.js";
import { t, translateDynamicText } from "../translations.js?v=20260525-statusbar-pass-1";
import { algorithmDescription, deltaFormulaLabel } from "../ui-labels.js";
import { num, statusClass } from "./helpers.js?v=20260525-statusbar-pass-1";
import { targetName, visibleWarnings } from "./data.js?v=20260525-statusbar-pass-1";

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
    els.desktopOpenFileButton.disabled = !Boolean(window.__TAURI__?.dialog?.open && window.__TAURI__?.core?.invoke);
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
            <span class="job-run-statuses">
              <span class="status ${statusClass(job.latest.g7Status || job.latest.metrics?.g7Status)}">${escapeHtml(job.latest.g7Status || job.latest.metrics?.g7Status || t("g7_not_run_label", "未运行"))}</span>
              <span class="status ${job.latest.curveQualityStatus === "Ready" ? "pass" : job.latest.curveQualityStatus === "Blocked" ? "fail" : "warning"}">${escapeHtml(job.latest.curveQualityStatus || job.latest.metrics?.curveQualityStatus || "Curve")}</span>
            </span>
          </button>
          <div class="run-card-actions">
            <button class="secondary-mini" type="button" data-job-select-key="${escapeAttr(job.key)}">${escapeHtml(t("view_runs_button", "查看 Run"))}</button>
            <button class="secondary-mini" type="button" data-job-export-key="${escapeAttr(job.key)}">${escapeHtml(t("export_job_button", "导出作业"))}</button>
            <button class="secondary-mini" type="button" data-job-rename-key="${escapeAttr(job.key)}">${escapeHtml(t("rename_job_button", "重命名作业"))}</button>
            <button class="danger-mini" type="button" data-job-delete-key="${escapeAttr(job.key)}">${escapeHtml(t("delete_job_button", "删除作业"))}</button>
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
  const compare = state.runs.length >= 2 ? compareRuns(state.runs[0], state.runs[1]) : null;
  const iccGate = buildIccGenerationGate({ runs: state.runs || [], standard: state.standard, requireG7: state.settings?.requireG7ForIcc !== false });
  const generatedAt = new Date().toLocaleString();
  const jobs = groupJobRuns(state.runs || []);

  if (els.printReportButton) els.printReportButton.disabled = !state.results.length;

  els.reportSummary.innerHTML = `
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
