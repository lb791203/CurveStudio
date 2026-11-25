import assert from "node:assert/strict";
import test from "node:test";

import { calculateCompensation } from "../src/curve-engine.js";
import { applyCurveOverrides } from "../src/curve-overrides.js";
import { validateExportCurve } from "../src/curve-validation.js";

function cCurve() {
  const measurements = [10, 25, 40, 50, 75, 90].map((tone) => ({ channel: "C", tone, measuredTone: Math.min(100, tone + 14 * Math.sin(Math.PI * tone / 100)) }));
  return calculateCompensation(measurements, { mode: "tvi", target: "isoA", smooth: "medium", limit: 18, compensationRatio: 1 });
}

test("a normal computed curve passes the export gate", () => {
  const result = validateExportCurve(cCurve());
  assert.equal(result.ok, true, JSON.stringify(result.problems));
});

test("review #3: lock points that reverse the curve or move the end point block export", () => {
  const rows = applyCurveOverrides(cCurve(), {
    "C:40.000": { locked: true, outputTone: 28.99 },
    "C:50.000": { locked: true, outputTone: 20 },
    "C:100.000": { locked: true, outputTone: 95 },
  });
  const result = validateExportCurve(rows);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((item) => item.type === "reversal" && item.channel === "C"));
  assert.ok(result.problems.some((item) => item.type === "endpoint" && item.input === 100));
});

test("export gate rejects non-finite values, out-of-range values and a moved 0% point", () => {
  const base = [0, 50, 100].map((tone) => ({ channel: "K", tone, outputTone: tone }));
  assert.equal(validateExportCurve(base).ok, true);
  assert.equal(validateExportCurve([{ ...base[0], outputTone: 2 }, base[1], base[2]]).ok, false);
  assert.equal(validateExportCurve([base[0], { ...base[1], outputTone: NaN }, base[2]]).ok, false);
  assert.equal(validateExportCurve([base[0], { ...base[1], outputTone: 120 }, base[2]]).ok, false);
  assert.equal(validateExportCurve([]).ok, false);
});

const curve = (points) => points.map(([tone, outputTone]) => ({ channel: "C", tone, outputTone }));

test("re-review S3: end points must be exactly 0→0 and 100→100 as written (2 decimals)", () => {
  assert.equal(validateExportCurve(curve([[0, 0.04], [50, 50], [100, 100]])).ok, false);
  assert.equal(validateExportCurve(curve([[0, 0], [50, 50], [100, 99.96]])).ok, false);
  // Below the written precision it is exactly 0 / 100 in the file.
  assert.equal(validateExportCurve(curve([[0, 0.004], [50, 50], [100, 99.996]])).ok, true);
});

test("re-review S3: null, duplicate inputs and inputs above 100 are rejected", () => {
  const withNull = validateExportCurve(curve([[0, 0], [50, null], [100, 100]]));
  assert.equal(withNull.ok, false);
  assert.ok(withNull.problems.some((item) => item.type === "not_finite"));
  const duplicate = validateExportCurve(curve([[0, 0], [50, 48], [50, 52], [100, 100]]));
  assert.ok(duplicate.problems.some((item) => item.type === "duplicate"));
  const over = validateExportCurve(curve([[0, 0], [50, 50], [100, 100], [120, 100]]));
  assert.ok(over.problems.some((item) => item.type === "input_range"));
});

test("re-review S3: a reversal that only shows after rounding is still caught", () => {
  // 49.996 → "50.00" and 50.004 written after it as 50.00 is fine; 50.01 then 50.00 is a reversal.
  assert.equal(validateExportCurve(curve([[0, 0], [40, 50.01], [50, 50.004], [100, 100]])).ok, false);
});
