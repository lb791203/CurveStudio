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

const SPECTRAL_WHITE = spectralToXyz(
  Array.from(D50_SPD_10NM.keys()).map((nm) => ({ nm, reflectance: 1 })),
  false
);

export function labFromSpectralRow(row) {
  const xyz = xyzFromSpectralRow(row);
  return xyz ? labFromXyz(xyz) : null;
}

export function xyzFromSpectralRow(row) {
  const samples = spectralSamples(row);
  if (!samples.length) return null;
  return spectralToXyz(samples);
}

export function labFromXyz(xyz) {
  const normalized = normalizeXyzScale(xyz);
  if (!normalized) return null;
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
