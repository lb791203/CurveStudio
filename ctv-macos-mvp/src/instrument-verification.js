import { average } from "./shared.js";

export const INSTRUMENT_CTV_TOLERANCE = {
  pass: 0.5,
  warning: 1.0,
};

export function buildInstrumentVerificationRows(measurements = [], options = {}) {
  const passTolerance = Number(options.passTolerance ?? INSTRUMENT_CTV_TOLERANCE.pass);
  const warningTolerance = Number(options.warningTolerance ?? INSTRUMENT_CTV_TOLERANCE.warning);

  return measurements
    .filter((row) => row && Number.isFinite(row.tone) && row.channel)
    .map((row) => {
      const softwareCtv = finiteOrNaN(row.colorimetricTone);
      const instrumentCtv = finiteOrNaN(row.instrumentCtv);
      const delta = Number.isFinite(softwareCtv) && Number.isFinite(instrumentCtv)
        ? softwareCtv - instrumentCtv
        : NaN;
      return {
        channel: row.channel,
        tone: row.tone,
        sampleId: row.sampleId || "",
        source: row.source || row.sourceFormat || "",
        softwareCtv,
        softwareMethod: row.colorimetricMethod || "",
        instrumentCtv,
        instrumentMethod: row.instrumentCtvMethod || "",
        delta,
        absDelta: Number.isFinite(delta) ? Math.abs(delta) : NaN,
        status: instrumentVerificationStatus({ softwareCtv, instrumentCtv, delta, passTolerance, warningTolerance }),
      };
    })
    .sort((a, b) => a.channel.localeCompare(b.channel) || a.tone - b.tone);
}

export function summarizeInstrumentVerification(rows = []) {
  const comparable = rows.filter((row) => Number.isFinite(row.delta));
  const missingInstrument = rows.filter((row) => Number.isFinite(row.softwareCtv) && !Number.isFinite(row.instrumentCtv)).length;
  const missingSoftware = rows.filter((row) => !Number.isFinite(row.softwareCtv)).length;
  const pass = comparable.filter((row) => row.status === "Pass").length;
  const warning = comparable.filter((row) => row.status === "Warning").length;
  const fail = comparable.filter((row) => row.status === "Fail").length;
  const maxAbsDelta = comparable.length ? Math.max(...comparable.map((row) => row.absDelta)) : NaN;
  return {
    total: rows.length,
    comparable: comparable.length,
    pass,
    warning,
    fail,
    missingInstrument,
    missingSoftware,
    avgAbsDelta: average(comparable.map((row) => row.absDelta)),
    maxAbsDelta,
    status: fail ? "Fail" : warning ? "Warning" : comparable.length ? "Pass" : missingSoftware ? "Missing Software CTV" : "Missing Instrument CTV",
  };
}

function instrumentVerificationStatus({ softwareCtv, instrumentCtv, delta, passTolerance, warningTolerance }) {
  if (!Number.isFinite(softwareCtv)) return "Missing Software CTV";
  if (!Number.isFinite(instrumentCtv)) return "Missing Instrument CTV";
  const absDelta = Math.abs(delta);
  if (absDelta <= passTolerance) return "Pass";
  if (absDelta <= warningTolerance) return "Warning";
  return "Fail";
}

function finiteOrNaN(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}
