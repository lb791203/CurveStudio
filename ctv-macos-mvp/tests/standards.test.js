import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import {
  STANDARD_LIBRARY,
  addOrUpdateCustomStandard,
  archivedStandardAsCustom,
  hasStandard,
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
  assert.equal(stored.toneTolerances.C.tvi[50], 4);
  assert.equal(stored.referenceRows.length, 2);
});

test("reimported reference standards replace older duplicates", () => {
  setCustomStandards([]);
  const first = makeCustomStandard({
    id: "custom_old_audit_demo",
    name: "ISO 12647-2:2007 Offset",
    printCondition: "ISO 12647-2:2007 offset audit demo target Lab",
    referenceRows: [{ cmyk_c: 0, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 92, lab_a: 0, lab_b: -3 }],
  });
  const second = makeCustomStandard({
    id: "custom_iso-12647-2-2007-offset-audit-demo-target-lab",
    name: "ISO 12647-2:2007 Offset",
    printCondition: "ISO 12647-2:2007 offset audit demo target Lab",
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
  const auditDemo = standardById("iso12647_2_2007_offset_audit_demo");
  const isoTvi = standardById("iso_tvi_b");
  const pc1 = standardById("iso12647_2_2013_pc1");
  const pc6 = standardById("iso12647_2_2013_pc6");

  assert.equal(gracol.acceptancePreset, "GRACoL / G7 field audit");
  assert.equal(gracol.toneTolerances.C.tvi[50], 4);
  assert.equal(gracol.toneTolerances.K.ctv[50], 3);
  assert.equal(gracol.deltaE.fail, 4.2);
  assert.equal(gracol.g7.enabled, true);


  assert.equal(standardById("fogra39").id, "gracol2013_crpc1"); // removed preset falls back
  assert.equal(standardById("sml_printspec_xl75_6c").id, "iso12647_2_2007_offset_audit_demo"); // renamed preset keeps saved projects
  assert.equal(auditDemo.name, "ISO 12647-2:2007 Offset");
  assert.match(auditDemo.referencePath, /iso12647-2-2007-offset-audit-demo\.txt$/);
  assert.deepEqual(auditDemo.channelTargets, { K: "isoB" });
  assert.equal(auditDemo.deltaE.fail, 5);
  assert.equal(auditDemo.g7.enabled, false);

  assert.equal(isoTvi.acceptancePreset, "ISO 12647-2 TVI field audit");
  assert.equal(isoTvi.toneTolerances.C.tvi[25], 3);
  assert.equal(isoTvi.toneTolerances.C.tvi[50], 4);
  assert.equal(isoTvi.toneTolerances.C.tvi[75], 3);
  assert.equal(isoTvi.toneTolerances.C.ctv[50], 3);
  assert.equal(isoTvi.g7.enabled, false);

  assert.equal(pc1.target, "isoA");
  assert.equal(pc1.toleranceSource, "ISO 12647-2:2013 Table 11");
  assert.deepEqual(
    pc1.referenceRows.find((row) => row.sample_id === "C"),
    { sample_id: "C", cmyk_c: 100, cmyk_m: 0, cmyk_y: 0, cmyk_k: 0, lab_l: 56, lab_a: -36, lab_b: -51 },
  );
  assert.equal(pc6.target, "isoB");
  assert.equal(pc6.printCondition, "PC6 / PS6 / CD6");
});

test("audit demo standard reference file contains target Lab values", () => {
  const text = fs.readFileSync("reference-data/standards/audit-demo/iso12647-2-2007-offset-audit-demo.txt", "utf8");
  const parsed = parseImportText(text);
  const map = buildPatchMap(parsed.rawRows);

  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.rawRows.length, 9);
  assert.equal(map.get("0.00/0.00/0.00/0.00").lab.l, 92);
  assert.deepEqual(map.get("100.00/0.00/0.00/0.00").lab, { l: 54, a: -36, b: -49 });
  assert.deepEqual(map.get("100.00/100.00/0.00/0.00").lab, { l: 24, a: 16, b: -45 });
});

test("removed built-in presets restore from the archive snapshot instead of another print condition", () => {
  setCustomStandards([]);
  assert.equal(hasStandard("fogra39"), false);
  assert.equal(hasStandard("sml_printspec_xl75_6c"), true);

  const snapshot = {
    id: "fogra39",
    name: "FOGRA39",
    printCondition: "ISO coated reference",
    target: "isoA",
    referencePath: "./reference-data/standards/patchtool/FOGRA39.txt",
    deltaE: { warning: 3, fail: 5 },
  };
  const restored = archivedStandardAsCustom(snapshot);
  addOrUpdateCustomStandard(restored);
  const stored = standardById(restored.id);

  assert.equal(stored.id, "custom_archived_fogra39");
  assert.equal(stored.custom, true);
  assert.match(stored.name, /FOGRA39/);
  assert.equal(stored.printCondition, "ISO coated reference");
  assert.equal(stored.deltaE.fail, 5);
  assert.equal(stored.referencePath, undefined);
  setCustomStandards([]);
});
