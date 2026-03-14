use std::sync::Mutex;

struct CliArgs {
    file_path: Option<String>,
    image_path: Option<String>,
}

#[tauri::command]
fn get_cli_file(state: tauri::State<'_, Mutex<CliArgs>>) -> Option<String> {
    state.lock().unwrap().file_path.clone()
}

#[tauri::command]
fn get_cli_image(state: tauri::State<'_, Mutex<CliArgs>>) -> Option<String> {
    state.lock().unwrap().image_path.clone()
}

fn resolve_path(arg: &str) -> Option<String> {
    // Strip file:// URI prefix if present
    let arg = arg.strip_prefix("file://").unwrap_or(arg);
    let path = std::path::PathBuf::from(arg);

    let abs = if path.is_absolute() {
        path
    } else {
        let cwd = std::env::current_dir().ok()?;
        if cwd.join(&path).exists() {
            cwd.join(&path)
        } else if cwd.join("..").join(&path).exists() {
            cwd.join("..").join(&path)
        } else {
            cwd.join(&path)
        }
    };

    let resolved = abs.canonicalize().unwrap_or(abs);
    Some(resolved.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let mut file_path: Option<String> = None;
    let mut image_path: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        if (arg == "--image" || arg == "-i") && i + 1 < args.len() {
            image_path = resolve_path(&args[i + 1]);
            i += 2;
        } else if !arg.starts_with('-') && arg.contains(".excalidraw") {
            file_path = resolve_path(arg);
            i += 1;
        } else {
            i += 1;
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(CliArgs { file_path, image_path }))
        .invoke_handler(tauri::generate_handler![get_cli_file, get_cli_image])
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
