import { buildInstrumentVerificationRows, summarizeInstrumentVerification } from "../instrument-verification.js?v=20260519-instrument-verify";
import { escapeHtml } from "../shared.js?v=20260519-instrument-verify";
import { num, statusClass, signed } from "./helpers.js?v=20260519-instrument-verify";

export function renderInstrument(state, els) {
  const rows = buildInstrumentVerificationRows(state.measurements || []);
  const summary = summarizeInstrumentVerification(rows);
  const sourceFormats = [...new Set((state.measurements || []).map((row) => row.sourceFormat || row.source || "").filter(Boolean))];

  els.instrumentVerificationSummary.innerHTML = `
    <strong>仪器交叉验证</strong>
    <p><span class="status ${statusClass(summary.status)}">${escapeHtml(summary.status)}</span> 可比 ${summary.comparable}/${summary.total}，Pass ${summary.pass} / Warning ${summary.warning} / Fail ${summary.fail}</p>
    <p>平均 |ΔCTV|: ${num(summary.avgAbsDelta)} / 最大 |ΔCTV|: ${num(summary.maxAbsDelta)} / 缺仪器 CTV ${summary.missingInstrument} / 缺软件 CTV ${summary.missingSoftware}</p>
    <p>来源: ${sourceFormats.length ? escapeHtml(sourceFormats.join(" / ")) : "未导入"}。容差: Pass <= 0.50 CTV，Warning <= 1.00 CTV。</p>
    <p>i1Pro 建议流程: 测量测试样张后，从 X-Rite/i1Profiler/ColorPort 导出 CGATS/IT8/CSV；文件含 Lab/XYZ/光谱即可计算软件 CTV，若额外含 CTV/SCTV 字段则自动对比。</p>
  `;

  els.instrumentVerificationBody.innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.channel)}</td>
        <td>${num(row.tone)}%</td>
        <td>${escapeHtml(row.sampleId)}</td>
        <td>${escapeHtml(row.source)}</td>
        <td>${num(row.softwareCtv)}</td>
        <td>${escapeHtml(row.softwareMethod || "缺 Lab/XYZ/光谱")}</td>
        <td>${num(row.instrumentCtv)}</td>
        <td>${escapeHtml(row.instrumentMethod || "未提供")}</td>
        <td class="${Math.abs(row.delta) > 1 ? "negative" : Math.abs(row.delta) > 0.5 ? "warn" : ""}">${Number.isFinite(row.delta) ? signed(row.delta) : "N/A"}</td>
        <td><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
      </tr>
    `).join("")
    : "<tr><td colspan=\"10\">导入 X-Rite / Techkon 的 CGATS、IT8 或 CSV 测量文件后显示交叉验证。</td></tr>";
}
