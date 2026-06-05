use tauri::Manager;
use crate::models::*;
use crate::storage;
use crate::export;

#[tauri::command]
pub fn get_clipboard_history(query: HistoryQuery) -> Result<HistoryResult, String> {
    storage::query_history(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_to_clipboard(id: i64) -> Result<(), String> {
    let item = storage::get_item(id).map_err(|e| e.to_string())?
        .ok_or_else(|| "Item not found".to_string())?;

    match item.item_type {
        ItemType::Text => {
            if let Some(ref text) = item.content {
                set_clipboard_text(text)?;
            }
        }
        ItemType::Image => {
            if let Some(ref img_path) = item.image_path {
                set_clipboard_text(img_path)?;
            }
        }
        ItemType::File => {
            if let Some(ref paths) = item.file_paths {
                set_clipboard_text(paths)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn auto_paste() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
        keybd_event(0x11, 0, 0, 0);
        keybd_event(0x56, 0, 0, 0);
        keybd_event(0x56, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x11, 0, KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_pin(id: i64) -> Result<bool, String> {
    storage::toggle_pin(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_favorite(id: i64) -> Result<bool, String> {
    storage::toggle_favorite(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_clipboard_item(id: i64) -> Result<(), String> {
    if let Ok(Some(item)) = storage::get_item(id) {
        if let Some(ref p) = item.image_path { std::fs::remove_file(p).ok(); }
        if let Some(ref p) = item.thumbnail_path { std::fs::remove_file(p).ok(); }
    }
    storage::delete_item(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_clipboard_items(ids: Vec<i64>) -> Result<(), String> {
    for &id in &ids {
        if let Ok(Some(item)) = storage::get_item(id) {
            if let Some(ref p) = item.image_path { std::fs::remove_file(p).ok(); }
            if let Some(ref p) = item.thumbnail_path { std::fs::remove_file(p).ok(); }
        }
    }
    storage::delete_items(&ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_text(ids: Vec<i64>, output_path: String) -> Result<String, String> {
    export::export_text(&ids, &output_path)
}

#[tauri::command]
pub fn export_images(ids: Vec<i64>, output_dir: String) -> Result<String, String> {
    export::export_images(&ids, &output_dir)
}

#[tauri::command]
pub fn backup(output_path: String) -> Result<String, String> {
    export::backup(&output_path)
}

#[tauri::command]
pub fn restore(backup_path: String) -> Result<String, String> {
    export::restore(&backup_path)
}

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    storage::get_all_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_settings(settings: AppSettings) -> Result<(), String> {
    storage::save_all_settings(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_item_count() -> Result<i64, String> {
    let result = storage::query_history(&HistoryQuery {
        keyword: None,
        item_type: None,
        date_from: None,
        date_to: None,
        tab: None,
        offset: 0,
        limit: 1,
    }).map_err(|e| e.to_string())?;
    Ok(result.total)
}

#[cfg(target_os = "windows")]
fn set_clipboard_text(text: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    unsafe {
        use windows_sys::Win32::System::DataExchange::*;
        use windows_sys::Win32::System::Memory::*;

        let wide: Vec<u16> = OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect();
        let size = wide.len() * std::mem::size_of::<u16>();
        let handle = GlobalAlloc(0x0002, size);
        if handle.is_null() { return Err("GlobalAlloc failed".into()); }

        let ptr = GlobalLock(handle);
        if ptr.is_null() {
            // Don't free — GlobalAlloc memory without GlobalLock may not be freeable
            return Err("GlobalLock failed".into());
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr as *mut u16, wide.len());
        GlobalUnlock(handle);

        if OpenClipboard(0) == 0 { return Err("OpenClipboard failed".into()); }
        EmptyClipboard();
        SetClipboardData(13, handle as _);
        CloseClipboard();
    }
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
