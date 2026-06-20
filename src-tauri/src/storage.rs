use rusqlite::{params, Connection, Result as SqliteResult, OptionalExtension};
use once_cell::sync::OnceCell;
use std::sync::Mutex;
use crate::models::*;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init_db(app_data_dir: &std::path::Path) -> SqliteResult<()> {
    std::fs::create_dir_all(app_data_dir).ok();
    let db_path = app_data_dir.join("superclipboard.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS clipboard_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            type            TEXT NOT NULL,
            content         TEXT,
            image_path      TEXT,
            thumbnail_path  TEXT,
            file_paths      TEXT,
            source_app      TEXT,
            char_count      INTEGER,
            image_size      TEXT,
            content_hash    INTEGER,
            is_pinned       INTEGER DEFAULT 0,
            is_favorite     INTEGER DEFAULT 0,
            metadata        TEXT,
            created_at      TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at      TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_type ON clipboard_items(type);
        CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_items(created_at);
        CREATE INDEX IF NOT EXISTS idx_pinned ON clipboard_items(is_pinned);
        CREATE INDEX IF NOT EXISTS idx_favorite ON clipboard_items(is_favorite);
        CREATE INDEX IF NOT EXISTS idx_dedup ON clipboard_items(type, content_hash);

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
            content,
            content=clipboard_items,
            content_rowid=id
        );

        CREATE TRIGGER IF NOT EXISTS clipboard_items_ai AFTER INSERT ON clipboard_items BEGIN
            INSERT INTO clipboard_fts(rowid, content) VALUES (new.id, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS clipboard_items_ad AFTER DELETE ON clipboard_items BEGIN
            INSERT INTO clipboard_fts(clipboard_fts, rowid, content) VALUES ('delete', old.id, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS clipboard_items_au AFTER UPDATE ON clipboard_items BEGIN
            INSERT INTO clipboard_fts(clipboard_fts, rowid, content) VALUES ('delete', old.id, old.content);
            INSERT INTO clipboard_fts(rowid, content) VALUES (new.id, new.content);
        END;
    ")?;

    // Migration: add content_hash column and dedup index for existing databases
    conn.execute("ALTER TABLE clipboard_items ADD COLUMN content_hash INTEGER", []).ok();
    conn.execute("CREATE INDEX IF NOT EXISTS idx_dedup ON clipboard_items(type, content_hash)", []).ok();
    // Migration: add note column
    conn.execute("ALTER TABLE clipboard_items ADD COLUMN note TEXT", []).ok();
    // Migration: add copy_count column
    conn.execute("ALTER TABLE clipboard_items ADD COLUMN copy_count INTEGER DEFAULT 0", []).ok();

    // Templates table
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS templates (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL DEFAULT '',
            content    TEXT NOT NULL DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
    ")?;

    // Seed preset templates only if table is empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM templates", [], |row| row.get(0))?;
    if count == 0 {
        let presets = vec![
            ("邮件签名", "祝好，\n{date}\n张三"),
            ("常用问候", "您好，我是张三。很高兴认识您！"),
            ("函数模板", "function name(params) {\n  // TODO\n}"),
            ("表格模板", "| 列A | 列B |\n|----|----|\n|  |  |"),
            ("快递地址", "收货人：张三\n电话：138xxxx\n地址："),
        ];
        for (i, (title, content)) in presets.iter().enumerate() {
            conn.execute(
                "INSERT INTO templates (title, content, sort_order) VALUES (?1, ?2, ?3)",
                params![title, content, i as i64],
            )?;
        }
    }

    DB.set(Mutex::new(conn)).map_err(|_| {
        rusqlite::Error::InvalidParameterName("DB already initialized".into())
    })?;

    Ok(())
}

fn get_conn() -> &'static Mutex<Connection> {
    DB.get().expect("Database not initialized")
}

/// Upsert a clipboard item. If an item with the same type and content_hash
/// already exists, update its timestamps instead of inserting a duplicate.
/// Returns (id, is_new_insert).
pub fn upsert_item(item: &ClipboardItem) -> SqliteResult<(i64, bool)> {
    let conn = get_conn().lock().unwrap();

    // Try dedup if we have a content hash
    if let Some(hash) = item.content_hash {
        if let Some(existing_id) = conn.query_row(
            "SELECT id FROM clipboard_items WHERE type = ?1 AND content_hash = ?2 ORDER BY created_at DESC LIMIT 1",
            params![item.item_type.as_str(), hash],
            |row| row.get(0),
        ).optional()? {
            // Duplicate found — bump timestamps and increment copy count
            conn.execute(
                "UPDATE clipboard_items SET updated_at = datetime('now', 'localtime'), created_at = datetime('now', 'localtime'), copy_count = copy_count + 1 WHERE id = ?1",
                params![existing_id],
            )?;
            return Ok((existing_id, false));
        }
    }

    // No duplicate — insert new row. copy_count starts at 1 (it was just copied once).
    conn.execute(
        "INSERT INTO clipboard_items (type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, metadata, content_hash, copy_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)",
        params![
            item.item_type.as_str(),
            item.content,
            item.image_path,
            item.thumbnail_path,
            item.file_paths,
            item.source_app,
            item.char_count,
            item.image_size,
            item.metadata,
            item.content_hash,
        ],
    )?;
    Ok((conn.last_insert_rowid(), true))
}

pub fn query_history(query: &HistoryQuery) -> SqliteResult<HistoryResult> {
    let conn = get_conn().lock().unwrap();

    let mut where_clauses: Vec<String> = Vec::new();
    let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref keyword) = query.keyword {
        if !keyword.is_empty() {
            // Use LIKE for all searches. FTS5 with the default unicode61 tokenizer
            // can't handle CJK (no word boundaries), and its MATCH syntax is fragile
            // (special characters, AND/OR semantics, etc.). For a clipboard manager
            // with at most a few thousand rows, LIKE with substring matching is
            // fast enough and more predictable.
            let idx = bind_values.len() + 1;
            where_clauses.push(format!("(content LIKE ?{} OR file_paths LIKE ?{} OR note LIKE ?{})", idx, idx, idx));
            bind_values.push(Box::new(format!("%{}%", keyword)));
        }
    }

    if let Some(ref t) = query.item_type {
        if t != "all" {
            let idx = bind_values.len() + 1;
            where_clauses.push(format!("type = ?{}", idx));
            bind_values.push(Box::new(t.clone()));
        }
    }

    if let Some(ref app) = query.source_app {
        let idx = bind_values.len() + 1;
        where_clauses.push(format!("source_app = ?{}", idx));
        bind_values.push(Box::new(app.clone()));
    }

    if let Some(ref from) = query.date_from {
        let idx = bind_values.len() + 1;
        where_clauses.push(format!("created_at >= ?{}", idx));
        bind_values.push(Box::new(from.clone()));
    }
    if let Some(ref to) = query.date_to {
        let idx = bind_values.len() + 1;
        where_clauses.push(format!("created_at <= ?{}", idx));
        bind_values.push(Box::new(to.clone()));
    }

    if query.tab.as_deref() == Some("favorites") {
        where_clauses.push("is_favorite = 1".to_string());
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) FROM clipboard_items {}", where_sql);
    let total: i64 = {
        let mut stmt = conn.prepare(&count_sql)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|b| b.as_ref()).collect();
        stmt.query_row(params_refs.as_slice(), |row| row.get(0))?
    };

    let limit_idx = bind_values.len() + 1;
    let offset_idx = bind_values.len() + 2;
    let query_sql = format!(
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, note, created_at, updated_at, copy_count
         FROM clipboard_items {}
         ORDER BY is_pinned DESC, created_at DESC
         LIMIT ?{} OFFSET ?{}",
        where_sql, limit_idx, offset_idx,
    );

    bind_values.push(Box::new(query.limit));
    bind_values.push(Box::new(query.offset));

    let mut stmt = conn.prepare(&query_sql)?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|b| b.as_ref()).collect();

    let mut items: Vec<ClipboardItem> = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            item_type: ItemType::from_str(&row.get::<_, String>(1)?).unwrap_or(ItemType::Text),
            content: row.get(2)?,
            image_path: row.get(3)?,
            thumbnail_path: row.get(4)?,
            file_paths: row.get(5)?,
            source_app: row.get(6)?,
            char_count: row.get(7)?,
            image_size: row.get(8)?,
            is_pinned: row.get::<_, i32>(9)? != 0,
            is_favorite: row.get::<_, i32>(10)? != 0,
            metadata: row.get(11)?,
            content_hash: row.get(12)?,
            note: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
            image_exists: true,
            copy_count: row.get(16)?,
        })
    })?.filter_map(|r| r.ok()).collect();

    // Check whether image files still exist on disk
    for item in &mut items {
        if item.item_type == ItemType::Image {
            if let Some(ref path) = item.image_path {
                if !std::path::Path::new(path).exists() {
                    item.image_exists = false;
                }
            }
        }
    }

    Ok(HistoryResult { items, total })
}

pub fn toggle_pin(id: i64) -> SqliteResult<bool> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "UPDATE clipboard_items SET is_pinned = CASE WHEN is_pinned = 0 THEN 1 ELSE 0 END, updated_at = datetime('now', 'localtime') WHERE id = ?1",
        params![id],
    )?;
    let val: i32 = conn.query_row("SELECT is_pinned FROM clipboard_items WHERE id = ?1", params![id], |row| row.get(0))?;
    Ok(val != 0)
}

pub fn toggle_favorite(id: i64) -> SqliteResult<bool> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "UPDATE clipboard_items SET is_favorite = CASE WHEN is_favorite = 0 THEN 1 ELSE 0 END, updated_at = datetime('now', 'localtime') WHERE id = ?1",
        params![id],
    )?;
    let val: i32 = conn.query_row("SELECT is_favorite FROM clipboard_items WHERE id = ?1", params![id], |row| row.get(0))?;
    Ok(val != 0)
}

pub fn update_content(id: i64, content: String) -> SqliteResult<String> {
    let conn = get_conn().lock().unwrap();
    let char_count = content.chars().count() as i64;
    let content_hash = crate::clipboard::fnv1a_64(content.as_bytes());

    // Check if another text item already has this content (cross-row dedup)
    let existing: Option<i64> = conn.query_row(
        "SELECT id FROM clipboard_items WHERE type = 'text' AND content_hash = ?1 AND id != ?2 LIMIT 1",
        params![content_hash, id],
        |row| row.get(0),
    ).optional()?;

    if let Some(existing_id) = existing {
        // Merge: bump the existing item's timestamp, delete the edited item
        conn.execute(
            "UPDATE clipboard_items SET created_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime') WHERE id = ?1",
            params![existing_id],
        )?;
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
        // Return empty string to signal "merged" to frontend
        Ok(String::new())
    } else {
        conn.execute(
            "UPDATE clipboard_items SET content = ?1, char_count = ?2, content_hash = ?3, created_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime') WHERE id = ?4",
            params![content, char_count, content_hash, id],
        )?;
        let new_created_at: String = conn.query_row(
            "SELECT created_at FROM clipboard_items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(new_created_at)
    }
}

pub fn update_note(id: i64, note: Option<String>) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "UPDATE clipboard_items SET note = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2",
        params![note, id],
    )?;
    Ok(())
}

pub fn get_item(id: i64) -> SqliteResult<Option<ClipboardItem>> {
    let conn = get_conn().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, note, created_at, updated_at, copy_count
         FROM clipboard_items WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            item_type: ItemType::from_str(&row.get::<_, String>(1)?).unwrap_or(ItemType::Text),
            content: row.get(2)?,
            image_path: row.get(3)?,
            thumbnail_path: row.get(4)?,
            file_paths: row.get(5)?,
            source_app: row.get(6)?,
            char_count: row.get(7)?,
            image_size: row.get(8)?,
            is_pinned: row.get::<_, i32>(9)? != 0,
            is_favorite: row.get::<_, i32>(10)? != 0,
            metadata: row.get(11)?,
            content_hash: row.get(12)?,
            note: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
            image_exists: true,
            copy_count: row.get(16)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

/// Increment the copy_count for a clipboard item.
/// Used when the user explicitly copies an item from the panel.
pub fn increment_copy_count(id: i64) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "UPDATE clipboard_items SET copy_count = copy_count + 1, updated_at = datetime('now', 'localtime') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn delete_item(id: i64) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn clear_item_images(id: i64) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "UPDATE clipboard_items SET image_path = NULL, thumbnail_path = NULL WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

pub fn delete_items(ids: &[i64]) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    if ids.is_empty() { return Ok(()); }
    let placeholders: Vec<String> = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
    let sql = format!("DELETE FROM clipboard_items WHERE id IN ({})", placeholders.join(","));
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
    conn.execute(&sql, params_refs.as_slice())?;
    Ok(())
}

pub fn cleanup_old_items(max_items: i64, max_images: i64) -> SqliteResult<(usize, usize)> {
    let conn = get_conn().lock().unwrap();

    let text_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type != 'image'",
        [], |row| row.get(0),
    )?;
    let text_deleted = if text_count > max_items {
        let to_delete = text_count - max_items;
        conn.execute(
            "DELETE FROM clipboard_items WHERE id IN (
                SELECT id FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type != 'image'
                ORDER BY created_at ASC LIMIT ?1
            )",
            params![to_delete],
        )?
    } else { 0 };

    let img_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type = 'image'",
        [], |row| row.get(0),
    )?;
    let img_deleted = if img_count > max_images {
        let to_delete = img_count - max_images;
        conn.execute(
            "DELETE FROM clipboard_items WHERE id IN (
                SELECT id FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type = 'image'
                ORDER BY created_at ASC LIMIT ?1
            )",
            params![to_delete],
        )?
    } else { 0 };

    Ok((text_deleted, img_deleted))
}

pub fn get_all_items_for_backup() -> SqliteResult<Vec<ClipboardItem>> {
    let conn = get_conn().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, note, created_at, updated_at, copy_count
         FROM clipboard_items ORDER BY id"
    )?;
    let items = stmt.query_map([], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            item_type: ItemType::from_str(&row.get::<_, String>(1)?).unwrap_or(ItemType::Text),
            content: row.get(2)?,
            image_path: row.get(3)?,
            thumbnail_path: row.get(4)?,
            file_paths: row.get(5)?,
            source_app: row.get(6)?,
            char_count: row.get(7)?,
            image_size: row.get(8)?,
            is_pinned: row.get::<_, i32>(9)? != 0,
            is_favorite: row.get::<_, i32>(10)? != 0,
            metadata: row.get(11)?,
            content_hash: row.get(12)?,
            note: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
            image_exists: true,
            copy_count: row.get(16)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(items)
}

/// Try to insert a restored item with dedup check.
/// Returns true if inserted, false if a duplicate (same type + content_hash) already exists.
/// Does NOT preserve the original id — lets SQLite auto-increment to avoid conflicts.
pub fn try_restore_item(item: &ClipboardItem) -> SqliteResult<bool> {
    let conn = get_conn().lock().unwrap();

    // Dedup check — same logic as upsert_item
    if let Some(hash) = item.content_hash {
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM clipboard_items WHERE type = ?1 AND content_hash = ?2",
            params![item.item_type.as_str(), hash],
            |row| row.get(0),
        )?;
        if exists {
            return Ok(false);
        }
    }

    // Insert without id — let auto-increment assign a new one
    conn.execute(
        "INSERT INTO clipboard_items (type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, note, copy_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            item.item_type.as_str(),
            item.content,
            item.image_path,
            item.thumbnail_path,
            item.file_paths,
            item.source_app,
            item.char_count,
            item.image_size,
            item.is_pinned as i32,
            item.is_favorite as i32,
            item.metadata,
            item.content_hash,
            item.note,
            item.copy_count,
            item.created_at,
            item.updated_at,
        ],
    )?;
    Ok(true)
}

/// Count unprotected (non-pinned, non-favorite) items by type.
/// Returns (text_and_file_count, image_count).
pub fn get_unprotected_counts() -> SqliteResult<(i64, i64)> {
    let conn = get_conn().lock().unwrap();
    let text_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type != 'image'",
        [], |row| row.get(0),
    )?;
    let img_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type = 'image'",
        [], |row| row.get(0),
    )?;
    Ok((text_count, img_count))
}

pub fn get_setting(key: &str) -> SqliteResult<Option<String>> {
    let conn = get_conn().lock().unwrap();
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
    Ok(rows.next().transpose()?)
}

pub fn set_setting(key: &str, value: &str) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_all_settings() -> SqliteResult<AppSettings> {
    let mut settings = AppSettings::default();
    if let Some(v) = get_setting("hotkey")? { settings.hotkey = v; }
    if let Some(v) = get_setting("max_items")? { settings.max_items = v.parse().unwrap_or(3000); }
    if let Some(v) = get_setting("max_images")? { settings.max_images = v.parse().unwrap_or(500); }
    if let Some(v) = get_setting("auto_paste")? { settings.auto_paste = v == "true"; }
    if let Some(v) = get_setting("auto_start")? { settings.auto_start = v == "true"; }
    if let Some(v) = get_setting("language")? { settings.language = v; }
    if let Some(v) = get_setting("always_on_top")? { settings.always_on_top = v != "false"; }
    if let Some(v) = get_setting("page_size")? { settings.page_size = v.parse().unwrap_or(50); }
    if let Some(v) = get_setting("theme")? { settings.theme = v; }
    Ok(settings)
}

pub fn save_all_settings(settings: &AppSettings) -> SqliteResult<()> {
    set_setting("hotkey", &settings.hotkey)?;
    set_setting("max_items", &settings.max_items.to_string())?;
    set_setting("max_images", &settings.max_images.to_string())?;
    set_setting("auto_paste", if settings.auto_paste { "true" } else { "false" })?;
    set_setting("auto_start", if settings.auto_start { "true" } else { "false" })?;
    set_setting("language", &settings.language)?;
    set_setting("always_on_top", if settings.always_on_top { "true" } else { "false" })?;
    set_setting("page_size", &settings.page_size.to_string())?;
    set_setting("theme", &settings.theme)?;
    Ok(())
}

/// Get a sorted list of distinct source app names from the clipboard history.
pub fn get_source_apps() -> Result<Vec<String>, rusqlite::Error> {
    let conn = DB.get().unwrap().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT DISTINCT source_app FROM clipboard_items WHERE source_app IS NOT NULL AND source_app != '' ORDER BY source_app"
    )?;
    let apps = stmt.query_map([], |row| row.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(apps)
}

/// Compute statistics for the statistics panel.
/// Runs 7 SQL queries + filesystem size checks.
pub fn get_statistics(app_data_dir: &std::path::Path) -> Result<Statistics, String> {
    let conn = DB.get().ok_or("Database not initialized")?.lock().map_err(|e| e.to_string())?;

    // Total items
    let total_items: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Today hourly (0..23)
    let today_hourly: Vec<i64> = {
        let mut stmt = conn.prepare(
            "SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS cnt
             FROM clipboard_items
             WHERE date(created_at) = date('now', 'localtime')
             GROUP BY hour ORDER BY hour"
        ).map_err(|e| e.to_string())?;
        let rows: Vec<(i64, i64)> = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect();

        let mut hourly = vec![0i64; 24];
        for (hour, cnt) in rows {
            if hour >= 0 && hour < 24 {
                hourly[hour as usize] = cnt;
            }
        }
        hourly
    };

    // Week daily (last 7 days)
    let week_daily: Vec<(String, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT date(created_at) AS day, COUNT(*) AS cnt
             FROM clipboard_items
             WHERE created_at >= date('now', '-6 days', 'localtime')
             GROUP BY day ORDER BY day"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect::<Vec<_>>();
        result
    };

    // Month daily
    let month_daily: Vec<(String, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT date(created_at) AS day, COUNT(*) AS cnt
             FROM clipboard_items
             WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
             GROUP BY day ORDER BY day"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect::<Vec<_>>();
        result
    };

    // Source app stats (top apps by count)
    let source_stats: Vec<SourceCount> = {
        let mut stmt = conn.prepare(
            "SELECT source_app, COUNT(*) AS cnt
             FROM clipboard_items
             WHERE source_app IS NOT NULL AND source_app != ''
             GROUP BY source_app
             ORDER BY cnt DESC"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| {
            Ok(SourceCount {
                app: row.get::<_, String>(0)?,
                count: row.get::<_, i64>(1)?,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect::<Vec<_>>();
        result
    };

    // Storage: text content size
    let storage_text_bytes: u64 = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(content)), 0) FROM clipboard_items WHERE type = 'text'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u64;

    // Storage: image + thumbnail files
    let storage_image_bytes: u64 = {
        let mut total: u64 = 0;
        for dir_name in &["images", "thumbnails"] {
            let dir = app_data_dir.join(dir_name);
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_file() {
                            total += meta.len();
                        }
                    }
                }
            }
        }
        total
    };

    // Storage: database file
    let storage_db_bytes: u64 = {
        let db_path = app_data_dir.join("superclipboard.db");
        std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0)
    };

    // Top copied text items (top 10)
    let top_copied: Vec<TopCopiedItem> = {
        let mut stmt = conn.prepare(
            "SELECT content, copy_count
             FROM clipboard_items
             WHERE type = 'text' AND copy_count > 0
             ORDER BY copy_count DESC
             LIMIT 10"
        ).map_err(|e| e.to_string())?;
        let result: Vec<TopCopiedItem> = stmt.query_map([], |row| {
            Ok(TopCopiedItem {
                preview: row.get::<_, String>(0)?,
                copy_count: row.get::<_, i64>(1)?,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect();
        result
    };

    Ok(Statistics {
        total_items,
        today_hourly,
        week_daily,
        month_daily,
        source_stats,
        storage_text_bytes,
        storage_image_bytes,
        storage_db_bytes,
        top_copied,
    })
}

/// Delete all clipboard items and their image/thumbnail files.
/// Settings are preserved. Returns the number of deleted records.
pub fn clear_all_data() -> Result<usize, String> {
    let conn = get_conn().lock().map_err(|e| e.to_string())?;

    // Collect image paths before deleting so we can remove files
    let mut paths: Vec<String> = Vec::new();
    let mut stmt = conn
        .prepare("SELECT image_path, thumbnail_path FROM clipboard_items WHERE image_path IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        if let Ok((img, thumb)) = row {
            if let Some(p) = img { paths.push(p); }
            if let Some(p) = thumb { paths.push(p); }
        }
    }

    let count = conn
        .execute("DELETE FROM clipboard_items", [])
        .map_err(|e| e.to_string())?;

    // Compact FTS5 tombstones accumulated by the delete triggers
    conn.execute("INSERT INTO clipboard_fts(clipboard_fts) VALUES ('optimize')", []).ok();

    // Remove image/thumbnail files from disk
    for p in &paths {
        std::fs::remove_file(p).ok();
    }

    Ok(count)
}

/// Delete all items of a specific type, plus associated files for images.
/// Settings are preserved. Returns the number of deleted records.
pub fn clear_data_by_type(item_type: &str) -> Result<usize, String> {
    let conn = get_conn().lock().map_err(|e| e.to_string())?;

    match item_type {
        "all" => {
            // Delegate to existing full clear
            drop(conn);
            clear_all_data()
        }
        "image" => {
            // Collect image paths before deleting
            let mut paths: Vec<String> = Vec::new();
            let mut stmt = conn
                .prepare("SELECT image_path, thumbnail_path FROM clipboard_items WHERE type = 'image' AND image_path IS NOT NULL")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                if let Ok((img, thumb)) = row {
                    if let Some(p) = img { paths.push(p); }
                    if let Some(p) = thumb { paths.push(p); }
                }
            }

            let count = conn
                .execute("DELETE FROM clipboard_items WHERE type = 'image'", [])
                .map_err(|e| e.to_string())?;

            conn.execute("INSERT INTO clipboard_fts(clipboard_fts) VALUES ('optimize')", []).ok();

            for p in &paths {
                std::fs::remove_file(p).ok();
            }
            Ok(count)
        }
        "text" | "file" => {
            let count = conn
                .execute(
                    "DELETE FROM clipboard_items WHERE type = ?1",
                    [item_type],
                )
                .map_err(|e| e.to_string())?;

            conn.execute("INSERT INTO clipboard_fts(clipboard_fts) VALUES ('optimize')", []).ok();
            Ok(count)
        }
        "template" => {
            let count = conn
                .execute("DELETE FROM templates", [])
                .map_err(|e| e.to_string())?;
            Ok(count)
        }
        _ => Err(format!("Unknown item type: {}", item_type)),
    }
}

pub fn get_item_counts() -> Result<TypeCounts, String> {
    let conn = get_conn().lock().map_err(|e| e.to_string())?;
    let text: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_items WHERE type = 'text'", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let image: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_items WHERE type = 'image'", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let file: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_items WHERE type = 'file'", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let template: i64 = conn
        .query_row("SELECT COUNT(*) FROM templates", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(TypeCounts {
        text,
        image,
        file,
        template,
        total: text + image + file,
    })
}

/// Get item counts for the "All" and "Favorites" tabs, using the same
/// filters as query_history (keyword, type, date range, source app).
pub fn get_tab_counts(query: &HistoryQuery) -> Result<TabCounts, String> {
    let conn = get_conn().lock().map_err(|e| e.to_string())?;

    let mut where_clauses: Vec<String> = Vec::new();
    let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref keyword) = query.keyword {
        if !keyword.is_empty() {
            let idx = bind_values.len() + 1;
            where_clauses.push(format!("(content LIKE ?{} OR file_paths LIKE ?{} OR note LIKE ?{})", idx, idx, idx));
            bind_values.push(Box::new(format!("%{}%", keyword)));
        }
    }

    if let Some(ref t) = query.item_type {
        if t != "all" {
            let idx = bind_values.len() + 1;
            where_clauses.push(format!("type = ?{}", idx));
            bind_values.push(Box::new(t.clone()));
        }
    }

    if let Some(ref app) = query.source_app {
        let idx = bind_values.len() + 1;
        where_clauses.push(format!("source_app = ?{}", idx));
        bind_values.push(Box::new(app.clone()));
    }

    if let Some(ref from) = query.date_from {
        let idx = bind_values.len() + 1;
        where_clauses.push(format!("created_at >= ?{}", idx));
        bind_values.push(Box::new(from.clone()));
    }
    if let Some(ref to) = query.date_to {
        let idx = bind_values.len() + 1;
        where_clauses.push(format!("created_at <= ?{}", idx));
        bind_values.push(Box::new(to.clone()));
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    // Count for "All" tab
    let all_count_sql = format!("SELECT COUNT(*) FROM clipboard_items {}", where_sql);
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|b| b.as_ref()).collect();
    let all: i64 = {
        let mut stmt = conn.prepare(&all_count_sql).map_err(|e| e.to_string())?;
        stmt.query_row(params_refs.as_slice(), |row| row.get(0)).map_err(|e| e.to_string())?
    };

    // Count for "Favorites" tab (same filters + is_favorite = 1)
    let fav_clause = if where_sql.is_empty() {
        "WHERE is_favorite = 1".to_string()
    } else {
        format!("{} AND is_favorite = 1", where_sql)
    };
    let fav_count_sql = format!("SELECT COUNT(*) FROM clipboard_items {}", fav_clause);
    let favorites: i64 = {
        let mut stmt = conn.prepare(&fav_count_sql).map_err(|e| e.to_string())?;
        stmt.query_row(params_refs.as_slice(), |row| row.get(0)).map_err(|e| e.to_string())?
    };

    Ok(TabCounts { all, favorites })
}

// ---- Template CRUD ----

pub fn get_all_templates() -> SqliteResult<Vec<Template>> {
    let conn = get_conn().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, title, content, sort_order, created_at, updated_at FROM templates ORDER BY sort_order, id"
    )?;
    let items = stmt.query_map([], |row| {
        Ok(Template {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            sort_order: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(items)
}

pub fn add_template(title: String, content: String) -> SqliteResult<Template> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "INSERT INTO templates (title, content) VALUES (?1, ?2)",
        params![title, content],
    )?;
    let id = conn.last_insert_rowid();
    let mut stmt = conn.prepare(
        "SELECT id, title, content, sort_order, created_at, updated_at FROM templates WHERE id = ?1"
    )?;
    stmt.query_row(params![id], |row| {
        Ok(Template {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            sort_order: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })
}

pub fn update_template(id: i64, title: String, content: String) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "UPDATE templates SET title = ?1, content = ?2, updated_at = datetime('now', 'localtime') WHERE id = ?3",
        params![title, content, id],
    )?;
    Ok(())
}

pub fn delete_template(id: i64) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute("DELETE FROM templates WHERE id = ?1", params![id])?;
    Ok(())
}
