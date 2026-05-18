export function formatManualActionZh(adjustment, formatNumber = defaultPercent) {
  if (Math.abs(adjustment) < 0.005) return "保持";
  return adjustment < 0 ? `减少 ${formatNumber(Math.abs(adjustment))}%` : `增加 ${formatNumber(adjustment)}%`;
}

function defaultPercent(value) {
  return Number(value).toFixed(2);
}
