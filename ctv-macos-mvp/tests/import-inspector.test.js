import assert from "node:assert/strict";
import test from "node:test";

import { inspectImport } from "../src/import-inspector.js";

test("inspectImport reports channel tone coverage and usable metrics", () => {
  const report = inspectImport({
    importInfo: { sourceFormat: "CSV", fields: ["channel", "tone", "measured_tone"], rawRows: [] },
    measurements: [
      { channel: "C", tone: 25, measuredTone: 39 },
      { channel: "C", tone: 50, measuredTone: 70 },
      { channel: "M", tone: 50, measuredTone: 68 },
    ],
    mode: "tvi",
  });

  assert.equal(report.kind, "measurement");
  assert.equal(report.usableCount, 3);
  assert.deepEqual(report.channels, ["C", "M"]);
  assert.ok(report.coverageRows.find((row) => row.channel === "C").required[25]);
  assert.ok(report.messages.some((message) => message.includes("25/50/75")));
});

test("inspectImport treats P2P51 tone gaps as interpolation notes", () => {
  const rawRows = Array.from({ length: 300 }, (_, index) => ({
    cmyk_c: index % 12 === 0 ? 100 : 0,
    cmyk_m: index % 12 === 1 ? 100 : 0,
    cmyk_y: index % 12 === 2 ? 100 : 0,
    cmyk_k: index % 12 === 3 ? 100 : 0,
    lab_l: 50,
    lab_a: 0,
    lab_b: 0,
  }));
  const report = inspectImport({
    importInfo: { sourceFormat: "CGATS/IT8", fields: ["cmyk_c", "cmyk_m", "cmyk_y", "cmyk_k", "lab_l", "lab_a", "lab_b"], rawRows },
    measurements: [
      { channel: "C", tone: 50, measuredTone: 70, lab: { l: 50, a: 0, b: 0 } },
      { channel: "M", tone: 50, measuredTone: 68, lab: { l: 50, a: 0, b: 0 } },
      { channel: "Y", tone: 50, measuredTone: 65, lab: { l: 50, a: 0, b: 0 } },
      { channel: "K", tone: 25, measuredTone: 40, lab: { l: 50, a: 0, b: 0 } },
      { channel: "K", tone: 50, measuredTone: 70, lab: { l: 50, a: 0, b: 0 } },
      { channel: "K", tone: 75, measuredTone: 90, lab: { l: 50, a: 0, b: 0 } },
    ],
    mode: "tvi",
  });

  assert.equal(report.kind, "p2p_measurement");
  assert.equal(report.level, "pass");
  assert.equal(report.messages.length, 0);
  assert.ok(report.notes.some((message) => message.includes("插值生成")));
});

test("inspectImport identifies reference-only P2P data", () => {
  const report = inspectImport({
    importInfo: {
      sourceFormat: "CGATS/IT8",
      fields: ["cmyk_c", "cmyk_m", "cmyk_y", "cmyk_k"],
      rawRows: [
        { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0 },
        { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 25 },
      ],
      warnings: ["Imported patches do not contain measurement data."],
    },
    measurements: [],
  });

  assert.equal(report.kind, "reference");
  assert.equal(report.canCalculateCurve, false);
  assert.ok(report.messages.some((message) => message.includes("P2P/CGATS")));
});
