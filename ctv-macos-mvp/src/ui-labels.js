import { t } from "./translations.js";

export const DELTA_FORMULA_LABELS = {
  de76: "ΔE76",
  de94: "ΔE94",
  de2000: "ΔE2000",
  cmc: "CMC (2:1)",
};

export function deltaFormulaLabel(value = "de76") {
  return DELTA_FORMULA_LABELS[value] || DELTA_FORMULA_LABELS.de76;
}

export function algorithmDescription(mode) {
  if (mode === "ctv") return t("desc_ctv", "ISO 20654 CTV from Lab/XYZ; TVI fallback when CTV data is missing");
  if (mode === "g7") return t("desc_g7", "G7 MVP NPDC preview plus TVI-style production compensation");
  return t("desc_tvi", "TVI using reported tone/TVI or Murray-Davies density when solid/paper density is available");
}

export function methodLabel(value) {
  if (String(value || "").startsWith("interpolated_")) {
    return `${t("interpolated")}/${methodLabel(String(value).replace(/^interpolated_/, ""))}`;
  }
  return t(value, value || "reported");
}

