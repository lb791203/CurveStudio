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
  if (mode === "ctv") return "ISO 20654 CTV from Lab/XYZ; TVI fallback when CTV data is missing";
  if (mode === "g7") return "G7 MVP NPDC preview plus TVI-style production compensation";
  return "TVI using reported tone/TVI or Murray-Davies density when solid/paper density is available";
}

export function methodLabel(value) {
  if (String(value || "").startsWith("interpolated_")) {
    return `插值/${methodLabel(String(value).replace(/^interpolated_/, ""))}`;
  }
  const labels = {
    reported_tvi: "仪器/文件 TVI",
    reported_tone: "实测网点",
    solid_density: "实地端点",
    murray_davies_density: "Murray-Davies 密度",
    murray_davies_spectral_density_mvp: "光谱密度 MVP",
    "single-wavelength-mvp": "单波长密度 MVP",
    iso_20654_lab: "ISO 20654 Lab",
    iso_20654_xyz_d50: "ISO 20654 XYZ",
    density_without_solid_fallback: "密度近似",
    anchor: "端点",
  };
  return labels[value] || value || "reported";
}
