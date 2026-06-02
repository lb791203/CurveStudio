import { targetSeries } from "../curve-engine.js";
import { classifyP2PPatch } from "../g7-targets.js";
import { manualHealth, manualRowsToCsv } from "../manual-table.js";
import { inspectImport } from "../import-inspector.js";
import { buildIccStandardPair } from "../icc-pairing.js";
import { cmykFromRow, cmykKey, labFromRow, targetOptions } from "../standards.js";
import { escapeAttr, escapeHtml } from "../shared.js";
import { buildPatchLayout, patchCoordinate, patchName } from "../target-layouts.js";
import { deltaFormulaLabel, methodLabel } from "../ui-labels.js";
import { renderImportAudit, fmt } from "./helpers.js?v=20260525-statusbar-pass-1";
import { t, translateDynamicText } from "../translations.js";

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
  const loading = state.standardLoading ? ` / ${t("loading_standard_reference", "正在加载标准参考数据...")}` : "";
  const g7 = {
    enabled: true,
    npdcAverage: 1.5,
    npdcMax: 3,
    grayAverage: 1.5,
    grayMax: 3,
    grayInflection: "",
    ...(state.standard.g7 || {}),
  };
  const pair = buildIccStandardPair({
    iccProfile: state.iccProfile,
    standard: state.standard,
    targetName: targetName(els.targetSelect.value),
    standardPatchCount: state.standardPatchMap.size || 0,
  });
  syncG7ToleranceInputs(els, g7);
  syncCustomStandardActions(state, els);
  els.standardSummary.innerHTML = `
    <strong>${state.standard.name}</strong>
    <p>${state.standard.printCondition}</p>
    <p>TVI ${escapeHtml(t("target_label", "Target"))}: ${targetName(els.targetSelect.value)}</p>
    <p>25/50/75: ${fmt(targetAt(target, 25))}% / ${fmt(targetAt(target, 50))}% / ${fmt(targetAt(target, 75))}%</p>
    <p>Lab ${escapeHtml(t("patch_label", "Patches"))}: ${state.standardPatchMap.size || 0}${loading}${warning ? ` / ${escapeHtml(translateDynamicText(warning))}` : ""}</p>
    <p>ΔE ${escapeHtml(t("threshold_label", "Tolerance"))}: ${deltaFormulaLabel(els.deltaFormulaSelect.value)} Warning ${state.standard.deltaE.warning}, Fail ${state.standard.deltaE.fail}</p>
    <p>G7: ${g7.enabled === false ? t("off_label", "Off") : t("on_label", "On")} / NPDC wΔL* ${g7.npdcAverage}/${g7.npdcMax} / ${escapeHtml(t("gray_balance_label", "Gray Balance"))} wΔCh ${g7.grayAverage}/${g7.grayMax}</p>
    ${renderIccPairSummary(pair)}
  `;
  renderIccProfileSummary(state, els);
  els.targetCurveBody.innerHTML = target.map((point) => `
    <tr>
      <td>${fmt(point.tone)}%</td>
      <td>${fmt(point.value)}%</td>
      <td>${fmt(point.tone + point.value)}%</td>
    </tr>
  `).join("");
  if (els.toneToleranceNote) els.toneToleranceNote.textContent = toneToleranceNote(state);
  if (els.toneToleranceBody) {
    els.toneToleranceBody.innerHTML = ["C", "M", "Y", "K"].map((channel) => `
      <tr>
        <td><strong>${channel}</strong></td>
        ${["tvi", "ctv"].flatMap((metric) => [25, 50, 75].map((tone) => `
          <td>
            <input class="inline-number tolerance-cell-input" type="number" min="0" max="20" step="0.1"
              value="${fmt(channelToneTolerance(state, channel, metric, tone))}"
              data-tone-tolerance data-channel="${channel}" data-metric="${metric}" data-tone="${tone}"
              aria-label="${channel} ${metric.toUpperCase()} ${tone}% 容差" />
          </td>
        `)).join("")}
        <td>
          <select class="compact-select" data-channel-target="${channel}" aria-label="${channel} TVI 目标曲线">
            ${targetOptions().map((item) => `<option value="${escapeAttr(item.id)}"${item.id === channelTarget(state, channel) ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </td>
      </tr>
    `).join("");
  }
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

function syncCustomStandardActions(state, els) {
  if (els.deleteCustomStandardButton) {
    els.deleteCustomStandardButton.disabled = !state.standard?.id;
    els.deleteCustomStandardButton.textContent = state.standard?.custom
      ? t("delete_custom_standard_button", "Delete Custom Standard")
      : t("hide_builtin_standard_button", "Hide Built-in Standards");
  }
  if (els.restoreStandardListButton) {
    els.restoreStandardListButton.disabled = !(state.hiddenStandardIds?.size);
  }
}

function toneTolerance(tone, mode) {
  if (mode === "ctv") return 3;
  const numeric = Number(tone);
  if (Math.abs(numeric - 50) < 0.01) return 4;
  return 3;
}

function channelToneTolerance(state, channel, metric, tone) {
  const stored = state.standard?.toneTolerances?.[channel]?.[metric]?.[tone];
  return Number.isFinite(Number(stored)) ? Number(stored) : toneTolerance(tone, metric);
}

function toneToleranceNote(state) {
  if (hasToneToleranceValues(state.standard?.toneTolerances)) {
    return t("tone_tolerance_note_standard", "来自当前标准文件或自定义设置；不同标准可保存不同验收窗口。");
  }
  return t("tone_tolerance_note_default", "当前使用内置默认验收窗口；标准文件或自定义标准可覆盖这些容差。");
}

function hasToneToleranceValues(tolerances = {}) {
  return Object.values(tolerances || {}).some((channel) =>
    Object.values(channel || {}).some((metric) =>
      Object.values(metric || {}).some((value) => Number.isFinite(Number(value))),
    ),
  );
}

function channelTarget(state, channel) {
  return state.standard?.channelTargets?.[channel] || state.standard?.target || "isoA";
}

function renderIccPairSummary(pair) {
  const statusLabel = pair.status === "pass" ? "Ready" : "Check";
  return `
    <div class="icc-pair-summary ${pair.status}">
      <div>
        <span class="micro-label">Lab Reference</span>
        <strong>${escapeHtml(pair.labReference.label)}</strong>
        <p>${escapeHtml(labReferenceLine(pair.labReference))}</p>
      </div>
      <div>
        <span class="micro-label">Tone Target</span>
        <strong>${escapeHtml(pair.toneTarget.standardName)}</strong>
        <p>${escapeHtml(`${pair.toneTarget.targetName} / G7 ${pair.toneTarget.g7Enabled ? t("on_label", "On") : t("off_label", "Off")}`)}</p>
      </div>
      <div class="icc-pair-status">
        <span class="status ${pair.status === "pass" ? "pass" : "warning"}">${statusLabel}</span>
      </div>
      <p class="icc-pair-message">${escapeHtml(translateDynamicText(pair.messages[0] || ""))}</p>
    </div>
  `;
}

function labReferenceLine(reference) {
  if (reference.source === "imported-icc") {
    return `${reference.colorSpace || "unknown"} -> ${reference.pcs || "unknown"} / sampled ${reference.sampledCount || 0}/${reference.patchCount || 0}`;
  }
  if (reference.source === "built-in-standard") return `built-in standard / Lab patches ${reference.sampledCount || 0}`;
  return "missing";
}

function renderIccProfileSummary(state, els) {
  if (!els.iccProfileSummary) return;
  const profile = state.iccProfile;
  if (!profile) {
    els.iccProfileSummary.innerHTML = `
      <strong>${escapeHtml(t("icc_color_reference", "ICC 颜色参考"))}</strong>
      <p>${escapeHtml(t("icc_not_imported_help", "未导入 ICC。ICC 可作为 Lab/色彩参考，不能单独生成 TVI/G7 补偿曲线。"))}</p>
    `;
    return;
  }
  if (profile.error) {
    els.iccProfileSummary.innerHTML = `
      <strong>${escapeHtml(t("icc_import_failed", "ICC 导入失败"))}</strong>
      <p>${escapeHtml(profile.fileName || "")}</p>
      <p><span class="status fail">${escapeHtml(profile.error)}</span></p>
    `;
    return;
  }
  els.iccProfileSummary.innerHTML = `
    <strong>${escapeHtml(t("icc_color_reference", "ICC 颜色参考"))}</strong>
    <p>${escapeHtml(profile.profileName)}${profile.fileName ? ` / ${escapeHtml(profile.fileName)}` : ""}</p>
    <p>${escapeHtml(t("type_label", "类型"))}: ${escapeHtml(profile.deviceClass)} / ${escapeHtml(t("color_space_label", "色彩空间"))}: ${escapeHtml(profile.colorSpace)} -> ${escapeHtml(profile.pcs)} / ${escapeHtml(t("version_label", "版本"))} ${escapeHtml(profile.version)}</p>
    <p>${escapeHtml(t("white_point_label", "白点"))}: ${profile.mediaWhitePoint ? labSummary(profile.mediaWhitePoint) : t("not_provided", "未提供")} / Intent: ${escapeHtml(profile.renderingIntent || "")}</p>
    <p>Tags: ${profile.tagCount || 0} ${escapeHtml(t("count_suffix", "个"))}. ${escapeHtml(t("icc_target_separate_help", "TVI/CTV/G7 目标仍需单独选择。"))}</p>
    ${renderIccCharacterization(profile)}
  `;
}

function labSummary(lab) {
  return `L* ${fmt(lab.l)} / a* ${fmt(lab.a)} / b* ${fmt(lab.b)}`;
}

function renderIccCharacterization(profile) {
  const preview = profile.characterization;
  if (!preview) {
    return `
      <div class="icc-preview-block">
        <div class="patch-preview-title">
          <strong>ICC Characterization Preview</strong>
          <span>未读取特性结构</span>
        </div>
        <p class="subtle">当前仅显示 profile metadata；未发现可预览的 A2B 转换结构。</p>
      </div>
    `;
  }
  const rows = preview.rows || [];
  const sampled = preview.status === "sampled";
  const statusText = sampled
    ? `${preview.sampledCount || 0}/${preview.patchCount || rows.length} 个已采样`
    : "无法可靠采样";
  const capabilities = [
    ...(preview.capabilities?.a2b || []),
    ...(preview.capabilities?.b2a || []),
    preview.capabilities?.hasChromaticAdaptation ? "CHAD" : "",
    preview.capabilities?.hasGamut ? "gamt" : "",
  ].filter(Boolean);
  return `
    <div class="icc-preview-block ${sampled ? "sampled" : "unsupported"}">
      <div class="patch-preview-title">
        <strong>ICC Characterization Preview</strong>
        <span>${escapeHtml(statusText)}${preview.sourceTag ? ` / ${escapeHtml(preview.sourceTag)}` : ""}${preview.transformType ? ` / ${escapeHtml(preview.transformType)}` : ""}</span>
      </div>
      <p class="subtle">${escapeHtml(preview.reason || "")}</p>
      ${capabilities.length ? `<p class="subtle">Profile tags: ${escapeHtml(capabilities.join(" / "))}</p>` : ""}
      <div class="icc-preview-grid" aria-label="ICC sampled reference patches">
        ${rows.map((row) => {
          const color = row.lab ? labToRgb(row.lab) : cmykToRgb(row.cmyk);
          const title = `${row.name}: CMYK ${fmt(row.cmyk.c)}/${fmt(row.cmyk.m)}/${fmt(row.cmyk.y)}/${fmt(row.cmyk.k)}${row.lab ? ` / Lab ${fmt(row.lab.l)} ${fmt(row.lab.a)} ${fmt(row.lab.b)}` : " / waiting for CMM sampling"}`;
          return `<span class="icc-preview-swatch${row.lab ? "" : " cmyk-only"}" style="background: ${escapeAttr(color)}" title="${escapeAttr(title)}"></span>`;
        }).join("")}
      </div>
      <div class="table-wrap compact icc-preview-table-wrap">
        <table>
          <thead>
            <tr>
              <th>色块</th>
              <th>用途</th>
              <th>CMYK</th>
              <th>L*</th>
              <th>a*</th>
              <th>b*</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(iccGroupLabel(row.group))}</td>
                <td>${fmt(row.cmyk.c)} / ${fmt(row.cmyk.m)} / ${fmt(row.cmyk.y)} / ${fmt(row.cmyk.k)}</td>
                <td>${row.lab ? fmt(row.lab.l) : "-"}</td>
                <td>${row.lab ? fmt(row.lab.a) : "-"}</td>
                <td>${row.lab ? fmt(row.lab.b) : "-"}</td>
                <td>${escapeHtml(row.source || "ICC preview")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function iccGroupLabel(group) {
  return {
    paper: "纸白",
    solid: "实地",
    overprint: "叠印",
    "single-channel-ramp": "单色阶调",
    "neutral-candidate": "灰平衡候选",
  }[group] || group || "";
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
  const id = patchName(row);
  const cmykText = `CMYK ${fmt(cmyk.c)}/${fmt(cmyk.m)}/${fmt(cmyk.y)}/${fmt(cmyk.k)}`;
  const labText = lab ? `Lab ${fmt(lab.l)} ${fmt(lab.a)} ${fmt(lab.b)}` : translateDynamicText("无 Lab");
  return [id, cmykText, labText].filter(Boolean).join(" / ");
}

function patchKindLabel(cmyk) {
  const classes = classifyP2PPatch(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
  if (classes.includes("paper")) return translateDynamicText("纸白");
  if (classes.includes("c_solid")) return translateDynamicText("C 实地");
  if (classes.includes("m_solid")) return translateDynamicText("M 实地");
  if (classes.includes("y_solid")) return translateDynamicText("Y 实地");
  if (classes.includes("k_solid")) return translateDynamicText("K 实地");
  if (classes.includes("npdc")) return "K-only NPDC";
  if (classes.includes("gray_balance")) return translateDynamicText("CMY 灰平衡");
  if (classes.includes("overprint")) return translateDynamicText("叠印");
  return translateDynamicText("普通色块");
}

function patchGuideRows(patches) {
  return patches.map(({ row, cmyk, lab }, index) => {
    const name = patchName(row) || `#${index + 1}`;
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(name)}</td>
        <td>${fmt(cmyk.c)} / ${fmt(cmyk.m)} / ${fmt(cmyk.y)} / ${fmt(cmyk.k)}</td>
        <td>${lab ? `${fmt(lab.l)} / ${fmt(lab.a)} / ${fmt(lab.b)}` : translateDynamicText("无")}</td>
        <td>${patchKindLabel(cmyk)}</td>
      </tr>
    `;
  }).join("");
}

function patchInspector(patches, selectedIndex, layout) {
  const selected = selectedIndex !== null
    && selectedIndex !== undefined
    && Number.isFinite(Number(selectedIndex))
    ? patches[Number(selectedIndex)]
    : null;
  if (!selected) {
    return `
      <div class="patch-inspector empty-state compact-empty">
        <strong>${escapeHtml(translateDynamicText("点击色块查看数值"))}</strong>
        <p>${escapeHtml(translateDynamicText("选择导表中的任意色块后，这里显示坐标、Sample name、CMYK、Lab 和分类。"))}</p>
      </div>
    `;
  }
  const name = patchName(selected.row) || `#${Number(selectedIndex) + 1}`;
  const coordinate = patchCoordinate(name);
  const lab = selected.lab;
  return `
    <div class="patch-inspector">
      <div class="patch-inspector-title">
        <strong>${escapeHtml(translateDynamicText("当前色块"))} ${escapeHtml(name)}</strong>
        <span>${coordinate ? `x: ${coordinate.column} / y: ${coordinate.rowIndex}` : `#${Number(selectedIndex) + 1}`}</span>
      </div>
      <dl class="patch-inspector-grid">
        <dt>CMYK</dt>
        <dd>${fmt(selected.cmyk.c)} / ${fmt(selected.cmyk.m)} / ${fmt(selected.cmyk.y)} / ${fmt(selected.cmyk.k)}</dd>
        <dt>Lab</dt>
        <dd>${lab ? `${fmt(lab.l)} / ${fmt(lab.a)} / ${fmt(lab.b)}` : translateDynamicText("无")}</dd>
        <dt>${escapeHtml(translateDynamicText("分类"))}</dt>
        <dd>${escapeHtml(patchKindLabel(selected.cmyk))}</dd>
        <dt>${escapeHtml(translateDynamicText("导表"))}</dt>
        <dd>${escapeHtml(translateDynamicText(layout.caption))}</dd>
      </dl>
    </div>
  `;
}

function patchGuideSummary(patches, layout) {
  const counts = patches.reduce((acc, { cmyk }) => {
    const label = patchKindLabel(cmyk);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const keyOrder = [
    translateDynamicText("纸白"),
    translateDynamicText("C 实地"),
    translateDynamicText("M 实地"),
    translateDynamicText("Y 实地"),
    translateDynamicText("K 实地"),
    "K-only NPDC",
    translateDynamicText("CMY 灰平衡"),
    translateDynamicText("叠印"),
    translateDynamicText("普通色块"),
  ];
  const badges = keyOrder
    .filter((label) => counts[label])
    .map((label) => `<span class="patch-guide-badge">${escapeHtml(label)} ${counts[label]}</span>`)
    .join("");
  return `
    <div class="patch-guide-summary">
      <p><strong>${escapeHtml(t("patch_guide_title", "色彩导表"))}</strong> ${escapeHtml(translateDynamicText(layout.caption))}</p>
      <p>${escapeHtml(translateDynamicText(layout.note || t("patch_guide_default_note", "根据文件内 CMYK + Lab 生成色块图，用于确认当前选中的测量文件是否正确。")))}</p>
      <div class="patch-guide-badges">${badges}</div>
    </div>
  `;
}

function renderPatchPreview(state) {
  const rows = state.importInfo?.rawRows || [];
  if (!state.importInfo && !state.measurements.length && !(state.manualRows || []).length) {
    return `
      <strong>${escapeHtml(t("patch_preview_title", "测量文件色块预览"))}</strong>
      <div class="empty-state">
        <strong>${escapeHtml(t("no_measurement_file_loaded", "未加载测量文件"))}</strong>
        <p>${escapeHtml(t("patch_preview_empty_help", "导入 CGATS / IT8 / P2P / CSV 后，这里会显示对应测量文件的色块图，便于确认选中的文件是否正确。"))}</p>
      </div>
    `;
  }
  if (!rows.length) {
    return `
      <strong>${escapeHtml(t("patch_preview_title", "测量文件色块预览"))}</strong>
      <div class="empty-state">
        <strong>${escapeHtml(t("patch_preview_no_rows_title", "暂无可预览色块"))}</strong>
        <p>${escapeHtml(t("patch_preview_no_rows_help", "当前数据来自手动录入或项目档案，没有原始色块行可绘制。"))}</p>
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
      <strong>${escapeHtml(t("patch_preview_title", "测量文件色块预览"))}</strong>
      <div class="empty-state">
        <strong>${escapeHtml(t("patch_preview_no_cmyk_title", "当前文件没有可预览的 CMYK/Lab 色块"))}</strong>
        <p>${escapeHtml(t("patch_preview_no_cmyk_help", "请确认文件包含 CMYK 列，或改用标准 CGATS / IT8 / P2P 导出。"))}</p>
      </div>
    `;
  }
  const limit = 2000;
  const shown = patches.slice(0, limit);
  const layout = buildPatchLayout(shown);
  const selectedIndex = state.selectedPatchIndex !== null
    && state.selectedPatchIndex !== undefined
    && Number.isFinite(Number(state.selectedPatchIndex))
    && Number(state.selectedPatchIndex) < shown.length
    ? Number(state.selectedPatchIndex)
    : null;
  return `
    <div class="patch-preview-title">
      <strong>${escapeHtml(t("patch_map_title", "测量文件色块图"))}</strong>
      <span>${patches.length} ${escapeHtml(t("patch_count_suffix", "个色块"))}${patches.length > shown.length ? ` / ${escapeHtml(t("showing_first_label", "显示前"))} ${shown.length} ${escapeHtml(t("count_suffix", "个"))}` : ""} / ${escapeHtml(translateDynamicText(layout.name))} / ${escapeHtml(layout.mode === "target-coordinate" ? t("target_coordinate_layout", "按导表坐标显示") : t("file_order_layout", "按文件顺序显示"))}</span>
    </div>
    <div class="patch-preview-layout">
      <div class="patch-map-card">
        <div class="patch-preview-grid ${layout.mode === "target-coordinate" ? "target-layout" : ""}" style="--patch-cols: ${layout.columns}; --patch-size: ${layout.cellSize}px" aria-label="${escapeAttr(t("patch_preview_title", "测量文件色块预览"))}">
          ${layout.cells.map((cell) => {
            if (!cell?.patch) return "<span class=\"patch-swatch empty\" aria-hidden=\"true\"></span>";
            const { row, cmyk, lab, color } = cell.patch;
            const selected = cell.index === selectedIndex;
            const section = cell.section === "extra" ? " extra" : "";
            return `<button class="patch-swatch${lab ? "" : " cmyk-only"}${section}${selected ? " selected" : ""}" type="button" data-patch-index="${cell.index}" data-patch-section="${escapeAttr(cell.section || "file")}" aria-pressed="${selected ? "true" : "false"}" style="background: ${escapeAttr(color)}" title="${escapeAttr(`${cell.index + 1}. ${patchTitle(row, cmyk, lab)} / ${patchKindLabel(cmyk)}`)}" aria-label="${escapeAttr(`${t("view_patch_label", "查看色块")} ${patchName(row) || cell.index + 1}`)}"></button>`;
          }).join("")}
        </div>
      </div>
      <div class="patch-guide-side">
        ${patchGuideSummary(shown, layout)}
        ${patchInspector(shown, selectedIndex, layout)}
      </div>
    </div>
    <details class="patch-guide-details">
      <summary>${escapeHtml(t("show_patch_guide_details", "展开对应色彩导表明细"))}</summary>
      <div class="patch-guide-table-wrap" aria-label="${escapeAttr(t("matching_target_chart", "对应色彩导表"))}">
        <table class="patch-guide-table">
          <thead>
            <tr>
              <th>#</th>
              <th>${escapeHtml(t("patch_label", "色块"))}</th>
              <th>CMYK</th>
              <th>Lab</th>
              <th>${escapeHtml(t("patch_category_use", "分类/用途"))}</th>
            </tr>
          </thead>
          <tbody>${patchGuideRows(shown)}</tbody>
        </table>
      </div>
    </details>
  `;
}

export function renderMeasurement(state, els) {
  const rawRows = state.importInfo?.rawRows?.length || 0;
  const warnings = visibleWarnings(state, els);
  const translatedWarnings = warnings.map(translateDynamicText);
  const health = manualHealth(state.manualRows || []);
  const audit = inspectImport({
    importInfo: state.importInfo,
    measurements: state.measurements,
    results: state.results,
    mode: els.modeSelect.value,
  });
  const status = state.results.length
    ? t("measurement_status_curve_ready", "已生成曲线")
    : state.measurements.length
      ? t("measurement_status_review", "可计算/待确认")
      : state.importInfo
        ? t("measurement_status_insufficient", "数据不足")
        : t("measurement_status_empty", "未导入");
  if (!state.importInfo && !state.measurements.length && !(state.manualRows || []).length) {
    els.measurementSummary.innerHTML = `
      <strong>${escapeHtml(t("file_import_status_title", "文件导入状态"))}</strong>
      <div class="empty-state compact-empty">
        <strong>${escapeHtml(t("no_measurement_file_loaded", "未加载测量文件"))}</strong>
        <p>${escapeHtml(t("file_import_empty_help", "选择 CGATS / IT8 / P2P / CSV / JSON 测量文件后自动解析。"))}</p>
      </div>
    `;
  } else {
    els.measurementSummary.innerHTML = `
      <strong>${escapeHtml(t("file_import_status_title", "文件导入状态"))}</strong>
      <p>${escapeHtml(t("status_label", "状态"))}: ${escapeHtml(status)}</p>
      <p>${escapeHtml(t("source_label", "来源"))}: ${escapeHtml(state.importInfo?.sourceFormat || t("manual_entry_label", "手动录入"))}</p>
      <p>${escapeHtml(t("raw_patches_rows_label", "原始色块/行"))} ${rawRows} / ${escapeHtml(t("usable_measurements_label", "可计算测点"))} ${state.measurements.length}</p>
      <p>${escapeHtml(t("hint_label", "提示"))}: ${translatedWarnings.length ? escapeHtml(translatedWarnings.join(" / ")) : escapeHtml(t("none_label", "无"))}</p>
    `;
  }
  if (els.measurementPatchPreview) els.measurementPatchPreview.innerHTML = renderPatchPreview(state);
  els.importAuditSummary.innerHTML = renderImportAudit(audit);
  els.manualHealthSummary.innerHTML = `
    <strong>${escapeHtml(t("field_entry_check_title", "现场录入检查"))}</strong>
    <p>${escapeHtml(health.ready ? t("manual_ready_basic_curve", "可计算基础曲线。") : t("manual_missing_curve_data", "还缺少现场曲线计算数据。"))}</p>
    ${health.messages.map((item) => `<p>${escapeHtml(translateDynamicText(item))}</p>`).join("")}
  `;
}
