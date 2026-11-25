// What curve was in the RIP when the measured sheet was printed.
//
// Re-measurement stacks the new correction on that curve: plate = baseline(increment(tone)).
// The baseline must be the curve that was actually applied, not merely the newest saved run,
// so each measurement carries an explicit baseline snapshot ("linear" or a copy of an applied
// curve). Recalculating or reopening a run uses the same snapshot and never looks it up again.
//
// "Exported" and "applied to the RIP" are different facts. Exporting a file only records a
// candidate; it becomes a default baseline once the operator confirms the sheet was printed
// with it (choosing it in the baseline selector). A curve is never the default baseline for
// the very measurement it was computed from (re-importing the same file must not stack again).

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
export function appliedCurveSnapshot({ rows = [], job = {}, createdAt = new Date().toISOString(), id, sourceFingerprint = "" } = {}) {
  const curvePoints = curvePointsFromRows(rows);
  if (!hasCurvePoints(curvePoints)) return null;
  const stamp = createdAt;
  return {
    id: id || `curve-${stamp.replace(/[^0-9]/g, "").slice(0, 17)}`,
    createdAt: stamp,
    label: [job.customer, job.press, job.paper].filter(Boolean).join(" / "),
    job: { customer: job.customer || "", press: job.press || "", paper: job.paper || "" },
    curvePoints,
    sourceFingerprint: String(sourceFingerprint || ""),
    appliedAt: "",
  };
}

// The operator confirmed this exported curve is (was) loaded in the RIP.
export function confirmApplied(list = [], id, appliedAt = new Date().toISOString()) {
  return list.map((item) => (item.id === id ? { ...item, appliedAt: item.appliedAt || appliedAt } : item));
}

export function isConfirmedApplied(item) {
  return Boolean(item?.appliedAt);
}

export function addAppliedCurve(list = [], snapshot) {
  if (!snapshot) return list;
  const signature = JSON.stringify(snapshot.curvePoints);
  // The same curve exported for another job is a separate record; only repeats within one job collapse.
  const same = list.find((item) => item.id !== snapshot.id
    && sameJob(item.job || {}, snapshot.job || {}) && JSON.stringify(item.curvePoints) === signature);
  const rest = list.filter((item) => item.id !== snapshot.id && item !== same);
  // Re-exporting a curve that was already confirmed keeps the confirmation.
  const merged = same?.appliedAt ? { ...snapshot, appliedAt: same.appliedAt } : snapshot;
  return [merged, ...rest].slice(0, APPLIED_LIMIT);
}

export function appliedCurvesForJob(list = [], job = {}) {
  return list.filter((item) => sameJob(item.job || {}, job));
}

// Default for a new measurement: the newest curve the operator confirmed as loaded in the RIP
// for the same customer, press and paper, excluding curves computed from this same measurement;
// otherwise linear. Exported-but-unconfirmed curves are offered in the selector, never defaulted.
export function defaultBaseline(list = [], job = {}, { fingerprint = "" } = {}) {
  const latest = appliedCurvesForJob(list, job)
    .find((item) => isConfirmedApplied(item) && !(fingerprint && item.sourceFingerprint === fingerprint));
  return latest ? { ...baselineFromApplied(latest), auto: true } : { ...LINEAR_BASELINE, auto: true };
}

// Curves exported for this job that nobody has confirmed as loaded in the RIP yet.
export function unconfirmedCurvesForJob(list = [], job = {}, { fingerprint = "" } = {}) {
  return appliedCurvesForJob(list, job)
    .filter((item) => !isConfirmedApplied(item) && !(fingerprint && item.sourceFingerprint === fingerprint));
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

// Saved runs are matched on the exact job (customer, press and paper) and on the measurement
// itself: the same readings filed under another job never bring that job's RIP curve along.
export function savedRunBaseline(runs = [], job = {}, fingerprint = "", fingerprintOf = () => "") {
  const run = matchingRun(runs, job, fingerprint, fingerprintOf);
  return run ? normalizeBaseline(run.archive?.baseline || run.baseline) : null;
}

// Confirming a baseline is recorded on the newest saved run of this job + measurement at once,
// so re-importing the same file before a manual save keeps the confirmed curve.
export function withRunBaseline(runs = [], job = {}, fingerprint = "", fingerprintOf = () => "", baseline) {
  const run = matchingRun(runs, job, fingerprint, fingerprintOf);
  if (!run) return null;
  const stored = normalizeBaseline(baseline);
  return runs.map((item) => (item === run
    ? { ...item, baseline: stored, archive: item.archive ? { ...item.archive, baseline: stored } : item.archive }
    : item));
}

function matchingRun(runs, job, fingerprint, fingerprintOf) {
  if (!fingerprint) return null;
  return (runs || []).find((run) => (run?.archive?.baseline || run?.baseline)
    && sameJobExact(run.archive?.job || {}, job)
    && baselineFitsJob(run.archive?.baseline || run.baseline, job)
    && fingerprintOf(run) === fingerprint) || null;
}

// A RIP curve belongs to the job it was exported for; linear fits every job.
export function baselineFitsJob(baseline, job = {}) {
  if (baseline?.kind !== "curve") return true;
  return sameJob(baseline.job || {}, job);
}

function sameJobExact(a, b) {
  return ["customer", "press", "paper"].every((key) => String(a[key] || "").trim() === String(b[key] || "").trim());
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
