import { number } from "./shared.js";

export const D50_XYZ = { x: 96.422, y: 100, z: 82.521 };

const D50_SPD_10NM = new Map([
  [380, 17.948], [390, 22.613], [400, 27.279], [410, 29.837],
  [420, 32.395], [430, 39.589], [440, 46.783], [450, 52.910],
  [460, 59.036], [470, 55.367], [480, 51.698], [490, 52.293],
  [500, 52.888], [510, 51.453], [520, 50.019], [530, 51.913],
  [540, 53.806], [550, 58.273], [560, 62.740], [570, 66.117],
  [580, 69.494], [590, 68.462], [600, 67.430], [610, 66.587],
  [620, 65.745], [630, 67.284], [640, 68.823], [650, 71.609],
  [660, 74.395], [670, 76.505], [680, 78.615], [690, 79.864],
  [700, 81.113], [710, 80.001], [720, 78.889], [730, 76.858],
]);

// ASTM E308 tristimulus weighting factors, CIE D50 illuminant, CIE 1931 2° observer,
// 10 nm interval, 380–730 nm, for reflectance data that is already bandpass-corrected
// (the usual case for i1Pro / i1iO / eXact / SpectroDens exports). Generated with
// colour-science `sd_to_XYZ_ASTME308` from the CIE 1931 CMFs and CIE D50 SPD, then
// normalised so that sum(Wy) = 100 and the X/Z sums equal the ASTM E308 D50 white
// (96.422, 82.521; colour-science's D50 SPD differs from ASTM's by <0.01%).
// Checked against i1iO2 M0/M2 CGATS files: mean ΔE00 0.005 versus the instrument's
// own LAB columns (the previous Gaussian CMF approximation was ~1.1 ΔE00 mean).
const ASTM_E308_D50_2_10NM = new Map([
  [380, [0.00389, 0.00011, 0.01829]],
  [390, [0.01212, 0.00035, 0.05721]],
  [400, [0.05986, 0.00165, 0.28351]],
  [410, [0.23323, 0.00622, 1.11041]],
  [420, [0.77468, 0.02283, 3.72214]],
  [430, [1.61852, 0.06636, 7.90208]],
  [440, [2.45122, 0.16226, 12.30207]],
  [450, [2.77178, 0.31273, 14.61986]],
  [460, [2.49830, 0.51403, 14.33957]],
  [470, [1.71786, 0.79843, 11.30472]],
  [480, [0.86007, 1.23837, 7.30237]],
  [490, [0.28314, 1.84103, 4.13229]],
  [500, [0.03993, 2.94731, 2.46596]],
  [510, [0.08831, 4.63249, 1.44669]],
  [520, [0.59365, 6.59098, 0.73705]],
  [530, [1.58886, 8.30161, 0.40061]],
  [540, [2.80015, 9.19935, 0.19651]],
  [550, [4.20408, 9.64505, 0.08470]],
  [560, [5.65717, 9.47176, 0.03679]],
  [570, [7.13484, 8.90541, 0.01967]],
  [580, [8.53292, 8.10512, 0.01492]],
  [590, [9.26905, 6.83880, 0.01043]],
  [600, [9.83313, 5.83673, 0.00734]],
  [610, [9.46414, 4.75113, 0.00354]],
  [620, [8.00611, 3.57184, 0.00159]],
  [630, [5.93199, 2.44575, 0.00050]],
  [640, [4.16828, 1.62819, 0.00016]],
  [650, [2.61124, 0.98506, 0.00002]],
  [660, [1.54137, 0.56998, -0.00000]],
  [670, [0.85365, 0.31243, 0.00000]],
  [680, [0.43323, 0.15745, 0.00000]],
  [690, [0.19437, 0.07028, 0.00000]],
  [700, [0.09693, 0.03500, 0.00000]],
  [710, [0.04998, 0.01805, 0.00000]],
  [720, [0.02215, 0.00800, 0.00000]],
  [730, [0.02179, 0.00787, 0.00000]],

]);

const ASTM_FIRST_NM = 380;
const ASTM_LAST_NM = 730;

const SPECTRAL_WHITE = approximateSpectralToXyz(
  Array.from(D50_SPD_10NM.keys()).map((nm) => ({ nm, reflectance: 1 })),
  false
);

export function labFromSpectralRow(row) {
  const xyz = xyzFromSpectralRow(row);
  // Spectral integration always yields the 0–100 scale. Do not run it through
  // labFromXyz's 0–1 scale guess: a dark patch (Y < 1.5, roughly L* < 13, e.g. a
  // K solid or 4-colour shadow) would be multiplied by 100 and come out as L* > 100.
  return xyz ? labFromXyz100(xyz) : null;
}

export function xyzFromSpectralRow(row) {
  const samples = spectralSamples(row);
  if (!samples.length) return null;
  return spectralToXyz(samples);
}

export function labFromXyz(xyz) {
  return labFromXyz100(normalizeXyzScale(xyz));
}

function labFromXyz100(normalized) {
  if (!normalized || ![normalized.x, normalized.y, normalized.z].every(Number.isFinite)) return null;
  const fx = cieLabCompression(normalized.x / D50_XYZ.x);
  const fy = cieLabCompression(normalized.y / D50_XYZ.y);
  const fz = cieLabCompression(normalized.z / D50_XYZ.z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function spectralSamples(row = {}) {
  return Object.entries(row)
    .map(([key, value]) => {
      const match = String(key).toLowerCase().match(/(?:spectral_nm|nm_?|spectrum_?)(\d{3})$/);
      if (!match) return null;
      const reflectance = normalizeReflectance(number(value));
      const nm = Number(match[1]);
      if (!Number.isFinite(reflectance) || nm < 360 || nm > 780) return null;
      return { nm, reflectance };
    })
    .filter(Boolean)
    .sort((a, b) => a.nm - b.nm);
}

function spectralToXyz(samples, normalizeWhite = true) {
  const astm = astmE308ToXyz(samples);
  if (astm) return astm;
  return approximateSpectralToXyz(samples, normalizeWhite);
}

// Uses the ASTM E308 weighting table when the samples sit on the 10 nm grid.
// Weights for wavelengths outside the measured range are folded into the first/last
// measured band (ASTM E308 range-truncation practice) instead of being dropped.
function astmE308ToXyz(samples) {
  const inRange = samples.filter((sample) => sample.nm >= ASTM_FIRST_NM && sample.nm <= ASTM_LAST_NM);
  if (inRange.length < 16 || inRange.some((sample) => sample.nm % 10 !== 0)) return null;
  const byNm = new Map(inRange.map((sample) => [sample.nm, sample.reflectance]));
  const measured = [...byNm.keys()].sort((a, b) => a - b);
  const first = measured[0];
  const last = measured[measured.length - 1];
  for (let nm = first; nm <= last; nm += 10) {
    if (!byNm.has(nm)) return null;
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const [nm, weight] of ASTM_E308_D50_2_10NM) {
    const reflectance = nm < first ? byNm.get(first) : nm > last ? byNm.get(last) : byNm.get(nm);
    x += reflectance * weight[0];
    y += reflectance * weight[1];
    z += reflectance * weight[2];
  }
  return { x, y, z };
}

// Fallback for non-10 nm data (e.g. 5 nm or 20 nm exports). Uses an analytic
// multi-lobe approximation of the CIE 1931 CMFs, so expect roughly 1 ΔE00 error.
function approximateSpectralToXyz(samples, normalizeWhite = true) {
  let x = 0;
  let y = 0;
  let z = 0;
  let normalizer = 0;

  for (const sample of samples) {
    const spd = illuminantD50(sample.nm);
    const cmf = cie1931Approx(sample.nm);
    if (!Number.isFinite(spd) || !cmf) continue;
    x += sample.reflectance * spd * cmf.x;
    y += sample.reflectance * spd * cmf.y;
    z += sample.reflectance * spd * cmf.z;
    normalizer += spd * cmf.y;
  }

  if (normalizer <= 0) return null;
  const scale = 100 / normalizer;
  const raw = { x: x * scale, y: y * scale, z: z * scale };
  if (!normalizeWhite) return raw;
  if (!SPECTRAL_WHITE || ![SPECTRAL_WHITE.x, SPECTRAL_WHITE.y, SPECTRAL_WHITE.z].every(Number.isFinite)) return raw;
  return {
    x: raw.x * (D50_XYZ.x / SPECTRAL_WHITE.x),
    y: raw.y * (D50_XYZ.y / SPECTRAL_WHITE.y),
    z: raw.z * (D50_XYZ.z / SPECTRAL_WHITE.z),
  };
}

function cie1931Approx(nm) {
  if (nm < 360 || nm > 780) return null;
  return {
    x: gaussian(nm, 1.056, 599.8, 0.0264, 0.0323)
      + gaussian(nm, 0.362, 442.0, 0.0624, 0.0374)
      + gaussian(nm, -0.065, 501.1, 0.0490, 0.0382),
    y: gaussian(nm, 0.821, 568.8, 0.0213, 0.0247)
      + gaussian(nm, 0.286, 530.9, 0.0613, 0.0322),
    z: gaussian(nm, 1.217, 437.0, 0.0845, 0.0278)
      + gaussian(nm, 0.681, 459.0, 0.0385, 0.0725),
  };
}

function gaussian(nm, amplitude, center, leftWidth, rightWidth) {
  const width = nm < center ? leftWidth : rightWidth;
  return amplitude * Math.exp(-0.5 * ((nm - center) * width) ** 2);
}

function illuminantD50(nm) {
  const rounded = Math.round(nm / 10) * 10;
  if (D50_SPD_10NM.has(rounded)) return D50_SPD_10NM.get(rounded);

  const lower = Math.floor(nm / 10) * 10;
  const upper = Math.ceil(nm / 10) * 10;
  if (!D50_SPD_10NM.has(lower) || !D50_SPD_10NM.has(upper)) return NaN;
  const ratio = (nm - lower) / (upper - lower);
  return D50_SPD_10NM.get(lower) + (D50_SPD_10NM.get(upper) - D50_SPD_10NM.get(lower)) * ratio;
}

function normalizeReflectance(value) {
  if (!Number.isFinite(value) || value < 0) return NaN;
  return value > 2 ? value / 100 : value;
}

function cieLabCompression(value) {
  const threshold = (6 / 29) ** 3;
  return value > threshold ? Math.cbrt(value) : (841 / 108) * value + 4 / 29;
}

function normalizeXyzScale(xyz) {
  if (!xyz || ![xyz.x, xyz.y, xyz.z].every(Number.isFinite)) return null;
  const max = Math.max(xyz.x, xyz.y, xyz.z);
  if (max > 0 && max <= 1.5) return { x: xyz.x * 100, y: xyz.y * 100, z: xyz.z * 100 };
  return xyz;
}

// ─── ISO 5-3 Status-T Spectral Products (D50 illuminant, 2° observer) ───
// Pre-computed products: illuminant S(λ) × filter T(λ) × observer V(λ)
// Density D = -log10(∫P(λ)R_sample(λ)dλ / ∫P(λ)R_paper(λ)dλ)

const STATUS_T_RED = new Map([
  [380, 0.000], [390, 0.000], [400, 0.003], [410, 0.010], [420, 0.028],
  [430, 0.051], [440, 0.047], [450, 0.024], [460, 0.008], [470, 0.003],
  [480, 0.002], [490, 0.002], [500, 0.002], [510, 0.001], [520, 0.001],
  [530, 0.001], [540, 0.002], [550, 0.008], [560, 0.038], [570, 0.131],
  [580, 0.290], [590, 0.434], [600, 0.526], [610, 0.649], [620, 0.749],
  [630, 0.741], [640, 0.624], [650, 0.548], [660, 0.586], [670, 0.680],
  [680, 0.617], [690, 0.374], [700, 0.189], [710, 0.092], [720, 0.039],
  [730, 0.009],
]);

const STATUS_T_GREEN = new Map([
  [380, 0.000], [390, 0.000], [400, 0.000], [410, 0.001], [420, 0.002],
  [430, 0.003], [440, 0.005], [450, 0.008], [460, 0.013], [470, 0.021],
  [480, 0.035], [490, 0.054], [500, 0.080], [510, 0.120], [520, 0.194],
  [530, 0.339], [540, 0.528], [550, 0.574], [560, 0.518], [570, 0.427],
  [580, 0.287], [590, 0.137], [600, 0.051], [610, 0.018], [620, 0.006],
  [630, 0.002], [640, 0.001], [650, 0.000], [660, 0.000], [670, 0.000],
  [680, 0.000], [690, 0.000], [700, 0.000], [710, 0.000], [720, 0.000],
  [730, 0.000],
]);

const STATUS_T_BLUE = new Map([
  [380, 0.005], [390, 0.039], [400, 0.172], [410, 0.655], [420, 1.143],
  [430, 0.909], [440, 0.328], [450, 0.077], [460, 0.022], [470, 0.008],
  [480, 0.004], [490, 0.002], [500, 0.001], [510, 0.000], [520, 0.000],
  [530, 0.000], [540, 0.000], [550, 0.000], [560, 0.000], [570, 0.000],
  [580, 0.000], [590, 0.000], [600, 0.000], [610, 0.000], [620, 0.000],
  [630, 0.000], [640, 0.000], [650, 0.000], [660, 0.000], [670, 0.000],
  [680, 0.000], [690, 0.000], [700, 0.000], [710, 0.000], [720, 0.000],
  [730, 0.000],
]);

// Visual (K) density response: D50 SPD × CIE 1931 y-bar, i.e. the Y column of the
// ASTM E308 D50/2° table scaled to a peak of 1. The previous table peaked at 460 nm,
// which is a blue response rather than the photopic y-bar curve (peak ~555 nm).
const STATUS_T_VISUAL = new Map(
  [...ASTM_E308_D50_2_10NM].map(([nm, weight]) => [nm, Number((weight[1] / 9.64505).toFixed(4))])
);

const STATUS_T_RESPONSE = { C: STATUS_T_RED, M: STATUS_T_GREEN, Y: STATUS_T_BLUE, K: STATUS_T_VISUAL };

/**
 * Compute ISO 5-3 Status-T weighted reflectance for a given channel.
 * Returns ∫P(λ)R(λ)dλ / ∫P(λ)dλ where P is the Status-T spectral product.
 */
export function statusTReflectance(samples, channel) {
  const response = STATUS_T_RESPONSE[channel];
  if (!response || !samples.length) return NaN;

  let numerator = 0;
  let denominator = 0;

  for (const sample of samples) {
    const nm = Math.round(sample.nm / 10) * 10;
    if (nm < 380 || nm > 730) continue;
    const weight = response.get(nm) ?? 0;
    if (weight <= 0) continue;
    numerator += sample.reflectance * weight;
    denominator += weight;
  }

  if (denominator <= 0 || numerator <= 0) return NaN;
  return numerator / denominator;
}

/**
 * Compute ISO 5-3 Status-T density from a spectral measurement row and paper row.
 * D = -log10(sample_response / paper_response)
 */
export function densityFromSpectralRow(row, paperRow, channel) {
  const sampleSamples = spectralSamples(row);
  const paperSamples = spectralSamples(paperRow || {});
  if (!sampleSamples.length || !paperSamples.length) return NaN;

  const sampleR = statusTReflectance(sampleSamples, channel);
  const paperR = statusTReflectance(paperSamples, channel);

  if (!Number.isFinite(sampleR) || !Number.isFinite(paperR) || sampleR <= 0 || paperR <= 0) return NaN;

  return Math.max(0, Math.log10(paperR / sampleR));
}
