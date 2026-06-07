import { murrayDaviesToneFromDensity, spotColorToneValueFromLab } from "./curve-engine.js";
import { escapeAttr } from "./shared.js";

const PATCH_TYPES = ["tone", "paper", "solid", "overprint", "gray"];
const CHANNELS = ["C", "M", "Y", "K", "Paper", "CM", "CY", "MY", "CMY", "Gray"];
const SOURCE_TYPES = ["手动", "文件导入", "仪器测量", "人工修正"];

const PASTE_FIELD_ALIASES = {
  patchType: ["patch_type", "patchtype", "type", "类型", "类别", "色块类型"],
  channel: ["channel", "ink", "color", "separation", "通道", "通道_色块", "色块", "颜色"],
  tone: ["tone", "input", "input_tone", "input_percent", "输入网点", "网点", "输入"],
  measuredTone: ["measured_tone", "print_tone", "tone_value", "dot_area", "实测网点", "测量网点", "印刷品网点"],
  density: ["density", "status_density", "密度", "实测密度"],
  labL: ["lab_l", "l", "lstar", "l*", "lab_lstar"],
  labA: ["lab_a", "a", "astar", "a*", "lab_astar"],
  labB: ["lab_b", "b", "bstar", "b*", "lab_bstar"],
  source: ["source", "来源", "数据来源"],
  note: ["note", "remark", "remarks", "备注"],
};

export function defaultManualRow(overrides = {}) {
  return {
    patchType: "tone",
    channel: "C",
    tone: 50,
    measuredTone: "",
    density: "",
    labL: "",
    labA: "",
    labB: "",
    source: "手动",
    note: "",
    ...overrides,
  };
}

export function manualTemplateRows(type, source = "手动") {
  const templates = {
    platePrint: toneRows([25, 50, 75], source, "印张网点 (TVI)"),
    density: [
      manualRow("paper", "Paper", "", "", 0, source, "纸白密度"),
      ...["C", "M", "Y", "K"].map((channel) => manualRow("solid", channel, 100, "", "", source, `${channel} 实地密度`)),
      ...toneRows([25, 50, 75], source, "密度 TVI"),
    ],
    labCtv: [
      manualRow("paper", "Paper", "", "", "", source, "纸白 Lab"),
      ...["C", "M", "Y", "K"].map((channel) => manualRow("solid", channel, 100, "", "", source, `${channel} 实地 Lab`)),
      ...toneRows([25, 50, 75], source, "CTV Lab"),
    ],
    field: [
      manualRow("paper", "Paper", "", "", "", source, "纸白"),
      ...["C", "M", "Y", "K"].map((channel) => manualRow("solid", channel, 100, "", "", source, `${channel} 实地`)),
    ],
    2575: toneRows([25, 50, 75], source),
    full: toneRows([5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95], source),
    g7: [
      ...[25, 50, 75].map((tone) => manualRow("gray", "Gray", tone, "", "", source, `G7 Gray ${tone}`)),
      manualRow("overprint", "CM", 100, "", "", source, "CM 叠印"),
      manualRow("overprint", "CY", 100, "", "", source, "CY 叠印"),
      manualRow("overprint", "MY", 100, "", "", source, "MY 叠印"),
      manualRow("overprint", "CMY", 100, "", "", source, "CMY 叠印"),
    ],
  };
  return (templates[type] || []).map((row) => ({ ...row }));
}

export function renderManualTable(tbody, rows) {
  const normalizedRows = rows.map(normalizeManualRow);
  const refs = labReferenceByChannel(normalizedRows);
  tbody.innerHTML = rows
    .map((row, index) => {
      const status = manualRowStatus(normalizedRows[index], refs);
      return `
      <tr class="manual-row manual-${escapeAttr(row.patchType || "tone")}">
        <td>
          <select data-manual-index="${index}" data-manual-field="patchType">
            ${optionList(PATCH_TYPES, row.patchType)}
          </select>
        </td>
        <td>
          <select data-manual-index="${index}" data-manual-field="channel">
            ${optionList(CHANNELS, row.channel)}
          </select>
        </td>
        <td><input data-manual-index="${index}" data-manual-field="tone" type="number" min="0" max="100" step="0.1" value="${escapeAttr(row.tone)}" /></td>
        <td><input data-manual-index="${index}" data-manual-field="measuredTone" type="number" min="0" max="100" step="0.1" value="${escapeAttr(row.measuredTone)}" /></td>
        <td><input data-manual-index="${index}" data-manual-field="density" type="number" min="0" max="3" step="0.01" value="${escapeAttr(row.density)}" /></td>
        <td><input data-manual-index="${index}" data-manual-field="labL" type="number" step="0.01" value="${escapeAttr(row.labL)}" /></td>
        <td><input data-manual-index="${index}" data-manual-field="labA" type="number" step="0.01" value="${escapeAttr(row.labA)}" /></td>
        <td><input data-manual-index="${index}" data-manual-field="labB" type="number" step="0.01" value="${escapeAttr(row.labB)}" /></td>
        <td>
          <select data-manual-index="${index}" data-manual-field="source">
            ${optionList(sourceOptions(row.source), row.source)}
          </select>
        </td>
        <td><input data-manual-index="${index}" data-manual-field="note" type="text" value="${escapeAttr(row.note)}" /></td>
        <td>${status.path}</td>
        <td><span class="status ${status.level}">${status.label}</span></td>
        <td><button class="icon-button" type="button" data-delete-manual-index="${index}" title="删除">×</button></td>
      </tr>
    `;
    })
    .join("");
}

export function updateManualRowFromEvent(rows, event) {
  const index = Number(event.target.dataset.manualIndex);
  const field = event.target.dataset.manualField;
  if (!Number.isInteger(index) || !field || !rows[index]) return false;
  rows[index][field] = event.target.value;
  return true;
}

export function deleteManualRowFromEvent(rows, event) {
  const index = Number(event.target.dataset.deleteManualIndex);
  if (!Number.isInteger(index)) return false;
  rows.splice(index, 1);
  return true;
}

export function parseManualPaste(text) {
  if (!text) return [];
  const rawRows = text.trim().split(/\r?\n/).map(splitPasteLine).filter((row) => row.some((cell) => cell !== ""));
  if (!rawRows.length) return [];

  const headerMap = buildPasteHeaderMap(rawRows[0]);
  const body = headerMap ? rawRows.slice(1) : rawRows;
  return body.map((cells) => headerMap ? rowFromHeaderMap(cells, headerMap) : rowFromOrderedCells(cells));
}

export function normalizeManualRow(row) {
  return {
    patchType: row.patchType || "tone",
    channel: row.channel || "C",
    tone: numericOrBlank(row.tone),
    measuredTone: numericOrBlank(row.measuredTone),
    density: numericOrBlank(row.density),
    labL: numericOrBlank(row.labL),
    labA: numericOrBlank(row.labA),
    labB: numericOrBlank(row.labB),
    source: row.source || "Manual",
    note: row.note || "",
  };
}

export function canCalculateCurve(row) {
  return ["tone", "solid"].includes(row.patchType)
    && ["C", "M", "Y", "K"].includes(row.channel)
    && Number.isFinite(row.tone)
    && (Number.isFinite(row.measuredTone) || Number.isFinite(row.density) || Number.isFinite(row.colorimetricTone));
}

export function labFromManual(row) {
  return [row.labL, row.labA, row.labB].every(Number.isFinite) ? { l: row.labL, a: row.labA, b: row.labB } : undefined;
}

export function manualRowsToCsv(rows) {
  const header = ["patch_type", "channel", "tone", "measured_tone", "density", "lab_l", "lab_a", "lab_b", "source", "note"];
  const body = rows.map((row) => [
    row.patchType,
    row.channel,
    Number.isFinite(row.tone) ? row.tone : "",
    Number.isFinite(row.measuredTone) ? row.measuredTone : "",
    Number.isFinite(row.density) ? row.density : "",
    Number.isFinite(row.labL) ? row.labL : "",
    Number.isFinite(row.labA) ? row.labA : "",
    Number.isFinite(row.labB) ? row.labB : "",
    row.source,
    row.note,
  ]);
  return [header, ...body].map((row) => row.join(",")).join("\n");
}

export function manualHealth(rows) {
  const normalized = rows.map(normalizeManualRow);
  const curveRows = normalized.filter((row) => ["tone", "solid"].includes(row.patchType) && ["C", "M", "Y", "K"].includes(row.channel));
  const labReferences = labReferenceByChannel(normalized);
  const measuredRows = curveRows
    .map((row) => enrichManualColorimetricRow(row, labReferences))
    .filter((row) => Number.isFinite(row.measuredTone) || Number.isFinite(row.density) || Number.isFinite(row.colorimetricTone));
  const hasPaper = normalized.some((row) => row.patchType === "paper" && labFromManual(row));
  const hasSolids = ["C", "M", "Y", "K"].filter((channel) => normalized.some((row) => row.channel === channel && (row.patchType === "solid" || row.tone >= 99.9) && (Number.isFinite(row.density) || Number.isFinite(row.measuredTone))));
  const channels = ["C", "M", "Y", "K"].filter((channel) => measuredRows.some((row) => row.channel === channel && row.tone > 0 && row.tone < 100));
  const messages = [];
  if (!measuredRows.length) messages.push("缺阶调实测网点或密度。");
  if (channels.length < 4) messages.push(`已有阶调通道: ${channels.join(" ") || "无"}，建议至少录入 CMYK 25/50/75。`);
  if (hasSolids.length < 4) messages.push(`实地密度/网点不足: 已有 ${hasSolids.join(" ") || "无"}。`);
  if (!hasPaper) messages.push("缺纸白 Lab；SCCA 和纸白色差不能校正。");
  if (!normalized.some((row) => row.patchType === "gray" && labFromManual(row))) messages.push("缺灰平衡 Lab；G7 只能做不完整预检。");
  if (!messages.length) messages.push("纸白、实地、阶调和灰平衡数据结构完整。");
  return { ready: measuredRows.length > 0, messages };
}

export function labReferenceByChannel(rows) {
  const paper = rows.find((row) => row.patchType === "paper" && labFromManual(row));
  const solids = Object.fromEntries(["C", "M", "Y", "K"].map((channel) => [
    channel,
    rows.find((row) => row.channel === channel && (row.patchType === "solid" || row.tone >= 99.9) && labFromManual(row)),
  ]));
  return { paper: paper ? labFromManual(paper) : null, solids };
}

export function enrichManualColorimetricRow(row, refs) {
  if (!refs.paper || !["C", "M", "Y", "K"].includes(row.channel)) return row;
  const solid = refs.solids[row.channel] ? labFromManual(refs.solids[row.channel]) : null;
  const sample = labFromManual(row);
  if (!solid || !sample) return row;
  const colorimetricTone = spotColorToneValueFromLab(sample, refs.paper, solid);
  if (!Number.isFinite(colorimetricTone)) return row;
  return { ...row, colorimetricTone, colorimetricMethod: "iso_20654_lab" };
}

export function solidDensityByChannel(rows) {
  return rows.reduce((acc, row) => {
    if (!["C", "M", "Y", "K"].includes(row.channel) || !Number.isFinite(row.density)) return acc;
    if (row.patchType === "solid" || row.tone >= 99.9) acc[row.channel] = row.density;
    return acc;
  }, {});
}

export function paperDensityFromRows(rows) {
  const paper = rows.find((row) => row.patchType === "paper" && Number.isFinite(row.density));
  return paper ? paper.density : 0;
}

export function enrichManualDensityRow(row, solidDensities, paperDensity = 0) {
  if (!["C", "M", "Y", "K"].includes(row.channel)) return row;
  if (row.patchType === "solid" || row.tone >= 99.9) return { ...row, measuredTone: 100, measuredToneMethod: "solid_density" };
  if (Number.isFinite(row.measuredTone) || !Number.isFinite(row.density)) return row;
  const solidDensity = solidDensities[row.channel];
  if (!Number.isFinite(solidDensity)) return row;
  const measuredTone = murrayDaviesToneFromDensity(row.density, solidDensity, paperDensity);
  return Number.isFinite(measuredTone)
    ? { ...row, measuredTone, measuredToneMethod: "murray_davies_density" }
    : row;
}

export function hasFiniteTextNumber(value) {
  if (value === "" || value === null || value === undefined) return false;
  return Number.isFinite(Number(value));
}

function manualRow(patchType, channel, tone, measuredTone, density, source, note) {
  return defaultManualRow({ patchType, channel, tone, measuredTone, density, source, note });
}

function toneRows(tones, source, notePrefix = "") {
  return ["C", "M", "Y", "K"].flatMap((channel) => tones.map((tone) => manualRow("tone", channel, tone, "", "", source, `${notePrefix ? `${notePrefix} ` : ""}${channel} ${tone}%`)));
}

function manualRowStatus(row, refs) {
  if (!row) return { path: "未识别", label: "缺数据", level: "neutral" };
  if (row.patchType === "paper") {
    if (labFromManual(row)) return { path: "纸白 Lab", label: "可用于 SCCA/G7", level: "pass" };
    if (Number.isFinite(row.density)) return { path: "纸白密度", label: "密度基准", level: "pass" };
    return { path: "纸白", label: "待录", level: "warning" };
  }
  if (["gray", "overprint"].includes(row.patchType)) {
    return labFromManual(row)
      ? { path: "G7/Lab", label: "可校验", level: "pass" }
      : { path: "G7/Lab", label: "缺 Lab", level: "warning" };
  }
  if (!["C", "M", "Y", "K"].includes(row.channel) || !Number.isFinite(row.tone)) {
    return { path: "单色阶调", label: "缺输入", level: "warning" };
  }
  if (Number.isFinite(row.measuredTone)) return { path: "TVI/网点", label: "可计算", level: "pass" };
  if (Number.isFinite(row.density)) {
    const hasSolid = Number.isFinite(refs.solids[row.channel]?.density);
    return hasSolid || row.patchType === "solid" || row.tone >= 99.9
      ? { path: "密度 -> TVI", label: "可计算", level: "pass" }
      : { path: "密度 -> TVI", label: "缺实地", level: "warning" };
  }
  if (labFromManual(row)) {
    const hasCtvRefs = refs.paper && labFromManual(refs.solids[row.channel] || {});
    return hasCtvRefs
      ? { path: "CTV Lab", label: "可计算", level: "pass" }
      : { path: "CTV Lab", label: "缺纸白/实地", level: "warning" };
  }
  return { path: "TVI/CTV", label: "缺实测", level: "warning" };
}

function rowFromOrderedCells(cells) {
  return {
    patchType: cells[0] || "tone",
    channel: cells[1] || "C",
    tone: cells[2] || "",
    measuredTone: cells[3] || "",
    density: cells[4] || "",
    labL: cells[5] || "",
    labA: cells[6] || "",
    labB: cells[7] || "",
    source: cells[8] || "人工修正",
    note: cells[9] || "",
  };
}

function rowFromHeaderMap(cells, headerMap) {
  return Object.fromEntries(Object.entries(PASTE_FIELD_ALIASES).map(([field]) => [
    field,
    cells[headerMap[field]] ?? (field === "patchType" ? "tone" : field === "channel" ? "C" : field === "source" ? "人工修正" : ""),
  ]));
}

function buildPasteHeaderMap(headerCells) {
  const normalized = headerCells.map(normalizeHeader);
  const map = {};
  for (const [field, aliases] of Object.entries(PASTE_FIELD_ALIASES)) {
    const index = normalized.findIndex((cell) => aliases.includes(cell));
    if (index >= 0) map[field] = index;
  }
  return Object.keys(map).length >= 2 ? map : null;
}

function splitPasteLine(line) {
  const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : line.includes(",") ? "," : /\s{2,}/;
  return String(line).split(delimiter).map((cell) => cell.trim());
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .replace(/["']/g, "")
    .replace(/\*/g, "star")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function numericOrBlank(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function optionList(values, selected) {
  return values.map((value) => `<option value="${value}" ${String(selected) === value ? "selected" : ""}>${value}</option>`).join("");
}

function sourceOptions(source) {
  const value = String(source || "手动");
  return SOURCE_TYPES.includes(value) ? SOURCE_TYPES : [...SOURCE_TYPES, value];
}
