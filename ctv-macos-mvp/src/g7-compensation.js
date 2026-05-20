import { number } from "./shared.js";

const MIN_TONE = 0;
const MAX_TONE = 100;

export function buildG7Compensation({ g7, baseRows = [], ratio = 0.5, limit = 12 } = {}) {
  const normalizedRatio = normalizeRatio(ratio);
  const normalizedLimit = Number.isFinite(number(limit)) ? Math.max(0, number(limit)) : 12;

  if (!g7 || g7.status === "Disabled") {
    return {
      status: g7?.status === "Disabled" ? "Disabled" : "Blocked",
      message: g7?.status === "Disabled"
        ? "当前标准未启用 G7 校验，不能生成 G7 补偿建议。"
        : "请先运行 G7 校验，再生成补偿建议。",
      rows: [],
      warnings: [],
      grayDiagnostics: [],
    };
  }

  const warnings = [];
  const baseCurveRows = normalizeBaseCurveRows(baseRows);
  const kReferenceRows = buildNpdcRows(g7.npdcVerification || [], {
    channel: "K",
    source: "K NPDC 参考",
    ratio: normalizedRatio,
    limit: normalizedLimit,
  });
  const grayDiagnostics = buildGrayDiagnostics(g7.grayVerification || []);

  if (!(g7.npdcVerification || []).some(hasUsableL)) warnings.push("缺少 K-only NPDC Lab 阶调，无法生成 K 通道建议。");
  if (!(g7.grayVerification || []).some(hasUsableL)) warnings.push("缺少 CMY gray Lab 阶调，无法判断灰平衡修正方向。");
  if (!baseCurveRows.length) warnings.push("请先计算 TVI/CTV 补偿曲线；G7 补偿建议必须以 C/M/Y/K 基础曲线为底。");

  if (!baseCurveRows.length) {
    return {
      status: "Blocked",
      message: "尚未生成 TVI/CTV 基础曲线，不能输出生产用 G7 补偿建议。",
      rows: [],
      grayDiagnostics,
      warnings,
    };
  }

  const rows = baseCurveRows.map((row) => buildProductionRow(row, {
    kReferenceRows,
    grayDiagnostics,
  }));

  const limitedCount = kReferenceRows.filter((row) => row.limited).length;
  const increaseCount = rows.filter((row) => row.action === "增加").length;
  const conflictCount = rows.filter((row) => row.directionConflict).length;
  if (limitedCount) warnings.push(`${limitedCount} 个点超过单点限制，已按 ${normalizedLimit}% 做保护。`);
  if (increaseCount) warnings.push(`${increaseCount} 个生产曲线点需要增加网点，请结合现场密度和灰平衡复核。`);
  if (conflictCount) warnings.push(`${conflictCount} 个 K 点的 G7 NPDC 参考方向与 TVI/CTV 基础曲线相反，需复查 Lab、密度和测量条件。`);

  return {
    status: "Preview",
    message: `已生成 ${rows.length} 个生产曲线建议点；CMY 共同输出已取消，C/M/Y/K 以 TVI/CTV 曲线为基础，G7 只提供 K NPDC 与灰平衡诊断。`,
    ratio: normalizedRatio,
    limit: normalizedLimit,
    rows,
    grayDiagnostics,
    warnings,
  };
}

function buildNpdcRows(sourceRows, options) {
  const usable = sourceRows
    .filter(hasUsableL)
    .map((row) => ({
      ...row,
      tone: clamp(number(row.tone), MIN_TONE, MAX_TONE),
      measuredL: number(row.measuredL),
      targetL: number(row.targetL),
    }))
    .sort((a, b) => a.tone - b.tone);

  return usable.map((row) => {
    const theoreticalOutput = invertMeasuredToneForTargetL(usable, row.targetL, row.tone);
    const theoreticalAdjustment = theoreticalOutput - row.tone;
    const limitedAdjustment = clamp(theoreticalAdjustment, -options.limit, options.limit);
    const outputTone = clamp(row.tone + limitedAdjustment * options.ratio, MIN_TONE, MAX_TONE);
    const adjustment = outputTone - row.tone;
    return {
      channel: options.channel,
      source: options.source,
      tone: row.tone,
      measuredL: row.measuredL,
      targetL: row.targetL,
      measuredNpdc: number(row.measuredNpdc),
      targetNpdc: number(row.targetNpdc),
      deltaL: number(row.deltaL),
      weightedDeltaL: number(row.weightedDeltaL),
      theoreticalOutput,
      theoreticalAdjustment,
      limitedAdjustment,
      outputTone,
      adjustment,
      action: adjustmentAction(adjustment),
      limited: Math.abs(theoreticalAdjustment) > options.limit,
      hint: options.hintFn ? options.hintFn(row) : npdcHint(row),
    };
  });
}

function normalizeBaseCurveRows(rows) {
  return (rows || [])
    .filter((row) => ["C", "M", "Y", "K"].includes(row.channel))
    .map((row) => ({
      channel: row.channel,
      tone: clamp(number(row.tone), MIN_TONE, MAX_TONE),
      outputTone: clamp(number(row.outputTone), MIN_TONE, MAX_TONE),
      measuredTone: number(row.measuredTone),
      targetTone: number(row.targetTone),
      metricName: row.metricName || row.metric || "TVI/CTV",
      metricMethod: row.metricMethod || row.measurementMethod || "",
      pointSource: row.pointSource || (row.interpolated ? "interpolated" : "measured"),
    }))
    .filter((row) => Number.isFinite(row.tone) && Number.isFinite(row.outputTone))
    .sort((a, b) => a.channel.localeCompare(b.channel) || a.tone - b.tone);
}

function buildProductionRow(row, { kReferenceRows, grayDiagnostics }) {
  const adjustment = row.outputTone - row.tone;
  const reference = row.channel === "K" ? nearestToneRow(kReferenceRows, row.tone) : undefined;
  const gray = row.channel !== "K" ? nearestToneRow(grayDiagnostics, row.tone) : undefined;
  const referenceAdjustment = reference ? reference.outputTone - reference.tone : NaN;
  const directionConflict = Number.isFinite(referenceAdjustment)
    && Math.abs(referenceAdjustment) >= 0.2
    && Math.abs(adjustment) >= 0.2
    && Math.sign(referenceAdjustment) !== Math.sign(adjustment);

  return {
    channel: row.channel,
    source: row.channel === "K" ? "TVI/CTV 基础 + K NPDC 参考" : "TVI/CTV 基础 + 灰平衡诊断",
    tone: row.tone,
    measuredTone: row.measuredTone,
    targetTone: row.targetTone,
    baseOutputTone: row.outputTone,
    outputTone: row.outputTone,
    adjustment,
    action: adjustmentAction(adjustment),
    g7ReferenceOutput: reference?.outputTone,
    g7ReferenceAdjustment: referenceAdjustment,
    directionConflict,
    pointSource: row.pointSource,
    metricName: row.metricName,
    metricMethod: row.metricMethod,
    hint: productionHint(row, reference, gray, directionConflict),
  };
}

function buildGrayDiagnostics(sourceRows) {
  return sourceRows
    .filter((row) => Number.isFinite(number(row.tone)))
    .map((row) => ({
      tone: clamp(number(row.tone), MIN_TONE, MAX_TONE),
      a: number(row.a),
      b: number(row.b),
      deltaL: number(row.deltaL),
      weightedDeltaL: number(row.weightedDeltaL),
      weightedDeltaCh: number(row.weightedDeltaCh),
      hint: grayBalanceHint(row),
    }))
    .sort((a, b) => a.tone - b.tone);
}

function productionHint(row, reference, gray, conflict) {
  if (row.channel === "K") {
    if (!reference) return "缺少相邻 K NPDC Lab 参考；沿用 TVI/CTV 基础曲线。";
    if (conflict) return "K NPDC 参考与 TVI/CTV 方向冲突；不要自动覆盖，需复查测量条件。";
    return "K NPDC 方向与基础曲线可对照；当前生产输出仍以 TVI/CTV 为准。";
  }
  if (!gray) return "缺少相邻 CMY gray Lab；沿用 TVI/CTV 基础曲线。";
  return `${gray.hint}；当前不生成 CMY 共同输出，正式曲线仍按单通道 TVI/CTV 执行。`;
}

function nearestToneRow(rows, tone) {
  const numeric = number(tone);
  if (!rows?.length || !Number.isFinite(numeric)) return undefined;
  return rows.reduce((best, row) =>
    Math.abs(row.tone - numeric) < Math.abs(best.tone - numeric) ? row : best
  , rows[0]);
}

export function invertMeasuredToneForTargetL(rows, targetL, preferredTone = NaN) {
  const target = number(targetL);
  const preferred = number(preferredTone);
  const usable = rows
    .filter(hasUsableL)
    .map((row) => ({ tone: clamp(number(row.tone), MIN_TONE, MAX_TONE), measuredL: number(row.measuredL) }))
    .sort((a, b) => a.tone - b.tone);
  if (!Number.isFinite(target) || !usable.length) return Number.isFinite(preferred) ? preferred : NaN;

  const candidates = [];
  for (const row of usable) {
    if (Math.abs(row.measuredL - target) < 0.0001) candidates.push(row.tone);
  }
  for (let index = 0; index < usable.length - 1; index += 1) {
    const left = usable[index];
    const right = usable[index + 1];
    const low = Math.min(left.measuredL, right.measuredL);
    const high = Math.max(left.measuredL, right.measuredL);
    if (target < low || target > high || Math.abs(right.measuredL - left.measuredL) < 0.0001) continue;
    const t = (target - left.measuredL) / (right.measuredL - left.measuredL);
    candidates.push(left.tone + (right.tone - left.tone) * t);
  }

  if (candidates.length) return clamp(closestTo(candidates, preferred), MIN_TONE, MAX_TONE);

  const nearest = usable.reduce((best, row) =>
    Math.abs(row.measuredL - target) < Math.abs(best.measuredL - target) ? row : best
  , usable[0]);
  return nearest.tone;
}

function npdcHint(row) {
  const delta = number(row.deltaL);
  if (!Number.isFinite(delta)) return "缺少 ΔL*";
  if (delta > 0.5) return "偏浅，通常需要增加 K 输出";
  if (delta < -0.5) return "偏深，通常需要减少 K 输出";
  return "接近 NPDC 目标";
}

function grayBalanceHint(row) {
  const parts = [];
  const a = number(row.a);
  const b = number(row.b);
  if (Number.isFinite(a) && a > 3) parts.push("偏红/偏品");
  if (Number.isFinite(a) && a < -3) parts.push("偏绿/偏青");
  if (Number.isFinite(b) && b > 3) parts.push("偏黄");
  if (Number.isFinite(b) && b < -3) parts.push("偏蓝");
  if (!parts.length) return "灰平衡接近中性";
  return `${parts.join("、")}；需要后续拆分 C/M/Y 灰平衡修正`;
}

function adjustmentAction(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) return "保持";
  return value > 0 ? "增加" : "减少";
}

function normalizeRatio(value) {
  const numeric = number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
}

function closestTo(values, preferred) {
  if (!Number.isFinite(preferred)) return values[0];
  return values.reduce((best, value) => Math.abs(value - preferred) < Math.abs(best - preferred) ? value : best, values[0]);
}

function hasUsableL(row) {
  return Number.isFinite(number(row.tone)) && Number.isFinite(number(row.measuredL)) && Number.isFinite(number(row.targetL));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
