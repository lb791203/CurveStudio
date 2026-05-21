import { average, groupByChannel } from "./shared.js?v=20260521-icc-p2";

export function buildCompensationSimulation(rows, options = {}) {
  const toleranceForTone = options.toleranceForTone || defaultToleranceForTone;
  const grouped = groupByChannel((rows || []).filter((row) => row && row.channel));
  return Object.entries(grouped).flatMap(([channel, channelRows]) => {
    const measuredCurve = buildMeasuredCurve(channelRows);
    return channelRows
      .filter((row) => isFiniteNumber(row.tone) && isFiniteNumber(row.measuredTone) && isFiniteNumber(row.targetTone) && isFiniteNumber(row.outputTone))
      .map((row) => {
        const simulatedTone = interpolateMeasuredTone(measuredCurve, Number(row.outputTone));
        const beforeDelta = Number(row.measuredTone) - Number(row.targetTone);
        const afterDelta = Number.isFinite(simulatedTone) ? simulatedTone - Number(row.targetTone) : NaN;
        const improvement = Number.isFinite(afterDelta) ? Math.abs(beforeDelta) - Math.abs(afterDelta) : NaN;
        const tolerance = toleranceForTone(Number(row.tone));
        return {
          channel,
          tone: Number(row.tone),
          measuredTone: Number(row.measuredTone),
          targetTone: Number(row.targetTone),
          outputTone: Number(row.outputTone),
          simulatedTone,
          beforeDelta,
          afterDelta,
          improvement,
          tolerance,
          status: simulationStatus(afterDelta, tolerance, improvement),
          basis: "同一次测量曲线模拟",
          pointSource: row.pointSource,
          metricName: row.metricName,
          metricMethod: row.metricMethod,
        };
      });
  });
}

export function summarizeCompensationSimulation(rows) {
  const finiteRows = (rows || []).filter((row) => Number.isFinite(row.afterDelta));
  const avgBefore = average(finiteRows.map((row) => Math.abs(row.beforeDelta)));
  const avgAfter = average(finiteRows.map((row) => Math.abs(row.afterDelta)));
  const pass = finiteRows.filter((row) => row.status === "Pass").length;
  const warning = finiteRows.filter((row) => row.status === "Warning").length;
  const fail = finiteRows.filter((row) => row.status === "Fail").length;
  const improved = finiteRows.filter((row) => row.improvement > 0.05).length;
  const worsened = finiteRows.filter((row) => row.improvement < -0.05).length;
  return {
    total: finiteRows.length,
    pass,
    warning,
    fail,
    improved,
    worsened,
    avgBefore,
    avgAfter,
    status: !finiteRows.length ? "Data Incomplete" : fail ? "Fail" : warning || worsened ? "Warning" : "Pass",
  };
}

function buildMeasuredCurve(rows) {
  const byTone = new Map();
  for (const row of rows) {
    const tone = Number(row.tone);
    const measuredTone = Number(row.measuredTone);
    if (!Number.isFinite(tone) || !Number.isFinite(measuredTone)) continue;
    if (!byTone.has(tone)) byTone.set(tone, measuredTone);
  }
  return [...byTone.entries()]
    .map(([tone, measuredTone]) => ({ tone, measuredTone }))
    .sort((a, b) => a.tone - b.tone);
}

function interpolateMeasuredTone(points, tone) {
  if (!points.length || !Number.isFinite(tone)) return NaN;
  if (tone <= points[0].tone) return points[0].measuredTone;
  const last = points[points.length - 1];
  if (tone >= last.tone) return last.measuredTone;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (tone <= right.tone) {
      const span = right.tone - left.tone;
      if (span <= 0) return left.measuredTone;
      const ratio = (tone - left.tone) / span;
      return left.measuredTone + ratio * (right.measuredTone - left.measuredTone);
    }
  }
  return NaN;
}

function simulationStatus(afterDelta, tolerance, improvement) {
  if (!Number.isFinite(afterDelta)) return "Data Incomplete";
  const absolute = Math.abs(afterDelta);
  if (absolute <= tolerance && improvement >= -0.05) return "Pass";
  if (absolute <= tolerance * 1.5 && improvement >= -0.5) return "Warning";
  return "Fail";
}

function defaultToleranceForTone(tone) {
  if (!Number.isFinite(tone) || tone <= 0 || tone >= 100) return 0.5;
  if (Math.abs(tone - 50) < 0.01) return 4;
  if (Math.abs(tone - 25) < 0.01 || Math.abs(tone - 75) < 0.01) return 3;
  return 3;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}
