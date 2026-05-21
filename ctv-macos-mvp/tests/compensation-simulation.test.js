import assert from "node:assert/strict";
import test from "node:test";

import { buildCompensationSimulation, summarizeCompensationSimulation } from "../src/compensation-simulation.js";

test("buildCompensationSimulation estimates corrected output against the measured press curve", () => {
  const rows = [
    row({ tone: 0, measuredTone: 0, targetTone: 0, outputTone: 0 }),
    row({ tone: 25, measuredTone: 40, targetTone: 35, outputTone: 20 }),
    row({ tone: 50, measuredTone: 70, targetTone: 66, outputTone: 46 }),
    row({ tone: 75, measuredTone: 90, targetTone: 86, outputTone: 70 }),
    row({ tone: 100, measuredTone: 100, targetTone: 100, outputTone: 100 }),
  ];

  const simulation = buildCompensationSimulation(rows);
  const mid = simulation.find((item) => item.tone === 50);

  assert.ok(mid);
  assert.ok(mid.simulatedTone < mid.measuredTone);
  assert.ok(Math.abs(mid.afterDelta) < Math.abs(mid.beforeDelta));
  assert.equal(mid.status, "Pass");
});

test("summarizeCompensationSimulation reports incomplete data without pretending validation", () => {
  const simulation = buildCompensationSimulation([
    { channel: "C", tone: 50, measuredTone: 70, targetTone: 66 },
  ]);
  const summary = summarizeCompensationSimulation(simulation);

  assert.equal(simulation.length, 0);
  assert.equal(summary.status, "Data Incomplete");
  assert.equal(summary.total, 0);
});

function row(values) {
  return {
    channel: "K",
    metricName: "TVI",
    metricMethod: "murray_davies_density",
    pointSource: "measured",
    ...values,
  };
}
