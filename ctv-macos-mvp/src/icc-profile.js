const ICC_SIGNATURE = "acsp";

export function parseIccProfile(buffer, options = {}) {
  const bytes = toUint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 132) throw new Error("ICC 文件太短，缺少标准 header。");
  const declaredSize = u32(view, 0);
  if (declaredSize > bytes.byteLength) throw new Error(`ICC 文件不完整: header 声明 ${declaredSize} bytes，实际 ${bytes.byteLength} bytes。`);
  const signature = ascii(bytes, 36, 4);
  if (signature !== ICC_SIGNATURE) throw new Error("不是有效 ICC profile，缺少 acsp 签名。");

  const tags = readTagTable(bytes, view);
  const description = readTextTag(bytes, tags.get("desc")) || readMlucTag(bytes, tags.get("mluc"));
  const copyright = readTextTag(bytes, tags.get("cprt")) || "";
  const mediaWhitePoint = readXyzTag(bytes, tags.get("wtpt"));
  const version = versionText(view.getUint32(8, false));
  const deviceClass = profileClassLabel(ascii(bytes, 12, 4));
  const colorSpace = colorSpaceLabel(ascii(bytes, 16, 4));
  const pcs = colorSpaceLabel(ascii(bytes, 20, 4));
  const profileName = description || options.fileName || "Imported ICC";

  return {
    id: `icc-${fingerprint(bytes)}`,
    fileName: options.fileName || "",
    profileName,
    version,
    deviceClass,
    colorSpace,
    pcs,
    preferredCmm: ascii(bytes, 4, 4).trim() || "",
    platform: ascii(bytes, 40, 4).trim() || "",
    manufacturer: ascii(bytes, 48, 4).trim() || "",
    model: ascii(bytes, 52, 4).trim() || "",
    renderingIntent: renderingIntentLabel(view.getUint32(64, false)),
    mediaWhitePoint,
    description,
    copyright,
    tagCount: tags.size,
    tags: [...tags.keys()],
    importedAt: options.importedAt || new Date().toISOString(),
    source: "icc-metadata",
  };
}

function toUint8Array(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  throw new Error("ICC parser needs ArrayBuffer or Uint8Array input.");
}

function readTagTable(bytes, view) {
  const count = u32(view, 128);
  const tags = new Map();
  const maxEntries = Math.min(count, Math.floor((bytes.byteLength - 132) / 12));
  for (let index = 0; index < maxEntries; index += 1) {
    const base = 132 + index * 12;
    const signature = ascii(bytes, base, 4);
    const offset = u32(view, base + 4);
    const size = u32(view, base + 8);
    if (!signature.trim() || offset < 0 || size <= 0 || offset + size > bytes.byteLength) continue;
    tags.set(signature, { signature, offset, size });
  }
  return tags;
}

function readTextTag(bytes, entry) {
  if (!entry) return "";
  const type = ascii(bytes, entry.offset, 4);
  if (type === "desc") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = u32(view, entry.offset + 8);
    if (!length) return "";
    return cleanText(ascii(bytes, entry.offset + 12, Math.min(length, entry.size - 12)));
  }
  if (type === "text") {
    return cleanText(ascii(bytes, entry.offset + 8, entry.size - 8));
  }
  if (type === "mluc") return readMlucTag(bytes, entry);
  return "";
}

function readMlucTag(bytes, entry) {
  if (!entry || ascii(bytes, entry.offset, 4) !== "mluc") return "";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = u32(view, entry.offset + 8);
  const recordSize = u32(view, entry.offset + 12);
  for (let index = 0; index < count; index += 1) {
    const record = entry.offset + 16 + index * recordSize;
    const length = u32(view, record + 4);
    const offset = u32(view, record + 8);
    if (!length || offset + length > entry.size) continue;
    const textOffset = entry.offset + offset;
    const text = utf16be(bytes, textOffset, length);
    if (text) return text;
  }
  return "";
}

function readXyzTag(bytes, entry) {
  if (!entry || ascii(bytes, entry.offset, 4) !== "XYZ " || entry.size < 20) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const x = s15Fixed16(view, entry.offset + 8);
  const y = s15Fixed16(view, entry.offset + 12);
  const z = s15Fixed16(view, entry.offset + 16);
  return xyzToLab({ x, y, z });
}

function xyzToLab({ x, y, z }) {
  const white = { x: 0.96422, y: 1, z: 0.82521 };
  const f = (value) => value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + 16 / 116;
  const fx = f(x / white.x);
  const fy = f(y / white.y);
  const fz = f(z / white.z);
  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function u32(view, offset) {
  return view.getUint32(offset, false);
}

function s15Fixed16(view, offset) {
  return view.getInt32(offset, false) / 65536;
}

function ascii(bytes, offset, length) {
  let text = "";
  for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[offset + index]);
  }
  return text;
}

function utf16be(bytes, offset, length) {
  let text = "";
  for (let index = 0; index + 1 < length && offset + index + 1 < bytes.length; index += 2) {
    const code = (bytes[offset + index] << 8) | bytes[offset + index + 1];
    if (code) text += String.fromCharCode(code);
  }
  return cleanText(text);
}

function cleanText(text) {
  return String(text || "").replace(/\0/g, "").trim();
}

function versionText(raw) {
  const major = (raw >> 24) & 0xff;
  const minor = (raw >> 20) & 0x0f;
  const bugfix = (raw >> 16) & 0x0f;
  return `${major}.${minor}.${bugfix}`;
}

function profileClassLabel(signature) {
  const map = {
    scnr: "input",
    mntr: "display",
    prtr: "output",
    link: "devicelink",
    spac: "colorspace",
    abst: "abstract",
    nmcl: "named-color",
  };
  return map[signature] || "unknown";
}

function colorSpaceLabel(signature) {
  const clean = signature.trim();
  const map = {
    CMYK: "CMYK",
    RGB: "RGB",
    GRAY: "Gray",
    Lab: "Lab",
    XYZ: "XYZ",
  };
  return map[clean] || clean || "unknown";
}

function renderingIntentLabel(value) {
  return ["perceptual", "relative", "saturation", "absolute"][value] || `unknown-${value}`;
}

function fingerprint(bytes) {
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += Math.max(1, Math.floor(bytes.length / 128))) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  hash ^= bytes.length;
  return (hash >>> 0).toString(16).padStart(8, "0");
}
