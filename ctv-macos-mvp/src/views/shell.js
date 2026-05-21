import { channelsPresent } from "../curve-engine.js";
import { summarizeLabVerification } from "../analysis-engine.js?v=20260521-icc-p2";
import { buildSuggestedArchivePath, summarizeCurveSafety } from "../exporter.js?v=20260521-icc-p2";
import { compareRuns, formatMetricChange } from "../run-compare.js?v=20260521-icc-p2";
import { escapeAttr, escapeHtml } from "../shared.js";
import { algorithmDescription, deltaFormulaLabel } from "../ui-labels.js";
import { num, statusClass } from "./helpers.js";
import { targetName, visibleWarnings } from "./data.js";

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
  const jobTitle = state.measurements.length ? `${els.jobPressInput.value || "当前"} 测量任务` : "未加载测量数据";
  const jobMeta = state.measurements.length
    ? `${state.importInfo?.sourceFormat || "Data"} / ${state.measurements.length} 个单色阶调点 / ${usableCount} 个可计算点 / ${channels.join(" ")} 通道 / ${state.standard.name}`
    : `${state.standard.name} / 等待导入或手动输入`;
  const diagnosisTitle = state.diagnosis?.title || (state.measurements.length ? "等待诊断" : "未加载测量数据");
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
  if (els.runG7Button) els.runG7Button.disabled = !hasMeasurements;
  if (els.generateG7CompensationButton) els.generateG7CompensationButton.disabled = !hasMeasurements;
  if (els.calculateButton) els.calculateButton.disabled = !hasMeasurements || state.manualDirty;
  if (els.applyManualButton) els.applyManualButton.disabled = !state.manualRows.length;
  if (els.clearManualButton) els.clearManualButton.disabled = !state.manualRows.length;
  if (els.desktopOpenFileButton) {
    els.desktopOpenFileButton.disabled = !Boolean(window.__TAURI__?.dialog?.open && window.__TAURI__?.core?.invoke);
    els.desktopOpenFileButton.title = els.desktopOpenFileButton.disabled
      ? "浏览器预览请使用上方文件选择框；桌面 App 会启用原生打开对话框。"
      : "使用 macOS/Windows 原生文件对话框打开测量或项目档案。";
  }

  if (els.statusBar) {
    const parts = [];
    parts.push(escapeHtml(jobMeta));
    parts.push(els.modeSelect ? escapeHtml(`模式:${els.modeSelect.value.toUpperCase()}`) : "");
    if (els.targetSelect) parts.push(escapeHtml(`目标:${targetName(els.targetSelect.value)}`));
    if (state.measurements.length) parts.push(escapeHtml(`${state.measurements.length}测点`));
    if (state.results.length) parts.push(escapeHtml(`${state.results.length}曲线点`));
    const condition = state.importInfo?.metadata?.measurement_condition;
    if (condition) parts.push(escapeHtml(condition));
    if (els.ratioInput) parts.push(escapeHtml(`欠补偿${els.ratioInput.value}%`));
    const press = els.jobPressInput?.value;
    if (press) parts.push(escapeHtml(press));
    parts.push(`<span class="status-bar-diagnosis ${state.diagnosis?.level || ""}">${escapeHtml(diagnosisTitle)}</span>`);
    els.statusBar.innerHTML = parts.filter(Boolean).join('<span class="bar-sep">|</span>');
  }
}

export function renderControlValues(els) {
  if (els.smoothValue) els.smoothValue.textContent = els.smoothInput.value;
}

function runCompareText(state, runs = state.runs) {
  if (runs.length < 2) return "<strong>Run 比较</strong><p>保存至少两次 Run 后显示补偿前后变化。</p>";
  const compare = compareRuns(runs[0], runs[1]);
  if (!compare) return "<strong>Run 比较</strong><p>缺少可比较的 Run 指标。</p>";
  return `
    <strong>Run 比较</strong>
    <p>最新: ${escapeHtml(compare.latest.createdAt || "")} / 上一次: ${escapeHtml(compare.previous.createdAt || "")}</p>
    <p>平均 TVI 偏差: <span class="${changeClass(compare.avgTviDelta)}">${formatMetricChange(compare.avgTviDelta, "%")}</span></p>
    <p>最大 ΔE: <span class="${changeClass(compare.maxDeltaE)}">${formatMetricChange(compare.maxDeltaE)}</span></p>
    <p>G7: <span class="${changeClass(compare.g7StatusChange)}">${escapeHtml(compare.g7StatusText)}</span> / NPDC wΔL*: <span class="${changeClass(compare.g7WeightedAverage)}">${formatMetricChange(compare.g7WeightedAverage)}</span></p>
    <p>G7 结论: ${escapeHtml(compare.g7ConclusionText)}</p>
    <p>G7 主要问题: ${escapeHtml(compare.g7PriorityText)}</p>
    <p>NPDC 最大 wΔL*: <span class="${changeClass(compare.g7MaxNpdcDelta)}">${formatMetricChange(compare.g7MaxNpdcDelta)}</span> / Gray 最大 wΔCh: <span class="${changeClass(compare.g7MaxGrayCh)}">${formatMetricChange(compare.g7MaxGrayCh)}</span></p>
    <p>曲线质量: ${escapeHtml(compare.curveQualityText)} / 警告 <span class="${changeClass(compare.curveWarnings)}">${formatMetricChange(compare.curveWarnings)}</span> / 严重 <span class="${changeClass(compare.curveDangers)}">${formatMetricChange(compare.curveDangers)}</span></p>
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
            <span>当前只显示作业：<strong>${escapeHtml(selectedJobName)}</strong></span>
            <button class="secondary-mini" type="button" data-job-clear-filter>显示全部作业</button>
          </div>
        ` : "",
        ...jobs.map((job) => `
        <article class="job-run-card${selectedJobKey === job.key ? " active" : ""}">
          <button class="job-run-open" type="button" data-run-open-index="${job.latestIndex}" aria-label="打开 ${escapeAttr(job.name)}">
            <strong>${escapeHtml(job.name)}</strong>
            <span>${job.runs.length} 次 Run / 最新 ${escapeHtml(job.latest.createdAt || "")}</span>
            <span>${job.latest.measurements || job.latest.archive?.measurements?.length || 0} 测点 / ${job.latest.results || job.latest.archive?.results?.length || 0} 曲线点</span>
            <span><span class="status ${statusClass(job.latest.g7Status || job.latest.metrics?.g7Status)}">${escapeHtml(job.latest.g7Status || job.latest.metrics?.g7Status || "未运行")}</span> <span class="status ${job.latest.curveQualityStatus === "Ready" ? "pass" : job.latest.curveQualityStatus === "Blocked" ? "fail" : "warning"}">${escapeHtml(job.latest.curveQualityStatus || job.latest.metrics?.curveQualityStatus || "Curve")}</span></span>
          </button>
          <div class="run-card-actions">
            <button class="secondary-mini" type="button" data-job-select-key="${escapeAttr(job.key)}">查看Run</button>
            <button class="secondary-mini" type="button" data-job-export-key="${escapeAttr(job.key)}">导出作业</button>
            <button class="secondary-mini" type="button" data-job-rename-key="${escapeAttr(job.key)}">重命名作业</button>
            <button class="danger-mini" type="button" data-job-delete-key="${escapeAttr(job.key)}">删除作业</button>
          </div>
        </article>
      `),
      ].join("")
      : "<p class=\"empty-run-list\">保存 Run 后，这里会形成作业列表；每个作业下面可以保留多次 Run。</p>";
  }
  els.runBody.innerHTML = visibleItems.length
    ? visibleItems.map(({ run, index }) => `
      <tr>
        <td><button class="text-button" type="button" data-run-open-index="${index}">${escapeHtml(run.createdAt || "")}</button><div class="cell-note">${escapeHtml(runName(run, index))}</div></td>
        <td>${escapeHtml(run.standard)}</td>
        <td>${run.measurements}</td>
        <td>${run.results}</td>
        <td>${escapeHtml(run.diagnosis)}</td>
        <td>${run.ratio}%</td>
        <td>${num(run.avgTviDelta)}</td>
        <td>${num(run.maxDeltaE)}</td>
        <td>${escapeHtml(run.storagePath || "")}</td>
        <td>${escapeHtml(run.g7Status || "")}${run.g7ConclusionTitle ? `<br><small>${escapeHtml(run.g7ConclusionTitle)}</small>` : ""}</td>
        <td>${escapeHtml(run.curveQualityStatus || run.metrics?.curveQualityStatus || "")}</td>
        <td class="run-row-actions">
          <button class="secondary-mini" type="button" data-run-rename-index="${index}">重命名</button>
          <button class="danger-mini" type="button" data-run-delete-index="${index}">删除</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="12">${selectedJobKey ? "这个作业还没有保存 Run。" : "还没有保存 Run。"}</td></tr>`;
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
  const jobs = groupJobRuns(state.runs || []);
  const selectedJob = jobs.find((job) => job.key === state.selectedJobKey) || jobs[0];
  const suggestedPath = buildSuggestedArchivePath({
    customer: els.jobCustomerInput.value,
    press: els.jobPressInput.value,
    generatedAt: new Date().toISOString(),
  });
  els.exportSummary.innerHTML = `
    <strong>导出上下文</strong>
    <p>标准: ${state.standard.name}</p>
    <p>算法: ${els.modeSelect.value.toUpperCase()} / ${targetName(els.targetSelect.value)}</p>
    <p>公式: ${algorithmDescription(els.modeSelect.value)}</p>
    <p>ΔE 公式: ${deltaFormulaLabel(els.deltaFormulaSelect.value)}</p>
    <p>欠补偿比例: ${els.ratioInput.value}%</p>
    <p>曲线质量: ${quality.status} / 警告 ${quality.warnings} / 严重 ${quality.dangers}</p>
    <p>G7: ${escapeHtml(state.g7?.status || "未运行")} / NPDC wΔL* ${num(state.g7?.weightedAverage)} / Gray wΔCh 最大 ${num(state.g7?.maxGrayCh)}</p>
    <p>测量条件: ${state.importInfo?.metadata?.measurement_condition || "未指定"}</p>
    <p>曲线点: ${state.results.length}</p>
    <p>建议项目路径: ${escapeHtml(suggestedPath)}</p>
    <p>Job 档案: ${jobs.length ? `${jobs.length} 个作业 / ${state.runs.length} 次 Run；当前导出 ${escapeHtml(selectedJob?.name || "最新作业")}` : "还没有保存 Run，暂不能导出 Job 档案。"}</p>
    <p>JSON 导入: 文件选择框可识别单次项目档案、单个 Job 档案和全部 Job 历史。</p>
    <p>提醒: ${warnings.length ? escapeHtml(warnings.join(" / ")) : "无"}</p>
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
  const generatedAt = new Date().toLocaleString();
  const jobs = groupJobRuns(state.runs || []);

  if (els.printReportButton) els.printReportButton.disabled = !state.results.length;

  els.reportSummary.innerHTML = `
    ${reportKpi("客户 / 机器", `${els.jobCustomerInput.value || "未填"} / ${els.jobPressInput.value || "未填"}`)}
    ${reportKpi("标准", state.standard?.name || "未选择")}
    ${reportKpi("算法", `${els.modeSelect.value.toUpperCase()} / ${targetName(els.targetSelect.value)}`)}
    ${reportKpi("欠补偿比例", `${els.ratioInput.value}%`)}
    ${reportKpi("测量点 / 曲线点", `${state.measurements.length} / ${state.results.length}`)}
    ${reportKpi("ΔE 公式", deltaFormulaLabel(els.deltaFormulaSelect.value))}
    ${reportKpi("G7", g7.status || "未运行", statusClass(g7.status))}
    ${reportKpi("曲线质量", quality.status, quality.status === "Ready" ? "pass" : quality.dangers ? "danger" : "warning")}
    <div class="summary-box span-card report-context">
      <strong>报告上下文</strong>
      <p>纸张: ${escapeHtml(els.jobPaperInput.value || "未填")} / 设备: ${escapeHtml(els.jobDeviceInput.value || "未填")} / 操作员: ${escapeHtml(els.jobOperatorInput.value || "未填")}</p>
      <p>诊断: ${escapeHtml(state.diagnosis?.title || "等待诊断")} / 测量条件: ${escapeHtml(state.importInfo?.metadata?.measurement_condition || "未指定")} / 生成时间: ${escapeHtml(generatedAt)}</p>
      <p>作业库: ${jobs.length ? `${jobs.length} 个作业 / ${state.runs.length} 次 Run；可在 Export 导出 Job 档案` : "还没有保存 Run。"}</p>
      <p>提醒: ${warnings.length ? escapeHtml(warnings.join(" / ")) : "无"}</p>
      ${els.jobNoteInput.value ? `<p>备注: ${escapeHtml(els.jobNoteInput.value)}</p>` : ""}
    </div>
  `;

  els.reportG7Conclusion.innerHTML = `
    <p><span class="status ${statusClass(conclusion.level || g7.status)}">${escapeHtml(conclusion.title || "G7 未运行")}</span></p>
    <p>${escapeHtml(conclusion.summary || "运行 G7 验证后，这里会显示 NPDC、灰平衡和 ΔE 的结论。")}</p>
    <p>NPDC wΔL*: ${num(g7.weightedAverage)} / Max ${num(g7.maxNpdcDelta)} / Gray wΔCh Max: ${num(g7.maxGrayCh)} / Max ΔE: ${num(g7.maxDeltaE)}</p>
    ${reportList("主要问题", conclusion.priorityItems)}
    ${reportList("建议动作", conclusion.recommendations)}
  `;

  els.reportLabSummary.innerHTML = `
    <p><span class="status ${statusClass(lab.status)}">${escapeHtml(lab.status)}</span> 可比色块 ${lab.comparable}/${lab.total}</p>
    <p>平均 ΔE: ${num(lab.avgDeltaE)} / 最大 ΔE: ${num(lab.maxDeltaE)}</p>
    <p>Pass ${lab.pass} / Warning ${lab.warning} / Fail ${lab.fail} / Missing ${lab.missing}</p>
    <p>当前公式: ${deltaFormulaLabel(els.deltaFormulaSelect.value)}。有纸白测量并启用 SCCA 时，Lab 参考会按纸白差异校正。</p>
  `;

  els.reportCurveSummary.innerHTML = `
    <p><span class="status ${quality.status === "Ready" ? "pass" : quality.dangers ? "fail" : "warning"}">${escapeHtml(quality.status)}</span> 警告 ${quality.warnings} / 严重 ${quality.dangers}</p>
    <p>平均 |TVI/CTV 偏差|: ${num(tvi.avgAbs)}% / 最大 |偏差|: ${num(tvi.maxAbs)}% / 通道: ${channelsPresent(state.measurements).join(" ") || "无"}</p>
    <p>生产诊断: ${escapeHtml(state.diagnosis?.title || "等待诊断")} / 建议欠补偿: ${escapeHtml(String(state.diagnosis?.ratio ?? els.ratioInput.value))}%</p>
    <p>解释: 图表中的折点来自实测点、插值点、端点保护和锁定点；曲线质量检查用于提示跳变、反向、过度修正和手动锁定风险。</p>
  `;

  els.reportRunCompare.innerHTML = compare
    ? reportRunCompareText(compare)
    : "<p>保存至少两次 Run 后，这里会显示补偿前后 TVI、ΔE、G7 和曲线质量变化。</p>";
}

export function renderSettings(state, els) {
  const isTauri = Boolean(window.__TAURI_INTERNALS__);
  if (els.settingsModeSelect) els.settingsModeSelect.value = els.modeSelect.value;
  if (els.settingsTargetSelect) els.settingsTargetSelect.value = els.targetSelect.value;
  if (els.settingsSmoothInput) els.settingsSmoothInput.value = els.smoothInput.value;
  if (els.settingsLimitInput) els.settingsLimitInput.value = els.limitInput.value;
  if (els.settingsRatioInput) els.settingsRatioInput.value = els.ratioInput.value;
  if (els.settingsDensityFilterSelect) els.settingsDensityFilterSelect.value = "status_t";
  els.desktopSummary.innerHTML = `
    <p>目标路线：Web MVP -> Tauri macOS .app -> 同项目编译 Windows。</p>
    <p>项目档案结构：jobs/客户-机器-日期/runs/时间.json。</p>
    <p>运行环境：${isTauri ? "Tauri 桌面容器" : "浏览器预览 / 静态 Web MVP"}</p>
    <p>桌面骨架：已准备 src-tauri，后续安装 Rust 与 Tauri CLI 后可打包。</p>
  `;
}

function reportKpi(label, value, level = "") {
  return `<div class="kpi-card ${level || ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function reportList(title, items = []) {
  const cleanItems = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!cleanItems.length) return `<p>${escapeHtml(title)}: 暂无。</p>`;
  return `
    <div class="report-list-block">
      <strong>${escapeHtml(title)}</strong>
      <ul class="report-list">
        ${cleanItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function reportRunCompareText(compare) {
  return `
    <p>最新: ${escapeHtml(compare.latest.createdAt || "")} / 上一次: ${escapeHtml(compare.previous.createdAt || "")}</p>
    <p>平均 TVI 偏差: <span class="${changeClass(compare.avgTviDelta)}">${formatMetricChange(compare.avgTviDelta, "%")}</span></p>
    <p>最大 ΔE: <span class="${changeClass(compare.maxDeltaE)}">${formatMetricChange(compare.maxDeltaE)}</span></p>
    <p>G7: <span class="${changeClass(compare.g7StatusChange)}">${escapeHtml(compare.g7StatusText)}</span> / ${escapeHtml(compare.g7ConclusionText)}</p>
    <p>主要问题: ${escapeHtml(compare.g7PriorityText)}</p>
    <p>曲线质量: ${escapeHtml(compare.curveQualityText)} / 警告 <span class="${changeClass(compare.curveWarnings)}">${formatMetricChange(compare.curveWarnings)}</span> / 严重 <span class="${changeClass(compare.curveDangers)}">${formatMetricChange(compare.curveDangers)}</span></p>
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
