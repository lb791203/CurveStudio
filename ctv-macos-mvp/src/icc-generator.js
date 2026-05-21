import { cmykFromRow, labFromRow, cmykFromManualRow } from "./standards.js";

export function rowCmyk(row) {
  if (row?.cmyk && typeof row.cmyk === "object") {
    const c = Number(row.cmyk.c ?? row.cmyk.C);
    const m = Number(row.cmyk.m ?? row.cmyk.M);
    const y = Number(row.cmyk.y ?? row.cmyk.Y);
    const k = Number(row.cmyk.k ?? row.cmyk.K);
    if (Number.isFinite(c) && Number.isFinite(m) && Number.isFinite(y) && Number.isFinite(k)) {
      return { c, m, y, k };
    }
  }
  return cmykFromRow(row) || cmykFromManualRow(row);
}

export function rowLab(row) {
  if (row?.lab && typeof row.lab === "object") {
    const l = Number(row.lab.l ?? row.lab.L);
    const a = Number(row.lab.a ?? row.lab.A);
    const b = Number(row.lab.b ?? row.lab.B);
    if (Number.isFinite(l) && Number.isFinite(a) && Number.isFinite(b)) {
      return { l, a, b };
    }
  }
  const l = Number(row?.labL ?? row?.lab_l ?? row?.l);
  const a = Number(row?.labA ?? row?.lab_a ?? row?.a);
  const b = Number(row?.labB ?? row?.lab_b ?? row?.b);
  if (Number.isFinite(l) && Number.isFinite(a) && Number.isFinite(b)) {
    return { l, a, b };
  }
  return labFromRow(row);
}

// Helper to extract unique measurements from a run
export function getScatteredPoints(run) {
  const archive = run?.archive || run || {};
  const rows = [
    ...(archive.importInfo?.rawRows || []),
    ...(archive.labVerification || []),
    ...(archive.measurements || []),
    ...(archive.labRows || []),
    ...(archive.manualRows || []),
  ];
  const list = [];
  const seen = new Set();
  for (const row of rows) {
    const cmyk = rowCmyk(row);
    const lab = rowLab(row);
    if (!cmyk || !lab) continue;
    const key = `${cmyk.c.toFixed(2)}/${cmyk.m.toFixed(2)}/${cmyk.y.toFixed(2)}/${cmyk.k.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ cmyk, lab });
  }
  return list;
}

// 4D Inverse Distance Weighting interpolation
export function interpolateLabIDW(cmyk, scattered, power = 2) {
  let totalWeight = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;

  for (const pt of scattered) {
    const dC = cmyk.c - pt.cmyk.c;
    const dM = cmyk.m - pt.cmyk.m;
    const dY = cmyk.y - pt.cmyk.y;
    const dK = cmyk.k - pt.cmyk.k;
    const distSq = dC * dC + dM * dM + dY * dY + dK * dK;
    if (distSq < 0.0001) {
      return pt.lab;
    }
    const weight = 1 / Math.pow(distSq, power / 2);
    totalWeight += weight;
    sumL += pt.lab.l * weight;
    sumA += pt.lab.a * weight;
    sumB += pt.lab.b * weight;
  }

  if (totalWeight === 0) {
    return { l: 0, a: 0, b: 0 };
  }
  return {
    l: sumL / totalWeight,
    a: sumA / totalWeight,
    b: sumB / totalWeight,
  };
}

// Lab to XYZ under D50 white point
export function labToXyz(lab) {
  const white = { x: 0.96422, y: 1.0, z: 0.82521 };
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;

  const yr = fy > 0.206897 ? Math.pow(fy, 3) : (fy - 16 / 116) / 7.787;
  const xr = fx > 0.206897 ? Math.pow(fx, 3) : (fx - 16 / 116) / 7.787;
  const zr = fz > 0.206897 ? Math.pow(fz, 3) : (fz - 16 / 116) / 7.787;

  return {
    x: xr * white.x,
    y: yr * white.y,
    z: zr * white.z,
  };
}

// Generates a valid v2 printer ICC profile as an ArrayBuffer
export function generateIccProfile(run, options = {}) {
  const scattered = getScatteredPoints(run);
  if (scattered.length === 0) {
    throw new Error("No measurements found to generate ICC profile.");
  }

  // Find media white point
  const paperPt = scattered.find(pt => pt.cmyk.c === 0 && pt.cmyk.m === 0 && pt.cmyk.y === 0 && pt.cmyk.k === 0);
  const paperLab = paperPt ? paperPt.lab : { l: 95, a: 0, b: -2 };

  // Profile binary layout
  const profileSize = 21844;
  const buffer = new ArrayBuffer(profileSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // 1. Write Header (128 bytes)
  view.setUint32(0, profileSize, false); // Profile size
  view.setUint32(4, 0x6170706c, false); // Preferred CMM: 'appl'
  view.setUint32(8, 0x02100000, false); // Version: 2.1.0
  view.setUint32(12, 0x70727472, false); // Class: 'prtr' (printer)
  view.setUint32(16, 0x434d594b, false); // Color Space: 'CMYK'
  view.setUint32(20, 0x4c616220, false); // PCS: 'Lab '

  // Date/Time
  const now = new Date();
  view.setUint16(24, now.getFullYear(), false);
  view.setUint16(26, now.getMonth() + 1, false);
  view.setUint16(28, now.getDate(), false);
  view.setUint16(30, now.getHours(), false);
  view.setUint16(32, now.getMinutes(), false);
  view.setUint16(34, now.getSeconds(), false);

  view.setUint32(36, 0x61637370, false); // Signature: 'acsp'
  view.setUint32(40, 0, false); // Platform: 0
  view.setUint32(44, 0, false); // Flags: 0
  view.setUint32(48, 0, false); // Manufacturer: 0
  view.setUint32(52, 0, false); // Model: 0
  view.setUint32(56, 0, false); // Device Attributes (low 4 bytes)
  view.setUint32(60, 0, false); // Device Attributes (high 4 bytes)
  view.setUint32(64, 0, false); // Rendering Intent: Perceptual

  // D50 XYZ PCS Illuminant
  view.setUint32(68, 0x0000f6d6, false); // X: 0.9642
  view.setUint32(72, 0x00010000, false); // Y: 1.0
  view.setUint32(76, 0x0000d32d, false); // Z: 0.8249

  view.setUint32(80, 0x464d2020, false); // Creator: 'FM  '

  // 2. Tag Table (starts at 128)
  view.setUint32(128, 6, false); // 6 tags

  // desc tag (offset 204, size 36)
  view.setUint32(132, 0x64657363, false);
  view.setUint32(136, 204, false);
  view.setUint32(140, 36, false);

  // cprt tag (offset 240, size 60)
  view.setUint32(144, 0x63707274, false);
  view.setUint32(148, 240, false);
  view.setUint32(152, 60, false);

  // wtpt tag (offset 300, size 20)
  view.setUint32(156, 0x77747074, false);
  view.setUint32(160, 300, false);
  view.setUint32(164, 20, false);

  // A2B0 tag (offset 320, size 21524)
  view.setUint32(168, 0x41324230, false);
  view.setUint32(172, 320, false);
  view.setUint32(176, 21524, false);

  // A2B1 tag (offset 320, size 21524) (reuses A2B0 data offset)
  view.setUint32(180, 0x41324231, false);
  view.setUint32(184, 320, false);
  view.setUint32(188, 21524, false);

  // A2B2 tag (offset 320, size 21524) (reuses A2B0 data offset)
  view.setUint32(192, 0x41324232, false);
  view.setUint32(196, 320, false);
  view.setUint32(200, 21524, false);

  // 3. Tag Data Payloads
  // desc tag data (offset 204)
  view.setUint32(204, 0x64657363, false); // type: 'desc'
  view.setUint32(208, 0, false);
  view.setUint32(212, 23, false); // string length including null
  const descStr = "CTV-Experimental-Draft";
  for (let i = 0; i < descStr.length; i++) {
    bytes[216 + i] = descStr.charCodeAt(i);
  }
  bytes[216 + descStr.length] = 0; // null terminator

  // cprt tag data (offset 240)
  view.setUint32(240, 0x74657874, false); // type: 'text'
  view.setUint32(244, 0, false);
  const cprtStr = "Copyright (C) 2026 FM PRINT. All rights reserved.";
  for (let i = 0; i < cprtStr.length; i++) {
    bytes[248 + i] = cprtStr.charCodeAt(i);
  }
  bytes[248 + cprtStr.length] = 0;

  // wtpt tag data (offset 300)
  view.setUint32(300, 0x58595a20, false); // type: 'XYZ '
  view.setUint32(304, 0, false);
  const paperXyz = labToXyz(paperLab);
  view.setInt32(308, Math.round(paperXyz.x * 65536), false);
  view.setInt32(312, Math.round(paperXyz.y * 65536), false);
  view.setInt32(316, Math.round(paperXyz.z * 65536), false);

  // A2B0/A2B1/A2B2 tag data (offset 320)
  view.setUint32(320, 0x6d667431, false); // type: 'mft1'
  view.setUint32(324, 0, false);
  bytes[328] = 4; // Input channels: 4 (CMYK)
  bytes[329] = 3; // Output channels: 3 (PCS Lab)
  bytes[330] = 9; // Grid points: 9 (9^4 = 6561)
  bytes[331] = 0; // reserved

  // Matrix: Identity
  view.setInt32(332, 65536, false); // 1.0
  view.setInt32(336, 0, false);
  view.setInt32(340, 0, false);
  view.setInt32(344, 0, false);
  view.setInt32(348, 65536, false); // 1.0
  view.setInt32(352, 0, false);
  view.setInt32(356, 0, false);
  view.setInt32(360, 0, false);
  view.setInt32(364, 65536, false); // 1.0

  // Input Tables: 4 tables, 256 entries each, identity mapping (368 to 1391)
  let tableOffset = 368;
  for (let ch = 0; ch < 4; ch++) {
    for (let val = 0; val < 256; val++) {
      bytes[tableOffset++] = val;
    }
  }

  // CLUT: 6561 nodes, 3 bytes each (1392 to 21074)
  const g = 9;
  let clutOffset = 1392;
  for (let c = 0; c < g; c++) {
    for (let m = 0; m < g; m++) {
      for (let y = 0; y < g; y++) {
        for (let k = 0; k < g; k++) {
          const cVal = (c / (g - 1)) * 100;
          const mVal = (m / (g - 1)) * 100;
          const yVal = (y / (g - 1)) * 100;
          const kVal = (k / (g - 1)) * 100;

          const lab = interpolateLabIDW({ c: cVal, m: mVal, y: yVal, k: kVal }, scattered);

          const lByte = Math.max(0, Math.min(255, Math.round(lab.l * 2.55)));
          const aByte = Math.max(0, Math.min(255, Math.round(lab.a + 128)));
          const bByte = Math.max(0, Math.min(255, Math.round(lab.b + 128)));

          bytes[clutOffset++] = lByte;
          bytes[clutOffset++] = aByte;
          bytes[clutOffset++] = bByte;
        }
      }
    }
  }

  // Output Tables: 3 tables, 256 entries each, identity mapping (21075 to 21842)
  tableOffset = 21075;
  for (let ch = 0; ch < 3; ch++) {
    for (let val = 0; val < 256; val++) {
      bytes[tableOffset++] = val;
    }
  }

  // Padding byte (21843)
  bytes[21843] = 0;

  return buffer;
}

// Gate-controlled ICC export: enforces gate, sources from latest Run, returns ICC + metadata sidecar
export function buildIccExportPackage(gate, runs, options = {}) {
  if (!gate || gate.status !== "Ready" || gate.level !== "pass") {
    const reasons = (gate?.checks || [])
      .filter((c) => c.status === "fail" && c.required !== false)
      .map((c) => `${c.label}: ${c.message}`);
    throw new Error(
      `ICC generation gate not passed (${gate?.status || "unknown"}). Blocking reasons: ${reasons.join("; ") || "unknown"}`
    );
  }

  const latestRun = (runs || [])[0];
  if (!latestRun) {
    throw new Error("No saved Run available for ICC generation.");
  }

  const archive = latestRun.archive || latestRun;
  const iccBuffer = generateIccProfile(latestRun);
  const now = new Date().toISOString();

  const metadata = {
    profileEngine: "experimental-idw-clut",
    productionReady: false,
    warning: "Experimental ICC draft, not validated for production RIP use.",
    generatedAt: now,
    gateStatus: gate.status,
    gateLevel: gate.level,
    patchCount: gate.coverage?.patchCount || 0,
    labPatchCount: gate.coverage?.labPatchCount || 0,
    runId: latestRun.runId || latestRun.createdAt || "",
    runName: latestRun.name || "",
    jobId: latestRun.jobId || options.jobId || "",
    standard: options.standard?.name || archive.standard?.name || "",
    measurementCondition: options.measurementCondition || archive.importInfo?.metadata?.measurement_condition || "unspecified",
    instrument: archive.importInfo?.metadata?.instrument || options.instrument || "",
    compensationCurveArchiveId: latestRun.storagePath || latestRun.createdAt || "",
    profileDescription: "CTV-Experimental-Draft",
    profileVersion: "2.1.0",
    colorSpace: "CMYK",
    pcs: "Lab",
  };

  const slug = [
    options.jobCustomer || "",
    options.jobPress || "",
    now.slice(0, 10),
  ].filter(Boolean).join("-").replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "draft";

  const filename = `ctv-experimental-${slug}.icc`;
  const metadataFilename = `ctv-experimental-${slug}.metadata.json`;

  return { iccBuffer, metadata, filename, metadataFilename };
}

// Exports measurement data to standard CGATS text format
export function exportMeasurementToCgats(run) {
  const scattered = getScatteredPoints(run);
  const lines = [
    "CGATS.17",
    "ORIGINATOR \"CTV Curve Utility\"",
    `DESCRIPTOR \"Characterization Data exported from ${run?.name || "CTV Run"}\"`,
    `CREATED \"${new Date().toISOString()}\"`,
    `NUMBER_OF_FIELDS 8`,
    "BEGIN_DATA_FORMAT",
    "SAMPLE_ID CMYK_C CMYK_M CMYK_Y CMYK_K LAB_L LAB_A LAB_B",
    "END_DATA_FORMAT",
    `NUMBER_OF_SETS ${scattered.length}`,
    "BEGIN_DATA",
  ];

  scattered.forEach((pt, index) => {
    lines.push(`${index + 1} ${pt.cmyk.c.toFixed(2)} ${pt.cmyk.m.toFixed(2)} ${pt.cmyk.y.toFixed(2)} ${pt.cmyk.k.toFixed(2)} ${pt.lab.l.toFixed(2)} ${pt.lab.a.toFixed(2)} ${pt.lab.b.toFixed(2)}`);
  });

  lines.push("END_DATA");
  return lines.join("\n");
}
