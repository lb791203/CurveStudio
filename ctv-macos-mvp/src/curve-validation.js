// Final gate before a curve goes to a RIP. It runs after every correction step
// (smoothing, stacking on the previous curve, manual lock points), because a manual
// lock point can still create a reversal or move an end point.

// Checked on the values as they are written to the file (2 decimals, see toExportRows),
// so what passes here is exactly what the RIP receives.
const EXPORT_DECIMALS = 2;

function serialized(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(EXPORT_DECIMALS)) : NaN;
}

export function validateExportCurve(rows = []) {
  const problems = [];
  const byChannel = new Map();
  for (const row of rows) {
    if (!row?.channel) continue;
    if (!byChannel.has(row.channel)) byChannel.set(row.channel, []);
    byChannel.get(row.channel).push(row);
  }
  if (!byChannel.size) problems.push({ channel: "", type: "empty", message: "没有可导出的曲线" });

  for (const [channel, channelRows] of byChannel) {
    const points = channelRows
      .map((row) => ({ input: serialized(row.tone), output: serialized(row.outputTone) }))
      .sort((a, b) => a.input - b.input);
    if (points.some((point) => !Number.isFinite(point.input) || !Number.isFinite(point.output))) {
      problems.push({ channel, type: "not_finite", message: `${channel} 通道有缺值或无效数值` });
      continue;
    }
    for (const point of points) {
      if (point.input < 0 || point.input > 100) {
        problems.push({ channel, type: "input_range", input: point.input, message: `${channel} 输入 ${fmt(point.input)}% 超出 0–100` });
      }
      if (point.output < 0 || point.output > 100) {
        problems.push({ channel, type: "range", input: point.input, message: `${channel} ${fmt(point.input)}% → ${fmt(point.output)}% 超出 0–100` });
      }
    }
    for (let i = 1; i < points.length; i += 1) {
      if (points[i].input === points[i - 1].input) {
        problems.push({ channel, type: "duplicate", input: points[i].input, message: `${channel} 输入 ${fmt(points[i].input)}% 重复` });
      }
    }
    const start = points.find((point) => point.input === 0);
    const end = points.find((point) => point.input === 100);
    if (!start || start.output !== 0) {
      problems.push({ channel, type: "endpoint", input: 0, message: `${channel} 0% 必须输出 0%${start ? `（现在 ${fmt(start.output)}%）` : "（缺少 0% 点）"}` });
    }
    if (!end || end.output !== 100) {
      problems.push({ channel, type: "endpoint", input: 100, message: `${channel} 100% 必须输出 100%${end ? `（现在 ${fmt(end.output)}%）` : "（缺少 100% 点）"}` });
    }
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      if (current.output < previous.output) {
        problems.push({
          channel,
          type: "reversal",
          input: current.input,
          message: `${channel} 倒阶：${fmt(previous.input)}% → ${fmt(previous.output)}%，${fmt(current.input)}% → ${fmt(current.output)}%`,
        });
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

export function exportBlockedMessage(validation, translate = (key, fallback) => fallback) {
  const lines = validation.problems.slice(0, 8).map((item) => `• ${item.message}`);
  if (validation.problems.length > 8) lines.push(`… +${validation.problems.length - 8}`);
  return `${translate("export_blocked_title", "曲线不合格，已阻止导出到 RIP：")}\n${lines.join("\n")}\n${translate("export_blocked_hint", "请解锁或修改人工锁点后再导出。")}`;
}

function fmt(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}
