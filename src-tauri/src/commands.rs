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
                set_clipboard_image(img_path)?;
            }
        }
        ItemType::File => {
            if let Some(ref paths) = item.file_paths {
                set_clipboard_file_list(paths)?;
            }
        }
    }
    Ok(())
}

/// Read an image file and return it as a base64-encoded data URL
/// so the frontend can display it without asset protocol configuration.
#[tauri::command]
pub fn read_image_base64(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
    let encoded = base64_encode(&data);
    // Determine MIME type from extension (simple but effective for PNG/JPEG)
    let mime = if path.to_lowercase().ends_with(".png") { "image/png" }
               else if path.to_lowercase().ends_with(".jpg") || path.to_lowercase().ends_with(".jpeg") { "image/jpeg" }
               else { "image/png" };
    Ok(format!("data:{};base64,{}", mime, encoded))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((n >> 18) & 0x3f) as usize] as char);
        result.push(CHARS[((n >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((n >> 6) & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(n & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[tauri::command]
pub fn auto_paste(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Hide ourselves first so Ctrl+V goes to the previous window
        if let Some(window) = app.get_webview_window("main") {
            window.hide().ok();
        }
        // Brief pause for focus to return to the previous window
        std::thread::sleep(std::time::Duration::from_millis(80));

        unsafe {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
            let mut inputs: [INPUT; 4] = std::mem::zeroed();
            // Ctrl down
            inputs[0].r#type = INPUT_KEYBOARD;
            inputs[0].Anonymous.ki.wVk = 0x11; // VK_CONTROL
            // V down
            inputs[1].r#type = INPUT_KEYBOARD;
            inputs[1].Anonymous.ki.wVk = 0x56; // 'V'
            // V up
            inputs[2].r#type = INPUT_KEYBOARD;
            inputs[2].Anonymous.ki.wVk = 0x56;
            inputs[2].Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;
            // Ctrl up
            inputs[3].r#type = INPUT_KEYBOARD;
            inputs[3].Anonymous.ki.wVk = 0x11;
            inputs[3].Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;

            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            );
        }
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
pub fn update_note(id: i64, note: Option<String>) -> Result<(), String> {
    storage::update_note(id, note).map_err(|e| e.to_string())
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

/// Clear image/thumbnail paths for an item whose original file was deleted.
/// Removes the thumbnail file from disk and sets both paths to NULL in DB.
#[tauri::command]
pub fn clear_item_images(id: i64) -> Result<(), String> {
    if let Ok(Some(item)) = storage::get_item(id) {
        if let Some(ref p) = item.thumbnail_path { std::fs::remove_file(p).ok(); }
    }
    storage::clear_item_images(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_text(ids: Vec<i64>, output_path: String) -> Result<ExportResult, String> {
    export::export_text(&ids, &output_path)
}

#[tauri::command]
pub fn export_images(ids: Vec<i64>, output_dir: String) -> Result<ExportResult, String> {
    export::export_images(&ids, &output_dir)
}

#[tauri::command]
pub fn backup(output_path: String) -> Result<BackupResult, String> {
    export::backup(&output_path)
}

#[tauri::command]
pub fn restore(backup_path: String) -> Result<RestoreResult, String> {
    export::restore(&backup_path)
}

#[tauri::command]
pub fn clear_all_data() -> Result<usize, String> {
    storage::clear_all_data()
}

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    storage::get_all_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let always_on_top = settings.always_on_top;
    storage::save_all_settings(&settings).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    crate::set_auto_start(settings.auto_start);
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(always_on_top).ok();
        window.set_skip_taskbar(always_on_top).ok();
    }
    crate::hotkey::register(&app, &settings.hotkey);
    crate::tray::update_labels(&app).ok();
    Ok(())
}

#[tauri::command]
pub fn get_item_count() -> Result<i64, String> {
    let result = storage::query_history(&HistoryQuery {
        keyword: None,
        item_type: None,
        date_from: None,
        date_to: None,
        tab: None,
        source_app: None,
        offset: 0,
        limit: 1,
    }).map_err(|e| e.to_string())?;
    Ok(result.total)
}

#[tauri::command]
pub fn get_source_apps() -> Result<Vec<String>, String> {
    storage::get_source_apps().map_err(|e| e.to_string())
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

/// Put a PNG image file onto the Windows clipboard as CF_DIB so it can be
/// pasted into any application as an actual image (not a file path string).
#[cfg(target_os = "windows")]
fn set_clipboard_image(png_path: &str) -> Result<(), String> {
    use image::GenericImageView;

    let png_data = std::fs::read(png_path)
        .map_err(|_| "Image file not found".to_string())?;
    let img = image::load_from_memory(&png_data)
        .map_err(|e| format!("Failed to decode image: {}", e))?;
    let (w, h) = img.dimensions();

    // Build a top-down DIB with 32-bit BGRA pixel data.
    // BITMAPINFOHEADER (40 bytes) + pixel rows (4-byte aligned).
    let row_size = ((w * 32 + 31) / 32) * 4;
    let pixel_size = row_size as usize * h as usize;
    let header_size = 40usize;
    let total_size = header_size + pixel_size;

    unsafe {
        use windows_sys::Win32::System::DataExchange::*;
        use windows_sys::Win32::System::Memory::*;

        let handle = GlobalAlloc(0x0002, total_size);
        if handle.is_null() { return Err("GlobalAlloc failed".into()); }

        let ptr = GlobalLock(handle) as *mut u8;
        if ptr.is_null() { return Err("GlobalLock failed".into()); }

        // Write BITMAPINFOHEADER
        let buf = std::slice::from_raw_parts_mut(ptr, total_size);
        buf[0..4].copy_from_slice(&40u32.to_le_bytes());                   // biSize
        buf[4..8].copy_from_slice(&(w as i32).to_le_bytes());              // biWidth
        buf[8..12].copy_from_slice(&(-(h as i32)).to_le_bytes());          // biHeight (negative = top-down)
        buf[12..14].copy_from_slice(&1u16.to_le_bytes());                  // biPlanes
        buf[14..16].copy_from_slice(&32u16.to_le_bytes());                 // biBitCount
        buf[16..20].copy_from_slice(&0u32.to_le_bytes());                  // biCompression = BI_RGB
        buf[20..24].copy_from_slice(&(pixel_size as u32).to_le_bytes());   // biSizeImage
        // biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant all zero

        // biHeight is negative (top-down DIB), so row 0 = top of image.
        // No row flipping needed — write rows in natural order.
        for y in 0..h {
            let dst_offset = header_size + y as usize * row_size as usize;
            for x in 0..w {
                let pixel = img.get_pixel(x, y);
                let px_offset = dst_offset + x as usize * 4;
                buf[px_offset] = pixel[2];     // B
                buf[px_offset + 1] = pixel[1]; // G
                buf[px_offset + 2] = pixel[0]; // R
                buf[px_offset + 3] = pixel[3]; // A
            }
        }

        GlobalUnlock(handle);

        if OpenClipboard(0) == 0 { return Err("OpenClipboard failed".into()); }
        EmptyClipboard();
        SetClipboardData(8, handle as _); // CF_DIB
        CloseClipboard();
    }
    Ok(())
}

/// Put a list of file paths onto the Windows clipboard as CF_HDROP so they
/// can be pasted into Explorer as actual files (not a JSON string).
/// Checks that every file exists before setting the clipboard.
#[cfg(target_os = "windows")]
fn set_clipboard_file_list(paths_json: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let paths: Vec<String> = serde_json::from_str(paths_json)
        .map_err(|e| format!("解析文件路径失败: {}", e))?;

    if paths.is_empty() {
        return Err("文件路径为空".into());
    }

    // Check all files exist before setting clipboard
    let missing: Vec<&str> = paths.iter()
        .filter(|p| !std::path::Path::new(p).exists())
        .map(|p| p.as_str())
        .collect();
    if !missing.is_empty() {
        let count = missing.len();
        return Err(if count == 1 {
            "File not found".to_string()
        } else {
            format!("{} files not found", count)
        });
    }

    // Build DROPFILES header (20 bytes) + wide-char file list
    let mut wide_data: Vec<u16> = Vec::new();
    for p in &paths {
        wide_data.extend(OsStr::new(p).encode_wide().chain(std::iter::once(0)));
    }
    wide_data.push(0); // double NUL terminates the list

    let dropfiles_size: usize = 20;
    let total_size = dropfiles_size + wide_data.len() * std::mem::size_of::<u16>();

    unsafe {
        use windows_sys::Win32::System::DataExchange::*;
        use windows_sys::Win32::System::Memory::*;

        let handle = GlobalAlloc(0x0002, total_size);
        if handle.is_null() { return Err("GlobalAlloc failed".into()); }

        let ptr = GlobalLock(handle) as *mut u8;
        if ptr.is_null() { return Err("GlobalLock failed".into()); }

        let buf = std::slice::from_raw_parts_mut(ptr, total_size);

        // DROPFILES header
        buf[0..4].copy_from_slice(&(dropfiles_size as u32).to_le_bytes()); // pFiles = offset to file list
        buf[4..8].copy_from_slice(&0u32.to_le_bytes());                    // pt.x
        buf[8..12].copy_from_slice(&0u32.to_le_bytes());                   // pt.y
        buf[12..16].copy_from_slice(&0u32.to_le_bytes());                  // fNC = FALSE
        buf[16..20].copy_from_slice(&1u32.to_le_bytes());                  // fWide = TRUE

        // File list immediately after header
        let file_list_ptr = ptr.add(dropfiles_size) as *mut u16;
        std::ptr::copy_nonoverlapping(wide_data.as_ptr(), file_list_ptr, wide_data.len());

        GlobalUnlock(handle);

        if OpenClipboard(0) == 0 { return Err("OpenClipboard failed".into()); }
        EmptyClipboard();
        SetClipboardData(15, handle as _); // CF_HDROP
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

/// Initiate window drag via Windows API.
/// Mirrors tao's handle_os_dragging: ReleaseCapture + PostMessageW(WM_NCLBUTTONDOWN, HTCAPTION).
/// Using our own FFI for ReleaseCapture since it's missing from windows-sys 0.52.
#[tauri::command]
pub fn start_drag(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::*;
        use windows_sys::Win32::Foundation::*;

        // ReleaseCapture is not exported by windows-sys 0.52 — declare it ourselves
        extern "system" {
            fn ReleaseCapture() -> BOOL;
        }

        if let Some(window) = app.get_webview_window("main") {
            let raw = window.hwnd().map_err(|e| e.to_string())?;
            // HWND is a type alias for isize in windows-sys 0.52
            let hwnd: HWND = raw.0 as isize;

            // Get current cursor position
            let mut cursor_pos = POINT { x: 0, y: 0 };
            if unsafe { GetCursorPos(&mut cursor_pos) } == 0 {
                return Err("GetCursorPos failed".into());
            }

            let points = POINTS {
                x: cursor_pos.x as i16,
                y: cursor_pos.y as i16,
            };

            // Must release webview capture before posting, otherwise
            // WM_NCLBUTTONDOWN won't initiate drag
            unsafe { ReleaseCapture(); }

            // PostMessageW (async) so the message loop handles drag properly
            // WPARAM = usize, LPARAM = isize (type aliases)
            unsafe {
                PostMessageW(
                    hwnd,
                    WM_NCLBUTTONDOWN,
                    HTCAPTION as usize,
                    &points as *const _ as isize,
                );
            }

            Ok(())
        } else {
            Err("Window not found".to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    Err("Not supported".to_string())
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Return version + build time as a JSON-like struct.
/// build_time is embedded at compile time via build.rs.
#[tauri::command]
pub fn get_build_info() -> BuildInfo {
    BuildInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        build_time: env!("BUILD_TIME").to_string(),
    }
}

use std::collections::HashMap;

/// Monotonic counter for unique preview window labels.
static PREVIEW_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Per-window pending image paths, keyed by window label.
/// Each preview window consumes only its own entry — no shared-state race.
static PENDING_PATHS: std::sync::LazyLock<std::sync::Mutex<HashMap<String, String>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

/// Open a standalone image preview window.
///
/// Must spawn an OS thread for `build()` — calling it from the tokio
/// command thread pool causes a deadlock with the main event loop.
#[tauri::command]
pub fn open_image_preview(app: tauri::AppHandle, path: String) -> Result<(), String> {
    // Check file exists before opening preview window
    if !std::path::Path::new(&path).exists() {
        return Err("Image file not found".to_string());
    }

    let id = PREVIEW_ID.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let label = format!("image-preview-{}", id);

    // Store path keyed by this window's label
    PENDING_PATHS.lock().map_err(|e| e.to_string())?.insert(label.clone(), path);

    // Close the previous preview window if it still exists
    if id > 0 {
        let prev_label = format!("image-preview-{}", id - 1);
        if let Some(old) = app.get_webview_window(&prev_label) {
            old.close().ok();
        }
    }

    let result = std::thread::spawn(move || {
        tauri::WebviewWindow::builder(&app, &label, tauri::WebviewUrl::App("preview.html".into()))
            .title("图片预览")
            .inner_size(900.0, 700.0)
            .center()
            .resizable(true)
            .always_on_top(true)
            .build()
    })
    .join()
    .map_err(|e| format!("Thread panicked: {:?}", e))?;

    result.map(|_| ()).map_err(|e| format!("Failed to create preview window: {}", e))
}

/// Retrieve the image path for the calling preview window.
/// Uses `tauri::Window` injection to look up this window's own path
/// in the HashMap — no cross-window contamination.
#[tauri::command]
pub fn get_preview_image_path(window: tauri::Window) -> Result<String, String> {
    let label = window.label().to_string();
    PENDING_PATHS.lock()
        .map_err(|e| e.to_string())?
        .remove(&label)
        .ok_or_else(|| format!("No image path for {}", label))
}

/// Close the window that made this call (used by the preview window).
#[tauri::command]
pub fn close_preview_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}
