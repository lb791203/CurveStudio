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
