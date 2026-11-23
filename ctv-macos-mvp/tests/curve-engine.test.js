import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiagnosticRows,
  calculateCompensation,
  monotoneCubic,
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

test("ISO 20654 Lab CTV uses the Vx/Vy/Vz distance, not the Lab Delta E distance", () => {
  const value = spotColorToneValueFromLab(
    { l: 50, a: 10, b: 0 },
    { l: 100, a: 0, b: 0 },
    { l: 0, a: 0, b: 0 }
  );
  // Vx = L + 116a/500 = 52.32, Vy = Vz = 50; paper V = (100,100,100), solid V = (0,0,0).
  const expected = 100 * Math.hypot(100 - 52.32, 50, 50) / Math.hypot(100, 100, 100);
  assert.ok(Math.abs(value - expected) < 1e-9);
  assert.equal(Number(value.toFixed(2)), 49.24);
});

test("ISO 20654 CTV on a magenta 50% patch differs from the Lab Delta E ratio", () => {
  // Paper, M50 and M solid from samples/g7-p2p51-simulated.txt; expected value computed by hand
  // from ISO 20654 formula (1) with Vx = L + 116a/500, Vy = L, Vz = L - 116b/200.
  const paper = { l: 93.5, a: 1, b: -5.5 };
  const m50 = { l: 66.5, a: 40.47, b: -8.21 };
  const solid = { l: 48, a: 75, b: -4 };
  const value = spotColorToneValueFromLab(m50, paper, solid);
  assert.equal(Number(value.toFixed(2)), 58.07);
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
    { channel: "C", tone: 40, measuredTone: 40 },
    { channel: "C", tone: 50, measuredTone: 70 },
    { channel: "C", tone: 60, measuredTone: 60 },
  ];
  const options = { mode: "tvi", target: "linear", compensationRatio: 100, limit: 100, outputGrid: false };
  const unsmoothed = calculateCompensation(measurements, { ...options, smooth: 0 });
  const smoothed = calculateCompensation(measurements, { ...options, smooth: 1 });

  // Inverse response: 50% prints at 70%, so aim 50% sits on the 40->50 segment.
  assert.ok(Math.abs(unsmoothed.find((row) => row.tone === 50).outputTone - (40 + 10 * 10 / 30)) < 1e-9);
  // The 60% patch is on target; the 50% outlier must not drag it.
  assert.equal(unsmoothed.find((row) => row.tone === 60).outputTone, 60);
  assert.ok(smoothed.find((row) => row.tone === 50).outputTone > unsmoothed.find((row) => row.tone === 50).outputTone);
});

test("smoothing skips sparse 25/50/75 control points so the midtone correction survives", () => {
  const measurements = [
    { channel: "K", tone: 25, measuredTone: 44 },
    { channel: "K", tone: 50, measuredTone: 71 },
    { channel: "K", tone: 75, measuredTone: 89 },
  ];
  const options = { mode: "tvi", target: "linear", compensationRatio: 100, limit: 100, outputGrid: false };
  const unsmoothed = calculateCompensation(measurements, { ...options, smooth: 0 });
  const smoothed = calculateCompensation(measurements, { ...options, smooth: 3 });
  for (const tone of [25, 50, 75]) {
    assert.equal(
      smoothed.find((row) => row.tone === tone).outputTone,
      unsmoothed.find((row) => row.tone === tone).outputTone,
    );
  }
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

test("monotoneCubic passes through knots, stays monotone and does not overshoot", () => {
  const f = monotoneCubic([[0, 0], [25, 23], [50, 47.7], [75, 74], [100, 100]]);
  assert.equal(f(25), 23);
  assert.equal(f(50), 47.7);
  let previous = -Infinity;
  for (let x = 0; x <= 100; x += 0.5) {
    const y = f(x);
    assert.ok(y >= previous - 1e-9, `not monotone at ${x}`);
    previous = y;
  }
  const flat = monotoneCubic([[0, 0], [50, 10], [100, 10]]);
  for (let x = 50; x <= 100; x += 5) assert.ok(flat(x) <= 10 + 1e-9);
});

const sparseK = [
  { channel: "K", tone: 25, measuredTone: 44 },
  { channel: "K", tone: 50, measuredTone: 71 },
  { channel: "K", tone: 75, measuredTone: 89 },
];

test("grid output bends smoothly between sparse control points", () => {
  const rows = calculateCompensation(sparseK, { mode: "tvi", target: "isoA", compensationRatio: 50, limit: 18, smooth: 2 });
  const adjust = (tone) => { const row = rows.find((r) => r.tone === tone); return row.outputTone - row.tone; };
  // Control points keep their exact correction.
  assert.ok(Math.abs(adjust(50) - (45.37 - 50) * 0.5) < 0.05);
  // Between 25 and 50 the adjustment no longer runs on a straight chord: 30/40 differ from linear.
  const linear40 = adjust(25) + (adjust(50) - adjust(25)) * 0.6;
  assert.ok(Math.abs(adjust(40) - linear40) > 0.01);
  const outputs = rows.map((row) => row.outputTone);
  outputs.forEach((value, index) => { if (index) assert.ok(value >= outputs[index - 1]); });
});

test("re-measure stacks the new correction on the previous round's curve", () => {
  const options = { mode: "tvi", target: "isoA", compensationRatio: 100, limit: 18, smooth: 0 };
  const round1 = calculateCompensation(sparseK, options);
  const baseCurve = { K: round1.map((row) => [row.tone, row.outputTone]) };
  // The press, printed through round 1, now lands 2 points heavy at 50%.
  const round2Measured = [
    { channel: "K", tone: 25, measuredTone: 38 },
    { channel: "K", tone: 50, measuredTone: 68 },
    { channel: "K", tone: 75, measuredTone: 88 },
  ];
  const flat = calculateCompensation(round2Measured, options);
  const stacked = calculateCompensation(round2Measured, { ...options, baseCurve });
  const at = (rows, tone) => rows.find((row) => row.tone === tone);
  const base50 = at(round1, 50).outputTone;
  // Unstacked result forgets round 1 (it is close to linear); stacked goes further than round 1.
  assert.ok(at(flat, 50).outputTone > base50);
  assert.ok(at(stacked, 50).outputTone < base50);
  assert.equal(at(stacked, 50).incrementalOutputTone, at(flat, 50).outputTone);
  assert.equal(at(stacked, 50).stackedOnBaseCurve, true);
  assert.equal(at(stacked, 0).outputTone, 0);
  assert.equal(at(stacked, 100).outputTone, 100);
});
