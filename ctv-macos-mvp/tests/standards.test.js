import assert from "node:assert/strict";
import test from "node:test";

import {
  STANDARD_LIBRARY,
  addOrUpdateCustomStandard,
  getCustomStandards,
  isCustomStandard,
  makeCustomStandard,
  removeCustomStandard,
  setCustomStandards,
  standardById,
} from "../src/standards.js";

test("custom standards can be added, resolved, updated, and removed", () => {
  setCustomStandards([]);
  const base = standardById("gracol2013_crpc6");
  const custom = makeCustomStandard(base, {
    id: "custom_test_press",
    name: "KBA Custom",
    printCondition: "KBA internal",
    target: "isoB",
  });

  addOrUpdateCustomStandard(custom);
  assert.equal(isCustomStandard("custom_test_press"), true);
  assert.equal(standardById("custom_test_press").name, "KBA Custom");
  assert.equal(standardById("custom_test_press").target, "isoB");
  assert.ok(STANDARD_LIBRARY.some((item) => item.id === "custom_test_press"));

  addOrUpdateCustomStandard({ ...custom, name: "KBA Custom 2" });
  assert.equal(getCustomStandards().length, 1);
  assert.equal(standardById("custom_test_press").name, "KBA Custom 2");

  removeCustomStandard("custom_test_press");
  assert.equal(isCustomStandard("custom_test_press"), false);
});

test("built-in standards carry their own acceptance tolerances", () => {
  const gracol = standardById("gracol2013_crpc6");
  const fogra = standardById("fogra39");
  const isoTvi = standardById("iso_tvi_b");

  assert.equal(gracol.acceptancePreset, "GRACoL / G7 field audit");
  assert.equal(gracol.toneTolerances.C.tvi[50], 4);
  assert.equal(gracol.toneTolerances.K.ctv[50], 3);
  assert.equal(gracol.deltaE.fail, 4.2);
  assert.equal(gracol.g7.enabled, true);

  assert.equal(fogra.acceptancePreset, "FOGRA process-control field audit");
  assert.equal(fogra.toneTolerances.C.tvi[50], 5);
  assert.equal(fogra.toneTolerances.C.ctv[50], 4);
  assert.equal(fogra.deltaE.fail, 5);
  assert.equal(fogra.g7.enabled, false);

  assert.equal(isoTvi.acceptancePreset, "ISO TVI-only field audit");
  assert.equal(isoTvi.toneTolerances.C.ctv[50], 4);
  assert.equal(isoTvi.g7.enabled, false);
});
