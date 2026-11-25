import { labFromSpectralRow, spectralSamples } from "./spectral-color.js";

const LOCAL_STORAGE_WARN_BYTES = 4 * 1024 * 1024;
const RUNS_KEY = "ctv-runs";
const LAST_PROJECT_KEY = "ctv-last-project";
const APPLIED_CURVES_KEY = "ctv-applied-curves";

export function loadStoredRuns() {
  try {
    const runs = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]");
    return Array.isArray(runs) ? runs : [];
  } catch {
    return [];
  }
}

// Curves that were exported to the RIP (see rip-baseline.js).
export function loadAppliedCurves() {
  try {
    const items = JSON.parse(localStorage.getItem(APPLIED_CURVES_KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function saveAppliedCurves(items) {
  return saveStorageJson(APPLIED_CURVES_KEY, items, "已导出曲线");
}

export function loadLastProject() {
  try {
    return JSON.parse(localStorage.getItem(LAST_PROJECT_KEY) || "null");
  } catch {
    return null;
  }
}

// Both writes succeed or neither is kept: if the project write fails, the previous run
// history is put back so history and last project never disagree.
export function saveRunsAndLastProject(runs, archive) {
  let previousRuns = null;
  try {
    previousRuns = localStorage.getItem(RUNS_KEY);
  } catch {
    previousRuns = null;
  }
  const runResult = saveStorageJson(RUNS_KEY, runs, "Run 历史");
  if (!runResult.ok) return runResult;
  const projectResult = saveStorageJson(LAST_PROJECT_KEY, archive, "最近项目");
  if (!projectResult.ok) {
    try {
      if (previousRuns === null) localStorage.removeItem(RUNS_KEY);
      else localStorage.setItem(RUNS_KEY, previousRuns);
    } catch {
      // Nothing more can be done; the warning below still reaches the user.
    }
  }
  return projectResult;
}

// Run history must reopen to the same result, so every patch row is kept. Only the bulky
// spectral columns are replaced by the Lab computed from them (which is all the G7 and Lab
// checks use), and the raw text input is truncated.
export function compactProjectArchiveForRun(archive = {}) {
  const rawRows = Array.isArray(archive.importInfo?.rawRows) ? archive.importInfo.rawRows : [];
  const compactRows = rawRows.map(compactSpectralRow);
  return {
    ...archive,
    importInfo: {
      ...(archive.importInfo || {}),
      rawRows: compactRows,
      rawRowCount: rawRows.length,
      rawRowsCompacted: false,
      spectralCompacted: compactRows.some((row, index) => row !== rawRows[index]),
    },
    rawInput: archive.rawInput ? String(archive.rawInput).slice(0, 1000) : "",
    rawInputCompacted: Boolean(archive.rawInput),
  };
}

function compactSpectralRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  if (!spectralSamples(row).length) return row;
  const lab = labFromSpectralRow(row);
  const kept = Object.fromEntries(Object.entries(row).filter(([key]) => !SPECTRAL_KEY.test(String(key).toLowerCase())));
  if (lab && !Number.isFinite(Number(kept.lab_l))) {
    kept.lab_l = Number(lab.l.toFixed(3));
    kept.lab_a = Number(lab.a.toFixed(3));
    kept.lab_b = Number(lab.b.toFixed(3));
  }
  return kept;
}

const SPECTRAL_KEY = /(?:spectral_nm|nm_?|spectrum_?)\d{3}$/;

export function saveLastProject(archive) {
  return saveStorageJson(LAST_PROJECT_KEY, archive, "最近项目");
}

export function saveStoredRuns(runs) {
  return saveStorageJson(RUNS_KEY, runs, "Run 历史");
}

export function clearStoredRuns() {
  localStorage.removeItem(RUNS_KEY);
}

export function clearStoredProject() {
  localStorage.removeItem(LAST_PROJECT_KEY);
}

function saveStorageJson(key, value, label) {
  const text = JSON.stringify(value);
  if (storageByteLength(text) > LOCAL_STORAGE_WARN_BYTES) {
    return {
      ok: false,
      warning: `${label} 超过 4MB，本次未写入本机缓存。请先导出 JSON 项目档案或清理旧 Run。`,
    };
  }
  try {
    localStorage.setItem(key, text);
    return { ok: true, warning: "" };
  } catch (error) {
    return { ok: false, warning: `${label} 写入失败：${error.message || error}` };
  }
}

function storageByteLength(text) {
  return new TextEncoder().encode(text).length;
}
