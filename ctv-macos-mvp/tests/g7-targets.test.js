import assert from "node:assert/strict";
import test from "node:test";

import { classifyP2PPatch, g7NpdcLTarget, buildNpdcVerification, summarizeNpdc,
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
  // Classic CMY balanced: C slightly higher than M≈Y
  assert.ok(classifyP2PPatch(50, 40, 40, 0).includes("gray_balance"));
  assert.ok(classifyP2PPatch(25, 22, 22, 0).includes("gray_balance"));
  // Not balanced
  assert.ok(!classifyP2PPatch(50, 10, 40, 0).includes("gray_balance"));
  // Has K - not gray balance
  assert.ok(!classifyP2PPatch(50, 40, 40, 10).includes("gray_balance"));
});

// ─── G7 NPDC Target ───

test("g7NpdcLTarget returns targets at defined points", () => {
  assert.ok(g7NpdcLTarget(50) > 59 && g7NpdcLTarget(50) < 62);
  assert.ok(g7NpdcLTarget(100) > 15 && g7NpdcLTarget(100) < 17);
  assert.ok(g7NpdcLTarget(10) > 87 && g7NpdcLTarget(10) < 89);
  assert.ok(Number.isFinite(g7NpdcLTarget(2)));
});

test("g7NpdcLTarget interpolates between defined points", () => {
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

test("buildNpdcVerification can use selected standard K-only Lab as target", () => {
  const standardPatchMap = new Map([
    ["0.00/0.00/0.00/0.00", { cmyk: { c: 0, m: 0, y: 0, k: 0 }, lab: { l: 95, a: 0, b: 0 } }],
    ["0.00/0.00/0.00/40.00", { cmyk: { c: 0, m: 0, y: 0, k: 40 }, lab: { l: 67, a: 0, b: 0 } }],
    ["0.00/0.00/0.00/60.00", { cmyk: { c: 0, m: 0, y: 0, k: 60 }, lab: { l: 53, a: 0, b: 0 } }],
  ]);
  const [row] = buildNpdcVerification([
    { channel: "K", tone: 50, lab: { l: 61, a: 0, b: 0 } },
  ], { paperL: 95, standardPatchMap });

  assert.equal(row.targetSource, "standard");
  assert.equal(row.targetL, 60);
  assert.equal(row.deltaL, 1);
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
  assert.equal(summary.status, "Warning");
  assert.equal(summary.weightedMax, 2.5);
});

// ─── Gray Balance ───

test("buildGrayVerification computes chroma from a*/b*", () => {
  const rows = [
    { label: "Gray 50", lab: { a: 1, b: -1 } },
    { label: "Gray 75", lab: { a: 2, b: 0.5 } },
  ];
  const result = buildGrayVerification(rows);
  assert.equal(result.length, 2);
  assert.ok(result[0].chroma > 0);
  assert.ok(result[1].chroma > 0);
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

test("summarizeGrayBalance warns when between avg pass and fail", () => {
  const rows = [
    { label: "G1", chroma: 1.8 },
    { label: "G2", chroma: 2.2 },
  ];
  const summary = summarizeGrayBalance(rows);
  assert.equal(summary.status, "Warning");
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
