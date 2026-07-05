import { defaultManualRow } from "./manual-table.js";

export function isTauriAvailable() {
  return typeof window !== "undefined" && Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__ || window.__TAURI_ENV__);
}

export function isRealSdkEnabled() {
  return false;
}

export const DEVICE_ADAPTERS = [
  {
    id: "file",
    name: "文件导入",
    status: "Ready",
    description: "通过 X-Rite / Techkon 软件导出的 CGATS、IT8、CSV、CxF/RWXF 文件进入测量流程。",
    capabilities: ["importFile", "crossVerify"],
  },
  {
    id: "mock",
    name: "模拟设备",
    status: "Ready",
    description: "用于开发和演示测量队列；不连接真实仪器。",
    capabilities: ["connect", "disconnect", "calibrateWhite", "readPatch"],
  },
  {
    id: "sdk",
    name: "SDK 待接入",
    status: "Blocked",
    description: "真实 Techkon / X-Rite SDK、授权文件或通讯协议尚未完成接入；当前仅保留接口占位，不能用于现场验收测量。",
    capabilities: ["plannedConnect", "plannedCalibrateWhite", "plannedReadPatch"],
  },
];

export function adapterById(id) {
  return DEVICE_ADAPTERS.find((item) => item.id === id) || DEVICE_ADAPTERS[0];
}

export function buildMeasurementQueue(profile = "press-basic") {
  const common = [
    queueItem("paper", "Paper", "", "纸白"),
    ...["C", "M", "Y", "K"].map((channel) => queueItem("solid", channel, 100, `${channel} 实地`)),
    ...["C", "M", "Y", "K"].flatMap((channel) => [25, 50, 75].map((tone) => queueItem("tone", channel, tone, `${channel} ${tone}%`))),
  ];
  if (profile === "g7") {
    return [
      ...common,
      ...[25, 50, 75].map((tone) => queueItem("gray", "Gray", tone, `G7 Gray ${tone}%`)),
      ...["CM", "CY", "MY", "CMY"].map((channel) => queueItem("overprint", channel, 100, `${channel} 叠印`)),
    ];
  }
  return common;
}

export function summarizeDeviceState(deviceState = {}, manualRows = []) {
  const adapter = adapterById(deviceState.adapterId);
  const queue = deviceState.queue?.length ? deviceState.queue : buildMeasurementQueue(deviceState.queueProfile || "press-basic");
  const measured = Math.min(Number(deviceState.queueIndex || 0), queue.length);
  const next = queue[measured] || null;
  return {
    adapter,
    connected: Boolean(deviceState.connected),
    calibrated: Boolean(deviceState.calibrated),
    queue,
    measured,
    total: queue.length,
    next,
    manualInstrumentRows: manualRows.filter((row) => row.source === "仪器测量").length,
    canConnect: adapter.capabilities.includes("connect") && (adapter.id !== "sdk" || isRealSdkEnabled()),
    canCalibrate: adapter.capabilities.includes("calibrateWhite") && Boolean(deviceState.connected),
    canReadPatch: adapter.capabilities.includes("readPatch") && Boolean(deviceState.connected) && (adapter.id !== "sdk" || isRealSdkEnabled()),
    message: deviceState.message || adapter.description,
  };
}

export function sdkDeviceLabel(device = {}) {
  const product = device.product_string || device.productName || "Unknown instrument";
  const manufacturer = device.manufacturer_string || device.manufacturer || "";
  const vendorId = hexId(device.vendor_id ?? device.vendorId);
  const productId = hexId(device.product_id ?? device.productId);
  const idText = vendorId && productId ? `VID: ${vendorId}, PID: ${productId}` : "";
  return [manufacturer, product, idText].filter(Boolean).join(" / ");
}

export function buildSdkMeasurementRow(queueItemData, response = {}) {
  if (!queueItemData) throw new Error("Missing measurement queue item.");
  if (response.parsed === false) {
    throw new Error(response.message || "Instrument response was captured but not parsed.");
  }
  const lab = response.lab || {};
  const labL = finiteNumber(lab.l);
  const labA = finiteNumber(lab.a);
  const labB = finiteNumber(lab.b);
  if (![labL, labA, labB].every(Number.isFinite)) {
    throw new Error("Instrument SDK response does not contain parsed Lab values.");
  }
  const measuredTone = finiteNumber(response.measuredTone);
  const density = finiteNumber(response.density);
  return defaultManualRow({
    patchType: queueItemData.patchType,
    channel: queueItemData.channel,
    tone: queueItemData.tone,
    measuredTone: Number.isFinite(measuredTone) ? measuredTone : "",
    density: Number.isFinite(density) ? density : "",
    labL,
    labA,
    labB,
    source: "仪器测量",
    note: `SDK读取 ${queueItemData.label}: ${response.message || ""}`,
  });
}

export function changeDeviceAdapterState(deviceState = {}, adapterId) {
  return {
    ...deviceState,
    adapterId,
    connected: false,
    calibrated: false,
    message: adapterId === "sdk"
      ? "SDK 待接入，真实仪器协议未启用；请使用文件导入或模拟设备。"
      : "",
  };
}

export function connectDeviceState(deviceState = {}) {
  if (deviceState.adapterId === "mock") {
    return {
      ...deviceState,
      connected: true,
      message: "模拟设备已连接，可按队列读取当前点。",
    };
  }
  if (deviceState.adapterId === "file") {
    return {
      ...deviceState,
      message: "文件导入模式无需连接设备，请从测量页导入 CGATS / IT8 / CSV。",
    };
  }
  return {
    ...deviceState,
    message: "SDK 尚未接入，不能连接真实设备。",
  };
}

export function disconnectDeviceState(deviceState = {}) {
  return {
    ...deviceState,
    connected: false,
    calibrated: false,
    message: "设备已断开。",
  };
}

export function calibrateDeviceState(deviceState = {}) {
  if (!deviceState.connected) {
    return {
      ...deviceState,
      message: "请先连接设备。",
    };
  }
  return {
    ...deviceState,
    calibrated: true,
    message: "白板校准完成。",
  };
}

export function readDevicePatchState(deviceState = {}) {
  if (deviceState.adapterId !== "mock") {
    return {
      device: {
        ...deviceState,
        message: deviceState.adapterId === "file"
          ? "文件导入模式不支持单点读取，请导入厂商软件导出的测量文件。"
          : "SDK 尚未接入，不能读取真实设备。",
      },
      row: null,
    };
  }
  if (!deviceState.connected) {
    return {
      device: {
        ...deviceState,
        message: "请先连接模拟设备。",
      },
      row: null,
    };
  }
  const queue = deviceState.queue || buildMeasurementQueue(deviceState.queueProfile || "press-basic");
  const queueIndex = Number(deviceState.queueIndex || 0);
  const item = queue[queueIndex];
  if (!item) {
    return {
      device: {
        ...deviceState,
        queue,
        message: "测量队列已完成。",
      },
      row: null,
    };
  }
  return {
    device: {
      ...deviceState,
      queue,
      queueIndex: queueIndex + 1,
      message: `已读取 ${item.label}，并写入手动测量表。`,
    },
    row: mockReadPatch(item, queueIndex),
  };
}

export function mockReadPatch(queueItemData, sequence = 0) {
  if (!queueItemData) return null;
  const lab = mockLab(queueItemData, sequence);
  return defaultManualRow({
    patchType: queueItemData.patchType,
    channel: queueItemData.channel,
    tone: queueItemData.tone,
    measuredTone: queueItemData.patchType === "tone" ? mockMeasuredTone(queueItemData.channel, queueItemData.tone, sequence) : "",
    density: queueItemData.patchType === "paper" ? 0 : mockDensity(queueItemData, sequence),
    labL: lab.l,
    labA: lab.a,
    labB: lab.b,
    source: "仪器测量",
    note: `模拟读取 ${queueItemData.label}`,
  });
}

function queueItem(patchType, channel, tone, label) {
  return {
    patchType,
    channel,
    tone,
    label,
  };
}

function mockMeasuredTone(channel, tone, sequence) {
  const gain = { C: 10, M: 8, Y: 9, K: 12 }[channel] || 6;
  const curve = Math.sin((Number(tone) / 100) * Math.PI);
  return round(Math.min(100, Number(tone) + gain * curve + (sequence % 3) * 0.2));
}

function mockDensity(item, sequence) {
  const base = {
    C: 1.35,
    M: 1.25,
    Y: 0.95,
    K: 1.65,
    CM: 1.85,
    CY: 1.55,
    MY: 1.45,
    CMY: 2.05,
    Gray: 0.8,
  }[item.channel] || 0.5;
  const toneFactor = Number(item.tone || 100) / 100;
  return round(base * Math.max(0.1, toneFactor) + (sequence % 5) * 0.01, 3);
}

function mockLab(item, sequence) {
  const tone = Number(item.tone || 100);
  const jitter = (sequence % 4) * 0.15;
  if (item.patchType === "paper") return { l: 95.1, a: 0.4, b: -2.1 };
  const solids = {
    C: { l: 56, a: -35, b: -50 },
    M: { l: 49, a: 74, b: -4 },
    Y: { l: 88, a: -5, b: 89 },
    K: { l: 18, a: 0, b: 1 },
    CM: { l: 25, a: 21, b: -45 },
    CY: { l: 50, a: -65, b: 25 },
    MY: { l: 49, a: 69, b: 47 },
    CMY: { l: 23, a: 0, b: -2 },
    Gray: { l: 55, a: 1.2, b: -3.2 },
  };
  const solid = solids[item.channel] || solids.K;
  const ratio = item.patchType === "tone" || item.patchType === "gray" ? tone / 100 : 1;
  return {
    l: round(95 - (95 - solid.l) * ratio - jitter),
    a: round(solid.a * ratio + jitter),
    b: round(solid.b * ratio - jitter),
  };
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function hexId(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `0x${numeric.toString(16).toUpperCase().padStart(4, "0")}`;
}
