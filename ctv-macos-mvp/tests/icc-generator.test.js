import assert from "node:assert/strict";
import test from "node:test";

import {
  getScatteredPoints,
  interpolateLabIDW,
  labToXyz,
  generateIccProfile,
  exportMeasurementToCgats,
  buildIccExportPackage
} from "../src/icc-generator.js";
import { parseIccProfile } from "../src/icc-profile.js";

test("getScatteredPoints extracts and deduplicates CMYK -> Lab points", () => {
  const run = {
    archive: {
      measurements: [
        { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 95, lab_a: 0, lab_b: -2 },
        { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 55, lab_a: -38, lab_b: -48 },
        // duplicate should be skipped:
        { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 56, lab_a: -39, lab_b: -49 },
      ],
      labVerification: [
        { cmyk: { c: 0, m: 100, y: 0, k: 0 }, lab: { l: 48, a: 72, b: -3 } }
      ]
    }
  };

  const points = getScatteredPoints(run);
  assert.equal(points.length, 3);
  assert.deepEqual(points[0], { cmyk: { c: 0, m: 100, y: 0, k: 0 }, lab: { l: 48, a: 72, b: -3 } });
  assert.deepEqual(points[1], { cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 95, a: 0, b: -2 } });
  assert.deepEqual(points[2], { cmyk: { c: 100, m: 0, y: 0, k: 0 }, lab: { l: 55, a: -38, b: -48 } });
});

test("interpolateLabIDW performs 4D IDW interpolation", () => {
  const scattered = [
    { cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 90, a: 0, b: 0 } },
    { cmyk: { c: 100, m: 0, y: 0, k: 0 }, lab: { l: 50, a: -40, b: -50 } }
  ];

  // Exact match
  const exact = interpolateLabIDW({ c: 100, m: 0, y: 0, k: 0 }, scattered);
  assert.deepEqual(exact, { l: 50, a: -40, b: -50 });

  // In-between match
  const middle = interpolateLabIDW({ c: 50, m: 0, y: 0, k: 0 }, scattered);
  assert.ok(middle.l > 50 && middle.l < 90);
  assert.ok(middle.a < 0 && middle.a > -40);
  assert.ok(middle.b < 0 && middle.b > -50);
});

test("labToXyz converts Lab to XYZ coordinates under D50 white point", () => {
  const whiteLab = { l: 100, a: 0, b: 0 };
  const whiteXyz = labToXyz(whiteLab);
  assert.ok(Math.abs(whiteXyz.x - 0.96422) < 0.001);
  assert.ok(Math.abs(whiteXyz.y - 1.0) < 0.001);
  assert.ok(Math.abs(whiteXyz.z - 0.82521) < 0.001);
});

test("generateIccProfile roundtrip generates valid profile and parses back successfully", () => {
  const run = {
    archive: {
      measurements: [
        { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 95, lab_a: 0, lab_b: -2 },
        { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 55, lab_a: -38, lab_b: -48 },
        { cmyk_c: 0, cmyk_m: 100, y: 0, k: 0, lab_l: 48, lab_a: 72, lab_b: -3 },
        { cmyk_c: 0, cmyk_m: 0, cmyk_y: 100, k: 0, lab_l: 85, lab_a: -4, lab_b: 85 },
        { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 100, lab_l: 16, lab_a: 0, lab_b: 1 },
      ]
    }
  };

  const buffer = generateIccProfile(run);
  assert.equal(buffer.byteLength, 21844);

  // Parse it back end-to-end!
  const profile = parseIccProfile(buffer, { fileName: "CTVGenerated.icc" });
  assert.equal(profile.fileName, "CTVGenerated.icc");
  assert.equal(profile.profileName, "CTV-Experimental-Draft");
  assert.equal(profile.version, "2.1.0");
  assert.equal(profile.colorSpace, "CMYK");
  assert.equal(profile.pcs, "Lab");
  assert.equal(profile.deviceClass, "output");
  assert.equal(profile.copyright, "Copyright (C) 2026 FM PRINT. All rights reserved.");
  assert.ok(profile.mediaWhitePoint);
  assert.ok(Math.abs(profile.mediaWhitePoint.l - 95) < 0.5);

  // Verify A2B tags were correctly registered
  assert.ok(profile.tags.includes("A2B0"));
  assert.ok(profile.tags.includes("A2B1"));
  assert.ok(profile.tags.includes("A2B2"));
});

test("exportMeasurementToCgats generates correct CGATS format string", () => {
  const run = {
    archive: {
      measurements: [
        { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 95, lab_a: 0, lab_b: -2 },
        { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 55, lab_a: -38, lab_b: -48 }
      ]
    }
  };

  const cgatsText = exportMeasurementToCgats(run);
  assert.ok(cgatsText.includes("CGATS.17"));
  assert.ok(cgatsText.includes("NUMBER_OF_FIELDS 8"));
  assert.ok(cgatsText.includes("SAMPLE_ID CMYK_C CMYK_M CMYK_Y CMYK_K LAB_L LAB_A LAB_B"));
  assert.ok(cgatsText.includes("NUMBER_OF_SETS 2"));
  assert.ok(cgatsText.includes("1 0.00 0.00 0.00 0.00 95.00 0.00 -2.00"));
  assert.ok(cgatsText.includes("2 100.00 0.00 0.00 0.00 55.00 -38.00 -48.00"));
});

test("buildIccExportPackage blocks when gate is not Ready", () => {
  assert.throws(
    () => buildIccExportPackage({
      status: "Blocked",
      level: "fail",
      checks: [{ status: "fail", required: true, label: "复测 Run", message: "missing" }],
    }, [iccRun({ runId: "after" })]),
    /gate not passed/i
  );
});

test("buildIccExportPackage uses latest re-measurement Run as data source", () => {
  const gate = readyGate();
  const latest = iccRun({ runId: "after", runName: "After", paperLab: { l: 96, a: 0.2, b: -1.5 } });
  const previous = iccRun({ runId: "before", runName: "Before", paperLab: { l: 88, a: 3, b: 4 } });

  const pkg = buildIccExportPackage(gate, [latest, previous], { standard: { name: "GRACoL2013 CRPC6" } });
  const profile = parseIccProfile(pkg.iccBuffer, { fileName: pkg.filename });

  assert.equal(pkg.metadata.runId, "after");
  assert.equal(pkg.metadata.runName, "After");
  assert.ok(Math.abs(profile.mediaWhitePoint.l - 96) < 0.5);
});

test("buildIccExportPackage metadata contains required provenance fields", () => {
  const pkg = buildIccExportPackage(readyGate(), [iccRun({
    runId: "run-2",
    runName: "Press Recheck",
    instrument: "i1Pro 3",
    measurementCondition: "M1",
  })], {
    standard: { name: "GRACoL2013 CRPC6" },
    jobCustomer: "Customer A",
    jobPress: "KBA162",
  });

  assert.equal(pkg.metadata.profileEngine, "experimental-idw-clut");
  assert.equal(pkg.metadata.productionReady, false);
  assert.equal(pkg.metadata.warning, "Experimental ICC draft, not validated for production RIP use.");
  assert.equal(pkg.metadata.runId, "run-2");
  assert.equal(pkg.metadata.runName, "Press Recheck");
  assert.equal(pkg.metadata.standard, "GRACoL2013 CRPC6");
  assert.equal(pkg.metadata.measurementCondition, "M1");
  assert.equal(pkg.metadata.instrument, "i1Pro 3");
  assert.equal(pkg.metadata.gateStatus, "Ready");
  assert.equal(pkg.metadata.gateLevel, "pass");
  assert.equal(pkg.metadata.patchCount, 300);
  assert.equal(pkg.metadata.labPatchCount, 300);
  assert.ok(Date.parse(pkg.metadata.generatedAt));
  assert.match(pkg.filename, /^ctv-experimental-customer-a-kba162-\d{4}-\d{2}-\d{2}\.icc$/);
  assert.match(pkg.metadataFilename, /\.metadata\.json$/);
});

test("exportMeasurementToCgats can export latest saved Run data directly", () => {
  const txt = exportMeasurementToCgats(iccRun({ runId: "after", paperLab: { l: 96, a: 0.2, b: -1.5 } }));
  assert.ok(txt.includes("CGATS.17"));
  const sets = Number(txt.match(/NUMBER_OF_SETS\s+(\d+)/)?.[1]);
  assert.ok(sets > 0);
  assert.ok(txt.includes("1 0.00 0.00 0.00 0.00 96.00 0.20 -1.50"));
});

function readyGate() {
  return {
    status: "Ready",
    level: "pass",
    title: "Ready for ICC",
    summary: "ready",
    checks: [],
    coverage: { patchCount: 300, labPatchCount: 300 },
  };
}

function iccRun({ runId = "run", runName = "Run", paperLab = { l: 95, a: 0, b: -2 }, instrument = "X-Rite", measurementCondition = "M0" } = {}) {
  return {
    runId,
    name: runName,
    jobId: "job-1",
    storagePath: `jobs/job-1/runs/${runId}.json`,
    archive: {
      standard: { name: "GRACoL2013 CRPC6" },
      measurementCondition,
      importInfo: {
        metadata: { instrument, measurement_condition: measurementCondition },
        rawRows: characterizationRows(paperLab),
      },
      measurements: [{ channel: "C", tone: 50 }],
      results: [{ channel: "C", tone: 50, tviDelta: 1 }],
    },
  };
}

function characterizationRows(paperLab) {
  const rows = [
    row([0, 0, 0, 0], paperLab, "Paper"),
    row([100, 0, 0, 0], { l: 55, a: -37, b: -50 }, "C"),
    row([0, 100, 0, 0], { l: 48, a: 75, b: -4 }, "M"),
    row([0, 0, 100, 0], { l: 89, a: -4, b: 93 }, "Y"),
    row([0, 0, 0, 100], { l: 16, a: 0, b: 0 }, "K"),
    row([100, 100, 0, 0], { l: 25, a: 20, b: -46 }, "CM"),
    row([100, 0, 100, 0], { l: 50, a: -66, b: 26 }, "CY"),
    row([0, 100, 100, 0], { l: 47, a: 68, b: 48 }, "MY"),
    row([100, 100, 100, 0], { l: 23, a: 0, b: 0 }, "CMY"),
  ];
  for (let i = rows.length; i < 300; i += 1) {
    const c = (i * 7) % 101;
    const m = (i * 11) % 101;
    const y = (i * 13) % 101;
    const k = i % 5 === 0 ? (i * 17) % 101 : 0;
    rows.push(row([c, m, y, k], {
      l: 96 - (c + m + y + k) / 5,
      a: c - m,
      b: y - k,
    }, `P${i}`));
  }
  return rows;
}

function row([c, m, y, k], lab, sampleName) {
  return {
    sample_name: sampleName,
    cmyk_c: c,
    cmyk_m: m,
    cmyk_y: y,
    cmyk_k: k,
    lab_l: lab.l,
    lab_a: lab.a,
    lab_b: lab.b,
  };
}
