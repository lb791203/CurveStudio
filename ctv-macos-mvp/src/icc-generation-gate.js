import { compareRuns } from "./run-compare.js";
import { classifyP2PPatch } from "./g7-targets.js";
import { cmykFromRow, labFromRow, cmykFromManualRow } from "./standards.js";
import { average, number } from "./shared.js";
import { t } from "./translations.js?v=20260525-statusbar-pass-1";

const MIN_CHARACTERIZATION_PATCHES = 300;
const MIN_LAB_PATCHES = 45;
const DEFAULT_TVI_AVG_LIMIT = 3;
const DEFAULT_TVI_MAX_LIMIT = 6;

export function buildIccGenerationGate({ runs = [], standard = {}, requireG7 = standard?.g7?.enabled !== false } = {}) {
  const savedRuns = (runs || []).filter(hasRunPayload);
  const latest = savedRuns[0] || null;
  const previous = savedRuns[1] || null;
  const latestArchive = runArchive(latest);
  const previousArchive = runArchive(previous);
  const latestMetrics = runMetrics(latest);
  const coverage = buildCharacterizationCoverage(latestArchive);
  const checks = [];

  checks.push(check(
    "run_sequence",
    t("gate_run_sequence", "复测 Run"),
    savedRuns.length >= 2,
    `${savedRuns.length}${t("saved_runs_suffix", " 次已保存 Run")}`,
    t("gate_run_sequence_msg", "需要至少保存第一次测量 Run 和补偿后复测 Run。")
  ));
  checks.push(check(
    "previous_measurement",
    t("gate_previous_measurement", "第一次测量"),
    Boolean(previousArchive?.measurements?.length || previousArchive?.results?.length),
    previous ? `${previousArchive.measurements?.length || 0} ${t("pts_measured", "测点")} / ${previousArchive.results?.length || 0} ${t("pts_curve", "曲线点")}` : t("missing", "缺少"),
    t("gate_previous_measurement_msg", "第一次测量用于和复测结果比较，不能只保存曲线或空 Run。")
  ));
  checks.push(check(
    "latest_measurement",
    t("gate_latest_measurement", "补偿后复测"),
    Boolean(latestArchive?.measurements?.length && latestArchive?.results?.length),
    latest ? `${latestArchive.measurements?.length || 0} ${t("pts_measured", "测点")} / ${latestArchive.results?.length || 0} ${t("pts_curve", "曲线点")}` : t("missing", "缺少"),
    t("gate_latest_measurement_msg", "需要导入或测量补偿后的复测数据，并重新计算曲线。")
  ));
  checks.push(check(
    "patch_count",
    t("gate_patch_count", "特性化色块数量"),
    coverage.patchCount >= MIN_CHARACTERIZATION_PATCHES,
    `${coverage.patchCount} / ${MIN_CHARACTERIZATION_PATCHES}`,
    t("gate_patch_count_msg", "ICC 生成需要足够的 CMYK 特性化色块；只靠 25/50/75 或 60 个阶调点不够。")
  ));
  checks.push(check(
    "lab_count",
    t("gate_lab_count", "Lab 数据"),
    coverage.labPatchCount >= MIN_LAB_PATCHES,
    `${coverage.labPatchCount} / ${MIN_LAB_PATCHES}`,
    t("gate_lab_count_msg", "复测文件必须包含可用于建 profile 的 Lab 或光谱换算 Lab。")
  ));
  checks.push(check(
    "paper_solid",
    t("gate_paper_solid", "纸白与 CMYK 实地"),
    coverage.paper >= 1 && coverage.solidChannels.size >= 4,
    `${t("paper_prefix", "纸白")} ${coverage.paper} / ${t("level_solid_suffix", "实地")} ${coverage.solidChannels.size}/4`,
    t("gate_paper_solid_msg", "缺少纸白或 CMYK 实地时，无法可靠建立 ICC 白点与实地边界。")
  ));
  checks.push(check(
    "overprint",
    t("gate_overprint", "叠印色"),
    coverage.overprintTypes.size >= 3,
    `${t("overprint_prefix", "叠印")} ${coverage.overprintTypes.size}/3`,
    t("gate_overprint_msg", "至少需要 CM/CY/MY 或同等级叠印色块来约束混色行为。")
  ));
  checks.push(metricCheck(
    "tvi_residual",
    t("gate_tvi_residual", "TVI/CTV 残余"),
    latestMetrics.avgTviDelta,
    latestMetrics.maxTviDelta,
    DEFAULT_TVI_AVG_LIMIT,
    DEFAULT_TVI_MAX_LIMIT,
    t("gate_tvi_residual_msg", "补偿后复测的 TVI/CTV 残余仍偏大，建议先修曲线或复测。")
  ));
  checks.push(deltaECheck(latestMetrics.maxDeltaE, standard?.deltaE?.fail));
  checks.push(curveQualityCheck(latestMetrics));
  checks.push(g7Check(latestMetrics, requireG7));

  const compare = latest && previous ? compareRuns(latest, previous) : null;
  if (compare) {
    checks.push({
      id: "run_compare",
      label: t("gate_run_compare", "复测改善"),
      status: compare.avgTviDelta.direction === "improved" || compare.avgTviDelta.direction === "same" ? "pass" : "warning",
      value: runCompareValue(compare),
      message: compare.avgTviDelta.direction === "worse"
        ? t("gate_run_compare_worse", "复测平均 TVI/CTV 偏差比第一次更大，生成 ICC 前建议确认补偿曲线或测量流程。")
        : t("gate_run_compare_improved", "复测结果没有比第一次更差。"),
      required: false,
    });
  }

  const requiredFailures = checks.filter((item) => item.required !== false && item.status === "fail");
  const warnings = checks.filter((item) => item.status === "warning");
  const status = requiredFailures.length ? "Blocked" : warnings.length ? "Review" : "Ready";
  return {
    status,
    level: status === "Ready" ? "pass" : status === "Review" ? "warning" : "fail",
    title: status === "Ready" ? t("gate_status_ready", "准备就绪 (Ready for ICC)") : status === "Review" ? t("gate_status_review", "需要复核后再生成 ICC") : t("gate_status_blocked", "暂不能生成 ICC"),
    summary: status === "Ready"
      ? t("gate_summary_ready", "复测 Run、特性化色块、Lab、TVI/CTV、G7 和曲线质量满足当前 MVP 闸门。")
      : requiredFailures.length
        ? t("gate_summary_blocked", "有 {num} 个必要条件未满足。").replace("{num}", requiredFailures.length)
        : t("gate_summary_review", "有 {num} 个复核项需要确认。").replace("{num}", warnings.length),
    checks,
    coverage,
    latestRun: latest ? runLabel(latest) : "",
    previousRun: previous ? runLabel(previous) : "",
    compare,
  };
}

export function buildCharacterizationCoverage(archive = {}) {
  const rows = [
    ...(archive?.importInfo?.rawRows || []),
    ...(archive?.labVerification || []),
    ...(archive?.measurements || []),
    ...(archive?.labRows || []),
    ...(archive?.manualRows || []),
  ];
  const seen = new Set();
  const coverage = {
    patchCount: archive?.importInfo?.rawRows?.length || archive?.manualRows?.length || archive?.labRows?.length || archive?.measurements?.length || rows.length,
    labPatchCount: 0,
    paper: 0,
    solidChannels: new Set(),
    overprintTypes: new Set(),
    kOnly: 0,
    grayBalance: 0,
  };
  for (const row of rows) {
    const cmyk = cmykOf(row);
    if (!cmyk) continue;
    const lab = labOf(row);
    if (lab) coverage.labPatchCount += 1;
    const key = `${formatTone(cmyk.c)}/${formatTone(cmyk.m)}/${formatTone(cmyk.y)}/${formatTone(cmyk.k)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const categories = classifyP2PPatch(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
    if (categories.includes("paper")) coverage.paper += 1;
    if (categories.includes("c_solid")) coverage.solidChannels.add("C");
    if (categories.includes("m_solid")) coverage.solidChannels.add("M");
    if (categories.includes("y_solid")) coverage.solidChannels.add("Y");
    if (categories.includes("k_solid")) coverage.solidChannels.add("K");
    for (const type of ["red", "green", "blue", "cmy"]) {
      if (categories.includes(type)) coverage.overprintTypes.add(type);
    }
    if (categories.includes("npdc")) coverage.kOnly += 1;
    if (categories.includes("gray_balance")) coverage.grayBalance += 1;
  }
  return coverage;
}

function hasRunPayload(run) {
  const archive = runArchive(run);
  return Boolean(run && (archive.measurements?.length || archive.results?.length || archive.importInfo?.rawRows?.length));
}

function runArchive(run) {
  return run?.archive || run || {};
}

function runMetrics(run) {
  const metrics = run?.metrics || {};
  const archive = runArchive(run);
  const tviValues = (archive.results || []).map((row) => Math.abs(number(row.tviDelta))).filter(Number.isFinite);
  const labValues = (archive.labVerification || []).map((row) => number(row.deltaE)).filter(Number.isFinite);
  return {
    avgTviDelta: finite(metrics.avgTviDelta, run?.avgTviDelta, average(tviValues)),
    maxTviDelta: finite(metrics.maxTviDelta, run?.maxTviDelta, tviValues.length ? Math.max(...tviValues) : NaN),
    maxDeltaE: finite(metrics.maxDeltaE, run?.maxDeltaE, labValues.length ? Math.max(...labValues) : NaN),
    g7Status: run?.g7Status || metrics.g7Status || archive.g7?.status || "",
    curveDangers: Number(run?.curveDangers ?? metrics.curveDangers ?? archive.curveQuality?.dangers ?? 0) || 0,
    curveWarnings: Number(run?.curveWarnings ?? metrics.curveWarnings ?? archive.curveQuality?.warnings ?? 0) || 0,
    curveQualityStatus: run?.curveQualityStatus || metrics.curveQualityStatus || archive.curveQuality?.status || "",
  };
}

function check(id, label, pass, value, message, required = true) {
  return { id, label, status: pass ? "pass" : "fail", value, message: pass ? t("pass_msg", "满足。") : message, required };
}

function metricCheck(id, label, avg, max, avgLimit, maxLimit, failMessage) {
  if (!Number.isFinite(avg) && !Number.isFinite(max)) {
    return { id, label, status: "fail", value: "N/A", message: t("gate_tvi_residual_missing", "缺少补偿后 TVI/CTV 残余指标。"), required: true };
  }
  const pass = (!Number.isFinite(avg) || avg <= avgLimit) && (!Number.isFinite(max) || max <= maxLimit);
  return {
    id,
    label,
    status: pass ? "pass" : "fail",
    value: `Avg ${formatNumber(avg)} / Max ${formatNumber(max)}`,
    message: pass ? `Avg <= ${avgLimit}, Max <= ${maxLimit}` : failMessage,
    required: true,
  };
}

function deltaECheck(maxDeltaE, failLimit = 4.2) {
  const limit = Number.isFinite(number(failLimit)) ? number(failLimit) : 4.2;
  if (!Number.isFinite(maxDeltaE)) {
    return { id: "lab_delta_e", label: t("gate_lab_delta_e", "Lab / ΔE"), status: "fail", value: "N/A", message: t("gate_lab_delta_e_missing", "缺少复测 Lab/ΔE 校验结果。"), required: true };
  }
  return {
    id: "lab_delta_e",
    label: t("gate_lab_delta_e", "Lab / ΔE"),
    status: maxDeltaE <= limit ? "pass" : "fail",
    value: `Max ${formatNumber(maxDeltaE)} / Fail ${formatNumber(limit)}`,
    message: maxDeltaE <= limit ? t("gate_lab_delta_e_pass", "满足当前标准 ΔE 失败阈值。") : t("gate_lab_delta_e_fail", "复测最大 ΔE 超过当前标准失败阈值。"),
    required: true,
  };
}

function curveQualityCheck(metrics) {
  if (metrics.curveDangers > 0) {
    return { id: "curve_quality", label: t("gate_curve_quality", "曲线质量"), status: "fail", value: `${metrics.curveDangers} ${t("curve_quality_dangers", "严重")}`, message: t("gate_curve_quality_danger", "曲线仍有严重风险，不能作为 ICC 生成前的稳定状态。"), required: true };
  }
  if (metrics.curveWarnings > 0) {
    return { id: "curve_quality", label: t("gate_curve_quality", "曲线质量"), status: "warning", value: `${metrics.curveWarnings} ${t("curve_quality_warnings", "警告")}`, message: t("gate_curve_quality_warning", "曲线有警告项，生成 ICC 前建议复核。"), required: false };
  }
  return { id: "curve_quality", label: t("gate_curve_quality", "曲线质量"), status: "pass", value: metrics.curveQualityStatus || "Ready", message: t("pass_msg", "满足。"), required: true };
}

function g7Check(metrics, requireG7) {
  if (!requireG7) return { id: "g7", label: t("gate_g7", "G7"), status: "pass", value: "Disabled", message: t("gate_g7_disabled", "当前标准关闭 G7 闸门。"), required: false };
  return {
    id: "g7",
    label: t("gate_g7", "G7"),
    status: metrics.g7Status === "Pass" ? "pass" : "fail",
    value: metrics.g7Status ? t(metrics.g7Status.toLowerCase() === "pass" ? "status_pass" : metrics.g7Status.toLowerCase() === "fail" ? "status_fail" : metrics.g7Status) : t("g7_not_run_label", "未运行"),
    message: metrics.g7Status === "Pass" ? t("gate_g7_pass", "G7 验证通过。") : t("gate_g7_fail", "当前标准启用 G7，必须先通过 G7 验证。"),
    required: true,
  };
}

function runCompareValue(compare) {
  const change = compare.avgTviDelta;
  if (!Number.isFinite(change?.delta)) return "N/A";
  return `${formatNumber(change.previous)} -> ${formatNumber(change.latest)}`;
}

function cmykOf(row) {
  if (row?.cmyk && ["c", "m", "y", "k"].every((key) => Number.isFinite(number(row.cmyk[key])))) {
    return { c: number(row.cmyk.c), m: number(row.cmyk.m), y: number(row.cmyk.y), k: number(row.cmyk.k) };
  }
  return cmykFromRow(row) || cmykFromManualRow(row);
}

function labOf(row) {
  if (row?.lab && ["l", "a", "b"].every((key) => Number.isFinite(number(row.lab[key])))) {
    return { l: number(row.lab.l), a: number(row.lab.a), b: number(row.lab.b) };
  }
  const l = Number(row?.labL ?? row?.lab_l ?? row?.l);
  const a = Number(row?.labA ?? row?.lab_a ?? row?.a);
  const b = Number(row?.labB ?? row?.lab_b ?? row?.b);
  if (Number.isFinite(l) && Number.isFinite(a) && Number.isFinite(b)) {
    return { l, a, b };
  }
  return labFromRow(row);
}

function finite(...values) {
  for (const value of values) {
    const numeric = number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return NaN;
}

function runLabel(run) {
  return run?.name || run?.createdAt || run?.runId || run?.storagePath || "";
}

function formatTone(value) {
  return formatNumber(number(value));
}

function formatNumber(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "N/A";
}
