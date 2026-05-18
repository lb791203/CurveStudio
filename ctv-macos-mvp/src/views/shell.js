import { channelsPresent } from "../curve-engine.js";
import { summarizeLabVerification } from "../analysis-engine.js?v=20260518-report-view";
import { buildSuggestedArchivePath, summarizeCurveSafety } from "../exporter.js?v=20260518-report-view";
import { compareRuns, formatMetricChange } from "../run-compare.js?v=20260518-report-view";
import { escapeHtml } from "../shared.js";
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
  els.jobTitle.textContent = state.measurements.length ? `${els.jobPressInput.value || "当前"} 测量任务` : "未加载测量数据";
  els.jobMeta.textContent = state.measurements.length
    ? `${state.importInfo?.sourceFormat || "Data"} / ${state.measurements.length} 个单色阶调点 / ${usableCount} 个可计算点 / ${channels.join(" ")} 通道 / ${state.standard.name}`
    : `${state.standard.name} / 等待导入或手动输入`;
  els.diagnosisBadge.textContent = state.diagnosis?.title || "等待诊断";
  els.diagnosisBadge.className = `status-pill ${state.diagnosis?.level || ""}`;
  const disabled = !hasFreshResults;
  [
    els.saveRunButton, els.exportCsvButton, els.exportHarmonyButton,
    els.exportPrinergyButton, els.exportSimpleRipButton, els.exportCgatsButton,
    els.exportG7CsvButton, els.exportG7JsonButton, els.exportJsonButton,
  ].forEach((el) => { if (el) el.disabled = disabled; });
  if (els.runG7Button) els.runG7Button.disabled = !hasMeasurements;
  if (els.calculateButton) els.calculateButton.disabled = !hasMeasurements || state.manualDirty;
  if (els.applyManualButton) els.applyManualButton.disabled = !state.manualRows.length;
  if (els.clearManualButton) els.clearManualButton.disabled = !state.manualRows.length;
}

export function renderControlValues(els) {
  if (els.smoothValue) els.smoothValue.textContent = els.smoothInput.value;
}

function runCompareText(state) {
  if (state.runs.length < 2) return "<strong>Run 比较</strong><p>保存至少两次 Run 后显示补偿前后变化。</p>";
  const compare = compareRuns(state.runs[0], state.runs[1]);
  if (!compare) return "<strong>Run 比较</strong><p>缺少可比较的 Run 指标。</p>";
  return `
    <strong>Run 比较</strong>
    <p>最新: ${escapeHtml(compare.latest.createdAt || "")} / 上一次: ${escapeHtml(compare.previous.createdAt || "")}</p>
    <p>平均 TVI 偏差: <span class="${changeClass(compare.avgTviDelta)}">${formatMetricChange(compare.avgTviDelta, "%")}</span></p>
    <p>最大 ΔE: <span class="${changeClass(compare.maxDeltaE)}">${formatMetricChange(compare.maxDeltaE)}</span></p>
    <p>G7: <span class="${changeClass(compare.g7StatusChange)}">${escapeHtml(compare.g7StatusText)}</span> / Weighted Avg: <span class="${changeClass(compare.g7WeightedAverage)}">${formatMetricChange(compare.g7WeightedAverage)}</span></p>
    <p>G7 结论: ${escapeHtml(compare.g7ConclusionText)}</p>
    <p>G7 主要问题: ${escapeHtml(compare.g7PriorityText)}</p>
    <p>NPDC 最大 ΔTone: <span class="${changeClass(compare.g7MaxNpdcDelta)}">${formatMetricChange(compare.g7MaxNpdcDelta, "%")}</span> / Gray Ch 最大: <span class="${changeClass(compare.g7MaxGrayCh)}">${formatMetricChange(compare.g7MaxGrayCh)}</span></p>
    <p>曲线质量: ${escapeHtml(compare.curveQualityText)} / 警告 <span class="${changeClass(compare.curveWarnings)}">${formatMetricChange(compare.curveWarnings)}</span> / 严重 <span class="${changeClass(compare.curveDangers)}">${formatMetricChange(compare.curveDangers)}</span></p>
    <div class="run-compare-grid">
      ${compare.channelRows.map((row) => `
        <span><strong>${row.channel}</strong> <span class="${changeClass(row.change)}">${formatMetricChange(row.change, "%")}</span></span>
      `).join("")}
    </div>
  `;
}

export function renderRuns(state, els) {
  els.runBody.innerHTML = state.runs.length
    ? state.runs.map((run) => `
      <tr>
        <td>${run.createdAt}</td>
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
      </tr>
    `).join("")
    : "<tr><td colspan=\"11\">还没有保存 Run。</td></tr>";
  els.runCompareSummary.innerHTML = runCompareText(state);
}

function changeClass(change) {
  if (!change || change.direction === "unknown" || change.direction === "same") return "";
  return change.direction === "improved" ? "positive" : "negative";
}

export function renderExport(state, els) {
  const warnings = visibleWarnings(state, els);
  const quality = summarizeCurveSafety(state.safetyIssues || []);
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
    <p>G7: ${escapeHtml(state.g7?.status || "未运行")} / Weighted Avg ${num(state.g7?.weightedAverage)} / Gray Ch 最大 ${num(state.g7?.maxGrayCh)}</p>
    <p>测量条件: ${state.importInfo?.metadata?.measurement_condition || "未指定"}</p>
    <p>曲线点: ${state.results.length}</p>
    <p>建议项目路径: ${escapeHtml(suggestedPath)}</p>
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
      <p>提醒: ${warnings.length ? escapeHtml(warnings.join(" / ")) : "无"}</p>
      ${els.jobNoteInput.value ? `<p>备注: ${escapeHtml(els.jobNoteInput.value)}</p>` : ""}
    </div>
  `;

  els.reportG7Conclusion.innerHTML = `
    <p><span class="status ${statusClass(conclusion.level || g7.status)}">${escapeHtml(conclusion.title || "G7 未运行")}</span></p>
    <p>${escapeHtml(conclusion.summary || "运行 G7 验证后，这里会显示 NPDC、灰平衡和 ΔE 的结论。")}</p>
    <p>Weighted Avg: ${num(g7.weightedAverage)} / Max ΔE: ${num(g7.maxDeltaE)} / Max NPDC ΔTone: ${num(g7.maxNpdcDelta)} / Max Gray Ch: ${num(g7.maxGrayCh)}</p>
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
    : "<strong>Run 对比</strong><p>保存至少两次 Run 后，这里会显示补偿前后 TVI、ΔE、G7 和曲线质量变化。</p>";
}

export function renderSettings(state, els) {
  const isTauri = Boolean(window.__TAURI_INTERNALS__);
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
    <strong>Run 对比</strong>
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
