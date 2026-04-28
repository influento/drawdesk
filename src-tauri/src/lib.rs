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

/// Save PNG bytes to ~/pictures/screenshot-<ts>.png and hand it to the same
/// `wl-copy + delayed rm` pipeline the user's sway config uses for $mod+P.
/// The cleanup is detached (setsid + new process group), so it survives
/// drawdesk closing or crashing before the 20s window elapses.
#[tauri::command]
fn copy_png_via_sway(bytes: Vec<u8>) -> Result<(), String> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::{SystemTime, UNIX_EPOCH};

    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let dir = std::path::PathBuf::from(&home).join("pictures");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir pictures: {e}"))?;

    // Match sway config: screenshot-YYYYMMDD-HHMMSS.png. Add millis to avoid
    // collisions when invoked rapidly.
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();
    let tm = unsafe {
        let t = secs as libc::time_t;
        let mut out: libc::tm = std::mem::zeroed();
        libc::localtime_r(&t, &mut out);
        out
    };
    let stamp = format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}{:03}",
        tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday,
        tm.tm_hour, tm.tm_min, tm.tm_sec, millis,
    );
    let path = dir.join(format!("screenshot-{stamp}.png"));

    std::fs::write(&path, &bytes).map_err(|e| format!("write png: {e}"))?;

    let path_str = path.to_string_lossy().to_string();
    // Hold the path in a bash variable (single-quoted assignment, with embedded
    // single-quotes escaped via the standard `'\''` dance). This way the path
    // is safe from shell parsing without leaking quote characters into the URI.
    let escaped = path_str.replace('\'', "'\\''");
    let script = format!(
        "f='{escaped}'; wl-copy -t text/uri-list \"file://$f\" && (sleep 20 && rm -f -- \"$f\") &",
    );

    let mut cmd = Command::new("bash");
    cmd.arg("-c").arg(&script)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    unsafe {
        cmd.pre_exec(|| {
            // Detach from drawdesk's process group/session so the child + its
            // backgrounded `(sleep 20 && rm)` survive if drawdesk exits.
            libc::setsid();
            Ok(())
        });
    }
    cmd.spawn().map_err(|e| format!("spawn bash: {e}"))?;
    Ok(())
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
    // Limit Skia GPU painting to 1 thread to avoid WebKitGTK compositor race conditions
    // (SIGSEGV/SIGABRT in WebKitWebProcess on radeonsi). Keeps GPU acceleration active.
    if std::env::var("WEBKIT_SKIA_GPU_PAINTING_THREADS").is_err() {
        std::env::set_var("WEBKIT_SKIA_GPU_PAINTING_THREADS", "1");
    }
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
        .invoke_handler(tauri::generate_handler![get_cli_file, get_cli_image, copy_png_via_sway])
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
