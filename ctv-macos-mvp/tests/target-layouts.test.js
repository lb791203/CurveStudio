import assert from "node:assert/strict";
import test from "node:test";

import { buildPatchLayout } from "../src/target-layouts.js";

function patch(name, index = 0) {
  return {
    row: { sample_name: name },
    cmyk: { c: index % 100, m: 0, y: 0, k: 0 },
  };
}

test("buildPatchLayout recognizes P2P51 as 12 by 25 coordinate guide", () => {
  const patches = [];
  for (let row = 0; row < 25; row += 1) {
    const rowName = String.fromCharCode(65 + row);
    for (let column = 1; column <= 12; column += 1) {
      patches.push(patch(`${rowName}${column}`, patches.length));
    }
  }

  const layout = buildPatchLayout(patches);

  assert.equal(layout.profileId, "p2p51");
  assert.equal(layout.mode, "target-coordinate");
  assert.equal(layout.columns, 12);
  assert.equal(layout.rows, 25);
  assert.equal(layout.cells.length, 300);
  assert.match(layout.caption, /300 个色块 \/ 12 列 x 25 行/);
});

test("buildPatchLayout keeps TC1617 coordinate section and appends non-coordinate patches", () => {
  const patches = [];
  for (let row = 0; row < 26; row += 1) {
    const rowName = String.fromCharCode(65 + row);
    for (let column = 1; column <= 49; column += 1) {
      patches.push(patch(`${rowName}${column}`, patches.length));
    }
  }
  for (let index = 0; index < 343; index += 1) {
    patches.push(patch(String(index + 1), patches.length));
  }

  const layout = buildPatchLayout(patches);

  assert.equal(layout.profileId, "tc1617");
  assert.equal(layout.mode, "target-coordinate");
  assert.equal(layout.columns, 49);
  assert.equal(layout.cells.length, 1617);
  assert.match(layout.caption, /1274|追加/);
  assert.match(layout.caption, /343 个追加色块/);
});

test("buildPatchLayout falls back to FOGRA39 45 by 33 file-order guide", () => {
  const patches = Array.from({ length: 1485 }, (_, index) => patch(String(index + 1), index));

  const layout = buildPatchLayout(patches);

  assert.equal(layout.profileId, "fogra39");
  assert.equal(layout.mode, "file-order");
  assert.equal(layout.columns, 45);
  assert.equal(layout.rows, 33);
  assert.equal(layout.cells.length, 1485);
  assert.match(layout.note, /45 x 33/);
});

test("buildPatchLayout does not merge duplicated coordinate names", () => {
  const patches = [];
  for (let repeat = 0; repeat < 2; repeat += 1) {
    for (let row = 0; row < 26; row += 1) {
      const rowName = String.fromCharCode(65 + row);
      for (let column = 1; column <= 26; column += 1) {
        patches.push(patch(`${rowName}${column}`, patches.length));
      }
    }
  }
  while (patches.length < 1617) patches.push(patch(String(patches.length + 1), patches.length));

  const layout = buildPatchLayout(patches);

  assert.equal(layout.profileId, "it874");
  assert.equal(layout.mode, "file-order");
  assert.equal(layout.columns, 49);
  assert.equal(layout.cells.length, 1617);
  assert.match(layout.note, /重复坐标名/);
});
