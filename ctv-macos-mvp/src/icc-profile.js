const ICC_SIGNATURE = "acsp";
const ICC_PREVIEW_PATCHES = [
  { name: "Paper", group: "paper", cmyk: { c: 0, m: 0, y: 0, k: 0 } },
  { name: "C solid", group: "solid", cmyk: { c: 100, m: 0, y: 0, k: 0 } },
  { name: "M solid", group: "solid", cmyk: { c: 0, m: 100, y: 0, k: 0 } },
  { name: "Y solid", group: "solid", cmyk: { c: 0, m: 0, y: 100, k: 0 } },
  { name: "K solid", group: "solid", cmyk: { c: 0, m: 0, y: 0, k: 100 } },
  { name: "CM", group: "overprint", cmyk: { c: 100, m: 100, y: 0, k: 0 } },
  { name: "CY", group: "overprint", cmyk: { c: 100, m: 0, y: 100, k: 0 } },
  { name: "MY", group: "overprint", cmyk: { c: 0, m: 100, y: 100, k: 0 } },
  { name: "CMY", group: "overprint", cmyk: { c: 100, m: 100, y: 100, k: 0 } },
  ...["C", "M", "Y", "K"].flatMap((channel) => [25, 50, 75].map((tone) => ({
    name: `${channel}${tone}`,
    group: "single-channel-ramp",
    cmyk: {
      c: channel === "C" ? tone : 0,
      m: channel === "M" ? tone : 0,
      y: channel === "Y" ? tone : 0,
      k: channel === "K" ? tone : 0,
    },
  }))),
  { name: "CMY25", group: "neutral-candidate", cmyk: { c: 25, m: 25, y: 25, k: 0 } },
  { name: "CMY50", group: "neutral-candidate", cmyk: { c: 50, m: 50, y: 50, k: 0 } },
  { name: "CMY75", group: "neutral-candidate", cmyk: { c: 75, m: 75, y: 75, k: 0 } },
];

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
  const tagDetails = [...tags.values()].map((entry) => ({
    signature: entry.signature,
    type: entry.type,
    size: entry.size,
  }));
  const characterization = buildCharacterizationPreview(bytes, tags, {
    colorSpace,
    pcs,
    version,
    renderingIntent: renderingIntentLabel(view.getUint32(64, false)),
  });

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
    tagDetails,
    characterization,
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
    tags.set(signature, { signature, offset, size, type: ascii(bytes, offset, 4) });
  }
  return tags;
}

function buildCharacterizationPreview(bytes, tags, context) {
  const capabilities = {
    a2b: ["A2B0", "A2B1", "A2B2"].filter((key) => tags.has(key)).map((key) => tagCapability(key, tags.get(key))),
    b2a: ["B2A0", "B2A1", "B2A2"].filter((key) => tags.has(key)).map((key) => tagCapability(key, tags.get(key))),
    hasChromaticAdaptation: tags.has("chad"),
    hasMediaWhite: tags.has("wtpt"),
    hasMediaBlack: tags.has("bkpt"),
    hasGamut: tags.has("gamt"),
  };
  const emptyRows = ICC_PREVIEW_PATCHES.map((patch) => ({
    ...patch,
    lab: undefined,
    source: "ICC preview patch plan",
  }));
  if (context.colorSpace !== "CMYK") {
    return {
      status: "unsupported",
      reason: `当前仅采样 CMYK 输出 ICC；此 profile 是 ${context.colorSpace}。`,
      capabilities,
      rows: emptyRows,
      sampledCount: 0,
      patchCount: emptyRows.length,
    };
  }
  if (context.pcs !== "Lab") {
    return {
      status: "unsupported",
      reason: `当前 MVP 仅可靠解码 PCS Lab；此 profile PCS 是 ${context.pcs}。`,
      capabilities,
      rows: emptyRows,
      sampledCount: 0,
      patchCount: emptyRows.length,
    };
  }
  const selected = selectA2BTag(tags, context.renderingIntent);
  if (!selected) {
    return {
      status: "unsupported",
      reason: "未找到 A2B0/A2B1/A2B2 转换表，无法从 ICC 采样 CMYK -> Lab。",
      capabilities,
      rows: emptyRows,
      sampledCount: 0,
      patchCount: emptyRows.length,
    };
  }
  const transform = parseLutTransform(bytes, selected.entry, context);
  if (!transform) {
    return {
      status: "unsupported",
      reason: `${selected.signature} 是 ${selected.entry.type || "unknown"}，当前 Web MVP 只支持 ICC v2 mft1/mft2 LUT；复杂 mAB/mBA 后续接 LittleCMS。`,
      capabilities,
      sourceTag: selected.signature,
      transformType: selected.entry.type,
      rows: emptyRows,
      sampledCount: 0,
      patchCount: emptyRows.length,
    };
  }
  const rows = ICC_PREVIEW_PATCHES.map((patch) => ({
    ...patch,
    lab: transform.sample(patch.cmyk),
    source: "ICC sampled reference",
  }));
  return {
    status: "sampled",
    reason: `已用 ${selected.signature} / ${transform.type} 采样 ${rows.length} 个参考色块。`,
    capabilities,
    sourceTag: selected.signature,
    transformType: transform.type,
    rows,
    sampledCount: rows.filter((row) => row.lab).length,
    patchCount: rows.length,
  };
}

function tagCapability(signature, entry) {
  return `${signature}:${entry?.type || "unknown"}`;
}

function selectA2BTag(tags, renderingIntent) {
  const preferred = renderingIntent === "relative"
    ? ["A2B1", "A2B0", "A2B2"]
    : renderingIntent === "saturation"
      ? ["A2B2", "A2B1", "A2B0"]
      : ["A2B0", "A2B1", "A2B2"];
  const signature = preferred.find((key) => tags.has(key));
  return signature ? { signature, entry: tags.get(signature) } : null;
}

function parseLutTransform(bytes, entry, context) {
  if (!entry) return null;
  const type = ascii(bytes, entry.offset, 4);
  if (type === "mft2") return parseMft2(bytes, entry, context);
  if (type === "mft1") return parseMft1(bytes, entry, context);
  return null;
}

function parseMft2(bytes, entry, context) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = entry.offset;
  const inputChannels = bytes[base + 8];
  const outputChannels = bytes[base + 9];
  const gridPoints = bytes[base + 10];
  if (inputChannels !== 4 || outputChannels < 3 || gridPoints < 2 || entry.size < 52) return null;
  const inputEntries = view.getUint16(base + 48, false);
  const outputEntries = view.getUint16(base + 50, false);
  let cursor = base + 52;
  const inputTables = readNormalizedTables16(view, cursor, inputChannels, inputEntries);
  cursor += inputChannels * inputEntries * 2;
  const clutLength = (gridPoints ** inputChannels) * outputChannels;
  const clut = readNormalizedArray16(view, cursor, clutLength);
  cursor += clutLength * 2;
  const outputTables = readNormalizedTables16(view, cursor, outputChannels, outputEntries);
  return {
    type: "mft2",
    sample: (cmyk) => sampleLut({
      cmyk,
      context,
      inputTables,
      outputTables,
      clut,
      inputChannels,
      outputChannels,
      gridPoints,
      valueDepth: 16,
    }),
  };
}

function parseMft1(bytes, entry, context) {
  const base = entry.offset;
  const inputChannels = bytes[base + 8];
  const outputChannels = bytes[base + 9];
  const gridPoints = bytes[base + 10];
  if (inputChannels !== 4 || outputChannels < 3 || gridPoints < 2 || entry.size < 48) return null;
  let cursor = base + 48;
  const inputEntries = 256;
  const outputEntries = 256;
  const inputTables = readNormalizedTables8(bytes, cursor, inputChannels, inputEntries);
  cursor += inputChannels * inputEntries;
  const clutLength = (gridPoints ** inputChannels) * outputChannels;
  const clut = readNormalizedArray8(bytes, cursor, clutLength);
  cursor += clutLength;
  const outputTables = readNormalizedTables8(bytes, cursor, outputChannels, outputEntries);
  return {
    type: "mft1",
    sample: (cmyk) => sampleLut({
      cmyk,
      context,
      inputTables,
      outputTables,
      clut,
      inputChannels,
      outputChannels,
      gridPoints,
      valueDepth: 8,
    }),
  };
}

function readNormalizedTables16(view, cursor, tableCount, entryCount) {
  return Array.from({ length: tableCount }, (_, tableIndex) =>
    readNormalizedArray16(view, cursor + tableIndex * entryCount * 2, entryCount));
}

function readNormalizedArray16(view, cursor, entryCount) {
  return Array.from({ length: entryCount }, (_, index) => view.getUint16(cursor + index * 2, false) / 65535);
}

function readNormalizedTables8(bytes, cursor, tableCount, entryCount) {
  return Array.from({ length: tableCount }, (_, tableIndex) =>
    readNormalizedArray8(bytes, cursor + tableIndex * entryCount, entryCount));
}

function readNormalizedArray8(bytes, cursor, entryCount) {
  return Array.from({ length: entryCount }, (_, index) => (bytes[cursor + index] || 0) / 255);
}

function sampleLut({ cmyk, context, inputTables, outputTables, clut, inputChannels, outputChannels, gridPoints, valueDepth }) {
  const input = [cmyk.c, cmyk.m, cmyk.y, cmyk.k].map((value, index) =>
    lookup1d(inputTables[index], Math.max(0, Math.min(100, value || 0)) / 100));
  const clutValue = interpolateClut(input, clut, inputChannels, outputChannels, gridPoints);
  const output = clutValue.map((value, index) => lookup1d(outputTables[index], value));
  return decodePcsLab(output, context.version, valueDepth);
}

function lookup1d(table, value) {
  if (!table?.length) return value;
  if (table.length === 1) return table[0];
  const position = Math.max(0, Math.min(1, value)) * (table.length - 1);
  const low = Math.floor(position);
  const high = Math.min(table.length - 1, low + 1);
  const frac = position - low;
  return table[low] + (table[high] - table[low]) * frac;
}

function interpolateClut(input, clut, inputChannels, outputChannels, gridPoints) {
  const positions = input.map((value) => {
    const position = Math.max(0, Math.min(1, value)) * (gridPoints - 1);
    const low = Math.floor(position);
    const high = Math.min(gridPoints - 1, low + 1);
    return { low, high, frac: position - low };
  });
  const output = Array.from({ length: outputChannels }, () => 0);
  const corners = 1 << inputChannels;
  for (let corner = 0; corner < corners; corner += 1) {
    let weight = 1;
    let index = 0;
    for (let channel = 0; channel < inputChannels; channel += 1) {
      const useHigh = Boolean(corner & (1 << channel));
      const point = positions[channel];
      const gridIndex = useHigh ? point.high : point.low;
      weight *= useHigh ? point.frac : 1 - point.frac;
      index = index * gridPoints + gridIndex;
    }
    const base = index * outputChannels;
    for (let out = 0; out < outputChannels; out += 1) {
      output[out] += (clut[base + out] || 0) * weight;
    }
  }
  return output;
}

function decodePcsLab(values, version, valueDepth) {
  const v4 = Number(String(version).split(".")[0]) >= 4;
  if (valueDepth === 8) {
    return {
      l: clamp(values[0] * 100, 0, 100),
      a: clamp(values[1] * 255 - 128, -128, 127),
      b: clamp(values[2] * 255 - 128, -128, 127),
    };
  }
  const lScale = v4 ? 100 : 100 * 65535 / 65280;
  return {
    l: clamp(values[0] * lScale, 0, 100),
    a: clamp(values[1] * 255 - 128, -128, 127),
    b: clamp(values[2] * 255 - 128, -128, 127),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
