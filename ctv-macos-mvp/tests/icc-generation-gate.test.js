import assert from "node:assert/strict";
import test from "node:test";

import { buildCharacterizationCoverage, buildIccGenerationGate } from "../src/icc-generation-gate.js";

test("ICC gate blocks a first measurement run", () => {
  const gate = buildIccGenerationGate({
    runs: [run({ name: "Run1" })],
    standard: standard(),
  });

  assert.equal(gate.status, "Blocked");
  assert.ok(gate.checks.some((item) => item.id === "run_sequence" && item.status === "fail"));
});

test("ICC gate reaches ready for a compensated re-measurement with enough data", () => {
  const previous = run({ name: "Before", avgTviDelta: 8, maxDeltaE: 3.2, g7Status: "Fail" });
  const latest = run({ name: "After", avgTviDelta: 1.8, maxTviDelta: 4.2, maxDeltaE: 3.1, g7Status: "Pass" });
  const gate = buildIccGenerationGate({
    runs: [latest, previous],
    standard: standard(),
  });

  assert.equal(gate.status, "Ready");
  assert.equal(gate.coverage.patchCount, 300);
  assert.ok(gate.checks.every((item) => item.required === false || item.status === "pass"));
});

test("ICC gate blocks when G7 is enabled but not passed", () => {
  const previous = run({ name: "Before", avgTviDelta: 8, g7Status: "Fail" });
  const latest = run({ name: "After", avgTviDelta: 1.8, maxDeltaE: 3.1, g7Status: "Warning" });
  const gate = buildIccGenerationGate({
    runs: [latest, previous],
    standard: standard(),
  });

  assert.equal(gate.status, "Blocked");
  assert.ok(gate.checks.some((item) => item.id === "g7" && item.status === "fail"));
});

test("characterization coverage detects P2P essentials", () => {
  const coverage = buildCharacterizationCoverage({ importInfo: { rawRows: p2pRows() } });

  assert.equal(coverage.paper, 1);
  assert.equal(coverage.solidChannels.size, 4);
  assert.ok(coverage.overprintTypes.size >= 3);
  assert.equal(coverage.labPatchCount, 300);
});

function run({ name, avgTviDelta = 2, maxTviDelta = 4, maxDeltaE = 3, g7Status = "Pass" } = {}) {
  return {
    name,
    createdAt: name,
    measurements: 300,
    results: 60,
    metrics: {
      avgTviDelta,
      maxTviDelta,
      maxDeltaE,
      g7Status,
      curveWarnings: 0,
      curveDangers: 0,
      curveQualityStatus: "Ready",
      channelTvi: { C: avgTviDelta, M: avgTviDelta, Y: avgTviDelta, K: avgTviDelta },
    },
    g7Status,
    archive: {
      measurements: Array.from({ length: 60 }, (_, index) => ({ channel: "C", tone: index })),
      results: Array.from({ length: 60 }, (_, index) => ({ channel: "C", tone: index, tviDelta: avgTviDelta })),
      importInfo: { rawRows: p2pRows() },
      labVerification: [{ deltaE: maxDeltaE }],
      g7: { status: g7Status },
      curveQuality: { status: "Ready", warnings: 0, dangers: 0 },
    },
  };
}

function standard() {
  return {
    name: "GRACoL2013 CRPC6",
    deltaE: { fail: 4.2 },
    g7: { enabled: true },
  };
}

function p2pRows() {
  const essentials = [
    [0, 0, 0, 0],
    [100, 0, 0, 0],
    [0, 100, 0, 0],
    [0, 0, 100, 0],
    [0, 0, 0, 100],
    [100, 100, 0, 0],
    [100, 0, 100, 0],
    [0, 100, 100, 0],
    [100, 100, 100, 0],
  ];
  const rows = essentials.map(row);
  for (let i = rows.length; i < 300; i += 1) {
    const c = (i * 7) % 101;
    const m = (i * 11) % 101;
    const y = (i * 13) % 101;
    const k = i % 5 === 0 ? (i * 17) % 101 : 0;
    rows.push(row([c, m, y, k], `P${i}`));
  }
  return rows;
}

function row([c, m, y, k], name = "") {
  return {
    sample_name: name,
    cmyk_c: c,
    cmyk_m: m,
    cmyk_y: y,
    cmyk_k: k,
    lab_l: 95 - (c + m + y + k) / 5,
    lab_a: c - m,
    lab_b: y - k,
  };
}
