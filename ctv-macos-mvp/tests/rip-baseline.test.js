import assert from "node:assert/strict";
import test from "node:test";

import { calculateCompensation } from "../src/curve-engine.js";
import { validateExportCurve } from "../src/curve-validation.js";
import { addAppliedCurve, appliedCurveSnapshot, baselineCurvePoints, baselineFitsJob, baselineFromApplied, curvesNeedingPaperConfirmation, savedRunBaseline, withRunBaseline, confirmApplied, defaultBaseline, normalizeBaseline, unconfirmedCurvesForJob, withBaselineChannels } from "../src/rip-baseline.js";

const job = { customer: "示例客户", press: "示例印机", paper: "铜版纸" };
const gain = (tone, peak) => Math.min(100, tone + peak * Math.sin(Math.PI * tone / 100));
const measure = (channels, peak) => channels.flatMap((channel) => [10, 25, 40, 50, 75, 90].map((tone) => ({ channel, tone, measuredTone: gain(tone, peak) })));
const compute = (measurements, baseCurve) => calculateCompensation(measurements, { mode: "tvi", target: "isoA", smooth: "medium", limit: 18, compensationRatio: 1, baseCurve });

test("review #2: only curves confirmed as loaded in the RIP become the default baseline", () => {
  // Nothing exported yet: an auto-saved candidate must not become the baseline.
  assert.equal(defaultBaseline([], job).kind, "linear");
  const round1 = compute(measure(["C", "M", "Y", "K"], 20));
  const exported = addAppliedCurve([], appliedCurveSnapshot({ rows: round1, job, createdAt: "2026-11-25T01:00:00.000Z", id: "r1" }));
  // Exported but not confirmed: still linear.
  assert.equal(defaultBaseline(exported, job).kind, "linear");
  const applied = confirmApplied(exported, "r1");
  const baseline = defaultBaseline(applied, job);
  assert.equal(baseline.kind, "curve");
  assert.deepEqual(Object.keys(baseline.curvePoints).sort(), ["C", "K", "M", "Y"]);
});

test("review #2: a curve from another paper or press is not used as baseline", () => {
  const applied = confirmApplied(addAppliedCurve([], appliedCurveSnapshot({ rows: compute(measure(["C"], 20)), job, id: "x" })), "x");
  assert.equal(defaultBaseline(applied, job).kind, "curve");
  assert.equal(defaultBaseline(applied, { ...job, paper: "胶版纸" }).kind, "linear");
  assert.equal(defaultBaseline(applied, { ...job, press: "另一台" }).kind, "linear");
});

test("review #2: K-only retest keeps the previous C/M/Y curves in the full export", () => {
  const round1 = compute(measure(["C", "M", "Y", "K"], 20));
  const baseline = defaultBaseline(confirmApplied(addAppliedCurve([], appliedCurveSnapshot({ rows: round1, job, id: "r1" })), "r1"), job);
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
  const baseline = defaultBaseline(confirmApplied(addAppliedCurve([], appliedCurveSnapshot({ rows: round1, job, id: "r1" })), "r1"), job);
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
  let list = confirmApplied(addAppliedCurve([], appliedCurveSnapshot({ rows, job: jobA, id: "a" })), "a");
  list = confirmApplied(addAppliedCurve(list, appliedCurveSnapshot({ rows, job: jobB, id: "b" })), "b");
  assert.equal(list.length, 2);
  assert.equal(defaultBaseline(list, jobA).id, "a");
  // Re-exporting the same curve within one job still collapses to one record.
  list = addAppliedCurve(list, appliedCurveSnapshot({ rows, job: jobA, id: "a2" }));
  assert.deepEqual(list.map((item) => item.id), ["a2", "b"]);
});

test("round-3 S2: re-importing the same measurement never stacks on the curve computed from it", () => {
  // Codex case: export a curve, do not load it in the RIP, import the same CSV again.
  const measurements = measure(["C", "K"], 20);
  const fingerprint = "same-file";
  const round1 = compute(measurements);
  let list = addAppliedCurve([], appliedCurveSnapshot({ rows: round1, job, id: "r1", sourceFingerprint: fingerprint }));
  const reimport = defaultBaseline(list, job, { fingerprint });
  assert.equal(reimport.kind, "linear");
  const again = compute(measurements, baselineCurvePoints(reimport));
  const c50 = (rows) => rows.find((row) => row.channel === "C" && row.tone === 50).outputTone;
  assert.equal(c50(again), c50(round1));
  // Even after the curve is confirmed as loaded, it is not the baseline of its own source data…
  list = confirmApplied(list, "r1");
  assert.equal(defaultBaseline(list, job, { fingerprint }).kind, "linear");
  // …but it is for the next sheet (a different measurement).
  assert.equal(defaultBaseline(list, job, { fingerprint: "next-sheet" }).id, "r1");
});

test("round-3 S2: an unconfirmed export is offered, not defaulted; re-exporting keeps a confirmation", () => {
  const rows = compute(measure(["C"], 20));
  let list = addAppliedCurve([], appliedCurveSnapshot({ rows, job, id: "e1", sourceFingerprint: "m1" }));
  assert.deepEqual(unconfirmedCurvesForJob(list, job, { fingerprint: "m2" }).map((item) => item.id), ["e1"]);
  assert.deepEqual(unconfirmedCurvesForJob(list, job, { fingerprint: "m1" }), []);
  list = confirmApplied(list, "e1");
  list = addAppliedCurve(list, appliedCurveSnapshot({ rows, job, id: "e2", sourceFingerprint: "m1" }));
  assert.equal(list.length, 1);
  assert.ok(list[0].appliedAt);
});

test("round-4 S2: the same readings under another customer / press / paper never restore job A's curve", () => {
  const jobA = { customer: "A", press: "P1", paper: "Coated" };
  const jobB = { customer: "B", press: "P2", paper: "Uncoated" };
  const fingerprintOf = (run) => run.fp;
  const curveA = { ...baselineFromApplied(appliedCurveSnapshot({ rows: compute(measure(["K"], 20)), job: jobA, id: "a" })) };
  const runs = [
    // A stale save: job B's fields, but the curve still belongs to job A.
    { fp: "k-sheet", baseline: curveA, archive: { job: jobB, baseline: curveA } },
    { fp: "k-sheet", baseline: curveA, archive: { job: jobA, baseline: curveA } },
  ];
  assert.equal(savedRunBaseline(runs, jobA, "k-sheet", fingerprintOf).id, "a");
  assert.equal(savedRunBaseline(runs, jobB, "k-sheet", fingerprintOf), null);
  assert.equal(savedRunBaseline(runs, { ...jobA, paper: "Uncoated" }, "k-sheet", fingerprintOf), null);
  assert.equal(baselineFitsJob(curveA, jobB), false);
  assert.equal(baselineFitsJob({ kind: "linear" }, jobB), true);
});

test("round-4 S2: a confirmed baseline is written into the matching saved run at once", () => {
  const fingerprintOf = (run) => run.fp;
  const curve = baselineFromApplied(appliedCurveSnapshot({ rows: compute(measure(["C"], 20)), job, id: "c" }));
  const runs = [{ fp: "m1", baseline: { kind: "linear" }, archive: { job, baseline: { kind: "linear" } } }];
  const next = withRunBaseline(runs, job, "m1", fingerprintOf, curve);
  assert.equal(next[0].archive.baseline.id, "c");
  assert.equal(savedRunBaseline(next, job, "m1", fingerprintOf).id, "c");
  assert.equal(withRunBaseline(runs, job, "other", fingerprintOf, curve), null);
});

test("round-5 S2: a curve recorded with a blank paper is not auto-applied once the paper is filled in", () => {
  const blankPaper = { customer: "A", press: "P1", paper: "" };
  const filled = { ...blankPaper, paper: "铜版纸" };
  const list = confirmApplied(addAppliedCurve([], appliedCurveSnapshot({ rows: compute(measure(["K"], 20)), job: blankPaper, id: "old", sourceFingerprint: "m1" })), "old");
  assert.equal(defaultBaseline(list, filled, { fingerprint: "m2" }).kind, "linear");
  assert.deepEqual(curvesNeedingPaperConfirmation(list, filled, { fingerprint: "m2" }).map((item) => item.id), ["old"]);
  // Nor the other way round: a job whose paper is still blank.
  const known = confirmApplied(addAppliedCurve([], appliedCurveSnapshot({ rows: compute(measure(["K"], 20)), job: filled, id: "k", sourceFingerprint: "m1" })), "k");
  assert.equal(defaultBaseline(known, blankPaper, { fingerprint: "m2" }).kind, "linear");
  // Same known paper: still the default.
  assert.equal(defaultBaseline(known, filled, { fingerprint: "m2" }).id, "k");
});
