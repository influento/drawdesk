use std::sync::Mutex;

struct CliArgs {
    file_path: Option<String>,
}

#[tauri::command]
fn get_cli_file(state: tauri::State<'_, Mutex<CliArgs>>) -> Option<String> {
    state.lock().unwrap().file_path.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Find the first arg that looks like an excalidraw file
    let file_path = std::env::args().skip(1).find_map(|arg| {
        if arg.contains(".excalidraw") && !arg.starts_with('-') {
            let path = std::path::PathBuf::from(&arg);

            // Resolve to absolute path
            let abs = if path.is_absolute() {
                path
            } else {
                let cwd = std::env::current_dir().ok()?;
                // Try CWD first, then parent (handles tauri dev running from src-tauri/)
                if cwd.join(&path).exists() {
                    cwd.join(&path)
                } else if cwd.join("..").join(&path).exists() {
                    cwd.join("..").join(&path)
                } else {
                    // File doesn't exist — resolve relative to CWD for creation
                    cwd.join(&path)
                }
            };

            // Canonicalize if it exists, otherwise use the absolute path as-is
            let resolved = abs.canonicalize().unwrap_or(abs);
            Some(resolved.to_string_lossy().to_string())
        } else {
            None
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(CliArgs { file_path }))
        .invoke_handler(tauri::generate_handler![get_cli_file])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
