use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;
use crate::models::{ClipboardItem, ItemType};
use crate::storage;

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

            let format = if IsClipboardFormatAvailable(8) != 0 { 8 }
                        else if IsClipboardFormatAvailable(2) != 0 { 2 }
                        else { CloseClipboard(); return None; };

            let handle = GetClipboardData(format);
            if handle == 0 { CloseClipboard(); return None; }

            let ptr = GlobalLock(handle as _) as *const u8;
            if ptr.is_null() { GlobalUnlock(handle as _); CloseClipboard(); return None; }
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
                None
            }
        }
    }

    fn dib_to_png(dib: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
        use std::io::Cursor;
        if dib.len() < 40 { return None; }

        let _header_size = u32::from_le_bytes([dib[0], dib[1], dib[2], dib[3]]) as usize;
        let width = i32::from_le_bytes([dib[4], dib[5], dib[6], dib[7]]);
        let height = i32::from_le_bytes([dib[8], dib[9], dib[10], dib[11]]);
        let bit_count = u16::from_le_bytes([dib[14], dib[15]]);
        let abs_height = height.unsigned_abs();
        let abs_width = width.unsigned_abs();
        if abs_width == 0 || abs_height == 0 { return None; }

        let _row_size = ((abs_width * bit_count as u32 + 31) / 32) * 4;
        let file_size = 14 + dib.len();
        let mut bmp = Vec::with_capacity(file_size);
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&(file_size as u32).to_le_bytes());
        bmp.extend_from_slice(&[0u8; 4]);
        bmp.extend_from_slice(&((14 + dib.len()) as u32).to_le_bytes());
        bmp.extend_from_slice(dib);

        let img = image::load_from_memory(&bmp).ok()?;
        let mut png_bytes = Vec::new();
        img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png).ok()?;
        Some((png_bytes, img.width(), img.height()))
    }

    pub fn get_clipboard_file_list() -> Option<String> {
        unsafe {
            use windows_sys::Win32::System::DataExchange::*;
            use windows_sys::Win32::System::Memory::*;

            if OpenClipboard(0) == 0 { return None; }
            let handle = GetClipboardData(15); // CF_HDROP
            if handle == 0 { CloseClipboard(); return None; }

            let ptr = GlobalLock(handle as _) as *const u8;
            if ptr.is_null() { GlobalUnlock(handle as _); CloseClipboard(); return None; }

            let drop_files = ptr as *const u32;
            let offset = *drop_files.add(4) as usize;
            let file_ptr = ptr.add(offset);
            let mut paths = Vec::new();
            let mut pos: usize = 0;
            loop {
                if pos > 65536 { break; }
                let ch = *(file_ptr.add(pos) as *const u16);
                if ch == 0 {
                    if pos > 0 && *(file_ptr.add(pos - 2) as *const u16) == 0 { break; }
                    if pos > 0 {
                        let wide_slice = std::slice::from_raw_parts(file_ptr as *const u16, pos / 2);
                        paths.push(OsString::from_wide(wide_slice).to_string_lossy().to_string());
                    }
                    pos += 2;
                } else {
                    pos += 2;
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
    let mut last_hash: u64 = 0;

    loop {
        std::thread::sleep(Duration::from_millis(300));

        let current_hash = compute_clipboard_hash();
        if current_hash == 0 || current_hash == last_hash {
            continue;
        }
        last_hash = current_hash;

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
            if text.trim().is_empty() { None }
            else {
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
            None
        };

        if let Some(item) = item {
            if let Ok(id) = storage::insert_item(&item, &images_dir) {
                if let Ok(settings) = storage::get_all_settings() {
                    storage::cleanup_old_items(settings.max_items, settings.max_images).ok();
                }
                if let Ok(Some(full_item)) = storage::get_item(id) {
                    app_handle.emit("clipboard-changed", &full_item).ok();
                }
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
        let formats = [13u32, 8, 2, 15];
        for fmt in &formats {
            if IsClipboardFormatAvailable(*fmt) != 0 { fmt.hash(&mut hasher); }
        }
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
        CloseClipboard();
    }
    hasher.finish()
}
