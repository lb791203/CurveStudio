import { targetSeries, toExportRows } from "../curve-engine.js?v=20260521-icc-p1";
import { summarizeLabVerification } from "../analysis-engine.js?v=20260521-icc-p1";
import { buildCurveAcceptance } from "../curve-acceptance.js?v=20260521-icc-p1";
import { buildCompensationSimulation, summarizeCompensationSimulation } from "../compensation-simulation.js?v=20260521-icc-p1";
import { renderCurveChart, renderG7Charts, renderLabChromaticityChart, renderMeasurementChart } from "../chart-renderer.js?v=20260521-icc-p1";
import { curveRowKey } from "../curve-overrides.js?v=20260521-icc-p1";
import { escapeAttr, escapeHtml } from "../shared.js?v=20260521-icc-p1";
import { deltaFormulaLabel, methodLabel } from "../ui-labels.js?v=20260521-icc-p1";
import { fmt, num, signed, kpiCard, statusClass, labText, renderCurveAcceptanceSummary } from "./helpers.js?v=20260521-icc-p1";
import { visibleWarnings } from "./data.js?v=20260521-icc-p1";

export function renderAnalyze(state, els) {
  const diagnosis = state.diagnosis || { level: "empty", title: "未诊断", ratio: 50, messages: [] };
  const labSummary = summarizeLabVerification(state.labRows);
  const verificationRows = buildVerificationChecklist(state, els);
  const hasPaperLab = state.manualRows.some((row) => row.patchType === "paper" && [row.labL, row.labA, row.labB].every((v) => v !== "" && Number.isFinite(Number(v))));
  els.diagnosisCards.innerHTML = [
    kpiCard("诊断", diagnosis.title, diagnosis.level),
    kpiCard("建议欠补偿", `${diagnosis.ratio}%`, "neutral"),
    kpiCard(`${deltaFormulaLabel(els.deltaFormulaSelect.value)} 状态`, labSummary.status, labSummary.status === "Pass" ? "pass" : labSummary.status === "Fail" ? "danger" : labSummary.status === "Warning" ? "warning" : "neutral"),
    kpiCard("可比 Lab", `${labSummary.comparable}/${labSummary.total}`, labSummary.comparable ? "pass" : "warning"),
    kpiCard("最大 ΔE", num(labSummary.maxDeltaE), labSummary.fail ? "danger" : labSummary.warning ? "warning" : "neutral"),
    kpiCard("曲线安全问题", state.safetyIssues.length, state.safetyIssues.length ? "warning" : "pass"),
  ].join("");

  const messages = diagnosis.messages?.map((item) => `<p>${escapeHtml(item)}</p>`).join("") || "";
  const sccaMessage = els.sccaInput.checked
    ? hasPaperLab
      ? "<p>SCCA 已启用：参考 Lab 已按纸白差异做 MVP 级平移校正。</p>"
      : "<p>SCCA 已勾选，但缺少纸白 Lab，不能执行纸白校正。</p>"
    : "";
  els.diagnosisCards.insertAdjacentHTML("beforeend", `<div class="kpi-card span-card">${messages}${sccaMessage}</div>`);

  const passCount = verificationRows.filter((row) => row.status === "Pass").length;
  const failCount = verificationRows.filter((row) => row.status === "Fail").length;
  const warningCount = verificationRows.filter((row) => row.status === "Warning").length;
  els.verificationChecklistSummary.textContent = verificationRows.length
    ? `${passCount} / ${verificationRows.length} 项通过${failCount ? `，${failCount} 项失败` : warningCount ? `，${warningCount} 项警告` : ""}`
    : "等待可校验数据";
  els.verificationChecklistBody.innerHTML = verificationRows.length
    ? verificationRows.map((row) => `
      <tr class="verify-row ${statusClass(row.status)}">
        <td><strong>${escapeHtml(row.label)}</strong><div class="cell-note">${escapeHtml(row.note || "")}</div></td>
        <td>${escapeHtml(row.measured)}</td>
        <td>${escapeHtml(row.target)}</td>
        <td><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"4\">导入测量数据并选择标准后显示校验清单。</td></tr>";
  renderLabChromaticityChart(els.labChromaticityChart, state.labRows);

  const sccaBlocked = els.sccaInput.checked && !hasPaperLab;
  els.labBody.innerHTML = state.labRows.length
    ? state.labRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${labText(row.lab)}</td>
        <td>${row.referenceLab ? `${labText(row.referenceLab)}${row.referenceWasSccaCorrected ? " / SCCA" : ""}` : "缺目标"}</td>
        <td>${num(row.deltaL)}</td>
        <td>${num(row.deltaA)}</td>
        <td>${num(row.deltaB)}</td>
        <td>${num(row.deltaE76)}</td>
        <td>${num(row.deltaE94)}</td>
        <td>${num(row.deltaE00)}</td>
        <td>${num(row.deltaECMC)}</td>
        <td><span class="status ${statusClass(row.status)}">${row.status}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="11">${sccaBlocked ? "SCCA 需要纸白 Lab；当前缺少纸白测量。" : "当前没有可做 Lab/ΔE 比对的数据。"}</td></tr>`;
}

export function statusText(state, els) {
  const warnings = visibleWarnings(state, els);
  const lockedCount = state.results.filter((row) => row.overrideLocked).length;
  if (state.results.length) return `已生成 ${state.results.length} 个${els.modeSelect.value === "ctv" ? " CTV" : " TVI"}曲线点${lockedCount ? ` / 人工锁定 ${lockedCount} 点` : ""}${warnings.length ? ` / ${warnings.join(" / ")}` : ""}`;
  if (state.measurements.length) return "已识别测量点，但缺少可计算指标";
  return warnings[0] || "等待导入";
}

export function renderCurve(state, els) {
  els.statusText.textContent = statusText(state, els);
  const filtered = state.activeCurveChannel && state.activeCurveChannel !== "all"
    ? state.results.filter((row) => row.channel === state.activeCurveChannel)
    : state.results;
  const acceptance = buildCurveAcceptance(filtered, state.safetyIssues);
  const qualityMap = curveQualityByPoint(state.safetyIssues);
  els.resultBody.innerHTML = toExportRows(filtered)
    .map((row, index) => {
      const sourceRow = filtered[index];
      const key = curveRowKey(sourceRow);
      const autoOutputTone = Number.isFinite(sourceRow.autoOutputTone) ? sourceRow.autoOutputTone : sourceRow.outputTone;
      const locked = Boolean(sourceRow.overrideLocked);
      const quality = qualityMap.get(key) || { level: "pass", label: "安全", messages: [] };
      return `
      <tr>
        <td><span class="channel ${row.channel}">${row.channel}</span></td>
        <td>${row.inputTone}%</td>
        <td>${row.measuredTone}%</td>
        <td>${row.targetTone}%</td>
        <td class="${Number(row.tviDelta) > 0 ? "negative" : "positive"}">${signed(row.tviDelta)}%</td>
        <td class="zone-start">${row.theoreticalOutputTone}%</td>
        <td>${row.productionOutputTone}%</td>
        <td class="${Number(row.ripAdjustment) < 0 ? "negative" : "positive"}">${row.manualActionZh}</td>
        <td><strong>${row.outputTone}%</strong></td>
        <td><span class="status ${quality.level === "danger" ? "fail" : quality.level}">${escapeHtml(quality.label)}</span>${quality.messages.length ? `<div class="cell-note">${escapeHtml(quality.messages.join(" / "))}</div>` : ""}</td>
        <td><input class="curve-lock-input" type="checkbox" data-curve-field="locked" data-curve-key="${escapeAttr(key)}" ${locked ? "checked" : ""} aria-label="锁定 ${escapeAttr(row.channel)} ${escapeAttr(row.inputTone)}% 输出" /></td>
        <td><input class="curve-output-input" type="number" min="0" max="100" step="0.1" value="${escapeAttr(row.outputTone)}" data-curve-field="outputTone" data-curve-key="${escapeAttr(key)}" aria-label="人工输出 ${escapeAttr(row.channel)} ${escapeAttr(row.inputTone)}%" /></td>
        <td>${num(autoOutputTone)}%</td>
        <td class="cell-text">${row.pointSource === "interpolated" ? "插值" : "实测"}</td>
        <td class="cell-text">${escapeHtml(row.metric)} / ${escapeHtml(methodLabel(row.measurementMethod))}${locked ? " / 人工锁定" : ""}</td>
      </tr>
    `;
    })
    .join("");
  els.curveAcceptanceSummary.innerHTML = renderCurveAcceptanceSummary(acceptance);
  renderCompensationSimulation(filtered, els);
  const reviewRows = acceptanceReviewRows(acceptance.rows, qualityMap);
  els.ripEntryBody.innerHTML = reviewRows.length
    ? reviewRows.map(({ row, quality }) => `
      <tr>
        <td><span class="channel ${row.channel}">${row.channel}</span></td>
        <td>${row.inputTone}%</td>
        <td class="zone-start"><span class="status ${row.level === "increase" ? "warning" : row.level === "reduce" ? "pass" : "neutral"}">${row.action}</span></td>
        <td class="${row.adjustment < 0 ? "negative" : row.adjustment > 0 ? "positive" : ""}">${signed(row.adjustment)}%</td>
        <td><strong>${row.outputTone}%</strong></td>
        <td>${row.measuredTone}%</td>
        <td>${row.targetTone}%</td>
        <td>${reviewReason(row, quality)}</td>
        <td class="cell-text">${escapeHtml(row.metric)} / ${escapeHtml(methodLabel(row.measurementMethod))}</td>
      </tr>
    `).join("")
    : acceptance.rows.length
      ? "<tr><td colspan=\"9\">没有需要单独复核的点；完整录入数据以上方主表和导出文件为准。</td></tr>"
      : "<tr><td colspan=\"9\">尚未生成曲线。</td></tr>";

  renderMeasurementChart(els.measurementChart, state.results, targetSeries(els.targetSelect.value), els.modeSelect.value);
  renderCurveChart(els.curveChart, filtered, state.safetyIssues);

  els.safetySummary.innerHTML = state.safetyIssues.length
    ? renderSafetySummary(state.safetyIssues)
    : "<p>未发现反折、异常跳变或高光/暗调保护问题。</p>";
}

function renderCompensationSimulation(rows, els) {
  if (!els.compensationSimulationSummary || !els.compensationSimulationBody) return;
  const simulationRows = buildCompensationSimulation(rows);
  const summary = summarizeCompensationSimulation(simulationRows);
  els.compensationSimulationSummary.innerHTML = summary.total
    ? `
      <p><strong>模拟验证</strong> <span class="status ${statusClass(summary.status)}">${escapeHtml(summary.status)}</span> 可模拟 ${summary.total} 点，Pass ${summary.pass} / Warning ${summary.warning} / Fail ${summary.fail}</p>
      <p>平均 |偏差|：当前 ${num(summary.avgBefore)}% → 套用后 ${num(summary.avgAfter)}%；改善 ${summary.improved} 点，变差 ${summary.worsened} 点。</p>
      <p>说明：这是按同一次测量得到的机器响应曲线做估算，用来判断补偿方向；正式验收仍需要输出补偿后样张并复测。</p>
    `
    : "<p>尚未生成可模拟的补偿曲线。先导入测量数据并计算曲线。</p>";

  const reviewRows = simulationRows.filter((row) =>
    row.status !== "Pass"
    || row.pointSource !== "interpolated"
    || Math.abs(row.tone - 25) < 0.01
    || Math.abs(row.tone - 50) < 0.01
    || Math.abs(row.tone - 75) < 0.01
    || row.tone <= 10
    || row.tone >= 90
  );
  els.compensationSimulationBody.innerHTML = reviewRows.length
    ? reviewRows.map((row) => `
      <tr>
        <td><span class="channel ${escapeAttr(row.channel)}">${escapeHtml(row.channel)}</span></td>
        <td>${num(row.tone)}%</td>
        <td>${num(row.measuredTone)}%<div class="cell-note">当前偏差 ${signed(row.beforeDelta)}%</div></td>
        <td>${num(row.targetTone)}%</td>
        <td class="zone-start"><strong>${num(row.outputTone)}%</strong></td>
        <td>${num(row.simulatedTone)}%</td>
        <td class="${Math.abs(row.afterDelta) > row.tolerance ? "negative" : "positive"}">${signed(row.afterDelta)}%</td>
        <td class="${row.improvement < -0.05 ? "negative" : row.improvement > 0.05 ? "positive" : ""}">${signed(row.improvement)}%</td>
        <td><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span><div class="cell-note">${escapeHtml(row.basis)} / 容差 ±${num(row.tolerance)}%</div></td>
      </tr>
    `).join("")
    : summary.total
      ? "<tr><td colspan=\"9\">模拟结果全部在容差内；完整点位以上方主表为准。</td></tr>"
      : "<tr><td colspan=\"9\">尚未生成可模拟的补偿曲线。</td></tr>";
}

function renderSafetySummary(issues) {
  const counts = issues.reduce((acc, item) => {
    acc[item.level] = (acc[item.level] || 0) + 1;
    return acc;
  }, {});
  const headline = `<p><strong>曲线质量检查</strong> 警告 ${counts.warning || 0} / 严重 ${counts.danger || counts.fail || 0}</p>`;
  const details = issues
    .slice(0, 12)
    .map((item) => `<p><span class="status ${item.level === "danger" ? "fail" : item.level}">${escapeHtml(item.type)}</span> ${escapeHtml(item.message)}</p>`)
    .join("");
  const more = issues.length > 12 ? `<p>还有 ${issues.length - 12} 条检查提示，详见曲线表“曲线检查”列。</p>` : "";
  return `${headline}${details}${more}`;
}

function acceptanceReviewRows(rows, qualityMap) {
  return (rows || [])
    .map((row) => ({ row, quality: qualityMap.get(`${row.channel}:${Number(row.inputTone).toFixed(3)}`) }))
    .filter(({ row, quality }) =>
      row.level === "increase"
      || quality?.level === "warning"
      || quality?.level === "danger"
      || quality?.level === "fail"
      || row.metric?.includes("人工")
      || row.measurementMethod?.includes("manual")
    );
}

function reviewReason(row, quality) {
  const reasons = [];
  if (row.level === "increase") reasons.push("增加点");
  if (quality?.level && quality.level !== "pass" && quality.level !== "neutral") reasons.push(quality.label || "曲线警告");
  if (row.pointSource === "interpolated") reasons.push("插值");
  return escapeHtml(reasons.join(" / ") || (row.pointSource === "interpolated" ? "插值" : "实测"));
}

function curveQualityByPoint(issues) {
  const rank = { danger: 3, fail: 3, warning: 2, pass: 1, neutral: 0 };
  return (issues || []).reduce((acc, issue) => {
    const tones = issue.relatedTones?.length ? issue.relatedTones : [issue.tone];
    for (const tone of tones) {
      const key = `${issue.channel}:${Number(tone).toFixed(3)}`;
      const existing = acc.get(key) || { level: "pass", label: "安全", messages: [] };
      const level = (rank[issue.level] || 0) > (rank[existing.level] || 0) ? issue.level : existing.level;
      acc.set(key, {
        level,
        label: level === "danger" || level === "fail" ? "不建议直接用" : "警告",
        messages: [...existing.messages, `${issue.type}: ${issue.message}`],
      });
    }
    return acc;
  }, new Map());
}

export function renderG7(state, els) {
  const g7 = state.g7 || {
    status: "Data Incomplete", missing: ["等待数据"],
    kOnlyCount: 0, labPatchCount: 0, grayPatchCount: 0, avgDeltaE: NaN, maxDeltaE: NaN,
    avgGrayCh: NaN, maxGrayCh: NaN, avgNpdcDelta: NaN, maxNpdcDelta: NaN,
    weightedAverage: NaN, weightedDeltaE: NaN, weightedGrayAverage: NaN, weightedGrayMax: NaN,
    npdcRows: [], grayBalanceRows: [],
    grayCandidateCount: 0, p2pPatchCount: 0,
    patchClasses: { p2pTotal: 0, paper: 0, cmykSolids: 0, kOnly: 0, cmyNeutralGray: 0 },
    completenessRows: [],
  };
  const hasNpdcRows = Boolean(g7.npdcRows?.length || g7.npdcSummary?.count || g7.npdcVerification?.some((row) => Number.isFinite(row.deltaL)));
  const hasGrayRows = Boolean(g7.grayBalanceRows?.length || g7.grayVerification?.length || g7.graySummary?.count);
  const hasCharts = Boolean(g7.grayNpdcSummary?.count || g7.npdcSummary?.count || g7.graySummary?.count || g7.weightedDeltaLSummary?.count);
  const hasQuickTables = Boolean(g7.npdcRows?.length || g7.grayBalanceRows?.length);
  const hasCertification = Boolean(g7.npdcVerification?.some((row) => Number.isFinite(row.deltaL)) || g7.grayVerification?.length);
  const hasColorspace = Boolean(g7.colorspaceRows?.some((row) => Number.isFinite(row.deltaE)));
  const hasG7Detail = Boolean(hasCharts || hasQuickTables || hasCertification);
  const sectionAvailability = {
    overview: true,
    charts: hasCharts,
    details: Boolean(hasQuickTables || hasCertification || hasColorspace),
    compensation: Boolean(state.g7Compensation || hasNpdcRows || hasGrayRows),
  };
  if (!hasG7Detail) {
    const missingItems = [...new Set(g7.missing?.length ? g7.missing : ["K-only NPDC 阶调", "CMY gray 灰平衡 Lab", "纸白与 CMYK 实地 Lab"])];
    els.g7Cards.innerHTML = `
      <div class="kpi-card span-card g7-empty-card">
        <p><strong>G7 数据不足</strong> <span class="status warning">不能作为正式 G7 验收</span></p>
        <p>当前缺少 G7 所需的 K-only NPDC、CMY gray 灰平衡或可比 Lab 数据。</p>
        <p><strong>需要补齐</strong> ${missingItems.map(escapeHtml).join(" / ")}</p>
        <p>导入 P2P/TC1617 测量文件，或在手动表录入完整 G7 灰平衡数据后再运行 G7 校验。</p>
      </div>
    `;
  } else {
    els.g7Cards.innerHTML = [
      kpiCard("G7 状态", g7.status, g7.status === "Pass" ? "pass" : g7.status === "Fail" ? "danger" : g7.status === "Disabled" ? "neutral" : "warning"),
      kpiCard("K-only 点数", g7.kOnlyCount, g7.kOnlyCount >= 5 ? "pass" : "warning"),
      kpiCard("Lab 可比色块", g7.labPatchCount, g7.labPatchCount ? "pass" : "warning"),
      kpiCard("Gray 色块", g7.grayPatchCount, g7.grayPatchCount ? "pass" : "warning"),
      kpiCard("P2P/灰候选", g7.grayCandidateCount || 0, g7.grayCandidateCount ? "pass" : "warning"),
      kpiCard("纸白/实地", `${g7.patchClasses?.paper || 0}/${g7.patchClasses?.cmykSolids || 0}`, (g7.patchClasses?.paper && g7.patchClasses?.cmykSolids >= 4) ? "pass" : "warning"),
      kpiCard(`平均 ${deltaFormulaLabel(els.deltaFormulaSelect.value)}`, num(g7.avgDeltaE), "neutral"),
      kpiCard(`最大 ${deltaFormulaLabel(els.deltaFormulaSelect.value)}`, num(g7.maxDeltaE), "neutral"),
      kpiCard("NPDC 平均 wΔL*", num(g7.weightedAverage), "neutral"),
      kpiCard("NPDC 最大 wΔL*", num(g7.maxNpdcDelta), Number(g7.maxNpdcDelta) > Number(g7.tolerances?.npdcMax || 3) ? "warning" : "neutral"),
      kpiCard("灰平衡平均 wΔCh", num(g7.weightedGrayAverage), "neutral"),
      kpiCard("灰平衡最大 wΔCh", num(g7.weightedGrayMax), Number(g7.weightedGrayMax) > Number(g7.tolerances?.grayMax || 3) ? "warning" : "neutral"),
      `<div class="kpi-card span-card"><p><strong>G7 结论</strong> <span class="status ${statusClass(g7.conclusion?.level || g7.status)}">${escapeHtml(g7.conclusion?.title || g7.status)}</span></p><p>${escapeHtml(g7.conclusion?.summary || "")}</p>${(g7.conclusion?.recommendations || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>`,
      `<div class="kpi-card span-card"><p><strong>G7 数据完整性</strong></p>${(g7.completenessRows || []).map((row) => `<p>${row.status === "Pass" ? "Pass" : "Missing"} ${escapeHtml(row.item)}: ${row.count} / ${escapeHtml(row.required)}</p>`).join("")}</div>`,
      `<div class="kpi-card span-card"><p><strong>G7 验证项目</strong></p>${(g7.verificationRows || []).map((row) => `<p><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span> ${escapeHtml(row.item)}: ${num(row.value)} / ${escapeHtml(row.tolerance)}${row.message ? ` / ${escapeHtml(row.message)}` : ""}</p>`).join("")}</div>`,
      `<div class="kpi-card span-card">${g7.missing.length ? `<p><strong>主要问题</strong></p>${g7.missing.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}` : "<p>数据完整性满足第一阶段 G7 预检。</p>"}</div>`,
    ].join("");
  }
  if (els.g7CmySummary) {
    els.g7CmySummary.innerHTML = g7.grayNpdcSummary?.count
      ? metricStrip([
        ["Avg", g7.grayNpdcSummary.weightedAverage, g7.grayNpdcSummary.status],
        ["Max", g7.grayNpdcSummary.weightedMax, g7.grayNpdcSummary.status],
        [g7.grayNpdcSummary.status, "", g7.grayNpdcSummary.status],
      ])
      : "CMY: 数据不足";
  }
  if (els.g7KNpdcSummary) {
    const npdcStatus = g7.npdcSummary?.status;
    els.g7KNpdcSummary.innerHTML = g7.npdcSummary?.count
      ? metricStrip([
        ["Avg", g7.npdcSummary.weightedAverage, npdcStatus],
        ["Max", g7.npdcSummary.weightedMax, npdcStatus],
        [npdcStatus, "", npdcStatus],
      ])
      : "K: 数据不足";
  }
  if (els.g7GrayChartSummary) {
    els.g7GrayChartSummary.innerHTML = g7.graySummary?.count
      ? metricStrip([
        ["Avg", g7.graySummary.avgChroma, g7.graySummary.status],
        ["Max", g7.graySummary.maxChroma, g7.graySummary.status],
        [g7.graySummary.status, "", g7.graySummary.status],
      ])
      : "灰平衡: 数据不足";
  }
  if (els.g7WeightedSummary) {
    els.g7WeightedSummary.innerHTML = g7.weightedDeltaLSummary?.count
      ? metricStrip([
        ["CMY Avg", g7.graySummary?.weightedAverage, g7.graySummary?.status],
        ["CMY Max", g7.graySummary?.weightedMax, g7.graySummary?.status],
        ["K Avg", g7.npdcSummary?.weightedAverage, g7.npdcSummary?.status],
        ["K Max", g7.npdcSummary?.weightedMax, g7.npdcSummary?.status],
      ])
      : "wΔL*: 数据不足";
  }
  els.g7NpdcBody.innerHTML = g7.npdcRows?.length
    ? g7.npdcRows.map((row) => `
      <tr>
        <td>${num(row.tone)}%</td>
        <td>${num(row.measured)}%</td>
        <td>${num(row.target)}%</td>
        <td class="${Math.abs(row.deltaTone) > 5 ? "negative" : ""}">${signed(row.deltaTone)}%</td>
        <td>${num(row.deltaL)}</td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"5\">缺少 K-only NPDC 阶调。</td></tr>";
  els.g7GrayBody.innerHTML = g7.grayBalanceRows?.length
    ? g7.grayBalanceRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${num(row.a)}</td>
        <td>${num(row.b)}</td>
        <td class="${row.chroma > 5 ? "negative" : ""}">${num(row.chroma)}</td>
        <td>${num(row.deltaE)}</td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"5\">缺少 CMY gray / 灰平衡 Lab。</td></tr>";

  renderG7Compensation(state.g7Compensation, els);

  // ─── G7 Certification-level: NPDC L* verification ───
  els.g7NpdcVerificationBody.innerHTML = g7.npdcVerification?.length
    ? g7.npdcVerification.filter((r) => Number.isFinite(r.deltaL)).map((r) => `
      <tr>
        <td>K ${num(r.tone)}%</td>
        <td>${num(r.measuredL)}</td>
        <td>${num(r.targetL)}</td>
        <td class="${Math.abs(r.weightedDeltaL) > 3 ? "negative" : ""}">${signed(r.signedWeightedDeltaL ?? r.deltaL)}</td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"4\">缺少 K-only 光谱 Lab 数据。</td></tr>";
  els.g7NpdcSummary.innerHTML = g7.npdcSummary?.count
    ? `NPDC wΔL*: avg ${num(g7.weightedDeltaLSummary?.weightedAverage ?? g7.npdcSummary.weightedAverage)} / max ${num(g7.weightedDeltaLSummary?.weightedMax ?? g7.npdcSummary.weightedMax)} — ${statusClass(g7.weightedDeltaLSummary?.status || g7.npdcSummary.status)}`
    : "NPDC L*: 数据不足";

  // ─── G7 Certification-level: Gray Balance ΔCh ───
  els.g7GrayVerificationBody.innerHTML = g7.grayVerification?.length
    ? g7.grayVerification.map((r) => `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td>${num(r.a)}</td>
        <td>${num(r.b)}</td>
        <td class="${r.weightedChroma > 3 ? "negative" : r.weightedChroma > 1.5 ? "warn" : ""}">${num(r.weightedChroma ?? r.chroma)}</td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"4\">缺少 CMY gray 灰平衡 Lab。</td></tr>";
  els.g7GraySummary.innerHTML = g7.graySummary?.count
    ? `灰平衡 wΔCh: avg ${num(g7.graySummary.weightedAverage)} / max ${num(g7.graySummary.weightedMax)} — ${statusClass(g7.graySummary.status)}`
    : "灰平衡 Ch: 数据不足";

  // ─── G7 Certification-level: Colorspace Compliance ───
  els.g7ColorspaceBody.innerHTML = g7.colorspaceRows?.length
    ? g7.colorspaceRows.map((r) => `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td class="${r.status === "Fail" ? "negative" : r.status === "Warning" ? "warn" : ""}">${num(r.deltaE)}</td>
        <td><span class="status ${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"3\">缺少标准参考数据或测量 Lab。</td></tr>";

  renderG7Charts({
    npdcChart: els.g7NpdcChart,
    grayChart: els.g7GrayChart,
    cmyNpdcChart: els.g7CmyNpdcChart,
    weightedChart: els.g7WeightedChart,
  }, g7, targetSeries("g7"));
  applyG7Pagination(state, els, {
    ...sectionAvailability,
    hasQuickTables,
    hasCertification,
    hasColorspace,
  });
}

function setHidden(element, hidden) {
  if (element) element.hidden = Boolean(hidden);
}

function applyG7Pagination(state, els, availability) {
  const requested = state.activeG7Panel || "overview";
  const activePanel = availability[requested] ? requested : "overview";
  state.activeG7Panel = activePanel;

  els.g7PanelButtons?.forEach((button) => {
    const panel = button.dataset.g7PanelButton || "overview";
    const enabled = Boolean(availability[panel]);
    button.disabled = !enabled;
    button.classList.toggle("active", panel === activePanel);
  });

  setHidden(els.g7Cards, activePanel !== "overview");
  setHidden(els.g7ChartGrid, activePanel !== "charts" || !availability.charts);
  setHidden(els.g7QuickTablesSection, activePanel !== "details" || !availability.hasQuickTables);
  setHidden(els.g7CertificationTablesSection, activePanel !== "details" || !availability.hasCertification);
  setHidden(els.g7ColorspaceSection, activePanel !== "details" || !availability.hasColorspace);
  setHidden(els.g7CompensationSection, activePanel !== "compensation" || !availability.compensation);
}

function renderG7Compensation(compensation, els) {
  if (!els.g7CompensationSummary || !els.g7CompensationBody) return;
  const preview = compensation || {
    status: "Blocked",
    message: "运行 G7 校验并先生成 TVI/CTV 曲线后，可查看生产用 G7 修正参考。",
    rows: [],
    warnings: [],
  };
  const level = preview.status === "Preview" ? "warning" : preview.status === "Disabled" ? "neutral" : "fail";
  const ratio = Number.isFinite(preview.ratio) ? preview.ratio : NaN;
  const ratioText = Number.isFinite(ratio) ? `${num(ratio * 100)}%` : "-";
  const limitText = Number.isFinite(preview.limit) ? `${num(preview.limit)}%` : "-";
  els.g7CompensationSummary.innerHTML = `
      <p><strong>状态</strong> <span class="status ${statusClass(level)}">${escapeHtml(preview.status)}</span> ${escapeHtml(preview.message || "")}</p>
    ${preview.status === "Preview" ? `
      <p><strong>生产原则</strong> 正式 C/M/Y/K 输出以 TVI/CTV 基础曲线为底；G7 不再生成 CMY 共同输出。当前单点最大修正 ${limitText}，欠补偿比例 ${ratioText}，G7 追加量会被进一步限制为小幅修正。</p>
      <p><strong>灰平衡</strong> CMY gray 会拆成 C/M/Y 单通道小幅修正；方向冲突时保持 TVI/CTV 输出，只提示复查。</p>
    ` : ""}
    ${(preview.warnings || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
  `;
  els.g7CompensationBody.innerHTML = preview.rows?.length
    ? preview.rows.map((row) => `
      <tr>
        <td><span class="channel ${escapeAttr(row.channel)}">${escapeHtml(row.channel)}</span><div class="cell-note">${escapeHtml(row.source)}</div></td>
        <td>${num(row.tone)}%</td>
        <td><strong>${num(row.baseOutputTone)}%</strong><div class="cell-note">${escapeHtml(row.metricName || "TVI/CTV")} / ${escapeHtml(row.pointSource === "interpolated" ? "插值" : "实测")}</div></td>
        <td>${Number.isFinite(row.g7ReferenceOutput) ? `${num(row.g7ReferenceOutput)}%<div class="cell-note">K参考 ${signed(row.g7ReferenceAdjustment)}%</div>` : `拆分 ${signed(row.requestedG7Delta)}%`}
          <div class="cell-note">${row.directionConflict ? "方向冲突，未叠加" : `已叠加 ${signed(row.g7Delta)}%`}</div>
        </td>
        <td><strong>${num(row.outputTone)}%</strong></td>
        <td class="${row.action === "增加" ? "negative" : row.action === "减少" ? "positive" : ""}">${escapeHtml(row.action)} ${num(Math.abs(row.adjustment))}%</td>
        <td>${escapeHtml(row.channel === "K" ? "K NPDC 参考" : "CMY 灰平衡诊断")}</td>
        <td>${escapeHtml(row.hint)}</td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"8\">尚未生成 G7 补偿建议。</td></tr>";
}

function metricStrip(items) {
  return `<span class="metric-strip">${items.map(([label, value, status]) => `
    <span class="metric-chip ${statusClass(status)}">
      <span>${escapeHtml(String(label || ""))}</span>
      ${value === "" ? "" : `<strong>${num(value)}</strong>`}
    </span>
  `).join("")}</span>`;
}

function buildVerificationChecklist(state, els) {
  const rows = [];
  for (const row of state.labRows || []) {
    rows.push({
      label: row.label,
      measured: Number.isFinite(row.deltaE) ? `${deltaFormulaLabel(els.deltaFormulaSelect.value)} ${num(row.deltaE)}` : "缺少标准目标",
      target: row.referenceLab ? `Warning ${state.standard.deltaE.warning} / Fail ${state.standard.deltaE.fail}` : "无匹配 Lab",
      status: row.status === "Missing Target" ? "Warning" : row.status,
      note: row.lab ? `L* ${num(row.lab.l)}  a* ${num(row.lab.a)}  b* ${num(row.lab.b)}` : row.source,
    });
  }

  for (const channel of ["C", "M", "Y", "K"]) {
    const toneRows = [25, 50, 75]
      .map((tone) => nearestToneRow(state.results, channel, tone))
      .filter(Boolean);
    if (!toneRows.length) continue;
    const worst = Math.max(...toneRows.map((row) => Math.abs(Number(row.tviDelta))));
    const status = toneRows.some((row) => Math.abs(Number(row.tviDelta)) > toneTolerance(row.tone) * 1.5)
      ? "Fail"
      : toneRows.some((row) => Math.abs(Number(row.tviDelta)) > toneTolerance(row.tone))
        ? "Warning"
        : "Pass";
    rows.push({
      label: `${channel} 通道 TVI/CTV 偏差`,
      measured: toneRows.map((row) => `${num(row.tone)}% ${signed(row.tviDelta)}%`).join(" / "),
      target: toneRows.map((row) => `${num(row.tone)}% ±${toneTolerance(row.tone)}%`).join(" / "),
      status,
      note: `最大 |偏差| ${num(worst)}%`,
    });
  }
  return rows;
}

function nearestToneRow(rows, channel, tone) {
  const candidates = (rows || []).filter((row) => row.channel === channel && Number.isFinite(Number(row.tone)));
  if (!candidates.length) return null;
  const exact = candidates.find((row) => Math.abs(Number(row.tone) - tone) < 0.01);
  if (exact) return exact;
  const nearest = candidates.reduce((best, row) =>
    Math.abs(Number(row.tone) - tone) < Math.abs(Number(best.tone) - tone) ? row : best, candidates[0]);
  return Math.abs(Number(nearest.tone) - tone) <= 2.5 ? nearest : null;
}

function toneTolerance(tone) {
  return Math.abs(Number(tone) - 50) < 0.01 ? 4 : 3;
}
