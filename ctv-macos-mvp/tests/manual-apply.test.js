import assert from "node:assert/strict";
import test from "node:test";

import { buildManualMeasurementSet } from "../src/manual-apply.js";
import { parseImportText } from "../src/curve-engine.js";

const row = (fields) => ({ patchType: "tone", channel: "C", tone: "", measuredTone: "", density: "", labL: "", labA: "", labB: "", ...fields });

test("re-review M5: a tone row with a blank density is accepted (blank is not invalid)", () => {
  const set = buildManualMeasurementSet([row({ tone: "50", measuredTone: "60" })]);
  assert.deepEqual(set.rejected, []);
  assert.equal(set.measurements.length, 1);
  assert.equal(set.measurements[0].measuredTone, 60);
  assert.equal(set.measurements[0].density, undefined);
});

test("re-review M5: a rejected duplicate (C 50 → 200) is not stored next to the valid C 50 → 60", () => {
  const set = buildManualMeasurementSet([
    row({ tone: "50", measuredTone: "60", density: "0.6" }),
    row({ tone: "50", measuredTone: "200", density: "0.6" }),
  ]);
  assert.equal(set.rejected.length, 1);
  assert.match(set.rejected[0], /第 2 行/);
  assert.deepEqual(set.measurements.map((item) => item.measuredTone), [60]);
  assert.deepEqual(set.acceptedRows.map((item) => item.measuredTone), [60]);
});

test("re-review M5: text in a number cell and out-of-range tone are rejected, not blanked or clamped", () => {
  const set = buildManualMeasurementSet([
    row({ tone: "50", measuredTone: "60", density: "abc" }),
    row({ tone: "130", measuredTone: "100", density: "0.8" }),
    row({ tone: "40", measuredTone: "52" }),
  ]);
  assert.equal(set.rejected.length, 2);
  assert.deepEqual(set.measurements.map((item) => item.tone), [40]);
});

test("re-review M5: an imported 130 % patch with a valid density is rejected, not clamped to 100 %", () => {
  const text = ["channel,tone,measured_tone,density", "C,50,64,0.6", "C,130,100,1.4"].join("\n");
  const info = parseImportText(text);
  assert.ok(info.measurements.every((item) => item.tone <= 100));
  assert.ok(!info.measurements.some((item) => item.tone === 100));
  assert.ok(info.warnings.some((item) => /130/.test(item)));
});
