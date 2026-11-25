import assert from "node:assert/strict";
import test from "node:test";

import { classifyP2PPatch, g7NpdcLTarget, tr015RelativeL, tr015GrayAim, buildNpdcVerification, summarizeNpdc,
  buildGrayVerification, summarizeGrayBalance, buildColorspaceVerification,
  classifyColorspacePatches, g7ToneWeight, neutralPrintDensityFromL, summarizeWeightedDeltaL } from "../src/g7-targets.js";
import { deltaE76 } from "../src/analysis-engine.js";

// ─── P2P Patch Classification ───

test("classifyP2PPatch identifies paper", () => {
  const cats = classifyP2PPatch(0, 0, 0, 0);
  assert.ok(cats.includes("paper"));
  assert.equal(cats.filter((c) => c === "solid").length, 0);
});

test("classifyP2PPatch identifies CMYK solids", () => {
  assert.ok(classifyP2PPatch(100, 0, 0, 0).includes("c_solid"));
  assert.ok(classifyP2PPatch(0, 100, 0, 0).includes("m_solid"));
  assert.ok(classifyP2PPatch(0, 0, 100, 0).includes("y_solid"));
  assert.ok(classifyP2PPatch(0, 0, 0, 100).includes("k_solid"));
});

test("classifyP2PPatch identifies overprints", () => {
  assert.ok(classifyP2PPatch(0, 100, 100, 0).includes("red"));
  assert.ok(classifyP2PPatch(100, 0, 100, 0).includes("green"));
  assert.ok(classifyP2PPatch(100, 100, 0, 0).includes("blue"));
  assert.ok(classifyP2PPatch(100, 100, 100, 0).includes("cmy"));
});

test("classifyP2PPatch identifies K-only NPDC patches", () => {
  assert.ok(classifyP2PPatch(0, 0, 0, 25).includes("npdc"));
  assert.ok(classifyP2PPatch(0, 0, 0, 50).includes("npdc"));
  assert.ok(classifyP2PPatch(0, 0, 0, 75).includes("npdc"));
  assert.ok(!classifyP2PPatch(0, 0, 0, 100).includes("npdc")); // solid
});

test("classifyP2PPatch identifies gray balance candidates", () => {
  // G7 gray ratio M = Y = f(C), including rounded P2P values
  assert.ok(classifyP2PPatch(50, 40, 40, 0).includes("gray_balance"));
  assert.ok(classifyP2PPatch(25, 19, 19, 0).includes("gray_balance"));
  assert.ok(classifyP2PPatch(75, 66.12, 66.12, 0).includes("gray_balance"));
  // Equal-CMY ramps and P2P offset grays are not G7 gray-balance patches
  assert.ok(!classifyP2PPatch(30, 30, 30, 0).includes("gray_balance"));
  assert.ok(!classifyP2PPatch(20, 12, 12, 0).includes("gray_balance"));
  // Not balanced
  assert.ok(!classifyP2PPatch(50, 10, 40, 0).includes("gray_balance"));
  // Has K - not gray balance
  assert.ok(!classifyP2PPatch(50, 40, 40, 10).includes("gray_balance"));
});

// ─── G7 NPDC Target ───

test("g7NpdcLTarget returns targets at defined points", () => {
  assert.ok(g7NpdcLTarget(50) > 59 && g7NpdcLTarget(50) < 62);
  assert.ok(g7NpdcLTarget(100) > 14.5 && g7NpdcLTarget(100) < 17);
  assert.ok(g7NpdcLTarget(10) > 87 && g7NpdcLTarget(10) < 89);
  assert.ok(Number.isFinite(g7NpdcLTarget(2)));
});

test("g7NpdcLTarget decreases monotonically", () => {
  const target37 = g7NpdcLTarget(37);
  const target35 = g7NpdcLTarget(35);
  const target40 = g7NpdcLTarget(40);
  assert.ok(target37 > target40);
  assert.ok(target37 < target35);
});

// ─── NPDC Verification ───

test("buildNpdcVerification computes deltaL from lab data", () => {
  const rows = [
    { channel: "K", tone: 50, lab: { l: 30, a: 0, b: 0 } },
    { channel: "K", tone: 75, lab: { l: 15, a: 0, b: 0 } },
  ];
  const result = buildNpdcVerification(rows);
  assert.equal(result.length, 2);
  assert.ok(Number.isFinite(result[0].deltaL));
  assert.ok(Number.isFinite(result[0].targetL));
});

test("buildNpdcVerification also exposes NPDC density values", () => {
  const [row] = buildNpdcVerification([
    { channel: "K", tone: 50, lab: { l: 30, a: 0, b: 0 } },
  ], { paperL: 95 });
  assert.ok(Number.isFinite(row.measuredNpdc));
  assert.ok(Number.isFinite(row.targetNpdc));
  assert.ok(row.targetNpdc > 0.45 && row.targetNpdc < 0.55);
});

test("G7 gray aim follows the paper tint: paper x 0.5 at the 50% HR patch", () => {
  const [row] = buildGrayVerification([
    { label: "HR", cmyk: { c: 50, m: 40, y: 40, k: 0 }, lab: { l: 58, a: 0.5, b: -2 } },
  ], { paperL: 95, paperLab: { l: 95, a: 1, b: -4 } });
  assert.equal(row.grayAimSource, "substrate_relative");
  assert.equal(row.targetA, 0.5);
  assert.equal(row.targetB, -2);
  assert.equal(row.chroma, 0);
});

test("g7ToneWeight follows the Idealliance formula", () => {
  assert.equal(g7ToneWeight(2), 1);
  assert.equal(g7ToneWeight(50), 1);
  assert.equal(g7ToneWeight(75), 0.625);
  assert.equal(g7ToneWeight(100), 0.25);
});

test("neutralPrintDensityFromL converts L* to print density relative to paper", () => {
  assert.equal(neutralPrintDensityFromL(95, 95), 0);
  assert.ok(neutralPrintDensityFromL(4.5, 95) > 2);
});

test("buildNpdcVerification skips rows without lab", () => {
  const rows = [
    { channel: "K", tone: 50 },
    { channel: "K", tone: 75, lab: { l: 15 } },
  ];
  const result = buildNpdcVerification(rows);
  assert.equal(result.length, 2);
  assert.ok(!Number.isFinite(result[0].deltaL));
});

test("summarizeNpdc computes average and max deltaL", () => {
  const rows = [
    { tone: 50, measuredL: 28.4, targetL: 28.4, deltaL: 0, absDeltaL: 0 },
    { tone: 75, measuredL: 14.7, targetL: 12.7, deltaL: 2, absDeltaL: 2 },
    { tone: 90, measuredL: 8.2, targetL: 7.7, deltaL: 0.5, absDeltaL: 0.5 },
  ];
  const summary = summarizeNpdc(rows);
  assert.ok(summary.avgDeltaL < 1);
  assert.equal(summary.maxDeltaL, 2);
  assert.equal(summary.count, 3);
});

test("G7 tone weighting follows the published 50%-plus dark tone reduction", () => {
  assert.equal(g7ToneWeight(25), 1);
  assert.equal(g7ToneWeight(50), 1);
  assert.equal(g7ToneWeight(100), 0.25);
});

test("summarizeWeightedDeltaL uses per-patch weighted absolute errors", () => {
  const summary = summarizeWeightedDeltaL([
    { tone: 50, weightedDeltaL: 1 },
    { tone: 100, weightedDeltaL: 2.5 },
  ], { npdcAverage: 1.5, npdcMax: 3 });
  // Average 1.75 > 1.5: G7 is pass/fail, there is no warning band.
  assert.equal(summary.status, "Fail");
  assert.equal(summary.weightedMax, 2.5);
});

// ─── Gray Balance ───

test("TR015 K aim reproduces the CRPC6 K ramp (paper L* 95, K solid L* 16) within 0.7 L*", () => {
  const crpc6K = { 10: 92.55, 25: 81.88, 50: 63.84, 75: 42.91, 90: 27.66 }; // substrate-relative L*
  for (const [tone, expected] of Object.entries(crpc6K)) {
    assert.ok(Math.abs(tr015RelativeL(Number(tone), "K", 95, 16) - expected) < 0.7, `K ${tone}`);
  }
  // CMY: the CRPC6 50/40/40 gray is L* 60.77 relative to paper with a CMY solid of L* 23.
  assert.ok(Math.abs(tr015RelativeL(50, "CMY", 95, 23) - 60.77) < 0.3);
});

test("TR015 aim ends on the measured solid and keeps the highlights unchanged", () => {
  const y = (l) => ((l + 16) / 116) ** 3;
  const solidRelative = 116 * Math.cbrt(y(20) / y(93)) - 16;
  assert.ok(Math.abs(tr015RelativeL(100, "K", 93, 20) - solidRelative) < 1e-6);
  assert.ok(Math.abs(tr015RelativeL(10, "K", 93, 20) - tr015RelativeL(10, "K", 93, 12)) < 1e-9);
  assert.ok(tr015RelativeL(80, "K", 93, 20) > tr015RelativeL(80, "K", 93, 12));
});

test("G7 NPDC is substrate-relative: a lighter/darker paper does not shift the result", () => {
  const y = (l) => ((l + 16) / 116) ** 3;
  const targetRel = tr015RelativeL(50, "K", 95, 16);
  // Same relative reproduction on a paper of L* 92 with the same relative solid.
  const toAbs = (rel, paper) => 116 * Math.cbrt(((rel + 16) / 116) ** 3 * y(paper)) - 16;
  const solid92 = toAbs(116 * Math.cbrt(y(16) / y(95)) - 16, 92);
  const [relative] = buildNpdcVerification([{ channel: "K", tone: 50, lab: { l: toAbs(targetRel, 92) } }], { paperL: 92, kSolidL: solid92 });
  assert.equal(relative.evaluation, "substrate_relative");
  assert.ok(Math.abs(relative.deltaL) < 1e-6);
});

test("G7 gray aim blends toward a non-neutral CMY solid above 50% only", () => {
  const paper = { l: 95, a: 1, b: -4 };
  const solid = { l: 23, a: 2, b: 4 };
  assert.deepEqual(tr015GrayAim(50, paper, solid), tr015GrayAim(50, paper, null));
  const aim100 = tr015GrayAim(100, paper, solid);
  assert.equal(aim100.a, 2);
  assert.equal(aim100.b, 4);
});

test("buildGrayVerification needs a tone (CMYK) for each gray patch", () => {
  const rows = [
    { label: "Gray 50", cmyk: { c: 50, m: 40, y: 40, k: 0 }, lab: { l: 58, a: 1, b: -1 } },
    { label: "no cmyk", lab: { a: 2, b: 0.5 } },
  ];
  const result = buildGrayVerification(rows);
  assert.equal(result.length, 1);
  assert.ok(result[0].chroma > 0);
});

test("summarizeGrayBalance passes when within tolerances", () => {
  const rows = [
    { label: "G1", chroma: 0.5 },
    { label: "G2", chroma: 1.0 },
    { label: "G3", chroma: 1.2 },
  ];
  const summary = summarizeGrayBalance(rows);
  assert.equal(summary.status, "Pass");
});

test("summarizeGrayBalance fails when exceeding max threshold", () => {
  const rows = [
    { label: "G1", chroma: 2 },
    { label: "G2", chroma: 8 },
  ];
  const summary = summarizeGrayBalance(rows);
  assert.equal(summary.status, "Fail");
});

test("summarizeGrayBalance fails when the weighted average exceeds 1.5", () => {
  const rows = [
    { label: "G1", chroma: 1.8 },
    { label: "G2", chroma: 2.2 },
  ];
  const summary = summarizeGrayBalance(rows);
  assert.equal(summary.status, "Fail");
});

// ─── Colorspace Verification ───

test("classifyColorspacePatches groups by G7 category", () => {
  const rows = [
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab: { l: 95, a: 0, b: -2 } },
    { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab: { l: 56, a: -35, b: -49 } },
    { cmyk_c: 0, cmyk_m: 100, cmyk_y: 0, cmyk_k: 0, lab: { l: 50, a: 72, b: -3 } },
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 100, cmyk_k: 0, lab: { l: 88, a: -5, b: 90 } },
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 100, lab: { l: 15, a: 0, b: 0 } },
  ];
  const patches = classifyColorspacePatches(rows);
  assert.ok(patches.paper);
  assert.ok(patches.c_solid);
  assert.ok(patches.m_solid);
  assert.ok(patches.y_solid);
  assert.ok(patches.k_solid);
});

test("buildColorspaceVerification computes deltaE against standard", () => {
  const patches = {
    paper: { lab: { l: 93, a: 0, b: -2 } },
    k_solid: { lab: { l: 17, a: 0, b: 0 } },
  };
  const standardPatchMap = new Map([
    ["0.00/0.00/0.00/0.00", { lab: { l: 95, a: -0.2, b: -2.2 } }],
    ["0.00/0.00/0.00/100.00", { lab: { l: 16, a: 0.3, b: 0.4 } }],
  ]);
  const result = buildColorspaceVerification(patches, standardPatchMap, deltaE76);
  assert.ok(result.length >= 9);
  const paperRow = result.find((r) => r.category === "paper");
  assert.ok(Number.isFinite(paperRow.deltaE));
});

test("buildColorspaceVerification marks missing when no data", () => {
  const result = buildColorspaceVerification({}, new Map(), deltaE76);
  assert.ok(result.every((r) => r.status === "Missing"));
});
