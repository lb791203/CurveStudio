import { targetSeries } from "../curve-engine.js";
import { manualHealth, manualRowsToCsv } from "../manual-table.js";
import { inspectImport } from "../import-inspector.js";
import { cmykFromRow, cmykKey, labFromRow, targetOptions } from "../standards.js";
import { escapeAttr, escapeHtml } from "../shared.js";
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
  const g7 = {
    enabled: true,
    npdcAverage: 1.5,
    npdcMax: 3,
    grayAverage: 1.5,
    grayMax: 3,
    grayInflection: "",
    ...(state.standard.g7 || {}),
  };
  syncG7ToleranceInputs(els, g7);
  els.standardSummary.innerHTML = `
    <strong>${state.standard.name}</strong>
    <p>${state.standard.printCondition}</p>
    <p>TVI 目标: ${targetName(els.targetSelect.value)}</p>
    <p>25/50/75: ${fmt(targetAt(target, 25))}% / ${fmt(targetAt(target, 50))}% / ${fmt(targetAt(target, 75))}%</p>
    <p>Lab 色块: ${state.standardPatchMap.size || 0} 个${loading}${warning ? ` / ${escapeHtml(warning)}` : ""}</p>
    <p>ΔE 阈值: ${deltaFormulaLabel(els.deltaFormulaSelect.value)} Warning ${state.standard.deltaE.warning}, Fail ${state.standard.deltaE.fail}</p>
    <p>G7: ${g7.enabled === false ? "关闭" : "启用"} / NPDC wΔL* ${g7.npdcAverage}/${g7.npdcMax} / 灰平衡 wΔCh ${g7.grayAverage}/${g7.grayMax}</p>
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

function syncG7ToleranceInputs(els, g7) {
  if (els.g7EnabledInput) els.g7EnabledInput.checked = g7.enabled !== false;
  if (els.g7NpdcAverageInput) els.g7NpdcAverageInput.value = g7.npdcAverage;
  if (els.g7NpdcMaxInput) els.g7NpdcMaxInput.value = g7.npdcMax;
  if (els.g7GrayAverageInput) els.g7GrayAverageInput.value = g7.grayAverage;
  if (els.g7GrayMaxInput) els.g7GrayMaxInput.value = g7.grayMax;
  if (els.g7GrayInflectionInput) els.g7GrayInflectionInput.value = g7.grayInflection ?? "";
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

function clamp255(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function gammaEncode(value) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * (value ** (1 / 2.4)) - 0.055;
}

function labToRgb(lab) {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const pivot = (value) => {
    const cube = value ** 3;
    return cube > 0.008856 ? cube : (value - 16 / 116) / 7.787;
  };
  const x = 0.96422 * pivot(fx);
  const y = 1.00000 * pivot(fy);
  const z = 0.82521 * pivot(fz);
  const r = gammaEncode(3.1338561 * x - 1.6168667 * y - 0.4906146 * z);
  const g = gammaEncode(-0.9787684 * x + 1.9161415 * y + 0.0334540 * z);
  const b = gammaEncode(0.0719453 * x - 0.2289914 * y + 1.4052427 * z);
  return `rgb(${clamp255(r * 255)}, ${clamp255(g * 255)}, ${clamp255(b * 255)})`;
}

function cmykToRgb(cmyk) {
  const c = Math.max(0, Math.min(1, (cmyk.c || 0) / 100));
  const m = Math.max(0, Math.min(1, (cmyk.m || 0) / 100));
  const y = Math.max(0, Math.min(1, (cmyk.y || 0) / 100));
  const k = Math.max(0, Math.min(1, (cmyk.k || 0) / 100));
  return `rgb(${clamp255(255 * (1 - c) * (1 - k))}, ${clamp255(255 * (1 - m) * (1 - k))}, ${clamp255(255 * (1 - y) * (1 - k))})`;
}

function patchTitle(row, cmyk, lab) {
  const id = row.sample_id || row.sampleid || row.id || row.name || "";
  const cmykText = `CMYK ${fmt(cmyk.c)}/${fmt(cmyk.m)}/${fmt(cmyk.y)}/${fmt(cmyk.k)}`;
  const labText = lab ? `Lab ${fmt(lab.l)} ${fmt(lab.a)} ${fmt(lab.b)}` : "无 Lab";
  return [id, cmykText, labText].filter(Boolean).join(" / ");
}

function renderPatchPreview(state) {
  const rows = state.importInfo?.rawRows || [];
  if (!state.importInfo && !state.measurements.length && !(state.manualRows || []).length) {
    return `
      <strong>测量文件色块预览</strong>
      <div class="empty-state">
        <strong>未加载测量文件</strong>
        <p>导入 CGATS / IT8 / P2P / CSV 后，这里会显示对应测量文件的色块图，便于确认选中的文件是否正确。</p>
      </div>
    `;
  }
  if (!rows.length) {
    return `
      <strong>测量文件色块预览</strong>
      <div class="empty-state">
        <strong>暂无可预览色块</strong>
        <p>当前数据来自手动录入或项目档案，没有原始色块行可绘制。</p>
      </div>
    `;
  }
  const patches = rows
    .map((row) => {
      const cmyk = cmykFromRow(row);
      if (!cmyk) return null;
      const lab = labFromRow(row);
      return { row, cmyk, lab, color: lab ? labToRgb(lab) : cmykToRgb(cmyk) };
    })
    .filter(Boolean);
  if (!patches.length) {
    return `
      <strong>测量文件色块预览</strong>
      <div class="empty-state">
        <strong>当前文件没有可预览的 CMYK/Lab 色块</strong>
        <p>请确认文件包含 CMYK 列，或改用标准 CGATS / IT8 / P2P 导出。</p>
      </div>
    `;
  }
  const limit = 420;
  const shown = patches.slice(0, limit);
  return `
    <div class="patch-preview-title">
      <strong>测量文件色块预览</strong>
      <span>${patches.length} 个色块${patches.length > shown.length ? ` / 显示前 ${shown.length} 个` : ""}</span>
    </div>
    <div class="patch-preview-grid" aria-label="测量文件色块预览">
      ${shown.map(({ row, cmyk, lab, color }) => `
        <span class="patch-swatch${lab ? "" : " cmyk-only"}" style="background: ${escapeAttr(color)}" title="${escapeAttr(patchTitle(row, cmyk, lab))}"></span>
      `).join("")}
    </div>
  `;
}

export function renderMeasurement(state, els) {
  const rawRows = state.importInfo?.rawRows?.length || 0;
  const warnings = visibleWarnings(state, els);
  const health = manualHealth(state.manualRows || []);
  const audit = inspectImport({
    importInfo: state.importInfo,
    measurements: state.measurements,
    results: state.results,
    mode: els.modeSelect.value,
  });
  const status = state.results.length ? "已生成曲线" : state.measurements.length ? "可计算/待确认" : state.importInfo ? "数据不足" : "未导入";
  if (!state.importInfo && !state.measurements.length && !(state.manualRows || []).length) {
    els.measurementSummary.innerHTML = `
      <strong>当前数据</strong>
      <div class="empty-state compact-empty">
        <strong>未加载文件</strong>
        <p>请选择测量文件、载入示例，或在下方手动录入现场单点数据。</p>
      </div>
    `;
  } else {
    els.measurementSummary.innerHTML = `
      <strong>当前数据</strong>
      <p>状态: ${status}</p>
      <p>来源: ${state.importInfo?.sourceFormat || "手动录入"}</p>
      <p>原始色块/行: ${rawRows}</p>
      <p>可计算测量点: ${state.measurements.length}</p>
      <p>提示: ${warnings.length ? escapeHtml(warnings.join(" / ")) : "无"}</p>
    `;
  }
  if (els.measurementPatchPreview) els.measurementPatchPreview.innerHTML = renderPatchPreview(state);
  els.importAuditSummary.innerHTML = renderImportAudit(audit);
  els.manualHealthSummary.innerHTML = `
    <strong>现场录入检查</strong>
    <p>${health.ready ? "可计算基础曲线。" : "还缺少现场曲线计算数据。"}</p>
    ${health.messages.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
  `;
}
