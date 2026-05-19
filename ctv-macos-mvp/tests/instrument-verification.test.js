import assert from "node:assert/strict";
import test from "node:test";

import { buildInstrumentVerificationRows, summarizeInstrumentVerification } from "../src/instrument-verification.js";

test("instrument verification compares software and instrument CTV", () => {
  const rows = buildInstrumentVerificationRows([
    { channel: "C", tone: 50, sampleId: "C50", colorimetricTone: 50.4, colorimetricMethod: "iso_20654_lab", instrumentCtv: 50.1, instrumentCtvMethod: "ctv" },
    { channel: "C", tone: 75, sampleId: "C75", colorimetricTone: 74.2, colorimetricMethod: "iso_20654_lab", instrumentCtv: 75.5, instrumentCtvMethod: "ctv" },
    { channel: "M", tone: 50, sampleId: "M50", colorimetricTone: 51.2, colorimetricMethod: "iso_20654_lab" },
  ]);
  const summary = summarizeInstrumentVerification(rows);

  assert.equal(rows[0].status, "Pass");
  assert.equal(rows[1].status, "Fail");
  assert.equal(rows[2].status, "Missing Instrument CTV");
  assert.equal(summary.total, 3);
  assert.equal(summary.comparable, 2);
  assert.equal(summary.pass, 1);
  assert.equal(summary.fail, 1);
  assert.equal(summary.missingInstrument, 1);
});
