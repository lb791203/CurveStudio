import { groupByChannel, number } from "./shared.js";
import { formatManualActionZh } from "./formatters.js";
import { densityFromSpectralRow, labFromSpectralRow, labFromXyz, xyzFromSpectralRow } from "./spectral-color.js?v=20260520-patchmap";

const CHANNELS = ["C", "M", "Y", "K"];
const DEFAULT_OUTPUT_GRID = [0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100];
const CHANNEL_FIELD_ALIASES = {
  C: ["cmyk_c", "cyan", "c"],
  M: ["cmyk_m", "magenta", "m"],
  Y: ["cmyk_y", "yellow", "y"],
  K: ["cmyk_k", "black", "key", "k"],
};

export const TARGETS = {
  isoA: { name: "ISO TVI A", points: [[0, 0], [10, 6], [20, 10], [30, 13], [40, 15], [50, 16], [60, 15], [70, 13], [80, 10], [90, 6], [100, 0]] },
  isoB: { name: "ISO TVI B", points: [[0, 0], [10, 5], [20, 8], [30, 11], [40, 13], [50, 14], [60, 13], [70, 11], [80, 8], [90, 5], [100, 0]] },
  isoC: { name: "ISO TVI C", points: [[0, 0], [10, 7], [20, 12], [30, 16], [40, 18], [50, 19], [60, 18], [70, 16], [80, 12], [90, 7], [100, 0]] },
  isoD: { name: "ISO TVI D", points: [[0, 0], [10, 8], [20, 14], [30, 18], [40, 21], [50, 22], [60, 21], [70, 18], [80, 14], [90, 8], [100, 0]] },
  isoE: { name: "ISO TVI E", points: [[0, 0], [10, 9], [20, 16], [30, 21], [40, 24], [50, 25], [60, 24], [70, 21], [80, 16], [90, 9], [100, 0]] },
  isoF: { name: "ISO TVI F", points: [[0, 0], [10, 10], [20, 18], [30, 24], [40, 27], [50, 28], [60, 27], [70, 24], [80, 18], [90, 10], [100, 0]] },
  linear: { name: "Linear CTV", points: [[0, 0], [100, 0]] },
  g7: { name: "G7 NPDC MVP", points: [[0, 0], [10, 4], [20, 8], [30, 11], [40, 13], [50, 14], [60, 13], [70, 11], [80, 8], [90, 4], [100, 0]] },
};

export function upsertTarget(id, target) {
  TARGETS[id] = {
    name: target.name || id,
    points: [...target.points].sort((a, b) => a[0] - b[0]),
  };
}

export function parseMeasurementText(text) {
  return parseImportText(text).measurements;
}

export function parseImportText(text, options = {}) {
  const normalized = normalizeLineEndings(text);
  if (!normalized.trim()) return emptyImport("Empty", ["No input text."]);

  if (/\bBEGIN_DATA_FORMAT\b/i.test(normalized) && /\bBEGIN_DATA\b/i.test(normalized)) {
    return parseCgatsText(normalized, options);
  }

  return parseDelimitedImport(normalized, options);
}

export function calculateCompensation(measurements, options) {
  const target = TARGETS[options.target] || TARGETS.isoA;
  const targetPoints = options.targetPoints || target.points;
  const limit = Number(options.limit) || 18;
  const smooth = Number(options.smooth) || 0;
  const compensationRatio = clamp(Number(options.compensationRatio ?? 100), 0, 100) / 100;
  const mode = options.mode || "tvi";
  const outputGrid = options.outputGrid === false ? null : options.outputGrid || DEFAULT_OUTPUT_GRID;
  const rows = measurements
    .map((item) => {
      const metric = resolveMeasurementMetric(item, mode);
      const measuredTvi = metric.delta;
      if (!Number.isFinite(measuredTvi)) return null;
      let channelTargetPoints = targetPoints;
      if (options.standardId === "sml_printspec_xl75_6c") {
        if (item.channel === "K") {
          channelTargetPoints = TARGETS.isoB.points;
        } else {
          channelTargetPoints = TARGETS.isoA.points;
        }
      }
      const targetTvi = interpolate(channelTargetPoints, item.tone);
      const measuredTone = metric.tone;
      const targetTone = clamp(item.tone + targetTvi, 0, 100);
      const tviDelta = measuredTvi - targetTvi;
      const rawCorrection = targetTvi - measuredTvi;
      const correction = clamp(rawCorrection * compensationRatio, -limit, limit);
      return {
        ...item,
        measuredTone,
        measuredTvi,
        targetTone,
        targetTvi,
        tviDelta,
        metricName: metric.name,
        metricMethod: metric.method,
        theoreticalCorrection: rawCorrection,
        compensationRatio: compensationRatio * 100,
        theoreticalOutputTone: clamp(item.tone + rawCorrection, 0, 100),
        productionOutputTone: clamp(item.tone + correction, 0, 100),
        correction,
        outputTone: clamp(item.tone + correction, 0, 100),
        interpolated: false,
      };
    })
    .filter(Boolean);

  const grouped = groupByChannel(rows);
  return Object.values(grouped)
    .flatMap((items) => {
      const channel = items[0]?.channel;
      let channelTargetPoints = targetPoints;
      if (options.standardId === "sml_printspec_xl75_6c") {
        if (channel === "K") {
          channelTargetPoints = TARGETS.isoB.points;
        } else {
          channelTargetPoints = TARGETS.isoA.points;
        }
      }
      return finalizeChannel(items, { smooth, outputGrid, targetPoints: channelTargetPoints });
    })
    .sort((a, b) => a.channel.localeCompare(b.channel) || a.tone - b.tone);
}

export function buildDiagnosticRows(measurements, options = {}) {
  const target = TARGETS[options.target] || TARGETS.isoA;
  const targetPoints = options.targetPoints || target.points;
  const mode = options.mode || "tvi";
  return measurements
    .map((item) => {
      const metric = resolveMeasurementMetric(item, mode);
      if (!Number.isFinite(metric.delta)) return null;
      const targetTvi = interpolate(targetPoints, item.tone);
      return {
        ...item,
        measuredTone: metric.tone,
        measuredTvi: metric.delta,
        targetTone: clamp(item.tone + targetTvi, 0, 100),
        targetTvi,
        tviDelta: metric.delta - targetTvi,
        metricName: metric.name,
        metricMethod: metric.method,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.channel.localeCompare(b.channel) || a.tone - b.tone);
}

export function toCsv(rows) {
  const header = ["channel", "input_tone", "metric", "measurement_method", "measured_tone", "target_tone", "measured_tvi", "target_tvi", "tvi_delta", "theoretical_adjustment", "compensation_ratio", "rip_adjustment", "theoretical_output", "production_output", "final_output", "point_source"];
  const body = toExportRows(rows).map((row) => [
    row.channel,
    row.inputTone,
    row.metric,
    row.measurementMethod,
    row.measuredTone,
    row.targetTone,
    row.measuredTvi,
    row.targetTvi,
    row.tviDelta,
    row.theoreticalAdjustment,
    row.compensationRatio,
    row.ripAdjustment,
    row.theoreticalOutputTone,
    row.productionOutputTone,
    row.outputTone,
    row.pointSource,
  ]);
  return [header, ...body].map((row) => row.join(",")).join("\n");
}

export function toHarmonyCsv(rows) {
  const header = [
    "channel",
    "input_tone",
    "harmony_output_tone",
    "manual_action_zh",
    "adjustment_percent",
    "measured_tone",
    "target_tone",
    "measured_tvi",
    "target_tvi",
    "tvi_delta",
    "theoretical_adjustment",
    "compensation_ratio",
    "theoretical_output",
    "production_output",
    "final_output",
    "measurement_method",
  ];
  const body = toExportRows(rows).map((row) => [
    row.channel,
    row.inputTone,
    row.outputTone,
    row.manualActionZh,
    row.ripAdjustment,
    row.measuredTone,
    row.targetTone,
    row.measuredTvi,
    row.targetTvi,
    row.tviDelta,
    row.theoreticalAdjustment,
    row.compensationRatio,
    row.theoreticalOutputTone,
    row.productionOutputTone,
    row.outputTone,
    row.measurementMethod,
  ]);
  return [header, ...body].map((row) => row.join(",")).join("\n");
}

export function toCgatsText(rows) {
  const exportRows = toExportRows(rows);
  const fields = [
    "SAMPLE_ID",
    "CHANNEL",
    "INPUT_TONE",
    "MEASURED_TONE",
    "TARGET_TONE",
    "MEASURED_TVI",
    "TARGET_TVI",
    "TVI_DELTA",
    "THEORETICAL_ADJUSTMENT",
    "COMPENSATION_RATIO",
    "RIP_ADJUSTMENT",
    "THEORETICAL_OUTPUT",
    "PRODUCTION_OUTPUT",
    "OUTPUT_TONE",
    "POINT_SOURCE",
    "METRIC",
    "MEASUREMENT_METHOD",
  ];
  const body = exportRows.map((row, index) => [
    index + 1,
    row.channel,
    row.inputTone,
    row.measuredTone,
    row.targetTone,
    row.measuredTvi,
    row.targetTvi,
    row.tviDelta,
    row.theoreticalAdjustment,
    row.compensationRatio,
    row.ripAdjustment,
    row.theoreticalOutputTone,
    row.productionOutputTone,
    row.outputTone,
    row.pointSource,
    row.metric,
    row.measurementMethod,
  ].join("\t"));

  return [
    "CGATS.17",
    "",
    'ORIGINATOR\t"CurveStudio"',
    'DESCRIPTOR\t"Compensation curve export"',
    `NUMBER_OF_FIELDS\t${fields.length}`,
    "BEGIN_DATA_FORMAT",
    fields.join("\t"),
    "END_DATA_FORMAT",
    "",
    `NUMBER_OF_SETS\t${exportRows.length}`,
    "BEGIN_DATA",
    ...body,
    "END_DATA",
    "",
  ].join("\n");
}

export function toExportRows(rows) {
  return rows.map((row) => {
    const ripAdjustment = row.outputTone - row.tone;
    return {
      channel: row.channel,
      inputTone: format(row.tone),
      measuredTone: format(row.measuredTone ?? row.tone + row.measuredTvi),
      targetTone: format(row.targetTone ?? row.tone + row.targetTvi),
      measuredTvi: format(row.measuredTvi),
      targetTvi: format(row.targetTvi),
      tviDelta: format(row.tviDelta ?? row.measuredTvi - row.targetTvi),
      theoreticalAdjustment: format(row.theoreticalCorrection ?? row.targetTvi - row.measuredTvi),
      compensationRatio: format(row.compensationRatio ?? 100),
      ripAdjustment: format(ripAdjustment),
      theoreticalOutputTone: format(row.theoreticalOutputTone ?? row.tone + row.theoreticalCorrection),
      productionOutputTone: format(row.productionOutputTone ?? row.tone + row.correction),
      outputTone: format(row.outputTone),
      autoOutputTone: format(row.autoOutputTone ?? row.outputTone),
      overrideLocked: Boolean(row.overrideLocked),
      pointSource: row.interpolated ? "interpolated" : "measured",
      manualActionZh: formatManualActionZh(ripAdjustment, format),
      metric: row.metricName || "TVI",
      measurementMethod: row.metricMethod || row.measuredToneMethod || row.colorimetricMethod || "reported",
    };
  });
}

export function murrayDaviesToneFromDensity(tintDensity, solidDensity, paperDensity = 0) {
  const tintRelative = tintDensity - (Number.isFinite(paperDensity) ? paperDensity : 0);
  const solidRelative = solidDensity - (Number.isFinite(paperDensity) ? paperDensity : 0);
  if (!Number.isFinite(tintRelative) || !Number.isFinite(solidRelative) || solidRelative <= 0.01) return NaN;
  return clamp(100 * (1 - 10 ** (-tintRelative)) / (1 - 10 ** (-solidRelative)), 0, 100);
}

export function spotColorToneValueFromLab(toneLab, paperLab, solidLab) {
  if (!toneLab || !paperLab || !solidLab) return NaN;
  return spotColorToneValue(vectorFromLab(toneLab), vectorFromLab(paperLab), vectorFromLab(solidLab));
}

export function spotColorToneValueFromXyz(toneXyz, paperXyz, solidXyz) {
  if (!toneXyz || !paperXyz || !solidXyz) return NaN;
  return spotColorToneValue(vectorFromXyz(toneXyz), vectorFromXyz(paperXyz), vectorFromXyz(solidXyz));
}

export function targetSeries(targetId) {
  return (TARGETS[targetId] || TARGETS.isoA).points.map(([tone, value]) => ({ tone, value }));
}

export function channelsPresent(rows) {
  return CHANNELS.filter((channel) => rows.some((row) => row.channel === channel));
}

function parseCgatsText(text, options = {}) {
  const metadata = {};
  const fields = [];
  const dataRows = [];
  let inFormat = false;
  let inData = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const keyword = cgatsKeyword(line);

    if (keyword === "BEGIN_DATA_FORMAT") {
      inFormat = true;
      continue;
    }
    if (keyword === "END_DATA_FORMAT") {
      inFormat = false;
      continue;
    }
    if (keyword === "BEGIN_DATA") {
      inData = true;
      continue;
    }
    if (keyword === "END_DATA") {
      inData = false;
      continue;
    }

    if (inFormat) {
      fields.push(...splitCgatsLine(line));
      continue;
    }
    if (inData) {
      const cells = splitCgatsLine(line);
      if (cells.length) dataRows.push(cells);
      continue;
    }

    parseMetadataLine(line, metadata);
  }

  deriveMetadata(metadata);
  const rawRows = dataRows.map((row) => objectFromFields(fields, row));
  const measurements = buildMeasurementsFromObjects(rawRows, {
    sourceFormat: "CGATS/IT8",
    metadata,
    densityFilter: options.densityFilter || "status_t",
  });

  const warnings = [];
  if (!fields.length) warnings.push("CGATS data format was not found.");
  if (!dataRows.length) warnings.push("CGATS data table was empty.");
  if (measurements.length && !measurements.some(hasUsableMetric)) {
    warnings.push("Imported patches do not contain TVI, measured tone, density, or usable spectral data.");
  }
  appendDensityFilterWarning(warnings, options.densityFilter);

  return {
    sourceFormat: "CGATS/IT8",
    metadata,
    fields: fields.map(normalizeHeader),
    rawRows,
    measurements,
    warnings,
  };
}

function parseDelimitedImport(text, options = {}) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (!lines.length) return emptyImport("Delimited", ["No data rows found."]);

  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map((line) => trimTrailingEmpty(splitDelimitedLine(line, delimiter))).filter((row) => row.length);
  const header = rows[0].map(normalizeHeader);
  const hasHeader = looksLikeHeader(header);

  if (hasHeader) {
    const fields = rows[0];
    const rawRows = rows.slice(1).map((row) => objectFromFields(fields, row));
    const measurements = buildMeasurementsFromObjects(rawRows, {
      sourceFormat: "Delimited",
      metadata: {},
      densityFilter: options.densityFilter || "status_t",
    });
    const warnings = measurements.length ? [] : ["No usable measurement rows found."];
    appendDensityFilterWarning(warnings, options.densityFilter);
    return {
      sourceFormat: delimiter === "," ? "CSV" : "Delimited",
      metadata: {},
      fields: fields.map(normalizeHeader),
      rawRows,
      measurements,
      warnings,
    };
  }

  const measurements = rows
    .map((row, index) => parseRow(row, null, index))
    .filter(Boolean)
    .sort(sortMeasurement);
  const usedChannelFallback = measurements.length && rows.some((row) => usesHeaderlessChannelFallback(row));
  const warnings = [];
  if (!measurements.length) warnings.push("No usable measurement rows found.");
  if (usedChannelFallback) warnings.push("无通道列，已按 C/M/Y/K 轮替分配（可能不准确）。");
  appendDensityFilterWarning(warnings, options.densityFilter);

  return {
    sourceFormat: delimiter === "," ? "CSV" : "Delimited",
    metadata: {},
    fields: [],
    rawRows: rows,
    measurements,
    warnings,
  };
}

function buildMeasurementsFromObjects(rawRows, context) {
  const cmykRows = rawRows.filter(hasCmykValues);
  const paperRow = cmykRows.find(isPaperRow);
  const solidRows = Object.fromEntries(
    CHANNELS.map((channel) => [channel, cmykRows.find((row) => isPureChannelTone(row, channel, 100))])
  );

  return rawRows
    .map((row, index) => {
      const direct = measurementFromDirectRow(row, index, { ...context, paperRow, solidRows });
      if (direct) return direct;

      const pure = pureSingleChannel(row);
      if (!pure) return null;

      return measurementFromPatchRow(row, pure.channel, pure.tone, {
        ...context,
        paperRow,
        solidRow: solidRows[pure.channel],
      });
    })
    .filter(Boolean)
    .sort(sortMeasurement);
}

function measurementFromDirectRow(row, index, context) {
  const channel = normalizeChannel(readValue(row, "channel", "ink", "color", "separation"));
  const tone = number(readValue(row, "tone", "input", "input_tone", "input_percent", "patch_tone"));
  if (!channel || !Number.isFinite(tone)) return null;
  const solidRow = context.solidRows?.[channel] || context.solidRow;

  return {
    channel,
    tone: clamp(tone, 0, 100),
    patchType: readValue(row, "patch_type", "patch", "type") || "tone",
    sampleId: readValue(row, "sample_id", "sampleid", "sample_name"),
    lab: labFromRow(row),
    xyz: xyzFromRow(row),
    note: readValue(row, "note", "remark", "remarks"),
    source: readValue(row, "source") || context.sourceFormat,
    ...measurementMetrics(row, channel, tone, { ...context, solidRow }),
    sourceFormat: context.sourceFormat,
    measurementCondition: context.metadata.measurement_condition,
  };
}

function measurementFromPatchRow(row, channel, tone, context) {
  const sampleId = readValue(row, "sample_id", "sampleid", "sample_name", "sample_name");
  return {
    channel,
    tone: clamp(tone, 0, 100),
    sampleId,
    lab: labFromRow(row),
    xyz: xyzFromRow(row),
    ...measurementMetrics(row, channel, tone, context),
    sourceFormat: context.sourceFormat,
    measurementCondition: context.metadata.measurement_condition,
  };
}

function measurementMetrics(row, channel, tone, context) {
  const lower = channel.toLowerCase();
  let measuredTvi = number(readValue(row, "measured_tvi", "tvi", "dot_gain", `tvi_${lower}`));
  let measuredTone = number(readValue(row, "measured_tone", "print_tone", "tone_value", "dot_area", "apparent_dot_area", `tone_${lower}`));
  let density = densityFromRow(row, channel);
  let densityMethod;
  let measuredToneMethod = Number.isFinite(measuredTone) ? "reported_tone" : undefined;
  const instrumentCtv = instrumentCtvFromRow(row, channel);
  let solidDensity = solidDensityForRow(row, channel, context);
  let paperDensity = paperDensityForRow(row, channel, context);
  let paperRelativeDensity = false;

  if (!Number.isFinite(density)) {
    if (densityFilterAllowsSpectralDensity(context.densityFilter)) {
      density = densityFromSpectralRow(row, context.paperRow, channel);
      paperRelativeDensity = Number.isFinite(density);
      densityMethod = Number.isFinite(density) ? "status_t_spectral" : undefined;
    } else if (hasSpectralFields(row)) {
      densityMethod = "spectral_density_disabled";
    }
  }

  if (!Number.isFinite(measuredTone) && Number.isFinite(density) && context.solidRow) {
    if (!Number.isFinite(solidDensity)) {
      if (densityFilterAllowsSpectralDensity(context.densityFilter)) {
        solidDensity = densityFromSpectralRow(context.solidRow, context.paperRow, channel);
        paperRelativeDensity = Number.isFinite(solidDensity);
      }
    }
    measuredTone = murrayDaviesToneFromDensity(density, solidDensity, paperRelativeDensity ? 0 : paperDensity);
    if (Number.isFinite(measuredTone)) {
      measuredToneMethod = paperRelativeDensity ? "murray_davies_status_t_spectral" : "murray_davies_density";
      densityMethod ||= measuredToneMethod;
    }
  }

  if (!Number.isFinite(measuredTvi) && Number.isFinite(measuredTone)) {
    measuredTvi = measuredTone - tone;
  }
  const colorimetric = isColorimetricMeasurementCandidate(row, context)
    ? colorimetricToneFromColor(row, context.paperRow, context.solidRow)
    : { tone: NaN, method: undefined };

  return {
    measuredTvi: Number.isFinite(measuredTvi) ? measuredTvi : undefined,
    measuredTone: Number.isFinite(measuredTone) ? measuredTone : undefined,
    measuredToneMethod,
    colorimetricTone: Number.isFinite(colorimetric.tone) ? colorimetric.tone : undefined,
    colorimetricMethod: colorimetric.method,
    instrumentCtv: Number.isFinite(instrumentCtv.value) ? instrumentCtv.value : undefined,
    instrumentCtvMethod: instrumentCtv.method,
    density: Number.isFinite(density) ? density : undefined,
    solidDensity: Number.isFinite(solidDensity) ? solidDensity : undefined,
    paperDensity: Number.isFinite(paperDensity) ? paperDensity : undefined,
    densityMethod,
  };
}

function densityFilterAllowsSpectralDensity(filter = "status_t") {
  return !filter || filter === "status_t";
}

function appendDensityFilterWarning(warnings, filter = "status_t") {
  if (filter === "none") {
    warnings.push("密度滤色器设为 None：已禁用光谱密度 TVI 换算，只使用文件报告的网点/TVI/密度。");
  } else if (filter && filter !== "status_t") {
    warnings.push(`密度滤色器 ${filter} 尚未验证，当前不会用于正式光谱密度计算。`);
  }
}

function hasSpectralFields(row = {}) {
  return Object.keys(row).some((key) => /(?:spectral_nm|nm_?|spectrum_?)(\d{3})$/i.test(key));
}

function parseRow(row, headerMap, index) {
  const explicitChannel = normalizeChannel(valueByHeaders(row, headerMap, ["channel", "ink", "color"]) ?? row[0]);
  const channel = explicitChannel || (headerMap ? null : CHANNELS[index % CHANNELS.length]);
  const tone = number(valueByHeaders(row, headerMap, ["tone", "input", "input_tone"]) ?? (explicitChannel ? row[1] : row[0]));
  const measuredTvi = number(valueByHeaders(row, headerMap, ["measured_tvi", "tvi", "dot_gain"]));
  const measuredTone = number(valueByHeaders(row, headerMap, ["measured_tone", "print_tone", "tone_value"]) ?? (explicitChannel ? row[2] : row[1]));
  const density = number(valueByHeaders(row, headerMap, ["density", "status_density"]) ?? (headerMap ? undefined : explicitChannel ? row[3] : row[2]));

  if (!channel || !Number.isFinite(tone)) return null;

  return {
    channel,
    tone: clamp(tone, 0, 100),
    measuredTvi: Number.isFinite(measuredTvi) ? measuredTvi : undefined,
    measuredTone: Number.isFinite(measuredTone) ? measuredTone : undefined,
    density: Number.isFinite(density) ? density : undefined,
  };
}

function usesHeaderlessChannelFallback(row) {
  return !normalizeChannel(row[0]) && Number.isFinite(number(row[0]));
}

function resolveMeasurementMetric(item, mode) {
  if (mode === "ctv" && Number.isFinite(item.colorimetricTone)) {
    return {
      name: "CTV",
      method: item.colorimetricMethod || "iso_20654_colorimetric",
      tone: item.colorimetricTone,
      delta: item.colorimetricTone - item.tone,
    };
  }
  if (Number.isFinite(item.measuredTvi)) {
    return {
      name: mode === "ctv" ? "TVI fallback" : "TVI",
      method: item.measuredToneMethod || "reported_tvi",
      tone: clamp(item.tone + item.measuredTvi, 0, 100),
      delta: item.measuredTvi,
    };
  }
  if (Number.isFinite(item.measuredTone)) {
    return {
      name: mode === "ctv" ? "TVI fallback" : "TVI",
      method: item.measuredToneMethod || "reported_tone",
      tone: item.measuredTone,
      delta: item.measuredTone - item.tone,
    };
  }
  if (Number.isFinite(item.density) && Number.isFinite(item.solidDensity)) {
    const tone = murrayDaviesToneFromDensity(item.density, item.solidDensity, item.paperDensity || 0);
    return {
      name: mode === "ctv" ? "TVI fallback" : "TVI",
      method: "murray_davies_density",
      tone,
      delta: tone - item.tone,
    };
  }
  if (Number.isFinite(item.density)) {
    const delta = densityToApproxTvi(item.density, item.tone);
    return {
      name: mode === "ctv" ? "TVI fallback" : "TVI",
      method: "density_without_solid_fallback",
      tone: clamp(item.tone + delta, 0, 100),
      delta,
    };
  }
  return { name: mode === "ctv" ? "CTV" : "TVI", method: "missing", tone: NaN, delta: NaN };
}

function densityToApproxTvi(density, tone) {
  const solidDensity = Math.max(1.2, density);
  const apparent = 100 * (1 - 10 ** (-density)) / (1 - 10 ** (-solidDensity));
  return clamp(apparent - tone, -20, 40);
}

function smoothChannel(items, strength) {
  if (strength <= 0 || items.length < 3) return items;
  const sorted = [...items].sort((a, b) => a.tone - b.tone);
  for (let pass = 0; pass < strength; pass += 1) {
    const previousPass = sorted.map((row) => ({ ...row }));
    for (let i = 1; i < sorted.length - 1; i += 1) {
      const previous = previousPass[i - 1];
      const current = previousPass[i];
      const next = previousPass[i + 1];
      const span = next.tone - previous.tone;
      if (span <= 0) continue;
      const position = clamp((current.tone - previous.tone) / span, 0, 1);
      const neighborLine = previous.outputTone + (next.outputTone - previous.outputTone) * position;
      const outputTone = (current.outputTone + neighborLine) / 2;
      sorted[i] = { ...sorted[i], outputTone: clamp(outputTone, 0, 100) };
      sorted[i].correction = sorted[i].outputTone - sorted[i].tone;
    }
  }
  return sorted;
}

function interpolate(points, tone) {
  if (tone <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (tone <= x2) {
      const ratio = (tone - x1) / (x2 - x1);
      return y1 + (y2 - y1) * ratio;
    }
  }
  return points.at(-1)[1];
}

function splitDelimitedLine(line, delimiter) {
  if (delimiter === "auto") return tokenizeFlexibleLine(line);

  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(unquoteValue(current.trim()));
      current = "";
    } else current += char;
  }
  out.push(unquoteValue(current.trim()));
  return out;
}

function splitCgatsLine(line) {
  return trimTrailingEmpty(tokenizeFlexibleLine(stripTrailingCsv(line)));
}

function tokenizeFlexibleLine(line) {
  const out = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "," || char === "\t" || /\s/.test(char))) {
      if (current) {
        out.push(unquoteValue(current.trim()));
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) out.push(unquoteValue(current.trim()));
  return out.filter((item) => item !== "");
}

function cgatsKeyword(line) {
  return tokenizeFlexibleLine(stripOuterQuotes(stripTrailingCsv(line)))[0]?.toUpperCase() || "";
}

function parseMetadataLine(line, metadata) {
  const cleaned = stripOuterQuotes(stripTrailingCsv(line));
  if (!cleaned || cleaned.startsWith("#")) return;
  if (/^CGATS/i.test(cleaned)) {
    metadata.file_type = cleaned;
    return;
  }

  const match = cleaned.match(/^([A-Za-z0-9_.-]+)\s+(.*)$/);
  if (!match) return;

  const key = normalizeHeader(match[1]);
  const value = unquoteValue(match[2]);
  setMetadata(metadata, key, value);
}

function deriveMetadata(metadata) {
  const values = Object.values(metadata).flat().map(String).join(" ");
  const measurementCondition = values.match(/MeasurementCondition\s*=\s*(M[0-3])/i);
  if (measurementCondition && !metadata.measurement_condition) {
    metadata.measurement_condition = measurementCondition[1].toUpperCase();
  }
}

function setMetadata(metadata, key, value) {
  if (!key || value === undefined || value === "") return;
  if (metadata[key] === undefined) metadata[key] = value;
  else if (Array.isArray(metadata[key])) metadata[key].push(value);
  else metadata[key] = [metadata[key], value];
}

function objectFromFields(fields, cells) {
  return fields.reduce((acc, field, index) => {
    const key = normalizeHeader(field);
    if (key) acc[key] = cells[index] ?? "";
    return acc;
  }, {});
}

function hasCmykValues(row) {
  return CHANNELS.some((channel) => Number.isFinite(channelPercent(row, channel)));
}

function isPaperRow(row) {
  return CHANNELS.every((channel) => approxZero(channelPercent(row, channel)));
}

function isPureChannelTone(row, channel, tone) {
  const value = channelPercent(row, channel);
  return Number.isFinite(value)
    && Math.abs(value - tone) < 0.01
    && CHANNELS.every((candidate) => candidate === channel || approxZero(channelPercent(row, candidate)));
}

function pureSingleChannel(row) {
  if (!hasCmykValues(row)) return null;
  const active = CHANNELS
    .map((channel) => ({ channel, tone: channelPercent(row, channel) }))
    .filter((item) => Number.isFinite(item.tone) && item.tone > 0.0001);

  if (active.length !== 1) return null;
  const [single] = active;
  const othersZero = CHANNELS.every((channel) => channel === single.channel || approxZero(channelPercent(row, channel)));
  return othersZero ? single : null;
}

function colorimetricToneFromColor(row, paperRow, solidRow) {
  const sampleLab = labFromRow(row);
  const paperLab = labFromRow(paperRow || {});
  const solidLab = labFromRow(solidRow || {});
  const labTone = spotColorToneValueFromLab(sampleLab, paperLab, solidLab);
  if (Number.isFinite(labTone)) return { tone: labTone, method: "iso_20654_lab" };

  const sampleXyz = xyzFromRow(row);
  const paperXyz = xyzFromRow(paperRow || {});
  const solidXyz = xyzFromRow(solidRow || {});
  const xyzTone = spotColorToneValueFromXyz(sampleXyz, paperXyz, solidXyz);
  if (Number.isFinite(xyzTone)) return { tone: xyzTone, method: "iso_20654_xyz_d50" };

  return { tone: NaN, method: undefined };
}

function isColorimetricMeasurementCandidate(row, context) {
  if (metadataLooksReference(context.metadata)) return false;
  if (labFromRow(row) || xyzFromRow(row)) return true;
  if (Number.isFinite(number(readValue(row, "measured_tvi", "tvi", "dot_gain")))) return true;
  if (Number.isFinite(number(readValue(row, "measured_tone", "print_tone", "tone_value", "dot_area", "apparent_dot_area")))) return true;
  if (Number.isFinite(densityFromRow(row, "C")) || Number.isFinite(densityFromRow(row, "M")) || Number.isFinite(densityFromRow(row, "Y")) || Number.isFinite(densityFromRow(row, "K"))) return true;
  if (context.metadata?.measurement_condition || context.metadata?.measurement_source || context.metadata?.instrumentation) return true;
  const role = String(readValue(row, "source", "measurement_source", "measurement_role", "origin", "data_type") || "").toLowerCase();
  return /(measure|instrument|manual|scan|press|run|sample)/.test(role);
}

function metadataLooksReference(metadata = {}) {
  const text = [
    metadata.descriptor,
    metadata.file_descriptor,
    metadata.originator,
    metadata.devcalstd,
    metadata.target_type,
    metadata.print_conditions,
    metadata.copyright,
  ].flat().filter(Boolean).join(" ").toLowerCase();
  return /\breference\b|color characterization|print condition|fogra|gracol|snap|tr00|ansi cgats/.test(text);
}

function spotColorToneValue(toneVector, paperVector, solidVector) {
  const full = vectorDistance(solidVector, paperVector);
  if (!Number.isFinite(full) || full <= 0.001) return NaN;
  return clamp((vectorDistance(toneVector, paperVector) / full) * 100, 0, 100);
}

function vectorFromLab(lab) {
  if (!lab) return null;
  return { x: lab.l, y: lab.a, z: lab.b };
}

function vectorFromXyz(xyz) {
  const normalized = normalizeXyzScale(xyz);
  if (!normalized) return null;
  return vectorFromLab(labFromXyz(normalized));
}

function vectorDistance(a, b) {
  if (!a || !b) return NaN;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function normalizeXyzScale(xyz) {
  if (!xyz || ![xyz.x, xyz.y, xyz.z].every(Number.isFinite)) return null;
  const max = Math.max(xyz.x, xyz.y, xyz.z);
  if (max > 0 && max <= 1.5) return { x: xyz.x * 100, y: xyz.y * 100, z: xyz.z * 100 };
  return xyz;
}

function labFromRow(row) {
  const l = number(readValue(row, "lab_l", "lab_lstar"));
  const a = number(readValue(row, "lab_a", "lab_astar"));
  const b = number(readValue(row, "lab_b", "lab_bstar"));
  return [l, a, b].every(Number.isFinite) ? { l, a, b } : labFromSpectralRow(row) || undefined;
}

function xyzFromRow(row) {
  const x = number(readValue(row, "xyz_x"));
  const y = number(readValue(row, "xyz_y"));
  const z = number(readValue(row, "xyz_z"));
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : xyzFromSpectralRow(row) || undefined;
}

function readValue(row, ...keys) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (row[normalized] !== undefined && row[normalized] !== "") return row[normalized];
  }
  return undefined;
}

function densityFromRow(row, channel) {
  const lower = channel.toLowerCase();
  return number(readValue(row, "density", `density_${lower}`, `d_${lower}`, "status_density", "density_status"));
}

function instrumentCtvFromRow(row, channel) {
  const lower = channel.toLowerCase();
  const aliases = [
    "instrument_ctv",
    "instrument_sctv",
    "measured_ctv",
    "ctv",
    "sctv",
    "iso_20654_ctv",
    "iso20654_ctv",
    "colorimetric_tone",
    `instrument_ctv_${lower}`,
    `ctv_${lower}`,
    `sctv_${lower}`,
  ];
  for (const alias of aliases) {
    const value = number(readValue(row, alias));
    if (Number.isFinite(value)) return { value, method: alias };
  }
  return { value: NaN, method: "" };
}

function paperDensityForRow(row, channel, context) {
  const lower = channel.toLowerCase();
  const own = number(readValue(row, "paper_density", `paper_density_${lower}`, `density_paper_${lower}`));
  if (Number.isFinite(own)) return own;
  if (context.paperRow) {
    const fromPaper = densityFromRow(context.paperRow, channel);
    if (Number.isFinite(fromPaper)) return fromPaper;
  }
  return 0;
}

function solidDensityForRow(row, channel, context) {
  const lower = channel.toLowerCase();
  const own = number(readValue(row, "solid_density", `solid_density_${lower}`, `density_solid_${lower}`));
  if (Number.isFinite(own)) return own;
  if (context.solidRow) {
    const fromSolid = densityFromRow(context.solidRow, channel);
    if (Number.isFinite(fromSolid)) return fromSolid;
  }
  return NaN;
}

function channelPercent(row, channel) {
  return number(readValue(row, ...CHANNEL_FIELD_ALIASES[channel]));
}

function valueByHeaders(row, headerMap, keys) {
  if (!headerMap) return undefined;
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (normalized in headerMap) return row[headerMap[normalized]];
  }
  return undefined;
}

function normalizeHeader(value) {
  return String(value)
    .trim()
    .replace(/["']/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function looksLikeHeader(header) {
  const headerSet = new Set(header);
  return [
    "channel",
    "ink",
    "tone",
    "input_tone",
    "measured_tvi",
    "measured_tone",
    "density",
    "ctv",
    "sctv",
    "instrument_ctv",
    "patch_type",
    "sample_id",
    "sampleid",
    "source",
    "note",
    "cmyk_c",
    "cmyk_m",
    "cmyk_y",
    "cmyk_k",
    "lab_l",
    "xyz_x",
  ].some((value) => headerSet.has(value));
}

function buildHeaderMap(header) {
  return Object.fromEntries(header.map((key, index) => [key, index]));
}

function normalizeChannel(value) {
  const channel = String(value ?? "").trim().toUpperCase();
  if (["C", "CYAN"].includes(channel)) return "C";
  if (["M", "MAGENTA"].includes(channel)) return "M";
  if (["Y", "YELLOW"].includes(channel)) return "Y";
  if (["K", "BLACK", "KEY"].includes(channel)) return "K";
  return null;
}

function detectDelimiter(line) {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes(";")) return ";";
  return "auto";
}

function finalizeChannel(items, { smooth, outputGrid, targetPoints }) {
  let rows = [...items].sort((a, b) => a.tone - b.tone);
  rows = smoothChannel(rows, smooth);
  rows = preserveCorrectionDirection(rows);
  rows = protectToneEnds(rows);
  rows = enforceMonotonic(rows);
  rows = preserveCorrectionDirection(rows);
  if (outputGrid) rows = interpolateRowsToGrid(rows, outputGrid, targetPoints);
  rows = preserveCorrectionDirection(rows);
  return rows.map((row) => ({ ...row, finalOutputTone: row.outputTone }));
}

function preserveCorrectionDirection(items) {
  return items.map((row) => {
    let outputTone = row.outputTone;
    const intended = row.productionOutputTone;
    if (row.tviDelta > 0.01 && outputTone >= row.tone) {
      outputTone = Number.isFinite(intended) && intended < row.tone ? intended : row.tone;
    }
    if (row.tviDelta < -0.01 && outputTone <= row.tone) {
      outputTone = Number.isFinite(intended) && intended > row.tone ? intended : row.tone;
    }
    if (outputTone === row.outputTone) return row;
    return {
      ...row,
      outputTone,
      productionOutputTone: row.productionOutputTone,
      correction: outputTone - row.tone,
    };
  });
}

function protectToneEnds(items) {
  return items.map((row) => {
    let maxMove = Infinity;
    if (row.tone <= 10) maxMove = 3;
    if (row.tone >= 80) maxMove = 5;
    if (!Number.isFinite(maxMove)) return row;
    const limited = clamp(row.outputTone, row.tone - maxMove, row.tone + maxMove);
    return { ...row, outputTone: clamp(limited, 0, 100), correction: limited - row.tone };
  });
}

function enforceMonotonic(items) {
  const rows = [...items].sort((a, b) => a.tone - b.tone);
  let previous = -Infinity;
  return rows.map((row) => {
    const outputTone = Math.max(previous, row.outputTone);
    previous = outputTone;
    return { ...row, outputTone, correction: outputTone - row.tone };
  });
}

function interpolateRowsToGrid(items, grid, targetPoints) {
  const rows = withToneAnchors(items).sort((a, b) => a.tone - b.tone);
  return [...new Set(grid)]
    .sort((a, b) => a - b)
    .map((tone) => {
      const exact = rows.find((row) => Math.abs(row.tone - tone) < 0.001 && !row.anchor);
      if (exact) return exact;
      const targetTvi = interpolate(targetPoints, tone);
      const measuredTvi = interpolateProperty(rows, tone, "measuredTvi", targetTvi);
      const targetTone = clamp(tone + targetTvi, 0, 100);
      const measuredTone = clamp(tone + measuredTvi, 0, 100);
      const theoreticalCorrection = interpolateProperty(rows, tone, "theoreticalCorrection", targetTvi - measuredTvi);
      const correction = interpolateProperty(rows, tone, "correction", theoreticalCorrection);
      const outputTone = interpolateProperty(rows, tone, "outputTone", clamp(tone + correction, 0, 100));
      const nearest = nearestMeasuredRow(rows, tone);
      return {
        ...(nearest || rows[0]),
        tone,
        measuredTone,
        targetTone,
        measuredTvi,
        targetTvi,
        tviDelta: measuredTvi - targetTvi,
        theoreticalCorrection,
        correction: outputTone - tone,
        theoreticalOutputTone: clamp(tone + theoreticalCorrection, 0, 100),
        productionOutputTone: clamp(tone + correction, 0, 100),
        outputTone: clamp(outputTone, 0, 100),
        metricName: nearest?.metricName || rows[0].metricName,
        metricMethod: nearest?.metricMethod ? `interpolated_${nearest.metricMethod}` : rows[0].metricMethod,
        interpolated: true,
        anchor: false,
      };
    });
}

function nearestMeasuredRow(rows, tone) {
  const candidates = rows.filter((row) => !row.anchor);
  if (!candidates.length) return null;
  return candidates.reduce((nearest, row) => (
    Math.abs(row.tone - tone) < Math.abs(nearest.tone - tone) ? row : nearest
  ), candidates[0]);
}

function withToneAnchors(items) {
  const rows = [...items];
  const channel = rows[0]?.channel || "C";
  if (!rows.some((row) => row.tone === 0)) rows.unshift(identityAnchor(channel, 0));
  if (!rows.some((row) => row.tone === 100)) rows.push(identityAnchor(channel, 100));
  return rows;
}

function identityAnchor(channel, tone) {
  return {
    channel,
    tone,
    measuredTone: tone,
    measuredTvi: 0,
    targetTone: tone,
    targetTvi: 0,
    tviDelta: 0,
    theoreticalCorrection: 0,
    compensationRatio: 100,
    correction: 0,
    theoreticalOutputTone: tone,
    productionOutputTone: tone,
    outputTone: tone,
    metricName: "TVI",
    metricMethod: "anchor",
    interpolated: true,
    anchor: true,
  };
}

function interpolateProperty(rows, tone, key, fallback = NaN) {
  const finiteRows = rows.filter((row) => Number.isFinite(row[key]));
  if (!finiteRows.length) return fallback;
  if (tone <= finiteRows[0].tone) return finiteRows[0][key];
  for (let i = 1; i < finiteRows.length; i += 1) {
    const prev = finiteRows[i - 1];
    const next = finiteRows[i];
    if (tone <= next.tone) {
      const ratio = (tone - prev.tone) / (next.tone - prev.tone || 1);
      return prev[key] + (next[key] - prev[key]) * ratio;
    }
  }
  return finiteRows.at(-1)[key];
}

function hasUsableMetric(row) {
  return Number.isFinite(row.measuredTvi) || Number.isFinite(row.measuredTone) || Number.isFinite(row.density) || Number.isFinite(row.colorimetricTone);
}

function sortMeasurement(a, b) {
  return a.channel.localeCompare(b.channel) || a.tone - b.tone;
}

function normalizeLineEndings(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripTrailingCsv(value) {
  return String(value).replace(/(?:\s*,\s*)+$/g, "").trim();
}

function stripOuterQuotes(value) {
  const text = String(value).trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/""/g, '"').trim();
  }
  return text;
}

function unquoteValue(value) {
  return stripOuterQuotes(String(value ?? "").trim());
}

function trimTrailingEmpty(values) {
  const out = [...values];
  while (out.length && out.at(-1) === "") out.pop();
  return out;
}

function approxZero(value) {
  return !Number.isFinite(value) || Math.abs(value) < 0.0001;
}

function emptyImport(sourceFormat, warnings = []) {
  return {
    sourceFormat,
    metadata: {},
    fields: [],
    rawRows: [],
    measurements: [],
    warnings,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function format(value) {
  return Number(value).toFixed(2);
}
