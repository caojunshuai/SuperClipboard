use crate::export;
use crate::models::*;
use crate::stats;
use crate::storage;
use base64::Engine as _;
use tauri::Emitter;
use tauri::Manager;

/// Spawn a blocking operation off the main thread. Sync Tauri commands run
/// on the main thread — heavy IO (backup/restore, VACUUM, big queries) must
/// go through this or the UI and event loop freeze for the duration.
async fn run_blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("background task failed: {}", e))?
}

#[tauri::command]
pub async fn get_clipboard_history(query: HistoryQuery) -> Result<HistoryResult, String> {
    run_blocking(move || storage::query_history(&query).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub fn copy_to_clipboard(id: i64) -> Result<(), CopyError> {
    let item = storage::get_item(id)
        .map_err(|_| CopyError::new("clipboard_error"))?
        .ok_or_else(|| CopyError::new("clipboard_error"))?;

    match item.item_type {
        ItemType::Text => {
            if let Some(ref text) = item.content {
                set_clipboard_text(text)?;
                // Increment copy count for this text item
                let _ = storage::increment_copy_count(id);
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

/// Restrict IPC file access to the portable app data directory. Without
/// this, `read_image_base64` could exfiltrate any file on disk if the
/// webview ever loaded untrusted content.
fn ensure_inside_app_data(path: &str) -> Result<std::path::PathBuf, String> {
    let root = crate::APP_DATA_DIR
        .get()
        .ok_or("app data dir not initialized")?;
    let root_canonical = root.canonicalize().map_err(|e| e.to_string())?;
    let path = std::path::Path::new(path);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if canonical.starts_with(&root_canonical) {
        Ok(canonical)
    } else {
        Err("Access denied".to_string())
    }
}

/// Read an image file and return it as a base64-encoded data URL
/// so the frontend can display it without asset protocol configuration.
#[tauri::command]
pub fn read_image_base64(path: String) -> Result<String, String> {
    let path = ensure_inside_app_data(&path)?;
    let data =
        std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&data);
    // Determine MIME type from extension (simple but effective for PNG/JPEG)
    let mime = if path.to_string_lossy().to_lowercase().ends_with(".png") {
        "image/png"
    } else if path.to_string_lossy().to_lowercase().ends_with(".jpg")
        || path.to_string_lossy().to_lowercase().ends_with(".jpeg")
    {
        "image/jpeg"
    } else {
        "image/png"
    };
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
pub async fn auto_paste(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Hide ourselves first so Ctrl+V goes to the previous window
        if let Some(window) = app.get_webview_window("main") {
            window.hide().ok();
        }
        // Brief pause for focus to return to the previous window, then send
        // Ctrl+V — off the main thread so the sleep doesn't block the UI.
        tauri::async_runtime::spawn_blocking(|| {
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
        })
        .await
        .map_err(|e| format!("auto paste failed: {:?}", e))?;
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
pub fn update_content(id: i64, content: String) -> Result<String, String> {
    storage::update_content(id, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_note(id: i64, note: Option<String>) -> Result<(), String> {
    storage::update_note(id, note).map_err(|e| e.to_string())
}

// ---- Template commands ----

#[tauri::command]
pub fn get_templates() -> Result<TemplateListResult, String> {
    let templates = storage::get_all_templates().map_err(|e| e.to_string())?;
    Ok(TemplateListResult { templates })
}

#[tauri::command]
pub fn add_template(title: String, content: String) -> Result<Template, String> {
    storage::add_template(title, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_template(id: i64, title: String, content: String) -> Result<(), String> {
    storage::update_template(id, title, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_template(id: i64) -> Result<(), String> {
    storage::delete_template(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_clipboard_item(id: i64) -> Result<(), String> {
    if let Ok(Some(item)) = storage::get_item(id) {
        if let Some(ref p) = item.image_path {
            std::fs::remove_file(p).ok();
        }
        if let Some(ref p) = item.thumbnail_path {
            std::fs::remove_file(p).ok();
        }
    }
    storage::delete_item(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_text(ids: Vec<i64>, output_path: String) -> Result<ExportResult, String> {
    run_blocking(move || export::export_text(&ids, &output_path)).await
}

#[tauri::command]
pub async fn export_images(ids: Vec<i64>, output_dir: String) -> Result<ExportResult, String> {
    run_blocking(move || export::export_images(&ids, &output_dir)).await
}

#[tauri::command]
pub async fn backup(app: tauri::AppHandle, output_path: String) -> Result<BackupResult, String> {
    run_blocking(move || {
        export::backup(&output_path, |p| emit_progress(&app, "backup-progress", p))
    })
    .await
}

#[tauri::command]
pub async fn restore(app: tauri::AppHandle, backup_path: String) -> Result<RestoreResult, String> {
    run_blocking(move || {
        export::restore(&backup_path, |p| emit_progress(&app, "restore-progress", p))
    })
    .await
}

/// Emit a transfer progress event, throttled to ~10/s so 10000-item
/// backups don't flood the webview. Always emits the final (done==total).
fn emit_progress(app: &tauri::AppHandle, event: &str, p: TransferProgress) {
    const THROTTLE: std::time::Duration = std::time::Duration::from_millis(100);
    use std::sync::Mutex;
    static LAST: Mutex<Option<std::time::Instant>> = Mutex::new(None);
    let is_final = p.done == p.total;
    let mut lock = LAST.lock().unwrap_or_else(|e| e.into_inner());
    if lock.map(|t| t.elapsed() >= THROTTLE).unwrap_or(true) || is_final {
        *lock = Some(std::time::Instant::now());
        drop(lock);
        let _ = app.emit(event, p);
    }
}

#[tauri::command]
pub async fn clear_data_by_type(item_type: String) -> Result<usize, String> {
    run_blocking(move || storage::clear_data_by_type(&item_type)).await
}

#[tauri::command]
pub fn get_item_counts() -> Result<TypeCounts, String> {
    storage::get_item_counts()
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
    // Registration happens after persisting; a failure (e.g. the hotkey is
    // taken by another app) is reported back so the settings UI can show it.
    crate::hotkey::register(&app, &settings.hotkey)?;
    crate::tray::update_labels(&app).ok();
    Ok(())
}

#[tauri::command]
pub fn get_source_apps() -> Result<Vec<String>, String> {
    storage::get_source_apps().map_err(|e| e.to_string())
}

/// Returns the exe's directory (portable app root) and creates the
/// `exports`/`backups` subdirs. File dialogs default to these paths.
#[tauri::command]
pub fn get_app_dirs() -> Result<crate::models::AppDirs, String> {
    let app_root = crate::APP_DATA_DIR
        .get()
        .ok_or("app data dir not initialized")?;
    let exports_dir = app_root.join("exports");
    let backups_dir = app_root.join("backups");
    std::fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    Ok(crate::models::AppDirs {
        app_root: app_root.to_string_lossy().to_string(),
        exports_dir: exports_dir.to_string_lossy().to_string(),
        backups_dir: backups_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn get_statistics() -> Result<Statistics, String> {
    let dir = crate::APP_DATA_DIR
        .get()
        .ok_or("app data dir not initialized")?
        .clone();
    run_blocking(move || stats::get_statistics(&dir)).await
}

#[cfg(target_os = "windows")]
fn set_clipboard_text(text: &str) -> Result<(), CopyError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    unsafe {
        use windows_sys::Win32::System::DataExchange::*;
        use windows_sys::Win32::System::Memory::*;

        let wide: Vec<u16> = OsStr::new(text)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let size = wide.len() * std::mem::size_of::<u16>();
        let handle = GlobalAlloc(0x0002, size);
        if handle.is_null() {
            return Err(CopyError::new("clipboard_error"));
        }

        let ptr = GlobalLock(handle);
        if ptr.is_null() {
            return Err(CopyError::new("clipboard_error"));
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr as *mut u16, wide.len());
        GlobalUnlock(handle);

        if OpenClipboard(0) == 0 {
            return Err(CopyError::new("clipboard_error"));
        }
        EmptyClipboard();
        SetClipboardData(13, handle as _);
        CloseClipboard();
    }
    Ok(())
}

/// Put a PNG image file onto the Windows clipboard as CF_DIB so it can be
/// pasted into any application as an actual image (not a file path string).
#[cfg(target_os = "windows")]
fn set_clipboard_image(png_path: &str) -> Result<(), CopyError> {
    use image::GenericImageView;

    let png_data = std::fs::read(png_path).map_err(|_| CopyError::new("image_not_found"))?;
    let img = image::load_from_memory(&png_data).map_err(|_| CopyError::new("clipboard_error"))?;
    let (w, h) = img.dimensions();

    // Build a top-down DIB with 32-bit BGRA pixel data.
    // BITMAPINFOHEADER (40 bytes) + pixel rows (4-byte aligned).
    let row_size = (w * 32).div_ceil(32) * 4;
    let pixel_size = row_size as usize * h as usize;
    let header_size = 40usize;
    let total_size = header_size + pixel_size;

    unsafe {
        use windows_sys::Win32::System::DataExchange::*;
        use windows_sys::Win32::System::Memory::*;

        let handle = GlobalAlloc(0x0002, total_size);
        if handle.is_null() {
            return Err(CopyError::new("clipboard_error"));
        }

        let ptr = GlobalLock(handle) as *mut u8;
        if ptr.is_null() {
            return Err(CopyError::new("clipboard_error"));
        }

        // Write BITMAPINFOHEADER
        let buf = std::slice::from_raw_parts_mut(ptr, total_size);
        buf[0..4].copy_from_slice(&40u32.to_le_bytes()); // biSize
        buf[4..8].copy_from_slice(&(w as i32).to_le_bytes()); // biWidth
        buf[8..12].copy_from_slice(&(-(h as i32)).to_le_bytes()); // biHeight (negative = top-down)
        buf[12..14].copy_from_slice(&1u16.to_le_bytes()); // biPlanes
        buf[14..16].copy_from_slice(&32u16.to_le_bytes()); // biBitCount
        buf[16..20].copy_from_slice(&0u32.to_le_bytes()); // biCompression = BI_RGB
        buf[20..24].copy_from_slice(&(pixel_size as u32).to_le_bytes()); // biSizeImage
                                                                         // biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant all zero

        // biHeight is negative (top-down DIB), so row 0 = top of image.
        // No row flipping needed — write rows in natural order.
        for y in 0..h {
            let dst_offset = header_size + y as usize * row_size as usize;
            for x in 0..w {
                let pixel = img.get_pixel(x, y);
                let px_offset = dst_offset + x as usize * 4;
                buf[px_offset] = pixel[2]; // B
                buf[px_offset + 1] = pixel[1]; // G
                buf[px_offset + 2] = pixel[0]; // R
                buf[px_offset + 3] = pixel[3]; // A
            }
        }

        GlobalUnlock(handle);

        if OpenClipboard(0) == 0 {
            return Err(CopyError::new("clipboard_error"));
        }
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
fn set_clipboard_file_list(paths_json: &str) -> Result<(), CopyError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let paths: Vec<String> =
        serde_json::from_str(paths_json).map_err(|_| CopyError::new("parse_error"))?;

    if paths.is_empty() {
        return Err(CopyError::new("parse_error"));
    }

    // Check all files exist before setting clipboard
    let missing: Vec<&str> = paths
        .iter()
        .filter(|p| !std::path::Path::new(p).exists())
        .map(|p| p.as_str())
        .collect();
    if !missing.is_empty() {
        let count = missing.len() as u32;
        return Err(if count == 1 {
            CopyError::new("file_not_found")
        } else {
            CopyError::with_count("files_not_found", count)
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
        if handle.is_null() {
            return Err(CopyError::new("clipboard_error"));
        }

        let ptr = GlobalLock(handle) as *mut u8;
        if ptr.is_null() {
            return Err(CopyError::new("clipboard_error"));
        }

        let buf = std::slice::from_raw_parts_mut(ptr, total_size);

        // DROPFILES header
        buf[0..4].copy_from_slice(&(dropfiles_size as u32).to_le_bytes()); // pFiles = offset to file list
        buf[4..8].copy_from_slice(&0u32.to_le_bytes()); // pt.x
        buf[8..12].copy_from_slice(&0u32.to_le_bytes()); // pt.y
        buf[12..16].copy_from_slice(&0u32.to_le_bytes()); // fNC = FALSE
        buf[16..20].copy_from_slice(&1u32.to_le_bytes()); // fWide = TRUE

        // File list immediately after header
        let file_list_ptr = ptr.add(dropfiles_size) as *mut u16;
        std::ptr::copy_nonoverlapping(wide_data.as_ptr(), file_list_ptr, wide_data.len());

        GlobalUnlock(handle);

        if OpenClipboard(0) == 0 {
            return Err(CopyError::new("clipboard_error"));
        }
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
/// Drags the CALLING window (main title bar and preview title bar both use it).
#[tauri::command]
pub fn start_drag(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::*;
        use windows_sys::Win32::UI::WindowsAndMessaging::*;

        // ReleaseCapture is not exported by windows-sys 0.52 — declare it ourselves
        extern "system" {
            fn ReleaseCapture() -> BOOL;
        }

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
        unsafe {
            ReleaseCapture();
        }

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
    }
    #[cfg(not(target_os = "windows"))]
    Err("Not supported".to_string())
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
    // Check file exists before opening preview window ("Image file not
    // found" is matched by the frontend to clean up the dead card)
    if !std::path::Path::new(&path).exists() {
        return Err("Image file not found".to_string());
    }
    // Only images owned by this app may be previewed
    ensure_inside_app_data(&path)?;

    let id = PREVIEW_ID.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let label = format!("image-preview-{}", id);

    // Store path keyed by this window's label
    PENDING_PATHS
        .lock()
        .map_err(|e| e.to_string())?
        .insert(label.clone(), path);

    // Close the previous preview window if it still exists
    if id > 0 {
        let prev_label = format!("image-preview-{}", id - 1);
        if let Some(old) = app.get_webview_window(&prev_label) {
            old.close().ok();
        }
    }

    // Native window title (taskbar/alt-tab) follows the UI language;
    // the in-page title bar strings are localized in preview.html.
    let title = match storage::get_all_settings()
        .map(|s| s.language)
        .unwrap_or_default()
    {
        lang if lang.starts_with("zh") => "图片预览",
        _ => "Image Preview",
    };

    let result = std::thread::spawn(move || {
        tauri::WebviewWindow::builder(&app, &label, tauri::WebviewUrl::App("preview.html".into()))
            .title(title)
            .inner_size(900.0, 700.0)
            .center()
            .resizable(true)
            .always_on_top(true)
            // Hidden until preview.html reports the image is loaded
            // (show_preview_window) — avoids a blank-window flash.
            .visible(false)
            // Custom title bar in preview.html, matching the main window.
            .decorations(false)
            .build()
    })
    .join()
    .map_err(|e| format!("Thread panicked: {:?}", e))?;

    result
        .map(|_| ())
        .map_err(|e| format!("Failed to create preview window: {}", e))
}

/// Retrieve the image path for the calling preview window.
/// Uses `tauri::Window` injection to look up this window's own path
/// in the HashMap — no cross-window contamination.
#[tauri::command]
pub fn get_preview_image_path(window: tauri::Window) -> Result<String, String> {
    let label = window.label().to_string();
    PENDING_PATHS
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&label)
        .ok_or_else(|| format!("No image path for {}", label))
}

/// Close the window that made this call (used by the preview window).
#[tauri::command]
pub fn close_preview_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/// Show the calling preview window once its content is ready.
/// The window is built hidden (open_image_preview) and revealed here.
#[tauri::command]
pub fn show_preview_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_daily_counts(year: i32, month: i32) -> Result<Vec<(String, i64)>, String> {
    stats::get_daily_counts(year, month)
}
