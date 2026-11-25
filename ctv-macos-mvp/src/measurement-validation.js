// One set of plausibility rules for imported files and the manual table, so neither path
// accepts values that cannot be a real measurement (e.g. 150 % dot, negative density, L* 123).

export const LIMITS = {
  tone: [0, 100],
  measuredTone: [0, 100],
  measuredTvi: [-50, 60],
  density: [0, 4],
  labL: [0, 100],
  labAB: [-150, 150],
};

const LABELS = {
  tone: "网点",
  measuredTone: "实测网点",
  measuredTvi: "TVI",
  density: "密度",
  labL: "L*",
  labA: "a*",
  labB: "b*",
};

// Returns the problems of one measurement row ([] when it is usable).
export function measurementProblems(row = {}) {
  const problems = [];
  const check = (key, value, [min, max]) => {
    // Blank is "not measured" (a parsed empty cell is NaN); text that is not a number is caught
    // earlier by manualInputProblems / the importer and never reaches here as NaN.
    if (value === undefined || value === null || value === "" || (typeof value === "number" && Number.isNaN(value))) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
      problems.push({ field: key, value, message: `${LABELS[key] || key} ${formatValue(value)} 超出 ${min}–${max}` });
    }
  };
  check("tone", row.tone, LIMITS.tone);
  check("measuredTone", row.measuredTone, LIMITS.measuredTone);
  check("measuredTvi", row.measuredTvi, LIMITS.measuredTvi);
  check("density", row.density, LIMITS.density);
  if (row.lab) {
    check("labL", row.lab.l, LIMITS.labL);
    check("labA", row.lab.a, LIMITS.labAB);
    check("labB", row.lab.b, LIMITS.labAB);
  }
  const tone = Number(row.tone);
  const measuredTone = Number(row.measuredTone);
  const measuredTvi = Number(row.measuredTvi);
  if (Number.isFinite(tone) && Number.isFinite(measuredTone) && Number.isFinite(measuredTvi)
    && Math.abs(measuredTone - tone - measuredTvi) > 0.6) {
    problems.push({ field: "measuredTvi", value: measuredTvi, message: `实测网点 ${formatValue(measuredTone)} 与 TVI ${formatValue(measuredTvi)} 不一致` });
  }
  return problems;
}

// Raw manual-table cells: blank is allowed, anything else must be a number.
const MANUAL_FIELDS = { tone: "网点", measuredTone: "实测网点", density: "密度", labL: "L*", labA: "a*", labB: "b*" };
export function manualInputProblems(row = {}) {
  return Object.entries(MANUAL_FIELDS)
    .filter(([key]) => {
      const value = row[key];
      if (value === undefined || value === null || String(value).trim() === "") return false;
      return !Number.isFinite(Number(String(value).trim().replace(",", ".")));
    })
    .map(([key, label]) => ({ field: key, value: row[key], message: `${label} "${row[key]}" 不是数字` }));
}

// Splits measurements into usable rows and warnings (one line per rejected row).
export function validateMeasurements(measurements = []) {
  const valid = [];
  const warnings = [];
  measurements.forEach((row, index) => {
    const problems = measurementProblems(row);
    if (problems.length) {
      warnings.push(`第 ${index + 1} 条 ${row.channel || ""} ${formatValue(row.tone)}%：${problems.map((item) => item.message).join("；")}，已忽略`);
    } else {
      valid.push(row);
    }
  });
  for (const row of valid) {
    for (const flag of row.colorimetricFlags || []) {
      if (flag === "out_of_range") warnings.push(`${row.channel} ${formatValue(row.tone)}%：CTV 原始值 ${formatValue(row.colorimetricToneRaw)} 超出 0–100，请检查纸白/实地色块`);
      if (flag === "low_contrast") warnings.push(`${row.channel} ${formatValue(row.tone)}%：纸白与实地颜色太接近，CTV 不可靠`);
    }
  }
  return { valid, warnings };
}

function formatValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Number(numeric.toFixed(2))) : String(value);
}
