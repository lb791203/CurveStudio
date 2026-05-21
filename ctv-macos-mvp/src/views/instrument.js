import { buildInstrumentVerificationRows, summarizeInstrumentVerification } from "../instrument-verification.js?v=20260521-icc-p2";
import { summarizeDeviceState } from "../device-adapter.js";
import { escapeHtml } from "../shared.js?v=20260521-icc-p2";
import { num, statusClass, signed } from "./helpers.js?v=20260521-icc-p2";

export function renderInstrument(state, els) {
  renderDeviceAdapter(state, els);
  const rows = buildInstrumentVerificationRows(state.measurements || []);
  const summary = summarizeInstrumentVerification(rows);
  const sourceFormats = [...new Set((state.measurements || []).map((row) => row.sourceFormat || row.source || "").filter(Boolean))];

  els.instrumentVerificationSummary.innerHTML = `
    <strong>仪器 / 厂商 CTV 对照</strong>
    <p><span class="status ${statusClass(summary.status)}">${escapeHtml(summary.status)}</span> 可比 ${summary.comparable}/${summary.total}，Pass ${summary.pass} / Warning ${summary.warning} / Fail ${summary.fail}</p>
    <p>平均 |ΔCTV|: ${num(summary.avgAbsDelta)} / 最大 |ΔCTV|: ${num(summary.maxAbsDelta)} / 缺仪器 CTV ${summary.missingInstrument} / 缺软件 CTV ${summary.missingSoftware}</p>
    <p>来源: ${sourceFormats.length ? escapeHtml(sourceFormats.join(" / ")) : "未导入"}。容差: Pass <= 0.50 CTV，Warning <= 1.00 CTV。</p>
    <p>用途: 检查原始测量文件或厂商软件导出的 CTV 字段是否与本软件计算一致；不判断补偿曲线是否有效。</p>
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
    : "<tr><td colspan=\"10\">导入 X-Rite / Techkon 的 CGATS、IT8 或 CSV 测量文件后显示厂商 CTV 对照。</td></tr>";
}

function renderDeviceAdapter(state, els) {
  if (!els.deviceAdapterSummary) return;
  const device = summarizeDeviceState(state.device || {}, state.manualRows || []);
  if (els.deviceAdapterSelect) els.deviceAdapterSelect.value = device.adapter.id;
  if (els.deviceConnectButton) els.deviceConnectButton.disabled = !device.canConnect || device.connected;
  if (els.deviceDisconnectButton) els.deviceDisconnectButton.disabled = !device.connected;
  if (els.deviceCalibrateButton) els.deviceCalibrateButton.disabled = !device.canCalibrate;
  if (els.deviceReadPatchButton) els.deviceReadPatchButton.disabled = !device.canReadPatch;

  els.deviceAdapterSummary.innerHTML = `
    <strong>${escapeHtml(device.adapter.name)}</strong>
    <p><span class="status ${device.adapter.status === "Ready" ? "pass" : "warning"}">${escapeHtml(device.adapter.status)}</span> ${escapeHtml(device.message)}</p>
    <p>连接: ${device.connected ? "已连接" : "未连接"} / 白板校准: ${device.calibrated ? "已完成" : "未完成"} / 队列: ${device.measured}/${device.total}</p>
    <p>能力: ${device.adapter.capabilities.map(escapeHtml).join(" / ")}</p>
    <p>已写入手动表的仪器测量点: ${device.manualInstrumentRows}</p>
  `;

  els.deviceQueueBody.innerHTML = device.queue.map((item, index) => {
    const status = index < device.measured ? "已读取" : index === device.measured ? "当前" : "等待";
    const level = index < device.measured ? "pass" : index === device.measured ? "warning" : "neutral";
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.label)}</td>
        <td>${escapeHtml(item.patchType)} / ${escapeHtml(item.channel)}${item.tone !== "" ? ` / ${num(Number(item.tone))}%` : ""}</td>
        <td><span class="status ${level}">${status}</span></td>
      </tr>
    `;
  }).join("");
}
