import { t } from "./translations.js";

export const DELTA_FORMULA_LABELS = {
  de76: "ΔE*ab — CIE 1976",
  de94: "ΔE94 — CIE 1994",
  de2000: "ΔE2000 — CIEDE2000",
  cmc: "ΔE CMC — CMC (l:c)",
};

export function deltaFormulaLabel(value = "de76") {
  return DELTA_FORMULA_LABELS[value] || DELTA_FORMULA_LABELS.de76;
}

export function algorithmDescription(mode) {
  if (mode === "ctv") return t("desc_ctv", "CTV / SCTV ISO 20654 colorimetric tone from Lab/XYZ; TVI fallback when CTV data is missing");
  if (mode === "g7") return t("desc_g7", "G7 NPDC gray balance preview plus TVI-style production compensation");
  return t("desc_tvi", "TVI / Murray-Davies density using reported tone/TVI or paper/solid/tint density");
}

export function methodLabel(value) {
  if (String(value || "").startsWith("interpolated_")) {
    return `${t("interpolated")}/${methodLabel(String(value).replace(/^interpolated_/, ""))}`;
  }
  return t(value, value || "reported");
}
