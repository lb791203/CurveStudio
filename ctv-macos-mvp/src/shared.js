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

// G7 CMY-only gray scale: M = Y = f(C) (Idealliance G7 P2P / ADS Appendix A).
const G7_GRAY_MY_FOR_C = [
  [0, 0], [2, 1.49], [4, 2.98], [6, 4.47], [8, 5.97], [10, 7.46], [15, 11.21],
  [20, 15.01], [25, 18.88], [30, 22.84], [35, 26.9], [40, 31.11], [45, 35.46],
  [50, 40], [55, 44.74], [60, 49.69], [65, 54.9], [70, 60.37], [75, 66.12],
  [80, 72.19], [85, 78.59], [90, 85.34], [95, 92.47], [98, 96.94], [100, 100],
];

export function g7GrayMagentaYellowFor(c) {
  const tone = Number(c);
  if (!Number.isFinite(tone)) return NaN;
  for (let i = 1; i < G7_GRAY_MY_FOR_C.length; i += 1) {
    const [c1, my1] = G7_GRAY_MY_FOR_C[i - 1];
    const [c2, my2] = G7_GRAY_MY_FOR_C[i];
    if (tone <= c2) return my1 + (my2 - my1) * (tone - c1) / (c2 - c1);
  }
  return 100;
}

// True only for patches on the G7 gray ratio (tolerance 1% covers the rounded values
// such as 25/19/19 or 75/66/66 used on some P2P versions). Equal-CMY ramps and the
// P2P "offset" grays (e.g. 30/30/30, 20/12/12) are not G7 gray-balance patches.
export function isG7GrayCmyk(cmyk) {
  if (!cmyk) return false;
  const { c, m, y, k } = cmyk;
  if (!(Math.abs(k) < 0.01) || !(c > 0.01) || !(c < 99.99)) return false;
  const aim = g7GrayMagentaYellowFor(c);
  return Math.abs(m - aim) <= 1 && Math.abs(y - aim) <= 1;
}

export function isLikelyG7GrayCandidate(row) {
  return isG7GrayCmyk(rawCmyk(row));
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

