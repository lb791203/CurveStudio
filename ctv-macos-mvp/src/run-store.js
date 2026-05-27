const LOCAL_STORAGE_WARN_BYTES = 4 * 1024 * 1024;
const RUNS_KEY = "ctv-runs";
const LAST_PROJECT_KEY = "ctv-last-project";
const COMPACT_IMPORT_RAW_ROW_LIMIT = 24;

export function loadStoredRuns() {
  try {
    const runs = JSON.parse(localStorage.getItem(RUNS_KEY) || "[]");
    return Array.isArray(runs) ? runs : [];
  } catch {
    return [];
  }
}

export function loadLastProject() {
  try {
    return JSON.parse(localStorage.getItem(LAST_PROJECT_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveRunsAndLastProject(runs, archive) {
  const runResult = saveStorageJson(RUNS_KEY, runs, "Run 历史");
  if (!runResult.ok) return runResult;
  return saveStorageJson(LAST_PROJECT_KEY, archive, "最近项目");
}

export function compactProjectArchiveForRun(archive = {}) {
  const rawRows = Array.isArray(archive.importInfo?.rawRows) ? archive.importInfo.rawRows : [];
  return {
    ...archive,
    importInfo: {
      ...(archive.importInfo || {}),
      rawRows: rawRows.slice(0, COMPACT_IMPORT_RAW_ROW_LIMIT),
      rawRowCount: rawRows.length,
      rawRowsCompacted: rawRows.length > COMPACT_IMPORT_RAW_ROW_LIMIT,
    },
    rawInput: archive.rawInput ? String(archive.rawInput).slice(0, 1000) : "",
    rawInputCompacted: Boolean(archive.rawInput),
  };
}

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
