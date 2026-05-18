import assert from "node:assert/strict";
import test from "node:test";

import { buildRunMetrics, compareRuns, formatMetricChange } from "../src/run-compare.js";

test("buildRunMetrics captures TVI, Lab, G7 and curve quality metrics", () => {
  const metrics = buildRunMetrics({
    results: [
      { channel: "C", tone: 50, tviDelta: 6 },
      { channel: "K", tone: 50, tviDelta: 10 },
    ],
    labRows: [{ deltaE: 3 }, { deltaE: 5 }],
    g7: {
      status: "Warning",
      conclusion: {
        title: "G7 接近边界，建议复核后再放行",
        level: "warning",
        summary: "Weighted ΔE",
        priorityItems: ["Warning: Weighted ΔE"],
      },
      weightedAverage: 2.4,
      maxNpdcDelta: 4.5,
      maxGrayCh: 3.2,
    },
    curveQuality: { status: "Ready", warnings: 0, dangers: 0 },
  });

  assert.equal(metrics.avgTviDelta, 8);
  assert.equal(metrics.maxDeltaE, 5);
  assert.equal(metrics.g7Status, "Warning");
  assert.equal(metrics.g7ConclusionTitle, "G7 接近边界，建议复核后再放行");
  assert.deepEqual(metrics.g7PriorityItems, ["Warning: Weighted ΔE"]);
  assert.equal(metrics.channelTvi.C, 6);
  assert.equal(metrics.channelTvi.K, 10);
});

test("compareRuns marks lower error metrics as improved", () => {
  const previous = {
    createdAt: "Run1",
    metrics: {
      avgTviDelta: 8,
      maxDeltaE: 5,
      g7WeightedAverage: 3,
      g7MaxNpdcDelta: 6,
      g7MaxGrayCh: 4,
      curveWarnings: 2,
      curveDangers: 1,
      g7Status: "Fail",
      g7ConclusionTitle: "G7 未通过，需修正后复测",
      g7PriorityItems: ["Fail: 灰平衡最大 Ch", "Fail: 最大 ΔE"],
      curveQualityStatus: "Warning",
      channelTvi: { C: 8, M: 6, Y: 4, K: 10 },
    },
  };
  const latest = {
    createdAt: "Run2",
    metrics: {
      avgTviDelta: 4,
      maxDeltaE: 3,
      g7WeightedAverage: 1.5,
      g7MaxNpdcDelta: 2,
      g7MaxGrayCh: 2,
      curveWarnings: 0,
      curveDangers: 0,
      g7Status: "Pass",
      g7ConclusionTitle: "G7 预检通过",
      g7PriorityItems: [],
      curveQualityStatus: "Ready",
      channelTvi: { C: 4, M: 5, Y: 3, K: 6 },
    },
  };
  const compare = compareRuns(latest, previous);

  assert.equal(compare.avgTviDelta.direction, "improved");
  assert.equal(compare.g7StatusChange.direction, "improved");
  assert.match(compare.g7ConclusionText, /G7 未通过/);
  assert.match(compare.g7PriorityText, /已解决: Fail: 灰平衡最大 Ch/);
  assert.equal(compare.curveDangers.direction, "improved");
  assert.equal(compare.channelRows.find((row) => row.channel === "K").change.direction, "improved");
  assert.match(formatMetricChange(compare.avgTviDelta, "%"), /8.00% -> 4.00%/);
});
