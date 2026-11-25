use std::{collections::BTreeMap, fs::OpenOptions, path::Path};
use tauri::utils::assets::AssetKey;

#[derive(serde::Serialize)]
struct SdkDeviceInfo {
    vendor_id: u16,
    product_id: u16,
    path: String,
    serial_number: Option<String>,
    manufacturer_string: Option<String>,
    product_string: Option<String>,
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<String, String> {
    validate_file_command_path(Path::new(&path))?;
    std::fs::write(&path, contents).map_err(|error| error.to_string())?;
    Ok(path)
}

#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<String, String> {
    validate_file_command_path(Path::new(&path))?;
    std::fs::write(&path, contents).map_err(|error| error.to_string())?;
    Ok(path)
}

// Raw bytes so the frontend can decode UTF-16 / GB18030 files, not only UTF-8.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    validate_file_command_path(Path::new(&path))?;
    std::fs::read(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    validate_file_command_path(Path::new(&path))?;
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

fn validate_file_command_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("File path is empty.".to_string());
    }
    if path.file_name().is_none() {
        return Err("File path must include a file name.".to_string());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "File path must include a supported extension.".to_string())?;
    let allowed = matches!(
        extension.as_str(),
        "csv" | "txt" | "cgats" | "it8" | "json" | "rwxf" | "cxf" | "icc" | "icm"
    );
    if !allowed {
        return Err(format!("Unsupported file extension: .{}", extension));
    }
    Ok(())
}

#[tauri::command]
fn sdk_scan_devices() -> Result<Vec<SdkDeviceInfo>, String> {
    Err("Instrument SDK/protocol integration is not enabled in this release.".to_string())
}

#[tauri::command]
fn sdk_calibrate(_vendor_id: u16, _product_id: u16) -> Result<String, String> {
    Err("Instrument SDK/protocol integration is not enabled in this release; use vendor-exported CGATS/IT8/CSV files instead.".to_string())
}

#[tauri::command]
fn sdk_read_patch(_vendor_id: u16, _product_id: u16) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "status": "blocked",
        "parsed": false,
        "message": "Instrument SDK/protocol integration is not enabled in this release; use vendor-exported CGATS/IT8/CSV files instead."
    }))
}

fn write_embedded_asset_manifest(
    context: &tauri::Context<tauri::Wry>,
    output: &Path,
    data_paths: impl Iterator<Item = String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let assets = context.assets();
    let paths: Vec<_> = assets.iter().map(|(key, _)| key).collect();
    let data: BTreeMap<_, _> = data_paths
        .filter_map(|path| {
            let key = AssetKey::from(&path);
            assets.get(&key).map(|bytes| (path, bytes))
        })
        .collect();
    let file = OpenOptions::new().write(true).create_new(true).open(output)?;
    serde_json::to_writer(file, &serde_json::json!({ "paths": paths, "data": data }))?;
    Ok(())
}

fn main() {
    let context = tauri::generate_context!();
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() == Some(std::ffi::OsStr::new("--verify-embedded-assets")) {
        let output = args.next().expect("missing asset manifest output path");
        write_embedded_asset_manifest(
            &context,
            Path::new(&output),
            args.map(|arg| arg.into_string().expect("asset path must be UTF-8")),
        )
        .expect("failed to write the embedded asset manifest");
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            read_text_file,
            read_file_bytes,
            write_binary_file,
            sdk_scan_devices,
            sdk_calibrate,
            sdk_read_patch
        ])
        .run(context)
        .expect("failed to run CurveStudio desktop app");
}

#[cfg(test)]
mod tests {
    use super::validate_file_command_path;
    use std::path::Path;

    #[test]
    fn file_command_validation_accepts_supported_business_extensions() {
        for path in [
            "/tmp/curve.csv",
            "/tmp/curve.cgats.txt",
            "/tmp/project.json",
            "/tmp/measurement.it8",
            "/tmp/profile.icc",
            "/tmp/profile.icm",
            "/tmp/chart.rwxf",
            "/tmp/chart.cxf",
        ] {
            assert!(validate_file_command_path(Path::new(path)).is_ok(), "{path} should be accepted");
        }
    }

    #[test]
    fn file_command_validation_rejects_unsupported_paths() {
        for path in ["/tmp/secret", "/tmp/secret.env", "/tmp/app.sh", "/tmp/archive.zip", "/tmp/"] {
            assert!(validate_file_command_path(Path::new(path)).is_err(), "{path} should be rejected");
        }
    }
}
