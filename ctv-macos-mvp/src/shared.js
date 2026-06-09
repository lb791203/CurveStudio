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

export function rawCmyk(row) {
  if (!row) return null;
  const c = number(row.cmyk_c ?? row.c);
  const m = number(row.cmyk_m ?? row.m);
  const y = number(row.cmyk_y ?? row.y);
  const k = number(row.cmyk_k ?? row.k);
  if ([c, m, y, k].some((value) => !Number.isFinite(value))) return null;
  return { c, m, y, k };
}

export function isLikelyG7GrayCandidate(row) {
  const cmyk = rawCmyk(row);
  if (!cmyk) return false;
  const { c, m, y, k } = cmyk;
  if (k > 0.01 || c <= 0 || m <= 0 || y <= 0) return false;
  const myClose = Math.abs(m - y) <= 2.5;
  const cInRange = c >= m - 3 && c <= m + 10 && c >= y - 3 && c <= y + 10;
  return myClose && cInRange;
}

export function metadataLooksReference(metadata = {}) {
  if (!metadata) return false;
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

