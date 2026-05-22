import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { g7Preview } from "../src/analysis-engine.js";
import { calculateCompensation, parseImportText } from "../src/curve-engine.js";
import { buildPatchMap } from "../src/standards.js";

const fieldFixtures = [
  "reference-data/measurements/kba162-shenghui/kba162-p2p51-curve5-run1.txt",
  "reference-data/measurements/kba162-shenghui/kba162-p2p51-curve5-run2.txt",
];

test("KBA162 Curve5 P2P51 field scans parse into CTV-capable measurements", async () => {
  for (const fixture of fieldFixtures) {
    const parsed = await parseFixture(fixture);
    const results = calculateCompensation(parsed.measurements, {
      mode: "ctv",
      target: "linear",
      compensationRatio: 50,
      smooth: 0,
      limit: 18,
    });

    assert.equal(parsed.sourceFormat, "CGATS/IT8");
    assert.equal(parsed.rawRows.length, 300);
    assert.equal(parsed.measurements.length, 60);
    assert.equal(results.length, 60);
    assert.ok(parsed.measurements.every((row) => Number.isFinite(row.colorimetricTone)));
  }
});

test("KBA162 Curve5 P2P51 field scans can contribute raw Lab rows to G7 preview", async () => {
  const parsed = await parseFixture(fieldFixtures[0]);
  const standard = await parseFixture("reference-data/standards/cgats21-iso15339/CGATS21-2-CRPC6.txt");
  const preview = g7Preview({
    measurements: parsed.measurements,
    results: calculateCompensation(parsed.measurements, {
      mode: "ctv",
      target: "linear",
      compensationRatio: 50,
      smooth: 0,
      limit: 18,
    }),
    rawRows: parsed.rawRows,
    metadata: parsed.metadata,
    standardPatchMap: buildPatchMap(standard.rawRows),
    deltaEFormula: "de76",
  });

  assert.equal(preview.p2pPatchCount, 300);
  assert.equal(preview.kOnlyCount, 23);
  assert.ok(preview.labPatchCount > 0);
  assert.ok(preview.grayPatchCount >= 3);
  assert.ok(preview.colorspaceRows.some((row) => row.status !== "Missing"));
  assert.equal(preview.npdcVerification.find((row) => row.tone === 50)?.targetSource, "standard");
  assert.ok(preview.npdcVerification.find((row) => row.tone === 50)?.targetL > 55);
});

async function parseFixture(fixture) {
  const text = await readFile(path.resolve(fixture), "utf8");
  return parseImportText(text);
}
