import assert from "node:assert/strict";
import test from "node:test";

import { buildIccStandardPair } from "../src/icc-pairing.js";

test("buildIccStandardPair pairs imported ICC Lab reference with explicit tone target", () => {
  const pair = buildIccStandardPair({
    iccProfile: {
      profileName: "GRACoL2013 CRPC6 press profile",
      colorSpace: "CMYK",
      pcs: "Lab",
      characterization: { sampledCount: 24, patchCount: 24, status: "sampled" },
    },
    standard: {
      id: "gracol2013_crpc6",
      name: "GRACoL2013 CRPC6",
      printCondition: "CGATS21-2 CRPC6",
      g7: { enabled: true },
    },
    targetName: "ISO TVI A",
    standardPatchCount: 1617,
  });

  assert.equal(pair.status, "pass");
  assert.equal(pair.labReference.source, "imported-icc");
  assert.equal(pair.toneTarget.standardName, "GRACoL2013 CRPC6");
  assert.match(pair.messages[0], /不会自动改变/);
});

test("buildIccStandardPair warns on obvious CRPC mismatch", () => {
  const pair = buildIccStandardPair({
    iccProfile: {
      profileName: "GRACoL2013 CRPC3 press profile",
      colorSpace: "CMYK",
      pcs: "Lab",
      characterization: { sampledCount: 24, patchCount: 24, status: "sampled" },
    },
    standard: {
      id: "gracol2013_crpc6",
      name: "GRACoL2013 CRPC6",
      printCondition: "CGATS21-2 CRPC6",
      g7: { enabled: true },
    },
    targetName: "ISO TVI A",
  });

  assert.equal(pair.status, "warning");
  assert.ok(pair.messages.some((item) => item.includes("CRPC3") && item.includes("CRPC6")));
});

test("buildIccStandardPair treats ISO TVI standards as explicit tone targets", () => {
  const pair = buildIccStandardPair({
    iccProfile: {
      profileName: "ISOcoated_v2_300_eci",
      colorSpace: "CMYK",
      pcs: "Lab",
      characterization: { sampledCount: 24, patchCount: 24, status: "sampled" },
    },
    standard: {
      id: "iso_tvi_b",
      name: "ISO TVI Curve B",
      printCondition: "TVI target only",
      g7: { enabled: true },
    },
    targetName: "ISO TVI B",
  });

  assert.equal(pair.status, "pass");
  assert.ok(pair.messages.some((item) => item.includes("ICC 只作为 Lab 色彩参考")));
});
