import { targetSeries, toExportRows } from "../curve-engine.js?v=20260521-icc-p4";
import { summarizeLabVerification } from "../analysis-engine.js?v=20260522-g7-verify";
import { buildCompensationSimulation, summarizeCompensationSimulation } from "../compensation-simulation.js?v=20260521-icc-p4";
import { renderCompensationSimulationChart, renderCurveChart, renderG7Charts, renderLabChromaticityChart, renderMeasurementChart } from "../chart-renderer.js?v=20260523-sim-drag";
import { curveRowKey } from "../curve-overrides.js?v=20260521-icc-p4";
import { escapeAttr, escapeHtml } from "../shared.js?v=20260521-icc-p4";
import { deltaFormulaLabel, methodLabel } from "../ui-labels.js?v=20260521-icc-p4";
import { t, translateDynamicText } from "../translations.js";
import { fmt, num, signed, kpiCard, statusClass, labText } from "./helpers.js?v=20260525-statusbar-pass-1";
import { visibleWarnings } from "./data.js?v=20260525-statusbar-pass-1";

export function renderAnalyze(state, els) {
  const diagnosis = state.diagnosis || { level: "empty", title: t("awaiting_diagnosis", "等待诊断"), ratio: 50, messages: [] };
  const labSummary = summarizeLabVerification(state.labRows);
  const verificationRows = buildVerificationChecklist(state, els);
  const keySummary = summarizeKeyPatches(state.labRows);
  const hasPaperLab = state.labRows.some((row) => isPaperCmyk(row.cmyk) && row.lab);
  const sccaBlocked = els.sccaInput.checked && !hasPaperLab;
  els.diagnosisCards.innerHTML = [
    kpiCard(t("diagnosis_label", "诊断"), translateDynamicText(diagnosis.title), diagnosis.level),
    kpiCard(t("ratio_label", "建议欠补偿"), `${diagnosis.ratio}%`, "neutral"),
    kpiCard(`${deltaFormulaLabel(els.deltaFormulaSelect.value)} ${t("status_label", "Status")}`, labSummary.status, labSummary.status === "Pass" ? "pass" : labSummary.status === "Fail" ? "danger" : labSummary.status === "Warning" ? "warning" : "neutral"),
    kpiCard(t("comparable_lab_label", "可比 Lab"), `${labSummary.comparable}/${labSummary.total}`, labSummary.comparable ? "pass" : "warning"),
    kpiCard(t("max_delta_e_label", "最大 ΔE"), num(labSummary.maxDeltaE), labSummary.fail ? "danger" : labSummary.warning ? "warning" : "neutral"),
    kpiCard(t("curve_safety_issues_label", "曲线安全问题"), state.safetyIssues.length, state.safetyIssues.length ? "warning" : "pass"),
  ].join("");

  const messages = diagnosis.messages?.map((item) => `<p>${escapeHtml(translateDynamicText(item))}</p>`).join("") || "";
  const sccaMessage = els.sccaInput.checked
    ? hasPaperLab
      ? `<p>${escapeHtml(t("scca_enabled_message", "SCCA 已启用：参考 Lab 已按纸白差异做 MVP 级平移校正。"))}</p>`
      : `<p>${escapeHtml(t("scca_missing_paper_message", "SCCA 已勾选，但缺少纸白 Lab，不能执行纸白校正。"))}</p>`
    : "";
  els.diagnosisCards.insertAdjacentHTML("beforeend", `<div class="kpi-card span-card">${messages}${sccaMessage}</div>`);

  els.verificationChecklistSummary.textContent = verificationRows.length || keySummary.available
    ? t("key_patch_summary", "关键 9 项：Pass {pass} / Warning {warning} / Fail {fail}")
      .replace("{pass}", keySummary.pass).replace("{warning}", keySummary.warning).replace("{fail}", keySummary.fail)
    : t("waiting_verifiable_data", "等待可校验数据");
  if (els.labDetailSummary) {
    els.labDetailSummary.textContent = state.labRows.length
      ? t("comparable_lab_summary", "可比 {comparable}/{total}，最大 ΔE {max}")
        .replace("{comparable}", labSummary.comparable).replace("{total}", labSummary.total).replace("{max}", num(labSummary.maxDeltaE))
      : t("waiting_data", "等待数据");
  }
  if (els.labDetailBody) {
    els.labDetailBody.innerHTML = renderLabDetailRows(state.labRows, sccaBlocked);
  }
  renderLabChromaticityChart(els.labChromaticityChart, state.labRows);

  els.labBody.innerHTML = state.labRows.length
    ? renderKeyPatchRows(state.labRows, state.standard?.deltaE)
    : `<tr><td colspan="4">${sccaBlocked ? t("scca_needs_paper_lab", "SCCA requires paper-white Lab; current measurement is missing paper white.") : t("no_lab_compare_data", "No Lab/ΔE comparison data is available.")}</td></tr>`;
}

function isPaperCmyk(cmyk) {
  return cmyk && ["c", "m", "y", "k"].every((channel) => Math.abs(Number(cmyk[channel]) || 0) < 0.01);
}

function renderLabDetailRows(labRows = [], sccaBlocked = false) {
  if (!labRows.length) {
    return `<tr><td colspan="11">${sccaBlocked ? t("scca_needs_paper_lab", "SCCA requires paper-white Lab; current measurement is missing paper white.") : t("no_lab_compare_data", "No Lab/ΔE comparison data is available.")}</td></tr>`;
  }
  return labRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.label)}</td>
      <td>${labText(row.lab)}</td>
      <td>${row.referenceLab ? `${labText(row.referenceLab)}${row.referenceWasSccaCorrected ? " / SCCA" : ""}` : t("missing_target", "Missing target")}</td>
      <td>${num(row.deltaL)}</td>
      <td>${num(row.deltaA)}</td>
      <td>${num(row.deltaB)}</td>
      <td>${num(row.deltaE76)}</td>
      <td>${num(row.deltaE94)}</td>
      <td>${num(row.deltaE00)}</td>
      <td>${num(row.deltaECMC)}</td>
      <td><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
    </tr>
  `).join("");
}

function renderKeyPatchRows(labRows = [], thresholds = {}) {
  return keyPatchRows(labRows).map(({ slot, row }) => {
    const sampleColor = cmykToRgb(slot.cmyk);
    if (!row) {
      return `
        <tr>
          <td><strong>${escapeHtml(slot.name)}</strong></td>
          <td>${renderKeyPatchLabCell(sampleColor, null)}</td>
          <td>${renderKeyPatchLabCell(sampleColor, null, { muted: true })}</td>
          <td>-</td>
        </tr>
      `;
    }
    const targetColor = row.referenceLab ? sampleColor : "#e2e8f0";
    const deClass = deColorClass(row.deltaE, thresholds.warning || 3.5, thresholds.fail || 4.2);
    return `
      <tr>
        <td>
          <strong>${escapeHtml(slot.name)}</strong>
          <div class="cell-note">${escapeHtml(row.label || "")}</div>
        </td>
        <td>${renderKeyPatchLabCell(sampleColor, row.lab, { note: `D ${Number.isFinite(row.density) ? num(row.density) : "-"}` })}</td>
          <td>${renderKeyPatchLabCell(targetColor, row.referenceLab, { missing: t("missing_target", "Missing target") })}</td>
        <td>
          <strong class="${deClass}">${Number.isFinite(row.deltaE) ? num(row.deltaE) : "-"}</strong>
          <div class="cell-note"><span class="status ${statusClass(row.status)}">${escapeHtml(row.status || (row.referenceLab ? "Pass" : "Missing Target"))}</span></div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderKeyPatchLabCell(color, lab, options = {}) {
  const swatchClass = options.muted ? "color-swatch muted" : "color-swatch";
  const note = options.note ? `<div class="cell-note key-patch-note">${escapeHtml(options.note)}</div>` : "";
  const value = lab
    ? `
      <span class="lab-triplet" aria-label="L ${num(lab.l)} a ${num(lab.a)} b ${num(lab.b)}">
        <span>${num(lab.l)}</span>
        <span>${num(lab.a)}</span>
        <span>${num(lab.b)}</span>
      </span>
    `
    : `<span class="lab-missing">${escapeHtml(options.missing || "-")}</span>`;
  return `
    <div class="key-patch-value">
      <span class="${swatchClass}" style="background-color: ${color};"></span>
      ${value}
    </div>
    ${note}
  `;
}

function keyPatchRows(labRows = []) {
  return keyPatchSlots().map((slot) => ({
    slot,
    row: labRows.find((item) => item.cmyk && keyCmyk(item.cmyk) === slot.key),
  }));
}

function summarizeKeyPatches(labRows = []) {
  return keyPatchRows(labRows).reduce(
    (acc, { row }) => {
      if (!row) {
        acc.warning += 1;
        return acc;
      }
      acc.available += 1;
      if (!row.referenceLab) {
        acc.warning += 1;
      } else if (row.status === "Fail") {
        acc.fail += 1;
      } else if (row.status === "Warning") {
        acc.warning += 1;
      } else {
        acc.pass += 1;
      }
      return acc;
    },
    { pass: 0, warning: 0, fail: 0, available: 0 }
  );
}

function keyPatchSlots() {
  return [
    { name: t("paper_prefix", "纸张"), cmyk: { c: 0, m: 0, y: 0, k: 0 } },
    { name: t("patch_c_solid", "C 实地"), cmyk: { c: 100, m: 0, y: 0, k: 0 } },
    { name: t("patch_m_solid", "M 实地"), cmyk: { c: 0, m: 100, y: 0, k: 0 } },
    { name: t("patch_y_solid", "Y 实地"), cmyk: { c: 0, m: 0, y: 100, k: 0 } },
    { name: t("patch_k_solid", "K 实地"), cmyk: { c: 0, m: 0, y: 0, k: 100 } },
    { name: t("patch_cm_overprint", "CM 叠印"), cmyk: { c: 100, m: 100, y: 0, k: 0 } },
    { name: t("patch_cy_overprint", "CY 叠印"), cmyk: { c: 100, m: 0, y: 100, k: 0 } },
    { name: t("patch_my_overprint", "MY 叠印"), cmyk: { c: 0, m: 100, y: 100, k: 0 } },
    { name: t("patch_cmy_overprint", "CMY 叠印"), cmyk: { c: 100, m: 100, y: 100, k: 0 } },
  ].map((slot) => ({ ...slot, key: keyCmyk(slot.cmyk) }));
}

function keyCmyk(cmyk) {
  return `${Number(cmyk?.c || 0).toFixed(2)}/${Number(cmyk?.m || 0).toFixed(2)}/${Number(cmyk?.y || 0).toFixed(2)}/${Number(cmyk?.k || 0).toFixed(2)}`;
}

function cmykToRgb(cmyk) {
  const c = Math.max(0, Math.min(1, Number(cmyk.c || 0) / 100));
  const m = Math.max(0, Math.min(1, Number(cmyk.m || 0) / 100));
  const y = Math.max(0, Math.min(1, Number(cmyk.y || 0) / 100));
  const k = Math.max(0, Math.min(1, Number(cmyk.k || 0) / 100));
  const rgb = [c, m, y].map((ink) => Math.round(255 * (1 - ink) * (1 - k)));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function deColorClass(de, warning = 3.5, fail = 4.2) {
  if (!Number.isFinite(de)) return "";
  if (de >= fail) return "text-danger";
  if (de >= warning) return "text-warning";
  return "text-success";
}

export function statusText(state, els) {
  const warnings = visibleWarnings(state, els);
  const lockedCount = state.results.filter((row) => row.overrideLocked).length;
  if (state.results.length) {
    const mode = els.modeSelect.value === "ctv" ? "CTV" : "TVI";
    const base = (lockedCount
      ? t("generated_curve_with_locks_status", "已生成 {count} 个{mode}曲线点 / 人工锁定 {locked} 点")
      : t("generated_curve_status", "已生成 {count} 个{mode}曲线点"))
      .replace("{count}", state.results.length)
      .replace("{mode}", mode)
      .replace("{locked}", lockedCount);
    return `${base}${warnings.length ? ` / ${warnings.map(translateDynamicText).join(" / ")}` : ""}`;
  }
  if (state.measurements.length) return t("measurement_recognized_missing_metric", "已识别测量点，但缺少可计算指标");
  return warnings[0] ? translateDynamicText(warnings[0]) : t("waiting_import_status", "等待导入");
}

export function renderCurve(state, els) {
  els.statusText.textContent = statusText(state, els);
  const filtered = state.activeCurveChannel && state.activeCurveChannel !== "all"
    ? state.results.filter((row) => row.channel === state.activeCurveChannel)
    : state.results;
  const qualityMap = curveQualityByPoint(state.safetyIssues);
  els.resultBody.innerHTML = toExportRows(filtered)
    .map((row, index) => {
      const sourceRow = filtered[index];
      const key = curveRowKey(sourceRow);
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
        <td class="${Number(row.ripAdjustment) < 0 ? "negative" : "positive"}">${escapeHtml(translateDynamicText(row.manualActionZh))}</td>
        <td><input class="curve-output-input" type="number" min="0" max="100" step="0.1" value="${escapeAttr(row.outputTone)}" data-curve-field="outputTone" data-curve-key="${escapeAttr(key)}" aria-label="${escapeAttr(t("suggested_output_aria", "Suggested output tone"))} ${escapeAttr(row.channel)} ${escapeAttr(row.inputTone)}%" /></td>
        <td><span class="status ${quality.level === "danger" ? "fail" : quality.level}">${escapeHtml(translateDynamicText(quality.label))}</span>${quality.messages.length ? `<div class="cell-note">${escapeHtml(quality.messages.map(translateDynamicText).join(" / "))}</div>` : ""}</td>
        <td><input class="curve-lock-input" type="checkbox" data-curve-field="locked" data-curve-key="${escapeAttr(key)}" ${locked ? "checked" : ""} aria-label="${escapeAttr(t("lock_output_aria", "Lock output"))} ${escapeAttr(row.channel)} ${escapeAttr(row.inputTone)}%" /></td>
        <td class="cell-text">${row.pointSource === "interpolated" ? t("interpolated", "插值") : t("measured_label", "实测")}</td>
        <td class="cell-text">${escapeHtml(translateDynamicText(row.metric))} / ${escapeHtml(methodLabel(row.measurementMethod))}${locked ? ` / ${escapeHtml(t("manual_locked_label", "人工锁定"))}` : ""}</td>
      </tr>
    `;
    })
    .join("");
  renderCompensationSimulation(filtered, els);

  renderMeasurementChart(els.measurementChart, state.results, targetSeries(els.targetSelect.value), els.modeSelect.value);
  renderCurveChart(els.curveChart, filtered, state.safetyIssues);

  els.safetySummary.innerHTML = state.safetyIssues.length
    ? renderSafetySummary(state.safetyIssues)
    : `<p>${escapeHtml(t("no_curve_safety_issue", "未发现反折、异常跳变或高光/暗调保护问题。"))}</p>`;
}

function renderCompensationSimulation(rows, els) {
  if (!els.compensationSimulationSummary || !els.compensationSimulationBody) return;
  const simulationRows = buildCompensationSimulation(rows);
  const summary = summarizeCompensationSimulation(simulationRows);
  renderCompensationSimulationChart(els.compensationSimulationChart, simulationRows);
  els.compensationSimulationSummary.innerHTML = summary.total
    ? `
      <p><strong>${escapeHtml(t("simulation_check_label", "Simulation Check"))}</strong> <span class="status ${statusClass(summary.status)}">${escapeHtml(summary.status)}</span> ${escapeHtml(t("simulatable_label", "Simulatable"))} ${summary.total} ${escapeHtml(t("points_label", "points"))}, Pass ${summary.pass} / Warning ${summary.warning} / Fail ${summary.fail}</p>
      <p>${escapeHtml(t("average_delta_summary_label", "Average |Delta|"))}: ${escapeHtml(t("current_label", "Current"))} ${num(summary.avgBefore)}% -> ${escapeHtml(t("after_simulation_label", "After Simulation"))} ${num(summary.avgAfter)}%; ${escapeHtml(t("improved_label", "Improved"))} ${summary.improved} ${escapeHtml(t("points_label", "points"))}, ${escapeHtml(t("worsened_label", "Worsened"))} ${summary.worsened} ${escapeHtml(t("points_label", "points"))}.</p>
      <p>${escapeHtml(t("simulation_note_label", "Note"))}: ${escapeHtml(t("simulation_same_measurement_note", "This estimate uses the same measurement response curve to judge compensation direction. Formal acceptance still requires outputting the compensated target and remeasuring it."))}</p>
    `
    : `<p>${escapeHtml(t("simulation_not_ready_help", "No simulatable compensation curve has been generated yet. Import measurement data and calculate the curve first."))}</p>`;

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
        <td>${num(row.measuredTone)}%<div class="cell-note">${escapeHtml(t("current_delta_label", "Current Delta"))} ${signed(row.beforeDelta)}%</div></td>
        <td>${num(row.targetTone)}%</td>
        <td class="zone-start"><strong>${num(row.outputTone)}%</strong></td>
        <td>${num(row.simulatedTone)}%</td>
        <td class="${Math.abs(row.afterDelta) > row.tolerance ? "negative" : "positive"}">${signed(row.afterDelta)}%</td>
        <td class="${row.improvement < -0.05 ? "negative" : row.improvement > 0.05 ? "positive" : ""}">${signed(row.improvement)}%</td>
        <td><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span><div class="cell-note">${escapeHtml(translateDynamicText(row.basis))} / ${escapeHtml(t("threshold_label", "Tolerance"))} ±${num(row.tolerance)}%</div></td>
      </tr>
    `).join("")
    : summary.total
      ? `<tr><td colspan="9">${escapeHtml(t("simulation_all_within_tolerance", "All simulation results are within tolerance; use the main table above for the full point list."))}</td></tr>`
      : `<tr><td colspan="9">${escapeHtml(t("simulation_not_ready", "No simulatable compensation curve has been generated yet."))}</td></tr>`;
}

function renderSafetySummary(issues) {
  const counts = issues.reduce((acc, item) => {
    acc[item.level] = (acc[item.level] || 0) + 1;
    return acc;
  }, {});
  const headline = `<p><strong>${escapeHtml(t("curve_quality_check_label", "Curve Quality Check"))}</strong> ${escapeHtml(t("curve_quality_warnings", "Warnings"))} ${counts.warning || 0} / ${escapeHtml(t("curve_quality_dangers", "Severe"))} ${counts.danger || counts.fail || 0}</p>`;
  const details = issues
    .slice(0, 12)
    .map((item) => `<p><span class="status ${item.level === "danger" ? "fail" : item.level}">${escapeHtml(translateDynamicText(item.type))}</span> ${escapeHtml(translateDynamicText(item.message))}</p>`)
    .join("");
  const more = issues.length > 12 ? `<p>${escapeHtml(t("more_label", "More"))} ${issues.length - 12} ${escapeHtml(t("curve_quality_more_help", "check warnings remain; see the Curve Check column in the curve table."))}</p>` : "";
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
        <p><strong>${escapeHtml(t("g7_insufficient_data", "Insufficient G7 Data"))}</strong> <span class="status warning">${escapeHtml(t("g7_not_formal_acceptance", "Not valid for formal G7 acceptance"))}</span></p>
        <p>${escapeHtml(t("g7_missing_required_data", "Missing K-only NPDC, CMY gray-balance, or comparable Lab data required for G7."))}</p>
        <p><strong>${escapeHtml(t("required_label", "Required"))}</strong> ${missingItems.map((item) => escapeHtml(translateDynamicText(item))).join(" / ")}</p>
        <p>${escapeHtml(t("g7_import_instruction", "Import a P2P/TC1617 measurement file or enter complete G7 gray-balance data manually before running G7 verification."))}</p>
      </div>
    `;
  } else {
    els.g7Cards.innerHTML = [
      kpiCard(t("g7_status_label", "G7 Status"), g7.status, g7.status === "Pass" ? "pass" : g7.status === "Fail" ? "danger" : g7.status === "Disabled" ? "neutral" : "warning"),
      kpiCard(t("k_only_points_label", "K-only Points"), g7.kOnlyCount, g7.kOnlyCount >= 5 ? "pass" : "warning"),
      kpiCard(t("lab_comparable_patches_label", "Comparable Lab Patches"), g7.labPatchCount, g7.labPatchCount ? "pass" : "warning"),
      kpiCard(t("gray_patches_label", "Gray Patches"), g7.grayPatchCount, g7.grayPatchCount ? "pass" : "warning"),
      kpiCard(t("p2p_gray_candidates_label", "P2P / Gray Candidates"), g7.grayCandidateCount || 0, g7.grayCandidateCount ? "pass" : "warning"),
      kpiCard(t("paper_solids_label", "Paper / Solids"), `${g7.patchClasses?.paper || 0}/${g7.patchClasses?.cmykSolids || 0}`, (g7.patchClasses?.paper && g7.patchClasses?.cmykSolids >= 4) ? "pass" : "warning"),
      kpiCard(`${t("avg_label", "Average")} ${deltaFormulaLabel(els.deltaFormulaSelect.value)}`, num(g7.avgDeltaE), "neutral"),
      kpiCard(`${t("max_label", "Max")} ${deltaFormulaLabel(els.deltaFormulaSelect.value)}`, num(g7.maxDeltaE), "neutral"),
      kpiCard(translateDynamicText("NPDC 平均 wΔL*"), num(g7.weightedAverage), "neutral"),
      kpiCard(translateDynamicText("NPDC 最大 wΔL*"), num(g7.maxNpdcDelta), Number(g7.maxNpdcDelta) > Number(g7.tolerances?.npdcMax || 3) ? "warning" : "neutral"),
      kpiCard(translateDynamicText("灰平衡平均 wΔCh"), num(g7.weightedGrayAverage), "neutral"),
      kpiCard(translateDynamicText("灰平衡最大 wΔCh"), num(g7.weightedGrayMax), Number(g7.weightedGrayMax) > Number(g7.tolerances?.grayMax || 3) ? "warning" : "neutral"),
      `<div class="kpi-card span-card"><p><strong>${escapeHtml(t("g7_conclusion_label", "G7 Conclusion"))}</strong> <span class="status ${statusClass(g7.conclusion?.level || g7.status)}">${escapeHtml(translateDynamicText(g7.conclusion?.title || g7.status))}</span></p><p>${escapeHtml(translateDynamicText(g7.conclusion?.summary || ""))}</p>${(g7.conclusion?.recommendations || []).map((item) => `<p>${escapeHtml(translateDynamicText(item))}</p>`).join("")}</div>`,
      `<div class="kpi-card span-card"><p><strong>${escapeHtml(t("g7_completeness_label", "G7 Data Completeness"))}</strong></p>${(g7.completenessRows || []).map((row) => `<p>${row.status === "Pass" ? "Pass" : "Missing"} ${escapeHtml(translateDynamicText(row.item))}: ${row.count} / ${escapeHtml(translateDynamicText(row.required))}</p>`).join("")}</div>`,
      `<div class="kpi-card span-card"><p><strong>${escapeHtml(t("g7_verification_items_label", "G7 Verification Items"))}</strong></p>${(g7.verificationRows || []).map((row) => `<p><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span> ${escapeHtml(translateDynamicText(row.item))}: ${num(row.value)} / ${escapeHtml(translateDynamicText(row.tolerance))}${row.message ? ` / ${escapeHtml(translateDynamicText(row.message))}` : ""}</p>`).join("")}</div>`,
      `<div class="kpi-card span-card">${g7.missing.length ? `<p><strong>${escapeHtml(t("main_issues_label", "Main Issues"))}</strong></p>${g7.missing.map((item) => `<p>${escapeHtml(translateDynamicText(item))}</p>`).join("")}` : `<p>${escapeHtml(t("g7_completeness_pass_help", "Data completeness satisfies the first-stage G7 precheck."))}</p>`}</div>`,
    ].join("");
  }
  if (els.g7CmySummary) {
    els.g7CmySummary.innerHTML = g7.grayNpdcSummary?.count
      ? metricStrip([
        ["Avg", g7.grayNpdcSummary.weightedAverage, g7.grayNpdcSummary.status],
        ["Max", g7.grayNpdcSummary.weightedMax, g7.grayNpdcSummary.status],
        [g7.grayNpdcSummary.status, "", g7.grayNpdcSummary.status],
      ])
      : `CMY: ${escapeHtml(t("insufficient_data_label", "Insufficient data"))}`;
  }
  if (els.g7KNpdcSummary) {
    const npdcStatus = g7.npdcSummary?.status;
    els.g7KNpdcSummary.innerHTML = g7.npdcSummary?.count
      ? metricStrip([
        ["Avg", g7.npdcSummary.weightedAverage, npdcStatus],
        ["Max", g7.npdcSummary.weightedMax, npdcStatus],
        [npdcStatus, "", npdcStatus],
      ])
      : `K: ${escapeHtml(t("insufficient_data_label", "Insufficient data"))}`;
  }
  if (els.g7GrayChartSummary) {
    els.g7GrayChartSummary.innerHTML = g7.graySummary?.count
      ? metricStrip([
        ["Avg", g7.graySummary.avgChroma, g7.graySummary.status],
        ["Max", g7.graySummary.maxChroma, g7.graySummary.status],
        [g7.graySummary.status, "", g7.graySummary.status],
      ])
      : `${escapeHtml(t("gray_balance_label", "Gray Balance"))}: ${escapeHtml(t("insufficient_data_label", "Insufficient data"))}`;
  }
  if (els.g7WeightedSummary) {
    els.g7WeightedSummary.innerHTML = g7.weightedDeltaLSummary?.count
      ? metricStrip([
        ["CMY Avg", g7.grayNpdcSummary?.weightedAverage, g7.grayNpdcSummary?.status],
        ["CMY Max", g7.grayNpdcSummary?.weightedMax, g7.grayNpdcSummary?.status],
        ["K Avg", g7.npdcSummary?.weightedAverage, g7.npdcSummary?.status],
        ["K Max", g7.npdcSummary?.weightedMax, g7.npdcSummary?.status],
      ])
      : `wΔL*: ${escapeHtml(t("insufficient_data_label", "Insufficient data"))}`;
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
    : `<tr><td colspan="5">${escapeHtml(t("missing_k_only_npdc", "Missing K-only NPDC tone ramp."))}</td></tr>`;
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
    : `<tr><td colspan="5">${escapeHtml(t("missing_cmy_gray_lab", "Missing CMY gray / gray-balance Lab."))}</td></tr>`;

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
    : `<tr><td colspan="4">${escapeHtml(t("missing_k_only_spectral_lab", "Missing K-only spectral Lab data."))}</td></tr>`;
  els.g7NpdcSummary.innerHTML = g7.npdcSummary?.count
      ? `K NPDC wΔL*: avg ${num(g7.npdcSummary.weightedAverage)} / max ${num(g7.npdcSummary.weightedMax)} — ${statusClass(g7.npdcSummary.status)}`
      : `NPDC L*: ${escapeHtml(t("insufficient_data_label", "Insufficient data"))}`;

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
    : `<tr><td colspan="4">${escapeHtml(t("missing_cmy_gray_balance_lab", "Missing CMY gray-balance Lab."))}</td></tr>`;
  els.g7GraySummary.innerHTML = g7.graySummary?.count
    ? `${escapeHtml(translateDynamicText("灰平衡 wΔCh"))}: avg ${num(g7.graySummary.weightedAverage)} / max ${num(g7.graySummary.weightedMax)} — ${statusClass(g7.graySummary.status)}`
    : `${escapeHtml(t("gray_balance_label", "Gray Balance"))} Ch: ${escapeHtml(t("insufficient_data_label", "Insufficient data"))}`;

  // ─── G7 Certification-level: Colorspace Compliance ───
  els.g7ColorspaceBody.innerHTML = g7.colorspaceRows?.length
    ? g7.colorspaceRows.map((r) => `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td class="${r.status === "Fail" ? "negative" : r.status === "Warning" ? "warn" : ""}">${num(r.deltaE)}</td>
        <td><span class="status ${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="3">${escapeHtml(t("missing_standard_or_measured_lab", "Missing standard reference data or measured Lab."))}</td></tr>`;

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
    message: t("g7_compensation_preview_help", "Run G7 verification and generate the TVI/CTV curve first to view production G7 correction references."),
    rows: [],
    warnings: [],
  };
  const level = preview.status === "Preview" ? "warning" : preview.status === "Disabled" ? "neutral" : "fail";
  const ratio = Number.isFinite(preview.ratio) ? preview.ratio : NaN;
  const ratioText = Number.isFinite(ratio) ? `${num(ratio * 100)}%` : "-";
  const limitText = Number.isFinite(preview.limit) ? `${num(preview.limit)}%` : "-";
  els.g7CompensationSummary.innerHTML = `
      <p><strong>${escapeHtml(t("status_label", "Status"))}</strong> <span class="status ${statusClass(level)}">${escapeHtml(preview.status)}</span> ${escapeHtml(translateDynamicText(preview.message || ""))}</p>
    ${preview.status === "Preview" ? `
      <p><strong>${escapeHtml(t("production_principle_label", "Production Principle"))}</strong> ${escapeHtml(t("g7_production_principle_help", "Production C/M/Y/K output is based on the TVI/CTV base curve; G7 no longer generates shared CMY output."))} ${escapeHtml(t("current_max_single_point_label", "Current max single-point correction"))} ${limitText}, ${escapeHtml(t("undercomp_ratio_lower_label", "under-comp ratio"))} ${ratioText}, ${escapeHtml(t("g7_addon_limited_help", "G7 add-on correction is further limited to small adjustments."))}</p>
      <p><strong>${escapeHtml(t("gray_balance_label", "Gray Balance"))}</strong> ${escapeHtml(t("g7_gray_split_help", "CMY gray is split into small C/M/Y single-channel corrections; when direction conflicts, TVI/CTV output is kept and only a review warning is shown."))}</p>
    ` : ""}
    ${(preview.warnings || []).map((item) => `<p>${escapeHtml(translateDynamicText(item))}</p>`).join("")}
  `;
  els.g7CompensationBody.innerHTML = preview.rows?.length
    ? preview.rows.map((row) => `
      <tr>
        <td><span class="channel ${escapeAttr(row.channel)}">${escapeHtml(row.channel)}</span><div class="cell-note">${escapeHtml(row.source)}</div></td>
        <td>${num(row.tone)}%</td>
        <td><strong>${num(row.baseOutputTone)}%</strong><div class="cell-note">${escapeHtml(row.metricName || "TVI/CTV")} / ${escapeHtml(row.pointSource === "interpolated" ? t("interpolated", "Interpolated") : t("measured_label", "Measured"))}</div></td>
        <td>${Number.isFinite(row.g7ReferenceOutput) ? `${num(row.g7ReferenceOutput)}%<div class="cell-note">${escapeHtml(t("k_reference_label", "K reference"))} ${signed(row.g7ReferenceAdjustment)}%</div>` : `${escapeHtml(t("split_label", "Split"))} ${signed(row.requestedG7Delta)}%`}
          <div class="cell-note">${row.directionConflict ? t("direction_conflict_not_applied", "Direction conflict, not applied") : `${t("applied_label", "Applied")} ${signed(row.g7Delta)}%`}</div>
        </td>
        <td><strong>${num(row.outputTone)}%</strong></td>
        <td class="${row.action === "增加" ? "negative" : row.action === "减少" ? "positive" : ""}">${escapeHtml(translateDynamicText(row.action))} ${num(Math.abs(row.adjustment))}%</td>
        <td>${escapeHtml(row.channel === "K" ? t("k_npdc_reference_label", "K NPDC Reference") : t("cmy_gray_diagnosis_label", "CMY Gray-Balance Diagnosis"))}</td>
        <td>${escapeHtml(translateDynamicText(row.hint))}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8">${escapeHtml(t("no_g7_compensation_suggestion", "No G7 compensation suggestions generated yet."))}</td></tr>`;
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
      measured: Number.isFinite(row.deltaE) ? `ΔE ${num(row.deltaE)}` : t("missing_standard_target", "Missing standard target"),
      target: row.referenceLab ? `< ${state.standard.deltaE.warning} / ${state.standard.deltaE.fail}` : t("no_matching_lab", "No matching Lab"),
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
      label: `${channel} ${t("channel_tvi_ctv_delta_label", "Channel TVI/CTV Delta")}`,
      measured: toneRows.map((row) => `${num(row.tone)}% ${signed(row.tviDelta)}%`).join(" / "),
      target: toneRows.map((row) => `${num(row.tone)}% ±${toneTolerance(row.tone)}%`).join(" / "),
      status,
      note: `${t("max_abs_delta_label", "Max |Delta|")} ${num(worst)}%`,
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
