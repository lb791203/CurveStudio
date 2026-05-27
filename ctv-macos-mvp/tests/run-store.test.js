import assert from "node:assert/strict";
import test from "node:test";

import { compactProjectArchiveForRun } from "../src/run-store.js";

test("compactProjectArchiveForRun keeps restore data but drops bulky raw import payload", () => {
  const rawRows = Array.from({ length: 60 }, (_, index) => ({
    sample_name: `A${index + 1}`,
    spectral_400: index,
    spectral_410: index + 1,
  }));
  const archive = {
    job: { customer: "Demo" },
    standard: { id: "gracol2013_crpc6", name: "GRACoL2013 CRPC6" },
    importInfo: { sourceFormat: "P2P51", rawRows, warnings: [] },
    rawInput: "CGATS\n".repeat(5000),
    measurements: [{ channel: "K", tone: 50, measuredTone: 75 }],
    results: [{ channel: "K", inputTone: 50, outputTone: 46 }],
    labVerification: [{ label: "Paper", lab: { l: 95, a: 1, b: -4 } }],
  };

  const compact = compactProjectArchiveForRun(archive);

  assert.equal(compact.measurements.length, 1);
  assert.equal(compact.results.length, 1);
  assert.equal(compact.labVerification.length, 1);
  assert.equal(compact.importInfo.rawRowCount, 60);
  assert.equal(compact.importInfo.rawRows.length, 24);
  assert.equal(compact.importInfo.rawRowsCompacted, true);
  assert.equal(compact.rawInputCompacted, true);
  assert.ok(compact.rawInput.length <= 1000);
});
