import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMeasurementQueue,
  calibrateDeviceState,
  changeDeviceAdapterState,
  connectDeviceState,
  disconnectDeviceState,
  mockReadPatch,
  readDevicePatchState,
  summarizeDeviceState,
} from "../src/device-adapter.js";

test("buildMeasurementQueue includes press and G7 patches", () => {
  const queue = buildMeasurementQueue("g7");
  assert.ok(queue.some((item) => item.patchType === "paper"));
  assert.ok(queue.some((item) => item.channel === "K" && item.tone === 75));
  assert.ok(queue.some((item) => item.patchType === "gray"));
  assert.ok(queue.some((item) => item.channel === "CMY"));
});

test("mockReadPatch returns manual-table compatible instrument row", () => {
  const item = { patchType: "tone", channel: "C", tone: 50, label: "C 50%" };
  const row = mockReadPatch(item, 2);

  assert.equal(row.source, "仪器测量");
  assert.equal(row.channel, "C");
  assert.equal(row.tone, 50);
  assert.ok(Number.isFinite(row.measuredTone));
  assert.ok(Number.isFinite(row.labL));
  assert.match(row.note, /模拟读取 C 50%/);
});

test("summarizeDeviceState exposes adapter workflow state", () => {
  const queue = buildMeasurementQueue("press-basic");
  const summary = summarizeDeviceState({
    adapterId: "mock",
    connected: true,
    calibrated: true,
    queue,
    queueIndex: 3,
  }, [
    { source: "仪器测量" },
    { source: "手动" },
  ]);

  assert.equal(summary.adapter.id, "mock");
  assert.equal(summary.connected, true);
  assert.equal(summary.calibrated, true);
  assert.equal(summary.measured, 3);
  assert.equal(summary.total, queue.length);
  assert.equal(summary.canReadPatch, true);
  assert.equal(summary.manualInstrumentRows, 1);
});

test("device state transitions cover mock workflow and blocked SDK", () => {
  let device = changeDeviceAdapterState({ queue: buildMeasurementQueue("press-basic"), queueIndex: 0 }, "sdk");
  assert.equal(device.connected, false);
  assert.match(device.message, /SDK/);

  device = changeDeviceAdapterState(device, "mock");
  device = connectDeviceState(device);
  assert.equal(device.connected, true);
  device = calibrateDeviceState(device);
  assert.equal(device.calibrated, true);

  const result = readDevicePatchState(device);
  assert.ok(result.row);
  assert.equal(result.device.queueIndex, 1);

  device = disconnectDeviceState(result.device);
  assert.equal(device.connected, false);
  assert.equal(device.calibrated, false);
});
