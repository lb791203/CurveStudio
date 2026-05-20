#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<String, String> {
    std::fs::write(&path, contents).map_err(|error| error.to_string())?;
    Ok(path)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_text_file, read_text_file])
        .run(tauri::generate_context!())
        .expect("failed to run CTV Curve desktop app");
}
