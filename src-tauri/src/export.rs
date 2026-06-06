use std::fs;
use std::io::Write;
use std::path::PathBuf;
use crate::storage;

pub fn export_text(ids: &[i64], output_path: &str) -> Result<String, String> {
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

    Ok(format!("Exported {} text items", count))
}

pub fn export_images(ids: &[i64], output_dir: &str) -> Result<String, String> {
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

    Ok(format!("Exported {} images", count))
}

pub fn backup(output_path: &str) -> Result<String, String> {
    let items = storage::get_all_items_for_backup().map_err(|e| e.to_string())?;
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
    Ok(format!("Backup saved to {}", output_path))
}

pub fn restore(backup_path: &str) -> Result<String, String> {
    let file = fs::File::open(backup_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let json_entry = archive.by_name("clipboard_data.json").map_err(|e| e.to_string())?;
    let items: Vec<crate::models::ClipboardItem> =
        serde_json::from_reader(json_entry).map_err(|e| e.to_string())?;

    let p = PathBuf::from(backup_path);
    let app_data = p.parent().and_then(|pp| pp.parent())
        .map(|pp| pp.to_string_lossy().to_string())
        .unwrap_or_default();
    let images_dir = PathBuf::from(&app_data).join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.starts_with("images/") {
            let dest = images_dir.join(&name["images/".len()..]);
            let mut f = fs::File::create(&dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
        }
    }

    let count = storage::restore_from_backup(&items).map_err(|e| e.to_string())?;
    Ok(format!("Restored {} items", count))
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
