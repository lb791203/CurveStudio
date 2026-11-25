export function canUseDesktopFileDialog() {
  const tauri = tauriApi();
  return Boolean(tauri?.save && tauri?.open && tauri?.invoke);
}

export function canUseTauriCommandBridge() {
  return Boolean(tauriApi()?.invoke);
}

export async function invokeTauriCommand(command, payload = {}) {
  const tauri = tauriApi();
  if (!tauri?.invoke) throw new Error("Tauri command bridge is unavailable.");
  return tauri.invoke(command, payload);
}

export async function saveTextFileDesktop({ filename, contents, title = "保存文件" }) {
  const tauri = tauriApi();
  if (!canUseDesktopFileDialog()) return { handled: false, path: "" };
  const path = await tauri.save({
    title,
    defaultPath: filename,
    filters: exportFilters(filename),
  });
  if (!path) return { handled: true, path: "", canceled: true };
  await invokeTauriCommand("write_text_file", { path, contents });
  return { handled: true, path };
}

export async function saveBinaryFileDesktop({ filename, contents, title = "保存文件" }) {
  const tauri = tauriApi();
  if (!canUseDesktopFileDialog()) return { handled: false, path: "" };
  const path = await tauri.save({
    title,
    defaultPath: filename,
    filters: exportFilters(filename),
  });
  if (!path) return { handled: true, path: "", canceled: true };
  const bytes = contents instanceof Uint8Array ? Array.from(contents) : Array.from(new Uint8Array(contents));
  await invokeTauriCommand("write_binary_file", { path, contents: bytes });
  return { handled: true, path };
}

export async function openTextFileDesktop() {
  const tauri = tauriApi();
  if (!canUseDesktopFileDialog()) return { handled: false, path: "", contents: "" };
  const path = await tauri.open({
    title: "打开测量或项目档案",
    multiple: false,
    directory: false,
    filters: [
      { name: "测量/项目文件", extensions: ["csv", "txt", "cgats", "it8", "json"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (!path || Array.isArray(path)) return { handled: true, path: "", contents: "", canceled: true };
  let contents;
  try {
    const bytes = await invokeTauriCommand("read_file_bytes", { path });
    if (Array.isArray(bytes) || bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) contents = decodeTextBytes(bytes);
  } catch {
    contents = undefined;
  }
  // Older desktop shells only have the UTF-8 read command.
  if (contents === undefined) contents = await invokeTauriCommand("read_text_file", { path });
  return { handled: true, path, contents };
}

// Measurement software exports UTF-8, UTF-16 (with BOM) or, on Chinese Windows, GB18030.
export function decodeTextBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

function tauriApi() {
  const root = globalThis.window || globalThis;
  const globalApi = root?.__TAURI__;
  if (globalApi?.core?.invoke && globalApi?.dialog?.save && globalApi?.dialog?.open) {
    return {
      invoke: (command, payload) => globalApi.core.invoke(command, payload),
      save: (options) => globalApi.dialog.save(options),
      open: (options) => globalApi.dialog.open(options),
    };
  }
  const internalInvoke = root?.__TAURI_INTERNALS__?.invoke;
  if (typeof internalInvoke === "function") {
    return {
      invoke: (command, payload) => internalInvoke(command, payload),
      save: (options) => internalInvoke("plugin:dialog|save", { options }),
      open: (options) => internalInvoke("plugin:dialog|open", { options }),
    };
  }
  return null;
}

function exportFilters(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".csv")) return [{ name: "CSV", extensions: ["csv"] }];
  if (lower.endsWith(".json")) return [{ name: "JSON", extensions: ["json"] }];
  if (lower.endsWith(".txt") || lower.endsWith(".cgats")) return [{ name: "CGATS / TXT", extensions: ["txt", "cgats"] }];
  if (lower.endsWith(".icc") || lower.endsWith(".icm")) return [{ name: "ICC Profile", extensions: ["icc", "icm"] }];
  return [{ name: "导出文件", extensions: ["csv", "txt", "json", "icc", "icm"] }];
}
