const CHANNELS = ["C", "M", "Y", "K"];

export function buildRunMetrics({ results = [], labRows = [], g7 = {}, curveQuality = {} } = {}) {
  const absoluteTvi = results
    .map((row) => Math.abs(Number(row.tviDelta)))
    .filter(Number.isFinite);
  const labDeltas = labRows
    .map((row) => Number(row.deltaE))
    .filter(Number.isFinite);

  return {
    avgTviDelta: average(absoluteTvi),
    maxTviDelta: maxFinite(absoluteTvi),
    avgDeltaE: average(labDeltas),
    maxDeltaE: maxFinite(labDeltas),
    g7Status: g7?.status || "",
    g7ConclusionTitle: g7?.conclusion?.title || "",
    g7ConclusionLevel: g7?.conclusion?.level || "",
    g7ConclusionSummary: g7?.conclusion?.summary || "",
    g7PriorityItems: Array.isArray(g7?.conclusion?.priorityItems) ? g7.conclusion.priorityItems : [],
    g7WeightedAverage: finiteOrNaN(g7?.weightedAverage),
    g7MaxNpdcDelta: finiteOrNaN(g7?.maxNpdcDelta),
    g7MaxGrayCh: finiteOrNaN(g7?.maxGrayCh),
    curveQualityStatus: curveQuality?.status || "Ready",
    curveWarnings: Number(curveQuality?.warnings) || 0,
    curveDangers: Number(curveQuality?.dangers) || 0,
    channelTvi: channelTviAverages(results),
  };
}

export function compareRuns(latest, previous) {
  if (!latest || !previous) return null;
  const latestMetrics = normalizeRunMetrics(latest);
  const previousMetrics = normalizeRunMetrics(previous);
  return {
    previous,
    latest,
    latestMetrics,
    previousMetrics,
    avgTviDelta: metricChange(latestMetrics.avgTviDelta, previousMetrics.avgTviDelta, true),
    maxDeltaE: metricChange(latestMetrics.maxDeltaE, previousMetrics.maxDeltaE, true),
    g7WeightedAverage: metricChange(latestMetrics.g7WeightedAverage, previousMetrics.g7WeightedAverage, true),
    g7MaxNpdcDelta: metricChange(latestMetrics.g7MaxNpdcDelta, previousMetrics.g7MaxNpdcDelta, true),
    g7MaxGrayCh: metricChange(latestMetrics.g7MaxGrayCh, previousMetrics.g7MaxGrayCh, true),
    curveWarnings: metricChange(latestMetrics.curveWarnings, previousMetrics.curveWarnings, true),
    curveDangers: metricChange(latestMetrics.curveDangers, previousMetrics.curveDangers, true),
    g7StatusChange: statusChange(latestMetrics.g7Status, previousMetrics.g7Status),
    g7StatusText: `${previousMetrics.g7Status || "N/A"} -> ${latestMetrics.g7Status || "N/A"}`,
    g7ConclusionText: `${previousMetrics.g7ConclusionTitle || "N/A"} -> ${latestMetrics.g7ConclusionTitle || "N/A"}`,
    g7PriorityText: priorityChangeText(latestMetrics.g7PriorityItems, previousMetrics.g7PriorityItems),
    curveQualityText: `${previousMetrics.curveQualityStatus || "N/A"} -> ${latestMetrics.curveQualityStatus || "N/A"}`,
    channelRows: CHANNELS.map((channel) => ({
      channel,
      previous: previousMetrics.channelTvi[channel],
      latest: latestMetrics.channelTvi[channel],
      change: metricChange(latestMetrics.channelTvi[channel], previousMetrics.channelTvi[channel], true),
    })),
  };
}

export function formatMetricChange(change, suffix = "") {
  if (!change || !Number.isFinite(change.delta)) return "N/A";
  const sign = change.delta > 0 ? "+" : "";
  return `${formatNumber(change.previous)}${suffix} -> ${formatNumber(change.latest)}${suffix} (${sign}${formatNumber(change.delta)}${suffix})`;
}

function normalizeRunMetrics(run) {
  const archive = run.archive || {};
  const metrics = run.metrics || buildRunMetrics({
    results: archive.results || [],
    labRows: archive.labVerification || [],
    g7: archive.g7 || {},
    curveQuality: archive.curveQuality || run.curveQuality || {},
  });
  return {
    ...metrics,
    avgTviDelta: finiteOrNaN(run.avgTviDelta ?? metrics.avgTviDelta),
    maxDeltaE: finiteOrNaN(run.maxDeltaE ?? metrics.maxDeltaE),
    g7Status: run.g7Status || metrics.g7Status || "",
    g7ConclusionTitle: run.g7ConclusionTitle || metrics.g7ConclusionTitle || archive.g7?.conclusion?.title || "",
    g7ConclusionLevel: run.g7ConclusionLevel || metrics.g7ConclusionLevel || archive.g7?.conclusion?.level || "",
    g7ConclusionSummary: run.g7ConclusionSummary || metrics.g7ConclusionSummary || archive.g7?.conclusion?.summary || "",
    g7PriorityItems: run.g7PriorityItems || metrics.g7PriorityItems || archive.g7?.conclusion?.priorityItems || [],
    curveQualityStatus: run.curveQualityStatus || metrics.curveQualityStatus || "Ready",
    curveWarnings: Number(run.curveWarnings ?? metrics.curveWarnings) || 0,
    curveDangers: Number(run.curveDangers ?? metrics.curveDangers) || 0,
    channelTvi: metrics.channelTvi || {},
  };
}

function statusChange(latest, previous) {
  const latestRank = statusRank(latest);
  const previousRank = statusRank(previous);
  if (!Number.isFinite(latestRank) || !Number.isFinite(previousRank)) return { latest, previous, delta: NaN, direction: "unknown" };
  const delta = latestRank - previousRank;
  const direction = delta > 0 ? "improved" : delta < 0 ? "worse" : "same";
  return { latest, previous, delta, direction };
}

function statusRank(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pass") return 3;
  if (normalized === "warning") return 2;
  if (normalized === "fail") return 1;
  if (normalized === "data incomplete") return 0;
  return NaN;
}

function priorityChangeText(latestItems = [], previousItems = []) {
  const latest = normalizeItems(latestItems);
  const previous = normalizeItems(previousItems);
  if (!latest.length && !previous.length) return "无主要 G7 问题";
  const resolved = previous.filter((item) => !latest.includes(item));
  const added = latest.filter((item) => !previous.includes(item));
  const stable = latest.filter((item) => previous.includes(item));
  const parts = [];
  if (resolved.length) parts.push(`已解决: ${resolved.join(" / ")}`);
  if (added.length) parts.push(`新增: ${added.join(" / ")}`);
  if (stable.length) parts.push(`仍存在: ${stable.join(" / ")}`);
  return parts.join("；") || "主要问题无变化";
}

function normalizeItems(items) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function metricChange(latest, previous, lowerIsBetter = true) {
  const latestValue = finiteOrNaN(latest);
  const previousValue = finiteOrNaN(previous);
  if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue)) {
    return { latest: latestValue, previous: previousValue, delta: NaN, direction: "unknown" };
  }
  const delta = latestValue - previousValue;
  const tolerance = 0.005;
  let direction = "same";
  if (Math.abs(delta) > tolerance) {
    direction = lowerIsBetter
      ? delta < 0 ? "improved" : "worse"
      : delta > 0 ? "improved" : "worse";
  }
  return { latest: latestValue, previous: previousValue, delta, direction };
}

function channelTviAverages(results) {
  return Object.fromEntries(CHANNELS.map((channel) => {
    const values = results
      .filter((row) => row.channel === channel && Number(row.tone) > 0 && Number(row.tone) < 100)
      .map((row) => Math.abs(Number(row.tviDelta)))
      .filter(Number.isFinite);
    return [channel, average(values)];
  }));
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
}

function maxFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : NaN;
}

function finiteOrNaN(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "N/A";
}
