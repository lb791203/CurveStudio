import { toExportRows } from "./curve-engine.js";

export function withExportHeader(body, context) {
  const quality = context.curveQuality || summarizeCurveSafety(context.curveSafety || []);
  return [
    `# standard=${context.standard.name}`,
    `# customer=${context.job.customer}`,
    `# press=${context.job.press}`,
    `# paper=${context.job.paper}`,
    `# device=${context.job.device}`,
    `# algorithm=${context.algorithm}`,
    `# calculation_formula=${context.calculationFormula}`,
    `# delta_formula=${context.deltaFormula}`,
    `# target=${context.targetName}`,
    `# lab_reference=${context.iccStandardPair?.labReference?.label || context.labReferenceSource || ""}`,
    `# tone_target=${context.iccStandardPair?.toneTarget?.standardName || context.standard.name} / ${context.targetName}`,
    `# icc_generation_gate=${context.iccGenerationGate?.status || ""}`,
    `# compensation_ratio=${context.compensationRatio}`,
    `# curve_quality_status=${quality.status}`,
    `# curve_quality_warnings=${quality.warnings}`,
    `# curve_quality_dangers=${quality.dangers}`,
    `# curve_quality_message=${quality.message}`,
    `# measurement_condition=${context.measurementCondition}`,
    `# suggested_archive_path=${context.suggestedArchivePath}`,
    `# generated_at=${new Date().toISOString()}`,
    body,
  ].join("\n");
}

export function toSimpleRipCsv(rows, context) {
  const qualityRows = qualityByRow(context.curveSafety || []);
  const header = ["channel", "input", "output", "quality", "comment"];
  const body = toExportRows(rows).map((row) => {
    const quality = qualityRows.get(exportRowKey(row)) || { status: "Ready", comment: "curve_ok" };
    return [
    row.channel,
    row.inputTone,
    row.outputTone,
    quality.status,
    `metric=${row.metric}; method=${row.measurementMethod}; source=${row.pointSource}; quality=${qualityComment(quality)}`,
    ];
  });
  return withExportHeader([header, ...body].map((row) => row.join(",")).join("\n"), context);
}

export function toPrinergyCsv(rows, context) {
  const qualityRows = qualityByRow(context.curveSafety || []);
  const header = ["Separation", "Input", "Output", "CurveName", "Comment"];
  const body = toExportRows(rows).map((row) => {
    const quality = qualityRows.get(exportRowKey(row)) || { status: "Ready", comment: "curve_ok" };
    return [
    row.channel,
    row.inputTone,
    row.outputTone,
    `${context.job.press || "Press"}_${context.standard.id || "Standard"}`,
    `${row.manualActionZh}; ${row.metric}; ${row.measurementMethod}; ${row.pointSource}; ${quality.status}; ${qualityComment(quality)}`,
    ];
  });
  return withExportHeader([header, ...body].map((row) => row.join(",")).join("\n"), context);
}

export function toG7VerificationCsv(context) {
  const g7 = context.g7 || {};
  const sections = [
    csvSection("G7_SUMMARY", [
      ["metric", "value"],
      ["status", g7.status || ""],
      ["conclusion_title", g7.conclusion?.title || ""],
      ["conclusion_summary", g7.conclusion?.summary || ""],
      ["k_only_count", g7.kOnlyCount],
      ["lab_comparable_patches", g7.labPatchCount],
      ["gray_patches", g7.grayPatchCount],
      ["p2p_patches", g7.p2pPatchCount],
      ["avg_delta_e", g7.avgDeltaE],
      ["max_delta_e", g7.maxDeltaE],
      ["npdc_avg_w_delta_l", g7.weightedAverage],
      ["npdc_max_w_delta_l", g7.maxNpdcDelta],
      ["gray_avg_w_delta_ch", g7.avgGrayCh],
      ["gray_max_w_delta_ch", g7.maxGrayCh],
      ["lab_weighted_delta_e", g7.weightedDeltaE],
      ["legacy_avg_gray_chroma", g7.legacyAvgGrayCh],
      ["legacy_max_gray_chroma", g7.legacyMaxGrayCh],
      ["avg_npdc_delta_tone", g7.avgNpdcDelta],
      ["max_npdc_delta_tone", g7.legacyMaxNpdcDeltaTone],
      ["missing", (g7.missing || []).join(" / ")],
    ]),
    csvSection("G7_CONCLUSION", [
      ["type", "message"],
      ["title", g7.conclusion?.title || ""],
      ["summary", g7.conclusion?.summary || ""],
      ...((g7.conclusion?.priorityItems || []).map((item) => ["priority", item])),
      ...((g7.conclusion?.recommendations || []).map((item) => ["recommendation", item])),
    ]),
    csvSection("G7_VERIFICATION", [
      ["item", "value", "tolerance", "status", "message"],
      ...(g7.verificationRows || []).map((row) => [row.item, row.value, row.tolerance, row.status, row.message]),
    ]),
    csvSection("G7_DATA_COMPLETENESS", [
      ["item", "count", "required", "status"],
      ...(g7.completenessRows || []).map((row) => [row.item, row.count, row.required, row.status]),
    ]),
    csvSection("G7_NPDC", [
      ["tone", "measured", "target", "delta_tone", "delta_l"],
      ...(g7.npdcRows || []).map((row) => [row.tone, row.measured, row.target, row.deltaTone, row.deltaL]),
    ]),
    csvSection("G7_GRAY_BALANCE", [
      ["label", "a", "b", "chroma", "delta_e"],
      ...(g7.grayBalanceRows || []).map((row) => [row.label, row.a, row.b, row.chroma, row.deltaE]),
    ]),
    csvSection("LAB_DELTA_E", [
      ["label", "source", "cmyk", "measured_lab", "reference_lab", "delta_l", "delta_a", "delta_b", "delta_e76", "delta_e94", "delta_e2000", "delta_e_cmc", "selected_delta_e", "status"],
      ...(context.labRows || []).map((row) => [
        row.label,
        row.source,
        cmykText(row.cmyk),
        labText(row.lab),
        labText(row.referenceLab),
        row.deltaL,
        row.deltaA,
        row.deltaB,
        row.deltaE76,
        row.deltaE94,
        row.deltaE00,
        row.deltaECMC,
        row.deltaE,
        row.status,
      ]),
    ]),
  ];
  return withExportHeader(sections.join("\n\n"), context);
}

export function g7ReportArchive(context) {
  return {
    schemaVersion: 1,
    type: "g7-verification-report",
    generatedAt: context.generatedAt,
    job: context.job,
    standard: context.standard,
    settings: context.settings,
    deltaFormula: context.deltaFormula,
    measurementCondition: context.measurementCondition,
    importInfo: {
      sourceFormat: context.importInfo?.sourceFormat || "",
      metadata: context.importInfo?.metadata || {},
      warnings: context.importInfo?.warnings || [],
      rawRowCount: context.importInfo?.rawRows?.length || 0,
    },
    g7: context.g7 || {},
    labVerification: context.labRows || [],
    curveQuality: context.curveQuality || summarizeCurveSafety(context.curveSafety || []),
  };
}

export function projectArchive(context) {
  const curveQuality = context.curveQuality || summarizeCurveSafety(context.curveSafety || []);
  return {
    schemaVersion: 2,
    storagePlan: {
      root: "jobs",
      jobId: context.jobId,
      runId: context.runId,
      suggestedPath: context.suggestedArchivePath,
      desktopReady: true,
    },
    job: context.job,
    standard: context.standard,
    iccProfile: context.iccProfile || null,
    labReferenceSource: context.labReferenceSource || "",
    iccStandardPair: context.iccStandardPair || null,
    iccGenerationGate: context.iccGenerationGate || null,
    targetSnapshot: context.targetSnapshot,
    settings: context.settings,
    diagnosis: context.diagnosis,
    importInfo: {
      sourceFormat: context.importInfo?.sourceFormat || "",
      metadata: context.importInfo?.metadata || {},
      fields: context.importInfo?.fields || [],
      rawRows: context.importInfo?.rawRows || [],
      warnings: context.importInfo?.warnings || [],
    },
    rawInput: context.rawInput,
    manualRows: context.manualRows,
    measurements: context.measurements,
    results: toExportRows(context.results),
    curveQuality,
    curveSafety: context.curveSafety || [],
    curveOverrides: context.curveOverrides || {},
    labVerification: context.labRows,
    g7: context.g7,
    generatedAt: context.generatedAt,
  };
}

export function summarizeCurveSafety(issues = []) {
  const warnings = issues.filter((item) => item.level === "warning").length;
  const dangers = issues.filter((item) => item.level === "danger" || item.level === "fail").length;
  const status = dangers ? "Blocked" : warnings ? "Warning" : "Ready";
  return {
    status,
    warnings,
    dangers,
    total: issues.length,
    message: status === "Blocked"
      ? "存在严重曲线问题，不建议直接导出为正式生产曲线。"
      : status === "Warning"
        ? "存在曲线质量警告，建议复核后再用于生产。"
        : "曲线质量检查通过。",
  };
}

function qualityByRow(issues = []) {
  return issues.reduce((acc, issue) => {
    const tones = issue.relatedTones?.length ? issue.relatedTones : [issue.tone];
    for (const tone of tones) {
      const key = `${issue.channel}:${Number(tone).toFixed(2)}`;
      const existing = acc.get(key) || { status: "Ready", comments: [] };
      const status = issue.level === "danger" || issue.level === "fail"
        ? "Blocked"
        : existing.status === "Blocked" ? "Blocked" : "Warning";
      acc.set(key, {
        status,
        comments: [...existing.comments, `${issue.type}:${issue.message}`],
      });
    }
    return acc;
  }, new Map());
}

function exportRowKey(row) {
  return `${row.channel}:${Number(row.inputTone).toFixed(2)}`;
}

function qualityComment(quality) {
  return quality.comment || quality.comments?.join(" / ") || "curve_ok";
}

function csvSection(title, rows) {
  return [`# ${title}`, ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

function csvCell(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(4)) : "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function cmykText(cmyk) {
  if (!cmyk) return "";
  return `C${formatMetric(cmyk.c)} M${formatMetric(cmyk.m)} Y${formatMetric(cmyk.y)} K${formatMetric(cmyk.k)}`;
}

function labText(lab) {
  if (!lab) return "";
  return `L${formatMetric(lab.l)} a${formatMetric(lab.a)} b${formatMetric(lab.b)}`;
}

function formatMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : "";
}

export function buildSuggestedArchivePath({ customer, press, generatedAt }) {
  const date = generatedAt.slice(0, 10);
  const time = generatedAt.slice(11, 19).replaceAll(":", "");
  const job = slug([customer || "customer", press || "press", date].join("-"));
  return `jobs/${job}/runs/${date}-${time}.json`;
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "job";
}
