import { targetSeries, toExportRows } from "../curve-engine.js?v=20260519-instrument-verify";
import { summarizeLabVerification } from "../analysis-engine.js?v=20260519-instrument-verify";
import { buildCurveAcceptance } from "../curve-acceptance.js?v=20260519-instrument-verify";
import { renderCurveChart, renderG7Charts, renderMeasurementChart } from "../chart-renderer.js?v=20260519-instrument-verify";
import { curveRowKey } from "../curve-overrides.js?v=20260519-instrument-verify";
import { escapeAttr, escapeHtml } from "../shared.js?v=20260519-instrument-verify";
import { deltaFormulaLabel, methodLabel } from "../ui-labels.js?v=20260519-instrument-verify";
import { fmt, num, signed, kpiCard, statusClass, labText, renderCurveAcceptanceSummary } from "./helpers.js?v=20260519-instrument-verify";
import { visibleWarnings } from "./data.js?v=20260519-instrument-verify";

export function renderAnalyze(state, els) {
  const diagnosis = state.diagnosis || { level: "empty", title: "未诊断", ratio: 50, messages: [] };
  const labSummary = summarizeLabVerification(state.labRows);
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
  const acceptance = buildCurveAcceptance(state.results, state.safetyIssues);
  const qualityMap = curveQualityByPoint(state.safetyIssues);
  els.resultBody.innerHTML = toExportRows(state.results)
    .map((row, index) => {
      const sourceRow = state.results[index];
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
        <td>${row.theoreticalOutputTone}%</td>
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
  els.ripEntryBody.innerHTML = acceptance.rows.length
    ? acceptance.rows.map((row) => `
      <tr>
        <td><span class="channel ${row.channel}">${row.channel}</span></td>
        <td>${row.inputTone}%</td>
        <td><span class="status ${row.level === "increase" ? "warning" : row.level === "reduce" ? "pass" : "neutral"}">${row.action}</span></td>
        <td class="${row.adjustment < 0 ? "negative" : row.adjustment > 0 ? "positive" : ""}">${signed(row.adjustment)}%</td>
        <td><strong>${row.outputTone}%</strong></td>
        <td>${row.measuredTone}%</td>
        <td>${row.targetTone}%</td>
        <td>${row.pointSource === "interpolated" ? "插值" : "实测"}</td>
        <td class="cell-text">${escapeHtml(row.metric)} / ${escapeHtml(methodLabel(row.measurementMethod))}</td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"9\">尚未生成曲线。</td></tr>";

  renderMeasurementChart(els.measurementChart, state.results, targetSeries(els.targetSelect.value), els.modeSelect.value);
  renderCurveChart(els.curveChart, state.results, state.safetyIssues);

  els.safetySummary.innerHTML = state.safetyIssues.length
    ? renderSafetySummary(state.safetyIssues)
    : "<p>未发现反折、异常跳变或高光/暗调保护问题。</p>";
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
    weightedAverage: NaN, npdcRows: [], grayBalanceRows: [],
    grayCandidateCount: 0, p2pPatchCount: 0,
    patchClasses: { p2pTotal: 0, paper: 0, cmykSolids: 0, kOnly: 0, cmyNeutralGray: 0 },
    completenessRows: [],
  };
  els.g7Cards.innerHTML = [
    kpiCard("G7 状态", g7.status, g7.status === "Pass" ? "pass" : g7.status === "Fail" ? "danger" : "warning"),
    kpiCard("K-only 点数", g7.kOnlyCount, g7.kOnlyCount >= 5 ? "pass" : "warning"),
    kpiCard("Lab 可比色块", g7.labPatchCount, g7.labPatchCount ? "pass" : "warning"),
    kpiCard("Gray 色块", g7.grayPatchCount, g7.grayPatchCount ? "pass" : "warning"),
    kpiCard("P2P/灰候选", g7.grayCandidateCount || 0, g7.grayCandidateCount ? "pass" : "warning"),
    kpiCard("纸白/实地", `${g7.patchClasses?.paper || 0}/${g7.patchClasses?.cmykSolids || 0}`, (g7.patchClasses?.paper && g7.patchClasses?.cmykSolids >= 4) ? "pass" : "warning"),
    kpiCard(`平均 ${deltaFormulaLabel(els.deltaFormulaSelect.value)}`, num(g7.avgDeltaE), "neutral"),
    kpiCard(`最大 ${deltaFormulaLabel(els.deltaFormulaSelect.value)}`, num(g7.maxDeltaE), "neutral"),
    kpiCard("Weighted Avg", num(g7.weightedAverage), "neutral"),
    kpiCard("平均 Gray Ch", num(g7.avgGrayCh), "neutral"),
    kpiCard("最大 Gray Ch", num(g7.maxGrayCh), Number(g7.maxGrayCh) > 6 ? "warning" : "neutral"),
    kpiCard("最大 NPDC ΔTone", num(g7.maxNpdcDelta), Number(g7.maxNpdcDelta) > 8 ? "warning" : "neutral"),
    `<div class="kpi-card span-card"><p><strong>G7 结论</strong> <span class="status ${statusClass(g7.conclusion?.level || g7.status)}">${escapeHtml(g7.conclusion?.title || g7.status)}</span></p><p>${escapeHtml(g7.conclusion?.summary || "")}</p>${(g7.conclusion?.recommendations || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>`,
    `<div class="kpi-card span-card"><p><strong>G7 数据完整性</strong></p>${(g7.completenessRows || []).map((row) => `<p>${row.status === "Pass" ? "Pass" : "Missing"} ${escapeHtml(row.item)}: ${row.count} / ${escapeHtml(row.required)}</p>`).join("")}</div>`,
    `<div class="kpi-card span-card"><p><strong>G7 验证项目</strong></p>${(g7.verificationRows || []).map((row) => `<p><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span> ${escapeHtml(row.item)}: ${num(row.value)} / ${escapeHtml(row.tolerance)}${row.message ? ` / ${escapeHtml(row.message)}` : ""}</p>`).join("")}</div>`,
    `<div class="kpi-card span-card">${g7.missing.length ? g7.missing.map((item) => `<p>${escapeHtml(item)}</p>`).join("") : "<p>数据完整性满足第一阶段 G7 预检。</p>"}</div>`,
  ].join("");
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

  // ─── G7 Certification-level: NPDC L* verification ───
  els.g7NpdcVerificationBody.innerHTML = g7.npdcVerification?.length
    ? g7.npdcVerification.filter((r) => Number.isFinite(r.deltaL)).map((r) => `
      <tr>
        <td>K ${num(r.tone)}%</td>
        <td>${num(r.measuredL)}</td>
        <td>${num(r.targetL)}</td>
        <td class="${Math.abs(r.deltaL) > 3 ? "negative" : ""}">${signed(r.deltaL)}</td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"4\">缺少 K-only 光谱 Lab 数据。</td></tr>";
  els.g7NpdcSummary.innerHTML = g7.npdcSummary?.count
    ? `NPDC L*: avg ΔL ${num(g7.npdcSummary.avgDeltaL)} / max ΔL ${num(g7.npdcSummary.maxDeltaL)} — ${statusClass(g7.npdcSummary.status)}`
    : "NPDC L*: 数据不足";

  // ─── G7 Certification-level: Gray Balance ΔCh ───
  els.g7GrayVerificationBody.innerHTML = g7.grayVerification?.length
    ? g7.grayVerification.map((r) => `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td>${num(r.a)}</td>
        <td>${num(r.b)}</td>
        <td class="${r.chroma > 6 ? "negative" : r.chroma > 3 ? "warn" : ""}">${num(r.chroma)}</td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"4\">缺少 CMY gray 灰平衡 Lab。</td></tr>";
  els.g7GraySummary.innerHTML = g7.graySummary?.count
    ? `灰平衡 Ch: avg ${num(g7.graySummary.avgChroma)} / max ${num(g7.graySummary.maxChroma)} — ${statusClass(g7.graySummary.status)}`
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

  renderG7Charts({ npdcChart: els.g7NpdcChart, grayChart: els.g7GrayChart }, g7, targetSeries("g7"));
}
