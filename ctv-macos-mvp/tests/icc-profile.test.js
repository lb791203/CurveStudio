import assert from "node:assert/strict";
import test from "node:test";

import { parseIccProfile } from "../src/icc-profile.js";

test("parseIccProfile reads ICC header, description, copyright and media white", () => {
  const profile = parseIccProfile(mockIccProfile(), { fileName: "Mock CMYK.icc", importedAt: "2026-05-21T00:00:00.000Z" });

  assert.equal(profile.fileName, "Mock CMYK.icc");
  assert.equal(profile.profileName, "Mock Press Profile");
  assert.equal(profile.version, "4.3.0");
  assert.equal(profile.deviceClass, "output");
  assert.equal(profile.colorSpace, "CMYK");
  assert.equal(profile.pcs, "Lab");
  assert.equal(profile.renderingIntent, "relative");
  assert.equal(profile.copyright, "Demo copyright");
  assert.ok(profile.mediaWhitePoint);
  assert.ok(Number.isFinite(profile.mediaWhitePoint.l));
  assert.equal(profile.tagCount, 3);
  assert.ok(profile.tags.includes("desc"));
});

test("parseIccProfile rejects non ICC data", () => {
  assert.throws(() => parseIccProfile(new Uint8Array(160)), /acsp|ICC/i);
});

function mockIccProfile() {
  const desc = textTag("desc", "Mock Press Profile");
  const cprt = textTag("text", "Demo copyright");
  const wtpt = xyzTag(0.96422, 1, 0.82521);
  const tags = [
    ["desc", desc],
    ["cprt", cprt],
    ["wtpt", wtpt],
  ];
  const headerSize = 132 + tags.length * 12;
  const totalSize = headerSize + tags.reduce((sum, [, data]) => sum + data.length, 0);
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  writeU32(view, 0, totalSize);
  writeAscii(bytes, 4, "lcms");
  writeU32(view, 8, 0x04300000);
  writeAscii(bytes, 12, "prtr");
  writeAscii(bytes, 16, "CMYK");
  writeAscii(bytes, 20, "Lab ");
  writeAscii(bytes, 36, "acsp");
  writeAscii(bytes, 40, "APPL");
  writeAscii(bytes, 48, "DEMO");
  writeAscii(bytes, 52, "TEST");
  writeU32(view, 64, 1);
  writeU32(view, 128, tags.length);

  let offset = headerSize;
  tags.forEach(([signature, data], index) => {
    const base = 132 + index * 12;
    writeAscii(bytes, base, signature);
    writeU32(view, base + 4, offset);
    writeU32(view, base + 8, data.length);
    bytes.set(data, offset);
    offset += data.length;
  });
  return bytes;
}

function textTag(type, text) {
  const encoded = new TextEncoder().encode(`${text}\0`);
  const size = type === "desc" ? 12 + encoded.length : 8 + encoded.length;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, type);
  if (type === "desc") {
    writeU32(view, 8, encoded.length);
    bytes.set(encoded, 12);
  } else {
    bytes.set(encoded, 8);
  }
  return bytes;
}

function xyzTag(x, y, z) {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "XYZ ");
  writeS15(view, 8, x);
  writeS15(view, 12, y);
  writeS15(view, 16, z);
  return bytes;
}

function writeAscii(bytes, offset, text) {
  for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value, false);
}

function writeS15(view, offset, value) {
  view.setInt32(offset, Math.round(value * 65536), false);
}
