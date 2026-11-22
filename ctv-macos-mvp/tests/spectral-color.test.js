import assert from "node:assert/strict";
import test from "node:test";

import {
  labFromSpectralRow,
  xyzFromSpectralRow,
  labFromXyz,
  statusTReflectance,
  densityFromSpectralRow,
} from "../src/spectral-color.js";

test("spectral reflectance converts neutral white to D50 Lab", () => {
  const row = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [`spectral_nm${380 + index * 10}`, 1]));
  const xyz = xyzFromSpectralRow(row);
  const lab = labFromSpectralRow(row);

  assert.equal(Number(xyz.x.toFixed(3)), 96.422);
  assert.equal(Number(xyz.y.toFixed(3)), 100);
  assert.equal(Number(xyz.z.toFixed(3)), 82.521);
  assert.equal(Number(lab.l.toFixed(2)), 100);
  assert.ok(Math.abs(lab.a) < 0.005);
  assert.ok(Math.abs(lab.b) < 0.005);
});

test("spectral Lab keeps dark patches on the 0-100 scale", () => {
  // ~1.3% reflectance everywhere: a K solid / 4C shadow. Y is about 1.3, which the
  // old 0-1 scale guess multiplied by 100 and reported as L* > 100.
  const row = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [`nm${380 + index * 10}`, 0.013]));
  const lab = labFromSpectralRow(row);
  assert.ok(lab.l > 10 && lab.l < 13, `expected L* ~11.6, got ${lab.l}`);
});

// Reference Lab values computed independently with colour-science
// (sd_to_XYZ_ASTME308, CIE 1931 2°, CIE D50, Lab white 96.422/100/82.521).
const ASTM_E308_REFERENCE_SPECTRA = [
  { name: "cyan", lab: [66.494, -40.288, -31.896], r: [0.217, 0.2705, 0.3319, 0.3995, 0.4706, 0.5417, 0.6085, 0.6666, 0.7116, 0.7402, 0.75, 0.7402, 0.7116, 0.6666, 0.6085, 0.5417, 0.4706, 0.3995, 0.3319, 0.2705, 0.217, 0.1723, 0.1361, 0.1079, 0.0867, 0.0712, 0.0603, 0.0528, 0.0479, 0.0447, 0.0427, 0.0416, 0.0409, 0.0405, 0.0402, 0.0401] },
  { name: "magenta", lab: [67.505, 60.096, -38.024], r: [0.85, 0.8499, 0.8497, 0.8492, 0.8478, 0.8444, 0.8368, 0.8214, 0.7928, 0.7444, 0.6705, 0.5689, 0.444, 0.3098, 0.1875, 0.1012, 0.07, 0.1012, 0.1875, 0.3098, 0.444, 0.5689, 0.6705, 0.7444, 0.7928, 0.8214, 0.8368, 0.8444, 0.8478, 0.8492, 0.8497, 0.8499, 0.85, 0.85, 0.85, 0.85] },
  { name: "yellow", lab: [91.053, -7.194, 82.077], r: [0.06, 0.0601, 0.0602, 0.0604, 0.061, 0.0623, 0.0654, 0.0722, 0.0876, 0.1207, 0.1871, 0.3024, 0.46, 0.6176, 0.7329, 0.7993, 0.8324, 0.8478, 0.8546, 0.8577, 0.859, 0.8596, 0.8598, 0.8599, 0.86, 0.86, 0.86, 0.86, 0.86, 0.86, 0.86, 0.86, 0.86, 0.86, 0.86, 0.86] },
  { name: "gray", lab: [49.496, 0.002, 0.004], r: [0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18] },
];

test("spectral Lab matches an independent ASTM E308 D50/2 calculation", async () => {
  const { deltaE2000 } = await import("../src/analysis-engine.js");
  for (const sample of ASTM_E308_REFERENCE_SPECTRA) {
    const row = Object.fromEntries(sample.r.map((value, index) => [`nm${380 + index * 10}`, value]));
    const lab = labFromSpectralRow(row);
    const expected = { l: sample.lab[0], a: sample.lab[1], b: sample.lab[2] };
    assert.ok(deltaE2000(expected, lab) < 0.05, `${sample.name}: dE00 ${deltaE2000(expected, lab)}`);
  }
});

test("spectral reflectance accepts percent-scale values", () => {
  const row = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [`spectral_nm${380 + index * 10}`, 50]));
  const lab = labFromSpectralRow(row);

  assert.ok(lab.l > 70 && lab.l < 80);
  assert.ok(Math.abs(lab.a) < 0.01);
  assert.ok(Math.abs(lab.b) < 0.01);
});

test("statusTReflectance computes weighted average reflectance", () => {
  const samples = Array.from({ length: 36 }, (_, index) => ({ nm: 380 + index * 10, reflectance: 0.5 }));
  const val = statusTReflectance(samples, "C");
  assert.equal(Number(val.toFixed(2)), 0.5);
});

test("densityFromSpectralRow calculates density relative to paper", () => {
  const paperRow = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [`spectral_nm${380 + index * 10}`, 1]));
  const sampleRow = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [`spectral_nm${380 + index * 10}`, 0.1]));
  const density = densityFromSpectralRow(sampleRow, paperRow, "C");
  assert.equal(Number(density.toFixed(2)), 1.0);
});

test("colored samples Lab calculation cross-verification", () => {
  const yellowRow = {};
  for (let i = 0; i < 36; i++) {
    const nm = 380 + i * 10;
    yellowRow[`spectral_nm${nm}`] = nm < 500 ? 0.05 : 0.85;
  }
  const lab = labFromSpectralRow(yellowRow);
  assert.ok(lab.l > 50);
  assert.ok(lab.b > 50); // Yellow should have high positive b*
  assert.ok(Math.abs(lab.a) < 20);
});

test("labFromXyz handles extremely low light levels near black (cieLabCompression threshold)", () => {
  const darkXyz = { x: 0.001, y: 0.001, z: 0.001 };
  const lab = labFromXyz(darkXyz);
  assert.ok(lab.l > 0 && lab.l < 5); // extremely dark but positive
  assert.ok(Number.isFinite(lab.a));
  assert.ok(Number.isFinite(lab.b));
});

test("spectral processing ignores negative or invalid reflectance values", () => {
  const row = {
    spectral_nm400: -0.5, // invalid, should be filtered
    spectral_nm500: 0.5,
    spectral_nm600: "invalid", // invalid
  };
  const xyz = xyzFromSpectralRow(row);
  assert.ok(xyz === null || (xyz.x >= 0 && xyz.y >= 0 && xyz.z >= 0));
});

test("spectral processing handles sparse wavelength data gracefully", () => {
  const row = {
    spectral_nm400: 0.5,
    spectral_nm700: 0.5,
  };
  const lab = labFromSpectralRow(row);
  assert.ok(lab !== null);
  assert.ok(Number.isFinite(lab.l));
});


test("visual (K) density response follows the photopic curve", () => {
  const flat = (value) => Array.from({ length: 36 }, (_, index) => ({ nm: 380 + index * 10, reflectance: value }));
  const greenDip = flat(0.8).map((sample) => (sample.nm >= 540 && sample.nm <= 570 ? { ...sample, reflectance: 0.1 } : sample));
  const blueDip = flat(0.8).map((sample) => (sample.nm >= 440 && sample.nm <= 470 ? { ...sample, reflectance: 0.1 } : sample));
  // A dip where the eye is most sensitive must darken K density far more than a blue dip.
  assert.ok(statusTReflectance(greenDip, "K") < statusTReflectance(blueDip, "K") - 0.2);
});
