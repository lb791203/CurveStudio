export function groupByChannel(rows) {
  return rows.reduce((acc, row) => {
    acc[row.channel] ||= [];
    acc[row.channel].push(row);
    return acc;
  }, {});
}

export function labDistance(a, b) {
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

export function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
}

export function number(value) {
  if (value === undefined || value === null || value === "") return NaN;
  return Number(String(value).replace(/[%"]/g, "").trim());
}

export function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function escapeHtml(value) {
  return escapeAttr(value).replaceAll(">", "&gt;");
}
