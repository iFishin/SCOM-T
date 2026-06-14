use std::fs::OpenOptions;
use std::io::Write;

#[tauri::command]
fn append_to_file(path: String, content: String) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open file: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write to file: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![append_to_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
