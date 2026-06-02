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
