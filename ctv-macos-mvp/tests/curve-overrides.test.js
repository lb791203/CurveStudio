import assert from "node:assert/strict";
import test from "node:test";

import { applyCurveOverrides, curveRowKey, pruneCurveOverrides } from "../src/curve-overrides.js";

test("applyCurveOverrides locks manual output and preserves automatic output", () => {
  const rows = [{
    channel: "C",
    tone: 50,
    outputTone: 46,
    productionOutputTone: 46,
    correction: -4,
  }];
  const key = curveRowKey(rows[0]);
  const [locked] = applyCurveOverrides(rows, {
    [key]: { locked: true, outputTone: 43.5 },
  });

  assert.equal(locked.outputTone, 43.5);
  assert.equal(locked.productionOutputTone, 43.5);
  assert.equal(locked.correction, -6.5);
  assert.equal(locked.autoOutputTone, 46);
  assert.equal(locked.overrideLocked, true);
});

test("applyCurveOverrides unlocks rows without losing automatic output", () => {
  const [row] = applyCurveOverrides([{
    channel: "K",
    tone: 75,
    outputTone: 70,
    autoOutputTone: 72,
    overrideLocked: true,
  }], {});

  assert.equal(row.outputTone, 72);
  assert.equal(row.productionOutputTone, 72);
  assert.equal(row.correction, -3);
  assert.equal(row.autoOutputTone, 72);
  assert.equal(row.overrideLocked, false);
});

test("pruneCurveOverrides removes stale and invalid override keys", () => {
  const row = { channel: "M", tone: 25, outputTone: 23 };
  const key = curveRowKey(row);
  const pruned = pruneCurveOverrides([row], {
    [key]: { locked: true, outputTone: 24 },
    "C:50.000": { locked: true, outputTone: 40 },
    "M:75.000": { locked: false, outputTone: 70 },
    "K:50.000": { locked: true, outputTone: "bad" },
  });

  assert.deepEqual(pruned, { [key]: { locked: true, outputTone: 24 } });
});
