import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCurveSafety, buildLabVerificationRows, deltaE2000, deltaE76, deltaE94, deltaECMC, diagnosePress, g7Preview, summarizeLabVerification } from "../src/analysis-engine.js";
import { g7CmyNpdcLTarget, g7NpdcLTarget } from "../src/g7-targets.js";
import { g7GrayMagentaYellowFor } from "../src/shared.js";

const g7Gray = (tone) => ({ c: tone, m: g7GrayMagentaYellowFor(tone), y: g7GrayMagentaYellowFor(tone), k: 0 });
const kRamp = (lOffset = 0) => [10, 20, 30, 40, 50].map((tone) => ({
  label: `K ${tone}%`,
  cmyk: { c: 0, m: 0, y: 0, k: tone },
  lab: { l: g7NpdcLTarget(tone) + lOffset, a: 0, b: 0 },
  deltaE: 1,
}));

test("Delta E formulas return stable finite values", () => {
  const sample = { l: 50, a: 2.6772, b: -79.7751 };
  const target = { l: 50, a: 0, b: -82.7485 };

  assert.equal(deltaE76(sample, target).toFixed(4), "4.0011");
  assert.equal(deltaE2000(sample, target).toFixed(4), "2.0425");
  assert.ok(deltaE94(sample, target) > 0);
  assert.ok(deltaECMC(sample, target) > 0);
});

test("g7Preview classifies P2P patch completeness", () => {
  const rawRows = [
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0 },
    { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0 },
    { cmyk_c: 0, cmyk_m: 100, cmyk_y: 0, cmyk_k: 0 },
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 100, cmyk_k: 0 },
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 100 },
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 25 },
    { cmyk_c: 20, cmyk_m: 15.01, cmyk_y: 15.01, cmyk_k: 0 },
    { cmyk_c: 50, cmyk_m: 40, cmyk_y: 40, cmyk_k: 0 },
  ];
  const g7 = g7Preview({ rawRows });

  assert.equal(g7.patchClasses.paper, 1);
  assert.equal(g7.patchClasses.cmykSolids, 4);
  assert.equal(g7.patchClasses.kOnly, 1);
  assert.equal(g7.patchClasses.cmyNeutralGray, 2);
  assert.ok(g7.completenessRows.some((row) => row.item === "CMYK 实地" && row.status === "Pass"));
});

test("g7Preview reports NPDC delta tone metrics", () => {
  const g7 = g7Preview({
    measurements: [{ channel: "K", tone: 50, measuredTone: 68 }],
    results: [{ channel: "K", tone: 50, measuredTone: 68, targetTone: 64 }],
  });

  assert.equal(g7.npdcRows[0].deltaTone, 4);
  assert.equal(g7.legacyMaxNpdcDeltaTone, 4);
});

test("g7Preview uses raw Lab gray patches without claiming G7 pass", () => {
  const rawRows = [
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 95, lab_a: 0, lab_b: -2 },
    { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 56, lab_a: -35, lab_b: -49 },
    { cmyk_c: 0, cmyk_m: 100, cmyk_y: 0, cmyk_k: 0, lab_l: 50, lab_a: 72, lab_b: -3 },
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 100, cmyk_k: 0, lab_l: 88, lab_a: -5, lab_b: 90 },
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 100, lab_l: 15, lab_a: 0, lab_b: 0 },
    ...[[25, 19], [50, 40], [75, 66]].map(([c, my]) => ({ cmyk_c: c, cmyk_m: my, cmyk_y: my, cmyk_k: 0, lab_l: 70, lab_a: 1, lab_b: -1 })),
  ];
  const results = [10, 20, 30, 40, 50].map((tone) => ({ channel: "K", tone, measuredTone: tone + 9, targetTone: tone + 9 }));
  const g7 = g7Preview({ rawRows, results });

  assert.equal(g7.grayPatchCount, 3);
  assert.ok(Number.isFinite(g7.maxGrayCh));
  assert.equal(g7.status, "Data Incomplete");
  assert.ok(g7.missing.some((message) => message.includes("Lab")));
});

test("g7Preview deduplicates raw and calculated G7 patch counts", () => {
  const rawRows = [
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 25, lab_l: 50, lab_a: 0, lab_b: 0 },
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 50, lab_l: 40, lab_a: 0, lab_b: 0 },
  ];
  const labRows = [
    { label: "K 25%", cmyk: { c: 0, m: 0, y: 0, k: 25 }, lab: { l: 50, a: 0, b: 0 }, deltaE: 1 },
    { label: "K 50%", cmyk: { c: 0, m: 0, y: 0, k: 50 }, lab: { l: 40, a: 0, b: 0 }, deltaE: 1 },
  ];
  const g7 = g7Preview({ rawRows, labRows });

  assert.equal(g7.patchClasses.kOnly, 2);
  assert.equal(g7.patchClasses.p2pTotal, 2);
});

test("summarizeLabVerification reports pass warning fail and missing counts", () => {
  const summary = summarizeLabVerification([
    { status: "Pass", deltaE: 1 },
    { status: "Warning", deltaE: 3.8 },
    { status: "Fail", deltaE: 8 },
    { status: "Missing Target", deltaE: NaN },
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.comparable, 3);
  assert.equal(summary.pass, 1);
  assert.equal(summary.warning, 1);
  assert.equal(summary.fail, 1);
  assert.equal(summary.missing, 1);
  assert.equal(summary.status, "Fail");
  assert.equal(summary.maxDeltaE, 8);
});

test("buildLabVerificationRows includes raw overprint Lab patches for a*b* gamut charts", () => {
  const rows = buildLabVerificationRows({
    measurements: [
      { channel: "C", tone: 100, lab: { l: 55, a: -36, b: -48 } },
    ],
    rawRows: [
      { cmyk_c: 0, cmyk_m: 100, cmyk_y: 100, cmyk_k: 0, lab_l: 48, lab_a: 70, lab_b: 45 },
      { cmyk_c: 100, cmyk_m: 0, cmyk_y: 100, cmyk_k: 0, lab_l: 52, lab_a: -58, lab_b: 25 },
      { cmyk_c: 100, cmyk_m: 100, cmyk_y: 0, cmyk_k: 0, lab_l: 35, lab_a: 20, lab_b: -50 },
    ],
    standardPatchMap: new Map(),
  });

  assert.ok(rows.some((row) => row.cmyk.m === 100 && row.cmyk.y === 100 && row.cmyk.c === 0));
  assert.ok(rows.some((row) => row.cmyk.c === 100 && row.cmyk.y === 100 && row.cmyk.m === 0));
  assert.ok(rows.some((row) => row.cmyk.c === 100 && row.cmyk.m === 100 && row.cmyk.y === 0));
});

test("buildLabVerificationRows extracts density for manualRows, rawRows, and measurements", () => {
  const rows = buildLabVerificationRows({
    manualRows: [
      { channel: "C", tone: 100, patchType: "solid", labL: 50, labA: 0, labB: 0, density: 1.55 }
    ],
    measurements: [
      { channel: "M", tone: 100, patchType: "solid", lab: { l: 50, a: 0, b: 0 }, density: 1.45 }
    ],
    rawRows: [
      { cmyk_c: 0, cmyk_m: 0, cmyk_y: 100, cmyk_k: 0, lab_l: 50, lab_a: 0, lab_b: 0, density: 1.05 }
    ],
    standardPatchMap: new Map(),
  });

  const cRow = rows.find(r => r.cmyk.c === 100);
  const mRow = rows.find(r => r.cmyk.m === 100);
  const yRow = rows.find(r => r.cmyk.y === 100);

  assert.equal(cRow?.density, 1.55);
  assert.equal(mRow?.density, 1.45);
  assert.equal(yRow?.density, 1.05);
});

test("g7Preview can validate complete manual-equivalent G7 data", () => {
  const results = [10, 20, 30, 40, 50].map((tone) => ({
    channel: "K",
    tone,
    measuredTone: tone + 10,
    targetTone: tone + 9,
  }));
  const labRows = [
    { label: "Paper", cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 95, a: 0, b: -2 }, deltaE: 1 },
    ...kRamp(),
    ...["C", "M", "Y", "K"].map((channel) => ({
      label: `${channel} 100%`,
      cmyk: {
        c: channel === "C" ? 100 : 0,
        m: channel === "M" ? 100 : 0,
        y: channel === "Y" ? 100 : 0,
        k: channel === "K" ? 100 : 0,
      },
      lab: { l: channel === "K" ? g7NpdcLTarget(100) : 50, a: 0, b: 0 },
      deltaE: 1,
    })),
    ...[25, 50, 75].map((tone) => ({
      label: `Gray ${tone}`,
      cmyk: g7Gray(tone),
      lab: { l: g7CmyNpdcLTarget(tone), a: 0.5, b: -0.5 },
      deltaE: 1,
    })),
  ];

  const g7 = g7Preview({ results, labRows });

  assert.equal(g7.status, "Pass");
  assert.equal(g7.conclusion.level, "pass");
  assert.match(g7.conclusion.title, /通过/);
  assert.equal(g7.missing.length, 0);
  assert.ok(g7.completenessRows.every((row) => row.status === "Pass"));
  assert.ok(g7.verificationRows.every((row) => row.status === "Pass"));
});

test("g7Preview treats G7 grayscale overruns as Fail, not Warning", () => {
  const results = [10, 20, 30, 40, 50].map((tone) => ({
    channel: "K",
    tone,
    measuredTone: tone + 10,
    targetTone: tone + 9,
  }));
  const labRows = [
    { label: "Paper", cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 95, a: 0, b: -2 }, deltaE: 1 },
    ...kRamp(),
    ...["C", "M", "Y", "K"].map((channel) => ({
      label: `${channel} 100%`,
      cmyk: {
        c: channel === "C" ? 100 : 0,
        m: channel === "M" ? 100 : 0,
        y: channel === "Y" ? 100 : 0,
        k: channel === "K" ? 100 : 0,
      },
      lab: { l: channel === "K" ? g7NpdcLTarget(100) : 50, a: 0, b: 0 },
      deltaE: 1,
    })),
    ...[25, 50, 75].map((tone) => ({
      label: `Gray ${tone}`,
      cmyk: g7Gray(tone),
      lab: { l: g7CmyNpdcLTarget(tone), a: 2, b: -0.5 },
      deltaE: 1,
    })),
  ];

  const g7 = g7Preview({ results, labRows });
  const grayAverage = g7.verificationRows.find((row) => row.item === "灰平衡 wΔCh 平均");

  assert.ok(grayAverage.value > 1.5 && grayAverage.value <= 3, `weighted gray average ${grayAverage.value}`);
  assert.equal(grayAverage.status, "Fail");
  assert.equal(g7.status, "Fail");
  assert.equal(g7.conclusion.level, "danger");
});

test("g7Preview keeps incomplete data from reporting false pass", () => {
  const g7 = g7Preview({
    results: [{ channel: "K", tone: 50, measuredTone: 64, targetTone: 64 }],
    labRows: [{ label: "Paper", cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 95, a: 0, b: -2 }, deltaE: 1 }],
  });

  assert.equal(g7.status, "Data Incomplete");
  assert.equal(g7.conclusion.level, "warning");
  assert.match(g7.conclusion.title, /数据不完整/);
  assert.ok(g7.verificationRows.some((row) => row.status === "Missing"));
});

test("g7Preview conclusion identifies failed G7 verification priorities", () => {
  const results = [10, 20, 30, 40, 50].map((tone) => ({
    channel: "K",
    tone,
    measuredTone: tone + 9,
    targetTone: tone + 9,
  }));
  const labRows = [
    { label: "Paper", cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 95, a: 0, b: -2 }, deltaE: 1 },
    ...kRamp(),
    ...["C", "M", "Y", "K"].map((channel) => ({
      label: `${channel} 100%`,
      cmyk: {
        c: channel === "C" ? 100 : 0,
        m: channel === "M" ? 100 : 0,
        y: channel === "Y" ? 100 : 0,
        k: channel === "K" ? 100 : 0,
      },
      lab: { l: channel === "K" ? g7NpdcLTarget(100) : 50, a: 0, b: 0 },
      deltaE: 1,
    })),
    ...[25, 50, 75].map((tone) => ({
      label: `Gray ${tone}`,
      cmyk: g7Gray(tone),
      lab: { l: 70, a: 8, b: -8 },
      deltaE: 9,
    })),
  ];
  const g7 = g7Preview({ results, labRows });

  assert.equal(g7.status, "Fail");
  assert.equal(g7.conclusion.level, "danger");
  assert.match(g7.conclusion.summary, /灰平衡/);
  assert.ok(g7.conclusion.recommendations.some((item) => item.includes("灰平衡")));
});

test("diagnosePress flags all-channel severe TVI before production compensation", () => {
  const diagnosis = diagnosePress(["C", "M", "Y", "K"].map((channel) => ({
    channel,
    tone: 50,
    tviDelta: 12,
  })));

  assert.equal(diagnosis.level, "danger");
  assert.equal(diagnosis.title, "全通道 TVI 严重偏离 / 建议先做机械全面检查");
  assert.equal(diagnosis.ratio, 35);
});

test("diagnosePress flags isolated severe channel", () => {
  const diagnosis = diagnosePress([
    { channel: "C", tone: 50, tviDelta: 16 },
    { channel: "M", tone: 50, tviDelta: 2 },
    { channel: "Y", tone: 50, tviDelta: 1 },
    { channel: "K", tone: 50, tviDelta: 3 },
  ]);

  assert.equal(diagnosis.level, "danger");
  assert.equal(diagnosis.title, "单通道严重异常: C");
});

test("diagnosePress flags density and TVI mismatch", () => {
  const diagnosis = diagnosePress([
    { channel: "M", tone: 50, tviDelta: 12, solidDensity: 1.42 },
    { channel: "C", tone: 50, tviDelta: 2, solidDensity: 1.4 },
    { channel: "Y", tone: 50, tviDelta: 2, solidDensity: 1.0 },
    { channel: "K", tone: 50, tviDelta: 2, solidDensity: 1.65 },
  ], {
    solidDensityRanges: {
      C: [1.25, 1.65],
      M: [1.25, 1.65],
      Y: [0.85, 1.15],
      K: [1.45, 1.9],
    },
  });

  assert.equal(diagnosis.title, "密度-TVI 矛盾 / 需复查测量与机械状态");
  assert.equal(diagnosis.densityIssues[0].channel, "M");
});

test("diagnosePress skips density mismatch when standard has no density ranges", () => {
  const diagnosis = diagnosePress([
    { channel: "M", tone: 50, tviDelta: 12, solidDensity: 1.42 },
  ]);

  assert.notEqual(diagnosis.title, "密度-TVI 矛盾 / 需复查测量与机械状态");
  assert.deepEqual(diagnosis.densityIssues || [], []);
});

test("diagnosePress ignores interpolated tone density as solid density", () => {
  const diagnosis = diagnosePress([
    { channel: "Y", tone: 40, tviDelta: 13, density: 0.97 },
    { channel: "Y", tone: 50, tviDelta: 14, density: 0.97 },
    { channel: "Y", tone: 60, tviDelta: 13, density: 0.97 },
    { channel: "Y", tone: 100, tviDelta: 0, density: 0.97, interpolated: true },
  ]);

  assert.notEqual(diagnosis.title, "密度-TVI 矛盾 / 需复查测量与机械状态");
  assert.deepEqual(diagnosis.densityIssues || [], []);
});

test("analyzeCurveSafety reports kinked curve points with related tones", () => {
  const issues = analyzeCurveSafety([
    { channel: "K", tone: 50, outputTone: 47 },
    { channel: "K", tone: 70, outputTone: 62 },
    { channel: "K", tone: 75, outputTone: 74 },
  ]);

  const kink = issues.find((item) => item.type === "折点突变");
  assert.equal(kink.channel, "K");
  assert.equal(kink.tone, 70);
  assert.deepEqual(kink.relatedTones, [50, 70, 75]);
});

test("analyzeCurveSafety flags excessive highlight and shadow moves", () => {
  const issues = analyzeCurveSafety([
    { channel: "C", tone: 5, outputTone: 1 },
    { channel: "C", tone: 90, outputTone: 80 },
  ]);

  assert.ok(issues.some((item) => item.type === "高光保护"));
  assert.ok(issues.some((item) => item.type === "暗调保护"));
});

test("g7Preview blocks reference-only imports", () => {
  const g7 = g7Preview({
    importKind: "reference",
    rawRows: [{ cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 50 }],
    measurements: [{ channel: "K", tone: 50, measuredTone: 65 }],
    results: [{ channel: "K", tone: 50, measuredTone: 65, targetTone: 64 }],
  });

  assert.equal(g7.status, "Data Incomplete");
  assert.equal(g7.npdcRows.length, 0);
  assert.ok(g7.missing[0].includes("标准/目标参考文件"));
});

test("diagnosePress does not pass a press whose control points exceed the standard tolerance", () => {
  const rows = ["C", "M", "Y", "K"].flatMap((channel) => [25, 40, 50, 60, 75].map((tone) => ({
    channel,
    tone,
    tviDelta: channel === "K" && tone === 25 ? 7 : channel === "K" && tone === 50 ? 5 : 1,
  })));
  const toneTolerances = Object.fromEntries(["C", "M", "Y", "K"].map((channel) => [channel, { tvi: { 25: 3, 50: 4, 75: 3 } }]));
  // Without standard tolerances the default ±5 still catches K 25% +7.
  assert.equal(diagnosePress(rows).level, "warning");
  const diagnosis = diagnosePress(rows, { toneTolerances, metric: "tvi" });
  assert.equal(diagnosis.level, "warning");
  assert.match(diagnosis.title, /超出容差/);
  assert.equal(diagnosis.toleranceIssues.length, 2);
  assert.match(diagnosis.messages[0], /K 25% TVI 偏差 \+7\.0%，超出容差 ±3%/);
});

test("review M3: a large under-gain at a measured point is never a pass", () => {
  const rows = ["C", "M", "Y", "K"].flatMap((channel) => [25, 40, 50, 75].map((tone) => ({
    channel, tone, tviDelta: channel === "C" && tone === 40 ? -30 : 0.5,
  })));
  const diagnosis = diagnosePress(rows);
  assert.notEqual(diagnosis.level, "pass");
  assert.ok(diagnosis.messages.some((text) => /^C /.test(text)));
});

test("review M3: missing control points give 'to be re-measured', not a pass", () => {
  const rows = ["C", "M", "Y", "K"].flatMap((channel) => [25, 50].map((tone) => ({ channel, tone, tviDelta: 0.5 })));
  const diagnosis = diagnosePress(rows);
  assert.equal(diagnosis.level, "incomplete");
  assert.match(diagnosis.messages[0], /75/);
});

test("diagnosePress speaks CTV in CTV mode", () => {
  const rows = ["C", "M", "Y", "K"].flatMap((channel) => [25, 50, 75].map((tone) => ({ channel, tone, tviDelta: 0.5 })));
  const ctv = diagnosePress(rows, { metric: "ctv" });
  assert.ok(ctv.messages.every((text) => !/\bTVI\b/.test(text)));
  const tvi = diagnosePress(rows, { metric: "tvi" });
  assert.ok(tvi.messages.some((text) => /\bTVI\b/.test(text)));
});

function g7BaseLabRows({ kLOffset = 0, includeK = true } = {}) {
  return [
    { label: "Paper", cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 95, a: 0, b: -2 }, deltaE: 1 },
    ...(includeK ? kRamp(kLOffset) : []),
    ...["C", "M", "Y", "K"].map((channel) => ({
      label: `${channel} 100%`,
      cmyk: { c: channel === "C" ? 100 : 0, m: channel === "M" ? 100 : 0, y: channel === "Y" ? 100 : 0, k: channel === "K" ? 100 : 0 },
      lab: { l: channel === "K" ? g7NpdcLTarget(100) : 50, a: 0, b: 0 },
      deltaE: 1,
    })),
    ...[25, 50, 75].map((tone) => ({
      label: `Gray ${tone}`,
      cmyk: g7Gray(tone),
      lab: { l: g7CmyNpdcLTarget(tone), a: 0, b: -2 * (1 - tone / 100) },
      deltaE: 1,
    })),
  ];
}

test("review #4: K tone records without Lab never let G7 pass", () => {
  // 13 K grid points from the curve, no measured K Lab at all.
  const results = [5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95].map((tone) => ({ channel: "K", tone, measuredTone: tone + 10, targetTone: tone + 10 }));
  const measurements = [{ channel: "K", tone: 50, measuredTone: 64 }];
  const g7 = g7Preview({ results, measurements, labRows: g7BaseLabRows({ includeK: false }) });

  assert.equal(g7.kOnlyCount, 0);
  assert.equal(g7.status, "Data Incomplete");
  assert.ok(g7.missing.some((item) => /K-only/.test(item)));
});

test("review #4: a failing K ramp is not averaged away by good CMY gray", () => {
  const g7 = g7Preview({ labRows: g7BaseLabRows({ kLOffset: -6 }) });

  assert.equal(g7.kNpdcSummary.status, "Fail");
  assert.equal(g7.grayNpdcSummary.status, "Pass");
  assert.equal(g7.verificationRows.find((row) => row.item === "K NPDC wΔL* 平均").status, "Fail");
  assert.equal(g7.status, "Fail");
});

test("review #4: complete K, CMY and gray data can pass", () => {
  const g7 = g7Preview({ labRows: g7BaseLabRows() });
  assert.equal(g7.kOnlyCount, 5);
  assert.equal(g7.grayPatchCount, 3);
  assert.equal(g7.status, "Pass");
});

test("review #4: a patch named Gray with non-G7 CMYK is not a gray-balance patch", () => {
  const labRows = g7BaseLabRows().filter((row) => !row.label.startsWith("Gray"));
  labRows.push(
    { label: "Gray 25", cmyk: { c: 25, m: 25, y: 25, k: 0 }, lab: { l: 75, a: 0, b: 0 }, deltaE: 1 },
    { label: "neutral 50", cmyk: { c: 50, m: 50, y: 50, k: 0 }, lab: { l: 60, a: 0, b: 0 }, deltaE: 1 },
    { label: "CMY 75", cmyk: { c: 75, m: 75, y: 75, k: 0 }, lab: { l: 40, a: 0, b: 0 }, deltaE: 1 },
  );
  const g7 = g7Preview({ labRows });
  assert.equal(g7.grayPatchCount, 0);
  assert.equal(g7.status, "Data Incomplete");
});

test("review #4: duplicate K patches count once", () => {
  const labRows = [...g7BaseLabRows({ includeK: false }), ...kRamp().slice(0, 2), ...kRamp().slice(0, 2), ...kRamp().slice(0, 2)];
  const g7 = g7Preview({ labRows });
  assert.equal(g7.kOnlyCount, 2);
  assert.equal(g7.status, "Data Incomplete");
});
