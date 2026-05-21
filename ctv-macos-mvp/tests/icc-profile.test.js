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
  assert.equal(profile.tagCount, 4);
  assert.ok(profile.tags.includes("desc"));
  assert.equal(profile.characterization.status, "sampled");
  assert.equal(profile.characterization.sourceTag, "A2B1");
  assert.equal(profile.characterization.transformType, "mft2");
  assert.ok(profile.characterization.sampledCount >= 20);
  const c50 = profile.characterization.rows.find((row) => row.name === "C50");
  assert.ok(c50?.lab);
  assert.equal(c50.source, "ICC sampled reference");
  assert.ok(c50.lab.l < 100);
});

test("parseIccProfile rejects non ICC data", () => {
  assert.throws(() => parseIccProfile(new Uint8Array(160)), /acsp|ICC/i);
});

function mockIccProfile() {
  const desc = textTag("desc", "Mock Press Profile");
  const cprt = textTag("text", "Demo copyright");
  const wtpt = xyzTag(0.96422, 1, 0.82521);
  const a2b1 = mft2CmykToLabTag();
  const tags = [
    ["desc", desc],
    ["cprt", cprt],
    ["wtpt", wtpt],
    ["A2B1", a2b1],
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

function mft2CmykToLabTag() {
  const inputChannels = 4;
  const outputChannels = 3;
  const gridPoints = 2;
  const inputEntries = 2;
  const outputEntries = 2;
  const clutEntries = (gridPoints ** inputChannels) * outputChannels;
  const size = 52
    + inputChannels * inputEntries * 2
    + clutEntries * 2
    + outputChannels * outputEntries * 2;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "mft2");
  bytes[8] = inputChannels;
  bytes[9] = outputChannels;
  bytes[10] = gridPoints;
  writeU32(view, 12, 0x00010000);
  writeU32(view, 28, 0x00010000);
  writeU32(view, 44, 0x00010000);
  view.setUint16(48, inputEntries, false);
  view.setUint16(50, outputEntries, false);
  let cursor = 52;
  for (let channel = 0; channel < inputChannels; channel += 1) {
    writeU16(view, cursor, 0);
    writeU16(view, cursor + 2, 65535);
    cursor += 4;
  }
  for (let c = 0; c < gridPoints; c += 1) {
    for (let m = 0; m < gridPoints; m += 1) {
      for (let y = 0; y < gridPoints; y += 1) {
        for (let k = 0; k < gridPoints; k += 1) {
          const lab = {
            l: Math.max(5, 100 - c * 18 - m * 18 - y * 14 - k * 45),
            a: -55 * c + 70 * m - 4 * y,
            b: -45 * c - 8 * m + 82 * y + 4 * k,
          };
          for (const value of encodeLab16(lab)) {
            writeU16(view, cursor, value);
            cursor += 2;
          }
        }
      }
    }
  }
  for (let channel = 0; channel < outputChannels; channel += 1) {
    writeU16(view, cursor, 0);
    writeU16(view, cursor + 2, 65535);
    cursor += 4;
  }
  return bytes;
}

function encodeLab16(lab) {
  return [
    Math.round(Math.max(0, Math.min(100, lab.l)) / 100 * 65535),
    Math.round(Math.max(0, Math.min(1, (lab.a + 128) / 255)) * 65535),
    Math.round(Math.max(0, Math.min(1, (lab.b + 128) / 255)) * 65535),
  ];
}

function writeAscii(bytes, offset, text) {
  for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value, false);
}

function writeU16(view, offset, value) {
  view.setUint16(offset, value, false);
}

function writeS15(view, offset, value) {
  view.setInt32(offset, Math.round(value * 65536), false);
}
