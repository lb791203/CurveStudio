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
