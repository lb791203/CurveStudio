import assert from "node:assert/strict";
import test from "node:test";

import {
  canCalculateCurve,
  defaultManualRow,
  deleteManualRowFromEvent,
  enrichManualColorimetricRow,
  enrichManualDensityRow,
  labReferenceByChannel,
  manualHealth,
  manualTemplateRows,
  normalizeManualRow,
  parseManualPaste,
  renderManualTable,
  solidDensityByChannel,
  updateManualRowFromEvent,
} from "../src/manual-table.js";

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

test("manual table templates create the expected production measurement sets", () => {
  assert.equal(manualTemplateRows("field").length, 5);
  assert.equal(manualTemplateRows("2575").length, 12);
  assert.equal(manualTemplateRows("full").length, 52);
  assert.equal(manualTemplateRows("g7").length, 7);
  assert.deepEqual(manualTemplateRows("unknown"), []);
});

test("manual table event helpers update and delete the selected UI row", () => {
  const rows = [defaultManualRow(), defaultManualRow({ channel: "M" })];
  assert.equal(updateManualRowFromEvent(rows, {
    target: { dataset: { manualIndex: "1", manualField: "measuredTone" }, value: "71.5" },
  }), true);
  assert.equal(rows[1].measuredTone, "71.5");
  assert.equal(updateManualRowFromEvent(rows, { target: { dataset: {}, value: "ignored" } }), false);

  assert.equal(deleteManualRowFromEvent(rows, {
    target: { dataset: { deleteManualIndex: "0" } },
  }), true);
  assert.deepEqual(rows.map((row) => row.channel), ["M"]);
  assert.equal(deleteManualRowFromEvent(rows, { target: { dataset: {} } }), false);
});

test("manual density and Lab rows become calculable only with their references", () => {
  const normalized = [
    defaultManualRow({ patchType: "paper", channel: "Paper", tone: "", density: "0.05", labL: "96", labA: "0", labB: "-2" }),
    defaultManualRow({ patchType: "solid", channel: "C", tone: "100", density: "1.45", labL: "54", labA: "-35", labB: "-48" }),
    defaultManualRow({ patchType: "tone", channel: "C", tone: "50", density: "0.62", labL: "75", labA: "-18", labB: "-25" }),
  ].map(normalizeManualRow);

  const densityRow = enrichManualDensityRow(normalized[2], solidDensityByChannel(normalized), normalized[0].density);
  const ctvRow = enrichManualColorimetricRow(normalized[2], labReferenceByChannel(normalized));

  assert.equal(densityRow.measuredToneMethod, "murray_davies_density");
  assert.ok(Number.isFinite(densityRow.measuredTone));
  assert.equal(ctvRow.colorimetricMethod, "iso_20654_lab");
  assert.ok(Number.isFinite(ctvRow.colorimetricTone));
  assert.equal(canCalculateCurve(densityRow), true);
  assert.equal(canCalculateCurve(ctvRow), true);
});

test("manual health distinguishes incomplete entry from a complete field workflow", () => {
  assert.equal(manualHealth([defaultManualRow()]).ready, false);

  const complete = [
    defaultManualRow({ patchType: "paper", channel: "Paper", tone: "", labL: 96, labA: 0, labB: -2 }),
    ...["C", "M", "Y", "K"].flatMap((channel) => [
      defaultManualRow({ patchType: "solid", channel, tone: 100, density: 1.4, labL: 55, labA: 0, labB: 0 }),
      defaultManualRow({ patchType: "tone", channel, tone: 50, measuredTone: 70 }),
    ]),
    defaultManualRow({ patchType: "gray", channel: "Gray", tone: 50, labL: 60, labA: 0, labB: 0 }),
  ];
  const health = manualHealth(complete);

  assert.equal(health.ready, true);
  assert.deepEqual(health.messages, ["纸白、实地、阶调和灰平衡数据结构完整。"]);
});

test("manual table rendering escapes user-entered attribute content", () => {
  const tbody = { innerHTML: "" };
  renderManualTable(tbody, [defaultManualRow({ note: "\" onfocus=\"alert(1)<" })]);

  assert.match(tbody.innerHTML, /&quot; onfocus=&quot;alert\(1\)&lt;/);
  assert.doesNotMatch(tbody.innerHTML, /value="" onfocus=/);
});
