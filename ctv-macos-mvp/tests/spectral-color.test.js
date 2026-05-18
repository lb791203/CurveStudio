import assert from "node:assert/strict";
import test from "node:test";

import { labFromSpectralRow, xyzFromSpectralRow } from "../src/spectral-color.js";

test("spectral reflectance converts neutral white to D50 Lab", () => {
  const row = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [`spectral_nm${380 + index * 10}`, 1]));
  const xyz = xyzFromSpectralRow(row);
  const lab = labFromSpectralRow(row);

  assert.equal(Number(xyz.x.toFixed(3)), 96.422);
  assert.equal(Number(xyz.y.toFixed(3)), 100);
  assert.equal(Number(xyz.z.toFixed(3)), 82.521);
  assert.equal(Number(lab.l.toFixed(2)), 100);
  assert.equal(Number(lab.a.toFixed(2)), 0);
  assert.equal(Number(lab.b.toFixed(2)), 0);
});

test("spectral reflectance accepts percent-scale values", () => {
  const row = Object.fromEntries(Array.from({ length: 36 }, (_, index) => [`spectral_nm${380 + index * 10}`, 50]));
  const lab = labFromSpectralRow(row);

  assert.ok(lab.l > 70 && lab.l < 80);
  assert.ok(Math.abs(lab.a) < 0.01);
  assert.ok(Math.abs(lab.b) < 0.01);
});
