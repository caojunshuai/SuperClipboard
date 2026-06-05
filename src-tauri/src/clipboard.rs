use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;
use crate::models::{ClipboardItem, ItemType};
use crate::storage;

/// Write a debug line to the log file in the current directory.
/// Use to trace clipboard monitor behaviour without a console.
macro_rules! debug_log {
    ($($arg:tt)*) => {{
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true).append(true)
            .open("superclipboard_debug.log")
        {
            use std::io::Write;
            let ts = chrono::Local::now().format("%H:%M:%S%.3f");
            let _ = writeln!(f, "[{}] {}", ts, format!($($arg)*));
        }
    }};
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

            if OpenClipboard(0) == 0 {
                debug_log!("get_clipboard_image: OpenClipboard failed");
                return None;
            }

            // Check which formats are actually available
            let has_dib = IsClipboardFormatAvailable(8) != 0;
            let has_dibv5 = IsClipboardFormatAvailable(17) != 0;
            let has_bitmap = IsClipboardFormatAvailable(2) != 0;
            debug_log!("get_clipboard_image: CF_DIB={} CF_DIBV5={} CF_BITMAP={}", has_dib, has_dibv5, has_bitmap);

            let format = if has_dib { 8 }
                        else if has_dibv5 { 17 }
                        else if has_bitmap { 2 }
                        else { CloseClipboard(); return None; };

            let handle = GetClipboardData(format);
            if handle == 0 {
                debug_log!("get_clipboard_image: GetClipboardData({}) returned NULL", format);
                CloseClipboard(); return None;
            }

            let ptr = GlobalLock(handle as _) as *const u8;
            if ptr.is_null() {
                debug_log!("get_clipboard_image: GlobalLock returned NULL for format {}", format);
                CloseClipboard(); return None;
            }
            let size = GlobalSize(handle as _) as usize;
            debug_log!("get_clipboard_image: format={} size={} bytes", format, size);
            let dib_data = std::slice::from_raw_parts(ptr, size).to_vec();
            GlobalUnlock(handle as _);
            CloseClipboard();

            if let Some((png_data, width, height)) = dib_to_png(&dib_data) {
                debug_log!("get_clipboard_image: dib_to_png OK {}x{} png={}B", width, height, png_data.len());
                let ts = chrono::Local::now().format("%Y%m%d%H%M%S%3f");
                let filename = format!("img_{}.png", ts);
                let img_path = images_dir.join(&filename);
                let thumb_path = thumbs_dir.join(&filename);

                std::fs::write(&img_path, &png_data).ok()?;

                if let Ok(img) = image::load_from_memory(&png_data) {
                    let thumb = img.thumbnail(120, 120);
                    thumb.save(&thumb_path).ok()?;
                }

                Some((
                    img_path.to_string_lossy().to_string(),
                    thumb_path.to_string_lossy().to_string(),
                    format!("{}x{}", width, height),
                ))
            } else {
                debug_log!("get_clipboard_image: dib_to_png returned None (len={} header_size={})",
                    dib_data.len(),
                    if dib_data.len() >= 4 {
                        u32::from_le_bytes([dib_data[0], dib_data[1], dib_data[2], dib_data[3]]) as usize
                    } else { 0 }
                );
                None
            }
        }
    }

    fn dib_to_png(dib: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
        use std::io::Cursor;
        if dib.len() < 40 {
            debug_log!("dib_to_png: dib too short ({})", dib.len());
            return None;
        }

        let header_size = u32::from_le_bytes([dib[0], dib[1], dib[2], dib[3]]) as usize;
        if dib.len() < header_size {
            debug_log!("dib_to_png: dib smaller than header ({} < {})", dib.len(), header_size);
            return None;
        }

        let width = i32::from_le_bytes([dib[4], dib[5], dib[6], dib[7]]);
        let height = i32::from_le_bytes([dib[8], dib[9], dib[10], dib[11]]);
        let bit_count = u16::from_le_bytes([dib[14], dib[15]]);
        let compression = if header_size >= 20 {
            u32::from_le_bytes([dib[16], dib[17], dib[18], dib[19]])
        } else {
            0 // BI_RGB
        };
        let abs_height = height.unsigned_abs();
        let abs_width = width.unsigned_abs();
        debug_log!("dib_to_png: {}x{} bpp={} compression={} topdown={}",
            abs_width, abs_height, bit_count, compression, height < 0);

        if abs_width == 0 || abs_height == 0 {
            debug_log!("dib_to_png: zero dimensions");
            return None;
        }

        // Color table size: only present for indexed formats (≤8 bpp),
        // or for BI_BITFIELDS (compression=3) with 16/32 bpp.
        let color_table_size: usize = match bit_count {
            1 => 2 * 4,
            4 => 16 * 4,
            8 => 256 * 4,
            _ => {
                if compression == 3 { // BI_BITFIELDS
                    if bit_count == 16 { 3 * 4 }
                    else if bit_count == 32 { 4 * 4 }
                    else { 0 }
                } else { 0 }
            }
        };

        let pixel_offset: u32 = (14 + header_size + color_table_size) as u32;
        let file_size = 14 + dib.len();
        debug_log!("dib_to_png: building BMP file_size={} pixel_offset={} color_table={}",
            file_size, pixel_offset, color_table_size);

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
            Err(e) => {
                debug_log!("dib_to_png: image::load_from_memory failed: {}", e);
                None
            }
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
            //   offset 4:  pt.x   (LONG)
            //   offset 8:  pt.y   (LONG)
            //   offset 12: fNC    (BOOL)
            //   offset 16: fWide  (BOOL)  — TRUE = Unicode, FALSE = ANSI
            let drop_files = ptr as *const u32;
            let file_offset = *drop_files as usize;       // pFiles — was .add(4) which read fWide
            let f_wide = *drop_files.add(4) != 0;         // offset 16 = fWide

            // File list: NUL-terminated strings, list ends with double NUL.
            // Use read_unaligned to safely handle any alignment.
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
                        // Double NUL — end of file list
                        break;
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
}

pub fn run_monitor(
    app_handle: tauri::AppHandle,
    images_dir: PathBuf,
    thumbs_dir: PathBuf,
) {
    debug_log!("monitor started — images_dir={}", images_dir.display());
    let mut last_hash: u64 = 0;

    loop {
        std::thread::sleep(Duration::from_millis(300));

        let current_hash = compute_clipboard_hash();
        if current_hash == 0 {
            // OpenClipboard failed — another process likely owns it
            continue;
        }
        if current_hash == last_hash {
            continue;
        }
        debug_log!("hash changed: {} → {}", last_hash, current_hash);
        last_hash = current_hash;

        let item = if let Some((img_path, thumb_path, size)) =
            win::get_clipboard_image(&images_dir, &thumbs_dir)
        {
            debug_log!("  → image: {} {}", img_path, size);
            Some(ClipboardItem {
                id: 0,
                item_type: ItemType::Image,
                content: None,
                image_path: Some(img_path),
                thumbnail_path: Some(thumb_path),
                file_paths: None,
                source_app: None,
                char_count: None,
                image_size: Some(size),
                is_pinned: false,
                is_favorite: false,
                metadata: None,
                created_at: String::new(),
                updated_at: String::new(),
            })
        } else if let Some(paths) = win::get_clipboard_file_list() {
            debug_log!("  → file: {}", &paths[..paths.len().min(120)]);
            Some(ClipboardItem {
                id: 0,
                item_type: ItemType::File,
                content: None,
                image_path: None,
                thumbnail_path: None,
                file_paths: Some(paths),
                source_app: None,
                char_count: None,
                image_size: None,
                is_pinned: false,
                is_favorite: false,
                metadata: None,
                created_at: String::new(),
                updated_at: String::new(),
            })
        } else if let Some(text) = win::get_clipboard_text() {
            if text.trim().is_empty() {
                debug_log!("  → text was whitespace-only, skipping");
                None
            } else {
                debug_log!("  → text: {}", &text[..text.len().min(80)]);
                let char_count = text.chars().count() as i64;
                Some(ClipboardItem {
                    id: 0,
                    item_type: ItemType::Text,
                    content: Some(text),
                    image_path: None,
                    thumbnail_path: None,
                    file_paths: None,
                    source_app: None,
                    char_count: Some(char_count),
                    image_size: None,
                    is_pinned: false,
                    is_favorite: false,
                    metadata: None,
                    created_at: String::new(),
                    updated_at: String::new(),
                })
            }
        } else {
            debug_log!("  → no readable content (image/file/text all returned None)");
            None
        };

        if let Some(item) = item {
            match storage::insert_item(&item, &images_dir) {
                Ok(id) => {
                    debug_log!("  → inserted id={}", id);
                    if let Ok(settings) = storage::get_all_settings() {
                        storage::cleanup_old_items(settings.max_items, settings.max_images).ok();
                    }
                    if let Ok(Some(full_item)) = storage::get_item(id) {
                        app_handle.emit("clipboard-changed", &full_item).ok();
                    }
                }
                Err(e) => debug_log!("  → insert error: {}", e),
            }
        }
    }
}

fn compute_clipboard_hash() -> u64 {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    let mut hasher = DefaultHasher::new();

    #[cfg(target_os = "windows")]
    unsafe {
        use windows_sys::Win32::System::DataExchange::*;
        use windows_sys::Win32::System::Memory::*;

        if OpenClipboard(0) == 0 { return 0; }
        // CF_UNICODETEXT=13, CF_DIB=8, CF_BITMAP=2, CF_HDROP=15, CF_DIBV5=17
        let formats = [13u32, 8, 2, 15, 17];
        for fmt in &formats {
            if IsClipboardFormatAvailable(*fmt) != 0 { fmt.hash(&mut hasher); }
        }

        // Hash text content (first 256 bytes)
        let text_handle = GetClipboardData(13);
        if text_handle != 0 {
            let ptr = GlobalLock(text_handle as _);
            if !ptr.is_null() {
                let size = GlobalSize(text_handle as _) as usize;
                if size > 0 && size < 65536 {
                    let slice = std::slice::from_raw_parts(ptr as *const u8, size.min(256));
                    slice.hash(&mut hasher);
                }
                GlobalUnlock(text_handle as _);
            }
        }

        // Hash image content (first 512 bytes of DIB/DIBV5) so that copying
        // two different images produces different hashes. Without this the
        // hash only reflects format-availability and two images in a row
        // would be treated as unchanged.
        for img_fmt in [8u32, 17] { // CF_DIB, CF_DIBV5
            let handle = GetClipboardData(img_fmt);
            if handle != 0 {
                let ptr = GlobalLock(handle as _);
                if !ptr.is_null() {
                    let size = GlobalSize(handle as _) as usize;
                    if size > 40 && size < 104_857_600 {
                        let slice = std::slice::from_raw_parts(ptr as *const u8, size.min(512));
                        slice.hash(&mut hasher);
                    }
                    GlobalUnlock(handle as _);
                }
            }
        }

        CloseClipboard();
    }
    hasher.finish()
}
