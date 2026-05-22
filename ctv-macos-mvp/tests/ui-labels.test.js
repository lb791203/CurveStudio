import assert from "node:assert/strict";
import test from "node:test";

import { algorithmDescription, deltaFormulaLabel, methodLabel } from "../src/ui-labels.js";

test("ui labels format methods and formula names", () => {
  assert.equal(deltaFormulaLabel("de2000"), "ΔE2000 — CIEDE2000");
  assert.equal(methodLabel("interpolated_iso_20654_lab"), "插值/ISO 20654 Lab");
  assert.ok(algorithmDescription("ctv").includes("ISO 20654"));
});
