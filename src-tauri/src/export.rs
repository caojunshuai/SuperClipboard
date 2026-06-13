use std::fs;
use std::io::Write;
use std::path::PathBuf;
use crate::models::{ExportResult, BackupResult, RestoreResult};
use crate::storage;

pub fn export_text(ids: &[i64], output_path: &str) -> Result<ExportResult, String> {
    let items = get_items_by_ids(ids)?;
    let mut file = fs::File::create(output_path).map_err(|e| e.to_string())?;
    let mut count = 0;

    for item in &items {
        if let Some(ref content) = item.content {
            if count > 0 {
                writeln!(file).map_err(|e| e.to_string())?;
            }
            writeln!(file, "--- {} ---", item.created_at)
                .map_err(|e| e.to_string())?;
            writeln!(file, "{}", content).map_err(|e| e.to_string())?;
            count += 1;
        }
    }

    Ok(ExportResult {
        count,
        output_path: output_path.to_string(),
    })
}

pub fn export_images(ids: &[i64], output_dir: &str) -> Result<ExportResult, String> {
    fs::create_dir_all(output_dir).map_err(|e| e.to_string())?;
    let items = get_items_by_ids(ids)?;
    let mut count = 0;

    for item in &items {
        if let Some(ref img_path) = item.image_path {
            let src = PathBuf::from(img_path);
            if src.exists() {
                let dest = PathBuf::from(output_dir).join(
                    src.file_name().unwrap_or_default()
                );
                fs::copy(&src, &dest).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }

    Ok(ExportResult {
        count,
        output_path: output_dir.to_string(),
    })
}

pub fn backup(output_path: &str) -> Result<BackupResult, String> {
    let items = storage::get_all_items_for_backup().map_err(|e| e.to_string())?;
    let count = items.len();
    let json = serde_json::to_string_pretty(&items).map_err(|e| e.to_string())?;

    let file = fs::File::create(output_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("clipboard_data.json", options).map_err(|e| e.to_string())?;
    zip.write_all(json.as_bytes()).map_err(|e| e.to_string())?;

    for item in &items {
        if let Some(ref img_path) = item.image_path {
            let src = PathBuf::from(img_path);
            if src.exists() {
                let name = src.file_name().unwrap_or_default().to_string_lossy();
                let zip_path = format!("images/{}", name);
                zip.start_file(&zip_path, options).map_err(|e| e.to_string())?;
                let data = fs::read(&src).map_err(|e| e.to_string())?;
                zip.write_all(&data).map_err(|e| e.to_string())?;
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(BackupResult {
        count,
        output_path: output_path.to_string(),
    })
}

pub fn restore(backup_path: &str) -> Result<RestoreResult, String> {
    let file = fs::File::open(backup_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let json_entry = archive.by_name("clipboard_data.json").map_err(|e| e.to_string())?;
    let items: Vec<crate::models::ClipboardItem> =
        serde_json::from_reader(json_entry).map_err(|e| e.to_string())?;

    let expected = items.len();

    // Get limits from settings
    let settings = storage::get_all_settings().map_err(|e| e.to_string())?;

    // Count current unprotected items (pinned/favorite items don't count toward limit)
    let (text_count, img_count) = storage::get_unprotected_counts().map_err(|e| e.to_string())?;

    let mut text_remaining = (settings.max_items - text_count).max(0);
    let mut img_remaining = (settings.max_images - img_count).max(0);

    // Use the real app data directory (not derived from backup path)
    let app_data = crate::APP_DATA_DIR.get()
        .cloned()
        .unwrap_or_default();
    let images_dir = app_data.join("images");
    let thumbs_dir = app_data.join("thumbnails");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&thumbs_dir).map_err(|e| e.to_string())?;

    let mut imported: usize = 0;
    let mut duplicates: usize = 0;
    let mut truncated = false;

    for item in &items {
        // Check type-specific capacity
        let is_image = item.item_type == crate::models::ItemType::Image;
        if is_image {
            if img_remaining <= 0 {
                truncated = true;
                break;
            }
        } else {
            if text_remaining <= 0 {
                truncated = true;
                break;
            }
        }

        // Try insert with dedup check.
        // Clone and update paths to point to the current app data dir.
        let mut item = item.clone();
        if is_image {
            if let Some(ref old_path) = item.image_path {
                let filename = PathBuf::from(old_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if !filename.is_empty() {
                    item.image_path = Some(images_dir.join(&filename).to_string_lossy().to_string());
                    item.thumbnail_path = Some(thumbs_dir.join(&filename).to_string_lossy().to_string());

                    // Extract image from zip and generate thumbnail
                    let zip_path = format!("images/{}", filename);
                    if let Ok(mut entry) = archive.by_name(&zip_path) {
                        let mut png_data = Vec::new();
                        if std::io::Read::read_to_end(&mut entry, &mut png_data).is_ok() {
                            // Save full image
                            fs::write(images_dir.join(&filename), &png_data).ok();
                            // Generate thumbnail
                            if let Ok(img) = image::load_from_memory(&png_data) {
                                let thumb = img.thumbnail(120, 120);
                                thumb.save(thumbs_dir.join(&filename)).ok();
                            }
                        }
                    }
                }
            }
        }

        match storage::try_restore_item(&item) {
            Ok(true) => {
                if is_image {
                    img_remaining -= 1;
                } else {
                    text_remaining -= 1;
                }
                imported += 1;
            }
            Ok(false) => {
                duplicates += 1;
            }
            Err(e) => return Err(e.to_string()),
        }
    }

    // Items we never processed because we broke early (truncated),
    // plus items that were processed but failed some check.
    // Items after breakpoint: we stopped iterating, so those are the
    // "could not import due to limits" count.
    let skipped_by_limit = if truncated {
        // The remaining items we didn't even try to import
        expected - imported - duplicates
    } else {
        0
    };

    Ok(RestoreResult {
        expected,
        imported,
        duplicates,
        truncated,
        skipped_by_limit,
        max_items: settings.max_items,
        max_images: settings.max_images,
    })
}

/// Get items by IDs. If ids is empty, returns ALL items.
fn get_items_by_ids(ids: &[i64]) -> Result<Vec<crate::models::ClipboardItem>, String> {
    if ids.is_empty() {
        return storage::get_all_items_for_backup().map_err(|e| e.to_string());
    }
    let mut result = Vec::new();
    for id in ids {
        if let Some(item) = storage::get_item(*id).map_err(|e| e.to_string())? {
            result.push(item);
        }
    }
    Ok(result)
}
