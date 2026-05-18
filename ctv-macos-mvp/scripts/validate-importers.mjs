import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { calculateCompensation, parseImportText } from "../src/curve-engine.js";

const root = path.resolve("reference-data");
const supported = new Set([".txt", ".csv"]);
const files = (await listFiles(root)).filter((file) => supported.has(path.extname(file).toLowerCase()));
const rows = [];
let failures = 0;

for (const file of files) {
  const text = await readFile(file, "utf8");
  const parsed = parseImportText(text);
  const results = calculateCompensation(parsed.measurements, { mode: "tvi", target: "isoB", smooth: 0, limit: 18 });
  const relative = path.relative(process.cwd(), file);
  const isStructuredFixture = /\b(BEGIN_DATA_FORMAT|BEGIN_DATA)\b/i.test(text);
  const usable = parsed.measurements.filter((row) => Number.isFinite(row.measuredTvi) || Number.isFinite(row.measuredTone) || Number.isFinite(row.density)).length;

  if (isStructuredFixture && !parsed.rawRows.length) failures += 1;

  rows.push({
    file: relative,
    format: parsed.sourceFormat,
    fields: parsed.fields.length,
    patches: parsed.rawRows.length,
    tones: parsed.measurements.length,
    usable,
    curves: results.length,
    warning: parsed.warnings[0] || "",
  });
}

console.table(rows);
if (failures) {
  console.error(`${failures} structured fixture(s) did not parse data rows.`);
  process.exit(1);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(fullPath));
    else out.push(fullPath);
  }
  return out.sort();
}
