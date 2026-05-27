// G7 certification target definitions and verification helpers.
// Reference: IDEAlliance G7 Specification, ISO 12647-2.

import { average, number } from "./shared.js";

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
  if (k < 0.01 && c > 0.01 && m > 0.01 && y > 0.01
    && Math.abs(m - y) <= 2.5 && c >= m - 3 && c <= m + 10) {
    categories.push("gray_balance");
  }
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

export function buildNpdcVerification(kRows, options = {}) {
  const paperL = Number.isFinite(number(options.paperL)) ? number(options.paperL) : DEFAULT_G7_PAPER_L;
  return kRows
    .filter((row) => Number.isFinite(row.tone))
    .map((row) => {
      const targetLab = targetKOnlyLab(row, options.standardPatchMap);
      const targetL = targetLab?.l ?? g7NpdcLTarget(row.tone);
      const measuredL = Number.isFinite(row.lab?.l) ? row.lab.l : NaN;
      const deltaL = Number.isFinite(measuredL) ? measuredL - targetL : NaN;
      const weight = g7ToneWeight(row.tone);
      const signedWeightedDeltaL = Number.isFinite(deltaL) ? deltaL * weight : NaN;
      const measuredNpdc = neutralPrintDensityFromL(measuredL, paperL);
      const targetNpdc = neutralPrintDensityFromL(targetL, paperL);
      return {
        tone: row.tone,
        measuredL,
        targetL,
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
    status: weighted.length
      ? (weightedAverage <= averageLimit && weightedMax <= maxLimit) ? "Pass"
        : (weightedAverage > maxLimit || weightedMax > maxLimit * 2) ? "Fail"
        : "Warning"
      : "Missing",
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
  return grayRows
    .filter((row) => row.lab)
    .map((row) => {
      const tone = neutralGrayTone(row);
      const targetLab = targetGrayLab(row, options.standardPatchMap);
      const targetL = targetLab?.l ?? (Number.isFinite(tone) ? g7NpdcLTarget(tone) : NaN);
      const deltaL = Number.isFinite(row.lab.l) && Number.isFinite(targetL) ? row.lab.l - targetL : NaN;
      const measuredA = number(row.lab.a);
      const measuredB = number(row.lab.b);
      const targetA = Number.isFinite(number(targetLab?.a)) ? number(targetLab.a) : 0;
      const targetB = Number.isFinite(number(targetLab?.b)) ? number(targetLab.b) : 0;
      const deltaA = Number.isFinite(measuredA) ? measuredA - targetA : NaN;
      const deltaB = Number.isFinite(measuredB) ? measuredB - targetB : NaN;
      const chroma = Number.isFinite(deltaA) && Number.isFinite(deltaB) ? Math.sqrt(deltaA ** 2 + deltaB ** 2) : NaN;
      const measuredChroma = Number.isFinite(measuredA) && Number.isFinite(measuredB) ? Math.sqrt(measuredA ** 2 + measuredB ** 2) : NaN;
      const weight = g7ToneWeight(tone);
      const signedWeightedDeltaL = Number.isFinite(deltaL) ? deltaL * weight : NaN;
      const measuredNpdc = neutralPrintDensityFromL(row.lab.l, paperL);
      const targetNpdc = neutralPrintDensityFromL(targetL, paperL);
      return {
        label: row.label,
        tone,
        cmyk: row.cmyk,
        measuredL: row.lab.l,
        targetL,
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
    status: weightedAverage <= averageLimit && weightedMax <= maxLimit ? "Pass"
      : weightedAverage > maxLimit || weightedMax > maxLimit * 2 ? "Fail"
      : "Warning",
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
    status: weightedAverage <= averageLimit && weightedMax <= maxLimit ? "Pass"
      : weightedAverage > maxLimit || weightedMax > maxLimit * 2 ? "Fail"
      : "Warning",
  };
}

export function g7ToneWeight(tone) {
  const numeric = number(tone);
  if (!Number.isFinite(numeric)) return NaN;
  return 1 - Math.max(0, ((numeric - 50) / 50) * 0.75);
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
    return {
      category: cat,
      label,
      measuredLab: patch.lab,
      referenceLab: ref.lab,
      deltaE: dE,
      status: dE <= 3.5 ? "Pass" : dE <= 5.0 ? "Warning" : "Fail",
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
