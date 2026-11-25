import { labFromSpectralRow, spectralSamples } from "./spectral-color.js";

const LOCAL_STORAGE_WARN_BYTES = 4 * 1024 * 1024;
// Run history and last project live in ONE key, so a save is a single setItem: it either
// fully replaces both or leaves both untouched (no rollback step that could itself fail).
// The two legacy keys are still read, and removed after the first successful combined write.
const STATE_KEY = "ctv-run-state";
const RUNS_KEY = "ctv-runs";
const LAST_PROJECT_KEY = "ctv-last-project";

function readJson(key) {
  try {
    const text = localStorage.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readState() {
  const combined = readJson(STATE_KEY);
  if (combined && typeof combined === "object" && !Array.isArray(combined)) {
    return { runs: Array.isArray(combined.runs) ? combined.runs : [], lastProject: combined.lastProject ?? null };
  }
  const runs = readJson(RUNS_KEY);
  const lastProject = readJson(LAST_PROJECT_KEY);
  return { runs: Array.isArray(runs) ? runs : [], lastProject: lastProject ?? null };
}

function writeState(next, label) {
  const result = saveStorageJson(STATE_KEY, { schemaVersion: 1, runs: next.runs, lastProject: next.lastProject }, label);
  if (result.ok) {
    try {
      localStorage.removeItem(RUNS_KEY);
      localStorage.removeItem(LAST_PROJECT_KEY);
    } catch {
      // Legacy keys are only a fallback; the combined key is already authoritative.
    }
  }
  return result;
}
const APPLIED_CURVES_KEY = "ctv-applied-curves";

export function loadStoredRuns() {
  return readState().runs;
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
  return readState().lastProject;
}

export function saveRunsAndLastProject(runs, archive) {
  return writeState({ runs, lastProject: archive }, "Run 历史和最近项目");
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
  // Spectral data is only dropped when a complete Lab remains (measured, or computed here);
  // otherwise the row is kept as it is. A blank LAB_L cell is "missing", not 0.
  const hasLab = ["lab_l", "lab_a", "lab_b"].every((key) => isFilled(row[key]));
  const lab = hasLab ? null : labFromSpectralRow(row);
  if (!hasLab && !lab) return row;
  const kept = Object.fromEntries(Object.entries(row).filter(([key]) => !SPECTRAL_KEY.test(String(key).toLowerCase())));
  if (!hasLab) {
    kept.lab_l = Number(lab.l.toFixed(3));
    kept.lab_a = Number(lab.a.toFixed(3));
    kept.lab_b = Number(lab.b.toFixed(3));
  }
  return kept;
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

const SPECTRAL_KEY = /(?:spectral_nm|nm_?|spectrum_?)\d{3}$/;

export function saveLastProject(archive) {
  return writeState({ ...readState(), lastProject: archive }, "最近项目");
}

export function saveStoredRuns(runs) {
  return writeState({ ...readState(), runs }, "Run 历史");
}

export function clearStoredRuns() {
  writeState({ ...readState(), runs: [] }, "Run 历史");
  localStorage.removeItem(RUNS_KEY);
}

export function clearStoredProject() {
  writeState({ ...readState(), lastProject: null }, "最近项目");
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
