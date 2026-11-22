// G7 certification target definitions and verification helpers.
// Reference: IDEAlliance G7 Specification, ISO 12647-2.

import { average, number, isG7GrayCmyk } from "./shared.js";

// ─── G7 P2P Patch Classification ───

export const P2P51_ROWS = 12;
export const P2P51_COLS = 25;

export function classifyP2PPatch(c, m, y, k) {
  const categories = [];
  if ([c, m, y, k].every((v) => Math.abs(v) < 0.01)) categories.push("paper");
  if (c >= 99.9 && [m, y, k].every((v) => Math.abs(v) < 0.01)) categories.push("solid", "c_solid");
  if (m >= 99.9 && [c, y, k].every((v) => Math.abs(v) < 0.01)) categories.push("solid", "m_solid");
  if (y >= 99.9 && [c, m, k].every((v) => Math.abs(v) < 0.01)) categories.push("solid", "y_solid");
  if (k >= 99.9 && [c, m, y].every((v) => Math.abs(v) < 0.01)) categories.push("solid", "k_solid");
  if (m >= 99.9 && y >= 99.9 && [c, k].every((v) => Math.abs(v) < 0.01)) categories.push("overprint", "red");
  if (c >= 99.9 && y >= 99.9 && [m, k].every((v) => Math.abs(v) < 0.01)) categories.push("overprint", "green");
  if (c >= 99.9 && m >= 99.9 && [y, k].every((v) => Math.abs(v) < 0.01)) categories.push("overprint", "blue");
  if (c >= 99.9 && m >= 99.9 && y >= 99.9 && Math.abs(k) < 0.01) categories.push("overprint", "cmy");
  if (k > 0.01 && k < 99.9 && [c, m, y].every((v) => Math.abs(v) < 0.01)) categories.push("npdc");
  if (isG7GrayCmyk({ c, m, y, k })) categories.push("gray_balance");
  return categories.length ? categories : ["other"];
}

// ─── G7 NPDC Target Curve ───
// Fallback L* targets from the bundled GRACoL2013 CRPC6 characterization data.
// When a selected standard provides exact or interpolated K-only / CMY gray Lab,
// buildNpdcVerification and buildGrayVerification use that standard data instead.

const G7_NPDC_L_TARGET = new Map([
  [0, 95.0], [2, 93.55], [3, 92.81], [5, 91.41], [7, 89.99],
  [10, 87.87], [15, 84.46], [20, 81.17], [25, 77.66],
  [30, 74.3], [40, 67.4], [50, 60.4], [60, 52.81],
  [70, 44.71], [75, 40.37], [80, 35.68], [85, 30.82],
  [90, 25.78], [95, 20.62], [98, 17.69], [100, 16.0],
]);

const DEFAULT_G7_PAPER_L = 95;

export function g7NpdcLTarget(tone) {
  const keys = [...G7_NPDC_L_TARGET.keys()].sort((a, b) => a - b);
  const exact = G7_NPDC_L_TARGET.get(tone);
  if (exact !== undefined) return exact;

  let lower = keys[0];
  let upper = keys[keys.length - 1];
  for (const key of keys) {
    if (key <= tone) lower = key;
    if (key >= tone && upper > tone) { upper = key; break; }
  }
  if (lower === upper) return G7_NPDC_L_TARGET.get(lower);
  const ratio = (tone - lower) / (upper - lower);
  return G7_NPDC_L_TARGET.get(lower)
    + (G7_NPDC_L_TARGET.get(upper) - G7_NPDC_L_TARGET.get(lower)) * ratio;
}

// G7 Grayscale is substrate-relative: every patch is zeroed on the measured paper
// (relative ND = ND(patch) - ND(paper)) and expressed as relative L*, then compared
// with the reference NPDC expressed the same way (relative to the reference paper).
// Without this, a press sheet on paper with L* 93 fails the highlights even when its
// tone reproduction is perfect. Pass `relative: false` for the old absolute check.
export function buildNpdcVerification(kRows, options = {}) {
  const paperL = Number.isFinite(number(options.paperL)) ? number(options.paperL) : DEFAULT_G7_PAPER_L;
  const relative = options.relative !== false && Number.isFinite(number(options.paperL));
  const referencePaperL = standardPaperL(options.standardPatchMap);
  return kRows
    .filter((row) => Number.isFinite(row.tone))
    .map((row) => {
      const targetLab = targetKOnlyLab(row, options.standardPatchMap);
      const absoluteTargetL = targetLab?.l ?? g7NpdcLTarget(row.tone);
      const absoluteMeasuredL = Number.isFinite(row.lab?.l) ? row.lab.l : NaN;
      const measuredL = relative ? relativeL(absoluteMeasuredL, paperL) : absoluteMeasuredL;
      const targetL = relative
        ? relativeL(absoluteTargetL, targetLab ? referencePaperL : DEFAULT_G7_PAPER_L)
        : absoluteTargetL;
      const deltaL = Number.isFinite(measuredL) ? measuredL - targetL : NaN;
      const weight = g7ToneWeight(row.tone);
      const signedWeightedDeltaL = Number.isFinite(deltaL) ? deltaL * weight : NaN;
      const measuredNpdc = neutralPrintDensityFromL(absoluteMeasuredL, paperL);
      const targetNpdc = relative
        ? neutralPrintDensityFromL(targetL, 100)
        : neutralPrintDensityFromL(targetL, paperL);
      return {
        tone: row.tone,
        measuredL,
        targetL,
        absoluteMeasuredL,
        absoluteTargetL,
        evaluation: relative ? "substrate_relative" : "absolute",
        targetLab,
        targetSource: targetLab ? "standard" : "fallback",
        measuredNpdc,
        targetNpdc,
        deltaNpdc: Number.isFinite(measuredNpdc) && Number.isFinite(targetNpdc) ? measuredNpdc - targetNpdc : NaN,
        deltaL,
        absDeltaL: Number.isFinite(deltaL) ? Math.abs(deltaL) : NaN,
        weight,
        signedWeightedDeltaL,
        weightedDeltaL: Number.isFinite(signedWeightedDeltaL) ? Math.abs(signedWeightedDeltaL) : NaN,
      };
    })
    .sort((a, b) => a.tone - b.tone);
}

export function summarizeNpdc(rows, tolerances = {}) {
  const deltas = rows.map((r) => r.absDeltaL).filter(Number.isFinite);
  const weighted = rows.map((r) => r.weightedDeltaL).filter(Number.isFinite);
  const averageLimit = Number.isFinite(number(tolerances.npdcAverage)) ? number(tolerances.npdcAverage) : 1.5;
  const maxLimit = Number.isFinite(number(tolerances.npdcMax)) ? number(tolerances.npdcMax) : 3;
  const weightedAverage = average(weighted);
  const weightedMax = weighted.length ? Math.max(...weighted) : NaN;
  return {
    count: deltas.length,
    avgDeltaL: average(deltas),
    maxDeltaL: deltas.length ? Math.max(...deltas) : NaN,
    weightedAverage,
    weightedMax,
    status: weighted.length ? g7PassFail(weightedAverage, weightedMax, averageLimit, maxLimit) : "Missing",
  };
}

// ─── G7 Gray Balance ───

export const G7_GRAY_TOLERANCES = {
  avgChPass: 1.5,
  avgChFail: 3.0,
  maxChPass: 3.0,
  maxChFail: 6.0,
};

export function buildGrayVerification(grayRows, options = {}) {
  const paperL = Number.isFinite(number(options.paperL)) ? number(options.paperL) : DEFAULT_G7_PAPER_L;
  const paperLab = isLab(options.paperLab) ? options.paperLab : null;
  const relative = options.relative !== false && Number.isFinite(number(options.paperL));
  const referencePaperL = standardPaperL(options.standardPatchMap);
  return grayRows
    .filter((row) => row.lab)
    .map((row) => {
      const tone = neutralGrayTone(row);
      const targetLab = targetGrayLab(row, options.standardPatchMap);
      const absoluteTargetL = targetLab?.l ?? (Number.isFinite(tone) ? g7NpdcLTarget(tone) : NaN);
      const absoluteMeasuredL = number(row.lab.l);
      const measuredL = relative ? relativeL(absoluteMeasuredL, paperL) : absoluteMeasuredL;
      const targetL = relative
        ? relativeL(absoluteTargetL, targetLab ? referencePaperL : DEFAULT_G7_PAPER_L)
        : absoluteTargetL;
      const deltaL = Number.isFinite(measuredL) && Number.isFinite(targetL) ? measuredL - targetL : NaN;
      const measuredA = number(row.lab.a);
      const measuredB = number(row.lab.b);
      // Substrate-relative gray: the aim keeps a fading share of the paper tint,
      // a*b* = paper a*b* x (1 - C/100). Published G7 guidance gives paper x 0.5 for
      // the 50C/40M/40Y HR patch; the linear form between 0 and 100% is assumed.
      const grayAim = relative && paperLab && Number.isFinite(tone)
        ? { a: paperLab.a * (1 - clampTone(tone) / 100), b: paperLab.b * (1 - clampTone(tone) / 100) }
        : null;
      const targetA = grayAim ? grayAim.a : Number.isFinite(number(targetLab?.a)) ? number(targetLab.a) : 0;
      const targetB = grayAim ? grayAim.b : Number.isFinite(number(targetLab?.b)) ? number(targetLab.b) : 0;
      const deltaA = Number.isFinite(measuredA) ? measuredA - targetA : NaN;
      const deltaB = Number.isFinite(measuredB) ? measuredB - targetB : NaN;
      const chroma = Number.isFinite(deltaA) && Number.isFinite(deltaB) ? Math.sqrt(deltaA ** 2 + deltaB ** 2) : NaN;
      const measuredChroma = Number.isFinite(measuredA) && Number.isFinite(measuredB) ? Math.sqrt(measuredA ** 2 + measuredB ** 2) : NaN;
      const weight = g7ToneWeight(tone);
      const signedWeightedDeltaL = Number.isFinite(deltaL) ? deltaL * weight : NaN;
      const measuredNpdc = neutralPrintDensityFromL(absoluteMeasuredL, paperL);
      const targetNpdc = relative
        ? neutralPrintDensityFromL(targetL, 100)
        : neutralPrintDensityFromL(targetL, paperL);
      return {
        label: row.label,
        tone,
        cmyk: row.cmyk,
        measuredL,
        targetL,
        absoluteMeasuredL,
        absoluteTargetL,
        evaluation: relative ? "substrate_relative" : "absolute",
        grayAimSource: grayAim ? "substrate_relative" : targetLab ? "standard" : "neutral",
        targetLab,
        targetSource: targetLab ? "standard" : "fallback",
        measuredNpdc,
        targetNpdc,
        deltaNpdc: Number.isFinite(measuredNpdc) && Number.isFinite(targetNpdc) ? measuredNpdc - targetNpdc : NaN,
        deltaL,
        absDeltaL: Number.isFinite(deltaL) ? Math.abs(deltaL) : NaN,
        a: measuredA,
        b: measuredB,
        targetA,
        targetB,
        deltaA,
        deltaB,
        chroma,
        measuredChroma,
        weight,
        signedWeightedDeltaL,
        weightedDeltaL: Number.isFinite(signedWeightedDeltaL) ? Math.abs(signedWeightedDeltaL) : NaN,
        weightedChroma: Number.isFinite(chroma) ? chroma * weight : NaN,
      };
    })
    .sort((a, b) => a.tone - b.tone || a.label.localeCompare(b.label));
}

export function summarizeGrayBalance(rows, tolerances = {}) {
  const chromas = rows.map((r) => r.chroma).filter(Number.isFinite);
  const weighted = rows.map((r) => Number.isFinite(r.weightedChroma) ? r.weightedChroma : r.chroma).filter(Number.isFinite);
  if (!chromas.length) return { count: 0, avgChroma: NaN, maxChroma: NaN, weightedAverage: NaN, weightedMax: NaN, status: "Missing" };
  const avg = average(chromas);
  const max = Math.max(...chromas);
  const weightedAverage = average(weighted);
  const weightedMax = weighted.length ? Math.max(...weighted) : NaN;
  const averageLimit = Number.isFinite(number(tolerances.grayAverage)) ? number(tolerances.grayAverage) : G7_GRAY_TOLERANCES.avgChPass;
  const maxLimit = Number.isFinite(number(tolerances.grayMax)) ? number(tolerances.grayMax) : G7_GRAY_TOLERANCES.maxChPass;
  return {
    count: chromas.length,
    avgChroma: avg,
    maxChroma: max,
    weightedAverage,
    weightedMax,
    status: g7PassFail(weightedAverage, weightedMax, averageLimit, maxLimit),
  };
}

export function summarizeWeightedDeltaL(rows, tolerances = {}) {
  const weighted = rows.map((r) => r.weightedDeltaL).filter(Number.isFinite);
  const averageLimit = Number.isFinite(number(tolerances.npdcAverage)) ? number(tolerances.npdcAverage) : 1.5;
  const maxLimit = Number.isFinite(number(tolerances.npdcMax)) ? number(tolerances.npdcMax) : 3;
  if (!weighted.length) return { count: 0, weightedAverage: NaN, weightedMax: NaN, status: "Missing" };
  const weightedAverage = average(weighted);
  const weightedMax = Math.max(...weighted);
  return {
    count: weighted.length,
    weightedAverage,
    weightedMax,
    status: g7PassFail(weightedAverage, weightedMax, averageLimit, maxLimit),
  };
}

// Idealliance G7 weighting: w = 1 - max(0, (tone - 50) / 50 x 0.75), i.e. 1.0 up to
// 50% and falling linearly to 0.25 at 100%. There is no extra highlight reduction.
export function g7ToneWeight(tone) {
  const numeric = number(tone);
  if (!Number.isFinite(numeric)) return NaN;
  return 1 - Math.max(0, ((numeric - 50) / 50) * 0.75);
}

// G7 Grayscale is pass/fail: weighted average and weighted max must both be in limit.
function g7PassFail(weightedAverage, weightedMax, averageLimit, maxLimit) {
  if (!Number.isFinite(weightedAverage) || !Number.isFinite(weightedMax)) return "Missing";
  return weightedAverage <= averageLimit && weightedMax <= maxLimit ? "Pass" : "Fail";
}

// L* of a sample relative to the paper: Y / Y(paper) on the L* scale, which is what a
// spectrophotometer reports when zeroed on the substrate (paper = 100).
export function relativeL(sampleL, paperL) {
  const sampleY = labLToRelativeY(sampleL);
  const paperY = labLToRelativeY(paperL);
  if (!Number.isFinite(sampleY) || !Number.isFinite(paperY) || paperY <= 0) return NaN;
  const ratio = sampleY / paperY;
  return ratio > (6 / 29) ** 3 ? 116 * Math.cbrt(ratio) - 16 : 903.3 * ratio;
}

function standardPaperL(standardPatchMap) {
  const lab = standardPatchMap?.get?.(localCmykKey({ c: 0, m: 0, y: 0, k: 0 }))?.lab;
  return isLab(lab) ? lab.l : DEFAULT_G7_PAPER_L;
}

function clampTone(tone) {
  return Math.min(100, Math.max(0, number(tone)));
}

export function neutralPrintDensityFromL(sampleL, paperL = DEFAULT_G7_PAPER_L) {
  const sampleY = labLToRelativeY(sampleL);
  const paperY = labLToRelativeY(paperL);
  if (!Number.isFinite(sampleY) || !Number.isFinite(paperY) || sampleY <= 0 || paperY <= 0) return NaN;
  return Math.max(0, Math.log10(paperY / sampleY));
}

function targetKOnlyLab(row, standardPatchMap) {
  if (!standardPatchMap?.size) return null;
  const tone = number(row.tone ?? row.cmyk?.k);
  if (!Number.isFinite(tone)) return null;
  const exact = standardPatchMap.get(localCmykKey({ c: 0, m: 0, y: 0, k: tone }))?.lab;
  if (isLab(exact)) return exact;
  return interpolateTargetLab(standardTargetRows(standardPatchMap, isKOnlyTarget), tone);
}

function targetGrayLab(row, standardPatchMap) {
  if (!standardPatchMap?.size) return null;
  const exact = row.cmyk ? standardPatchMap.get(localCmykKey(row.cmyk))?.lab : null;
  if (isLab(exact)) return exact;
  const tone = neutralGrayTone(row);
  if (!Number.isFinite(tone)) return null;
  const grayRows = standardTargetRows(standardPatchMap, isGrayTarget)
    .map((item) => ({ tone: neutralGrayTone({ cmyk: item.cmyk }), lab: item.lab }))
    .filter((item) => Number.isFinite(item.tone) && isLab(item.lab));
  return interpolateTargetLab(grayRows, tone);
}

function standardTargetRows(standardPatchMap, predicate) {
  return [...standardPatchMap.values()]
    .filter((item) => item?.cmyk && isLab(item.lab) && predicate(item.cmyk))
    .map((item) => ({ tone: item.cmyk.k, cmyk: item.cmyk, lab: item.lab }))
    .sort((a, b) => a.tone - b.tone);
}

function interpolateTargetLab(rows, toneValue) {
  const rowsWithTone = rows
    .map((row) => ({ ...row, tone: number(row.tone) }))
    .filter((row) => Number.isFinite(row.tone) && isLab(row.lab))
    .sort((a, b) => a.tone - b.tone);
  if (!rowsWithTone.length) return null;
  const tone = number(toneValue);
  if (!Number.isFinite(tone)) return null;
  const exact = rowsWithTone.find((row) => Math.abs(row.tone - tone) < 0.01);
  if (exact) return exact.lab;
  let lower = rowsWithTone[0];
  let upper = rowsWithTone[rowsWithTone.length - 1];
  for (const row of rowsWithTone) {
    if (row.tone <= tone) lower = row;
    if (row.tone >= tone) { upper = row; break; }
  }
  if (Math.abs(upper.tone - lower.tone) < 0.01) return lower.lab;
  const ratio = (tone - lower.tone) / (upper.tone - lower.tone);
  return {
    l: lower.lab.l + (upper.lab.l - lower.lab.l) * ratio,
    a: lower.lab.a + (upper.lab.a - lower.lab.a) * ratio,
    b: lower.lab.b + (upper.lab.b - lower.lab.b) * ratio,
  };
}

function isKOnlyTarget(cmyk) {
  return nearZero(cmyk.c) && nearZero(cmyk.m) && nearZero(cmyk.y);
}

// Reference lookup only: characterization sets such as CRPC6 IT8.7/4 hold just a few
// patches exactly on the G7 gray ratio, so the reference L* curve for CMY gray is
// interpolated over the near-neutral C >= M = Y patches as before. Measured patches
// are still selected strictly by isG7GrayCmyk.
function isGrayTarget(cmyk) {
  return nearZero(cmyk.k) && cmyk.c > 0.01 && cmyk.m > 0.01 && cmyk.y > 0.01
    && Math.abs(cmyk.m - cmyk.y) <= 2.5 && cmyk.c >= cmyk.m - 3 && cmyk.c <= cmyk.m + 10;
}

function localCmykKey(cmyk) {
  return ["c", "m", "y", "k"].map((key) => Number(cmyk[key]).toFixed(2)).join("/");
}

function isLab(lab) {
  return lab && [lab.l, lab.a, lab.b].every(Number.isFinite);
}

function nearZero(value) {
  return Math.abs(number(value)) < 0.01;
}

function labLToRelativeY(lValue) {
  const l = number(lValue);
  if (!Number.isFinite(l)) return NaN;
  return l > 8 ? ((l + 16) / 116) ** 3 : l / 903.3;
}

// ─── G7 Colorspace Compliance ───

// G7 Targeted tolerances (dE00, press): substrate 3.0, C/M/Y solids 3.5, K solid 5.0,
// R/G/B overprints 4.2. CMY 3-colour overprint has no Targeted limit; 4.2 is used as
// a review guide. Pass/fail only.
const G7_TARGETED_TOLERANCE = {
  paper: 3.0,
  c_solid: 3.5,
  m_solid: 3.5,
  y_solid: 3.5,
  k_solid: 5.0,
  red: 4.2,
  green: 4.2,
  blue: 4.2,
  cmy: 4.2,
};

export function buildColorspaceVerification(patches, standardPatchMap, deltaEFn) {
  const spec = [
    { cat: "paper", label: "纸白", cmyk: "0.00/0.00/0.00/0.00" },
    { cat: "c_solid", label: "C 实地", cmyk: "100.00/0.00/0.00/0.00" },
    { cat: "m_solid", label: "M 实地", cmyk: "0.00/100.00/0.00/0.00" },
    { cat: "y_solid", label: "Y 实地", cmyk: "0.00/0.00/100.00/0.00" },
    { cat: "k_solid", label: "K 实地", cmyk: "0.00/0.00/0.00/100.00" },
    { cat: "red", label: "R 叠印", cmyk: "0.00/100.00/100.00/0.00" },
    { cat: "green", label: "G 叠印", cmyk: "100.00/0.00/100.00/0.00" },
    { cat: "blue", label: "B 叠印", cmyk: "100.00/100.00/0.00/0.00" },
    { cat: "cmy", label: "CMY 叠印", cmyk: "100.00/100.00/100.00/0.00" },
  ];

  return spec.map(({ cat, label, cmyk }) => {
    const patch = patches[cat];
    if (!patch?.lab) return { category: cat, label, deltaE: NaN, status: "Missing" };
    const ref = standardPatchMap?.get(cmyk);
    if (!ref?.lab) return { category: cat, label, measuredLab: patch.lab, deltaE: NaN, status: "Missing Target" };
    const dE = deltaEFn(patch.lab, ref.lab);
    const tolerance = G7_TARGETED_TOLERANCE[cat];
    return {
      category: cat,
      label,
      measuredLab: patch.lab,
      referenceLab: ref.lab,
      deltaE: dE,
      tolerance,
      status: dE <= tolerance ? "Pass" : "Fail",
    };
  });
}

export function classifyColorspacePatches(rows) {
  const patches = {};
  for (const row of rows) {
    const cmyk = row.cmyk || (
      row.cmyk_c !== undefined
        ? { c: number(row.cmyk_c), m: number(row.cmyk_m), y: number(row.cmyk_y), k: number(row.cmyk_k) }
        : null
    );
    if (!cmyk) continue;
    const cats = classifyP2PPatch(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
    for (const cat of cats) {
      if (!patches[cat] || (!patches[cat].lab && row.lab)) patches[cat] = { ...row, cmyk };
    }
  }
  return patches;
}

function neutralGrayTone(row) {
  if (Number.isFinite(row.tone)) return row.tone;
  const cmyk = row.cmyk || (
    row.cmyk_c !== undefined
      ? { c: number(row.cmyk_c), m: number(row.cmyk_m), y: number(row.cmyk_y), k: number(row.cmyk_k) }
      : null
  );
  if (!cmyk) return NaN;
  return Math.max(number(cmyk.c), number(cmyk.m), number(cmyk.y));
}
