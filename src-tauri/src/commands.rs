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
                set_clipboard_text(paths)?;
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
        .map_err(|e| format!("Failed to read {}: {}", png_path, e))?;
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
