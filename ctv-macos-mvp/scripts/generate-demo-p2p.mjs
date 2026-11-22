// Generates samples/g7-p2p51-simulated.txt: a synthetic P2P51 press sheet built only
// from public reference data in this repository (CGATS21-2 CRPC6 characterization) and
// a made-up press behaviour, so demos and tests need no third-party or customer files.
//
// Press model: each ink prints with extra dot gain on top of CRPC6
// (C/M/Y +4%, K +6% at 50%, sine-shaped), magenta slightly heavier (+1.5%) to give a
// small red cast in the grays, and a paper that is 1.5 L* darker with b* -1.5 bluer
// (simple paper-tint blend, strongest in the highlights).
// Usage: node scripts/generate-demo-p2p.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseImportText } from "../src/curve-engine.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reference = parseImportText(fs.readFileSync(path.join(root, "reference-data/standards/cgats21-iso15339/CGATS21-2-CRPC6.txt"), "utf8"));
const target = parseImportText(fs.readFileSync(path.join(root, "reference-data/targets/p2p/P2P51.txt"), "utf8"));

const LEVELS = [0, 10, 20, 30, 40, 55, 70, 85, 100];
const grid = new Map();
const kRamp = [];
for (const row of reference.rawRows) {
  const c = Number(row.cmyk_c); const m = Number(row.cmyk_m); const y = Number(row.cmyk_y); const k = Number(row.cmyk_k);
  const lab = [Number(row.lab_l), Number(row.lab_a), Number(row.lab_b)];
  if (k === 0 && [c, m, y].every((v) => LEVELS.includes(v))) grid.set(`${c}/${m}/${y}`, lab);
  if (c === 0 && m === 0 && y === 0) kRamp.push([k, lab]);
}
kRamp.sort((a, b) => a[0] - b[0]);

const gain = (tone, peak) => Math.min(100, tone + peak * Math.sin(Math.PI * tone / 100));
const bracket = (v) => {
  for (let i = 1; i < LEVELS.length; i += 1) if (v <= LEVELS[i]) return [LEVELS[i - 1], LEVELS[i]];
  return [85, 100];
};
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function cmyLab(c, m, y) {
  const [c0, c1] = bracket(c); const [m0, m1] = bracket(m); const [y0, y1] = bracket(y);
  const tc = (c - c0) / (c1 - c0 || 1); const tm = (m - m0) / (m1 - m0 || 1); const ty = (y - y0) / (y1 - y0 || 1);
  const at = (cc, mm, yy) => grid.get(`${cc}/${mm}/${yy}`);
  const x00 = lerp(at(c0, m0, y0), at(c1, m0, y0), tc);
  const x10 = lerp(at(c0, m1, y0), at(c1, m1, y0), tc);
  const x01 = lerp(at(c0, m0, y1), at(c1, m0, y1), tc);
  const x11 = lerp(at(c0, m1, y1), at(c1, m1, y1), tc);
  return lerp(lerp(x00, x10, tm), lerp(x01, x11, tm), ty);
}

function kLab(k) {
  for (let i = 1; i < kRamp.length; i += 1) {
    const [k0, l0] = kRamp[i - 1]; const [k1, l1] = kRamp[i];
    if (k <= k1) return lerp(l0, l1, (k - k0) / (k1 - k0 || 1));
  }
  return kRamp.at(-1)[1];
}

function pressLab(c, m, y, k) {
  const pc = gain(c, 4); const pm = Math.min(100, gain(m, 4) + 1.5 * Math.sin(Math.PI * m / 100)); const py = gain(y, 4); const pk = gain(k, 6);
  let lab;
  if (k > 0 && c + m + y > 0) {
    // 4-colour patches (only the 100/100/100/100 corner on P2P51): darken CMY by K.
    const cmy = cmyLab(pc, pm, py); const kk = kLab(pk);
    lab = [cmy[0] * kk[0] / 95, (cmy[1] + kk[1]) / 2, (cmy[2] + kk[2]) / 2];
  } else if (k > 0) {
    lab = kLab(pk);
  } else {
    lab = cmyLab(pc, pm, py);
  }
  const paperShare = 1 - Math.max(c, m, y, k) / 100;
  return [lab[0] - 1.5 * paperShare, lab[1], lab[2] - 1.5 * paperShare];
}

const lines = [
  "CGATS.17",
  'ORIGINATOR "CurveStudio generate-demo-p2p.mjs"',
  'DESCRIPTOR "Simulated P2P51 press sheet (synthetic demo data, not a real measurement)"',
  'MEASUREMENT_SOURCE "Synthetic: CGATS21-2 CRPC6 + simulated dot gain"',
  'MEASUREMENT_CONDITION "M1"',
  "NUMBER_OF_FIELDS 9",
  "BEGIN_DATA_FORMAT",
  "SAMPLE_ID\tSAMPLE_NAME\tCMYK_C\tCMYK_M\tCMYK_Y\tCMYK_K\tLAB_L\tLAB_A\tLAB_B",
  "END_DATA_FORMAT",
  `NUMBER_OF_SETS ${target.rawRows.length}`,
  "BEGIN_DATA",
];
target.rawRows.forEach((row, index) => {
  const cmyk = [row.cmyk_c, row.cmyk_m, row.cmyk_y, row.cmyk_k].map(Number);
  const lab = pressLab(...cmyk);
  lines.push([index + 1, row.sample_name || index + 1, ...cmyk, ...lab.map((v) => v.toFixed(2))].join("\t"));
});
lines.push("END_DATA", "");
fs.writeFileSync(path.join(root, "samples/g7-p2p51-simulated.txt"), lines.join("\n"));
console.log(`wrote ${target.rawRows.length} patches`);
