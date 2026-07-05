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
      { name: "测量/项目文件", extensions: ["csv", "txt", "cgats", "it8", "json", "rwxf", "cxf"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (!path || Array.isArray(path)) return { handled: true, path: "", contents: "", canceled: true };
  const contents = await invokeTauriCommand("read_text_file", { path });
  return { handled: true, path, contents };
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
