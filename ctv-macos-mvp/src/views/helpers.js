import { escapeAttr, escapeHtml } from "../shared.js";
import { t, translateDynamicText } from "../translations.js";
import { methodLabel } from "../ui-labels.js";

export function fmt(value) {
  return Number(value || 0).toFixed(2);
}

export function num(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "N/A";
}

export function signed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.00";
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}`;
}

export function kpiCard(label, value, level) {
  return `<div class="kpi-card ${level || ""}"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

export function statusClass(status) {
  if (status === "Pass" || status === "pass") return "pass";
  if (status === "Warning" || status === "warning") return "warning";
  if (status === "Fail" || status === "fail" || status === "danger") return "fail";
  if (status === "Missing" || status === "Data Incomplete" || String(status || "").startsWith("Missing ")) return "warning";
  if (status === "Disabled" || status === "neutral") return "neutral";
  return "neutral";
}

export function labText(lab) {
  return lab ? `${num(lab.l)}, ${num(lab.a)}, ${num(lab.b)}` : "";
}

export function displayPatchLabel(row = {}) {
  const cmyk = row.cmyk || {};
  const c = numericCmyk(cmyk.c);
  const m = numericCmyk(cmyk.m);
  const y = numericCmyk(cmyk.y);
  const k = numericCmyk(cmyk.k);
  if ([c, m, y, k].every(Number.isFinite)) {
    if (near(c, 0) && near(m, 0) && near(y, 0) && near(k, 0)) return t("paper_white_label", "纸白");
    if (near(c, 100) && near(m, 0) && near(y, 0) && near(k, 0)) return t("patch_c_solid", "C 实地");
    if (near(c, 0) && near(m, 100) && near(y, 0) && near(k, 0)) return t("patch_m_solid", "M 实地");
    if (near(c, 0) && near(m, 0) && near(y, 100) && near(k, 0)) return t("patch_y_solid", "Y 实地");
    if (near(c, 0) && near(m, 0) && near(y, 0) && near(k, 100)) return t("patch_k_solid", "K 实地");
    if (near(c, 100) && near(m, 100) && near(y, 0) && near(k, 0)) return t("patch_cm_overprint", "CM 叠印");
    if (near(c, 100) && near(m, 0) && near(y, 100) && near(k, 0)) return t("patch_cy_overprint", "CY 叠印");
    if (near(c, 0) && near(m, 100) && near(y, 100) && near(k, 0)) return t("patch_my_overprint", "MY 叠印");
    if (near(c, 100) && near(m, 100) && near(y, 100) && near(k, 0)) return t("patch_cmy_overprint", "CMY 叠印");

    const toneChannel = [
      ["C", c, m, y, k],
      ["M", m, c, y, k],
      ["Y", y, c, m, k],
      ["K", k, c, m, y],
    ].find(([, tone, otherA, otherB, otherC]) => tone > 0 && !near(tone, 100) && near(otherA, 0) && near(otherB, 0) && near(otherC, 0));
    if (toneChannel) return `${toneChannel[0]} ${Number(toneChannel[1]).toFixed(0)}%`;
  }

  const label = String(row.label || row.sampleId || row.sample_id || row.name || "");
  return importedPatchLabel(label) || label || t("patch_label", "色块");
}

function importedPatchLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) return "";
  if (/paper/.test(normalized)) return t("paper_white_label", "纸白");
  if (/(^|_)c_100$/.test(normalized)) return t("patch_c_solid", "C 实地");
  if (/(^|_)m_100$/.test(normalized)) return t("patch_m_solid", "M 实地");
  if (/(^|_)y_100$/.test(normalized)) return t("patch_y_solid", "Y 实地");
  if (/(^|_)k_100$/.test(normalized)) return t("patch_k_solid", "K 实地");
  if (/violet|blue/.test(normalized)) return t("patch_cm_overprint", "CM 叠印");
  if (/green/.test(normalized)) return t("patch_cy_overprint", "CY 叠印");
  if (/red/.test(normalized)) return t("patch_my_overprint", "MY 叠印");
  if (/cmy[_ -]?black/.test(normalized)) return t("patch_cmy_overprint", "CMY 叠印");
  if (/light[_ -]?gr[ae]y/.test(normalized)) return t("gray_25_label", "三色灰 25%");
  if (/mid[_ -]?gr[ae]y|middle[_ -]?gr[ae]y/.test(normalized)) return t("gray_50_label", "三色灰 50%");
  if (/dark[_ -]?gr[ae]y/.test(normalized)) return t("gray_75_label", "三色灰 75%");
  const tone = normalized.match(/(^|_)([cmyk])_(\d{1,3})(_|$)/);
  if (tone) return `${tone[2].toUpperCase()} ${tone[3]}%`;
  return "";
}

function numericCmyk(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function near(value, target) {
  return Math.abs(Number(value) - target) < 0.01;
}

export function renderImportAudit(audit) {
  if (audit.kind === "empty" || (audit.title === "未导入数据" && !audit.rawRowCount && !audit.measurementCount && !audit.usableCount)) {
    return `
      <strong>${escapeHtml(t("import_audit_title", "导入数据检查"))}</strong>
      <p><span class="status ${audit.level}">${escapeHtml(translateDynamicText(audit.title))}</span></p>
      <div class="empty-state compact-empty">
        <strong>${escapeHtml(t("waiting_measurement_data", "等待测量数据"))}</strong>
        <span>${escapeHtml(t("waiting_measurement_data_help", "请选择 CGATS / IT8 / P2P / CSV / JSON 测量文件。"))}</span>
      </div>
      <p>${escapeHtml(t("missing_data_help", "缺少 Lab 时不能做 ΔE/SCCA/G7；缺少密度或实测网点时不能计算 TVI 曲线。"))}</p>
    `;
  }
  const fieldText = audit.fields.length
    ? audit.fields.slice(0, 10).map(escapeHtml).join(", ") + (audit.fields.length > 10 ? "..." : "")
    : t("no_field_header", "无字段表头");
  const channels = audit.coverageRows
    .map((row) => {
      const marks = [25, 50, 75].map((tone) => `${tone}:${row.required[tone] ? "OK" : "-"}`).join(" ");
      return `<p><strong>${row.channel}</strong> ${row.pointCount}${t("points_suffix", "点")} / ${marks} / ${t("tone_short", "网点")}${row.measuredToneCount} ${t("density_short", "密度")}${row.densityCount} Lab${row.labCount} CTV${row.colorimetricCount}</p>`;
    })
    .join("");
  return `
    <strong>${escapeHtml(t("import_audit_title", "导入数据检查"))}</strong>
    <p><span class="status ${audit.level}">${escapeHtml(translateDynamicText(audit.title))}</span></p>
    <p>${escapeHtml(t("format_label", "格式"))}: ${escapeHtml(audit.sourceFormat)} / ${escapeHtml(t("field_count_label", "字段"))} ${audit.fieldCount} / ${escapeHtml(t("raw_rows_label", "原始行"))} ${audit.rawRowCount} / ${escapeHtml(t("usable_label", "可计算"))} ${audit.usableCount}</p>
    <p>${escapeHtml(t("fields_label", "字段"))}: ${fieldText}</p>
    <p>${escapeHtml(t("source_label", "来源"))}: ${audit.metricSources.length ? escapeHtml(audit.metricSources.map(methodLabel).join(" / ")) : escapeHtml(t("no_metric_source", "无可计算来源"))}</p>
    <p>P2P/CGATS: ${escapeHtml(t("patch_label", "色块"))} ${audit.rawClasses.p2pTotal} / ${escapeHtml(t("paper_prefix", "纸白"))} ${audit.rawClasses.paper} / ${escapeHtml(t("level_solid_suffix", "实地"))} ${audit.rawClasses.cmykSolids} / K-only ${audit.rawClasses.kOnly} / CMY ${escapeHtml(t("gray_label", "灰"))} ${audit.rawClasses.cmyNeutralGray}</p>
    <div class="audit-channel-list">${channels}</div>
    ${audit.messages.length
      ? `<p>${escapeHtml(t("hint_label", "提示"))}: ${escapeHtml([...new Set(audit.messages)].map(translateDynamicText).join(" / "))}</p>`
      : `<p>${escapeHtml(t("hint_label", "提示"))}: ${escapeHtml([...new Set(audit.notes || [t("data_structure_ok", "数据结构满足当前计算。")])].map(translateDynamicText).join(" / "))}</p>`}
  `;
}

export function renderCurveAcceptanceSummary(acceptance) {
  return `
    <strong>${escapeHtml(t("rip_acceptance_title", "RIP 手录验收"))}</strong>
    <p><span class="status ${acceptance.status === "Ready" ? "pass" : acceptance.status === "Warning" ? "warning" : acceptance.status === "Blocked" ? "fail" : "neutral"}">${acceptance.status}</span> ${escapeHtml(translateDynamicText(acceptance.message))}</p>
    <p>${escapeHtml(t("channel_label", "通道"))}: ${acceptance.channels.join(" ") || t("none_label", "无")} / ${escapeHtml(t("curve_points_label", "曲线点"))} ${acceptance.rows.length} / ${escapeHtml(t("measured_label", "实测"))} ${acceptance.measured} / ${escapeHtml(t("interpolated", "插值"))} ${acceptance.interpolated}</p>
    <p>${escapeHtml(t("reduce_points_label", "减少点"))} ${acceptance.reductions}, ${escapeHtml(t("max_reduce_label", "最大减少"))} ${num(Math.abs(acceptance.maxReduce))}%; ${escapeHtml(t("increase_points_label", "增加点"))} ${acceptance.increases}, ${escapeHtml(t("max_increase_label", "最大增加"))} ${num(acceptance.maxIncrease)}%.</p>
    <p>${escapeHtml(t("gate_curve_quality", "曲线质量"))}: ${acceptance.qualityStatus || "Ready"} / ${escapeHtml(t("curve_quality_warnings", "警告"))} ${acceptance.warningCount || 0} / ${escapeHtml(t("curve_quality_dangers", "严重"))} ${acceptance.dangerCount || 0}.</p>
  `;
}

export function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
