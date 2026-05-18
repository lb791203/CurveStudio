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
// L* targets for K-only NPDC (GRACoL 2013 / ISO 12647-2:2013 coated).

const G7_NPDC_L_TARGET = new Map([
  [2, 92.1], [4, 88.3], [6, 84.3], [8, 80.5], [10, 76.7],
  [15, 68.8], [20, 61.8], [25, 55.3], [30, 49.3], [35, 43.6],
  [40, 38.3], [45, 33.2], [50, 28.4], [55, 23.9], [60, 20.1],
  [65, 17.2], [70, 14.8], [75, 12.7], [80, 10.9], [85, 9.3],
  [90, 7.7], [95, 6.2], [98, 5.2], [100, 4.5],
]);

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

export function buildNpdcVerification(kRows) {
  return kRows
    .filter((row) => Number.isFinite(row.tone))
    .map((row) => {
      const targetL = g7NpdcLTarget(row.tone);
      const measuredL = Number.isFinite(row.lab?.l) ? row.lab.l : NaN;
      const deltaL = Number.isFinite(measuredL) ? measuredL - targetL : NaN;
      return {
        tone: row.tone,
        measuredL,
        targetL,
        deltaL,
        absDeltaL: Number.isFinite(deltaL) ? Math.abs(deltaL) : NaN,
      };
    })
    .sort((a, b) => a.tone - b.tone);
}

export function summarizeNpdc(rows) {
  const deltas = rows.map((r) => r.absDeltaL).filter(Number.isFinite);
  return {
    count: deltas.length,
    avgDeltaL: average(deltas),
    maxDeltaL: deltas.length ? Math.max(...deltas) : NaN,
    status: deltas.length
      ? (average(deltas) <= 1.5 && Math.max(...deltas) <= 3.0) ? "Pass"
        : (average(deltas) > 3.0 || Math.max(...deltas) > 6.0) ? "Fail"
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

export function buildGrayVerification(grayRows) {
  return grayRows
    .filter((row) => row.lab)
    .map((row) => ({
      label: row.label,
      a: row.lab.a,
      b: row.lab.b,
      chroma: Math.sqrt((row.lab.a || 0) ** 2 + (row.lab.b || 0) ** 2),
    }))
    .sort((a, b) => a.chroma - b.chroma);
}

export function summarizeGrayBalance(rows) {
  const chromas = rows.map((r) => r.chroma).filter(Number.isFinite);
  if (!chromas.length) return { count: 0, avgChroma: NaN, maxChroma: NaN, status: "Missing" };
  const avg = average(chromas);
  const max = Math.max(...chromas);
  return {
    count: chromas.length,
    avgChroma: avg,
    maxChroma: max,
    status: avg <= G7_GRAY_TOLERANCES.avgChPass && max <= G7_GRAY_TOLERANCES.maxChPass ? "Pass"
      : avg > G7_GRAY_TOLERANCES.avgChFail || max > G7_GRAY_TOLERANCES.maxChFail ? "Fail"
      : "Warning",
  };
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
      if (!patches[cat]) patches[cat] = { ...row, cmyk };
    }
  }
  return patches;
}
