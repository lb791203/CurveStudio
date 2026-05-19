import { targetSeries } from "../curve-engine.js";
import { manualHealth, manualRowsToCsv } from "../manual-table.js";
import { inspectImport } from "../import-inspector.js";
import { cmykKey, targetOptions } from "../standards.js";
import { escapeHtml } from "../shared.js";
import { deltaFormulaLabel, methodLabel } from "../ui-labels.js";
import { renderImportAudit, fmt } from "./helpers.js";

export function targetName(id) {
  return targetOptions().find((item) => item.id === id)?.name || id;
}

function targetAt(targetRows, tone) {
  const exact = targetRows.find((row) => row.tone === tone);
  if (exact) return exact.value;
  for (let i = 1; i < targetRows.length; i += 1) {
    const prev = targetRows[i - 1];
    const next = targetRows[i];
    if (tone <= next.tone) {
      const ratio = (tone - prev.tone) / (next.tone - prev.tone || 1);
      return prev.value + (next.value - prev.value) * ratio;
    }
  }
  return targetRows.at(-1)?.value || 0;
}

function standardPatchRows(state) {
  const solidKeys = [
    { label: "Paper", cmyk: { c: 0, m: 0, y: 0, k: 0 } },
    { label: "C solid", cmyk: { c: 100, m: 0, y: 0, k: 0 } },
    { label: "M solid", cmyk: { c: 0, m: 100, y: 0, k: 0 } },
    { label: "Y solid", cmyk: { c: 0, m: 0, y: 100, k: 0 } },
    { label: "K solid", cmyk: { c: 0, m: 0, y: 0, k: 100 } },
    { label: "CM", cmyk: { c: 100, m: 100, y: 0, k: 0 } },
    { label: "CY", cmyk: { c: 100, m: 0, y: 100, k: 0 } },
    { label: "MY", cmyk: { c: 0, m: 100, y: 100, k: 0 } },
    { label: "CMY", cmyk: { c: 100, m: 100, y: 100, k: 0 } },
  ];
  const toneKeys = ["C", "M", "Y", "K"].flatMap((channel) => [25, 50, 75].map((tone) => ({
    label: `${channel} ${tone}%`,
    cmyk: {
      c: channel === "C" ? tone : 0,
      m: channel === "M" ? tone : 0,
      y: channel === "Y" ? tone : 0,
      k: channel === "K" ? tone : 0,
    },
  })));
  const keys = [...solidKeys, ...toneKeys];
  return keys
    .map((item) => ({ ...item, lab: state.standardPatchMap.get(cmykKey(item.cmyk))?.lab }))
    .filter((item) => item.lab);
}

export function renderStandard(state, els) {
  const target = targetSeries(els.targetSelect.value);
  const warning = state.standardImport?.warnings?.[0] || "";
  const loading = state.standardLoading ? " / 正在加载标准参考数据..." : "";
  els.standardSummary.innerHTML = `
    <strong>${state.standard.name}</strong>
    <p>${state.standard.printCondition}</p>
    <p>TVI 目标: ${targetName(els.targetSelect.value)}</p>
    <p>25/50/75: ${fmt(targetAt(target, 25))}% / ${fmt(targetAt(target, 50))}% / ${fmt(targetAt(target, 75))}%</p>
    <p>Lab 色块: ${state.standardPatchMap.size || 0} 个${loading}${warning ? ` / ${escapeHtml(warning)}` : ""}</p>
    <p>ΔE 阈值: ${deltaFormulaLabel(els.deltaFormulaSelect.value)} Warning ${state.standard.deltaE.warning}, Fail ${state.standard.deltaE.fail}</p>
  `;
  els.targetCurveBody.innerHTML = target.map((point) => `
    <tr>
      <td>${fmt(point.tone)}%</td>
      <td>${fmt(point.value)}%</td>
      <td>${fmt(point.tone + point.value)}%</td>
    </tr>
  `).join("");
  els.standardPatchBody.innerHTML = standardPatchRows(state).map((item) => `
    <tr>
      <td>${item.label}</td>
      <td>${fmt(item.cmyk.c)}%</td>
      <td>${fmt(item.cmyk.m)}%</td>
      <td>${fmt(item.cmyk.y)}%</td>
      <td>${fmt(item.cmyk.k)}%</td>
      <td>${fmt(item.lab.l)}</td>
      <td>${fmt(item.lab.a)}</td>
      <td>${fmt(item.lab.b)}</td>
    </tr>
  `).join("");
}

export function visibleWarnings(state, els) {
  const warnings = [...(state.importInfo?.warnings || [])];
  if (state.manualDirty) {
    warnings.push("手动测量表已修改，当前曲线结果已过期；请先点击「应用测量表」再导出或保存。");
  }
  if (els.modeSelect.value === "ctv" && state.results.some((row) => row.metricName === "TVI fallback")) {
    warnings.push("CTV 模式需要纸白、实地和阶调 Lab/XYZ；当前部分点已降级为 TVI 计算。");
  }
  if (state.results.some((row) => /status_t_spectral/.test(String(row.metricMethod || "")))) {
    warnings.push("光谱密度使用 ISO 5-3 Status-T 加权计算；Status-E 尚未启用，不能按 Status-E 报告。");
  }
  if (state.storageWarning) warnings.push(state.storageWarning);
  return [...new Set(warnings.filter(Boolean))];
}

export function renderMeasurement(state, els) {
  const rawRows = state.importInfo?.rawRows?.length || 0;
  const warnings = visibleWarnings(state, els);
  const health = manualHealth(state.manualRows);
  const audit = inspectImport({
    importInfo: state.importInfo,
    measurements: state.measurements,
    results: state.results,
    mode: els.modeSelect.value,
  });
  const status = state.results.length ? "已生成曲线" : state.measurements.length ? "可计算/待确认" : state.importInfo ? "数据不足" : "未导入";
  els.measurementSummary.innerHTML = `
    <strong>当前数据</strong>
    <p>状态: ${status}</p>
    <p>来源: ${state.importInfo?.sourceFormat || "未加载"}</p>
    <p>原始色块/行: ${rawRows}</p>
    <p>可计算测量点: ${state.measurements.length}</p>
    <p>提示: ${warnings.length ? escapeHtml(warnings.join(" / ")) : "无"}</p>
  `;
  els.importAuditSummary.innerHTML = renderImportAudit(audit);
  els.manualHealthSummary.innerHTML = `
    <strong>现场录入检查</strong>
    <p>${health.ready ? "可计算基础曲线。" : "还缺少现场曲线计算数据。"}</p>
    ${health.messages.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
  `;
}
