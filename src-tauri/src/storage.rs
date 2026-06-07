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
            // Duplicate found — just bump timestamps to bring it to the top
            conn.execute(
                "UPDATE clipboard_items SET updated_at = datetime('now', 'localtime'), created_at = datetime('now', 'localtime') WHERE id = ?1",
                params![existing_id],
            )?;
            return Ok((existing_id, false));
        }
    }

    // No duplicate — insert new row
    conn.execute(
        "INSERT INTO clipboard_items (type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, metadata, content_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
            where_clauses.push(format!("(content LIKE ?{} OR file_paths LIKE ?{})", idx, idx));
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
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, created_at, updated_at
         FROM clipboard_items {}
         ORDER BY is_pinned DESC, created_at DESC
         LIMIT ?{} OFFSET ?{}",
        where_sql, limit_idx, offset_idx,
    );

    bind_values.push(Box::new(query.limit));
    bind_values.push(Box::new(query.offset));

    let mut stmt = conn.prepare(&query_sql)?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|b| b.as_ref()).collect();

    let items = stmt.query_map(params_refs.as_slice(), |row| {
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
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?.filter_map(|r| r.ok()).collect();

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

pub fn get_item(id: i64) -> SqliteResult<Option<ClipboardItem>> {
    let conn = get_conn().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, created_at, updated_at
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
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

pub fn delete_item(id: i64) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
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
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, created_at, updated_at
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
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(items)
}

pub fn restore_from_backup(items: &[ClipboardItem]) -> SqliteResult<usize> {
    let conn = get_conn().lock().unwrap();
    conn.execute("DELETE FROM clipboard_items", [])?;
    let mut count = 0;
    for item in items {
        conn.execute(
            "INSERT INTO clipboard_items (id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                item.id,
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
                item.created_at,
                item.updated_at,
            ],
        )?;
        count += 1;
    }
    Ok(count)
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
    Ok(settings)
}

pub fn save_all_settings(settings: &AppSettings) -> SqliteResult<()> {
    set_setting("hotkey", &settings.hotkey)?;
    set_setting("max_items", &settings.max_items.to_string())?;
    set_setting("max_images", &settings.max_images.to_string())?;
    set_setting("auto_paste", if settings.auto_paste { "true" } else { "false" })?;
    set_setting("auto_start", if settings.auto_start { "true" } else { "false" })?;
    set_setting("language", &settings.language)?;
    Ok(())
}
