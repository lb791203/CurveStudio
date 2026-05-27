import { toExportRows } from "./curve-engine.js";

export function buildCurveAcceptance(rows, safetyIssues = []) {
  const exportRows = toExportRows(rows);
  const numericRows = exportRows.map((row) => {
    const adjustment = Number(row.ripAdjustment);
    return {
      ...row,
      adjustment,
      action: adjustment < -0.01 ? "减少" : adjustment > 0.01 ? "增加" : "不变",
      level: adjustment < -0.01 ? "reduce" : adjustment > 0.01 ? "increase" : "neutral",
    };
  });
  const reductions = numericRows.filter((row) => row.adjustment < -0.01);
  const increases = numericRows.filter((row) => row.adjustment > 0.01);
  const interpolated = numericRows.filter((row) => row.pointSource === "interpolated");
  const maxReduce = reductions.length ? Math.min(...reductions.map((row) => row.adjustment)) : 0;
  const maxIncrease = increases.length ? Math.max(...increases.map((row) => row.adjustment)) : 0;
  const channels = [...new Set(numericRows.map((row) => row.channel))];
  const warningCount = safetyIssues.filter((item) => item.level === "warning").length;
  const dangerCount = safetyIssues.filter((item) => item.level === "danger" || item.level === "fail").length;
  const qualityStatus = dangerCount ? "Blocked" : warningCount ? "Warning" : "Ready";

  return {
    rows: numericRows,
    channels,
    reductions: reductions.length,
    increases: increases.length,
    unchanged: numericRows.length - reductions.length - increases.length,
    interpolated: interpolated.length,
    measured: numericRows.length - interpolated.length,
    maxReduce,
    maxIncrease,
    qualityStatus,
    warningCount,
    dangerCount,
    status: numericRows.length
      ? dangerCount ? "Blocked" : increases.length || warningCount ? "Warning" : "Ready"
      : "Empty",
    message: numericRows.length
      ? dangerCount
        ? "曲线存在严重质量问题，不建议直接导出为正式生产曲线。"
        : warningCount
          ? "曲线存在质量警告，建议复核警告点后再导出。"
          : increases.length
        ? "存在需要增加的点，请确认是否为低于目标或过度补偿后的结果。"
        : "当前曲线以减少网点为主，适合生成 RIP 手动录入参考。"
      : "尚未生成曲线。",
  };
}
