import assert from "node:assert/strict";
import test from "node:test";

import { applyFeatureFlags, FEATURES, isViewEnabled } from "../src/features.js";

test("re-review L1: the instrument entry is behind a feature switch that is off for release", () => {
  assert.equal(FEATURES.instrumentEntry, false);
  assert.equal(isViewEnabled("instrument"), false);
  assert.equal(isViewEnabled("measurement"), true);
  assert.equal(isViewEnabled("instrument", { instrumentEntry: true }), true);
});

test("re-review L1: applyFeatureFlags hides or shows the entry and its page together", () => {
  const nodes = [{ hidden: false }, { hidden: false }];
  const root = { querySelectorAll: (selector) => (selector.includes("instrument") ? nodes : []) };
  applyFeatureFlags(root);
  assert.ok(nodes.every((node) => node.hidden));
  applyFeatureFlags(root, { instrumentEntry: true });
  assert.ok(nodes.every((node) => !node.hidden));
});
