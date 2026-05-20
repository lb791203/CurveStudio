import { number } from "./shared.js";

const MIN_TONE = 0;
const MAX_TONE = 100;

export function buildG7Compensation({ g7, ratio = 0.5, limit = 12 } = {}) {
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
    };
  }

  const warnings = [];
  const rows = [
    ...buildNpdcRows(g7.npdcVerification || [], {
      channel: "K",
      source: "K NPDC",
      ratio: normalizedRatio,
      limit: normalizedLimit,
    }),
    ...buildNpdcRows(g7.grayVerification || [], {
      channel: "CMY",
      source: "CMY NPDC / 灰平衡",
      ratio: normalizedRatio,
      limit: normalizedLimit,
      hintFn: grayBalanceHint,
    }),
  ].sort((a, b) => a.channel.localeCompare(b.channel) || a.tone - b.tone);

  if (!(g7.npdcVerification || []).some(hasUsableL)) warnings.push("缺少 K-only NPDC Lab 阶调，无法生成 K 通道建议。");
  if (!(g7.grayVerification || []).some(hasUsableL)) warnings.push("缺少 CMY gray Lab 阶调，无法生成 CMY 灰阶建议。");

  if (!rows.length) {
    return {
      status: "Blocked",
      message: "G7 数据不足：需要 K-only NPDC 或 CMY gray Lab 阶调数据。",
      rows: [],
      warnings,
    };
  }

  const limitedCount = rows.filter((row) => row.limited).length;
  const increaseCount = rows.filter((row) => row.action === "增加").length;
  if (limitedCount) warnings.push(`${limitedCount} 个点超过单点限制，已按 ${normalizedLimit}% 做保护。`);
  if (increaseCount) warnings.push(`${increaseCount} 个点需要增加网点，请结合现场密度和灰平衡复核。`);

  return {
    status: "Preview",
    message: `已生成 ${rows.length} 个 G7 补偿建议点；这是 NPDC / 灰平衡预览，不替代认证级 G7 最终曲线。`,
    ratio: normalizedRatio,
    limit: normalizedLimit,
    rows,
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
      outputTone,
      adjustment,
      action: adjustmentAction(adjustment),
      limited: Math.abs(theoreticalAdjustment) > options.limit,
      hint: options.hintFn ? options.hintFn(row) : npdcHint(row),
    };
  });
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
  if (!parts.length) return "灰平衡接近中性；此处只给 CMY 共同 NPDC 建议";
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
