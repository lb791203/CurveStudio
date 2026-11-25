// Generates samples/g7-demo-synthetic.txt: a fully synthetic G7-style press sheet.
// No third-party data is used: the ink and paper colours below are made-up round numbers,
// the patch set is our own (paper, solids, overprints, K ramp, CMY gray ramp on the G7
// gray ratio, single-ink ramps), and Lab values come from a simple Yule-Nielsen / Demichel
// model with a sine-shaped dot gain. It is demo data, not a measurement.
// Usage: node scripts/generate-demo-g7.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { g7GrayMagentaYellowFor } from "../src/shared.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Invented colorants (Lab, D50). Paper slightly blue, magenta a bit strong -> small red cast.
const PAPER = [94, 0.5, -3];
const INK = { c: [56, -36, -50], m: [48, 74, -4], y: [89, -4, 92], k: [17, 0.5, 0.5] };
const GAIN = { c: 14, m: 16, y: 14, k: 17 }; // extra dot gain at 50 %
const N = 1.7; // Yule-Nielsen factor

const WHITE = [0.9642, 1, 0.8251];
const f = (t) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
const fi = (t) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
function labToXyz([l, a, b]) {
  const fy = (l + 16) / 116;
  return [fi(fy + a / 500) * WHITE[0], fi(fy) * WHITE[1], fi(fy - b / 200) * WHITE[2]];
}
function xyzToLab([x, y, z]) {
  const fx = f(x / WHITE[0]); const fy = f(y / WHITE[1]); const fz = f(z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const paperXyz = labToXyz(PAPER);
// Transmittance of each ink layer relative to paper; overprints multiply.
const trans = Object.fromEntries(Object.entries(INK).map(([ink, lab]) => [ink, labToXyz(lab).map((v, i) => v / paperXyz[i])]));
const printed = (tone, peak) => Math.min(1, Math.max(0, (tone + peak * Math.sin(Math.PI * tone / 100)) / 100));

function patchLab(c, m, y, k) {
  const area = { c: printed(c, GAIN.c), m: printed(m, GAIN.m), y: printed(y, GAIN.y), k: printed(k, GAIN.k) };
  const inks = ["c", "m", "y", "k"];
  const result = [0, 0, 0];
  for (let mask = 0; mask < 16; mask += 1) {
    let weight = 1;
    const t = [1, 1, 1];
    inks.forEach((ink, index) => {
      const on = (mask >> index) & 1;
      weight *= on ? area[ink] : 1 - area[ink];
      if (on) for (let i = 0; i < 3; i += 1) t[i] *= trans[ink][i];
    });
    for (let i = 0; i < 3; i += 1) result[i] += weight * (paperXyz[i] * t[i]) ** (1 / N);
  }
  return xyzToLab(result.map((v) => v ** N));
}

const patches = [];
const add = (name, c, m, y, k) => patches.push({ name, cmyk: [c, m, y, k].map((v) => Number(v.toFixed(2))) });
add("Paper", 0, 0, 0, 0);
for (const [ink, idx] of [["C", 0], ["M", 1], ["Y", 2], ["K", 3]]) {
  for (const tone of [5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100]) {
    const cmyk = [0, 0, 0, 0]; cmyk[idx] = tone;
    add(`${ink}${tone}`, ...cmyk);
  }
}
add("Red", 0, 100, 100, 0); add("Green", 100, 0, 100, 0); add("Blue", 100, 100, 0, 0); add("CMY", 100, 100, 100, 0);
for (const c of [5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90]) {
  const my = g7GrayMagentaYellowFor(c);
  add(`Gray${c}`, c, my, my, 0);
}

const lines = [
  "CGATS.17",
  'ORIGINATOR "CurveStudio generate-demo-g7.mjs"',
  'DESCRIPTOR "Synthetic G7-style demo sheet (made-up data, not a real measurement)"',
  'MEASUREMENT_SOURCE "Synthetic Yule-Nielsen model"',
  'MEASUREMENT_CONDITION "M1"',
  "NUMBER_OF_FIELDS 9",
  "BEGIN_DATA_FORMAT",
  "SAMPLE_ID\tSAMPLE_NAME\tCMYK_C\tCMYK_M\tCMYK_Y\tCMYK_K\tLAB_L\tLAB_A\tLAB_B",
  "END_DATA_FORMAT",
  `NUMBER_OF_SETS ${patches.length}`,
  "BEGIN_DATA",
  ...patches.map((patch, index) => [index + 1, patch.name, ...patch.cmyk, ...patchLab(...patch.cmyk).map((v) => v.toFixed(2))].join("\t")),
  "END_DATA",
  "",
];
fs.writeFileSync(path.join(root, "samples/g7-demo-synthetic.txt"), lines.join("\n"));
console.log(`wrote ${patches.length} patches`);
