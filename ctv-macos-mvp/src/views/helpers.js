import { escapeAttr, escapeHtml } from "../shared.js";
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
  return "neutral";
}

export function labText(lab) {
  return lab ? `${num(lab.l)}, ${num(lab.a)}, ${num(lab.b)}` : "";
}

export function renderImportAudit(audit) {
  const fieldText = audit.fields.length
    ? audit.fields.slice(0, 10).map(escapeHtml).join(", ") + (audit.fields.length > 10 ? "..." : "")
    : "无字段表头";
  const channels = audit.coverageRows
    .map((row) => {
      const marks = [25, 50, 75].map((tone) => `${tone}:${row.required[tone] ? "OK" : "-"}`).join(" ");
      return `<p><strong>${row.channel}</strong> ${row.pointCount}点 / ${marks} / 网点${row.measuredToneCount} 密度${row.densityCount} Lab${row.labCount} CTV${row.colorimetricCount}</p>`;
    })
    .join("");
  return `
    <strong>导入数据检查</strong>
    <p><span class="status ${audit.level}">${escapeHtml(audit.title)}</span></p>
    <p>格式: ${escapeHtml(audit.sourceFormat)} / 字段 ${audit.fieldCount} / 原始行 ${audit.rawRowCount} / 可计算 ${audit.usableCount}</p>
    <p>字段: ${fieldText}</p>
    <p>来源: ${audit.metricSources.length ? escapeHtml(audit.metricSources.map(methodLabel).join(" / ")) : "无可计算来源"}</p>
    <p>P2P/CGATS: 色块 ${audit.rawClasses.p2pTotal} / 纸白 ${audit.rawClasses.paper} / 实地 ${audit.rawClasses.cmykSolids} / K-only ${audit.rawClasses.kOnly} / CMY灰 ${audit.rawClasses.cmyNeutralGray}</p>
    <div class="audit-channel-list">${channels}</div>
    ${audit.messages.length ? `<p>提示: ${escapeHtml([...new Set(audit.messages)].join(" / "))}</p>` : "<p>提示: 数据结构满足当前计算。</p>"}
  `;
}

export function renderCurveAcceptanceSummary(acceptance) {
  return `
    <strong>RIP 手录验收</strong>
    <p><span class="status ${acceptance.status === "Ready" ? "pass" : acceptance.status === "Warning" ? "warning" : acceptance.status === "Blocked" ? "fail" : "neutral"}">${acceptance.status}</span> ${escapeHtml(acceptance.message)}</p>
    <p>通道: ${acceptance.channels.join(" ") || "无"} / 曲线点 ${acceptance.rows.length} / 实测 ${acceptance.measured} / 插值 ${acceptance.interpolated}</p>
    <p>减少点 ${acceptance.reductions}，最大减少 ${num(Math.abs(acceptance.maxReduce))}%；增加点 ${acceptance.increases}，最大增加 ${num(acceptance.maxIncrease)}%。</p>
    <p>曲线质量: ${acceptance.qualityStatus || "Ready"} / 警告 ${acceptance.warningCount || 0} / 严重 ${acceptance.dangerCount || 0}。</p>
  `;
}

export function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
