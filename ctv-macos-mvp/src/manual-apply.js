// Manual table → measurements. Raw cells are checked first (blank = not measured, text = invalid),
// then plausibility limits, and only the rows that passed feed the derived values (solid/paper
// density, Lab references) and the stored measurement set.
import {
  canCalculateCurve,
  enrichManualColorimetricRow,
  enrichManualDensityRow,
  labFromManual,
  labReferenceByChannel,
  normalizeManualRow,
  paperDensityFromRows,
  solidDensityByChannel,
} from "./manual-table.js";
import { manualInputProblems, measurementProblems } from "./measurement-validation.js";

export function buildManualMeasurementSet(manualRows = []) {
  const rejected = [];
  const accepted = [];
  manualRows.forEach((raw, index) => {
    const label = `第 ${index + 1} 行 ${raw.channel || ""} ${raw.tone ?? ""}%`;
    const inputProblems = manualInputProblems(raw);
    if (inputProblems.length) {
      rejected.push(`${label}：${inputProblems.map((item) => item.message).join("；")}，已忽略`);
      return;
    }
    const row = normalizeManualRow(raw);
    const problems = measurementProblems({ ...row, lab: labFromManual(row) });
    if (problems.length) {
      rejected.push(`${label}：${problems.map((item) => item.message).join("；")}，已忽略`);
      return;
    }
    accepted.push(row);
  });

  const solidDensities = solidDensityByChannel(accepted);
  const paperDensity = paperDensityFromRows(accepted);
  const labReferences = labReferenceByChannel(accepted);
  const curveRows = accepted
    .map((row) => enrichManualDensityRow(row, solidDensities, paperDensity))
    .map((row) => enrichManualColorimetricRow(row, labReferences))
    .filter((row) => canCalculateCurve(row));

  const measurements = curveRows.map((row) => ({
    patchType: row.patchType,
    channel: row.channel,
    tone: row.tone,
    measuredTone: Number.isFinite(row.measuredTone) ? row.measuredTone : undefined,
    measuredToneMethod: row.measuredToneMethod,
    density: Number.isFinite(row.density) ? row.density : undefined,
    solidDensity: Number.isFinite(solidDensities[row.channel]) ? solidDensities[row.channel] : undefined,
    paperDensity: Number.isFinite(paperDensity) ? paperDensity : undefined,
    colorimetricTone: Number.isFinite(row.colorimetricTone) ? row.colorimetricTone : undefined,
    colorimetricMethod: row.colorimetricMethod,
    instrumentCtv: Number.isFinite(row.instrumentCtv) ? row.instrumentCtv : undefined,
    instrumentCtvMethod: row.instrumentCtvMethod,
    lab: labFromManual(row),
    source: row.source,
    note: row.note,
    sourceFormat: "Manual Table",
  }));
  return { acceptedRows: accepted, curveRows, measurements, rejected, solidDensities, paperDensity };
}
