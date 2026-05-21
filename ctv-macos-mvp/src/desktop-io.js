export function canUseDesktopFileDialog() {
  const tauri = tauriApi();
  return Boolean(tauri?.dialog?.save && tauri?.dialog?.open && tauri?.core?.invoke);
}

export async function saveTextFileDesktop({ filename, contents, title = "保存文件" }) {
  const tauri = tauriApi();
  if (!canUseDesktopFileDialog()) return { handled: false, path: "" };
  const path = await tauri.dialog.save({
    title,
    defaultPath: filename,
    filters: exportFilters(filename),
  });
  if (!path) return { handled: true, path: "", canceled: true };
  await tauri.core.invoke("write_text_file", { path, contents });
  return { handled: true, path };
}

export async function saveBinaryFileDesktop({ filename, contents, title = "保存文件" }) {
  const tauri = tauriApi();
  if (!canUseDesktopFileDialog()) return { handled: false, path: "" };
  const path = await tauri.dialog.save({
    title,
    defaultPath: filename,
    filters: exportFilters(filename),
  });
  if (!path) return { handled: true, path: "", canceled: true };
  const bytes = contents instanceof Uint8Array ? Array.from(contents) : Array.from(new Uint8Array(contents));
  await tauri.core.invoke("write_binary_file", { path, contents: bytes });
  return { handled: true, path };
}

export async function openTextFileDesktop() {
  const tauri = tauriApi();
  if (!canUseDesktopFileDialog()) return { handled: false, path: "", contents: "" };
  const path = await tauri.dialog.open({
    title: "打开测量或项目档案",
    multiple: false,
    directory: false,
    filters: [
      { name: "测量/项目文件", extensions: ["csv", "txt", "cgats", "it8", "json", "rwxf", "cxf"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (!path || Array.isArray(path)) return { handled: true, path: "", contents: "", canceled: true };
  const contents = await tauri.core.invoke("read_text_file", { path });
  return { handled: true, path, contents };
}

function tauriApi() {
  return globalThis.window?.__TAURI__ || globalThis.__TAURI__ || null;
}

function exportFilters(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".csv")) return [{ name: "CSV", extensions: ["csv"] }];
  if (lower.endsWith(".json")) return [{ name: "JSON", extensions: ["json"] }];
  if (lower.endsWith(".txt") || lower.endsWith(".cgats")) return [{ name: "CGATS / TXT", extensions: ["txt", "cgats"] }];
  if (lower.endsWith(".icc") || lower.endsWith(".icm")) return [{ name: "ICC Profile", extensions: ["icc", "icm"] }];
  return [{ name: "导出文件", extensions: ["csv", "txt", "json", "icc", "icm"] }];
}
