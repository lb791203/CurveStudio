import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import {
  STANDARD_LIBRARY,
  addOrUpdateCustomStandard,
  buildPatchMap,
  getCustomStandards,
  isCustomStandard,
  makeCustomStandard,
  removeCustomStandard,
  setCustomStandards,
  standardById,
} from "../src/standards.js";
import { parseImportText } from "../src/curve-engine.js";

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

test("reference-file custom standards receive default acceptance settings", () => {
  setCustomStandards([]);
  const rawRows = [
    { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 92, lab_a: 0, lab_b: -3 },
    { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 54, lab_a: -36, lab_b: -49 },
  ];
  const custom = makeCustomStandard({
    id: "custom_reference_only",
    name: "Reference Only",
    printCondition: "Imported CGATS reference",
    referenceRows: rawRows,
  });

  addOrUpdateCustomStandard(custom);
  const stored = standardById("custom_reference_only");

  assert.equal(stored.deltaE.fail, 5);
  assert.equal(stored.g7.enabled, false);
  assert.equal(stored.toneTolerances.C.tvi[50], 5);
  assert.equal(stored.referenceRows.length, 2);
});

test("reimported reference standards replace older duplicates", () => {
  setCustomStandards([]);
  const first = makeCustomStandard({
    id: "custom_old_sml",
    name: "ISO 12647-2:2007 Offset",
    printCondition: "SML PrintSpec audit target Lab / XL-75-6C",
    referenceRows: [{ cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 92, lab_a: 0, lab_b: -3 }],
  });
  const second = makeCustomStandard({
    id: "custom_iso-12647-2-2007-offset-sml-printspec-audit-target-lab-xl-75-6c",
    name: "ISO 12647-2:2007 Offset",
    printCondition: "SML PrintSpec audit target Lab / XL-75-6C",
    referenceRows: [
      { cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 92, lab_a: 0, lab_b: -3 },
      { cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 54, lab_a: -36, lab_b: -49 },
    ],
  });

  addOrUpdateCustomStandard(first);
  addOrUpdateCustomStandard(second);

  const custom = getCustomStandards();
  assert.equal(custom.length, 1);
  assert.equal(custom[0].id, second.id);
  assert.equal(custom[0].referenceRows.length, 2);
});

test("standard presets carry their own acceptance tolerances", () => {
  const gracol = standardById("gracol2013_crpc6");
  const fogra = standardById("fogra39");
  const sml = standardById("sml_printspec_xl75_6c");
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

  assert.equal(sml.name, "ISO 12647-2:2007 Offset");
  assert.match(sml.referencePath, /SML-PrintSpec-XL75-6C\.txt$/);
  assert.equal(sml.deltaE.fail, 5);
  assert.equal(sml.g7.enabled, false);

  assert.equal(isoTvi.acceptancePreset, "ISO TVI-only field audit");
  assert.equal(isoTvi.toneTolerances.C.ctv[50], 4);
  assert.equal(isoTvi.g7.enabled, false);
});

test("SML PrintSpec standard reference file contains report target Lab values", () => {
  const text = fs.readFileSync("reference-data/standards/customer-audit/SML-PrintSpec-XL75-6C.txt", "utf8");
  const parsed = parseImportText(text);
  const map = buildPatchMap(parsed.rawRows);

  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.rawRows.length, 9);
  assert.equal(map.get("0.00/0.00/0.00/0.00").lab.l, 92);
  assert.deepEqual(map.get("100.00/0.00/0.00/0.00").lab, { l: 54, a: -36, b: -49 });
  assert.deepEqual(map.get("100.00/100.00/0.00/0.00").lab, { l: 24, a: 16, b: -45 });
});
