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

test("spectral Lab matches i1iO2 instrument Lab within 0.05 dE00", async () => {
  const { readFile } = await import("node:fs/promises");
  const { parseImportText } = await import("../src/curve-engine.js");
  const { deltaE2000 } = await import("../src/analysis-engine.js");
  const text = await readFile(new URL("../reference-data/measurements/it8-random/IT8.7-4 CMYK random (i1iO2)_M0.txt", import.meta.url), "utf8");
  const { rawRows } = parseImportText(text);
  let worst = 0;
  for (const row of rawRows.slice(0, 200)) {
    const reported = { l: Number(row.lab_l), a: Number(row.lab_a), b: Number(row.lab_b) };
    const spectralOnly = Object.fromEntries(Object.entries(row).filter(([key]) => /nm\d{3}$/i.test(key)));
    worst = Math.max(worst, deltaE2000(reported, labFromSpectralRow(spectralOnly)));
  }
  assert.ok(worst < 0.05, `worst dE00 ${worst}`);
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
