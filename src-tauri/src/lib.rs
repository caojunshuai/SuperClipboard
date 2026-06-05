mod models;
mod storage;
mod clipboard;
mod hotkey;
mod tray;
mod commands;
mod export;

use tauri::Manager;
use std::path::PathBuf;

fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().expect("failed to get app data dir");
    std::fs::create_dir_all(dir.join("images")).ok();
    std::fs::create_dir_all(dir.join("thumbnails")).ok();
    std::fs::create_dir_all(dir.join("exports")).ok();
    std::fs::create_dir_all(dir.join("backups")).ok();
    dir
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app_data_dir(&app.handle());
            storage::init_db(&dir).expect("Failed to initialize database");

            let handle = app.handle().clone();
            let images_dir = dir.join("images");
            let thumbs_dir = dir.join("thumbnails");
            std::thread::spawn(move || {
                clipboard::run_monitor(handle, images_dir, thumbs_dir);
            });

            let handle = app.handle().clone();
            tray::setup(&handle)?;

            let handle = app.handle().clone();
            hotkey::register(&handle)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::copy_to_clipboard,
            commands::auto_paste,
            commands::toggle_pin,
            commands::toggle_favorite,
            commands::delete_clipboard_item,
            commands::delete_clipboard_items,
            commands::export_text,
            commands::export_images,
            commands::backup,
            commands::restore,
            commands::get_settings,
            commands::update_settings,
            commands::get_item_count,
            commands::hide_window,
            commands::start_drag,
            commands::read_image_base64,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
