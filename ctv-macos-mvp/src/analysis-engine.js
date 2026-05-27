import { cmykFromManualRow, cmykKey, labFromRow } from "./standards.js";
import { average, groupByChannel, number } from "./shared.js";
import { labFromSpectralRow } from "./spectral-color.js";
import { buildNpdcVerification, summarizeNpdc, buildGrayVerification, summarizeGrayBalance, summarizeWeightedDeltaL, buildColorspaceVerification, classifyColorspacePatches } from "./g7-targets.js?v=20260522-g7-verify";

const MID_TONES = new Set([40, 45, 50, 55, 60]);

export function deltaE76(sample, target) {
  if (!sample || !target) return NaN;
  return Math.sqrt((sample.l - target.l) ** 2 + (sample.a - target.a) ** 2 + (sample.b - target.b) ** 2);
}

export function deltaE94(sample, target, options = {}) {
  if (!sample || !target) return NaN;
  const kL = options.kL ?? 1;
  const kC = options.kC ?? 1;
  const kH = options.kH ?? 1;
  const k1 = options.k1 ?? 0.045;
  const k2 = options.k2 ?? 0.015;
  const deltaL = sample.l - target.l;
  const cSample = chroma(sample);
  const cTarget = chroma(target);
  const deltaC = cSample - cTarget;
  const deltaA = sample.a - target.a;
  const deltaB = sample.b - target.b;
  const deltaH2 = Math.max(0, deltaA ** 2 + deltaB ** 2 - deltaC ** 2);
  const sL = 1;
  const sC = 1 + k1 * cTarget;
  const sH = 1 + k2 * cTarget;
  return Math.sqrt(
    (deltaL / (kL * sL)) ** 2
    + (deltaC / (kC * sC)) ** 2
    + deltaH2 / ((kH * sH) ** 2)
  );
}

export function deltaECMC(sample, target, options = {}) {
  if (!sample || !target) return NaN;
  const lightnessRatio = options.lightness ?? 2;
  const chromaRatio = options.chroma ?? 1;
  const cReference = chroma(target);
  const cSample = chroma(sample);
  const deltaL = sample.l - target.l;
  const deltaC = cSample - cReference;
  const deltaA = sample.a - target.a;
  const deltaB = sample.b - target.b;
  const deltaH2 = Math.max(0, deltaA ** 2 + deltaB ** 2 - deltaC ** 2);
  const h = hueAngle(target.a, target.b);
  const f = Math.sqrt((cReference ** 4) / (cReference ** 4 + 1900));
  const t = h >= 164 && h <= 345
    ? 0.56 + Math.abs(0.2 * Math.cos(degToRad(h + 168)))
    : 0.36 + Math.abs(0.4 * Math.cos(degToRad(h + 35)));
  const sL = target.l < 16 ? 0.511 : (0.040975 * target.l) / (1 + 0.01765 * target.l);
  const sC = (0.0638 * cReference) / (1 + 0.0131 * cReference) + 0.638;
  const sH = sC * (f * t + 1 - f);
  return Math.sqrt(
    (deltaL / (lightnessRatio * sL)) ** 2
    + (deltaC / (chromaRatio * sC)) ** 2
    + deltaH2 / (sH ** 2)
  );
}

export function deltaE2000(sample, target) {
  if (!sample || !target) return NaN;
  const kL = 1;
  const kC = 1;
  const kH = 1;
  const c1 = Math.sqrt(sample.a ** 2 + sample.b ** 2);
  const c2 = Math.sqrt(target.a ** 2 + target.b ** 2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1p = (1 + g) * sample.a;
  const a2p = (1 + g) * target.a;
  const c1p = Math.sqrt(a1p ** 2 + sample.b ** 2);
  const c2p = Math.sqrt(a2p ** 2 + target.b ** 2);
  const h1p = hueAngle(a1p, sample.b);
  const h2p = hueAngle(a2p, target.b);
  const dLp = target.l - sample.l;
  const dCp = c2p - c1p;
  const dhp = hueDelta(h1p, h2p, c1p, c2p);
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(degToRad(dhp / 2));
  const lBarP = (sample.l + target.l) / 2;
  const cBarP = (c1p + c2p) / 2;
  const hBarP = hueAverage(h1p, h2p, c1p, c2p);
  const t = 1
    - 0.17 * Math.cos(degToRad(hBarP - 30))
    + 0.24 * Math.cos(degToRad(2 * hBarP))
    + 0.32 * Math.cos(degToRad(3 * hBarP + 6))
    - 0.20 * Math.cos(degToRad(4 * hBarP - 63));
  const deltaTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt((cBarP ** 7) / (cBarP ** 7 + 25 ** 7));
  const sL = 1 + (0.015 * ((lBarP - 50) ** 2)) / Math.sqrt(20 + ((lBarP - 50) ** 2));
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(degToRad(2 * deltaTheta)) * rC;
  const lTerm = dLp / (kL * sL);
  const cTerm = dCp / (kC * sC);
  const hTerm = dHp / (kH * sH);
  return Math.sqrt(lTerm ** 2 + cTerm ** 2 + hTerm ** 2 + rT * cTerm * hTerm);
}

export function buildLabVerificationRows({ manualRows, measurements, rawRows = [], standardPatchMap, warning = 3.5, fail = 4.2, scca = false, formula = "de76" }) {
  const candidates = new Map();
  const addCandidate = (item) => {
    if (!item?.lab || !item.cmyk) return;
    const key = cmykKey(item.cmyk);
    if (!candidates.has(key)) candidates.set(key, item);
  };

  const getDensity = (row, cmyk) => {
    if (row.density !== undefined && Number.isFinite(row.density)) return row.density;
    if (!cmyk) return undefined;

    const readVal = (obj, ...keys) => {
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
      }
      return undefined;
    };

    const activeChannels = ["c", "m", "y", "k"].filter(ch => cmyk[ch] > 0);
    if (activeChannels.length === 1) {
      const channel = activeChannels[0].toUpperCase();
      const lower = channel.toLowerCase();
      const val = number(readVal(row, "density", `density_${lower}`, `d_${lower}`, "status_density", "density_status"));
      if (Number.isFinite(val)) return val;
    } else {
      const val = number(readVal(row, "density", "status_density", "density_status"));
      if (Number.isFinite(val)) return val;
    }
    return undefined;
  };

  for (const row of manualRows || []) {
    const lab = labFromRow({ lab_l: row.labL, lab_a: row.labA, lab_b: row.labB });
    const cmyk = cmykFromManualRow(row);
    if (lab && cmyk) {
      addCandidate({
        label: manualLabel(row, cmyk),
        cmyk,
        lab,
        density: Number.isFinite(row.density) ? row.density : undefined,
        source: row.source || "Manual"
      });
    }
  }

  for (const row of rawRows || []) {
    const cmyk = rawCmyk(row);
    const lab = labFromRow(row) || labFromSpectralRow(row);
    if (lab && cmyk) {
      addCandidate({
        label: rawPatchLabel(row, cmyk),
        cmyk,
        lab,
        density: getDensity(row, cmyk),
        source: row.sourceFormat || row.source || "Raw Lab"
      });
    }
  }

  for (const row of measurements || []) {
    if (!row.lab) continue;
    const cmyk = measurementCmyk(row);
    if (cmyk) {
      addCandidate({
        label: `${row.channel} ${row.tone}%`,
        cmyk,
        lab: row.lab,
        density: row.density,
        source: row.sourceFormat || row.source || "Measurement"
      });
    }
  }

  const paperReference = standardPatchMap.get("0.00/0.00/0.00/0.00")?.lab;
  const rows = [...candidates.values()];
  const paperMeasured = rows.find((item) => cmykKey(item.cmyk) === "0.00/0.00/0.00/0.00")?.lab;

  return rows.map((item) => {
    const reference = standardPatchMap.get(cmykKey(item.cmyk));
    const referenceLab = scca && reference && paperReference && paperMeasured
      ? sccaReferenceLab(reference.lab, paperReference, paperMeasured)
      : reference?.lab;
    const deltaE76Value = referenceLab ? deltaE76(item.lab, referenceLab) : NaN;
    const deltaE94Value = referenceLab ? deltaE94(item.lab, referenceLab) : NaN;
    const deltaE00 = referenceLab ? deltaE2000(item.lab, referenceLab) : NaN;
    const deltaECMCValue = referenceLab ? deltaECMC(item.lab, referenceLab) : NaN;
    const deltaE = selectedDeltaE(formula, {
      de76: deltaE76Value,
      de94: deltaE94Value,
      de2000: deltaE00,
      cmc: deltaECMCValue,
    });
    return {
      ...item,
      referenceLab,
      referenceWasSccaCorrected: Boolean(scca && referenceLab && paperReference && paperMeasured),
      deltaL: referenceLab ? item.lab.l - referenceLab.l : NaN,
      deltaA: referenceLab ? item.lab.a - referenceLab.a : NaN,
      deltaB: referenceLab ? item.lab.b - referenceLab.b : NaN,
      deltaE,
      deltaE76: deltaE76Value,
      deltaE94: deltaE94Value,
      deltaE00,
      deltaECMC: deltaECMCValue,
      deltaFormula: formula,
      status: !Number.isFinite(deltaE) ? "Missing Target" : deltaE >= fail ? "Fail" : deltaE >= warning ? "Warning" : "Pass",
    };
  });
}

export function summarizeLabVerification(rows = []) {
  const comparable = rows.filter((row) => Number.isFinite(row.deltaE));
  const pass = rows.filter((row) => row.status === "Pass").length;
  const warning = rows.filter((row) => row.status === "Warning").length;
  const fail = rows.filter((row) => row.status === "Fail").length;
  const missing = rows.filter((row) => !Number.isFinite(row.deltaE)).length;
  return {
    total: rows.length,
    comparable: comparable.length,
    pass,
    warning,
    fail,
    missing,
    avgDeltaE: average(comparable.map((row) => row.deltaE)),
    maxDeltaE: maxFinite(comparable.map((row) => row.deltaE)),
    status: fail ? "Fail" : warning ? "Warning" : comparable.length ? "Pass" : "Data Incomplete",
  };
}

function sccaReferenceLab(reference, paperReference, paperMeasured) {
  return {
    l: reference.l + (paperMeasured.l - paperReference.l),
    a: reference.a + (paperMeasured.a - paperReference.a),
    b: reference.b + (paperMeasured.b - paperReference.b),
  };
}

export function diagnosePress(results, options = {}) {
  if (!results.length) {
    return {
      level: "empty",
      title: "未加载测量数据",
      ratio: 50,
      messages: ["导入或录入 CMYK 阶调数据后才能诊断。"],
    };
  }

  const channelStats = channelMidStats(results);
  const highChannels = channelStats.filter((item) => item.midAverage >= 8);
  const severeChannels = channelStats.filter((item) => item.midAverage >= 11);
  const nearChannels = channelStats.filter((item) => Math.abs(item.midAverage) <= 4);
  const allProcessChannelsSevere = ["C", "M", "Y", "K"].every((channel) => severeChannels.some((item) => item.channel === channel));
  const isolatedSevereChannels = severeChannels.filter((item) => item.midAverage >= 15 && channelStats
    .filter((candidate) => candidate.channel !== item.channel)
    .every((candidate) => Math.abs(candidate.midAverage) <= 5));
  const densityIssues = densityTviMismatch(channelStats, results, options.solidDensityRanges);
  const hasCAndYSevere = severeChannels.some((item) => item.channel === "C") && severeChannels.some((item) => item.channel === "Y");
  const kSevere = severeChannels.some((item) => item.channel === "K");
  const cModerate = highChannels.some((item) => item.channel === "C");

  if (allProcessChannelsSevere) {
    return {
      level: "danger",
      title: "全通道 TVI 严重偏离 / 建议先做机械全面检查",
      ratio: 35,
      messages: [
        "C/M/Y/K 中间调全部严重偏大，优先检查印压、橡皮布、包衬、水墨平衡、版材显影和测量流程。",
        "不建议直接建立正式生产曲线；如必须生产，只能先做低比例抢救型分色补偿并复测。",
      ],
      channelStats,
      densityIssues,
    };
  }

  if (isolatedSevereChannels.length === 1) {
    const [issue] = isolatedSevereChannels;
    return {
      level: "danger",
      title: `单通道严重异常: ${issue.channel}`,
      ratio: 40,
      messages: [
        `${issue.channel} 中间调 TVI 偏差 ${issue.midAverage.toFixed(1)}%，其余通道接近正常，优先排查该色组压力、橡皮布、墨量/水量和测量点。`,
        "不建议用统一 CMYK 曲线掩盖单色组问题；先修机或单色组临时补偿。",
      ],
      channelStats,
      densityIssues,
    };
  }

  if (densityIssues.length) {
    return {
      level: "warning",
      title: "密度-TVI 矛盾 / 需复查测量与机械状态",
      ratio: 45,
      messages: [
        ...densityIssues.map((item) => item.message),
        "这类矛盾通常来自实地密度、阶调点、版材状态或测量条件不一致，建议复测后再定正式曲线。",
      ],
      channelStats,
      densityIssues,
    };
  }

  if (hasCAndYSevere && nearChannels.length) {
    return {
      level: "danger",
      title: "机械异常 / 抢救型生产补偿",
      ratio: 45,
      messages: [
        "C/Y 中间调同步偏大，且至少一个色组接近标准，优先检查印压、橡皮布、包衬和水墨平衡。",
        "不建议建立统一 CMYK 曲线；如需生产，先用临时分色欠补偿曲线。",
      ],
      channelStats,
    };
  }

  if (kSevere || cModerate || highChannels.length) {
    return {
      level: "warning",
      title: "生产可补偿型 TVI",
      ratio: kSevere ? 55 : 50,
      messages: [
        kSevere ? "K 组中间调偏大，是第一优先补偿对象。" : "存在中等 TVI 偏差，可建立分色独立生产补偿曲线。",
        "建议补偿后重新印刷并复测，逐轮收敛。",
      ],
      channelStats,
    };
  }

  return {
    level: "pass",
    title: "接近标准",
    ratio: 30,
    messages: ["TVI 偏差整体较小，建议轻补偿或保持当前曲线。"],
    channelStats,
  };
}

export function analyzeCurveSafety(results) {
  const issues = [];
  const byChannel = groupByChannel(results);
  for (const [channel, rows] of Object.entries(byChannel)) {
    const sorted = [...rows].sort((a, b) => a.tone - b.tone);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      const inputStep = current.tone - prev.tone;
      const outputStep = current.outputTone - prev.outputTone;
      if (current.outputTone < prev.outputTone - 0.01) {
        issues.push(curveIssue("danger", channel, current.tone, "反折", `${channel} ${current.tone}% 输出低于前一点，不能直接用于生产曲线。`, [prev.tone, current.tone]));
      }
      if (inputStep > 0) {
        const slope = outputStep / inputStep;
        if (slope > 1.4 && current.tone < 98) {
          issues.push(curveIssue("warning", channel, current.tone, "相邻跳变", `${channel} ${prev.tone}-${current.tone}% 输出斜率 ${slope.toFixed(2)}，相邻点上升过快。`, [prev.tone, current.tone]));
        }
        if (slope < 0.25 && current.tone > 2 && current.tone < 98) {
          issues.push(curveIssue("warning", channel, current.tone, "相邻过平", `${channel} ${prev.tone}-${current.tone}% 输出斜率 ${slope.toFixed(2)}，相邻点过平，可能丢层次。`, [prev.tone, current.tone]));
        }
      }
      if (inputStep > 0 && Math.abs(outputStep) > Math.max(8, inputStep * 1.45)) {
        issues.push(curveIssue("warning", channel, current.tone, "跳变", `${channel} ${prev.tone}-${current.tone}% 相邻输出变化 ${outputStep.toFixed(1)}%，请检查曲线连续性。`, [prev.tone, current.tone]));
      }
    }
    for (let i = 1; i < sorted.length - 1; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      const next = sorted[i + 1];
      const leftStep = current.tone - prev.tone;
      const rightStep = next.tone - current.tone;
      if (leftStep <= 0 || rightStep <= 0) continue;
      const leftSlope = (current.outputTone - prev.outputTone) / leftStep;
      const rightSlope = (next.outputTone - current.outputTone) / rightStep;
      const slopeDelta = Math.abs(rightSlope - leftSlope);
      if (slopeDelta > 0.9) {
        issues.push(curveIssue("warning", channel, current.tone, "折点突变", `${channel} ${current.tone}% 前后斜率差 ${slopeDelta.toFixed(2)}，曲线可能有硬折点。`, [prev.tone, current.tone, next.tone]));
      }
    }
    for (const row of sorted) {
      const correction = row.outputTone - row.tone;
      if (Math.abs(correction) > 12) {
        issues.push(curveIssue("warning", channel, row.tone, "补偿量过大", `${channel} ${row.tone}% 最终补偿 ${correction.toFixed(1)}%，建议复核欠补偿比例或测量点。`));
      }
      if (row.tone <= 10 && Math.abs(row.outputTone - row.tone) > 3) {
        issues.push(curveIssue("warning", channel, row.tone, "高光保护", `${channel} ${row.tone}% 高光补偿超过 3%，可能影响细小网点。`));
      }
      if (row.tone >= 80 && Math.abs(row.outputTone - row.tone) > 5) {
        issues.push(curveIssue("warning", channel, row.tone, "暗调保护", `${channel} ${row.tone}% 暗调补偿超过 5%，可能影响暗部层次。`));
      }
      if (row.overrideLocked && Number.isFinite(row.autoOutputTone) && Math.abs(row.outputTone - row.autoOutputTone) > 3) {
        issues.push(curveIssue("warning", channel, row.tone, "人工锁定偏离", `${channel} ${row.tone}% 人工输出与自动输出相差 ${(row.outputTone - row.autoOutputTone).toFixed(1)}%。`));
      }
    }
  }
  return issues;
}

function curveIssue(level, channel, tone, type, message, relatedTones = [tone]) {
  return {
    level,
    channel,
    tone,
    type,
    message,
    relatedTones,
    key: `${channel}:${Number(tone).toFixed(3)}`,
  };
}

export function g7Preview(options = {}) {
  const { measurements = [], results = [], labRows = [], rawRows = [], importKind, metadata } = options;
  const deltaEFn = options.deltaEFn || deltaEFunction(options.deltaEFormula);
  const tolerances = {
    enabled: true,
    npdcAverage: 1.5,
    npdcMax: 3,
    grayAverage: 1.5,
    grayMax: 3,
    deltaEWeighted: 3.5,
    deltaEMax: 8,
    ...(options.tolerances || {}),
  };
  if (tolerances.enabled === false) {
    return disabledG7Preview(tolerances);
  }
  if (importKind === "reference" || metadataLooksReference(metadata)) {
    return emptyG7Preview("当前导入的是标准/目标参考文件，不是真实测量文件，G7 不能生成有效预览。");
  }

  const curveRows = results.length ? results : measurements;
  const actualKOnly = measurements.filter((row) => row.channel === "K" && row.tone > 0 && row.tone < 100);
  const kOnly = curveRows.filter((row) => row.channel === "K" && row.tone > 0 && row.tone < 100);
  const p2pRows = rawRows.filter(hasCmykTuple);
  const rawLabPatches = rawLabPatchRows(rawRows, {
    standardPatchMap: options.standardPatchMap,
    deltaEFn,
  });
  const g7LabRows = [...labRows, ...rawLabPatches];
  const labReady = g7LabRows.filter((row) => Number.isFinite(row.deltaE));
  const grayRows = g7LabRows.filter((row) => isGrayLabRow(row));
  const grayCandidateCount = p2pRows.filter(isLikelyG7GrayCandidate).length;
  const rawPatchClasses = classifyG7Patches(p2pRows);
  const labPatchClasses = classifyLabG7Patches(g7LabRows);
  const patchClasses = {
    p2pTotal: Math.max(rawPatchClasses.p2pTotal, labPatchClasses.total),
    paper: Math.max(rawPatchClasses.paper, labPatchClasses.paper),
    cmykSolids: Math.max(rawPatchClasses.cmykSolids, labPatchClasses.cmykSolids),
    kOnly: Math.max(rawPatchClasses.kOnly, labPatchClasses.kOnly),
    cmyNeutralGray: Math.max(rawPatchClasses.cmyNeutralGray, labPatchClasses.cmyNeutralGray),
  };
  const p2pPatchCount = patchClasses.p2pTotal;
  const avgDeltaE = average(labReady.map((row) => row.deltaE));
  const maxDeltaE = maxFinite(labReady.map((row) => row.deltaE));
  const avgGrayCh = average(grayRows.map((row) => Math.sqrt(row.lab.a ** 2 + row.lab.b ** 2)));
  const npdcRows = kOnly.map((row) => ({
    tone: row.tone,
    measured: row.measuredTone ?? row.tone + (row.measuredTvi || 0),
    target: row.targetTone ?? row.tone,
    deltaTone: (row.measuredTone ?? row.tone + (row.measuredTvi || 0)) - (row.targetTone ?? row.tone),
    deltaL: Number.isFinite(row.lab?.l) ? row.lab.l : NaN,
  })).sort((a, b) => a.tone - b.tone);
  const grayBalanceRows = grayRows.map((row) => ({
    label: row.label,
    tone: neutralGrayTone(row),
    cmyk: row.cmyk,
    a: row.lab.a,
    b: row.lab.b,
    chroma: Math.sqrt(row.lab.a ** 2 + row.lab.b ** 2),
    deltaE: row.deltaE,
  })).sort((a, b) => a.tone - b.tone || a.label.localeCompare(b.label));
  const paperL = measuredPaperLab(g7LabRows)?.l;
  const npdcVerification = buildNpdcVerification(actualKOnly, {
    paperL,
    standardPatchMap: options.standardPatchMap,
  });
  const grayVerification = buildGrayVerification(grayRows, {
    paperL,
    standardPatchMap: options.standardPatchMap,
  });
  const npdcSummary = summarizeNpdc(npdcVerification, tolerances);
  const graySummary = summarizeGrayBalance(grayVerification, tolerances);
  const grayNpdcSummary = summarizeWeightedDeltaL(grayVerification, tolerances);
  const weightedDeltaLSummary = summarizeWeightedDeltaL([...npdcVerification, ...grayVerification], tolerances);
  const weightedDeltaE = weightedAverageDelta(labReady);
  const weightedAverage = weightedDeltaLSummary.weightedAverage;
  const maxGrayCh = maxFinite(grayBalanceRows.map((row) => row.chroma));
  const avgNpdcDelta = average(npdcRows.map((row) => Math.abs(row.deltaTone)));
  const maxNpdcDelta = maxFinite(npdcRows.map((row) => Math.abs(row.deltaTone)));
  const kOnlyCount = Math.max(actualKOnly.length, kOnly.length, patchClasses.kOnly);
  const grayCount = Math.max(grayRows.length, patchClasses.cmyNeutralGray);
  const hasManualEquivalent = patchClasses.paper >= 1 && patchClasses.cmykSolids >= 4 && kOnlyCount >= 5 && grayCount >= 3;
  const completenessRows = g7CompletenessRows({
    kOnlyCount,
    labReadyCount: labReady.length,
    patchClasses,
    hasManualEquivalent,
  });
  const missing = [];

  if (patchClasses.p2pTotal < 25 && !hasManualEquivalent) missing.push("P2P/CGATS 色块不足，或手动等效数据不完整");
  if (kOnlyCount < 5) missing.push("K-only NPDC 阶调不足");
  if (!patchClasses.paper) missing.push("缺少纸白色块");
  if (patchClasses.cmykSolids < 4) missing.push("CMYK 实地色块不足");
  if (!grayCount) {
    missing.push(grayCandidateCount ? "检测到 P2P/CMY 灰候选，但缺少可计算 Lab 的灰平衡数据" : "缺少 CMY neutral gray / 灰平衡 Lab");
  }
  if (!labReady.length) missing.push(p2pPatchCount ? "文件含 P2P/CGATS 色块，但当前缺少 Lab，不能计算 ΔE/G7 灰平衡" : "缺少可与标准比对的 Lab");

  const verificationRows = buildG7VerificationRows({
    missing,
    avgNpdcDelta,
    maxNpdcDelta,
    weightedDeltaLSummary,
    graySummary,
    weightedDeltaE,
    maxDeltaE,
    tolerances,
  });
  const status = missing.length ? "Data Incomplete" : verificationStatus(verificationRows);
  const conclusion = buildG7Conclusion({ status, missing, verificationRows });

  return {
    status,
    conclusion,
    missing,
    kOnlyCount,
    labPatchCount: labReady.length,
    grayPatchCount: grayCount,
    avgDeltaE,
    maxDeltaE,
    avgGrayCh: graySummary.weightedAverage,
    maxGrayCh: graySummary.weightedMax,
    legacyAvgGrayCh: avgGrayCh,
    legacyMaxGrayCh: maxGrayCh,
    avgNpdcDelta,
    maxNpdcDelta: weightedDeltaLSummary.weightedMax,
    legacyMaxNpdcDeltaTone: maxNpdcDelta,
    weightedAverage,
    weightedDeltaE,
    weightedDeltaLSummary,
    grayNpdcSummary,
    weightedGrayAverage: graySummary.weightedAverage,
    weightedGrayMax: graySummary.weightedMax,
    npdcRows,
    grayBalanceRows,
    grayCandidateCount,
    p2pPatchCount,
    patchClasses,
    completenessRows,
    verificationRows,
    tolerances,
    npdcVerification,
    npdcSummary,
    grayVerification,
    graySummary,
    colorspaceRows: buildColorspaceVerification(classifyColorspacePatches([...rawRows, ...g7LabRows.map(function(r) { return Object.assign({}, r, { cmyk_c: r.cmyk && r.cmyk.c, cmyk_m: r.cmyk && r.cmyk.m, cmyk_y: r.cmyk && r.cmyk.y, cmyk_k: r.cmyk && r.cmyk.k }); })]), options.standardPatchMap, deltaEFn),
  };
}

function emptyG7Preview(message) {
  const verificationRows = [
    verificationRow("数据完整性", NaN, "必须完整", "Missing", message),
  ];
  return {
    status: "Data Incomplete",
    conclusion: buildG7Conclusion({ status: "Data Incomplete", missing: [message], verificationRows }),
    missing: [message],
    kOnlyCount: 0,
    labPatchCount: 0,
    grayPatchCount: 0,
    avgDeltaE: NaN,
    maxDeltaE: NaN,
    avgGrayCh: NaN,
    maxGrayCh: NaN,
    avgNpdcDelta: NaN,
    maxNpdcDelta: NaN,
    weightedAverage: NaN,
    weightedDeltaE: NaN,
    weightedDeltaLSummary: { count: 0, weightedAverage: NaN, weightedMax: NaN, status: "Missing" },
    grayNpdcSummary: { count: 0, weightedAverage: NaN, weightedMax: NaN, status: "Missing" },
    weightedGrayAverage: NaN,
    weightedGrayMax: NaN,
    npdcRows: [],
    grayBalanceRows: [],
    grayCandidateCount: 0,
    p2pPatchCount: 0,
    patchClasses: { p2pTotal: 0, paper: 0, cmykSolids: 0, kOnly: 0, cmyNeutralGray: 0 },
    verificationRows,
    tolerances: {},
    npdcVerification: [],
    npdcSummary: { count: 0, avgDeltaL: NaN, maxDeltaL: NaN, weightedAverage: NaN, weightedMax: NaN, status: "Missing" },
    grayVerification: [],
    graySummary: { count: 0, avgChroma: NaN, maxChroma: NaN, weightedAverage: NaN, weightedMax: NaN, status: "Missing" },
    colorspaceRows: [],
    completenessRows: [
      completenessRow("P2P/CGATS 色块", 0, "真实测量文件", false),
      completenessRow("纸白", 0, ">=1", false),
      completenessRow("CMYK 实地", 0, "4", false),
      completenessRow("K-only NPDC", 0, ">=5", false),
      completenessRow("CMY neutral gray", 0, ">=3", false),
      completenessRow("可比 Lab/ΔE", 0, ">=1", false),
    ],
  };
}

function measuredPaperLab(rows = []) {
  return rows.find((row) => row.lab && isPaperCmyk(row.cmyk))?.lab;
}

function disabledG7Preview(tolerances = {}) {
  const message = "当前标准已关闭 G7 校验；曲线和 Lab 分析仍可继续使用。";
  const verificationRows = [
    verificationRow("G7 校验", NaN, "标准设置", "Disabled", message),
  ];
  return {
    ...emptyG7Preview(message),
    status: "Disabled",
    conclusion: {
      level: "neutral",
      title: "G7 校验已关闭",
      summary: message,
      recommendations: ["如需做 G7 验证，请在 Standard 页面启用 G7 校验并设置 wΔL / wΔCh 容差。"],
      priorityItems: [],
    },
    missing: [],
    verificationRows,
    tolerances,
  };
}

function buildG7VerificationRows({ missing, weightedDeltaLSummary, graySummary, weightedDeltaE, maxDeltaE, tolerances }) {
  if (missing.length) {
    return [
      verificationRow("数据完整性", NaN, "必须完整", "Missing", missing.join(" / ")),
    ];
  }
  return [
    toleranceRow("NPDC wΔL* 平均", weightedDeltaLSummary.weightedAverage, tolerances.npdcAverage, tolerances.npdcMax, ""),
    toleranceRow("NPDC wΔL* 最大", weightedDeltaLSummary.weightedMax, tolerances.npdcMax, tolerances.npdcMax * 2, ""),
    toleranceRow("灰平衡 wΔCh 平均", graySummary.weightedAverage, tolerances.grayAverage, tolerances.grayMax, ""),
    toleranceRow("灰平衡 wΔCh 最大", graySummary.weightedMax, tolerances.grayMax, tolerances.grayMax * 2, ""),
    toleranceRow("Lab 加权 ΔE", weightedDeltaE, tolerances.deltaEWeighted, tolerances.deltaEWeighted * 1.5, ""),
    toleranceRow("最大 ΔE", maxDeltaE, tolerances.deltaEMax, tolerances.deltaEMax, ""),
  ];
}

function toleranceRow(item, value, passLimit, failLimit, unit) {
  if (!Number.isFinite(value)) return verificationRow(item, value, `<=${passLimit}${unit}`, "Missing", "缺少可计算数据");
  const status = value <= passLimit ? "Pass" : value <= failLimit ? "Warning" : "Fail";
  const message = status === "Pass"
    ? "达标"
    : status === "Warning"
      ? "接近或超过建议值，建议复核"
      : "超过失败阈值";
  return verificationRow(item, value, `Pass <=${passLimit}${unit} / Fail >${failLimit}${unit}`, status, message);
}

function verificationRow(item, value, tolerance, status, message) {
  return { item, value, tolerance, status, message };
}

function verificationStatus(rows) {
  if (rows.some((row) => row.status === "Missing")) return "Data Incomplete";
  if (rows.some((row) => row.status === "Fail")) return "Fail";
  if (rows.some((row) => row.status === "Warning")) return "Warning";
  return "Pass";
}

function buildG7Conclusion({ status, missing = [], verificationRows = [] }) {
  if (status === "Data Incomplete") {
    return {
      level: "warning",
      title: "G7 数据不完整，不能作为正式验收",
      summary: missing.length ? missing.join(" / ") : "缺少 G7 必需测量项目。",
      recommendations: [
        "补齐 P2P/CGATS 测量、纸白、CMYK 实地、K-only NPDC、CMY gray 和可比 Lab/ΔE 后再运行 G7 验证。",
        "当前结果只能用于数据检查，不能作为 G7 通过或失败结论。",
      ],
      priorityItems: missing,
    };
  }

  const failed = verificationRows.filter((row) => row.status === "Fail");
  const warnings = verificationRows.filter((row) => row.status === "Warning");
  const priorityRows = [...failed, ...warnings];
  const recommendations = priorityRows.map(g7RecommendationForRow).filter(Boolean);

  if (status === "Fail") {
    return {
      level: "danger",
      title: "G7 未通过，需修正后复测",
      summary: failed.map((row) => row.item).join(" / ") || "存在超过失败阈值的 G7 项目。",
      recommendations: uniqueStrings([
        ...recommendations,
        "不建议把当前状态作为正式 G7 合格样张或最终生产曲线。",
        "完成修正后重新输出色表并复测，再比较 Run 变化。",
      ]),
      priorityItems: priorityRows.map((row) => `${row.status}: ${row.item}`),
    };
  }

  if (status === "Warning") {
    return {
      level: "warning",
      title: "G7 接近边界，建议复核后再放行",
      summary: warnings.map((row) => row.item).join(" / ") || "部分 G7 项目接近容差边界。",
      recommendations: uniqueStrings([
        ...recommendations,
        "可作为生产调整参考，但建议至少复测一次确认稳定性。",
      ]),
      priorityItems: priorityRows.map((row) => `${row.status}: ${row.item}`),
    };
  }

  return {
    level: "pass",
    title: "G7 预检通过",
    summary: "NPDC、灰平衡和 ΔE 验证项目均在当前容差内。",
    recommendations: [
      "可保存当前 Run 作为合格基准，并在正式生产前保留导出的 G7 CSV/JSON 报告。",
    ],
    priorityItems: [],
  };
}

function g7RecommendationForRow(row) {
  const item = String(row.item || "");
  if (item.includes("NPDC")) return "NPDC 阶调偏差异常时，优先检查 K 阶调曲线、密度稳定性和测量色条方向。";
  if (item.includes("灰平衡")) return "灰平衡 Ch 超限时，优先检查 CMY 中性灰、纸白/SCCA、实地密度和三色叠印稳定性。";
  if (item.includes("加权 ΔE")) return "Lab 加权 ΔE 偏高时，检查关键灰阶和中间调色块，确认标准选择与测量条件一致。";
  if (item.includes("最大 ΔE")) return "最大 ΔE 超限时，定位最大偏差色块，先排除单点测量错误、脏版、墨量或纸张批次问题。";
  return "";
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

function channelMidStats(results) {
  return Object.entries(groupByChannel(results)).map(([channel, rows]) => {
    const mid = rows.filter((row) => MID_TONES.has(Math.round(row.tone)));
    const selected = mid.length ? mid : rows.filter((row) => row.tone >= 35 && row.tone <= 65);
    return {
      channel,
      midAverage: average(selected.map((row) => row.tviDelta)),
      midMax: maxFinite(selected.map((row) => row.tviDelta)),
      points: selected.length,
    };
  });
}

function densityTviMismatch(channelStats, rows, ranges) {
  if (!ranges) return [];
  return channelStats.flatMap((stat) => {
    const range = ranges[stat.channel];
    if (!range || !Number.isFinite(stat.midAverage)) return [];
    const solidDensity = solidDensityForChannel(rows, stat.channel);
    if (!Number.isFinite(solidDensity)) return [];
    const [min, max] = range;
    const normalSolid = solidDensity >= min && solidDensity <= max;
    if (normalSolid && stat.midAverage >= 11) {
      return [{
        channel: stat.channel,
        type: "normal_density_high_tvi",
        solidDensity,
        midAverage: stat.midAverage,
        message: `${stat.channel} 实地密度 ${solidDensity.toFixed(2)} 在常用范围内，但中间调 TVI 偏大 ${stat.midAverage.toFixed(1)}%。`,
      }];
    }
    if (solidDensity < min && Math.abs(stat.midAverage) <= 4) {
      return [{
        channel: stat.channel,
        type: "low_density_normal_tvi",
        solidDensity,
        midAverage: stat.midAverage,
        message: `${stat.channel} 实地密度 ${solidDensity.toFixed(2)} 偏低，但中间调 TVI 接近正常，需复查密度/网点测量条件。`,
      }];
    }
    return [];
  });
}

function solidDensityForChannel(rows, channel) {
  const values = rows
    .filter((row) => row.channel === channel)
    .flatMap((row) => [
      Number.isFinite(row.solidDensity) ? row.solidDensity : NaN,
      isExplicitSolidDensity(row) ? row.density : NaN,
    ])
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : NaN;
}

function isExplicitSolidDensity(row) {
  if (!Number.isFinite(row.density)) return false;
  if (row.interpolated) return false;
  if (row.patchType === "solid") return true;
  if (row.measuredToneMethod === "solid_density") return true;
  return row.tone >= 99.9;
}

function metadataLooksReference(metadata = {}) {
  const text = [
    metadata.descriptor,
    metadata.file_descriptor,
    metadata.originator,
    metadata.devcalstd,
    metadata.target_type,
    metadata.print_conditions,
    metadata.copyright,
  ].flat().filter(Boolean).join(" ").toLowerCase();
  return /\breference\b|color characterization|print condition|fogra|gracol|snap|tr00|ansi cgats/.test(text);
}

function maxFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : NaN;
}

function weightedAverageDelta(rows) {
  const weighted = rows
    .filter((row) => Number.isFinite(row.deltaE))
    .map((row) => {
      const maxTone = Math.max(row.cmyk.c, row.cmyk.m, row.cmyk.y, row.cmyk.k);
      const weight = maxTone >= 95 ? 2 : maxTone >= 40 && maxTone <= 70 ? 1.5 : 1;
      return { value: row.deltaE, weight };
    });
  const weightSum = weighted.reduce((sum, row) => sum + row.weight, 0);
  return weightSum ? weighted.reduce((sum, row) => sum + row.value * row.weight, 0) / weightSum : NaN;
}

function hueAngle(a, b) {
  if (a === 0 && b === 0) return 0;
  const angle = radToDeg(Math.atan2(b, a));
  return angle >= 0 ? angle : angle + 360;
}

function hueDelta(h1, h2, c1, c2) {
  if (c1 * c2 === 0) return 0;
  const diff = h2 - h1;
  if (Math.abs(diff) <= 180) return diff;
  return diff > 180 ? diff - 360 : diff + 360;
}

function hueAverage(h1, h2, c1, c2) {
  if (c1 * c2 === 0) return h1 + h2;
  const diff = Math.abs(h1 - h2);
  if (diff <= 180) return (h1 + h2) / 2;
  return h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function radToDeg(value) {
  return (value * 180) / Math.PI;
}

function chroma(lab) {
  return Math.sqrt(lab.a ** 2 + lab.b ** 2);
}

function selectedDeltaE(formula, values) {
  return values[formula] ?? values.de76;
}

function deltaEFunction(formula) {
  if (formula === "de94") return deltaE94;
  if (formula === "de2000") return deltaE2000;
  if (formula === "cmc") return deltaECMC;
  return deltaE76;
}

function measurementCmyk(row) {
  return {
    c: row.channel === "C" ? row.tone : 0,
    m: row.channel === "M" ? row.tone : 0,
    y: row.channel === "Y" ? row.tone : 0,
    k: row.channel === "K" ? row.tone : 0,
  };
}

function hasCmykTuple(row) {
  return Boolean(rawCmyk(row));
}

function isLikelyG7GrayCandidate(row) {
  const cmyk = rawCmyk(row);
  if (!cmyk) return false;
  const { c, m, y, k } = cmyk;
  if (k > 0.01 || c <= 0 || m <= 0 || y <= 0) return false;
  const myClose = Math.abs(m - y) <= 2.5;
  const cInRange = c >= m - 3 && c <= m + 10 && c >= y - 3 && c <= y + 10;
  return myClose && cInRange;
}

function classifyG7Patches(rows) {
  const paper = rows.filter(isPaperPatch).length;
  const cmykSolids = ["C", "M", "Y", "K"].filter((channel) => rows.some((row) => isSolidPatch(row, channel))).length;
  const kOnly = rows.filter(isKOnlyPatch).length;
  const cmyNeutralGray = rows.filter(isLikelyG7GrayCandidate).length;
  return {
    p2pTotal: rows.length,
    paper,
    cmykSolids,
    kOnly,
    cmyNeutralGray,
  };
}

function classifyLabG7Patches(rows = []) {
  const uniqueRows = uniqueRowsByCmyk(rows);
  const paper = uniqueRows.filter((row) => isPaperCmyk(row.cmyk)).length;
  const cmykSolids = ["C", "M", "Y", "K"].filter((channel) => uniqueRows.some((row) => isSolidCmyk(row.cmyk, channel))).length;
  const kOnly = uniqueRows.filter((row) => isKOnlyCmyk(row.cmyk)).length;
  const cmyNeutralGray = uniqueRows.filter((row) => row.label?.includes("Gray") || isLikelyG7GrayCmyk(row.cmyk)).length;
  return {
    total: uniqueRows.length,
    paper,
    cmykSolids,
    kOnly,
    cmyNeutralGray,
  };
}

function uniqueRowsByCmyk(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row.cmyk) continue;
    map.set(cmykKey(row.cmyk), row);
  }
  return [...map.values()];
}

function isGrayLabRow(row) {
  const label = String(row.label || "");
  return label.includes("Gray")
    || label.toLowerCase().includes("neutral")
    || /^CMY\b/i.test(label)
    || isLikelyG7GrayCmyk(row.cmyk);
}

function rawLabPatchRows(rows = [], options = {}) {
  return rows
    .map((row) => {
      const cmyk = rawCmyk(row);
      const lab = labFromRow(row) || labFromSpectralRow(row);
      if (!cmyk || !lab) return null;
      const referenceLab = options.standardPatchMap?.get(cmykKey(cmyk))?.lab;
      const deltaE = referenceLab && options.deltaEFn ? options.deltaEFn(lab, referenceLab) : NaN;
      return {
        label: rawPatchLabel(row, cmyk),
        cmyk,
        lab,
        referenceLab,
        source: "Raw Lab",
        deltaE,
      };
    })
    .filter(Boolean);
}

function rawPatchLabel(row, cmyk) {
  const name = row.sample_name || row.sample_id || row.patch_name || row.name;
  if (name) return String(name);
  if (isPaperCmyk(cmyk)) return "Paper";
  if (isLikelyG7GrayCmyk(cmyk)) return `CMY Gray ${formatCmykTone(cmyk.c)}/${formatCmykTone(cmyk.m)}/${formatCmykTone(cmyk.y)}`;
  if (isKOnlyCmyk(cmyk)) return `K ${formatCmykTone(cmyk.k)}%`;
  return `CMYK ${formatCmykTone(cmyk.c)}/${formatCmykTone(cmyk.m)}/${formatCmykTone(cmyk.y)}/${formatCmykTone(cmyk.k)}`;
}

function formatCmykTone(value) {
  return Number(value).toFixed(Number.isInteger(value) ? 0 : 1);
}

function g7CompletenessRows({ kOnlyCount, labReadyCount, patchClasses, hasManualEquivalent }) {
  return [
    completenessRow("P2P/CGATS 或手动等效", patchClasses.p2pTotal, ">=25 或纸白/实地/K/灰完整", patchClasses.p2pTotal >= 25 || hasManualEquivalent),
    completenessRow("纸白", patchClasses.paper, ">=1", patchClasses.paper >= 1),
    completenessRow("CMYK 实地", patchClasses.cmykSolids, "4", patchClasses.cmykSolids >= 4),
    completenessRow("K-only NPDC", kOnlyCount, ">=5", kOnlyCount >= 5),
    completenessRow("CMY neutral gray", patchClasses.cmyNeutralGray, ">=3", patchClasses.cmyNeutralGray >= 3),
    completenessRow("可比 Lab/ΔE", labReadyCount, ">=1", labReadyCount >= 1),
  ];
}

function completenessRow(item, count, required, ok) {
  return { item, count, required, status: ok ? "Pass" : "Missing" };
}

function rawCmyk(row) {
  const c = number(row.cmyk_c ?? row.c);
  const m = number(row.cmyk_m ?? row.m);
  const y = number(row.cmyk_y ?? row.y);
  const k = number(row.cmyk_k ?? row.k);
  if ([c, m, y, k].some((value) => !Number.isFinite(value))) return null;
  return { c, m, y, k };
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
  return isKOnlyCmyk(cmyk);
}

function isPaperCmyk(cmyk) {
  return Boolean(cmyk) && [cmyk.c, cmyk.m, cmyk.y, cmyk.k].every((value) => Math.abs(value) < 0.01);
}

function isSolidCmyk(cmyk, channel) {
  if (!cmyk) return false;
  const values = { C: cmyk.c, M: cmyk.m, Y: cmyk.y, K: cmyk.k };
  return Math.abs(values[channel] - 100) < 0.01
    && Object.entries(values).every(([candidate, value]) => candidate === channel || Math.abs(value) < 0.01);
}

function isKOnlyCmyk(cmyk) {
  return Boolean(cmyk) && cmyk.k > 0 && cmyk.k < 100 && Math.abs(cmyk.c) < 0.01 && Math.abs(cmyk.m) < 0.01 && Math.abs(cmyk.y) < 0.01;
}

function isLikelyG7GrayCmyk(cmyk) {
  if (!cmyk) return false;
  const { c, m, y, k } = cmyk;
  if (k > 0.01 || c <= 0 || m <= 0 || y <= 0) return false;
  const myClose = Math.abs(m - y) <= 2.5;
  const cInRange = c >= m - 3 && c <= m + 10 && c >= y - 3 && c <= y + 10;
  return myClose && cInRange;
}

function neutralGrayTone(row) {
  if (Number.isFinite(row.tone)) return row.tone;
  const cmyk = row.cmyk;
  if (!cmyk) return NaN;
  return Math.max(number(cmyk.c), number(cmyk.m), number(cmyk.y));
}

function manualLabel(row, cmyk) {
  if (row.patchType === "paper") return "Paper";
  if (row.channel === "CMY" || row.channel === "CM" || row.channel === "CY" || row.channel === "MY") return row.channel;
  if (row.patchType === "gray") return `Gray ${row.tone || ""}`.trim();
  return `${row.channel} ${row.tone || Math.max(cmyk.c, cmyk.m, cmyk.y, cmyk.k)}%`;
}
