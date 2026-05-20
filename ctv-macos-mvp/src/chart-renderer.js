import { escapeHtml } from "./shared.js";

export function renderMeasurementChart(svg, results, targetRows, mode) {
  const label = mode === "ctv" ? "CTV" : "TVI";
  const targetName = mode === "ctv" ? "目标偏差" : "目标 TVI";
  const target = targetRows.map((point) => ({
    x: point.tone,
    y: point.value,
    tooltip: `${targetName} ${point.tone}%: ${fmt(point.value)}%`,
  }));
  const band = targetRows.map((point) => {
    const tolerance = toneTolerance(point.tone, mode);
    return {
      x: point.tone,
      low: point.value - tolerance,
      high: point.value + tolerance,
      tooltip: `容差范围 ${point.tone}%: ${fmt(point.value - tolerance)}-${fmt(point.value + tolerance)}%`,
    };
  });
  const series = groupSeries(results, (row) => ({
    x: row.tone,
    y: row.measuredTvi,
    tooltip: `${row.channel} ${fmt(row.tone)}% ${label}${mode === "ctv" ? " 偏差" : ""}: ${signed(row.measuredTvi)}%, target ${fmt(row.targetTvi)}%`,
  }));
  const axis = measurementAxis(series, target, band, mode);
  drawChart(svg, series, {
    yMin: axis.min,
    yMax: axis.max,
    yLabel: mode === "ctv" ? "CTV 偏差 %" : "网点扩大 %",
    bands: [{ name: "标准容差", points: band, color: "#22c55e" }],
    reference: [{ name: targetName, points: target, color: "#111827" }],
  });
}

export function renderCurveChart(svg, results, safetyIssues = []) {
  const quality = qualityByPoint(safetyIssues);
  const series = groupSeries(results, (row) => ({
    x: row.tone,
    y: row.outputTone,
    tooltip: curveTooltip(row, quality.get(pointKey(row.channel, row.tone))),
    locked: row.overrideLocked,
    quality: quality.get(pointKey(row.channel, row.tone))?.level,
  }));
  drawChart(svg, series, {
    yMin: 0,
    yMax: 100,
    yLabel: "输出网点 %",
    reference: [{ name: "Identity", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: "#9ca3af" }],
  });
}

export function renderLabChromaticityChart(svg, labRows = []) {
  if (!svg) return;
  const width = 720;
  const height = 420;
  const pad = { left: 56, right: 24, top: 24, bottom: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const min = -100;
  const max = 100;
  const xScale = (a) => pad.left + ((a - min) / (max - min)) * plotW;
  const yScale = (b) => pad.top + (1 - (b - min) / (max - min)) * plotH;
  const comparable = labRows.filter((row) => row.lab && row.referenceLab);
  const gridValues = [-100, -50, 0, 50, 100];
  const grid = gridValues.map((value) => `
    <line x1="${xScale(value)}" y1="${pad.top}" x2="${xScale(value)}" y2="${height - pad.bottom}" class="grid" />
    <line x1="${pad.left}" y1="${yScale(value)}" x2="${width - pad.right}" y2="${yScale(value)}" class="grid" />
    <text x="${xScale(value)}" y="${height - 18}" class="tick" text-anchor="middle">${value}</text>
    <text x="${pad.left - 10}" y="${yScale(value) + 4}" class="tick" text-anchor="end">${value}</text>
  `).join("");
  const links = comparable.map((row) => `
    <line x1="${xScale(row.referenceLab.a)}" y1="${yScale(row.referenceLab.b)}" x2="${xScale(row.lab.a)}" y2="${yScale(row.lab.b)}" class="lab-link">
      <title>${escapeHtml(`${row.label}: ΔE ${fmt(row.deltaE)}`)}</title>
    </line>
  `).join("");
  const referenceDots = comparable.map((row) => `
    <circle cx="${xScale(row.referenceLab.a)}" cy="${yScale(row.referenceLab.b)}" r="4" class="lab-dot target">
      <title>${escapeHtml(`${row.label} target a* ${fmt(row.referenceLab.a)} b* ${fmt(row.referenceLab.b)}`)}</title>
    </circle>
  `).join("");
  const sampleDots = comparable.map((row) => {
    const cls = row.status === "Fail" ? "fail" : row.status === "Warning" ? "warning" : "pass";
    return `
      <circle cx="${xScale(row.lab.a)}" cy="${yScale(row.lab.b)}" r="6" class="lab-dot ${cls}">
        <title>${escapeHtml(`${row.label} sample a* ${fmt(row.lab.a)} b* ${fmt(row.lab.b)} ΔE ${fmt(row.deltaE)}`)}</title>
      </circle>
      <text x="${xScale(row.lab.a) + 8}" y="${yScale(row.lab.b) - 8}" class="lab-label">${escapeHtml(shortLabLabel(row.label))}</text>
    `;
  }).join("");

  svg.innerHTML = `
    <defs>
      <linearGradient id="labBgA" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stop-color="#bbf7d0" />
        <stop offset="50%" stop-color="#f8fafc" />
        <stop offset="100%" stop-color="#fecdd3" />
      </linearGradient>
      <linearGradient id="labBgB" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="#fde68a" stop-opacity=".5" />
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0" />
        <stop offset="100%" stop-color="#bfdbfe" stop-opacity=".5" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
    <rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="url(#labBgA)" opacity=".55" />
    <rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="url(#labBgB)" opacity=".75" />
    ${grid}
    <line x1="${xScale(0)}" y1="${pad.top}" x2="${xScale(0)}" y2="${height - pad.bottom}" class="axis lab-axis" />
    <line x1="${pad.left}" y1="${yScale(0)}" x2="${width - pad.right}" y2="${yScale(0)}" class="axis lab-axis" />
    <text x="${width / 2}" y="${height - 4}" class="axis-label" text-anchor="middle">a*</text>
    <text x="18" y="${height / 2}" class="axis-label" transform="rotate(-90 18 ${height / 2})" text-anchor="middle">b*</text>
    ${links}${referenceDots}${sampleDots}
    <g class="chart-legend" transform="translate(${pad.left} 16)">
      <circle r="4" cx="0" cy="0" class="lab-dot target" /><text x="10" y="4">Target</text>
      <circle r="5" cx="82" cy="0" class="lab-dot pass" /><text x="94" y="4">Sample</text>
    </g>
  `;
}

export function renderG7Charts({ npdcChart, grayChart, cmyNpdcChart, weightedChart }, g7, npdcReferenceRows) {
  const npdcVerification = g7.npdcVerification || [];
  const kNpdcRows = npdcVerification.filter((row) => Number.isFinite(row.measuredNpdc));
  const kTargetRows = npdcVerification.filter((row) => Number.isFinite(row.targetNpdc));
  const npdcSeries = {
    K: kNpdcRows.map((row) => ({
      x: row.tone,
      y: row.measuredNpdc,
      tooltip: `K ${fmt(row.tone)}% NPDC ${fmt(row.measuredNpdc)} / target ${fmt(row.targetNpdc)}`,
    })),
  };
  const npdcRef = kTargetRows.map((row) => ({
    x: row.tone,
    y: row.targetNpdc,
    tooltip: `G7 target ${fmt(row.tone)}% NPDC ${fmt(row.targetNpdc)}`,
  }));
  const fallbackNpdcRef = npdcReferenceRows.map((point) => ({
    x: point.tone,
    y: point.value / 10,
    tooltip: `G7 target ${point.tone}%: ${fmt(point.value / 10)}`,
  }));
  const kNpdcMax = niceCeil(Math.max(2, ...[...kNpdcRows, ...kTargetRows].flatMap((row) => [row.measuredNpdc, row.targetNpdc]).filter(Number.isFinite)) * 1.08);
  drawChart(npdcChart, npdcSeries, {
    yMin: 0,
    yMax: kNpdcMax,
    yLabel: "K NPDC",
    reference: [{ name: "G7 target", points: npdcRef.length ? npdcRef : fallbackNpdcRef, color: "#64748b" }],
  });

  const grayRows = aggregateGrayRows(g7.grayVerification || []);
  const cmyNpdcMax = niceCeil(Math.max(2, ...grayRows.flatMap((row) => [row.measuredNpdc, row.targetNpdc]).filter(Number.isFinite)) * 1.08);
  const cmySeries = {
    Gray: grayRows.map((row, index) => ({
      x: grayTone(row, index),
      y: row.measuredNpdc,
      tooltip: `CMY ${fmt(grayTone(row, index))}% NPDC ${fmt(row.measuredNpdc)} / target ${fmt(row.targetNpdc)}`,
    })),
  };
  const cmyTarget = grayRows
    .filter((row) => Number.isFinite(row.targetNpdc))
    .map((row, index) => ({
      x: grayTone(row, index),
      y: row.targetNpdc,
      tooltip: `G7 target ${fmt(grayTone(row, index))}% NPDC ${fmt(row.targetNpdc)}`,
    }));
  drawChart(cmyNpdcChart, cmySeries, {
    yMin: 0,
    yMax: cmyNpdcMax,
    yLabel: "CMY NPDC",
    reference: [{ name: "G7 target", points: cmyTarget, color: "#22c55e", dasharray: "4 4" }],
  });

  const graySeries = {
    a: grayRows.map((row, index) => ({
      x: grayTone(row, index),
      y: row.a,
      tooltip: `Gray ${fmt(grayTone(row, index))}% a*: ${fmt(row.a)}`,
    })),
    b: grayRows.map((row, index) => ({
      x: grayTone(row, index),
      y: row.b,
      tooltip: `Gray ${fmt(grayTone(row, index))}% b*: ${fmt(row.b)}`,
    })),
  };
  const grayComponentValues = grayRows.flatMap((row) => [row.a, row.b]).filter(Number.isFinite);
  const grayComponentMax = Math.max(6, ...grayComponentValues.map((value) => Math.abs(value)));
  drawChart(grayChart, graySeries, {
    yMin: -niceCeil(grayComponentMax * 1.08),
    yMax: niceCeil(grayComponentMax * 1.08),
    yLabel: "a* / b*",
    connectLines: false,
    reference: [
      { name: "Neutral", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "#64748b" },
      { name: "+Ch 3", points: [{ x: 0, y: 3 }, { x: 100, y: 3 }], color: "#f59e0b" },
      { name: "-Ch 3", points: [{ x: 0, y: -3 }, { x: 100, y: -3 }], color: "#f59e0b", dasharray: "3 5" },
      { name: "+Ch 6", points: [{ x: 0, y: 6 }, { x: 100, y: 6 }], color: "#ef4444" },
      { name: "-Ch 6", points: [{ x: 0, y: -6 }, { x: 100, y: -6 }], color: "#ef4444", dasharray: "3 5" },
    ],
  });

  const cmyWeightedL = (g7.grayVerification || []).filter((row) => Number.isFinite(row.signedWeightedDeltaL)).map((row) => ({
    x: row.tone,
    y: row.signedWeightedDeltaL,
    tooltip: `CMY ${fmt(row.tone)}% wΔL* ${fmt(row.signedWeightedDeltaL)} / ΔL* ${fmt(row.deltaL)}`,
  }));
  const weightedSeries = {
    K: npdcVerification.filter((row) => Number.isFinite(row.deltaL)).map((row) => ({
      x: row.tone,
      y: row.signedWeightedDeltaL ?? row.deltaL,
      tooltip: `K ${fmt(row.tone)}% wΔL* ${fmt(row.signedWeightedDeltaL ?? row.deltaL)} / ΔL* ${fmt(row.deltaL)}`,
    })),
    CMY: cmyWeightedL,
  };
  const deltaValues = Object.values(weightedSeries).flatMap((rows) => rows.map((row) => row.y)).filter(Number.isFinite);
  const deltaMax = Math.max(8, ...deltaValues.map((value) => Math.abs(value)));
  drawChart(weightedChart, weightedSeries, {
    yMin: -niceCeil(deltaMax * 1.08),
    yMax: niceCeil(deltaMax * 1.08),
    yLabel: "wΔL*",
    reference: [
      { name: "Target", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "#64748b" },
      { name: "+3", points: [{ x: 0, y: 3 }, { x: 100, y: 3 }], color: "#f59e0b" },
      { name: "-3", points: [{ x: 0, y: -3 }, { x: 100, y: -3 }], color: "#f59e0b", dasharray: "3 5" },
      { name: "+6", points: [{ x: 0, y: 6 }, { x: 100, y: 6 }], color: "#ef4444" },
      { name: "-6", points: [{ x: 0, y: -6 }, { x: 100, y: -6 }], color: "#ef4444", dasharray: "3 5" },
    ],
  });
}

function drawChart(svg, series, config) {
  if (!svg) return;
  const width = 720;
  const height = 420;
  const pad = { left: 58, right: 24, top: 42, bottom: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xScale = (x) => pad.left + (x / 100) * plotW;
  const yScale = (y) => pad.top + (1 - (y - config.yMin) / (config.yMax - config.yMin)) * plotH;
  const colors = { C: "#0891b2", M: "#be185d", Y: "#ca8a04", K: "#111827", a: "#7c3aed", b: "#ea580c", Gray: "#475569" };

  const grid = [0, 25, 50, 75, 100].map((x) => `
    <line x1="${xScale(x)}" y1="${pad.top}" x2="${xScale(x)}" y2="${height - pad.bottom}" class="grid" />
    <text x="${xScale(x)}" y="${height - 18}" class="tick" text-anchor="middle">${x}</text>
  `).join("");
  const yTicks = Array.from({ length: 6 }, (_, i) => config.yMin + ((config.yMax - config.yMin) / 5) * i).map((y) => `
    <line x1="${pad.left}" y1="${yScale(y)}" x2="${width - pad.right}" y2="${yScale(y)}" class="grid" />
    <text x="${pad.left - 12}" y="${yScale(y) + 4}" class="tick" text-anchor="end">${Math.round(y)}</text>
  `).join("");
  const bands = (config.bands || []).map((item) => bandPath(item.points, xScale, yScale, item.color, item.name)).join("");
  const ref = (config.reference || []).map((item) => path(item.points, xScale, yScale, item.color, "reference", item.name, item.dasharray)).join("");
  const lines = config.connectLines === false
    ? ""
    : Object.entries(series).map(([channel, points]) => path(points, xScale, yScale, colors[channel] || "#2563eb", "series", channel)).join("");
  const dots = Object.entries(series).flatMap(([channel, points]) => points.map((point) => `
    <circle class="chart-dot${point.locked ? " locked" : ""}${point.quality ? ` ${point.quality}` : ""}" cx="${xScale(point.x)}" cy="${yScale(point.y)}" r="${point.locked || point.quality ? 5 : 4}" fill="${colors[channel] || "#2563eb"}">
      <title>${escapeHtml(point.tooltip || `${channel} ${fmt(point.x)} / ${fmt(point.y)}`)}</title>
    </circle>
  `)).join("");
  const refDots = (config.reference || []).flatMap((item) => item.points.map((point) => `
    <circle class="chart-dot reference-dot" cx="${xScale(point.x)}" cy="${yScale(point.y)}" r="3" fill="${item.color}">
      <title>${escapeHtml(point.tooltip || `${item.name} ${fmt(point.x)} / ${fmt(point.y)}`)}</title>
    </circle>
  `)).join("");
  const legend = legendItems(series, config.reference || [], colors).map((item, index) => `
    <g class="chart-legend" transform="translate(${pad.left + index * 88} 28)">
      <line x1="0" y1="0" x2="18" y2="0" stroke="${item.color}"${item.dasharray ? ` stroke-dasharray="${item.dasharray}"` : ""} />
      <text x="24" y="4">${escapeHtml(item.name)}</text>
    </g>
  `).join("");

  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
    ${legend}
    ${grid}${yTicks}
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="axis" />
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="axis" />
    <text x="${width / 2}" y="${height - 4}" class="axis-label" text-anchor="middle">输入网点 %</text>
    <text x="18" y="${height / 2}" class="axis-label" transform="rotate(-90 18 ${height / 2})" text-anchor="middle">${config.yLabel}</text>
    ${bands}${ref}${lines}${refDots}${dots}
  `;
}

function bandPath(points, xScale, yScale, color, name = "") {
  if (!points.length) return "";
  const upper = points.map((point, index) => `${index ? "L" : "M"} ${xScale(point.x).toFixed(1)} ${yScale(point.high).toFixed(1)}`).join(" ");
  const lower = [...points].reverse().map((point) => `L ${xScale(point.x).toFixed(1)} ${yScale(point.low).toFixed(1)}`).join(" ");
  return `<path d="${upper} ${lower} Z" fill="${color}" class="chart-band"><title>${escapeHtml(name)}</title></path>`;
}

function path(points, xScale, yScale, color, className, name = "", dasharray = "") {
  if (!points.length) return "";
  const d = points.map((point, index) => `${index ? "L" : "M"} ${xScale(point.x).toFixed(1)} ${yScale(point.y).toFixed(1)}`).join(" ");
  return `<path d="${d}" fill="none" stroke="${color}" class="${className}"${dasharray ? ` stroke-dasharray="${dasharray}"` : ""}><title>${escapeHtml(name)}</title></path>`;
}

function groupSeries(rows, mapper) {
  return rows.reduce((acc, row) => {
    acc[row.channel] ||= [];
    acc[row.channel].push(mapper(row));
    return acc;
  }, {});
}

function grayTone(row, index) {
  if (Number.isFinite(row.tone)) return row.tone;
  const match = String(row.label || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : Math.min(100, (index + 1) * 20);
}

function aggregateGrayRows(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const tone = grayTone(row, buckets.size);
    if (!Number.isFinite(tone)) continue;
    const key = tone.toFixed(2);
    const bucket = buckets.get(key) || { tone, a: [], b: [], chroma: [], weightedChroma: [], measuredNpdc: [], targetNpdc: [], labels: [] };
    if (Number.isFinite(row.a)) bucket.a.push(row.a);
    if (Number.isFinite(row.b)) bucket.b.push(row.b);
    if (Number.isFinite(row.chroma)) bucket.chroma.push(row.chroma);
    if (Number.isFinite(row.weightedChroma)) bucket.weightedChroma.push(row.weightedChroma);
    if (Number.isFinite(row.measuredNpdc)) bucket.measuredNpdc.push(row.measuredNpdc);
    if (Number.isFinite(row.targetNpdc)) bucket.targetNpdc.push(row.targetNpdc);
    if (row.label) bucket.labels.push(row.label);
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({
      tone: bucket.tone,
      label: bucket.labels.join(", "),
      a: average(bucket.a),
      b: average(bucket.b),
      chroma: average(bucket.chroma),
      weightedChroma: average(bucket.weightedChroma),
      measuredNpdc: average(bucket.measuredNpdc),
      targetNpdc: average(bucket.targetNpdc),
    }))
    .sort((a, b) => a.tone - b.tone);
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
}

function measurementAxis(series, target, band, mode) {
  const values = [
    ...Object.values(series).flat().map((point) => Number(point.y)),
    ...target.map((point) => Number(point.y)),
    ...band.flatMap((point) => [Number(point.low), Number(point.high)]),
  ].filter(Number.isFinite);
  if (mode !== "ctv") {
    return { min: Math.min(-5, niceFloor(Math.min(...values, 0))), max: Math.max(35, niceCeil(Math.max(...values, 0) * 1.08)) };
  }
  const low = Math.min(...values, -3);
  const high = Math.max(...values, 3);
  const pad = Math.max(1, (high - low) * 0.12);
  return {
    min: Math.min(-5, niceFloor(low - pad)),
    max: Math.max(5, niceCeil(high + pad)),
  };
}

function niceCeil(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 10;
  if (numeric <= 10) return Math.ceil(numeric);
  return Math.ceil(numeric / 5) * 5;
}

function niceFloor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return -10;
  if (numeric < 0) return -niceCeil(Math.abs(numeric));
  if (numeric <= 10) return Math.floor(numeric);
  return Math.floor(numeric / 5) * 5;
}

function legendItems(series, references, colors) {
  const items = [
    ...references.map((item) => ({ name: item.name, color: item.color, dasharray: item.dasharray })),
    ...Object.keys(series).map((name) => ({ name, color: colors[name] || "#2563eb" })),
  ];
  const seen = new Set();
  return items.filter((item) => !seen.has(item.name) && seen.add(item.name));
}

function fmt(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(1).replace(/\.0$/, "") : "-";
}

function toneTolerance(tone, mode) {
  if (mode === "ctv") return 3;
  const numeric = Number(tone);
  if (Math.abs(numeric - 50) < 0.01) return 4;
  return 3;
}

function shortLabLabel(label) {
  const text = String(label || "");
  if (/paper/i.test(text) || /纸/.test(text)) return "P";
  if (/CMY/i.test(text)) return "CMY";
  if (/CM/i.test(text)) return "CM";
  if (/CY/i.test(text)) return "CY";
  if (/MY/i.test(text)) return "MY";
  const channel = text.match(/\b[CMYK]\b/i)?.[0];
  return channel ? channel.toUpperCase() : text.slice(0, 4);
}

function curveTooltip(row, quality) {
  const parts = [
    `${row.channel} ${fmt(row.tone)}% -> ${fmt(row.outputTone)}%${row.overrideLocked ? " (locked)" : ""}`,
    `实测 ${fmt(row.measuredTone ?? row.tone + row.measuredTvi)}% / 目标 ${fmt(row.targetTone ?? row.tone + row.targetTvi)}%`,
    `理论输出 ${fmt(row.theoreticalOutputTone ?? row.tone + row.theoreticalCorrection)}% / 生产输出 ${fmt(row.productionOutputTone ?? row.tone + row.correction)}%`,
    `调整 ${signed(row.outputTone - row.tone)}% / ${row.interpolated ? "插值点" : "实测点"}`,
  ];
  if (quality?.messages?.length) parts.push(`曲线检查: ${quality.messages.join(" / ")}`);
  return parts.join("\n");
}

function qualityByPoint(issues) {
  const rank = { danger: 3, fail: 3, warning: 2, pass: 1, neutral: 0 };
  return (issues || []).reduce((acc, issue) => {
    const tones = issue.relatedTones?.length ? issue.relatedTones : [issue.tone];
    for (const tone of tones) {
      const key = pointKey(issue.channel, tone);
      const existing = acc.get(key) || { level: "neutral", messages: [] };
      const level = (rank[issue.level] || 0) > (rank[existing.level] || 0) ? issue.level : existing.level;
      acc.set(key, {
        level,
        messages: [...existing.messages, `${issue.type}: ${issue.message}`],
      });
    }
    return acc;
  }, new Map());
}

function pointKey(channel, tone) {
  return `${channel}:${Number(tone).toFixed(3)}`;
}

function signed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}`;
}
