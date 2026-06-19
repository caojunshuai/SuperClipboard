use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Emitter;
use crate::models::{ClipboardItem, ItemType};
use crate::storage;

/// FNV-1a 64-bit hash — deterministic, no dependencies, fast.
/// Used for content deduplication across sessions.
fn fnv1a_64(data: &[u8]) -> i64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash as i64
}

/// Generate a Lanczos3 thumbnail at 360px max dimension from PNG bytes.
/// Shared by clipboard capture and backup restore paths.
pub fn generate_thumbnail(png_data: &[u8], output_path: &Path) -> bool {
    if let Ok(img) = image::load_from_memory(png_data) {
        let max_dim = 360u32;
        let (w, h) = (img.width(), img.height());
        let (nw, nh) = if w > h {
            let ratio = max_dim as f64 / w as f64;
            (max_dim, (h as f64 * ratio).round() as u32)
        } else {
            let ratio = max_dim as f64 / h as f64;
            ((w as f64 * ratio).round() as u32, max_dim)
        };
        let thumb = img.resize_exact(nw, nh, image::imageops::FilterType::Lanczos3);
        return thumb.save(output_path).is_ok();
    }
    false
}

/// Compute a deterministic content hash for dedup, based on the item type.
fn compute_content_hash(item: &ClipboardItem) -> Option<i64> {
    match item.item_type {
        ItemType::Text => {
            item.content.as_ref().map(|text| fnv1a_64(text.as_bytes()))
        }
        ItemType::Image => {
            // Hash the saved PNG file bytes so two copies of the same image
            // produce the same hash regardless of filename.
            item.image_path.as_ref().and_then(|path| {
                std::fs::read(path).ok().map(|data| fnv1a_64(&data))
            })
        }
        ItemType::File => {
            item.file_paths.as_ref().map(|paths| fnv1a_64(paths.as_bytes()))
        }
    }
}

#[cfg(target_os = "windows")]
fn get_clipboard_sequence_number() -> u32 {
    unsafe { windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber() }
}

#[cfg(target_os = "windows")]
mod win {
    use std::path::PathBuf;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    pub fn get_clipboard_text() -> Option<String> {
        unsafe {
            use windows_sys::Win32::System::DataExchange::*;
            use windows_sys::Win32::System::Memory::*;

            if OpenClipboard(0) == 0 { return None; }
            let handle = GetClipboardData(13); // CF_UNICODETEXT
            if handle == 0 { CloseClipboard(); return None; }

            let ptr = GlobalLock(handle as _) as *const u16;
            if ptr.is_null() { GlobalUnlock(handle as _); CloseClipboard(); return None; }

            let mut len = 0;
            while *ptr.add(len) != 0 { len += 1; }
            let slice = std::slice::from_raw_parts(ptr, len);
            let text = OsString::from_wide(slice).to_string_lossy().to_string();

            GlobalUnlock(handle as _);
            CloseClipboard();
            Some(text)
        }
    }

    pub fn get_clipboard_image(images_dir: &PathBuf, thumbs_dir: &PathBuf) -> Option<(String, String, String)> {
        std::fs::create_dir_all(images_dir).ok();
        std::fs::create_dir_all(thumbs_dir).ok();

        unsafe {
            use windows_sys::Win32::System::DataExchange::*;
            use windows_sys::Win32::System::Memory::*;

            if OpenClipboard(0) == 0 { return None; }

            let format = if IsClipboardFormatAvailable(8) != 0 { 8 }       // CF_DIB
                        else if IsClipboardFormatAvailable(17) != 0 { 17 }  // CF_DIBV5
                        else if IsClipboardFormatAvailable(2) != 0 { 2 }    // CF_BITMAP
                        else { CloseClipboard(); return None; };

            let handle = GetClipboardData(format);
            if handle == 0 { CloseClipboard(); return None; }

            let ptr = GlobalLock(handle as _) as *const u8;
            if ptr.is_null() { CloseClipboard(); return None; }
            let size = GlobalSize(handle as _) as usize;
            let dib_data = std::slice::from_raw_parts(ptr, size).to_vec();
            GlobalUnlock(handle as _);
            CloseClipboard();

            if let Some((png_data, width, height)) = dib_to_png(&dib_data) {
                let ts = chrono::Local::now().format("%Y%m%d%H%M%S%3f");
                let filename = format!("img_{}.png", ts);
                let img_path = images_dir.join(&filename);
                let thumb_path = thumbs_dir.join(&filename);

                std::fs::write(&img_path, &png_data).ok()?;

                super::generate_thumbnail(&png_data, &thumb_path);

                Some((
                    img_path.to_string_lossy().to_string(),
                    thumb_path.to_string_lossy().to_string(),
                    format!("{}x{}", width, height),
                ))
            } else {
                None
            }
        }
    }

    fn dib_to_png(dib: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
        use std::io::Cursor;
        if dib.len() < 40 { return None; }

        let header_size = u32::from_le_bytes([dib[0], dib[1], dib[2], dib[3]]) as usize;
        if dib.len() < header_size { return None; }

        let width = i32::from_le_bytes([dib[4], dib[5], dib[6], dib[7]]);
        let height = i32::from_le_bytes([dib[8], dib[9], dib[10], dib[11]]);
        let bit_count = u16::from_le_bytes([dib[14], dib[15]]);
        let abs_height = height.unsigned_abs();
        let abs_width = width.unsigned_abs();

        if abs_width == 0 || abs_height == 0 { return None; }

        // Compute expected pixel data size (BMP rows are 4-byte aligned).
        let row_size = ((abs_width * bit_count as u32 + 31) / 32) * 4;
        let expected_pixels = row_size as usize * abs_height as usize;

        // The DIB from clipboard = header + optional masks/color-table + pixel data.
        // Compute color table size from what's left after subtracting header and expected pixels.
        let color_table_size: usize = if dib.len() > header_size + expected_pixels {
            dib.len() - header_size - expected_pixels
        } else {
            0
        };

        let pixel_offset: u32 = (14 + header_size + color_table_size) as u32;
        let file_size = 14 + dib.len();

        let mut bmp = Vec::with_capacity(file_size);
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&(file_size as u32).to_le_bytes());
        bmp.extend_from_slice(&[0u8; 4]);
        bmp.extend_from_slice(&pixel_offset.to_le_bytes());
        bmp.extend_from_slice(dib);

        match image::load_from_memory(&bmp) {
            Ok(img) => {
                let mut png_bytes = Vec::new();
                img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png).ok()?;
                Some((png_bytes, img.width(), img.height()))
            }
            Err(_) => None,
        }
    }

    pub fn get_clipboard_file_list() -> Option<String> {
        unsafe {
            use windows_sys::Win32::System::DataExchange::*;
            use windows_sys::Win32::System::Memory::*;

            if OpenClipboard(0) == 0 { return None; }
            let handle = GetClipboardData(15); // CF_HDROP
            if handle == 0 { CloseClipboard(); return None; }

            let ptr = GlobalLock(handle as _);
            if ptr.is_null() { CloseClipboard(); return None; }

            // DROPFILES structure layout (all fields are DWORD-aligned):
            //   offset 0:  pFiles (DWORD) — byte offset from struct start to file list
            //   offset 16: fWide  (BOOL)  — TRUE = Unicode, FALSE = ANSI
            let drop_files = ptr as *const u32;
            let file_offset = *drop_files as usize;
            let f_wide = *drop_files.add(4) != 0;

            let file_ptr = (ptr as *const u8).add(file_offset);
            let char_size: usize = if f_wide { 2 } else { 1 };
            let mut paths = Vec::new();
            let mut pos: usize = 0;
            let mut path_start: usize = 0;
            loop {
                if pos > 65536 { break; }

                let raw = file_ptr.add(pos);
                let ch: u16 = if f_wide {
                    std::ptr::read_unaligned(raw as *const u16)
                } else {
                    std::ptr::read_unaligned(raw as *const u8) as u16
                };

                if ch == 0 {
                    let len_bytes = pos - path_start;
                    if len_bytes > 0 {
                        if f_wide {
                            let wide_slice = std::slice::from_raw_parts(
                                file_ptr.add(path_start) as *const u16,
                                len_bytes / 2,
                            );
                            paths.push(OsString::from_wide(wide_slice).to_string_lossy().to_string());
                        } else {
                            let ansi_slice = std::slice::from_raw_parts(file_ptr.add(path_start), len_bytes);
                            paths.push(String::from_utf8_lossy(ansi_slice).to_string());
                        }
                    } else {
                        break; // Double NUL — end of file list
                    }
                    pos += char_size;
                    path_start = pos;
                } else {
                    pos += char_size;
                }
            }

            GlobalUnlock(handle as _);
            CloseClipboard();

            if paths.is_empty() { None }
            else { Some(serde_json::to_string(&paths).unwrap_or_default()) }
        }
    }

    /// Get the filename of the foreground window's process, e.g. "chrome.exe".
    pub fn get_foreground_app_name() -> Option<String> {
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
            use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
            use windows_sys::Win32::Foundation::CloseHandle;

            let hwnd = GetForegroundWindow();
            if hwnd == 0 { return None; }

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 { return None; }

            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle == 0 { return None; }

            let mut exe_buf = [0u16; 260];
            let mut len = exe_buf.len() as u32;
            let result = QueryFullProcessImageNameW(handle, 0, exe_buf.as_mut_ptr(), &mut len);
            CloseHandle(handle);

            if result == 0 { return None; }

            let path = String::from_utf16_lossy(&exe_buf[..len as usize]);
            std::path::Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
        }
    }
}

pub fn run_monitor(
    app_handle: tauri::AppHandle,
    images_dir: PathBuf,
    thumbs_dir: PathBuf,
) {
    let mut last_seq: u32 = 0;

    loop {
        std::thread::sleep(Duration::from_millis(300));

        #[cfg(target_os = "windows")]
        {
            let seq = get_clipboard_sequence_number();
            if seq == 0 || seq == last_seq {
                continue;
            }
            last_seq = seq;
        }

        // Filter out our own exe so we don't record "SuperClipboard.exe"
        // when the panel is the foreground window during a clipboard change.
        let source_app = win::get_foreground_app_name()
            .filter(|app| !app.eq_ignore_ascii_case("SuperClipboard.exe"));

        let item = if let Some((img_path, thumb_path, size)) =
            win::get_clipboard_image(&images_dir, &thumbs_dir)
        {
            Some(ClipboardItem {
                id: 0,
                item_type: ItemType::Image,
                content: None,
                image_path: Some(img_path),
                thumbnail_path: Some(thumb_path),
                file_paths: None,
                source_app: source_app.clone(),
                char_count: None,
                image_size: Some(size),
                is_pinned: false,
                is_favorite: false,
                metadata: None,
                content_hash: None,
                note: None,
                created_at: String::new(),
                updated_at: String::new(),
                image_exists: true,
            })
        } else if let Some(paths) = win::get_clipboard_file_list() {
            Some(ClipboardItem {
                id: 0,
                item_type: ItemType::File,
                content: None,
                image_path: None,
                thumbnail_path: None,
                file_paths: Some(paths),
                source_app: source_app.clone(),
                char_count: None,
                image_size: None,
                is_pinned: false,
                is_favorite: false,
                metadata: None,
                content_hash: None,
                note: None,
                created_at: String::new(),
                updated_at: String::new(),
                image_exists: true,
            })
        } else if let Some(text) = win::get_clipboard_text() {
            if text.trim().is_empty() {
                None
            } else {
                let char_count = text.chars().count() as i64;
                Some(ClipboardItem {
                    id: 0,
                    item_type: ItemType::Text,
                    content: Some(text),
                    image_path: None,
                    thumbnail_path: None,
                    file_paths: None,
                    source_app: source_app.clone(),
                    char_count: Some(char_count),
                    image_size: None,
                    is_pinned: false,
                    is_favorite: false,
                    metadata: None,
                    content_hash: None,
                    note: None,
                    created_at: String::new(),
                    updated_at: String::new(),
                    image_exists: true,
                })
            }
        } else {
            None
        };

        if let Some(mut item) = item {
            // Compute deterministic content hash for dedup
            item.content_hash = compute_content_hash(&item);

            match storage::upsert_item(&item) {
                Ok((id, is_new)) => {
                    if !is_new {
                        // Duplicate — clean up the just-saved image files since
                        // we're keeping the existing ones from the first copy.
                        if item.item_type == ItemType::Image {
                            if let Some(ref p) = item.image_path { std::fs::remove_file(p).ok(); }
                            if let Some(ref p) = item.thumbnail_path { std::fs::remove_file(p).ok(); }
                        }
                    }

                    if let Ok(settings) = storage::get_all_settings() {
                        storage::cleanup_old_items(settings.max_items, settings.max_images).ok();
                    }
                    if let Ok(Some(full_item)) = storage::get_item(id) {
                        app_handle.emit("clipboard-changed", &full_item).ok();
                    }
                }
                Err(e) => eprintln!("upsert error: {}", e),
            }
        }
    }
}
