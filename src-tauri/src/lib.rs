mod models;
mod storage;
pub mod clipboard;
pub mod hotkey;
mod tray;
mod commands;
mod export;

use tauri::Manager;
use std::path::PathBuf;
use once_cell::sync::OnceCell;

/// Global app data directory — set once at startup, read by export/restore.
pub static APP_DATA_DIR: OnceCell<PathBuf> = OnceCell::new();

/// Data directory is the exe's parent directory (portable layout).
/// User can delete the app folder to fully uninstall — no residual data.
fn app_data_dir() -> PathBuf {
    let dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    std::fs::create_dir_all(dir.join("images")).ok();
    std::fs::create_dir_all(dir.join("thumbnails")).ok();
    std::fs::create_dir_all(dir.join("exports")).ok();
    std::fs::create_dir_all(dir.join("backups")).ok();
    dir
}

/// Create or remove the Windows registry auto-start entry so the app
/// launches at login when the user enables the setting.
#[cfg(target_os = "windows")]
pub fn set_auto_start(enabled: bool) {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = r"Software\Microsoft\Windows\CurrentVersion\Run";
    if let Ok(run_key) = hkcu.open_subkey_with_flags(path, KEY_WRITE) {
        if enabled {
            if let Ok(exe_path) = std::env::current_exe() {
                let _ = run_key.set_value("SuperClipboard", &exe_path.to_string_lossy().to_string());
            }
        } else {
            let _ = run_key.delete_value("SuperClipboard");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app_data_dir();
            APP_DATA_DIR.set(dir.clone()).ok();
            storage::init_db(&dir).expect("Failed to initialize database");

            // Apply settings from DB that require system-level changes
            if let Ok(settings) = storage::get_all_settings() {
                if let Some(window) = app.get_webview_window("main") {
                    window.set_always_on_top(settings.always_on_top).ok();
                    window.set_skip_taskbar(settings.always_on_top).ok();
                }
                #[cfg(target_os = "windows")]
                set_auto_start(settings.auto_start);

                let handle = app.handle().clone();
                hotkey::register(&handle, &settings.hotkey);
            }

            let handle = app.handle().clone();
            let images_dir = dir.join("images");
            let thumbs_dir = dir.join("thumbnails");
            std::thread::spawn(move || {
                clipboard::run_monitor(handle, images_dir, thumbs_dir);
            });

            let handle = app.handle().clone();
            tray::setup(&handle)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::copy_to_clipboard,
            commands::auto_paste,
            commands::toggle_pin,
            commands::toggle_favorite,
            commands::update_note,
            commands::delete_clipboard_item,
            commands::delete_clipboard_items,
            commands::clear_item_images,
            commands::export_text,
            commands::export_images,
            commands::backup,
            commands::restore,
            commands::clear_all_data,
            commands::get_settings,
            commands::update_settings,
            commands::get_item_count,
            commands::get_source_apps,
            commands::hide_window,
            commands::start_drag,
            commands::read_image_base64,
            commands::get_app_version,
            commands::get_build_info,
            commands::open_image_preview,
            commands::get_preview_image_path,
            commands::close_preview_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
