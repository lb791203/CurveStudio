import { groupByChannel, number, rawCmyk, isLikelyG7GrayCandidate } from "./shared.js";

const CHANNELS = ["C", "M", "Y", "K"];
const REQUIRED_TONES = [25, 50, 75];

export function inspectImport({ importInfo = null, measurements = [], results = [], mode = "tvi" } = {}) {
  const rawRows = importInfo?.rawRows || [];
  const fields = importInfo?.fields || [];
  const warnings = importInfo?.warnings || [];
  const usable = measurements.filter(hasUsableMeasurement);
  const rawClasses = classifyRawRows(rawRows);
  const coverageRows = channelCoverage(measurements);
  const metricSources = metricSourceLabels(measurements);
  const labCount = measurements.filter((row) => row.lab || hasRawLab(row)).length || rawRows.filter(hasRawLab).length;
  const densityCount = measurements.filter((row) => Number.isFinite(row.density)).length || rawRows.filter(hasRawDensity).length;
  const hasColorimetric = measurements.some((row) => Number.isFinite(row.colorimetricTone));
  const dataKind = classifyImportKind({ importInfo, measurements, rawRows, usable, rawClasses });
  const { messages: missingMessages, notes } = buildMissingMessages({ coverageRows, measurements, usable, rawClasses, labCount, densityCount, mode });
  const canCalculateCurve = usable.length > 0;
  const level = !importInfo
    ? "neutral"
    : canCalculateCurve
      ? missingMessages.length ? "warning" : "pass"
      : rawRows.length ? "warning" : "neutral";

  return {
    level,
    kind: dataKind.kind,
    title: dataKind.title,
    canCalculateCurve,
    sourceFormat: importInfo?.sourceFormat || "未加载",
    fieldCount: fields.length,
    fields,
    rawRowCount: rawRows.length,
    measurementCount: measurements.length,
    usableCount: usable.length,
    resultCount: results.length,
    channels: coverageRows.filter((row) => row.pointCount).map((row) => row.channel),
    coverageRows,
    rawClasses,
    metricSources,
    hasColorimetric,
    labCount,
    densityCount,
    warnings,
    notes,
    messages: [...missingMessages, ...warnings],
  };
}

function classifyImportKind({ importInfo, measurements, rawRows, usable, rawClasses }) {
  if (!importInfo) return { kind: "empty", title: "未导入数据" };
  if (importInfo.sourceFormat === "Manual Table") return { kind: "manual", title: "手动现场记录" };
  if (importInfo.sourceFormat === "JSON Project") return { kind: "project", title: "JSON 项目档案" };
  if (usable.length) {
    if (rawClasses.p2pTotal >= 25) return { kind: "p2p_measurement", title: "P2P/CGATS 测量文件" };
    return { kind: "measurement", title: "测量数据文件" };
  }
  if (rawRows.length && !measurements.length) return { kind: "reference", title: "标准/目标文件，不能直接生成补偿曲线" };
  if (rawRows.length && !usable.length) return { kind: "incomplete", title: "已识别色块，但缺少可计算测量值" };
  return { kind: "unknown", title: "无法识别为可用测量数据" };
}

function channelCoverage(measurements) {
  const grouped = groupByChannel(measurements.filter((row) => CHANNELS.includes(row.channel)));
  return CHANNELS.map((channel) => {
    const rows = grouped[channel] || [];
    const tones = [...new Set(rows.map((row) => Math.round(Number(row.tone))).filter(Number.isFinite))].sort((a, b) => a - b);
    const required = Object.fromEntries(REQUIRED_TONES.map((tone) => [tone, tones.includes(tone)]));
    return {
      channel,
      pointCount: rows.length,
      tones,
      required,
      missingRequired: REQUIRED_TONES.filter((tone) => !required[tone]),
      measuredToneCount: rows.filter((row) => Number.isFinite(row.measuredTone) || Number.isFinite(row.measuredTvi)).length,
      densityCount: rows.filter((row) => Number.isFinite(row.density)).length,
      labCount: rows.filter((row) => row.lab).length,
      colorimetricCount: rows.filter((row) => Number.isFinite(row.colorimetricTone)).length,
    };
  });
}

function buildMissingMessages({ coverageRows, measurements, usable, rawClasses, labCount, densityCount, mode }) {
  const messages = [];
  const notes = [];
  if (!measurements.length && rawClasses.p2pTotal) {
    messages.push("检测到 P2P/CGATS 色块定义，但没有 TVI、实测网点、密度或可用光谱测量值。");
  }
  if (measurements.length && !usable.length) {
    messages.push("有测量行，但缺少 TVI、实测网点、密度或 CTV 可计算数据。");
  }
  const activeChannels = coverageRows.filter((row) => row.pointCount);
  if (usable.length && activeChannels.length < 4) {
    messages.push(`当前只有 ${activeChannels.map((row) => row.channel).join(" ") || "无"} 通道，正式 CMYK 曲线建议四通道齐全。`);
  }
  const incomplete2575 = activeChannels.filter((row) => row.missingRequired.length);
  if (incomplete2575.length && rawClasses.p2pTotal >= 25 && usable.length) {
    notes.push(`${p2pProfileLabel(rawClasses)} 阶调点不是 25/50/75 手工模板；${incomplete2575.map((row) => `${row.channel} ${row.missingRequired.join("/")}`).join("，")} 将按测量曲线插值生成。`);
  } else if (incomplete2575.length) {
    messages.push(`25/50/75 不完整: ${incomplete2575.map((row) => `${row.channel}缺${row.missingRequired.join("/")}`).join("，")}。`);
  }
  if (mode === "ctv" && usable.length && !coverageRows.some((row) => row.colorimetricCount)) {
    messages.push("CTV 模式需要纸白、实地和阶调 Lab/XYZ；当前没有可用 CTV 色度阶调。");
  }
  if (!labCount) messages.push("没有 Lab 数据，不能做 ΔE、SCCA 或完整 G7 灰平衡校验。");
  if (!densityCount && !measurements.some((row) => Number.isFinite(row.measuredTone) || Number.isFinite(row.measuredTvi))) {
    messages.push("没有密度或实测网点，不能做 TVI 曲线计算。");
  }
  return { messages, notes };
}

function p2pProfileLabel(rawClasses) {
  if (rawClasses.p2pTotal === 300) return "P2P51";
  return "P2P/CGATS";
}

function metricSourceLabels(measurements) {
  const sources = new Set();
  for (const row of measurements) {
    if (Number.isFinite(row.measuredTvi)) sources.add(row.measuredToneMethod || "reported_tvi");
    if (Number.isFinite(row.measuredTone)) sources.add(row.measuredToneMethod || "reported_tone");
    if (Number.isFinite(row.density)) sources.add(row.densityMethod || "density");
    if (Number.isFinite(row.colorimetricTone)) sources.add(row.colorimetricMethod || "iso_20654_colorimetric");
  }
  return [...sources];
}

function hasUsableMeasurement(row) {
  return Number.isFinite(row.measuredTvi)
    || Number.isFinite(row.measuredTone)
    || Number.isFinite(row.density)
    || Number.isFinite(row.colorimetricTone);
}

function classifyRawRows(rows) {
  const cmykRows = rows.filter(rawCmyk);
  return {
    p2pTotal: cmykRows.length,
    paper: cmykRows.filter(isPaperPatch).length,
    cmykSolids: CHANNELS.filter((channel) => cmykRows.some((row) => isSolidPatch(row, channel))).length,
    kOnly: cmykRows.filter(isKOnlyPatch).length,
    cmyNeutralGray: cmykRows.filter(isLikelyG7GrayCandidate).length,
    labRows: rows.filter(hasRawLab).length,
  };
}



function isPaperPatch(row) {
  const cmyk = rawCmyk(row);
  return Boolean(cmyk) && [cmyk.c, cmyk.m, cmyk.y, cmyk.k].every((value) => Math.abs(value) < 0.01);
}

function isSolidPatch(row, channel) {
  const cmyk = rawCmyk(row);
  if (!cmyk) return false;
  const values = { C: cmyk.c, M: cmyk.m, Y: cmyk.y, K: cmyk.k };
  return Math.abs(values[channel] - 100) < 0.01
    && Object.entries(values).every(([candidate, value]) => candidate === channel || Math.abs(value) < 0.01);
}

function isKOnlyPatch(row) {
  const cmyk = rawCmyk(row);
  return Boolean(cmyk) && cmyk.k > 0 && cmyk.k < 100 && Math.abs(cmyk.c) < 0.01 && Math.abs(cmyk.m) < 0.01 && Math.abs(cmyk.y) < 0.01;
}



function hasRawLab(row) {
  return [row.lab_l, row.lab_a, row.lab_b].every((value) => Number.isFinite(number(value)));
}

function hasRawDensity(row) {
  return ["density", "status_density", "density_c", "density_m", "density_y", "density_k"].some((key) => Number.isFinite(number(row[key])));
}
