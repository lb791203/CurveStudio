import { TARGETS } from "./curve-engine.js";
import { number } from "./shared.js";
import { labFromSpectralRow } from "./spectral-color.js";

const COMMON_TOLERANCE = {
  deltaE: { warning: 3.5, fail: 4.2 },
  g7: {
    enabled: true,
    npdcAverage: 1.5,
    npdcMax: 3,
    grayAverage: 1.5,
    grayMax: 3,
    grayInflection: "",
  },
};

const COATED_SOLID_DENSITY_RANGES = {
  C: [1.25, 1.65],
  M: [1.25, 1.65],
  Y: [0.85, 1.15],
  K: [1.45, 1.9],
};

const BROAD_SOLID_DENSITY_RANGES = {
  C: [0.9, 1.75],
  M: [0.9, 1.75],
  Y: [0.75, 1.25],
  K: [0.95, 1.95],
};

const CRPC_STANDARDS = Array.from({ length: 7 }, (_, index) => {
  const crpc = index + 1;
  return {
    id: `gracol2013_crpc${crpc}`,
    name: `GRACoL2013 CRPC${crpc}`,
    printCondition: `CGATS21-2 CRPC${crpc}`,
    target: "isoA",
    referencePath: `./reference-data/standards/cgats21-iso15339/CGATS21-2-CRPC${crpc}.txt`,
    solidDensityRanges: COATED_SOLID_DENSITY_RANGES,
    ...COMMON_TOLERANCE,
  };
});

const BUILT_IN_STANDARD_LIBRARY = [
  ...CRPC_STANDARDS,
  {
    id: "fogra39",
    name: "FOGRA39",
    printCondition: "ISO coated reference",
    target: "isoA",
    referencePath: "./reference-data/standards/patchtool/FOGRA39.txt",
    solidDensityRanges: COATED_SOLID_DENSITY_RANGES,
    ...COMMON_TOLERANCE,
  },
  {
    id: "iso_tvi_a",
    name: "ISO TVI Curve A",
    printCondition: "TVI target only",
    target: "isoA",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...COMMON_TOLERANCE,
  },
  {
    id: "iso_tvi_b",
    name: "ISO TVI Curve B",
    printCondition: "TVI target only",
    target: "isoB",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...COMMON_TOLERANCE,
  },
  {
    id: "iso_tvi_c",
    name: "ISO TVI Curve C",
    printCondition: "TVI target only",
    target: "isoC",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...COMMON_TOLERANCE,
  },
  {
    id: "iso_tvi_d",
    name: "ISO TVI Curve D",
    printCondition: "TVI target only",
    target: "isoD",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...COMMON_TOLERANCE,
  },
  {
    id: "iso_tvi_e",
    name: "ISO TVI Curve E",
    printCondition: "TVI target only",
    target: "isoE",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...COMMON_TOLERANCE,
  },
  {
    id: "iso_tvi_f",
    name: "ISO TVI Curve F",
    printCondition: "TVI target only",
    target: "isoF",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...COMMON_TOLERANCE,
  },
];

let customStandards = [];

export let STANDARD_LIBRARY = [...BUILT_IN_STANDARD_LIBRARY];

export function builtInStandards() {
  return BUILT_IN_STANDARD_LIBRARY.map((item) => cloneStandard(item));
}

export function setCustomStandards(items = []) {
  customStandards = items.map((item) => normalizeCustomStandard(item)).filter(Boolean);
  STANDARD_LIBRARY = [...BUILT_IN_STANDARD_LIBRARY, ...customStandards];
  return getCustomStandards();
}

export function getCustomStandards() {
  return customStandards.map((item) => cloneStandard(item));
}

export function isCustomStandard(id) {
  return customStandards.some((item) => item.id === id);
}

export function makeCustomStandard(base = {}, fields = {}) {
  const name = String(fields.name || base.name || "自定义印刷标准").trim() || "自定义印刷标准";
  return normalizeCustomStandard({
    ...cloneStandard(base),
    id: fields.id || `custom_${Date.now()}`,
    name,
    printCondition: String(fields.printCondition || base.printCondition || "Custom print condition").trim(),
    target: fields.target || base.target || "isoA",
    custom: true,
    createdAt: base.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function addOrUpdateCustomStandard(standard) {
  const normalized = normalizeCustomStandard(standard);
  if (!normalized) return getCustomStandards();
  customStandards = [
    normalized,
    ...customStandards.filter((item) => item.id !== normalized.id),
  ];
  STANDARD_LIBRARY = [...BUILT_IN_STANDARD_LIBRARY, ...customStandards];
  return getCustomStandards();
}

export function removeCustomStandard(id) {
  customStandards = customStandards.filter((item) => item.id !== id);
  STANDARD_LIBRARY = [...BUILT_IN_STANDARD_LIBRARY, ...customStandards];
  return getCustomStandards();
}

export function standardById(id) {
  return STANDARD_LIBRARY.find((item) => item.id === id) || STANDARD_LIBRARY[0];
}

export function targetOptions() {
  return Object.entries(TARGETS).map(([id, target]) => ({ id, name: target.name }));
}

export function buildPatchMap(rawRows = []) {
  const map = new Map();
  for (const row of rawRows) {
    const cmyk = cmykFromRow(row);
    const lab = labFromRow(row);
    if (!cmyk || !lab) continue;
    map.set(cmykKey(cmyk), { cmyk, lab, row });
  }
  return map;
}

export function cmykKey(cmyk) {
  return ["c", "m", "y", "k"].map((key) => formatTone(cmyk[key])).join("/");
}

export function cmykFromRow(row) {
  const c = number(row.cmyk_c ?? row.c);
  const m = number(row.cmyk_m ?? row.m);
  const y = number(row.cmyk_y ?? row.y);
  const k = number(row.cmyk_k ?? row.k);
  if ([c, m, y, k].some((value) => !Number.isFinite(value))) return null;
  return { c, m, y, k };
}

export function labFromRow(row) {
  const l = number(row.lab_l ?? row.l);
  const a = number(row.lab_a ?? row.a);
  const b = number(row.lab_b ?? row.b);
  if ([l, a, b].every(Number.isFinite)) return { l, a, b };
  return labFromSpectralRow(row);
}

export function cmykFromManualRow(row) {
  const channel = String(row.channel || "").toUpperCase();
  const tone = number(row.tone);
  if (row.patchType === "paper" || channel === "PAPER") return { c: 0, m: 0, y: 0, k: 0 };
  if (channel === "CM") return { c: 100, m: 100, y: 0, k: 0 };
  if (channel === "CY") return { c: 100, m: 0, y: 100, k: 0 };
  if (channel === "MY") return { c: 0, m: 100, y: 100, k: 0 };
  if (channel === "CMY") return { c: 100, m: 100, y: 100, k: 0 };
  if (row.patchType === "gray" || channel === "GRAY") {
    const grayTone = Number.isFinite(tone) ? tone : 50;
    return { c: grayTone, m: grayTone, y: grayTone, k: 0 };
  }
  if (!["C", "M", "Y", "K"].includes(channel) || !Number.isFinite(tone)) return null;
  return {
    c: channel === "C" ? tone : 0,
    m: channel === "M" ? tone : 0,
    y: channel === "Y" ? tone : 0,
    k: channel === "K" ? tone : 0,
  };
}

function formatTone(value) {
  return Number(value).toFixed(2);
}

function normalizeCustomStandard(item) {
  if (!item || typeof item !== "object") return null;
  const id = String(item.id || "").trim() || `custom_${Date.now()}`;
  return {
    ...cloneStandard(item),
    id,
    name: String(item.name || "自定义印刷标准").trim() || "自定义印刷标准",
    printCondition: String(item.printCondition || "Custom print condition").trim(),
    target: item.target || "isoA",
    custom: true,
  };
}

function cloneStandard(item) {
  return JSON.parse(JSON.stringify(item || {}));
}
