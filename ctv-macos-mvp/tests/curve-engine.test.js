import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiagnosticRows,
  calculateCompensation,
  parseImportText,
  spotColorToneValueFromLab,
  spotColorToneValueFromXyz,
  TARGETS,
  targetValueFor,
  toExportRows,
} from "../src/curve-engine.js";

test("calculateCompensation switches TVI and CTV metrics explicitly", () => {
  const measurements = [{
    channel: "C",
    tone: 50,
    measuredTone: 70,
    colorimetricTone: 64,
    colorimetricMethod: "iso_20654_lab",
  }];

  const tvi = calculateCompensation(measurements, {
    mode: "tvi",
    target: "linear",
    compensationRatio: 100,
    limit: 100,
    outputGrid: false,
  });
  const ctv = calculateCompensation(measurements, {
    mode: "ctv",
    target: "linear",
    compensationRatio: 100,
    limit: 100,
    outputGrid: false,
  });

  assert.equal(tvi[0].metricName, "TVI");
  assert.equal(tvi[0].measuredTvi, 20);
  // Response 0->0, 50->70, 100->100; the input that prints 50% is 50 * 50 / 70.
  assert.ok(Math.abs(tvi[0].outputTone - 250 / 7) < 1e-9);
  assert.equal(tvi[0].correctionMethod, "inverse_response");
  assert.equal(ctv[0].metricName, "CTV");
  assert.equal(ctv[0].metricMethod, "iso_20654_lab");
  assert.equal(ctv[0].measuredTvi, 14);
  assert.ok(Math.abs(ctv[0].outputTone - 50 * 50 / 64) < 1e-9);
});

test("buildDiagnosticRows calculates deviation without production curve output", () => {
  const rows = buildDiagnosticRows([{
    channel: "K",
    tone: 50,
    measuredTone: 72,
  }], {
    mode: "tvi",
    target: "isoB",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].measuredTvi, 22);
  assert.equal(rows[0].targetTvi, 19);
  assert.equal(rows[0].tviDelta, 3);
  assert.equal(rows[0].outputTone, undefined);
});

test("buildDiagnosticRows honors per-channel targets like the compensation path", () => {
  const measurements = [
    { channel: "C", tone: 50, measuredTone: 72 },
    { channel: "K", tone: 50, measuredTone: 72 },
  ];
  const options = { mode: "tvi", target: "isoA", channelTargets: { K: "isoB" } };
  const rows = buildDiagnosticRows(measurements, options);
  const compensation = calculateCompensation(measurements, { ...options, compensationRatio: 100, smooth: 0, limit: 30 });

  const diagK = rows.find((row) => row.channel === "K");
  const diagC = rows.find((row) => row.channel === "C");
  assert.equal(diagK.targetTvi, 19);
  assert.notEqual(diagC.targetTvi, diagK.targetTvi);
  for (const diag of rows) {
    const comp = compensation.find((row) => row.channel === diag.channel && row.tone === 50);
    assert.equal(diag.targetTvi, comp.targetTvi);
  }
});

test("per-channel TVI targets do not override the CTV target", () => {
  const measurements = [{ channel: "C", tone: 50, measuredTone: 72, ctvTone: 50, colorimetricTone: 50 }];
  const options = { mode: "ctv", target: "linear", channelTargets: { C: "isoA" } };
  const diag = buildDiagnosticRows(measurements, options);
  const comp = calculateCompensation(measurements, { ...options, compensationRatio: 100, smooth: 0, limit: 30 });

  assert.equal(diag[0].targetTvi, 0);
  assert.equal(comp.find((row) => row.tone === 50).targetTvi, 0);
});

test("ISO 12647-2:2013 TVI targets use Table 9 values and polynomial metadata", () => {
  assert.equal(TARGETS.isoA.source, "ISO 12647-2:2013 Table 9");
  assert.equal(targetValueFor("isoA", 5), 3.3);
  assert.equal(targetValueFor("isoA", 50), 16);
  assert.equal(targetValueFor("isoB", 50), 19);
  assert.equal(targetValueFor("isoC", 30), 20.9);
  assert.equal(targetValueFor("isoD", 40), 25.4);
  assert.equal(targetValueFor("isoE", 95), 3.9);
  assert.ok(Math.abs(targetValueFor("isoA", 50, { method: "polynomial" }) - 16) < 0.1);
});

test("CTV mode marks fallback rows when colorimetric data is missing", () => {
  const [row] = calculateCompensation([{
    channel: "M",
    tone: 50,
    measuredTone: 67,
  }], {
    mode: "ctv",
    target: "linear",
    compensationRatio: 100,
    limit: 100,
    outputGrid: false,
  });

  assert.equal(row.metricName, "TVI fallback");
  assert.equal(row.metricMethod, "reported_tone");
});

test("ISO 20654 Lab CTV uses direct Lab Delta E distance", () => {
  const value = spotColorToneValueFromLab(
    { l: 50, a: 10, b: 0 },
    { l: 100, a: 0, b: 0 },
    { l: 0, a: 0, b: 0 }
  );

  assert.equal(Number(value.toFixed(2)), 50.99);
});

test("ISO 20654 XYZ CTV converts through D50 Lab before distance", () => {
  const paper = { x: 96.422, y: 100, z: 82.521 };
  const solid = { x: 0, y: 0, z: 0 };

  assert.equal(spotColorToneValueFromXyz(paper, paper, solid), 0);
  assert.equal(spotColorToneValueFromXyz(solid, paper, solid), 100);
});

test("parseImportText converts spectral patches to Lab for colorimetric workflows", () => {
  const spectralFields = Array.from({ length: 36 }, (_, index) => `spectral_nm${380 + index * 10}`);
  const header = ["sample_id", "cmyk_c", "cmyk_m", "cmyk_y", "cmyk_k", ...spectralFields].join(",");
  const paper = ["P", 0, 0, 0, 0, ...spectralFields.map(() => 1)].join(",");
  const cyan50 = ["C50", 50, 0, 0, 0, ...spectralFields.map(() => 0.45)].join(",");
  const cyan100 = ["C100", 100, 0, 0, 0, ...spectralFields.map(() => 0.08)].join(",");
  const parsed = parseImportText(`${header}\n${paper}\n${cyan50}\n${cyan100}`);

  assert.equal(parsed.measurements.length, 2);
  assert.ok(parsed.measurements.every((row) => row.lab && row.xyz));
  assert.ok(parsed.measurements.every((row) => Number.isFinite(row.colorimetricTone)));
  assert.ok(parsed.measurements.some((row) => row.measuredToneMethod === "murray_davies_status_t_spectral" || row.densityMethod === "status_t_spectral"));
});

test("parseImportText density filter none disables spectral TVI conversion", () => {
  const spectralFields = Array.from({ length: 36 }, (_, index) => `spectral_nm${380 + index * 10}`);
  const header = ["sample_id", "cmyk_c", "cmyk_m", "cmyk_y", "cmyk_k", ...spectralFields].join(",");
  const paper = ["P", 0, 0, 0, 0, ...spectralFields.map(() => 1)].join(",");
  const cyan50 = ["C50", 50, 0, 0, 0, ...spectralFields.map(() => 0.45)].join(",");
  const cyan100 = ["C100", 100, 0, 0, 0, ...spectralFields.map(() => 0.08)].join(",");
  const parsed = parseImportText(`${header}\n${paper}\n${cyan50}\n${cyan100}`, { densityFilter: "none" });

  assert.equal(parsed.measurements.length, 2);
  assert.ok(parsed.measurements.every((row) => row.lab && row.xyz));
  assert.ok(parsed.measurements.every((row) => !Number.isFinite(row.density)));
  assert.ok(parsed.measurements.every((row) => row.densityMethod === "spectral_density_disabled"));
  assert.ok(parsed.warnings.some((warning) => warning.includes("禁用光谱密度")));
});

test("parseImportText preserves instrument CTV fields for cross verification", () => {
  const text = [
    "channel,tone,lab_l,lab_a,lab_b,paper_lab_l,paper_lab_a,paper_lab_b,solid_lab_l,solid_lab_a,solid_lab_b,ctv,sample_id",
    "C,50,70,-22,-31,95,0,-2,55,-38,-50,49.8,C50",
  ].join("\n");
  const parsed = parseImportText(text);

  assert.equal(parsed.measurements.length, 1);
  assert.equal(parsed.measurements[0].instrumentCtv, 49.8);
  assert.equal(parsed.measurements[0].instrumentCtvMethod, "ctv");
});

test("headerless numeric rows parse with channel-rotation warning", () => {
  const parsed = parseImportText("50,68\n75,88");

  assert.equal(parsed.measurements.length, 2);
  assert.deepEqual(parsed.measurements.map((row) => row.channel), ["C", "M"]);
  assert.deepEqual(parsed.measurements.map((row) => row.tone), [50, 75]);
  assert.ok(parsed.warnings.some((warning) => warning.includes("无通道列")));
});

test("output grid keeps 0 and 100 boundary anchors", () => {
  const rows = calculateCompensation([{
    channel: "K",
    tone: 50,
    measuredTone: 72,
  }], {
    mode: "tvi",
    target: "linear",
    compensationRatio: 100,
    limit: 100,
    outputGrid: [0, 50, 100],
  });

  assert.deepEqual(rows.map((row) => row.tone), [0, 50, 100]);
  assert.equal(rows[0].outputTone, 0);
  assert.equal(rows[2].outputTone, 100);
});

test("smoothing changes the middle point before monotonic enforcement", () => {
  const measurements = [
    { channel: "C", tone: 25, measuredTone: 25 },
    { channel: "C", tone: 50, measuredTone: 80 },
    { channel: "C", tone: 75, measuredTone: 75 },
  ];
  const unsmoothed = calculateCompensation(measurements, {
    mode: "tvi",
    target: "linear",
    compensationRatio: 100,
    limit: 100,
    smooth: 0,
    outputGrid: false,
  });
  const smoothed = calculateCompensation(measurements, {
    mode: "tvi",
    target: "linear",
    compensationRatio: 100,
    limit: 100,
    smooth: 1,
    outputGrid: false,
  });

  // Inverse response: 50% prints at 80%, so aim 50% sits on the 25->50 segment.
  assert.ok(Math.abs(unsmoothed.find((row) => row.tone === 50).outputTone - (25 + 25 * 25 / 55)) < 1e-9);
  // The 75% patch is on target; the 50% outlier must not drag it.
  assert.equal(unsmoothed.find((row) => row.tone === 75).outputTone, 75);
  assert.ok(smoothed.find((row) => row.tone === 50).outputTone > unsmoothed.find((row) => row.tone === 50).outputTone);
});

test("protects highlight and shadow endpoints", () => {
  const rows = calculateCompensation([
    { channel: "Y", tone: 5, measuredTone: 50 },
    { channel: "Y", tone: 90, measuredTone: 50 },
  ], {
    mode: "tvi",
    target: "linear",
    compensationRatio: 100,
    limit: 100,
    outputGrid: false,
  });

  assert.equal(rows.find((row) => row.tone === 5).outputTone, 3);
  assert.equal(rows.find((row) => row.tone === 90).outputTone, 93);
});

test("enforces monotonic output tones", () => {
  const rows = calculateCompensation([
    { channel: "K", tone: 40, measuredTone: 60 },
    { channel: "K", tone: 50, measuredTone: 100 },
  ], {
    mode: "tvi",
    target: "linear",
    compensationRatio: 100,
    limit: 100,
    outputGrid: false,
  });

  assert.ok(rows[1].outputTone >= rows[0].outputTone);
});

test("smoothing does not reverse positive TVI compensation into RIP increases", () => {
  const rows = calculateCompensation([
    { channel: "K", tone: 20, measuredTone: 36.3 },
    { channel: "K", tone: 25, measuredTone: 43.9 },
    { channel: "K", tone: 50, measuredTone: 73.2 },
    { channel: "K", tone: 70, measuredTone: 86.2 },
    { channel: "K", tone: 75, measuredTone: 89.4 },
  ], {
    mode: "tvi",
    target: "isoB",
    compensationRatio: 50,
    smooth: 3,
    limit: 18,
  });

  const positiveDeviationRows = toExportRows(rows).filter((row) => Number(row.tviDelta) > 0.01);

  assert.ok(positiveDeviationRows.length);
  assert.ok(positiveDeviationRows.every((row) => Number(row.ripAdjustment) <= 0.01));
});

test("smoothing fallback keeps measured positive TVI rows reduced instead of unchanged", () => {
  const rows = calculateCompensation([
    { channel: "K", tone: 20, measuredTone: 36.3 },
    { channel: "K", tone: 25, measuredTone: 43.9 },
    { channel: "K", tone: 50, measuredTone: 73.2 },
    { channel: "K", tone: 70, measuredTone: 86.2 },
    { channel: "K", tone: 75, measuredTone: 89.4 },
  ], {
    mode: "tvi",
    target: "isoB",
    compensationRatio: 50,
    smooth: 2,
    limit: 18,
  });

  const k25 = rows.find((row) => row.channel === "K" && row.tone === 25);

  assert.ok(k25.outputTone < 25);
  assert.ok(Number(toExportRows([k25])[0].ripAdjustment) < 0);
});

test("smoothing respects uneven tone spacing instead of dragging nearby dark tones", () => {
  const rows = calculateCompensation([
    { channel: "K", tone: 20, measuredTone: 36.3 },
    { channel: "K", tone: 25, measuredTone: 43.9 },
    { channel: "K", tone: 50, measuredTone: 73.2 },
    { channel: "K", tone: 70, measuredTone: 86.2 },
    { channel: "K", tone: 75, measuredTone: 89.4 },
  ], {
    mode: "tvi",
    target: "isoB",
    compensationRatio: 45,
    smooth: 2,
    limit: 18,
    outputGrid: false,
  });

  const k70 = rows.find((row) => row.channel === "K" && row.tone === 70);
  const k75 = rows.find((row) => row.channel === "K" && row.tone === 75);

  assert.ok(k70.outputTone > 66);
  assert.ok(k75.outputTone - k70.outputTone < 8);
});

test("parseImportText supports comma, tab, semicolon, whitespace and quoted headers", () => {
  const cases = [
    ['"channel","input tone","measured tone"\n"C",50,68', "CSV"],
    ["channel\ttone\tmeasured_tone\nY\t50\t62", "Delimited"],
    ["channel;tone;measured_tone\nM;50;63", "Delimited"],
    ["channel tone measured_tone\nK 50 70", "Delimited"],
  ];

  for (const [text] of cases) {
    const parsed = parseImportText(text);
    assert.equal(parsed.measurements.length, 1);
    assert.equal(parsed.measurements[0].tone, 50);
    assert.ok(Number.isFinite(parsed.measurements[0].measuredTone));
  }
});

test("highlight compensation inverts the measured response instead of subtracting TVI", () => {
  // Typical press: steep highlight response. Target ISO-style 10% -> 20%.
  const measurements = [
    { channel: "M", tone: 5, measuredTone: 11 },
    { channel: "M", tone: 10, measuredTone: 25 },
    { channel: "M", tone: 20, measuredTone: 40 },
  ];
  const [row10] = calculateCompensation(measurements, {
    mode: "tvi",
    target: "linear",
    targetPoints: [[0, 0], [10, 10], [20, 15], [100, 0]],
    compensationRatio: 100,
    limit: 100,
    outputGrid: false,
  }).filter((row) => row.tone === 10);
  // Need print 20%: between 5->11 and 10->25 => 5 + (20 - 11) * 5 / 14.
  assert.ok(Math.abs(row10.theoreticalOutputTone - (5 + 9 * 5 / 14)) < 1e-9);
  // The old shortcut (10 + 10 - 15 = 5) over-corrected by ~3.2 points.
  assert.ok(row10.theoreticalOutputTone > 8);
});
