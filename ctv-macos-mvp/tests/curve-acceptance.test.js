import assert from "node:assert/strict";
import test from "node:test";

import { buildCurveAcceptance } from "../src/curve-acceptance.js";

test("buildCurveAcceptance summarizes RIP manual-entry reductions", () => {
  const report = buildCurveAcceptance([
    { channel: "C", tone: 50, measuredTone: 70, targetTone: 64, measuredTvi: 20, targetTvi: 14, tviDelta: 6, outputTone: 47, interpolated: false, metricName: "TVI", metricMethod: "reported_tone" },
    { channel: "C", tone: 75, measuredTone: 88, targetTone: 86, measuredTvi: 13, targetTvi: 11, tviDelta: 2, outputTone: 74, interpolated: true, metricName: "TVI", metricMethod: "interpolated_reported_tone" },
  ]);

  assert.equal(report.status, "Ready");
  assert.equal(report.reductions, 2);
  assert.equal(report.increases, 0);
  assert.equal(report.interpolated, 1);
  assert.equal(report.rows[0].action, "减少");
});

test("buildCurveAcceptance blocks production export when curve has danger issues", () => {
  const report = buildCurveAcceptance([
    { channel: "K", tone: 70, measuredTone: 86, targetTone: 83, measuredTvi: 16, targetTvi: 13, tviDelta: 3, outputTone: 68, metricName: "TVI", metricMethod: "reported_tone" },
  ], [
    { level: "danger", channel: "K", tone: 70, type: "反折", message: "K 70% 输出低于前一点" },
  ]);

  assert.equal(report.status, "Blocked");
  assert.equal(report.dangerCount, 1);
  assert.match(report.message, /不建议直接导出/);
});
