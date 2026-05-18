import { escapeHtml } from "./shared.js";

export function renderMeasurementChart(svg, results, targetRows, mode) {
  const label = mode === "ctv" ? "CTV" : "TVI";
  const target = targetRows.map((point) => ({
    x: point.tone,
    y: point.value,
    tooltip: `Target ${point.tone}%: ${fmt(point.value)}%`,
  }));
  const series = groupSeries(results, (row) => ({
    x: row.tone,
    y: row.measuredTvi,
    tooltip: `${row.channel} ${fmt(row.tone)}% ${label}: ${fmt(row.measuredTvi)}%, target ${fmt(row.targetTvi)}%`,
  }));
  drawChart(svg, series, {
    yMin: -5,
    yMax: 35,
    yLabel: mode === "ctv" ? "CTV 偏差 %" : "网点扩大 %",
    reference: [{ name: "Target", points: target, color: "#111827" }],
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

export function renderG7Charts({ npdcChart, grayChart }, g7, npdcReferenceRows) {
  const npdcSeries = {
    K: (g7.npdcRows || []).map((row) => ({
      x: row.tone,
      y: row.measured - row.tone,
      tooltip: `K ${fmt(row.tone)}% NPDC delta ${fmt(row.deltaTone)}%`,
    })),
  };
  const npdcRef = npdcReferenceRows.map((point) => ({
    x: point.tone,
    y: point.value,
    tooltip: `G7 target ${point.tone}%: ${fmt(point.value)}%`,
  }));
  drawChart(npdcChart, npdcSeries, {
    yMin: -5,
    yMax: 35,
    yLabel: "K TVI / NPDC",
    reference: [{ name: "G7 target", points: npdcRef, color: "#64748b" }],
  });

  const grayRows = g7.grayBalanceRows || [];
  const graySeries = {
    a: grayRows.map((row, index) => ({
      x: grayTone(row, index),
      y: row.a,
      tooltip: `${row.label || "Gray"} a*: ${fmt(row.a)}`,
    })),
    b: grayRows.map((row, index) => ({
      x: grayTone(row, index),
      y: row.b,
      tooltip: `${row.label || "Gray"} b*: ${fmt(row.b)}`,
    })),
  };
  drawChart(grayChart, graySeries, {
    yMin: -12,
    yMax: 12,
    yLabel: "a* / b*",
    reference: [
      { name: "Neutral", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "#64748b" },
      { name: "+Ch 3", points: [{ x: 0, y: 3 }, { x: 100, y: 3 }], color: "#f59e0b" },
      { name: "-Ch 3", points: [{ x: 0, y: -3 }, { x: 100, y: -3 }], color: "#f59e0b", dasharray: "3 5" },
      { name: "+Ch 6", points: [{ x: 0, y: 6 }, { x: 100, y: 6 }], color: "#ef4444" },
      { name: "-Ch 6", points: [{ x: 0, y: -6 }, { x: 100, y: -6 }], color: "#ef4444", dasharray: "3 5" },
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
  const ref = (config.reference || []).map((item) => path(item.points, xScale, yScale, item.color, "reference", item.name, item.dasharray)).join("");
  const lines = Object.entries(series).map(([channel, points]) => path(points, xScale, yScale, colors[channel] || "#2563eb", "series", channel)).join("");
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
    ${ref}${lines}${refDots}${dots}
  `;
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
  const match = String(row.label || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : Math.min(100, (index + 1) * 20);
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
