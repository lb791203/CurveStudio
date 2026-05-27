import { escapeHtml } from "./shared.js";
import { translateDynamicText } from "./translations.js?v=20260525-statusbar-pass-1";

export function renderMeasurementChart(svg, results, targetRows, mode) {
  const label = mode === "ctv" ? "CTV" : "TVI";
  const targetName = mode === "ctv" ? translateDynamicText("目标偏差") : translateDynamicText("目标 TVI");
  const target = targetRows.map((point) => ({
    x: point.tone,
    y: point.value,
    tooltip: `${targetName} ${point.tone}%: ${fmt(point.value)}%`,
  }));
  const band = targetRows.map((point) => {
    const tolerance = toneTolerance(point.tone, mode);
    const low = point.value - tolerance;
    const high = point.value + tolerance;
    return {
      x: point.tone,
      low: mode === "ctv" ? low : Math.max(0, low),
      high,
    tooltip: `${translateDynamicText("容差范围")} ${point.tone}%: ${fmt(mode === "ctv" ? low : Math.max(0, low))}-${fmt(high)}%`,
    };
  });
  const series = groupSeries(results, (row) => ({
    x: row.tone,
    y: row.measuredTvi,
    tooltip: `${row.channel} ${fmt(row.tone)}% ${label}${mode === "ctv" ? ` ${translateDynamicText("偏差")}` : ""}: ${signed(row.measuredTvi)}%, target ${fmt(row.targetTvi)}%`,
  }));
  const axis = measurementAxis(series, target, band, mode);
  drawChart(svg, series, {
    yMin: axis.min,
    yMax: axis.max,
    yLabel: mode === "ctv" ? translateDynamicText("CTV 偏差 %") : translateDynamicText("网点扩大 %"),
    bands: [{ name: translateDynamicText("标准容差"), points: band, color: "#22c55e" }],
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
    yLabel: translateDynamicText("输出网点 %"),
    interactivePoints: true,
    reference: [{ name: "Identity", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: "#9ca3af" }],
  });
}

export function renderCompensationSimulationChart(svg, rows = []) {
  const usableRows = rows
    .filter((row) => Number.isFinite(row.tone) && Number.isFinite(row.simulatedTone) && Number.isFinite(row.targetTone))
    .sort((a, b) => String(a.channel).localeCompare(String(b.channel)) || rowTone(a) - rowTone(b));
  const dotGainRows = usableRows.map((row) => ({
    ...row,
    currentGain: Number(row.measuredTone) - Number(row.tone),
    targetGain: Number(row.targetTone) - Number(row.tone),
    simulatedGain: Number(row.simulatedTone) - Number(row.tone),
  }));
  const target = averageByTone(dotGainRows, "targetGain").map((point) => ({
    ...point,
    tooltip: `${translateDynamicText("目标网点扩大")} ${fmt(point.x)}%: ${fmt(point.y)}%`,
  }));
  const channels = [...new Set(usableRows.map((row) => row.channel))];
  const toleranceBand = target.map((point) => {
    const tolerance = toneTolerance(point.x, "tvi");
    return {
      x: point.x,
      low: Math.max(0, point.y - tolerance),
      high: point.y + tolerance,
      tooltip: `${translateDynamicText("容差范围")} ${fmt(point.x)}%: ${fmt(Math.max(0, point.y - tolerance))}-${fmt(point.y + tolerance)}%`,
    };
  });
  const references = [{ name: translateDynamicText("目标网点扩大"), points: target, color: "#111827", dasharray: "6 5" }];
  const currentByChannel = groupSeries(dotGainRows, (row) => ({
    x: row.tone,
    y: row.currentGain,
    tooltip: `${row.channel} ${fmt(row.tone)}% ${translateDynamicText("当前网点扩大")} ${fmt(row.currentGain)}%`,
  }));
  for (const channel of channels) {
    references.push({
      name: channels.length === 1 ? translateDynamicText("当前网点扩大") : `${translateDynamicText("当前")} ${channel}`,
      points: (currentByChannel[channel] || []).map((row) => ({
        ...row,
        tooltip: row.tooltip,
      })),
      color: chartColor(channel),
      dasharray: "3 5",
      showInLegend: channels.length === 1,
    });
  }
  if (channels.length === 1 && !references.some((item) => item.name === translateDynamicText("当前网点扩大"))) {
    references.push({
      name: translateDynamicText("当前网点扩大"),
      points: dotGainRows.map((row) => ({
        x: row.tone,
        y: row.currentGain,
        tooltip: `${row.channel} ${fmt(row.tone)}% ${translateDynamicText("当前网点扩大")} ${fmt(row.currentGain)}%`,
      })),
      color: "#94a3b8",
      dasharray: "5 4",
    });
  }
  const series = groupSeries(dotGainRows, (row) => ({
    x: row.tone,
    y: row.simulatedGain,
    tooltip: `${row.channel} ${fmt(row.tone)}% ${translateDynamicText("补偿后网点扩大")} ${fmt(row.simulatedGain)}% / ${translateDynamicText("目标")} ${fmt(row.targetGain)}% / ${translateDynamicText("剩余偏差")} ${signed(row.afterDelta)}%`,
    quality: row.status === "Fail" ? "fail" : row.status === "Warning" ? "warning" : undefined,
    outputTone: row.outputTone,
    dragKind: "compensation-simulation",
  }));
  const values = [
    ...dotGainRows.flatMap((row) => [row.currentGain, row.targetGain, row.simulatedGain]),
  ].filter(Number.isFinite);
  const min = 0;
  const max = Math.max(35, niceCeil(Math.max(...values, 0) * 1.08));
  drawChart(svg, series, {
    width: 960,
    height: 420,
    yMin: min,
    yMax: max,
    yLabel: translateDynamicText("网点扩大 %"),
    bands: [{ name: translateDynamicText("目标容差"), points: toleranceBand, color: "#22c55e" }],
    reference: references,
    referenceDots: false,
    interactivePoints: true,
  });
}

export function renderLabChromaticityChart(svg, labRows = []) {
  if (!svg) return;
  const width = 720;
  const height = 620;
  const pad = { left: 58, right: 28, top: 52, bottom: 58 };
  const availableW = width - pad.left - pad.right;
  const availableH = height - pad.top - pad.bottom;
  const plotSize = Math.min(availableW, availableH);
  const plotX = pad.left + (availableW - plotSize) / 2;
  const plotY = pad.top + (availableH - plotSize) / 2;
  const plotRight = plotX + plotSize;
  const plotBottom = plotY + plotSize;
  const min = -100;
  const max = 100;
  const xScale = (a) => plotX + ((a - min) / (max - min)) * plotSize;
  const yScale = (b) => plotY + (1 - (b - min) / (max - min)) * plotSize;
  const comparable = labRows.filter((row) => row.lab && row.referenceLab);
  const minorGridValues = Array.from({ length: 21 }, (_, index) => -100 + index * 10);
  const majorGridValues = [-100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100];
  const grid = minorGridValues.map((value) => `
    <line x1="${xScale(value)}" y1="${plotY}" x2="${xScale(value)}" y2="${plotBottom}" class="grid ${value % 20 === 0 ? "major" : "minor"}" />
    <line x1="${plotX}" y1="${yScale(value)}" x2="${plotRight}" y2="${yScale(value)}" class="grid ${value % 20 === 0 ? "major" : "minor"}" />
  `).join("");
  const tickLabels = majorGridValues.map((value) => `
    <text x="${xScale(value)}" y="${plotBottom + 24}" class="tick" text-anchor="middle">${value}</text>
    <text x="${plotX - 10}" y="${yScale(value) + 4}" class="tick" text-anchor="end">${value}</text>
  `).join("");
  const quadrantBg = `
    <rect x="${plotX}" y="${plotY}" width="${plotSize / 2}" height="${plotSize / 2}" fill="#eef9cf" />
    <rect x="${xScale(0)}" y="${plotY}" width="${plotSize / 2}" height="${plotSize / 2}" fill="#fee7c8" />
    <rect x="${plotX}" y="${yScale(0)}" width="${plotSize / 2}" height="${plotSize / 2}" fill="#d9f7ee" />
    <rect x="${xScale(0)}" y="${yScale(0)}" width="${plotSize / 2}" height="${plotSize / 2}" fill="#f5e7f4" />
    <rect x="${plotX}" y="${plotY}" width="${plotSize}" height="${plotSize}" fill="#ffffff" opacity=".36" />
  `;
  const families = labFamilies(comparable);
  const targetPolygon = labGamutPolygon(families, "referenceLab", xScale, yScale, "lab-gamut target-gamut");
  const samplePolygon = labGamutPolygon(families, "lab", xScale, yScale, "lab-gamut sample-gamut");
  const tonePaths = labTonePaths(families, xScale, yScale);
  const endpoints = labFamilyEndpoints(families);
  const vectors = endpoints.map((row) => `
    <line x1="${xScale(row.referenceLab.a)}" y1="${yScale(row.referenceLab.b)}" x2="${xScale(row.lab.a)}" y2="${yScale(row.lab.b)}" class="lab-vector" marker-end="url(#labVectorArrow)">
      <title>${escapeHtml(`${labFamilyLabel(row)}: ${translateDynamicText("目标 a*")} ${fmt(row.referenceLab.a)} b* ${fmt(row.referenceLab.b)} -> ${translateDynamicText("实测 a*")} ${fmt(row.lab.a)} b* ${fmt(row.lab.b)} / ΔE ${fmt(row.deltaE)}`)}</title>
    </line>
  `).join("");
  const referenceDots = comparable.map((row) => `
    <circle cx="${xScale(row.referenceLab.a)}" cy="${yScale(row.referenceLab.b)}" r="4" class="lab-dot target">
      <title>${escapeHtml(`${row.label} ${translateDynamicText("目标 a*")} ${fmt(row.referenceLab.a)} b* ${fmt(row.referenceLab.b)}`)}</title>
    </circle>
  `).join("");
  const sampleDots = comparable.map((row) => {
    const cls = row.status === "Fail" ? "fail" : row.status === "Warning" ? "warning" : "pass";
    return `
      <circle cx="${xScale(row.lab.a)}" cy="${yScale(row.lab.b)}" r="6" class="lab-dot ${cls} ${labFamilyClass(row)}">
        <title>${escapeHtml(`${row.label} ${translateDynamicText("实测 a*")} ${fmt(row.lab.a)} b* ${fmt(row.lab.b)} ΔE ${fmt(row.deltaE)}`)}</title>
      </circle>
    `;
  }).join("");
  const labels = endpoints.map((row) => {
    const targetX = xScale(row.referenceLab.a);
    const sampleX = xScale(row.lab.a);
    const anchor = sampleX >= targetX ? "start" : "end";
    const dx = sampleX >= targetX ? 9 : -9;
    return `<text x="${sampleX + dx}" y="${yScale(row.lab.b) - 7}" class="lab-label ${labFamilyClass(row)}" text-anchor="${anchor}">${escapeHtml(labFamilyLabel(row))}</text>`;
  }).join("");

  svg.innerHTML = `
    <defs>
      <marker id="labVectorArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L7,3.5 L0,7 Z" class="lab-vector-arrow" />
      </marker>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg" />
    ${quadrantBg}
    ${grid}
    <line x1="${xScale(0)}" y1="${plotY}" x2="${xScale(0)}" y2="${plotBottom}" class="axis lab-axis" />
    <line x1="${plotX}" y1="${yScale(0)}" x2="${plotRight}" y2="${yScale(0)}" class="axis lab-axis" />
    ${tickLabels}
    <text x="${width / 2}" y="${plotBottom + 46}" class="axis-label" text-anchor="middle">a*</text>
    <text x="20" y="${plotY + plotSize / 2}" class="axis-label" transform="rotate(-90 20 ${plotY + plotSize / 2})" text-anchor="middle">b*</text>
    ${targetPolygon}${samplePolygon}${tonePaths}${vectors}${referenceDots}${sampleDots}${labels}
    <g class="chart-legend" transform="translate(${plotX} 28)">
      <circle r="4" cx="0" cy="0" class="lab-dot target" /><text x="10" y="4">${translateDynamicText("目标")}</text>
      <circle r="5" cx="62" cy="0" class="lab-dot pass" /><text x="74" y="4">${translateDynamicText("实测")}</text>
      <line x1="132" y1="0" x2="160" y2="0" class="lab-vector" marker-end="url(#labVectorArrow)" /><text x="170" y="4">${translateDynamicText("偏移")}</text>
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
  const kNpdcMax = g7NpdcLimit([...kNpdcRows, ...kTargetRows].flatMap((row) => [row.measuredNpdc, row.targetNpdc]));
  drawChart(npdcChart, npdcSeries, {
    yMin: 0,
    yMax: kNpdcMax,
    yLabel: "K NPDC",
    xTicks: g7ToneTicks(),
    yTicks: npdcTicks(kNpdcMax),
    yTickFormatter: (value) => value.toFixed(1),
    referenceDots: false,
    reference: [{ name: "G7 target", points: npdcRef.length ? npdcRef : fallbackNpdcRef, color: "#64748b" }],
  });

  const grayRows = aggregateGrayRows(g7.grayVerification || []);
  const cmyNpdcMax = g7NpdcLimit(grayRows.flatMap((row) => [row.measuredNpdc, row.targetNpdc]));
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
    xTicks: g7ToneTicks(),
    yTicks: npdcTicks(cmyNpdcMax),
    yTickFormatter: (value) => value.toFixed(1),
    referenceDots: false,
    reference: [{ name: "G7 target", points: cmyTarget, color: "#22c55e", dasharray: "4 4" }],
  });

  const graySeries = {
    a: grayRows.map((row, index) => ({
      x: grayTone(row, index),
      y: Number.isFinite(row.deltaA) ? row.deltaA : row.a,
      tooltip: `Gray ${fmt(grayTone(row, index))}% Δa*: ${fmt(Number.isFinite(row.deltaA) ? row.deltaA : row.a)} / a* ${fmt(row.a)}`,
    })),
    b: grayRows.map((row, index) => ({
      x: grayTone(row, index),
      y: Number.isFinite(row.deltaB) ? row.deltaB : row.b,
      tooltip: `Gray ${fmt(grayTone(row, index))}% Δb*: ${fmt(Number.isFinite(row.deltaB) ? row.deltaB : row.b)} / b* ${fmt(row.b)}`,
    })),
  };
  const grayComponentValues = Object.values(graySeries).flatMap((rows) => rows.map((row) => row.y)).filter(Number.isFinite);
  const grayComponentMax = Math.max(6, ...grayComponentValues.map((value) => Math.abs(value)));
  const grayLimit = g7SymmetricLimit(grayComponentMax, [8, 12, 15, 20, 30]);
  drawChart(grayChart, graySeries, {
    yMin: -grayLimit,
    yMax: grayLimit,
    yLabel: "Δa* / Δb*",
    xTicks: g7ToneTicks(),
    yTicks: symmetricToleranceTicks(grayLimit),
    referenceDots: false,
    horizontalBands: toleranceBands(),
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
  const weightedLimit = g7SymmetricLimit(deltaMax, [8, 12, 15, 20, 35, 50]);
  drawChart(weightedChart, weightedSeries, {
    yMin: -weightedLimit,
    yMax: weightedLimit,
    yLabel: "wΔL*",
    xTicks: g7ToneTicks(),
    yTicks: symmetricToleranceTicks(weightedLimit),
    referenceDots: false,
    horizontalBands: toleranceBands(),
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
  const width = config.width || 720;
  const height = config.height || 420;
  const pad = { left: 58, right: 24, top: 42, bottom: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xScale = (x) => pad.left + (x / 100) * plotW;
  const yScale = (y) => pad.top + (1 - (y - config.yMin) / (config.yMax - config.yMin)) * plotH;
  const colors = {
    C: chartColor("C"),
    M: chartColor("M"),
    Y: chartColor("Y"),
    K: chartColor("K"),
    a: chartColor("a"),
    b: chartColor("b"),
    Gray: chartColor("Gray")
  };

  const xTicks = config.xTicks || [0, 25, 50, 75, 100];
  const yTicks = config.yTicks || Array.from({ length: 6 }, (_, i) => config.yMin + ((config.yMax - config.yMin) / 5) * i);
  const yTickFormatter = config.yTickFormatter || ((value) => Number.isInteger(value) ? String(value) : String(Math.round(value)));
  const grid = xTicks.map((x) => `
    <line x1="${xScale(x)}" y1="${pad.top}" x2="${xScale(x)}" y2="${height - pad.bottom}" class="grid" />
    <text x="${xScale(x)}" y="${height - 18}" class="tick" text-anchor="middle">${x}</text>
  `).join("");
  const yGrid = yTicks.map((y) => `
    <line x1="${pad.left}" y1="${yScale(y)}" x2="${width - pad.right}" y2="${yScale(y)}" class="grid" />
    <text x="${pad.left - 12}" y="${yScale(y) + 4}" class="tick" text-anchor="end">${escapeHtml(yTickFormatter(y))}</text>
  `).join("");
  const horizontalBands = (config.horizontalBands || []).map((band) => horizontalBand(band, pad, width, yScale)).join("");
  const bands = (config.bands || []).map((item) => bandPath(item.points, xScale, yScale, item.color, item.name)).join("");
  const ref = (config.reference || []).map((item) => path(item.points, xScale, yScale, item.color, "reference", item.name, item.dasharray)).join("");
  const lines = config.connectLines === false
    ? ""
    : Object.entries(series).map(([channel, points]) => path(points, xScale, yScale, colors[channel] || "#2563eb", "series", channel)).join("");
  const dots = Object.entries(series).flatMap(([channel, points]) => points.map((point) => {
    const isDraggable = config.interactivePoints;
    return `
      <circle class="chart-dot${point.locked ? " locked" : ""}${point.quality ? ` ${point.quality}` : ""}${isDraggable ? " draggable-point" : ""}"
        cx="${xScale(point.x)}" cy="${yScale(point.y)}" r="${point.locked || point.quality ? 5 : 4}" fill="${colors[channel] || "#2563eb"}"
        data-dot-channel="${escapeHtml(channel)}"
        data-dot-x="${escapeHtml(point.x)}"
        ${isDraggable ? `data-draggable-point="true" data-channel="${escapeHtml(channel)}" data-tone="${escapeHtml(point.x)}" data-y="${escapeHtml(point.y)}"` : ""}
        ${point.dragKind ? `data-drag-kind="${escapeHtml(point.dragKind)}"` : ""}
        ${Number.isFinite(point.outputTone) ? `data-output-tone="${escapeHtml(point.outputTone)}"` : ""}
      >
        <title>${escapeHtml(point.tooltip || `${channel} ${fmt(point.x)} / ${fmt(point.y)}`)}</title>
      </circle>
    `;
  })).join("");
  const refDots = config.referenceDots === false ? "" : (config.reference || []).flatMap((item) => item.points.map((point) => `
    <circle class="chart-dot reference-dot" cx="${xScale(point.x)}" cy="${yScale(point.y)}" r="3" fill="${item.color}">
      <title>${escapeHtml(point.tooltip || `${item.name} ${fmt(point.x)} / ${fmt(point.y)}`)}</title>
    </circle>
  `)).join("");
  let legendX = pad.left;
  let legendY = 28;
  const legend = legendItems(series, config.reference || [], colors, config.bands || []).map((item) => {
    const itemWidth = Math.max(76, 40 + String(item.name || "").length * 12);
    if (legendX + itemWidth > width - pad.right) {
      legendX = pad.left;
      legendY += 18;
    }
    const x = legendX;
    const y = legendY;
    legendX += itemWidth;
    return `
    <g class="chart-legend" transform="translate(${x} ${y})">
      ${item.type === "band"
        ? `<rect x="0" y="-5" width="18" height="10" fill="${item.color}" class="chart-legend-band" />`
        : `<line x1="0" y1="0" x2="18" y2="0" stroke="${item.color}"${item.dasharray ? ` stroke-dasharray="${item.dasharray}"` : ""} />`}
      <text x="24" y="4">${escapeHtml(item.name)}</text>
    </g>
  `;
  }).join("");

  if (typeof svg.setAttribute === "function") {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  if (svg.dataset) {
    svg.dataset.chartWidth = String(width);
    svg.dataset.chartHeight = String(height);
    svg.dataset.chartYMin = String(config.yMin);
    svg.dataset.chartYMax = String(config.yMax);
    svg.dataset.chartPadTop = String(pad.top);
    svg.dataset.chartPadBottom = String(pad.bottom);
  }

  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg" />
    ${legend}
    ${horizontalBands}${grid}${yGrid}
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="axis" />
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="axis" />
    <text x="${width / 2}" y="${height - 4}" class="axis-label" text-anchor="middle">${translateDynamicText("输入网点 %")}</text>
    <text x="18" y="${height / 2}" class="axis-label" transform="rotate(-90 18 ${height / 2})" text-anchor="middle">${config.yLabel}</text>
    ${bands}${ref}${lines}${refDots}${dots}
  `;
}

function horizontalBand(band, pad, width, yScale) {
  const min = Math.min(band.min, band.max);
  const max = Math.max(band.min, band.max);
  const y = yScale(max);
  const h = yScale(min) - yScale(max);
  return `<rect x="${pad.left}" y="${y.toFixed(1)}" width="${width - pad.left - pad.right}" height="${h.toFixed(1)}" fill="${band.color}" opacity="${band.opacity ?? 0.12}" />`;
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
    const bucket = buckets.get(key) || { tone, a: [], b: [], deltaA: [], deltaB: [], chroma: [], weightedChroma: [], measuredNpdc: [], targetNpdc: [], labels: [] };
    if (Number.isFinite(row.a)) bucket.a.push(row.a);
    if (Number.isFinite(row.b)) bucket.b.push(row.b);
    if (Number.isFinite(row.deltaA)) bucket.deltaA.push(row.deltaA);
    if (Number.isFinite(row.deltaB)) bucket.deltaB.push(row.deltaB);
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
      deltaA: average(bucket.deltaA),
      deltaB: average(bucket.deltaB),
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

function averageByTone(rows, field) {
  const buckets = new Map();
  for (const row of rows) {
    const tone = rowTone(row);
    if (!Number.isFinite(tone) || !Number.isFinite(row[field])) continue;
    const key = tone.toFixed(3);
    const bucket = buckets.get(key) || { x: tone, values: [] };
    bucket.values.push(Number(row[field]));
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({ x: bucket.x, y: average(bucket.values) }))
    .sort((a, b) => a.x - b.x);
}

function rowTone(row) {
  return Number(row.tone);
}

function labFamilies(rows) {
  return rows.reduce((acc, row) => {
    const family = labFamily(row);
    if (!family) return acc;
    acc[family] ||= [];
    acc[family].push(row);
    return acc;
  }, {});
}

function labFamily(row) {
  const cmyk = row.cmyk || {};
  const c = Number(cmyk.c) || 0;
  const m = Number(cmyk.m) || 0;
  const y = Number(cmyk.y) || 0;
  const k = Number(cmyk.k) || 0;
  if (k > 0 && c < 1 && m < 1 && y < 1) return "K";
  if (c > 0 && m < 1 && y < 1 && k < 1) return "C";
  if (m > 0 && c < 1 && y < 1 && k < 1) return "M";
  if (y > 0 && c < 1 && m < 1 && k < 1) return "Y";
  if (m > 0 && y > 0 && c < 1 && k < 1) return "R";
  if (c > 0 && y > 0 && m < 1 && k < 1) return "G";
  if (c > 0 && m > 0 && y < 1 && k < 1) return "B";
  return "";
}

function labFamilyEndpoints(families) {
  return ["Y", "R", "M", "B", "C", "G"]
    .map((family) => labEndpoint(families[family]))
    .filter(Boolean);
}

function labEndpoint(rows = []) {
  return rows
    .filter((row) => row.lab && row.referenceLab)
    .sort((a, b) => labChroma(b.lab) - labChroma(a.lab))[0];
}

function labGamutPolygon(families, field, xScale, yScale, className) {
  const endpoints = labFamilyEndpoints(families);
  if (endpoints.length < 5) return "";
  const points = endpoints
    .filter((row) => row[field])
    .map((row) => `${xScale(row[field].a).toFixed(1)},${yScale(row[field].b).toFixed(1)}`);
  if (points.length < 3) return "";
  return `<polygon class="${className}" points="${points.join(" ")}"><title>${translateDynamicText(className.includes("target") ? "目标色域外圈" : "实测色域外圈")}</title></polygon>`;
}

function labTonePaths(families, xScale, yScale) {
  return Object.entries(families)
    .filter(([family, rows]) => family !== "K" && rows.length > 1)
    .map(([family, rows]) => {
      const points = [...rows]
        .filter((row) => row.lab)
        .sort((a, b) => labChroma(a.lab) - labChroma(b.lab));
      if (points.length < 2) return "";
      const d = points.map((row, index) => `${index ? "L" : "M"} ${xScale(row.lab.a).toFixed(1)} ${yScale(row.lab.b).toFixed(1)}`).join(" ");
      return `<path d="${d}" class="lab-tone-path lab-${family.toLowerCase()}"><title>${family} ${translateDynamicText("色相轨迹")}</title></path>`;
    })
    .join("");
}

function labChroma(lab) {
  return Math.sqrt((Number(lab?.a) || 0) ** 2 + (Number(lab?.b) || 0) ** 2);
}

function labFamilyLabel(row) {
  return labFamily(row) || shortLabLabel(row.label);
}

function labFamilyClass(row) {
  const family = labFamily(row);
  return family ? `lab-${family.toLowerCase()}` : "";
}

function measurementAxis(series, target, band, mode) {
  const values = [
    ...Object.values(series).flat().map((point) => Number(point.y)),
    ...target.map((point) => Number(point.y)),
    ...band.flatMap((point) => [Number(point.low), Number(point.high)]),
  ].filter(Number.isFinite);
  if (mode !== "ctv") {
    return { min: 0, max: Math.max(35, niceCeil(Math.max(...values, 0) * 1.08)) };
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

function g7ToneTicks() {
  return [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
}

function npdcTicks(max) {
  const limit = Math.max(2, Number(max) || 2);
  if (limit <= 2) return [0, 0.4, 0.8, 1.2, 1.6, 2.0];
  const step = limit <= 3 ? 0.5 : 1;
  const ticks = [];
  for (let value = 0; value <= limit + 0.0001; value += step) ticks.push(Number(value.toFixed(2)));
  return ticks;
}

function g7NpdcLimit(values) {
  const max = Math.max(0, ...values.filter(Number.isFinite));
  if (max <= 2) return 2;
  if (max <= 3) return 3;
  return niceCeil(max * 1.08);
}

function g7SymmetricLimit(maxValue, allowedLimits) {
  const target = Math.max(0, Number(maxValue) || 0) * 1.08;
  return allowedLimits.find((limit) => target <= limit) || niceCeil(target);
}

function symmetricToleranceTicks(limit) {
  const ticks = [-limit, -6, -3, 0, 3, 6, limit]
    .filter((value) => value >= -limit && value <= limit);
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function toleranceBands() {
  return [
    { min: -6, max: 6, color: "#f59e0b", opacity: 0.08 },
    { min: -3, max: 3, color: "#22c55e", opacity: 0.10 },
  ];
}

function legendItems(series, references, colors, bands = []) {
  const items = [
    ...bands.map((item) => ({ name: item.name, color: item.color, type: "band" })),
    ...references.filter((item) => item.showInLegend !== false).map((item) => ({ name: item.name, color: item.color, dasharray: item.dasharray })),
    ...Object.keys(series).map((name) => ({ name, color: colors[name] || "#2563eb" })),
  ];
  const seen = new Set();
  return items.filter((item) => !seen.has(item.name) && seen.add(item.name));
}

function chartColor(name) {
  return {
    C: "var(--chart-c, #0891b2)",
    M: "var(--chart-m, #be185d)",
    Y: "var(--chart-y, #ca8a04)",
    K: "var(--chart-k, #111827)",
    a: "var(--chart-a, #7c3aed)",
    b: "var(--chart-b, #ea580c)",
    Gray: "var(--chart-gray, #475569)"
  }[name] || "#2563eb";
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
    `${translateDynamicText("实测")} ${fmt(row.measuredTone ?? row.tone + row.measuredTvi)}% / ${translateDynamicText("目标")} ${fmt(row.targetTone ?? row.tone + row.targetTvi)}%`,
    `${translateDynamicText("理论输出")} ${fmt(row.theoreticalOutputTone ?? row.tone + row.theoreticalCorrection)}% / ${translateDynamicText("建议录入")} ${fmt(row.outputTone)}%`,
    `${translateDynamicText("调整")} ${signed(row.outputTone - row.tone)}% / ${translateDynamicText(row.interpolated ? "插值点" : "实测点")}`,
  ];
  if (quality?.messages?.length) parts.push(`${translateDynamicText("曲线检查")}: ${quality.messages.map(translateDynamicText).join(" / ")}`);
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
