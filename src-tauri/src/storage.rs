use crate::hash::fnv1a_64;
use crate::models::*;
use once_cell::sync::OnceCell;
use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use std::sync::Mutex;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init_db(app_data_dir: &std::path::Path) -> SqliteResult<()> {
    std::fs::create_dir_all(app_data_dir).ok();
    let db_path = app_data_dir.join("superclipboard.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        "
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

        -- FTS5 support was removed (search uses LIKE — see query_history).
        -- Drop the legacy table/triggers on databases created before that.
        DROP TRIGGER IF EXISTS clipboard_items_ai;
        DROP TRIGGER IF EXISTS clipboard_items_ad;
        DROP TRIGGER IF EXISTS clipboard_items_au;
        DROP TABLE IF EXISTS clipboard_fts;
    ",
    )?;

    // Migrations for databases created before these columns existed.
    // SQLite has no ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so check via
    // PRAGMA table_info. Fresh installs already have all columns (CREATE TABLE
    // above) and skip these; a real failure now propagates instead of being
    // silently swallowed by .ok().
    let existing_columns: Vec<String> = conn
        .prepare("PRAGMA table_info(clipboard_items)")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<_, _>>()?;
    for (name, ddl) in [
        ("content_hash", "INTEGER"),
        ("note", "TEXT"),
        ("copy_count", "INTEGER DEFAULT 0"),
    ] {
        if !existing_columns.iter().any(|c| c == name) {
            conn.execute(
                &format!("ALTER TABLE clipboard_items ADD COLUMN {} {}", name, ddl),
                [],
            )?;
        }
    }

    // Templates table
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS templates (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL DEFAULT '',
            content    TEXT NOT NULL DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
    ",
    )?;

    // Seed preset templates only if table is empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM templates", [], |row| row.get(0))?;
    if count == 0 {
        let presets = [
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

    DB.set(Mutex::new(conn))
        .map_err(|_| rusqlite::Error::InvalidParameterName("DB already initialized".into()))?;

    Ok(())
}

pub(crate) fn get_conn() -> &'static Mutex<Connection> {
    DB.get().expect("Database not initialized")
}

/// Column list shared by every SELECT that maps into a ClipboardItem.
/// Keep in sync with `row_to_item` below.
const ITEM_COLUMNS: &str =
    "id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, content_hash, note, created_at, updated_at, copy_count";

/// Single place that maps a `clipboard_items` row into a ClipboardItem.
/// Adding a column = extend ITEM_COLUMNS + this fn, nothing else.
fn row_to_item(row: &rusqlite::Row) -> SqliteResult<ClipboardItem> {
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
}

/// Check whether an existing row is a true duplicate of the incoming item.
/// The 64-bit FNV hash is a prefilter only — on a hash hit we compare the
/// actual payload so a (rare) hash collision can't silently swallow new data.
fn is_true_duplicate(
    conn: &Connection,
    existing_id: i64,
    item: &ClipboardItem,
) -> SqliteResult<bool> {
    let (content, image_path, file_paths): (Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT content, image_path, file_paths FROM clipboard_items WHERE id = ?1",
            params![existing_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

    Ok(match item.item_type {
        ItemType::Text => content == item.content,
        ItemType::File => file_paths == item.file_paths,
        ItemType::Image => {
            // Hash was computed over PNG file bytes, so compare the files.
            match (&image_path, &item.image_path) {
                (Some(old), Some(new)) => match (std::fs::read(old), std::fs::read(new)) {
                    (Ok(a), Ok(b)) => a == b,
                    // If either file can't be read, fall back to treating it
                    // as a duplicate (same behavior as before the check).
                    _ => true,
                },
                _ => true,
            }
        }
    })
}

/// Upsert a clipboard item. If an item with the same type and content_hash
/// (and matching content — see is_true_duplicate) already exists, update its
/// timestamps instead of inserting a duplicate.
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
            if is_true_duplicate(&conn, existing_id, item)? {
                // Duplicate found — bump timestamps and increment copy count
                conn.execute(
                    "UPDATE clipboard_items SET updated_at = datetime('now', 'localtime'), created_at = datetime('now', 'localtime'), copy_count = copy_count + 1 WHERE id = ?1",
                    params![existing_id],
                )?;
                return Ok((existing_id, false));
            }
            // Hash collision with different content — fall through and insert.
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

/// Escape SQL LIKE wildcards in user input so searching for "100%" or
/// "a_b" matches those literally. Pair with `ESCAPE '\'` in the clause.
fn escape_like(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 4);
    for c in input.chars() {
        if c == '\\' || c == '%' || c == '_' {
            out.push('\\');
        }
        out.push(c);
    }
    out
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
            where_clauses.push(format!("(content LIKE ?{0} ESCAPE '\\' OR file_paths LIKE ?{0} ESCAPE '\\' OR note LIKE ?{0} ESCAPE '\\')", idx));
            bind_values.push(Box::new(format!("%{}%", escape_like(keyword))));
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
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            bind_values.iter().map(|b| b.as_ref()).collect();
        stmt.query_row(params_refs.as_slice(), |row| row.get(0))?
    };

    let limit_idx = bind_values.len() + 1;
    let offset_idx = bind_values.len() + 2;
    let query_sql = format!(
        "SELECT {} FROM clipboard_items {}
         ORDER BY is_pinned DESC, created_at DESC
         LIMIT ?{} OFFSET ?{}",
        ITEM_COLUMNS, where_sql, limit_idx, offset_idx,
    );

    bind_values.push(Box::new(query.limit));
    bind_values.push(Box::new(query.offset));

    let mut stmt = conn.prepare(&query_sql)?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        bind_values.iter().map(|b| b.as_ref()).collect();

    let mut items: Vec<ClipboardItem> = stmt
        .query_map(params_refs.as_slice(), row_to_item)?
        .collect::<Result<_, _>>()?;

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
    let val: i32 = conn.query_row(
        "SELECT is_pinned FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(val != 0)
}

pub fn toggle_favorite(id: i64) -> SqliteResult<bool> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "UPDATE clipboard_items SET is_favorite = CASE WHEN is_favorite = 0 THEN 1 ELSE 0 END, updated_at = datetime('now', 'localtime') WHERE id = ?1",
        params![id],
    )?;
    let val: i32 = conn.query_row(
        "SELECT is_favorite FROM clipboard_items WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(val != 0)
}

pub fn update_content(id: i64, content: String) -> SqliteResult<String> {
    let conn = get_conn().lock().unwrap();
    let char_count = content.chars().count() as i64;
    let content_hash = fnv1a_64(content.as_bytes());

    // Check if another text item already has this content (cross-row dedup).
    // Hash is a prefilter; verify content so a hash collision can't merge
    // two different texts.
    let existing: Option<i64> = conn.query_row(
        "SELECT id FROM clipboard_items WHERE type = 'text' AND content_hash = ?1 AND id != ?2 LIMIT 1",
        params![content_hash, id],
        |row| row.get(0),
    ).optional()?
    .filter(|&existing_id| {
        conn.query_row(
            "SELECT content FROM clipboard_items WHERE id = ?1",
            params![existing_id],
            |row| row.get::<_, Option<String>>(0),
        ).map(|c| c.as_deref() == Some(content.as_str())).unwrap_or(false)
    });

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
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM clipboard_items WHERE id = ?1",
        ITEM_COLUMNS
    ))?;
    let mut rows = stmt.query_map(params![id], row_to_item)?;
    rows.next().transpose()
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

/// Delete rows past the configured caps and return the image/thumbnail
/// paths whose files should be removed from disk. File IO happens in the
/// caller AFTER the DB lock is released so slow deletes don't block queries.
pub fn cleanup_old_items(
    max_items: i64,
    max_images: i64,
) -> SqliteResult<(usize, usize, Vec<String>)> {
    let conn = get_conn().lock().unwrap();

    let text_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE type != 'image'",
        [],
        |row| row.get(0),
    )?;
    let text_deleted = if text_count > max_items {
        // Limit applies to ALL items; only oldest unprotected items are deleted
        conn.execute(
            "DELETE FROM clipboard_items WHERE id IN (
                SELECT id FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type != 'image'
                ORDER BY created_at ASC LIMIT ?1
            )",
            params![text_count - max_items],
        )?
    } else {
        0
    };

    let img_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE type = 'image'",
        [],
        |row| row.get(0),
    )?;
    let mut orphan_files: Vec<String> = Vec::new();
    let img_deleted = if img_count > max_images {
        // Collect the file paths of the oldest unprotected image records so
        // the caller can delete them from disk (images/ + thumbnails/ don't
        // accumulate orphans).
        let paths: Vec<(Option<String>, Option<String>)> = conn
            .prepare("SELECT image_path, thumbnail_path FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type = 'image' ORDER BY created_at ASC LIMIT ?1")?
            .query_map(params![img_count - max_images], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();
        for (img_path, thumb_path) in paths {
            for p in [img_path, thumb_path].into_iter().flatten() {
                if !p.is_empty() {
                    orphan_files.push(p);
                }
            }
        }
        conn.execute(
            "DELETE FROM clipboard_items WHERE id IN (
                SELECT id FROM clipboard_items WHERE is_pinned = 0 AND is_favorite = 0 AND type = 'image'
                ORDER BY created_at ASC LIMIT ?1
            )",
            params![img_count - max_images],
        )?
    } else {
        0
    };

    Ok((text_deleted, img_deleted, orphan_files))
}

pub fn get_all_items_for_backup() -> SqliteResult<Vec<ClipboardItem>> {
    let conn = get_conn().lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM clipboard_items ORDER BY id",
        ITEM_COLUMNS
    ))?;
    let items = stmt.query_map([], row_to_item)?.collect::<Result<_, _>>()?;
    Ok(items)
}

/// Try to insert a restored item with dedup check.
/// Returns true if inserted, false if a duplicate (same type + content_hash) already exists.
/// Does NOT preserve the original id — lets SQLite auto-increment to avoid conflicts.
pub fn try_restore_item(item: &ClipboardItem) -> SqliteResult<bool> {
    let conn = get_conn().lock().unwrap();

    // Dedup check — same logic as upsert_item (hash prefilter + content verify)
    if let Some(hash) = item.content_hash {
        let existing_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM clipboard_items WHERE type = ?1 AND content_hash = ?2 LIMIT 1",
                params![item.item_type.as_str(), hash],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(existing_id) = existing_id {
            if is_true_duplicate(&conn, existing_id, item)? {
                return Ok(false);
            }
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

/// Count items by type, including pinned/favorite — they occupy limit slots
/// and only never get deleted by cleanup.
/// Returns (text_and_file_count, image_count).
pub fn count_by_type() -> SqliteResult<(i64, i64)> {
    let conn = get_conn().lock().unwrap();
    let text_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE type != 'image'",
        [],
        |row| row.get(0),
    )?;
    let img_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE type = 'image'",
        [],
        |row| row.get(0),
    )?;
    Ok((text_count, img_count))
}

pub fn get_setting(key: &str) -> SqliteResult<Option<String>> {
    let conn = get_conn().lock().unwrap();
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
    rows.next().transpose()
}

pub fn set_setting(key: &str, value: &str) -> SqliteResult<()> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Key holding the serialized AppSettings blob. One row = one atomic write,
/// and defaults live only in models.rs — no per-key parse fallbacks here.
const SETTINGS_JSON_KEY: &str = "app_settings_json";

pub fn get_all_settings() -> SqliteResult<AppSettings> {
    // Preferred path: the JSON blob written by save_all_settings.
    if let Some(v) = get_setting(SETTINGS_JSON_KEY)? {
        if let Ok(settings) = serde_json::from_str::<AppSettings>(&v) {
            return Ok(settings);
        }
    }
    // Legacy per-key format (databases before the JSON blob existed) —
    // migrated to the blob on the next save.
    let mut settings = AppSettings::default();
    if let Some(v) = get_setting("hotkey")? {
        settings.hotkey = v;
    }
    if let Some(v) = get_setting("max_items")? {
        settings.max_items = v.parse().unwrap_or(settings.max_items);
    }
    if let Some(v) = get_setting("max_images")? {
        settings.max_images = v.parse().unwrap_or(settings.max_images);
    }
    if let Some(v) = get_setting("auto_paste")? {
        settings.auto_paste = v == "true";
    }
    if let Some(v) = get_setting("auto_start")? {
        settings.auto_start = v == "true";
    }
    if let Some(v) = get_setting("language")? {
        settings.language = v;
    }
    if let Some(v) = get_setting("always_on_top")? {
        settings.always_on_top = v != "false";
    }
    if let Some(v) = get_setting("close_after_copy")? {
        settings.close_after_copy = v != "false";
    }
    if let Some(v) = get_setting("page_size")? {
        settings.page_size = v.parse().unwrap_or(settings.page_size);
    }
    if let Some(v) = get_setting("theme")? {
        settings.theme = v;
    }
    Ok(settings)
}

pub fn save_all_settings(settings: &AppSettings) -> SqliteResult<()> {
    let json = serde_json::to_string(settings)
        .map_err(|e| rusqlite::Error::InvalidParameterName(format!("settings serialize: {}", e)))?;
    set_setting(SETTINGS_JSON_KEY, &json)
}

/// Get a sorted list of distinct source app names from the clipboard history.
pub fn get_source_apps() -> Result<Vec<String>, rusqlite::Error> {
    let conn = DB.get().unwrap().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT DISTINCT source_app FROM clipboard_items WHERE source_app IS NOT NULL AND source_app != '' ORDER BY source_app"
    )?;
    let apps = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(apps)
}

/// Delete all clipboard items and their image/thumbnail files.
/// Settings are preserved. Returns the number of deleted records.
/// Shrink the db file after a bulk delete. SQLite DELETE leaves free
/// pages behind — without VACUUM the file stays at its peak size. Skip
/// when the free share is small to avoid paying the cost on tiny clears.
///
/// WAL-mode gotcha: VACUUM alone rewrites the logical pages but leaves
/// the main file at its high-water size; wal_checkpoint(TRUNCATE) is
/// what actually releases the old pages back to the OS.
fn vacuum_if_fragmented(conn: &Connection) -> SqliteResult<()> {
    let page_count: i64 = conn.query_row("PRAGMA page_count", [], |r| r.get(0))?;
    let freelist: i64 = conn.query_row("PRAGMA freelist_count", [], |r| r.get(0))?;
    if page_count > 0 && freelist * 100 / page_count > 20 {
        conn.execute("VACUUM", [])?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    }
    Ok(())
}

pub fn clear_all_data() -> Result<usize, String> {
    let conn = get_conn().lock().map_err(|e| e.to_string())?;

    // Collect image paths before deleting so we can remove files
    let mut paths: Vec<String> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT image_path, thumbnail_path FROM clipboard_items WHERE image_path IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for (img, thumb) in rows.flatten() {
            if let Some(p) = img {
                paths.push(p);
            }
            if let Some(p) = thumb {
                paths.push(p);
            }
        }
    }

    let count = conn
        .execute("DELETE FROM clipboard_items", [])
        .map_err(|e| e.to_string())?;

    vacuum_if_fragmented(&conn).map_err(|e| e.to_string())?;
    // Release the DB lock before file IO — deleting thousands of image
    // files must not block monitor/queries.
    drop(conn);

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
            {
                let mut stmt = conn
                    .prepare("SELECT image_path, thumbnail_path FROM clipboard_items WHERE type = 'image' AND image_path IS NOT NULL")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, Option<String>>(0)?,
                            row.get::<_, Option<String>>(1)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;
                for (img, thumb) in rows.flatten() {
                    if let Some(p) = img {
                        paths.push(p);
                    }
                    if let Some(p) = thumb {
                        paths.push(p);
                    }
                }
            }

            let count = conn
                .execute("DELETE FROM clipboard_items WHERE type = 'image'", [])
                .map_err(|e| e.to_string())?;

            vacuum_if_fragmented(&conn).map_err(|e| e.to_string())?;
            // Release the DB lock before file IO
            drop(conn);
            for p in &paths {
                std::fs::remove_file(p).ok();
            }
            Ok(count)
        }
        "text" | "file" => {
            let count = conn
                .execute("DELETE FROM clipboard_items WHERE type = ?1", [item_type])
                .map_err(|e| e.to_string())?;

            vacuum_if_fragmented(&conn).map_err(|e| e.to_string())?;
            Ok(count)
        }
        "template" => {
            let count = conn
                .execute("DELETE FROM templates", [])
                .map_err(|e| e.to_string())?;
            vacuum_if_fragmented(&conn).map_err(|e| e.to_string())?;
            Ok(count)
        }
        _ => Err(format!("Unknown item type: {}", item_type)),
    }
}

pub fn get_item_counts() -> Result<TypeCounts, String> {
    let conn = get_conn().lock().map_err(|e| e.to_string())?;
    let text: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM clipboard_items WHERE type = 'text'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let image: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM clipboard_items WHERE type = 'image'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let file: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM clipboard_items WHERE type = 'file'",
            [],
            |r| r.get(0),
        )
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

// ---- Template CRUD ----

pub fn get_all_templates() -> SqliteResult<Vec<Template>> {
    let conn = get_conn().lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, title, content, sort_order, created_at, updated_at FROM templates ORDER BY sort_order, id"
    )?;
    let items = stmt
        .query_map([], |row| {
            Ok(Template {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hash::fnv1a_64;
    use std::sync::Once;

    // The DB singleton can only be initialized once per process, so all
    // storage tests share one temp-dir database and run inside a single
    // #[test] fn (cargo runs test fns in parallel).
    static INIT: Once = Once::new();

    fn setup() {
        INIT.call_once(|| {
            let dir =
                std::env::temp_dir().join(format!("superclipboard_db_test_{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            init_db(&dir).expect("test db init");
        });
    }

    fn clear() {
        get_conn()
            .lock()
            .unwrap()
            .execute("DELETE FROM clipboard_items", [])
            .unwrap();
    }

    fn text_item(content: &str) -> ClipboardItem {
        ClipboardItem {
            id: 0,
            item_type: ItemType::Text,
            content: Some(content.to_string()),
            image_path: None,
            thumbnail_path: None,
            file_paths: None,
            source_app: None,
            char_count: Some(content.chars().count() as i64),
            image_size: None,
            is_pinned: false,
            is_favorite: false,
            metadata: None,
            content_hash: Some(fnv1a_64(content.as_bytes())),
            note: None,
            created_at: String::new(),
            updated_at: String::new(),
            image_exists: true,
            copy_count: 1,
        }
    }

    fn count_items() -> i64 {
        get_conn()
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM clipboard_items", [], |r| r.get(0))
            .unwrap()
    }

    fn search(keyword: &str) -> Vec<String> {
        let q = HistoryQuery {
            keyword: Some(keyword.to_string()),
            item_type: None,
            date_from: None,
            date_to: None,
            tab: None,
            source_app: None,
            offset: 0,
            limit: 100,
        };
        query_history(&q)
            .unwrap()
            .items
            .into_iter()
            .filter_map(|i| i.content)
            .collect()
    }

    #[test]
    fn storage_behaviour() {
        setup();

        // ---- upsert dedup: same content twice → one row, copy_count bumped
        clear();
        let (id1, is_new) = upsert_item(&text_item("hello")).unwrap();
        assert!(is_new);
        let (id2, is_new) = upsert_item(&text_item("hello")).unwrap();
        assert!(!is_new);
        assert_eq!(id1, id2);
        let item = get_item(id1).unwrap().unwrap();
        assert_eq!(item.copy_count, 2);
        assert_eq!(count_items(), 1);

        // ---- P0-1: hash collision with different content must NOT dedup
        let mut collision = text_item("world");
        collision.content_hash = Some(fnv1a_64(b"hello")); // forged hash
        let (_id3, is_new) = upsert_item(&collision).unwrap();
        assert!(is_new, "different content with same hash must insert");
        assert_eq!(count_items(), 2);

        // ---- P0-4: LIKE escaping — wildcards match literally
        clear();
        upsert_item(&text_item("a_c")).unwrap();
        upsert_item(&text_item("abc")).unwrap();
        upsert_item(&text_item("100% sure")).unwrap();
        let hits = search("a_c");
        assert_eq!(
            hits,
            vec!["a_c".to_string()],
            "underscore must not act as wildcard"
        );
        let hits = search("100%");
        assert_eq!(
            hits,
            vec!["100% sure".to_string()],
            "percent must not act as wildcard"
        );
        let hits = search("zzz_nofound");
        assert!(hits.is_empty());

        // ---- update_content: normal update refreshes timestamp
        clear();
        let (id, _) = upsert_item(&text_item("original")).unwrap();
        let created = update_content(id, "edited".to_string()).unwrap();
        assert!(!created.is_empty());
        let item = get_item(id).unwrap().unwrap();
        assert_eq!(item.content.as_deref(), Some("edited"));

        // ---- update_content: edit into an existing duplicate → merged+deleted
        let (id_other, _) = upsert_item(&text_item("twin")).unwrap();
        let merged = update_content(id, "twin".to_string()).unwrap();
        assert!(merged.is_empty(), "empty string signals merge");
        assert!(get_item(id).unwrap().is_none(), "edited row removed");
        assert!(get_item(id_other).unwrap().is_some(), "surviving row kept");

        // ---- update_content: forged-hash non-duplicate must not merge (P0-1)
        clear();
        let (id_a, _) = upsert_item(&text_item("alpha")).unwrap();
        let mut forged = text_item("beta");
        forged.content_hash = Some(fnv1a_64(b"alpha"));
        let (id_b, _) = upsert_item(&forged).unwrap();
        let merged = update_content(id_a, "beta".to_string()).unwrap();
        assert!(
            !merged.is_empty(),
            "different content must update in place, not merge"
        );
        assert!(get_item(id_a).unwrap().is_some());
        assert!(get_item(id_b).unwrap().is_some());

        // ---- cleanup_old_items: pinned/favorite survive, oldest go first
        clear();
        for c in ["t1", "t2", "t3", "t4", "t5"] {
            upsert_item(&text_item(c)).unwrap();
        }
        let (id_pinned, _) = upsert_item(&text_item("pinned")).unwrap();
        toggle_pin(id_pinned).unwrap();
        // 6 text items, cap 3 → oldest unpinned ("t1".."t3") deleted; pinned survives
        let (text_del, img_del, orphan_files) = cleanup_old_items(3, 10).unwrap();
        assert_eq!((text_del, img_del, orphan_files.len()), (3, 0, 0));
        assert!(get_item(id_pinned).unwrap().is_some());
        assert_eq!(count_items(), 3);

        // ---- clear_data_by_type
        clear();
        upsert_item(&text_item("text-one")).unwrap();
        let mut file_item = text_item("");
        file_item.item_type = ItemType::File;
        file_item.content = None;
        file_item.char_count = None;
        file_item.content_hash = Some(fnv1a_64(b"[\"C:/a.txt\"]"));
        file_item.file_paths = Some("[\"C:/a.txt\"]".to_string());
        upsert_item(&file_item).unwrap();
        let deleted = clear_data_by_type("text").unwrap();
        assert_eq!(deleted, 1);
        assert_eq!(count_items(), 1);

        // ---- settings: JSON round-trip + legacy per-key fallback
        clear();
        let mut s = AppSettings::default();
        s.hotkey = "Ctrl+Shift+K".to_string();
        s.page_size = 30;
        s.theme = "light".to_string();
        save_all_settings(&s).unwrap();
        let loaded = get_all_settings().unwrap();
        assert_eq!(loaded.hotkey, "Ctrl+Shift+K");
        assert_eq!(loaded.page_size, 30);
        assert_eq!(loaded.theme, "light");

        // Drop the JSON blob → legacy keys take over, defaults fill gaps
        get_conn()
            .lock()
            .unwrap()
            .execute("DELETE FROM settings WHERE key = 'app_settings_json'", [])
            .unwrap();
        set_setting("hotkey", "Alt+P").unwrap();
        set_setting("page_size", "20").unwrap();
        let legacy = get_all_settings().unwrap();
        assert_eq!(legacy.hotkey, "Alt+P");
        assert_eq!(legacy.page_size, 20);
        assert_eq!(legacy.theme, AppSettings::default().theme);
    }
}
