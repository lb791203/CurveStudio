export function buildIccStandardPair({ iccProfile, standard, targetName, standardPatchCount = 0 } = {}) {
  const labReference = iccProfile && !iccProfile.error
    ? {
      source: "imported-icc",
      label: iccProfile.profileName || iccProfile.fileName || "Imported ICC",
      fileName: iccProfile.fileName || "",
      colorSpace: iccProfile.colorSpace || "",
      pcs: iccProfile.pcs || "",
      sampledCount: iccProfile.characterization?.sampledCount || 0,
      patchCount: iccProfile.characterization?.patchCount || 0,
      status: iccProfile.characterization?.status || "metadata-only",
    }
    : {
      source: standardPatchCount ? "standard-reference" : "none",
      label: standardPatchCount ? standard?.name || "Standard reference" : "No Lab reference",
      sampledCount: standardPatchCount,
      patchCount: standardPatchCount,
      status: standardPatchCount ? "ready" : "missing",
    };
  const toneTarget = {
    source: "explicit-standard",
    standardId: standard?.id || "",
    standardName: standard?.name || "",
    printCondition: standard?.printCondition || "",
    targetName: targetName || standard?.target || "",
    g7Enabled: standard?.g7?.enabled !== false,
  };
  const messages = [];
  let status = "pass";

  if (labReference.source === "none") {
    status = "warning";
    messages.push("当前没有可用 Lab 参考；ΔE 与 G7 色彩空间对比会受限。");
  }

  if (labReference.source === "imported-icc") {
    if (labReference.colorSpace !== "CMYK" || labReference.pcs !== "Lab") {
      status = "warning";
      messages.push(`ICC 是 ${labReference.colorSpace || "unknown"} -> ${labReference.pcs || "unknown"}，当前印刷补偿建议使用 CMYK -> Lab 输出 profile。`);
    }
    if (!labReference.sampledCount) {
      status = "warning";
      messages.push("ICC 已导入但未得到 sampled Lab；当前只能作为元数据参考。");
    }
    const mismatch = colorAimMismatch(iccProfile, standard);
    if (mismatch) {
      status = "warning";
      messages.push(mismatch);
    }
    if (isToneOnlyStandard(standard)) {
      messages.push("当前标准只提供阶调目标；ICC 只作为 Lab 色彩参考，TVI/CTV/G7 目标仍由右侧标准/目标曲线控制。");
    }
  }

  if (!messages.length) {
    messages.push(labReference.source === "imported-icc"
      ? "ICC Lab 参考与当前阶调目标已配对；导入 ICC 不会自动改变 TVI/CTV/G7 目标。"
      : "当前使用标准 Lab 参考与显式阶调目标。");
  }

  return {
    status,
    labReference,
    toneTarget,
    messages,
  };
}

function colorAimMismatch(iccProfile, standard) {
  const iccAim = detectAim([iccProfile?.profileName, iccProfile?.fileName, iccProfile?.description].join(" "));
  const standardAim = detectAim([standard?.id, standard?.name, standard?.printCondition].join(" "));
  if (!iccAim.kind || !standardAim.kind) return "";
  if (standardAim.kind === "tone-only") return "";
  if (iccAim.kind === "crpc" && standardAim.kind === "crpc" && iccAim.number !== standardAim.number) {
    return `ICC 指向 CRPC${iccAim.number}，当前标准是 CRPC${standardAim.number}；请确认 Lab 参考与印刷标准是否匹配。`;
  }
  if (iccAim.kind !== standardAim.kind) {
    return `ICC 色彩目标看起来是 ${aimLabel(iccAim)}，当前标准是 ${aimLabel(standardAim)}；建议确认是否故意混用。`;
  }
  return "";
}

function detectAim(text) {
  const value = String(text || "").toLowerCase();
  const crpc = value.match(/crpc\s*[-_ ]?(\d)/);
  if (crpc) return { kind: "crpc", number: Number(crpc[1]) };
  if (value.includes("gracol")) return { kind: "gracol" };
  const fogra = value.match(/fogra\s*[-_ ]?(\d+)/);
  if (fogra) return { kind: "fogra", number: Number(fogra[1]) };
  if (value.includes("pso") || value.includes("iso coated") || value.includes("iso-coated") || value.includes("isocoated")) return { kind: "fogra" };
  if (value.includes("swop")) return { kind: "swop" };
  if (value.includes("tvi target only") || value.includes("iso_tvi") || value.includes("iso tvi curve")) return { kind: "tone-only" };
  return { kind: "" };
}

function aimLabel(aim) {
  if (aim.kind === "crpc") return `GRACoL CRPC${aim.number}`;
  if (aim.kind === "gracol") return "GRACoL";
  if (aim.kind === "fogra") return aim.number ? `FOGRA${aim.number}` : "FOGRA/PSO/ISO coated";
  if (aim.kind === "swop") return "SWOP";
  if (aim.kind === "tone-only") return "ISO TVI 目标";
  return "未知目标";
}

function isToneOnlyStandard(standard) {
  return detectAim([standard?.id, standard?.name, standard?.printCondition].join(" ")).kind === "tone-only";
}
