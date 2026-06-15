import { TARGETS } from "./curve-engine.js";
import { number } from "./shared.js";
import { labFromSpectralRow } from "./spectral-color.js";

const CHANNELS = ["C", "M", "Y", "K"];
const TOLERANCE_TONES = [25, 50, 75];

function buildToneTolerances({ tvi = [3, 4, 3], ctv = [3, 3, 3] } = {}) {
  return Object.fromEntries(CHANNELS.map((channel) => [
    channel,
    {
      tvi: Object.fromEntries(TOLERANCE_TONES.map((tone, index) => [tone, tvi[index] ?? tvi[1] ?? 3])),
      ctv: Object.fromEntries(TOLERANCE_TONES.map((tone, index) => [tone, ctv[index] ?? ctv[1] ?? 3])),
    },
  ]));
}

const ACCEPTANCE_PRESETS = {
  gracolG7: {
    acceptancePreset: "GRACoL / G7 field audit",
    toneTolerances: buildToneTolerances({ tvi: [3, 4, 3], ctv: [3, 3, 3] }),
    deltaE: { warning: 3.5, fail: 4.2 },
    g7: {
      enabled: true,
      npdcAverage: 1.5,
      npdcMax: 3,
      grayAverage: 1.5,
      grayMax: 3,
      grayInflection: "",
    },
  },
  fograProcess: {
    acceptancePreset: "FOGRA process-control field audit",
    toneTolerances: buildToneTolerances({ tvi: [4, 5, 4], ctv: [3, 4, 3] }),
    deltaE: { warning: 4, fail: 5 },
    g7: {
      enabled: false,
      npdcAverage: 1.5,
      npdcMax: 3,
      grayAverage: 1.5,
      grayMax: 3,
      grayInflection: "",
    },
  },
  isoTviOnly: {
    acceptancePreset: "ISO 12647-2 TVI field audit",
    toneTolerances: buildToneTolerances({ tvi: [3, 4, 3], ctv: [3, 3, 3] }),
    deltaE: { warning: 4, fail: 5 },
    g7: {
      enabled: false,
      npdcAverage: 2,
      npdcMax: 4,
      grayAverage: 2,
      grayMax: 4,
      grayInflection: "",
    },
  },
};

function acceptancePreset(id) {
  return cloneStandard(ACCEPTANCE_PRESETS[id] || ACCEPTANCE_PRESETS.gracolG7);
}

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

export const SML_ISO_12647_2_2007_DENSITY_TARGETS = {
  C: { 0: 0.08, 25: 0.25, 50: 0.49, 75: 0.85, 100: 1.4 },
  M: { 0: 0.08, 25: 0.25, 50: 0.5, 75: 0.86, 100: 1.45 },
  Y: { 0: 0.06, 25: 0.22, 50: 0.43, 75: 0.72, 100: 1.05 },
  K: { 0: 0.08, 25: 0.28, 50: 0.54, 75: 0.94, 100: 1.7 },
};

const ISO_12647_2_2013_TOLERANCE_SOURCE = "ISO 12647-2:2013 Table 11";
const ISO_12647_2_2013_TARGET_SOURCE = "ISO 12647-2:2013 Table 9";
const ISO_12647_2_2013_LAB_SOURCE = "ISO 12647-2:2013 Tables 2, 5 and 6";

const ISO_12647_2_2013_SOLID_LAB = {
  CD1: {
    K: [16, 0, 0], C: [56, -36, -51], M: [48, 75, -4], Y: [89, -4, 93],
    CM: [25, 20, -46], CY: [50, -65, 26], MY: [48, 68, 47], CMY: [23, 0, -1],
  },
  CD2: {
    K: [20, 1, 2], C: [58, -37, -46], M: [48, 73, -6], Y: [87, -3, 90],
    CM: [28, 16, -46], CY: [51, -59, 27], MY: [48, 66, 45], CMY: [28, -4, -1],
  },
  CD3: {
    K: [20, 1, 2], C: [55, -36, -43], M: [46, 70, -3], Y: [84, -2, 89],
    CM: [27, 15, -42], CY: [49, -56, 28], MY: [47, 64, 45], CMY: [27, -3, 0],
  },
  CD4: {
    K: [24, 1, 2], C: [56, -33, -42], M: [48, 68, -1], Y: [85, -2, 83],
    CM: [28, 16, -38], CY: [50, -53, 26], MY: [47, 63, 41], CMY: [27, 0, -2],
  },
  CD5: {
    K: [33, 1, 1], C: [60, -25, -44], M: [55, 60, -2], Y: [89, -3, 76],
    CM: [39, 9, -30], CY: [53, -43, 14], MY: [53, 56, 27], CMY: [35, 0, -3],
  },
  CD6: {
    K: [23, 1, 2], C: [56, -36, -40], M: [48, 67, -4], Y: [84, 0, 86],
    CM: [28, 13, -41], CY: [49, -53, 25], MY: [47, 63, 40], CMY: [27, -1, -3],
  },
  CD7: {
    K: [32, 1, 3], C: [59, -29, -35], M: [53, 59, -1], Y: [83, -1, 73],
    CM: [37, 8, -31], CY: [53, -43, 18], MY: [51, 57, 31], CMY: [34, -3, -5],
  },
  CD8: {
    K: [30, 1, 2], C: [54, -26, -31], M: [51, 55, 1], Y: [79, 0, 70],
    CM: [36, 9, -25], CY: [47, -38, 20], MY: [48, 53, 31], CMY: [33, -1, 0],
  },
};

const ISO_12647_2_2013_PAPER_LAB = {
  PS1: [95, 1, -4],
  PS2: [93, 0, -1],
  PS3: [90, 0, 1],
  PS4: [91, 0, 1],
};

const ISO_12647_2_2013_PC = [
  { pc: "PC1", ps: "PS1", cd: "CD1", target: "isoA" },
  { pc: "PC2", ps: "PS2", cd: "CD2", target: "isoB" },
  { pc: "PC3", ps: "PS3", cd: "CD3", target: "isoB" },
  { pc: "PC4", ps: "PS4", cd: "CD4", target: "isoB" },
  { pc: "PC5", ps: "PS5", cd: "CD5", target: "isoC" },
  { pc: "PC6", ps: "PS6", cd: "CD6", target: "isoB" },
  { pc: "PC7", ps: "PS7", cd: "CD7", target: "isoC" },
  { pc: "PC8", ps: "PS8", cd: "CD8", target: "isoC" },
];

function labReferenceRowsForIso2013(pc) {
  const rows = [];
  const paper = ISO_12647_2_2013_PAPER_LAB[pc.ps];
  if (paper) rows.push(labReferenceRow("Paper", { c: 0, m: 0, y: 0, k: 0 }, paper));
  const lab = ISO_12647_2_2013_SOLID_LAB[pc.cd] || {};
  const cmykByPatch = {
    C: { c: 100, m: 0, y: 0, k: 0 },
    M: { c: 0, m: 100, y: 0, k: 0 },
    Y: { c: 0, m: 0, y: 100, k: 0 },
    K: { c: 0, m: 0, y: 0, k: 100 },
    CM: { c: 100, m: 100, y: 0, k: 0 },
    CY: { c: 100, m: 0, y: 100, k: 0 },
    MY: { c: 0, m: 100, y: 100, k: 0 },
    CMY: { c: 100, m: 100, y: 100, k: 0 },
  };
  for (const patch of ["C", "M", "Y", "K", "CM", "CY", "MY", "CMY"]) {
    if (lab[patch]) rows.push(labReferenceRow(patch, cmykByPatch[patch], lab[patch]));
  }
  return rows;
}

function labReferenceRow(sampleId, cmyk, lab) {
  return {
    sample_id: sampleId,
    cmyk_c: cmyk.c,
    cmyk_m: cmyk.m,
    cmyk_y: cmyk.y,
    cmyk_k: cmyk.k,
    lab_l: lab[0],
    lab_a: lab[1],
    lab_b: lab[2],
  };
}

const CRPC_STANDARDS = Array.from({ length: 7 }, (_, index) => {
  const crpc = index + 1;
  return {
    id: `gracol2013_crpc${crpc}`,
    name: `GRACoL2013 CRPC${crpc}`,
    printCondition: `CGATS21-2 CRPC${crpc}`,
    target: "isoA",
    targetSource: "GRACoL2013 CRPC tone target",
    labReferenceSource: "CGATS21-2 CRPC reference data",
    referencePath: `./reference-data/standards/cgats21-iso15339/CGATS21-2-CRPC${crpc}.txt`,
    solidDensityRanges: COATED_SOLID_DENSITY_RANGES,
    ...acceptancePreset("gracolG7"),
  };
});

const ISO_12647_2_2013_PC_STANDARDS = ISO_12647_2_2013_PC.map((pc) => ({
  id: `iso12647_2_2013_${pc.pc.toLowerCase()}`,
  name: `ISO 12647-2:2013 ${pc.pc}`,
  printCondition: `${pc.pc} / ${pc.ps} / ${pc.cd}`,
  target: pc.target,
  targetSource: ISO_12647_2_2013_TARGET_SOURCE,
  labReferenceSource: ISO_12647_2_2013_LAB_SOURCE,
  toleranceSource: ISO_12647_2_2013_TOLERANCE_SOURCE,
  densityTargetSource: "No fixed ISO density target; density is a process-control value from the OK print",
  printingCondition: pc,
  referenceRows: labReferenceRowsForIso2013(pc),
  solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
  midtoneSpreadTolerance: 5,
  ...acceptancePreset("isoTviOnly"),
}));

const BUILT_IN_STANDARD_LIBRARY = [
  ...CRPC_STANDARDS,
  {
    id: "fogra39",
    name: "FOGRA39",
    printCondition: "ISO coated reference",
    target: "isoA",
    targetSource: "FOGRA39 reference condition",
    labReferenceSource: "FOGRA39 reference data",
    referencePath: "./reference-data/standards/patchtool/FOGRA39.txt",
    solidDensityRanges: COATED_SOLID_DENSITY_RANGES,
    ...acceptancePreset("fograProcess"),
  },
  {
    id: "sml_printspec_xl75_6c",
    name: "ISO 12647-2:2007 Offset",
    printCondition: "ISO 12647-2:2007 Offset Status T / Paper 2 Matt / Curve A+B / Black / Status T",
    target: "isoA",
    targetSource: "Customer audit report / PrintSpec Curve A+B",
    labReferenceSource: "Customer audit report target Lab",
    densityTargetSource: "Customer audit report target density",
    referencePath: "./reference-data/standards/customer-audit/SML-PrintSpec-XL75-6C.txt",
    solidDensityRanges: COATED_SOLID_DENSITY_RANGES,
    densityTargets: SML_ISO_12647_2_2007_DENSITY_TARGETS,
    ...acceptancePreset("isoTviOnly"),
    deltaE: { warning: 5, fail: 5 },
  },
  ...ISO_12647_2_2013_PC_STANDARDS,
  {
    id: "iso_tvi_a",
    name: "ISO TVI Curve A",
    printCondition: "TVI target only",
    target: "isoA",
    targetSource: ISO_12647_2_2013_TARGET_SOURCE,
    toleranceSource: ISO_12647_2_2013_TOLERANCE_SOURCE,
    densityTargetSource: "No fixed ISO density target; density must come from OK print/process control",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...acceptancePreset("isoTviOnly"),
  },
  {
    id: "iso_tvi_b",
    name: "ISO TVI Curve B",
    printCondition: "TVI target only",
    target: "isoB",
    targetSource: ISO_12647_2_2013_TARGET_SOURCE,
    toleranceSource: ISO_12647_2_2013_TOLERANCE_SOURCE,
    densityTargetSource: "No fixed ISO density target; density must come from OK print/process control",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...acceptancePreset("isoTviOnly"),
  },
  {
    id: "iso_tvi_c",
    name: "ISO TVI Curve C",
    printCondition: "TVI target only",
    target: "isoC",
    targetSource: ISO_12647_2_2013_TARGET_SOURCE,
    toleranceSource: ISO_12647_2_2013_TOLERANCE_SOURCE,
    densityTargetSource: "No fixed ISO density target; density must come from OK print/process control",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...acceptancePreset("isoTviOnly"),
  },
  {
    id: "iso_tvi_d",
    name: "ISO TVI Curve D",
    printCondition: "TVI target only",
    target: "isoD",
    targetSource: ISO_12647_2_2013_TARGET_SOURCE,
    toleranceSource: ISO_12647_2_2013_TOLERANCE_SOURCE,
    densityTargetSource: "No fixed ISO density target; density must come from OK print/process control",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...acceptancePreset("isoTviOnly"),
  },
  {
    id: "iso_tvi_e",
    name: "ISO TVI Curve E",
    printCondition: "TVI target only",
    target: "isoE",
    targetSource: ISO_12647_2_2013_TARGET_SOURCE,
    toleranceSource: ISO_12647_2_2013_TOLERANCE_SOURCE,
    densityTargetSource: "No fixed ISO density target; density must come from OK print/process control",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...acceptancePreset("isoTviOnly"),
  },
  {
    id: "iso_tvi_f",
    name: "ISO TVI Curve F",
    printCondition: "TVI target only",
    target: "isoF",
    targetSource: "Legacy compatibility target",
    densityTargetSource: "No fixed density target",
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
    ...acceptancePreset("isoTviOnly"),
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
    id: fields.id || base.id || `custom_${Date.now()}`,
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
    ...customStandards.filter((item) => item.id !== normalized.id && !sameImportedStandard(item, normalized)),
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
  const defaults = {
    ...acceptancePreset("isoTviOnly"),
    solidDensityRanges: BROAD_SOLID_DENSITY_RANGES,
  };
  const source = cloneStandard(item);
  return {
    ...defaults,
    ...source,
    id,
    name: String(item.name || "自定义印刷标准").trim() || "自定义印刷标准",
    printCondition: String(item.printCondition || "Custom print condition").trim(),
    target: item.target || "isoA",
    deltaE: {
      ...defaults.deltaE,
      ...(source.deltaE || {}),
    },
    g7: {
      ...defaults.g7,
      ...(source.g7 || {}),
    },
    toneTolerances: source.toneTolerances || defaults.toneTolerances,
    solidDensityRanges: source.solidDensityRanges || defaults.solidDensityRanges,
    custom: true,
  };
}

function sameImportedStandard(a, b) {
  if (!a?.custom || !b?.custom) return false;
  if (!Array.isArray(a.referenceRows) || !Array.isArray(b.referenceRows)) return false;
  return String(a.name || "") === String(b.name || "")
    && String(a.printCondition || "") === String(b.printCondition || "");
}

function cloneStandard(item) {
  return JSON.parse(JSON.stringify(item || {}));
}
