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
    spectral_400: index,
    spectral_410: index + 1,
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
  assert.equal(compact.importInfo.rawRows.length, 24);
  assert.equal(compact.importInfo.rawRowsCompacted, true);
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

test("run storage reports quota failures and does not continue a combined save", () => {
  const storage = memoryStorage({ throwOnSet: "ctv-runs" });
  withLocalStorage(storage, () => {
    const result = saveRunsAndLastProject([{ runId: "run-1" }], { job: { customer: "Demo" } });

    assert.equal(result.ok, false);
    assert.match(result.warning, /Run 历史 写入失败：quota exceeded/);
    assert.deepEqual(storage.calls.filter(([operation]) => operation === "set").map(([, key]) => key), ["ctv-runs"]);
  });
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

    assert.equal(storage.data.has("ctv-runs"), false);
    assert.equal(storage.data.has("ctv-last-project"), false);
  });
});
