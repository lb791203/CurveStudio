import { buildDiagnosticRows } from "./curve-engine.js";
import { labDistance, number } from "./shared.js";

const RECOMPUTE_TOLERANCE = 0.015;
const DEFAULT_TVI_TOLERANCE = 5;
const DEFAULT_SOLID_DELTA_E_TOLERANCE = 5;
const DEFAULT_GRAY_DELTA_H_TOLERANCE = 2;

export function auditMeasurementCsv(report) {
  const lines = ["channel,input_tone,measured_tone,measured_tvi,patch_type,source"];
  for (const item of report?.tviDotGain || []) {
    for (const [tone, tvi] of Object.entries(item.print || {})) {
      lines.push([
        item.channel,
        tone,
        number(tone) + number(tvi),
        tvi,
        "tone",
        `${report.source?.software || "Audit report"} summary`,
      ].join(","));
    }
  }
  return lines.join("\n");
}

export function buildAuditReportComparison(report) {
  if (!report) return null;
  const tviRows = buildTviRows(report);
  const substrateRows = buildSubstrateRows(report);
  const labRows = [
    ...buildLabRows("Solid", report.solidColours || []),
    ...buildLabRows("Overprint", report.overprints || []),
  ];
  const grayRows = buildGrayRows(report);
  const densityRows = buildDensityRows(report);

  return {
    title: `${report.job?.customerName || "Customer"} / ${report.job?.machineModel || report.job?.pressPrinter || "Press"}`,
    subtitle: `${report.source?.software || "Audit report"} / ${report.standard?.name || ""}`,
    standard: report.standard || {},
    job: report.job || {},
    overall: report.auditSummary || {},
    counts: {
      tvi: countAuditRows(tviRows),
      substrate: countAuditRows(substrateRows),
      lab: countAuditRows(labRows),
      gray: countAuditRows(grayRows),
      density: countAuditRows(densityRows),
    },
    recomputeCounts: {
      tvi: countRecomputeRows(tviRows),
      substrate: countRecomputeRows(substrateRows),
      lab: countRecomputeRows(labRows),
      gray: countRecomputeRows(grayRows),
    },
    tviRows,
    substrateRows,
    labRows,
    grayRows,
    densityRows,
  };
}

function buildTviRows(report) {
  return (report.tviDotGain || []).flatMap((item) => {
    const tolerance = number(item.tolerance ?? report.auditRules?.tviDotGainTolerance ?? DEFAULT_TVI_TOLERANCE);
    const targetPoints = Object.entries(item.target || {})
      .map(([tone, value]) => [number(tone), number(value)])
      .sort((a, b) => a[0] - b[0]);
    const measurements = Object.entries(item.print || {}).map(([tone, value]) => ({
      channel: item.channel,
      tone: number(tone),
      measuredTone: number(tone) + number(value),
      measuredTvi: number(value),
      patchType: "tone",
    }));
    return buildDiagnosticRows(measurements, { mode: "tvi", targetPoints }).map((row) => {
      const toneKey = String(row.tone);
      const reportMeasured = number(item.print?.[toneKey]);
      const reportTarget = number(item.target?.[toneKey]);
      const reportDelta = reportMeasured - reportTarget;
      const auditDelta = round(reportDelta);
      return {
        channel: item.channel,
        tone: row.tone,
        computed: round(row.measuredTvi),
        report: round(reportMeasured),
        targetComputed: round(row.targetTvi),
        targetReport: round(reportTarget),
        deltaComputed: round(row.tviDelta),
        deltaReport: auditDelta,
        tolerance: round(tolerance),
        auditStatus: passTolerance(Math.abs(reportDelta), tolerance) ? "Pass" : "Check",
        recomputeStatus: passRecompute(row.measuredTvi, reportMeasured) && passRecompute(row.targetTvi, reportTarget) ? "Pass" : "Check",
      };
    });
  });
}

function buildSubstrateRows(report) {
  const substrate = report.substrate;
  if (!substrate?.targetLab || !substrate?.printLab || !substrate?.error) return [];
  return ["l", "a", "b"].map((axis) => {
    const computed = Math.abs(number(substrate.printLab[axis]) - number(substrate.targetLab[axis]));
    const reportValue = number(substrate.error[axis]);
    const tolerance = number(substrate.isoTolerance?.[axis]);
    return {
      patch: "Substrate",
      metric: axis.toUpperCase(),
      computed: round(computed),
      report: round(reportValue),
      tolerance: round(tolerance),
      auditStatus: passTolerance(reportValue, tolerance) ? "Pass" : "Check",
      recomputeStatus: passRecompute(computed, reportValue) ? "Pass" : "Check",
    };
  });
}

function buildLabRows(section, rows) {
  return rows.map((row) => {
    const computed = labDistance(row.printLab, row.targetLab);
    const reportValue = number(row.printDeltaE);
    const tolerance = Number.isFinite(number(row.toleranceDeltaE))
      ? number(row.toleranceDeltaE)
      : section === "Solid"
        ? DEFAULT_SOLID_DELTA_E_TOLERANCE
        : null;
    return {
      section,
      patch: row.patch,
      computed: round(computed),
      report: round(reportValue),
      tolerance: Number.isFinite(tolerance) ? round(tolerance) : "N/A",
      auditStatus: Number.isFinite(tolerance) ? (passTolerance(reportValue, tolerance) ? "Pass" : "Check") : "Review",
      recomputeStatus: passRecompute(computed, reportValue) ? "Pass" : "Check",
    };
  });
}

function buildGrayRows(report) {
  return (report.threeColourGreys || []).map((row) => {
    const computed = Math.hypot(
      number(row.printLab?.a) - number(row.targetLab?.a),
      number(row.printLab?.b) - number(row.targetLab?.b),
    );
    const reportValue = number(row.printDeltaH);
    const tolerance = Number.isFinite(number(row.toleranceDeltaH)) ? number(row.toleranceDeltaH) : DEFAULT_GRAY_DELTA_H_TOLERANCE;
    return {
      patch: row.patch,
      computed: round(computed),
      report: round(reportValue),
      tolerance: round(tolerance),
      auditStatus: passTolerance(reportValue, tolerance) ? "Pass" : "Check",
      recomputeStatus: passRecompute(computed, reportValue) ? "Pass" : "Check",
    };
  });
}

function buildDensityRows(report) {
  return (report.density || []).flatMap((item) =>
    Object.keys(item.target || {}).map((tone) => ({
      channel: item.channel,
      tone: number(tone),
      target: round(item.target[tone]),
      print: round(item.print?.[tone]),
      delta: round(number(item.print?.[tone]) - number(item.target[tone])),
      tolerance: "N/A",
      auditStatus: "Reference",
    })),
  );
}

function countAuditRows(rows) {
  return {
    total: rows.length,
    pass: rows.filter((row) => row.auditStatus === "Pass").length,
    review: rows.filter((row) => row.auditStatus === "Review" || row.auditStatus === "Reference").length,
    check: rows.filter((row) => row.auditStatus === "Check").length,
  };
}

function countRecomputeRows(rows) {
  return {
    total: rows.length,
    pass: rows.filter((row) => row.recomputeStatus === "Pass").length,
    check: rows.filter((row) => row.recomputeStatus !== "Pass").length,
  };
}

function passRecompute(a, b) {
  return Math.abs(number(a) - number(b)) <= RECOMPUTE_TOLERANCE;
}

function passTolerance(value, tolerance) {
  const numeric = number(value);
  const limit = number(tolerance);
  return Number.isFinite(numeric) && Number.isFinite(limit) && numeric <= limit;
}

function round(value, digits = 2) {
  const numeric = number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : null;
}
