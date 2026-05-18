import assert from "node:assert/strict";
import test from "node:test";

import { parseManualPaste } from "../src/manual-table.js";

test("parseManualPaste maps Chinese Excel/WPS headers", () => {
  const rows = parseManualPaste("类型\t通道\t输入网点\t实测网点\t密度\tL*\ta*\tb*\t来源\t备注\ntone\tC\t50\t72\t\t90\t-2\t-8\tPaste\t客户现场");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].patchType, "tone");
  assert.equal(rows[0].channel, "C");
  assert.equal(rows[0].tone, "50");
  assert.equal(rows[0].measuredTone, "72");
  assert.equal(rows[0].labL, "90");
  assert.equal(rows[0].note, "客户现场");
});
