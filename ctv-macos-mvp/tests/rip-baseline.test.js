import assert from "node:assert/strict";
import test from "node:test";

import { calculateCompensation } from "../src/curve-engine.js";
import { validateExportCurve } from "../src/curve-validation.js";
import { addAppliedCurve, appliedCurveSnapshot, baselineCurvePoints, defaultBaseline, normalizeBaseline, withBaselineChannels } from "../src/rip-baseline.js";

const job = { customer: "示例客户", press: "示例印机", paper: "铜版纸" };
const gain = (tone, peak) => Math.min(100, tone + peak * Math.sin(Math.PI * tone / 100));
const measure = (channels, peak) => channels.flatMap((channel) => [10, 25, 40, 50, 75, 90].map((tone) => ({ channel, tone, measuredTone: gain(tone, peak) })));
const compute = (measurements, baseCurve) => calculateCompensation(measurements, { mode: "tvi", target: "isoA", smooth: "medium", limit: 18, compensationRatio: 1, baseCurve });

test("review #2: only curves exported to the RIP become the default baseline", () => {
  // Nothing exported yet: an auto-saved candidate must not become the baseline.
  assert.equal(defaultBaseline([], job).kind, "linear");
  const round1 = compute(measure(["C", "M", "Y", "K"], 20));
  const applied = addAppliedCurve([], appliedCurveSnapshot({ rows: round1, job, createdAt: "2026-11-25T01:00:00.000Z" }));
  const baseline = defaultBaseline(applied, job);
  assert.equal(baseline.kind, "curve");
  assert.deepEqual(Object.keys(baseline.curvePoints).sort(), ["C", "K", "M", "Y"]);
});

test("review #2: a curve from another paper or press is not used as baseline", () => {
  const applied = addAppliedCurve([], appliedCurveSnapshot({ rows: compute(measure(["C"], 20)), job }));
  assert.equal(defaultBaseline(applied, { ...job, paper: "胶版纸" }).kind, "linear");
  assert.equal(defaultBaseline(applied, { ...job, press: "另一台" }).kind, "linear");
});

test("review #2: K-only retest keeps the previous C/M/Y curves in the full export", () => {
  const round1 = compute(measure(["C", "M", "Y", "K"], 20));
  const baseline = defaultBaseline(addAppliedCurve([], appliedCurveSnapshot({ rows: round1, job })), job);
  const round2 = compute(measure(["K"], 4), baselineCurvePoints(baseline));
  const exportRows = withBaselineChannels(round2, baseline);
  assert.deepEqual([...new Set(exportRows.map((row) => row.channel))].sort(), ["C", "K", "M", "Y"]);
  const c50 = exportRows.find((row) => row.channel === "C" && row.tone === 50);
  const c50Round1 = round1.find((row) => row.channel === "C" && row.tone === 50);
  assert.ok(Math.abs(c50.outputTone - c50Round1.outputTone) < 0.001);
  assert.equal(validateExportCurve(exportRows).ok, true);
});

test("review #2: the baseline snapshot survives save/reopen unchanged", () => {
  const round1 = compute(measure(["C", "K"], 20));
  const baseline = defaultBaseline(addAppliedCurve([], appliedCurveSnapshot({ rows: round1, job })), job);
  const reopened = normalizeBaseline(JSON.parse(JSON.stringify(baseline)));
  assert.deepEqual(reopened.curvePoints, baseline.curvePoints);
  // A newer exported curve does not change what the reopened run stacks on.
  const round2 = compute(measure(["C", "K"], 4), baselineCurvePoints(reopened));
  const again = compute(measure(["C", "K"], 4), baselineCurvePoints(normalizeBaseline(JSON.parse(JSON.stringify(reopened)))));
  assert.deepEqual(again.map((row) => row.outputTone), round2.map((row) => row.outputTone));
  assert.equal(normalizeBaseline(undefined).kind, "linear");
});

test("re-review S2: the same curve exported for another job does not drop the first job's record", () => {
  const rows = compute(measure(["C"], 20));
  const jobA = { customer: "A", press: "P1", paper: "Coated" };
  const jobB = { customer: "B", press: "P2", paper: "Coated" };
  let list = addAppliedCurve([], appliedCurveSnapshot({ rows, job: jobA, id: "a" }));
  list = addAppliedCurve(list, appliedCurveSnapshot({ rows, job: jobB, id: "b" }));
  assert.equal(list.length, 2);
  assert.equal(defaultBaseline(list, jobA).id, "a");
  // Re-exporting the same curve within one job still collapses to one record.
  list = addAppliedCurve(list, appliedCurveSnapshot({ rows, job: jobA, id: "a2" }));
  assert.deepEqual(list.map((item) => item.id), ["a2", "b"]);
});
