// What curve was in the RIP when the measured sheet was printed.
//
// Re-measurement stacks the new correction on that curve: plate = baseline(increment(tone)).
// The baseline must be the curve that was actually applied, not merely the newest saved run,
// so each measurement carries an explicit baseline snapshot ("linear" or a copy of an applied
// curve). Recalculating or reopening a run uses the same snapshot and never looks it up again.

export const LINEAR_BASELINE = Object.freeze({ kind: "linear" });
const APPLIED_LIMIT = 40;

export function normalizeBaseline(baseline) {
  if (baseline?.kind === "curve" && hasCurvePoints(baseline.curvePoints)) {
    return {
      kind: "curve",
      id: String(baseline.id || ""),
      label: String(baseline.label || ""),
      createdAt: String(baseline.createdAt || ""),
      job: baseline.job || {},
      curvePoints: cloneCurvePoints(baseline.curvePoints),
      auto: Boolean(baseline.auto),
    };
  }
  return { kind: "linear", auto: Boolean(baseline?.auto) };
}

export function baselineCurvePoints(baseline) {
  return baseline?.kind === "curve" && hasCurvePoints(baseline.curvePoints) ? baseline.curvePoints : null;
}

// Snapshot of a curve that was exported to the RIP. rows are the full export rows
// (all channels), so the snapshot is complete even when only some channels were re-measured.
export function appliedCurveSnapshot({ rows = [], job = {}, createdAt = new Date().toISOString(), id } = {}) {
  const curvePoints = curvePointsFromRows(rows);
  if (!hasCurvePoints(curvePoints)) return null;
  const stamp = createdAt;
  return {
    id: id || `curve-${stamp.replace(/[^0-9]/g, "").slice(0, 17)}`,
    createdAt: stamp,
    label: [job.customer, job.press, job.paper].filter(Boolean).join(" / "),
    job: { customer: job.customer || "", press: job.press || "", paper: job.paper || "" },
    curvePoints,
  };
}

export function addAppliedCurve(list = [], snapshot) {
  if (!snapshot) return list;
  const signature = JSON.stringify(snapshot.curvePoints);
  // The same curve exported for another job is a separate record; only repeats within one job collapse.
  const rest = list.filter((item) => item.id !== snapshot.id
    && !(sameJob(item.job || {}, snapshot.job || {}) && JSON.stringify(item.curvePoints) === signature));
  return [snapshot, ...rest].slice(0, APPLIED_LIMIT);
}

export function appliedCurvesForJob(list = [], job = {}) {
  return list.filter((item) => sameJob(item.job || {}, job));
}

// Default for a new measurement: the newest curve exported for the same customer, press and
// paper; otherwise linear. Only exported curves qualify — candidates that were calculated and
// auto-saved but never sent to the RIP are not baselines.
export function defaultBaseline(list = [], job = {}) {
  const [latest] = appliedCurvesForJob(list, job);
  return latest ? { ...baselineFromApplied(latest), auto: true } : { ...LINEAR_BASELINE, auto: true };
}

export function baselineFromApplied(item) {
  if (!item) return { ...LINEAR_BASELINE };
  return normalizeBaseline({ kind: "curve", id: item.id, label: item.label, createdAt: item.createdAt, job: item.job, curvePoints: item.curvePoints });
}

// Full RIP export: re-measured channels come from the new results, channels that were not
// re-measured keep the baseline curve unchanged instead of disappearing.
export function withBaselineChannels(results = [], baseline) {
  const points = baselineCurvePoints(baseline);
  if (!points) return results;
  const present = new Set(results.map((row) => row.channel));
  const extra = [];
  for (const [channel, channelPoints] of Object.entries(points)) {
    if (present.has(channel)) continue;
    for (const [tone, outputTone] of channelPoints) {
      extra.push({
        channel,
        tone,
        outputTone,
        autoOutputTone: outputTone,
        productionOutputTone: outputTone,
        theoreticalOutputTone: outputTone,
        correction: outputTone - tone,
        theoreticalCorrection: outputTone - tone,
        measuredTvi: NaN,
        targetTvi: NaN,
        measuredTone: NaN,
        targetTone: NaN,
        tviDelta: NaN,
        interpolated: true,
        fromBaseline: true,
        metricName: "baseline",
        metricMethod: "kept_from_rip_baseline",
      });
    }
  }
  if (!extra.length) return results;
  return [...results, ...extra].sort((a, b) => a.channel.localeCompare(b.channel) || a.tone - b.tone);
}

export function curvePointsFromRows(rows = []) {
  const byChannel = {};
  for (const row of rows) {
    const tone = Number(row.tone);
    const output = Number(row.outputTone);
    if (!row.channel || !Number.isFinite(tone) || !Number.isFinite(output)) continue;
    (byChannel[row.channel] ||= []).push([tone, Number(output.toFixed(3))]);
  }
  for (const points of Object.values(byChannel)) points.sort((a, b) => a[0] - b[0]);
  return byChannel;
}

function sameJob(a, b) {
  const same = (x, y) => String(x || "").trim() === String(y || "").trim();
  if (!same(a.customer, b.customer) || !same(a.press, b.press)) return false;
  // A different paper is a different print condition; only compare when both are known.
  const paperA = String(a.paper || "").trim();
  const paperB = String(b.paper || "").trim();
  return !paperA || !paperB || paperA === paperB;
}

function hasCurvePoints(points) {
  return Boolean(points) && typeof points === "object"
    && Object.values(points).some((list) => Array.isArray(list) && list.length >= 2);
}

function cloneCurvePoints(points) {
  return Object.fromEntries(Object.entries(points).map(([channel, list]) => [channel, list.map(([a, b]) => [Number(a), Number(b)])]));
}
