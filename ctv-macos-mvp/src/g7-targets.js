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

// ─── G7 NPDC Target Curve (CGATS/Idealliance TR 015) ───
// The aim neutral print density curves are computed, not looked up in a data set:
//   TVI(TV) = a·p1 + b·p2 + c·p3 with p1 = -4x(x-1), p2 = 21x(x-1)(x-0.5), p3 = -64x(x-1)(x-0.5)^2, x = TV/100
//   Y_R(TV) = 1 - RR·(TV + TVI(TV))/100           reference reflectance relative to the substrate
//   Y_C     = (0.7 + 0.3·(Y_D/Y_L)^(1/3))^3        control point; lighter tones follow Y_R unchanged
//   darker: Y = Y_R - (RA - RR)·((Y_C - Y_R)/(Y_C - 1 + RR))^(1 + RA/2), RA = 1 - Y_D/Y_L
// Y_D/Y_L is the measured solid (K, or CMY overprint) relative to the measured substrate, so
// the shadow end lands exactly on the actual maximum neutral density.
// Constants: CMY a=24.321 b=2.246 c=0.670 RR=0.956649; K a=19.421 b=0.967 c=0.555 RR=0.978223.
// Check: with paper L* 95 / K L* 16 this reproduces the CRPC6 K ramp within 0.6 L*, and the
// CMY curve the CRPC6 50/40/40 gray within 0.1 L*.

export const G7_NPDC_METHOD = "CGATS TR 015-2022 NPDC";

const TR015 = {
  K: { a: 19.421, b: 0.967, c: 0.555, rr: 0.978223 },
  CMY: { a: 24.321, b: 2.246, c: 0.670, rr: 0.956649 },
};

const DEFAULT_G7_PAPER_L = 95;

function tr015Tvi(tone, { a, b, c }) {
  const x = tone / 100;
  return a * (-4 * x * (x - 1)) + b * (21 * x * (x - 1) * (x - 0.5)) + c * (-64 * x * (x - 1) * (x - 0.5) ** 2);
}

// Target reflectance relative to the substrate (0..1). solidRelativeY = Y(solid)/Y(paper);
// without a measured solid the reference curve is used unscaled (RA = RR).
export function tr015RelativeY(toneValue, kind = "K", solidRelativeY = NaN) {
  const constants = TR015[kind === "CMY" ? "CMY" : "K"];
  const tone = Math.min(100, Math.max(0, number(toneValue)));
  if (!Number.isFinite(tone)) return NaN;
  const yR = 1 - constants.rr * (tone + tr015Tvi(tone, constants)) / 100;
  const ydyl = Number.isFinite(solidRelativeY) && solidRelativeY > 0 && solidRelativeY < 1 ? solidRelativeY : 1 - constants.rr;
  const ra = 1 - ydyl;
  const yC = (0.7 + 0.3 * Math.cbrt(ydyl)) ** 3;
  if (yR > yC) return yR;
  // TR 015 eq. (7)/(14): the shadow adaptation follows a power of the ratio, exponent 1 + RA/2.
  const ratio = (yC - yR) / (yC - 1 + constants.rr);
  return yR - (ra - constants.rr) * ratio ** (1 + ra / 2);
}

// Substrate-relative target L* (paper = 100).
export function tr015RelativeL(tone, kind, paperL, solidL) {
  const solidRelativeY = labLToRelativeY(solidL) / labLToRelativeY(paperL);
  return relativeYToL(tr015RelativeY(tone, kind, solidRelativeY));
}

// Absolute target L* for a given substrate and solid.
// Without solidL the unscaled TR015 reference curve is used.
export function tr015AbsoluteL(tone, kind = "K", paperL = DEFAULT_G7_PAPER_L, solidL = NaN) {
  const paperY = labLToRelativeY(paperL);
  const solidRelativeY = Number.isFinite(number(solidL)) ? labLToRelativeY(solidL) / paperY : NaN;
  return relativeYToL(tr015RelativeY(tone, kind, solidRelativeY) * paperY);
}

// K NPDC reference target L* on paper L* 95 (absolute L*).
export function g7NpdcLTarget(tone) {
  return tr015AbsoluteL(tone, "K");
}

// CMY gray NPDC reference target L* on paper L* 95 (absolute L*).
export function g7CmyNpdcLTarget(tone) {
  return tr015AbsoluteL(tone, "CMY");
}

function relativeYToL(y) {
  if (!Number.isFinite(y) || y < 0) return NaN;
  return y > (6 / 29) ** 3 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

// G7 Grayscale is substrate-relative: every patch is zeroed on the measured paper
// (relative ND = ND(patch) - ND(paper)) and expressed as relative L*, then compared
// with the reference NPDC expressed the same way (relative to the reference paper).
// Without this, a press sheet on paper with L* 93 fails the highlights even when its
// tone reproduction is perfect. Pass `relative: false` for the old absolute check.
export function buildNpdcVerification(kRows, options = {}) {
  return buildToneVerification(kRows, "K", options.kSolidL, options).sort((a, b) => a.tone - b.tone);
}

// Shared by K and CMY: measured vs TR015 target L*, substrate-relative by default.
function buildToneVerification(rows, kind, measuredSolidL, options) {
  const hasPaper = Number.isFinite(number(options.paperL));
  const paperL = hasPaper ? number(options.paperL) : DEFAULT_G7_PAPER_L;
  const relative = options.relative !== false && hasPaper;
  const solidL = Number.isFinite(number(measuredSolidL)) ? number(measuredSolidL) : NaN;
  const targetSource = Number.isFinite(solidL) ? "tr015_measured_solid" : "tr015_reference";
  return rows
    .filter((row) => Number.isFinite(toneOf(row, kind)))
    .map((row) => {
      const tone = toneOf(row, kind);
      const relativeTargetL = Number.isFinite(solidL)
        ? tr015RelativeL(tone, kind, paperL, solidL)
        : relativeYToL(tr015RelativeY(tone, kind));
      const absoluteTargetL = relativeYToL(labLToRelativeY(relativeTargetL) * labLToRelativeY(paperL));
      const absoluteMeasuredL = Number.isFinite(number(row.lab?.l)) ? number(row.lab.l) : NaN;
      const measuredL = relative ? relativeL(absoluteMeasuredL, paperL) : absoluteMeasuredL;
      const targetL = relative ? relativeTargetL : absoluteTargetL;
      const deltaL = Number.isFinite(measuredL) && Number.isFinite(targetL) ? measuredL - targetL : NaN;
      const weight = g7ToneWeight(tone);
      const signedWeightedDeltaL = Number.isFinite(deltaL) ? deltaL * weight : NaN;
      const measuredNpdc = neutralPrintDensityFromL(absoluteMeasuredL, paperL);
      const targetNpdc = neutralPrintDensityFromL(absoluteTargetL, paperL);
      return {
        ...(kind === "CMY" ? { label: row.label, cmyk: row.cmyk } : {}),
        tone,
        measuredL,
        targetL,
        absoluteMeasuredL,
        absoluteTargetL,
        evaluation: relative ? "substrate_relative" : "absolute",
        targetSource,
        method: G7_NPDC_METHOD,
        measuredNpdc,
        targetNpdc,
        deltaNpdc: Number.isFinite(measuredNpdc) && Number.isFinite(targetNpdc) ? measuredNpdc - targetNpdc : NaN,
        deltaL,
        absDeltaL: Number.isFinite(deltaL) ? Math.abs(deltaL) : NaN,
        weight,
        signedWeightedDeltaL,
        weightedDeltaL: Number.isFinite(signedWeightedDeltaL) ? Math.abs(signedWeightedDeltaL) : NaN,
        row,
      };
    });
}

function toneOf(row, kind) {
  if (Number.isFinite(number(row.tone))) return number(row.tone);
  return kind === "K" ? number(row.cmyk?.k) : neutralGrayTone(row);
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
  const paperLab = isLab(options.paperLab) ? options.paperLab : null;
  const solidLab = isLab(options.cmySolidLab) ? options.cmySolidLab : null;
  const relative = options.relative !== false && Number.isFinite(number(options.paperL));
  return buildToneVerification(grayRows.filter((row) => row.lab), "CMY", solidLab?.l, options)
    .map(({ row, ...item }) => {
      const tone = item.tone;
      const measuredA = number(row.lab.a);
      const measuredB = number(row.lab.b);
      // TR015 gray balance: a*b* = substrate a*b* x (1 - C/100); above 50 % C it blends toward
      // the measured CMY solid with weight ((C - 50)/50)^4 when that solid is not neutral.
      const grayAim = relative && paperLab && Number.isFinite(tone) ? tr015GrayAim(tone, paperLab, solidLab) : null;
      const targetA = grayAim ? grayAim.a : 0;
      const targetB = grayAim ? grayAim.b : 0;
      const deltaA = Number.isFinite(measuredA) ? measuredA - targetA : NaN;
      const deltaB = Number.isFinite(measuredB) ? measuredB - targetB : NaN;
      const chroma = Number.isFinite(deltaA) && Number.isFinite(deltaB) ? Math.sqrt(deltaA ** 2 + deltaB ** 2) : NaN;
      const measuredChroma = Number.isFinite(measuredA) && Number.isFinite(measuredB) ? Math.sqrt(measuredA ** 2 + measuredB ** 2) : NaN;
      return {
        ...item,
        label: row.label,
        cmyk: row.cmyk,
        grayAimSource: grayAim ? "substrate_relative" : "neutral",
        a: measuredA,
        b: measuredB,
        targetA,
        targetB,
        deltaA,
        deltaB,
        chroma,
        measuredChroma,
        weightedChroma: Number.isFinite(chroma) ? chroma * item.weight : NaN,
      };
    })
    .sort((a, b) => a.tone - b.tone || String(a.label).localeCompare(String(b.label)));
}

export function tr015GrayAim(toneValue, paperLab, cmySolidLab = null) {
  const tone = clampTone(toneValue);
  const share = 1 - tone / 100;
  let a = number(paperLab.a) * share;
  let b = number(paperLab.b) * share;
  if (cmySolidLab && tone > 50) {
    const w = ((tone - 50) / 50) ** 4;
    // TR 015 eq. (4)/(5): additive — the substrate term stays, the solid's a*b* is added with weight w.
    a += number(cmySolidLab.a) * w;
    b += number(cmySolidLab.b) * w;
  }
  return { a, b };
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

function clampTone(tone) {
  return Math.min(100, Math.max(0, number(tone)));
}

export function neutralPrintDensityFromL(sampleL, paperL = DEFAULT_G7_PAPER_L) {
  const sampleY = labLToRelativeY(sampleL);
  const paperY = labLToRelativeY(paperL);
  if (!Number.isFinite(sampleY) || !Number.isFinite(paperY) || sampleY <= 0 || paperY <= 0) return NaN;
  return Math.max(0, Math.log10(paperY / sampleY));
}

function isLab(lab) {
  return lab && [lab.l, lab.a, lab.b].every(Number.isFinite);
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
