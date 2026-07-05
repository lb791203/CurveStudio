use std::path::Path;

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            read_text_file,
            write_binary_file,
            sdk_scan_devices,
            sdk_calibrate,
            sdk_read_patch
        ])
        .run(tauri::generate_context!())
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
