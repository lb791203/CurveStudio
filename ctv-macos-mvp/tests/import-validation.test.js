import assert from "node:assert/strict";
import test from "node:test";

import { parseImportText, spotColorToneValueFromXyz } from "../src/curve-engine.js";
import { measurementProblems } from "../src/measurement-validation.js";

const labToXyz100 = ({ l, a, b }) => {
  const fy = (l + 16) / 116; const fx = fy + a / 500; const fz = fy - b / 200;
  const fi = (t) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
  return { x: 96.42 * fi(fx), y: 100 * fi(fy), z: 82.51 * fi(fz) };
};

test("review M1: XYZ scale is decided from the paper, not per patch", () => {
  const paper = labToXyz100({ l: 95, a: 0, b: -2 });
  const solid = labToXyz100({ l: 8, a: 0, b: 0 });
  const dark = labToXyz100({ l: 9, a: 0, b: 0 }); // all values < 1.5 on the 0-100 scale
  const ctv = spotColorToneValueFromXyz(dark, paper, solid);
  assert.ok(ctv > 95 && ctv < 100, `ctv ${ctv}`);
  const scaled = (xyz) => ({ x: xyz.x / 100, y: xyz.y / 100, z: xyz.z / 100 });
  assert.ok(Math.abs(spotColorToneValueFromXyz(scaled(dark), scaled(paper), scaled(solid)) - ctv) < 1e-6);
});

test("review M1: CTV above 100 is flagged and excluded instead of silently clipped", () => {
  const csv = [
    "sample_id,cmyk_c,cmyk_m,cmyk_y,cmyk_k,lab_l,lab_a,lab_b,source",
    "Paper,0,0,0,0,95,0,-2,Measurement",
    "C100,100,0,0,0,56,-37,-50,Measurement",
    "C90,90,0,0,0,50,-40,-55,Measurement",
  ].join("\n");
  const parsed = parseImportText(csv);
  const c90 = parsed.measurements.find((row) => row.channel === "C" && row.tone === 90);
  assert.ok(c90.colorimetricToneRaw > 100);
  assert.ok(!Number.isFinite(c90.colorimetricTone));
  assert.ok(parsed.warnings.some((item) => /CTV 原始值/.test(item) && /已排除/.test(item)));
});

test("re-review M1: paper and solid that coincide are flagged, not silently dropped", () => {
  const csv = [
    "sample_id,cmyk_c,cmyk_m,cmyk_y,cmyk_k,lab_l,lab_a,lab_b,source",
    "Paper,0,0,0,0,95,0,-2,Measurement",
    "C100,100,0,0,0,95,0,-2,Measurement",
    "C50,50,0,0,0,94,0,-2,Measurement",
  ].join("\n");
  const parsed = parseImportText(csv);
  const c50 = parsed.measurements.find((row) => row.channel === "C" && row.tone === 50);
  assert.ok(!Number.isFinite(c50.colorimetricTone));
  assert.ok(parsed.warnings.some((item) => /太接近/.test(item)));
});

test("review M5: impossible tone values are rejected with a per-row warning", () => {
  const parsed = parseImportText("channel,tone,measured_tone\nC,50,66\nC,130,150\n");
  assert.equal(parsed.measurements.length, 1);
  assert.ok(parsed.warnings.some((item) => /150/.test(item) && /超出/.test(item)));
});

test("review M5: semicolon files with decimal commas keep their values", () => {
  const parsed = parseImportText("channel;tone;measured_tvi\nC;50;14,5\nM;50;15,25\n");
  assert.equal(parsed.measurements.length, 2);
  assert.equal(parsed.measurements.find((row) => row.channel === "C").measuredTvi, 14.5);
});

test("review M5: CGATS NUMBER_OF_SETS mismatch is reported", () => {
  const text = ["CGATS.17", "NUMBER_OF_FIELDS 3", "BEGIN_DATA_FORMAT", "CHANNEL TONE MEASURED_TVI", "END_DATA_FORMAT", "NUMBER_OF_SETS 9", "BEGIN_DATA", "C 50 14", "END_DATA"].join("\n");
  const parsed = parseImportText(text);
  assert.ok(parsed.warnings.some((item) => /声明 9/.test(item)));
});

test("review M5: manual rules reject 150 % tones, negative density and L* 123", () => {
  assert.ok(measurementProblems({ channel: "C", tone: 150, measuredTone: 200 }).length);
  assert.ok(measurementProblems({ channel: "C", tone: 50, density: -0.2 }).length);
  assert.ok(measurementProblems({ channel: "C", tone: 50, lab: { l: 123, a: 0, b: 0 } }).length);
  assert.equal(measurementProblems({ channel: "C", tone: 50, measuredTone: 66, measuredTvi: 16 }).length, 0);
});
