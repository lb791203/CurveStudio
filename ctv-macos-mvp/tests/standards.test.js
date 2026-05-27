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
