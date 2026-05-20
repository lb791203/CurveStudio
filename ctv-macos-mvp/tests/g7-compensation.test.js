import assert from "node:assert/strict";
import test from "node:test";

import { buildG7Compensation, invertMeasuredToneForTargetL } from "../src/g7-compensation.js";

test("invertMeasuredToneForTargetL finds the measured tone that matches target L*", () => {
  const rows = [
    { tone: 30, measuredL: 42, targetL: 49.3 },
    { tone: 40, measuredL: 28.4, targetL: 38.3 },
    { tone: 50, measuredL: 20, targetL: 28.4 },
  ];
  assert.equal(invertMeasuredToneForTargetL(rows, 28.4, 50), 40);
});

test("buildG7Compensation recommends reducing K when current NPDC is too dark", () => {
  const preview = buildG7Compensation({
    g7: {
      status: "Fail",
      npdcVerification: [
        { tone: 40, measuredL: 28.4, targetL: 38.3, deltaL: -9.9, weightedDeltaL: 9.9, measuredNpdc: 1.2, targetNpdc: 0.8 },
        { tone: 50, measuredL: 20, targetL: 28.4, deltaL: -8.4, weightedDeltaL: 8.4, measuredNpdc: 1.6, targetNpdc: 1.2 },
      ],
      grayVerification: [],
    },
    baseRows: [{ channel: "K", tone: 50, outputTone: 45, measuredTone: 68, targetTone: 64, metricName: "TVI" }],
    ratio: 0.5,
    limit: 12,
  });

  const k50 = preview.rows.find((row) => row.channel === "K" && row.tone === 50);
  assert.equal(preview.status, "Preview");
  assert.equal(k50.action, "减少");
  assert.equal(k50.g7ReferenceOutput, 45);
  assert.equal(k50.outputTone, 45);
});

test("buildG7Compensation recommends increasing K when current NPDC is too light", () => {
  const preview = buildG7Compensation({
    g7: {
      status: "Fail",
      npdcVerification: [
        { tone: 50, measuredL: 40, targetL: 28.4, deltaL: 11.6, weightedDeltaL: 11.6, measuredNpdc: 0.8, targetNpdc: 1.2 },
        { tone: 70, measuredL: 28.4, targetL: 14.8, deltaL: 13.6, weightedDeltaL: 9.52, measuredNpdc: 1.2, targetNpdc: 1.8 },
      ],
      grayVerification: [],
    },
    baseRows: [{ channel: "K", tone: 50, outputTone: 52, measuredTone: 58, targetTone: 64, metricName: "TVI" }],
    ratio: 50,
    limit: 30,
  });

  const k50 = preview.rows.find((row) => row.channel === "K" && row.tone === 50);
  assert.equal(k50.action, "增加");
  assert.equal(k50.g7ReferenceOutput, 60);
  assert.equal(k50.outputTone, 52);
});

test("buildG7Compensation caps large moves with the point limit", () => {
  const preview = buildG7Compensation({
    g7: {
      status: "Fail",
      npdcVerification: [
        { tone: 10, measuredL: 90, targetL: 76.7, deltaL: 13.3, weightedDeltaL: 13.3 },
        { tone: 60, measuredL: 76.7, targetL: 20.1, deltaL: 56.6, weightedDeltaL: 45.28 },
      ],
      grayVerification: [],
    },
    baseRows: [{ channel: "K", tone: 10, outputTone: 8, metricName: "TVI" }],
    ratio: 1,
    limit: 12,
  });

  const k10 = preview.rows.find((row) => row.channel === "K" && row.tone === 10);
  assert.equal(k10.g7ReferenceOutput, 22);
  assert.equal(k10.outputTone, 8);
});

test("buildG7Compensation does not emit common CMY output rows", () => {
  const preview = buildG7Compensation({
    g7: {
      status: "Fail",
      npdcVerification: [],
      grayVerification: [
        { label: "HR50", tone: 50, measuredL: 32, targetL: 28.4, deltaL: 3.6, weightedDeltaL: 3.6, a: 4.2, b: -4.5 },
        { label: "HR60", tone: 60, measuredL: 28.4, targetL: 20.1, deltaL: 8.3, weightedDeltaL: 6.64, a: 1, b: 1 },
      ],
    },
    baseRows: [
      { channel: "C", tone: 50, outputTone: 45, metricName: "TVI" },
      { channel: "M", tone: 50, outputTone: 46, metricName: "TVI" },
      { channel: "Y", tone: 50, outputTone: 44, metricName: "TVI" },
    ],
  });

  assert.equal(preview.rows.some((row) => row.channel === "CMY"), false);
  const c50 = preview.rows.find((row) => row.channel === "C" && row.tone === 50);
  assert.match(c50.hint, /偏红\/偏品/);
  assert.match(c50.hint, /偏蓝/);
  assert.equal(c50.outputTone, 45);
});

test("buildG7Compensation blocks when G7 data is unavailable", () => {
  const preview = buildG7Compensation();
  assert.equal(preview.status, "Blocked");
  assert.equal(preview.rows.length, 0);
});
