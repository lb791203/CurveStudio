import { buildInstrumentVerificationRows, summarizeInstrumentVerification } from "../instrument-verification.js?v=20260521-icc-p4";
import { summarizeDeviceState } from "../device-adapter.js";
import { escapeHtml } from "../shared.js?v=20260521-icc-p4";
import { t, translateDynamicText } from "../translations.js";
import { num, statusClass, signed } from "./helpers.js?v=20260521-icc-p4";

export function renderInstrument(state, els) {
  renderDeviceAdapter(state, els);
  const rows = buildInstrumentVerificationRows(state.measurements || []);
  const summary = summarizeInstrumentVerification(rows);
  const sourceFormats = [...new Set((state.measurements || []).map((row) => row.sourceFormat || row.source || "").filter(Boolean))];

  els.instrumentVerificationSummary.innerHTML = `
    <strong>${escapeHtml(t("instrument_vendor_ctv_check_title", "Instrument / Vendor CTV Check"))}</strong>
    <p><span class="status ${statusClass(summary.status)}">${escapeHtml(summary.status)}</span> ${escapeHtml(t("comparable_label", "Comparable"))} ${summary.comparable}/${summary.total}, Pass ${summary.pass} / Warning ${summary.warning} / Fail ${summary.fail}</p>
    <p>${escapeHtml(t("avg_abs_ctv_label", "Average |ΔCTV|"))}: ${num(summary.avgAbsDelta)} / ${escapeHtml(t("max_abs_ctv_label", "Max |ΔCTV|"))}: ${num(summary.maxAbsDelta)} / ${escapeHtml(t("missing_instrument_ctv_label", "Missing instrument CTV"))} ${summary.missingInstrument} / ${escapeHtml(t("missing_software_ctv_label", "Missing software CTV"))} ${summary.missingSoftware}</p>
    <p>${escapeHtml(t("source_label", "Source"))}: ${sourceFormats.length ? escapeHtml(sourceFormats.join(" / ")) : t("not_imported_label", "Not imported")}. ${escapeHtml(t("threshold_label", "Tolerance"))}: Pass <= 0.50 CTV, Warning <= 1.00 CTV.</p>
    <p>${escapeHtml(t("purpose_label", "Purpose"))}: ${escapeHtml(t("instrument_ctv_purpose", "Check whether CTV fields exported by the original measurement file or vendor software match this software's calculation; this does not judge whether the compensation curve is effective."))}</p>
    <p>i1Pro ${escapeHtml(t("recommended_workflow_label", "Recommended workflow"))}: ${escapeHtml(t("i1pro_workflow_help", "After measuring the test chart, export CGATS/IT8/CSV from X-Rite/i1Profiler/ColorPort. Files with Lab/XYZ/spectral data can compute software CTV; files with extra CTV/SCTV fields are compared automatically."))}</p>
  `;

  els.instrumentVerificationBody.innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.channel)}</td>
        <td>${num(row.tone)}%</td>
        <td>${escapeHtml(row.sampleId)}</td>
        <td>${escapeHtml(row.source)}</td>
        <td>${num(row.softwareCtv)}</td>
        <td>${escapeHtml(translateDynamicText(row.softwareMethod || t("missing_lab_xyz_spectral", "Missing Lab/XYZ/spectral data")))}</td>
        <td>${num(row.instrumentCtv)}</td>
        <td>${escapeHtml(translateDynamicText(row.instrumentMethod || t("not_provided", "Not provided")))}</td>
        <td class="${Math.abs(row.delta) > 1 ? "negative" : Math.abs(row.delta) > 0.5 ? "warn" : ""}">${Number.isFinite(row.delta) ? signed(row.delta) : "N/A"}</td>
        <td><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="10">${escapeHtml(t("instrument_ctv_empty_help", "Import an X-Rite / Techkon CGATS, IT8, or CSV measurement file to show vendor CTV comparison."))}</td></tr>`;
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
    <strong>${escapeHtml(translateDynamicText(device.adapter.name))}</strong>
    <p><span class="status ${device.adapter.status === "Ready" ? "pass" : "warning"}">${escapeHtml(device.adapter.status)}</span> ${escapeHtml(translateDynamicText(device.message))}</p>
    <p>${escapeHtml(t("connect_label", "Connect"))}: ${device.connected ? t("connected_label", "Connected") : t("not_connected_label", "Not connected")} / ${escapeHtml(t("white_calibration_label", "White Calibration"))}: ${device.calibrated ? t("completed_label", "Completed") : t("not_completed_label", "Not completed")} / ${escapeHtml(t("queue_label", "Queue"))}: ${device.measured}/${device.total}</p>
    <p>${escapeHtml(t("capabilities_label", "Capabilities"))}: ${device.adapter.capabilities.map(escapeHtml).join(" / ")}</p>
    <p>${escapeHtml(t("manual_instrument_rows_label", "Instrument measurements written to the manual table"))}: ${device.manualInstrumentRows}</p>
  `;

  els.deviceQueueBody.innerHTML = device.queue.map((item, index) => {
    const status = index < device.measured ? t("read_label", "Read") : index === device.measured ? t("current_label", "Current") : t("waiting_label", "Waiting");
    const level = index < device.measured ? "pass" : index === device.measured ? "warning" : "neutral";
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(translateDynamicText(item.label))}</td>
        <td>${escapeHtml(item.patchType)} / ${escapeHtml(item.channel)}${item.tone !== "" ? ` / ${num(Number(item.tone))}%` : ""}</td>
        <td><span class="status ${level}">${status}</span></td>
      </tr>
    `;
  }).join("");
}
