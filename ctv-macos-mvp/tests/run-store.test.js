import assert from "node:assert/strict";
import test from "node:test";

import {
  clearStoredProject,
  clearStoredRuns,
  compactProjectArchiveForRun,
  loadLastProject,
  loadStoredRuns,
  saveLastProject,
  saveRunsAndLastProject,
  saveStoredRuns,
} from "../src/run-store.js";

function memoryStorage(options = {}) {
  const data = new Map(Object.entries(options.initial || {}));
  const calls = [];
  return {
    data,
    calls,
    getItem(key) {
      calls.push(["get", key]);
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      calls.push(["set", key, value]);
      if (options.throwOnSet === key) throw new Error("quota exceeded");
      data.set(key, value);
    },
    removeItem(key) {
      calls.push(["remove", key]);
      data.delete(key);
    },
  };
}

function withLocalStorage(storage, callback) {
  const hadStorage = Object.hasOwn(globalThis, "localStorage");
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  try {
    return callback();
  } finally {
    if (hadStorage) globalThis.localStorage = originalStorage;
    else delete globalThis.localStorage;
  }
}

test("compactProjectArchiveForRun keeps restore data but drops bulky raw import payload", () => {
  const rawRows = Array.from({ length: 60 }, (_, index) => ({
    sample_name: `A${index + 1}`,
    cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: index,
    ...Object.fromEntries(Array.from({ length: 31 }, (_, band) => [`spectral_nm${400 + band * 10}`, 0.8 - index / 100])),
  }));
  const archive = {
    job: { customer: "Demo" },
    standard: { id: "gracol2013_crpc6", name: "GRACoL2013 CRPC6" },
    importInfo: { sourceFormat: "P2P51", rawRows, warnings: [] },
    rawInput: "CGATS\n".repeat(5000),
    measurements: [{ channel: "K", tone: 50, measuredTone: 75 }],
    results: [{ channel: "K", inputTone: 50, outputTone: 46 }],
    labVerification: [{ label: "Paper", lab: { l: 95, a: 1, b: -4 } }],
  };

  const compact = compactProjectArchiveForRun(archive);

  assert.equal(compact.measurements.length, 1);
  assert.equal(compact.results.length, 1);
  assert.equal(compact.labVerification.length, 1);
  assert.equal(compact.importInfo.rawRowCount, 60);
  // review M4: every patch is kept so the run reopens to the same G7 result.
  assert.equal(compact.importInfo.rawRows.length, 60);
  assert.equal(compact.importInfo.rawRowsCompacted, false);
  assert.ok(compact.importInfo.rawRows.every((row) => Number.isFinite(row.lab_l) && !("spectral_nm400" in row)));
  assert.equal(compact.rawInputCompacted, true);
  assert.ok(compact.rawInput.length <= 1000);
});

test("run storage roundtrips runs and the last project", () => {
  const storage = memoryStorage();
  withLocalStorage(storage, () => {
    const runs = [{ runId: "run-1", results: [{ outputTone: 46 }] }];
    const archive = { job: { customer: "Demo" }, measurements: [{ tone: 50 }] };

    assert.deepEqual(saveRunsAndLastProject(runs, archive), { ok: true, warning: "" });
    assert.deepEqual(loadStoredRuns(), runs);
    assert.deepEqual(loadLastProject(), archive);
  });
});

test("run storage recovers safely from malformed or wrong-shaped JSON", () => {
  const storage = memoryStorage({
    initial: {
      "ctv-runs": "{broken",
      "ctv-last-project": "{broken",
    },
  });
  withLocalStorage(storage, () => {
    assert.deepEqual(loadStoredRuns(), []);
    assert.equal(loadLastProject(), null);
    storage.data.set("ctv-runs", JSON.stringify({ not: "an array" }));
    assert.deepEqual(loadStoredRuns(), []);
  });
});

test("run storage reports quota failures and leaves the previous history and project untouched", () => {
  const before = JSON.stringify({ schemaVersion: 1, runs: [{ runId: "old" }], lastProject: { job: { customer: "Old" } } });
  const storage = memoryStorage({ initial: { "ctv-run-state": before }, throwOnSet: "ctv-run-state" });
  withLocalStorage(storage, () => {
    const result = saveRunsAndLastProject([{ runId: "run-1" }, { runId: "old" }], { job: { customer: "Demo" } });

    assert.equal(result.ok, false);
    assert.match(result.warning, /写入失败：quota exceeded/);
    assert.equal(storage.calls.filter(([operation]) => operation === "set").length, 1);
    assert.deepEqual(loadStoredRuns(), [{ runId: "old" }]);
    assert.deepEqual(loadLastProject(), { job: { customer: "Old" } });
  });
});

test("re-review M4: history and project are one write; legacy keys are read and then migrated", () => {
  const storage = memoryStorage({ initial: { "ctv-runs": "[{\"runId\":\"legacy\"}]", "ctv-last-project": "{\"job\":{}}" } });
  withLocalStorage(storage, () => {
    assert.deepEqual(loadStoredRuns(), [{ runId: "legacy" }]);
    assert.equal(saveRunsAndLastProject([{ runId: "new" }, { runId: "legacy" }], { job: { customer: "A" } }).ok, true);
    assert.equal(storage.data.has("ctv-runs"), false);
    assert.equal(storage.data.has("ctv-last-project"), false);
    assert.deepEqual(loadStoredRuns().map((run) => run.runId), ["new", "legacy"]);
    assert.deepEqual(loadLastProject(), { job: { customer: "A" } });
  });
});

test("re-review M4: a spectral row with a blank LAB_L keeps a usable Lab (computed) or its spectrum", () => {
  const spectral = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`spectral_nm${380 + i * 10}`, 0.8]));
  const archive = compactProjectArchiveForRun({ importInfo: { rawRows: [
    { sample_id: "A", lab_l: "", lab_a: "", lab_b: "", ...spectral },
    { sample_id: "B", lab_l: "", spectral_nm400: "n/a", spectral_nm410: "n/a" },
  ] } });
  const [a, b] = archive.importInfo.rawRows;
  assert.ok(Number.isFinite(a.lab_l) && a.lab_l > 80);
  assert.equal(Object.keys(a).some((key) => key.startsWith("spectral_nm")), false);
  // No usable Lab can be computed: the spectral columns are kept instead of being thrown away.
  assert.ok(Object.keys(b).some((key) => key.startsWith("spectral_nm")));
});

test("run storage rejects payloads over 4MB before touching localStorage", () => {
  const storage = memoryStorage();
  withLocalStorage(storage, () => {
    const result = saveLastProject({ rawInput: "测".repeat(1_500_000) });

    assert.equal(result.ok, false);
    assert.match(result.warning, /超过 4MB/);
    assert.equal(storage.calls.some(([operation]) => operation === "set"), false);
  });
});

test("run storage supports independent save and clear operations", () => {
  const storage = memoryStorage();
  withLocalStorage(storage, () => {
    assert.equal(saveStoredRuns([{ runId: "run-2" }]).ok, true);
    assert.equal(saveLastProject({ results: [] }).ok, true);

    clearStoredRuns();
    clearStoredProject();

    assert.deepEqual(loadStoredRuns(), []);
    assert.equal(loadLastProject(), null);
  });
});
