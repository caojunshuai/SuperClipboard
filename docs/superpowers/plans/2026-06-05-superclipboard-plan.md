# SuperClipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows clipboard manager with Tauri 2.x + React + TypeScript + Tailwind CSS — clipboard history with card UI, pin/favorite, search, export/backup.

**Architecture:** Rust backend monitors clipboard via polling, stores metadata in SQLite + images on filesystem, exposes Tauri commands. React frontend renders card-based panel with virtual scrolling, search filtering, and management dialogs. Backend pushes clipboard changes to frontend via Tauri events.

**Tech Stack:** Tauri 2.x, React 18, TypeScript 5, Tailwind CSS 3, SQLite (rusqlite), Vite 5

---

## File Structure

```
SuperClipboard/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── src/                              # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── types.ts                      # Shared TypeScript types
│   ├── api.ts                        # Tauri invoke wrappers + event listeners
│   ├── components/
│   │   ├── ClipboardPanel.tsx        # Main popup panel shell
│   │   ├── SearchBar.tsx             # Search + type filter + date filter
│   │   ├── TabBar.tsx                # All / Favorites tabs
│   │   ├── CardList.tsx              # Virtual-scrolled card container
│   │   ├── ClipboardCard.tsx         # Card shell, dispatches to type-specific cards
│   │   ├── cards/
│   │   │   ├── TextCard.tsx          # Text preview card
│   │   │   ├── ImageCard.tsx         # Image thumbnail card
│   │   │   └── FileCard.tsx          # File path card
│   │   ├── ExportDialog.tsx          # Export text/images dialog
│   │   ├── BackupDialog.tsx          # Backup/restore dialog
│   │   └── SettingsPanel.tsx         # Settings form
│   ├── hooks/
│   │   ├── useClipboardHistory.ts    # History fetching + filtering logic
│   │   └── usePanelVisibility.ts     # Show/hide panel logic
│   └── utils/
│       └── format.ts                 # Date formatting, text truncation
├── src-tauri/                        # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   └── src/
│       ├── main.rs                   # Entry point
│       ├── lib.rs                    # Tauri builder + plugin registration
│       ├── models.rs                 # Data structures
│       ├── storage.rs                # SQLite init + CRUD + FTS
│       ├── clipboard.rs              # Clipboard poller
│       ├── hotkey.rs                 # Global shortcut
│       ├── tray.rs                   # System tray
│       ├── commands.rs               # All #[tauri::command] handlers
│       └── export.rs                 # Export txt/images + backup zip
```

---

## Phase 1: Project Scaffolding

### Task 1.1: Initialize Tauri + React + TypeScript project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/default.json`

- [ ] **Step 1: Scaffold with create-tauri-app**

Run:
```bash
cd D:\Desktop\SuperClipboard
npm create tauri-app@latest . -- --template react-ts
```

Expected: Project scaffolded with React + TypeScript + Tauri 2.x template

- [ ] **Step 2: Install frontend dependencies**

Run:
```bash
cd D:\Desktop\SuperClipboard
npm install
npm install -D tailwindcss @tailwindcss/vite postcss autoprefixer
npm install @tauri-apps/api @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-dialog @tauri-apps/plugin-shell @tauri-apps/plugin-process
```

Expected: All npm packages installed

- [ ] **Step 3: Configure Tailwind CSS**

Write `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: '#1e1e2e',
          card: '#2a2a3c',
          border: '#3a3a4c',
          hover: '#32324a',
          text: '#e0e0e0',
          muted: '#8888a0',
          accent: '#7c8cf8',
        }
      },
      animation: {
        'slide-up': 'slideUp 0.15s ease-out',
        'fade-in': 'fadeIn 0.1s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      }
    },
  },
  plugins: [],
}
```

- [ ] **Step 4: Configure PostCSS**

Write `postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Update App.css for Tailwind**

Write `src/App.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}

#root {
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 6: Update index.html**

Write `index.html`:
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SuperClipboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Update Tauri config**

Write `src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/nicegui-org/tauri2-docs/refs/heads/master/tauri.conf.schema.json",
  "productName": "SuperClipboard",
  "version": "0.1.0",
  "identifier": "com.superclipboard.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "SuperClipboard",
        "width": 400,
        "height": 560,
        "resizable": true,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "visible": false
      }
    ],
    "security": {
      "csp": null
    }
  }
}
```

- [ ] **Step 8: Update main.tsx**

Write `src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Verify dev build compiles**

Run:
```bash
cd D:\Desktop\SuperClipboard
npm run dev
```

Expected: Dev server starts, Tauri window launches (may be blank since App.tsx is minimal). Kill with Ctrl+C after verification.

---

### Task 1.2: Configure Rust dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add Rust dependencies**

Edit `src-tauri/Cargo.toml`, replace `[dependencies]` section with:
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
tauri-plugin-process = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled", "fts5"] }
chrono = { version = "0.4", features = ["serde"] }
image = "0.25"
zip = "1"
tokio = { version = "1", features = ["full"] }
once_cell = "1"
```

Expected: `cargo check` in src-tauri passes (run `cd src-tauri && cargo check`)

- [ ] **Step 2: Verify Rust compiles**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: Compiles without errors

---

## Phase 2: Rust Backend — Data Layer

### Task 2.1: Define data models

**Files:**
- Create: `src-tauri/src/models.rs`

- [ ] **Step 1: Write models.rs**

Write `src-tauri/src/models.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemType {
    Text,
    Image,
    File,
}

impl ItemType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ItemType::Text => "text",
            ItemType::Image => "image",
            ItemType::File => "file",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "text" => Some(ItemType::Text),
            "image" => Some(ItemType::Image),
            "file" => Some(ItemType::File),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub item_type: ItemType,
    pub content: Option<String>,
    pub image_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub file_paths: Option<String>,    // JSON array
    pub source_app: Option<String>,
    pub char_count: Option<i64>,
    pub image_size: Option<String>,
    pub is_pinned: bool,
    pub is_favorite: bool,
    pub metadata: Option<String>,      // JSON, reserved for future
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryQuery {
    pub keyword: Option<String>,
    pub item_type: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub tab: Option<String>,           // "all" | "favorites"
    pub offset: i64,
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryResult {
    pub items: Vec<ClipboardItem>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub hotkey: String,
    pub max_items: i64,
    pub max_images: i64,
    pub auto_paste: bool,
    pub auto_start: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "Alt+V".to_string(),
            max_items: 3000,
            max_images: 500,
            auto_paste: false,
            auto_start: false,
        }
    }
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: Compiles without errors

---

### Task 2.2: Implement SQLite storage layer

**Files:**
- Create: `src-tauri/src/storage.rs`

- [ ] **Step 1: Write storage.rs — Database init and migrations**

Write `src-tauri/src/storage.rs`:
```rust
use rusqlite::{params, Connection, Result as SqliteResult};
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

    DB.set(Mutex::new(conn)).map_err(|_| {
        rusqlite::Error::InvalidParameterName("DB already initialized".into())
    })?;

    Ok(())
}

fn get_conn() -> &'static Mutex<Connection> {
    DB.get().expect("Database not initialized")
}
```

- [ ] **Step 2: Write storage.rs — Insert item**

Append to `src-tauri/src/storage.rs`:
```rust
pub fn insert_item(item: &ClipboardItem, images_dir: &std::path::Path) -> SqliteResult<i64> {
    let conn = get_conn().lock().unwrap();
    conn.execute(
        "INSERT INTO clipboard_items (type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, metadata)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
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
        ],
    )?;
    Ok(conn.last_insert_rowid())
}
```

- [ ] **Step 3: Write storage.rs — Query with search and filters**

Append to `src-tauri/src/storage.rs`:
```rust
pub fn query_history(query: &HistoryQuery) -> SqliteResult<HistoryResult> {
    let conn = get_conn().lock().unwrap();

    let mut where_clauses: Vec<String> = Vec::new();
    let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    // FTS search
    if let Some(ref keyword) = query.keyword {
        if !keyword.is_empty() {
            where_clauses.push(format!(
                "id IN (SELECT rowid FROM clipboard_fts WHERE clipboard_fts MATCH ?{})",
                bind_values.len() + 1
            ));
            bind_values.push(Box::new(keyword.clone()));
        }
    }

    // Type filter
    if let Some(ref t) = query.item_type {
        if t != "all" {
            where_clauses.push(format!("type = ?{}", bind_values.len() + 1));
            bind_values.push(Box::new(t.clone()));
        }
    }

    // Date range
    if let Some(ref from) = query.date_from {
        where_clauses.push(format!("created_at >= ?{}", bind_values.len() + 1));
        bind_values.push(Box::new(from.clone()));
    }
    if let Some(ref to) = query.date_to {
        where_clauses.push(format!("created_at <= ?{}", bind_values.len() + 1));
        bind_values.push(Box::new(to.clone()));
    }

    // Tab filter
    if query.tab.as_deref() == Some("favorites") {
        where_clauses.push("is_favorite = 1".to_string());
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM clipboard_items {}", where_sql);
    let total: i64 = {
        let mut stmt = conn.prepare(&count_sql)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|b| b.as_ref()).collect();
        stmt.query_row(params_refs.as_slice(), |row| row.get(0))?
    };

    // Fetch items — pinned first, then by created_at desc
    let query_sql = format!(
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, created_at, updated_at
         FROM clipboard_items {}
         ORDER BY is_pinned DESC, created_at DESC
         LIMIT ?{} OFFSET ?{}",
        where_sql,
        bind_values.len() + 1,
        bind_values.len() + 2,
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
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    })?.filter_map(|r| r.ok()).collect();

    Ok(HistoryResult { items, total })
}
```

- [ ] **Step 4: Write storage.rs — Toggle, delete, cleanup, settings**

Append to `src-tauri/src/storage.rs`:
```rust
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
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, created_at, updated_at
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
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
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
    let placeholders: Vec<String> = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
    let sql = format!("DELETE FROM clipboard_items WHERE id IN ({})", placeholders.join(","));
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
    conn.execute(&sql, params_refs.as_slice())?;
    Ok(())
}

pub fn cleanup_old_items(max_items: i64, max_images: i64) -> SqliteResult<(usize, usize)> {
    let conn = get_conn().lock().unwrap();

    // Clean up non-pinned, non-favorite text/file items beyond max_items
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

    // Clean up non-pinned, non-favorite image items beyond max_images
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
        "SELECT id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, created_at, updated_at
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
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
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
            "INSERT INTO clipboard_items (id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, is_pinned, is_favorite, metadata, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
                item.created_at,
                item.updated_at,
            ],
        )?;
        count += 1;
    }
    Ok(count)
}

// Settings
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
    Ok(settings)
}

pub fn save_all_settings(settings: &AppSettings) -> SqliteResult<()> {
    set_setting("hotkey", &settings.hotkey)?;
    set_setting("max_items", &settings.max_items.to_string())?;
    set_setting("max_images", &settings.max_images.to_string())?;
    set_setting("auto_paste", if settings.auto_paste { "true" } else { "false" })?;
    set_setting("auto_start", if settings.auto_start { "true" } else { "false" })?;
    Ok(())
}
```

- [ ] **Step 5: Verify compilation**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: Compiles without errors

---

### Task 2.3: Wire lib.rs — app setup and storage init

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update lib.rs**

Write `src-tauri/src/lib.rs`:
```rust
mod models;
mod storage;
mod clipboard;
mod hotkey;
mod tray;
mod commands;
mod export;

use tauri::Manager;
use std::path::PathBuf;

fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().expect("failed to get app data dir");
    std::fs::create_dir_all(dir.join("images")).ok();
    std::fs::create_dir_all(dir.join("thumbnails")).ok();
    std::fs::create_dir_all(dir.join("exports")).ok();
    std::fs::create_dir_all(dir.join("backups")).ok();
    dir
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app_data_dir(&app.handle());
            storage::init_db(&dir).expect("Failed to initialize database");

            // Start clipboard monitor
            let handle = app.handle().clone();
            let images_dir = dir.join("images");
            let thumbs_dir = dir.join("thumbnails");
            std::thread::spawn(move || {
                clipboard::run_monitor(handle, images_dir, thumbs_dir);
            });

            // Setup system tray
            let handle = app.handle().clone();
            tray::setup(&handle)?;

            // Register global hotkey
            let handle = app.handle().clone();
            hotkey::register(&handle)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::copy_to_clipboard,
            commands::auto_paste,
            commands::toggle_pin,
            commands::toggle_favorite,
            commands::delete_clipboard_item,
            commands::delete_clipboard_items,
            commands::export_text,
            commands::export_images,
            commands::backup,
            commands::restore,
            commands::get_settings,
            commands::update_settings,
            commands::get_item_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Verify compilation (will fail on missing modules — expected)**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check 2>&1 | head -20
```

Expected: Errors about missing module files — we'll create them next

---

## Phase 3: Rust Backend — Clipboard, Hotkey, Tray

### Task 3.1: Implement clipboard monitor

**Files:**
- Create: `src-tauri/src/clipboard.rs`

- [ ] **Step 1: Write clipboard.rs**

Write `src-tauri/src/clipboard.rs`:
```rust
use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;
use crate::models::{ClipboardItem, ItemType};
use crate::storage;

#[cfg(target_os = "windows")]
mod win {
    use std::path::PathBuf;
    use image::GenericImageView;

    pub fn get_clipboard_text() -> Option<String> {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        unsafe {
            use windows_sys::Win32::System::DataExchange::*;
            use windows_sys::Win32::System::Memory::*;
            use windows_sys::Win32::Foundation::*;

            if OpenClipboard(0) == 0 { return None; }
            let handle = GetClipboardData(13); // CF_UNICODETEXT
            if handle == 0 { CloseClipboard(); return None; }

            let ptr = GlobalLock(handle) as *const u16;
            if ptr.is_null() { GlobalUnlock(handle); CloseClipboard(); return None; }

            let mut len = 0;
            while *ptr.add(len) != 0 { len += 1; }
            let slice = std::slice::from_raw_parts(ptr, len);
            let text = OsString::from_wide(slice).to_string_lossy().to_string();

            GlobalUnlock(handle);
            CloseClipboard();
            Some(text)
        }
    }

    pub fn get_clipboard_image(app_data: &PathBuf, images_dir: &PathBuf, thumbs_dir: &PathBuf) -> Option<(String, String, String)> {
        use std::io::Cursor;
        use std::fs;

        unsafe {
            use windows_sys::Win32::System::DataExchange::*;
            use windows_sys::Win32::System::Memory::*;
            use windows_sys::Win32::Foundation::*;

            if OpenClipboard(0) == 0 { return None; }

            // Try CF_DIB (8) first, then CF_BITMAP (2)
            let format = if IsClipboardFormatAvailable(8) != 0 { 8 }
                        else if IsClipboardFormatAvailable(2) != 0 { 2 }
                        else { CloseClipboard(); return None; };

            let handle = GetClipboardData(format);
            if handle == 0 { CloseClipboard(); return None; }

            // Read DIB data
            let ptr = GlobalLock(handle) as *const u8;
            if ptr.is_null() { GlobalUnlock(handle); CloseClipboard(); return None; }

            let size = GlobalSize(handle) as usize;

            let dib_data = std::slice::from_raw_parts(ptr, size).to_vec();
            GlobalUnlock(handle);
            CloseClipboard();

            // Convert DIB to PNG using the image crate
            // DIB header parsing and conversion
            if let Some((png_data, width, height)) = dib_to_png(&dib_data) {
                let ts = chrono::Local::now().format("%Y%m%d%H%M%S%3f");
                let filename = format!("{}_{}.png", "img", ts);
                let img_path = images_dir.join(&filename);
                let thumb_path = thumbs_dir.join(&filename);

                fs::write(&img_path, &png_data).ok()?;

                // Generate thumbnail
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

        // BITMAPINFOHEADER parsing
        let header_size = u32::from_le_bytes([dib[0], dib[1], dib[2], dib[3]]) as usize;
        let width = i32::from_le_bytes([dib[4], dib[5], dib[6], dib[7]]);
        let height = i32::from_le_bytes([dib[8], dib[9], dib[10], dib[11]]);
        let bit_count = u16::from_le_bytes([dib[14], dib[15]]);

        let abs_height = height.abs() as u32;
        let abs_width = width.abs() as u32;

        if abs_width == 0 || abs_height == 0 { return None; }

        // Build an in-memory BMP file so the image crate can parse it
        let row_size = ((abs_width * bit_count as u32 + 31) / 32) * 4;
        let pixel_data_size = row_size * abs_height;
        let pixel_offset = header_size;
        let file_size = 14 + dib.len();

        let mut bmp = Vec::with_capacity(file_size);
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&(file_size as u32).to_le_bytes());
        bmp.extend_from_slice(&[0u8; 4]); // reserved
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
            use windows_sys::Win32::Foundation::*;
            use std::ffi::OsString;
            use std::os::windows::ffi::OsStringExt;

            if OpenClipboard(0) == 0 { return None; }

            // CF_HDROP = 15
            let handle = GetClipboardData(15);
            if handle == 0 { CloseClipboard(); return None; }

            let ptr = GlobalLock(handle) as *const u8;
            if ptr.is_null() { GlobalUnlock(handle); CloseClipboard(); return None; }

            // Parse HDROP structure
            let drop_files = ptr as *const u32;
            let offset = *drop_files.add(4) as usize; // fOffSet in DROPFILES
            let file_ptr = ptr.add(offset);
            let mut paths = Vec::new();
            let mut pos = 0;
            loop {
                let ch_ptr = file_ptr.add(pos) as *const u16;
                if *ch_ptr == 0 {
                    if pos == 0 || *file_ptr.add(pos - 2) as u16 == 0 { break; }
                    let len = pos / 2;
                    let wide_slice = std::slice::from_raw_parts(file_ptr as *const u16, len);
                    paths.push(OsString::from_wide(wide_slice).to_string_lossy().to_string());
                    pos += 2;
                } else {
                    pos += 2;
                }
            }

            GlobalUnlock(handle);
            CloseClipboard();

            if paths.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&paths).unwrap_or_default())
            }
        }
    }

    pub fn get_foreground_app_name() -> Option<String> {
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::*;
            use windows_sys::Win32::System::Threading::*;

            let hwnd = GetForegroundWindow();
            if hwnd == 0 { return None; }

            let mut buf = [0u16; 256];
            let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            if len > 0 {
                return Some(String::from_utf16_lossy(&buf[..len as usize]));
            }

            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid > 0 {
                let handle = OpenProcess(0x0400 | 0x0010, 0, pid); // PROCESS_QUERY_INFORMATION | PROCESS_VM_READ
                if handle != 0 {
                    let mut exe_buf = [0u16; 260];
                    let mut size = exe_buf.len() as u32;
                    // simplified: just return None for now
                    CloseHandle(handle);
                }
            }
            None
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

        // Hash clipboard content to detect changes
        let current_hash = compute_clipboard_hash();
        if current_hash == 0 || current_hash == last_hash {
            continue;
        }
        last_hash = current_hash;

        let source_app = win::get_foreground_app_name();

        // Try image first (more specific), then file list, then text
        let item = if let Some((img_path, thumb_path, size)) =
            win::get_clipboard_image(&std::path::PathBuf::new("."), &images_dir, &thumbs_dir)
        {
            Some(ClipboardItem {
                id: 0,
                item_type: ItemType::Image,
                content: None,
                image_path: Some(img_path),
                thumbnail_path: Some(thumb_path),
                file_paths: None,
                source_app,
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
                source_app,
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
                    source_app,
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
                // Run cleanup
                if let Ok(settings) = storage::get_all_settings() {
                    storage::cleanup_old_items(settings.max_items, settings.max_images).ok();
                }

                // Notify frontend
                if let Ok(mut full_item) = storage::get_item(id) {
                    if let Some(full_item) = full_item.take() {
                        app_handle.emit("clipboard-changed", &full_item).ok();
                    }
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

        // Check available formats
        let formats = [13u32, 8, 2, 15]; // CF_UNICODETEXT, CF_DIB, CF_BITMAP, CF_HDROP
        for fmt in &formats {
            if IsClipboardFormatAvailable(*fmt) != 0 {
                fmt.hash(&mut hasher);
            }
        }

        // Try to hash content
        let text_handle = GetClipboardData(13);
        if text_handle != 0 {
            let ptr = GlobalLock(text_handle);
            if !ptr.is_null() {
                let size = GlobalSize(text_handle) as usize;
                if size > 0 && size < 65536 {
                    let slice = std::slice::from_raw_parts(ptr as *const u8, size.min(256));
                    slice.hash(&mut hasher);
                }
                GlobalUnlock(text_handle);
            }
        }

        CloseClipboard();
    }

    hasher.finish()
}
```

- [ ] **Step 2: Add windows-sys to Cargo.toml**

Edit `src-tauri/Cargo.toml`, add to `[dependencies]`:
```toml
windows-sys = { version = "0.52", features = ["Win32_System_DataExchange", "Win32_System_Memory", "Win32_Foundation", "Win32_UI_WindowsAndMessaging", "Win32_System_Threading", "Win32_System_ProcessStatus"] }
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: Compiles (may have warnings about unused code)

---

### Task 3.2: Implement global hotkey

**Files:**
- Create: `src-tauri/src/hotkey.rs`

- [ ] **Step 1: Write hotkey.rs**

Write `src-tauri/src/hotkey.rs`:
```rust
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, Code, Modifiers};

pub fn register(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyV);

    let handle = app.clone();
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, _shortcut, _event| {
                if _event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    // Show/hide the clipboard panel window
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        handle.emit("show-panel", ()).ok();
                    }
                }
            })
            .build(),
    )?;

    // Actually, for Tauri 2.x, use the GlobalShortcutExt:
    let shortcut_handle = app.global_shortcut();
    shortcut_handle.register(shortcut)?;

    Ok(())
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: May fail due to Tauri 2.x global-shortcut API — fix as needed based on actual crate version

---

### Task 3.3: Implement system tray

**Files:**
- Create: `src-tauri/src/tray.rs`

- [ ] **Step 1: Write tray.rs**

Write `src-tauri/src/tray.rs`:
```rust
use tauri::{
    Manager,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
};

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("show", "打开剪切板面板").build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&separator)
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .tooltip("SuperClipboard")
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        app.emit("show-panel", ()).ok();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    app.emit("show-panel", ()).ok();
                }
            }
        })
        .build(app)?;

    Ok(())
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: Compiles without errors

---

### Task 3.4: Implement export and backup

**Files:**
- Create: `src-tauri/src/export.rs`

- [ ] **Step 1: Write export.rs**

Write `src-tauri/src/export.rs`:
```rust
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use crate::storage;

pub fn export_text(ids: &[i64], output_path: &str) -> Result<String, String> {
    let items = get_items_by_ids(ids)?;
    let mut file = fs::File::create(output_path).map_err(|e| e.to_string())?;

    for (i, item) in items.iter().enumerate() {
        if let Some(ref content) = item.content {
            if i > 0 {
                writeln!(file, "\n--- {} | {} | {} ---\n",
                    item.created_at,
                    item.source_app.as_deref().unwrap_or("unknown"),
                    format!("{} chars", item.char_count.unwrap_or(0))
                ).map_err(|e| e.to_string())?;
            }
            write!(file, "{}", content).map_err(|e| e.to_string())?;
        }
    }

    Ok(format!("Exported {} text items to {}", items.len(), output_path))
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

    Ok(format!("Exported {} images to {}", count, output_dir))
}

pub fn backup(output_path: &str) -> Result<String, String> {
    let items = storage::get_all_items_for_backup().map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&items).map_err(|e| e.to_string())?;

    let file = fs::File::create(output_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("clipboard_data.json", options).map_err(|e| e.to_string())?;
    zip.write_all(json.as_bytes()).map_err(|e| e.to_string())?;

    // Include images
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

    // Extract images
    let app_data = get_app_data_from_backup_path(backup_path);
    let images_dir = PathBuf::from(&app_data).join("images");
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.starts_with("images/") {
            let dest = images_dir.join(&name["images/".len()..]);
            let mut file = fs::File::create(&dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
        }
    }

    let count = storage::restore_from_backup(&items).map_err(|e| e.to_string())?;
    Ok(format!("Restored {} items from {}", count, backup_path))
}

fn get_items_by_ids(ids: &[i64]) -> Result<Vec<crate::models::ClipboardItem>, String> {
    let mut items = Vec::new();
    for id in ids {
        if let Some(item) = storage::get_item(*id).map_err(|e| e.to_string())? {
            items.push(item);
        }
    }
    Ok(items)
}

fn get_app_data_from_backup_path(backup_path: &str) -> String {
    let p = PathBuf::from(backup_path);
    p.parent()
        .and_then(|pp| pp.parent())
        .map(|pp| pp.to_string_lossy().to_string())
        .unwrap_or_default()
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: Compiles without errors

---

### Task 3.5: Implement Tauri commands

**Files:**
- Create: `src-tauri/src/commands.rs`

- [ ] **Step 1: Write commands.rs**

Write `src-tauri/src/commands.rs`:
```rust
use tauri::{command, State, Emitter, AppHandle};
use std::sync::Mutex;
use crate::models::*;
use crate::storage;
use crate::export;

pub struct AppState {
    pub app_data_dir: std::path::PathBuf,
}

#[command]
pub fn get_clipboard_history(query: HistoryQuery) -> Result<HistoryResult, String> {
    storage::query_history(&query).map_err(|e| e.to_string())
}

#[command]
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
            // For files, copy the paths back as text
            if let Some(ref paths) = item.file_paths {
                set_clipboard_text(paths)?;
            }
        }
    }
    Ok(())
}

#[command]
pub fn auto_paste() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
        use windows_sys::Win32::UI::WindowsAndMessaging::*;

        // Simulate Ctrl+V
        keybd_event(0x11, 0, 0, 0);           // VK_CONTROL down
        keybd_event(0x56, 0, 0, 0);            // VK_V down
        keybd_event(0x56, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x11, 0, KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[command]
pub fn toggle_pin(id: i64) -> Result<bool, String> {
    storage::toggle_pin(id).map_err(|e| e.to_string())
}

#[command]
pub fn toggle_favorite(id: i64) -> Result<bool, String> {
    storage::toggle_favorite(id).map_err(|e| e.to_string())
}

#[command]
pub fn delete_clipboard_item(id: i64) -> Result<(), String> {
    // Also delete image files
    if let Ok(Some(item)) = storage::get_item(id) {
        if let Some(ref p) = item.image_path { std::fs::remove_file(p).ok(); }
        if let Some(ref p) = item.thumbnail_path { std::fs::remove_file(p).ok(); }
    }
    storage::delete_item(id).map_err(|e| e.to_string())
}

#[command]
pub fn delete_clipboard_items(ids: Vec<i64>) -> Result<(), String> {
    for &id in &ids {
        if let Ok(Some(item)) = storage::get_item(id) {
            if let Some(ref p) = item.image_path { std::fs::remove_file(p).ok(); }
            if let Some(ref p) = item.thumbnail_path { std::fs::remove_file(p).ok(); }
        }
    }
    storage::delete_items(&ids).map_err(|e| e.to_string())
}

#[command]
pub fn export_text(ids: Vec<i64>, output_path: String) -> Result<String, String> {
    export::export_text(&ids, &output_path)
}

#[command]
pub fn export_images(ids: Vec<i64>, output_dir: String) -> Result<String, String> {
    export::export_images(&ids, &output_dir)
}

#[command]
pub fn backup(output_path: String) -> Result<String, String> {
    export::backup(&output_path)
}

#[command]
pub fn restore(backup_path: String) -> Result<String, String> {
    export::restore(&backup_path)
}

#[command]
pub fn get_settings() -> Result<AppSettings, String> {
    storage::get_all_settings().map_err(|e| e.to_string())
}

#[command]
pub fn update_settings(settings: AppSettings) -> Result<(), String> {
    storage::save_all_settings(&settings).map_err(|e| e.to_string())
}

#[command]
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

// Helper functions for clipboard writes
#[cfg(target_os = "windows")]
fn set_clipboard_text(text: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    unsafe {
        use windows_sys::Win32::System::DataExchange::*;
        use windows_sys::Win32::System::Memory::*;

        let wide: Vec<u16> = OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect();
        let size = wide.len() * std::mem::size_of::<u16>();

        let handle = GlobalAlloc(0x0002, size); // GMEM_MOVEABLE
        if handle == 0 { return Err("GlobalAlloc failed".into()); }

        let ptr = GlobalLock(handle);
        if ptr.is_null() { GlobalFree(handle); return Err("GlobalLock failed".into()); }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr as *mut u16, wide.len());
        GlobalUnlock(handle);

        if OpenClipboard(0) == 0 { GlobalFree(handle); return Err("OpenClipboard failed".into()); }
        EmptyClipboard();
        SetClipboardData(13, handle); // CF_UNICODETEXT
        CloseClipboard();
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_clipboard_image(_img_path: &str) -> Result<(), String> {
    // For simplicity, copy image path as text to clipboard
    // Full image-to-clipboard requires DIB format conversion
    set_clipboard_text(_img_path)
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: Compiles without errors (some warnings ok)

---

## Phase 4: React Frontend — Types, API, Shell

### Task 4.1: Define TypeScript types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write types.ts**

Write `src/types.ts`:
```typescript
export type ItemType = 'text' | 'image' | 'file';

export interface ClipboardItem {
  id: number;
  item_type: ItemType;
  content: string | null;
  image_path: string | null;
  thumbnail_path: string | null;
  file_paths: string | null;        // JSON string of string[]
  source_app: string | null;
  char_count: number | null;
  image_size: string | null;
  is_pinned: boolean;
  is_favorite: boolean;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistoryQuery {
  keyword: string | null;
  item_type: string | null;          // "all" | "text" | "image" | "file"
  date_from: string | null;          // ISO date string
  date_to: string | null;            // ISO date string
  tab: string | null;                // "all" | "favorites"
  offset: number;
  limit: number;
}

export interface HistoryResult {
  items: ClipboardItem[];
  total: number;
}

export interface AppSettings {
  hotkey: string;
  max_items: number;
  max_images: number;
  auto_paste: boolean;
  auto_start: boolean;
}

export type TabType = 'all' | 'favorites';
export type FilterType = 'all' | 'text' | 'image' | 'file';
export type DateFilter = 'all' | 'today' | '3days' | '7days' | 'custom';
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
cd D:\Desktop\SuperClipboard
npx tsc --noEmit
```

Expected: No errors (may have unused-type warnings)

---

### Task 4.2: Create API layer

**Files:**
- Create: `src/api.ts`

- [ ] **Step 1: Write api.ts**

Write `src/api.ts`:
```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { HistoryQuery, HistoryResult, ClipboardItem, AppSettings } from './types';

// Query
export async function getClipboardHistory(query: HistoryQuery): Promise<HistoryResult> {
  return invoke('get_clipboard_history', { query });
}

// Clipboard actions
export async function copyToClipboard(id: number): Promise<void> {
  return invoke('copy_to_clipboard', { id });
}

export async function autoPaste(): Promise<void> {
  return invoke('auto_paste');
}

// Toggle states
export async function togglePin(id: number): Promise<boolean> {
  return invoke('toggle_pin', { id });
}

export async function toggleFavorite(id: number): Promise<boolean> {
  return invoke('toggle_favorite', { id });
}

// Delete
export async function deleteClipboardItem(id: number): Promise<void> {
  return invoke('delete_clipboard_item', { id });
}

export async function deleteClipboardItems(ids: number[]): Promise<void> {
  return invoke('delete_clipboard_items', { ids });
}

// Export
export async function exportText(ids: number[], outputPath: string): Promise<string> {
  return invoke('export_text', { ids, outputPath });
}

export async function exportImages(ids: number[], outputDir: string): Promise<string> {
  return invoke('export_images', { ids, outputDir });
}

// Backup / Restore
export async function backup(outputPath: string): Promise<string> {
  return invoke('backup', { outputPath });
}

export async function restore(backupPath: string): Promise<string> {
  return invoke('restore', { backupPath });
}

// Settings
export async function getSettings(): Promise<AppSettings> {
  return invoke('get_settings');
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  return invoke('update_settings', { settings });
}

export async function getItemCount(): Promise<number> {
  return invoke('get_item_count');
}

// Events
export function onClipboardChanged(callback: (item: ClipboardItem) => void): Promise<UnlistenFn> {
  return listen<ClipboardItem>('clipboard-changed', (event) => {
    callback(event.payload);
  });
}

export function onShowPanel(callback: () => void): Promise<UnlistenFn> {
  return listen<void>('show-panel', () => {
    callback();
  });
}
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
cd D:\Desktop\SuperClipboard
npx tsc --noEmit
```

Expected: No errors

---

### Task 4.3: Create utility functions

**Files:**
- Create: `src/utils/format.ts`

- [ ] **Step 1: Write format.ts**

Write `src/utils/format.ts`:
```typescript
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'Z'); // SQLite stores local time, treat as UTC for parsing
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function truncateText(text: string, maxLines: number = 3, maxChars: number = 200): string {
  const lines = text.split('\n');
  let result = '';
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    if (i > 0) result += '\n';
    result += lines[i];
  }
  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + '...';
  }
  if (lines.length > maxLines) {
    result += '\n...';
  }
  return result;
}

export function formatCharCount(count: number): string {
  if (count < 1000) return `${count} 字`;
  return `${(count / 1000).toFixed(1)}k 字`;
}

export function parseFilePaths(filePathsJson: string): string[] {
  try {
    return JSON.parse(filePathsJson);
  } catch {
    return [filePathsJson];
  }
}

export function getDateRange(filter: string): { from: string | null; to: string | null } {
  const now = new Date();
  const to = now.toISOString().slice(0, 19);
  let from: string | null = null;

  switch (filter) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      from = d.toISOString().slice(0, 19);
      break;
    }
    case '3days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 3);
      from = d.toISOString().slice(0, 19);
      break;
    }
    case '7days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = d.toISOString().slice(0, 19);
      break;
    }
    // "all" or "custom" → no filter
  }

  return { from, to };
}
```

---

## Phase 5: React Frontend — Core Components

### Task 5.1: Create ClipboardPanel shell

**Files:**
- Create: `src/components/ClipboardPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write App.tsx**

Write `src/App.tsx`:
```tsx
import { useState, useEffect, useCallback } from 'react';
import { onShowPanel, onClipboardChanged } from './api';
import ClipboardPanel from './components/ClipboardPanel';

function App() {
  const [visible, setVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const unlistenShow = onShowPanel(() => {
      setVisible(true);
    });
    const unlistenChange = onClipboardChanged(() => {
      setRefreshKey(k => k + 1);
    });

    return () => {
      unlistenShow.then(fn => fn());
      unlistenChange.then(fn => fn());
    };
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 flex items-start justify-center pt-24 bg-black/20"
         onClick={handleClose}>
      <div className="animate-slide-up w-[400px] max-h-[560px] rounded-xl bg-panel-bg border border-panel-border shadow-2xl overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <ClipboardPanel refreshKey={refreshKey} onClose={handleClose} />
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Write ClipboardPanel.tsx**

Write `src/components/ClipboardPanel.tsx`:
```tsx
import { useState } from 'react';
import SearchBar from './SearchBar';
import TabBar from './TabBar';
import CardList from './CardList';
import type { FilterType, DateFilter, TabType, HistoryQuery } from '../types';

interface Props {
  refreshKey: number;
  onClose: () => void;
}

export default function ClipboardPanel({ refreshKey, onClose }: Props) {
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [tab, setTab] = useState<TabType>('all');

  return (
    <div className="flex flex-col h-full">
      <SearchBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
      />
      <TabBar tab={tab} onTabChange={setTab} />
      <CardList
        query={{ keyword: keyword || null, item_type: typeFilter, tab, date_from: null, date_to: null, offset: 0, limit: 100 }}
        refreshKey={refreshKey}
        onClose={onClose}
      />
    </div>
  );
}
```

---

### Task 5.2: Create SearchBar component

**Files:**
- Create: `src/components/SearchBar.tsx`

- [ ] **Step 1: Write SearchBar.tsx**

Write `src/components/SearchBar.tsx`:
```tsx
import type { FilterType, DateFilter } from '../types';

interface Props {
  keyword: string;
  onKeywordChange: (v: string) => void;
  typeFilter: FilterType;
  onTypeFilterChange: (v: FilterType) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (v: DateFilter) => void;
}

const TYPE_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'text', label: '文字' },
  { value: 'image', label: '图片' },
  { value: 'file', label: '文件' },
];

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: '不限' },
  { value: 'today', label: '今天' },
  { value: '3days', label: '近3天' },
  { value: '7days', label: '近7天' },
];

export default function SearchBar({ keyword, onKeywordChange, typeFilter, onTypeFilterChange, dateFilter, onDateFilterChange }: Props) {
  return (
    <div className="p-3 space-y-2 border-b border-panel-border">
      {/* Search input */}
      <div className="relative">
        <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-panel-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={keyword}
          onChange={e => onKeywordChange(e.target.value)}
          placeholder="搜索剪切板历史..."
          className="w-full pl-9 pr-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-text placeholder-panel-muted focus:outline-none focus:border-panel-accent"
        />
      </div>

      {/* Filters row */}
      <div className="flex gap-2">
        <div className="flex gap-1">
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onTypeFilterChange(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                typeFilter === opt.value
                  ? 'bg-panel-accent text-white'
                  : 'bg-panel-card text-panel-muted hover:text-panel-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="w-px bg-panel-border" />
        <select
          value={dateFilter}
          onChange={e => onDateFilterChange(e.target.value as DateFilter)}
          className="bg-panel-card border border-panel-border rounded-md text-xs text-panel-text px-2 py-1 focus:outline-none focus:border-panel-accent"
        >
          {DATE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

---

### Task 5.3: Create TabBar component

**Files:**
- Create: `src/components/TabBar.tsx`

- [ ] **Step 1: Write TabBar.tsx**

Write `src/components/TabBar.tsx`:
```tsx
import type { TabType } from '../types';

interface Props {
  tab: TabType;
  onTabChange: (tab: TabType) => void;
}

export default function TabBar({ tab, onTabChange }: Props) {
  return (
    <div className="flex border-b border-panel-border px-3">
      <button
        onClick={() => onTabChange('all')}
        className={`px-4 py-2 text-sm border-b-2 transition-colors ${
          tab === 'all'
            ? 'border-panel-accent text-panel-accent'
            : 'border-transparent text-panel-muted hover:text-panel-text'
        }`}
      >
        全部
      </button>
      <button
        onClick={() => onTabChange('favorites')}
        className={`px-4 py-2 text-sm border-b-2 transition-colors ${
          tab === 'favorites'
            ? 'border-panel-accent text-panel-accent'
            : 'border-transparent text-panel-muted hover:text-panel-text'
        }`}
      >
        ⭐ 收藏
      </button>
    </div>
  );
}
```

---

### Task 5.4: Create clipboard cards

**Files:**
- Create: `src/components/ClipboardCard.tsx`
- Create: `src/components/cards/TextCard.tsx`
- Create: `src/components/cards/ImageCard.tsx`
- Create: `src/components/cards/FileCard.tsx`

- [ ] **Step 1: Write ClipboardCard.tsx**

Write `src/components/ClipboardCard.tsx`:
```tsx
import type { ClipboardItem } from '../types';
import TextCard from './cards/TextCard';
import ImageCard from './cards/ImageCard';
import FileCard from './cards/FileCard';

interface Props {
  item: ClipboardItem;
  onCopy: (item: ClipboardItem) => void;
  onTogglePin: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function ClipboardCard({ item, onCopy, onTogglePin, onToggleFavorite, onDelete }: Props) {
  const renderContent = () => {
    switch (item.item_type) {
      case 'text':
        return <TextCard item={item} />;
      case 'image':
        return <ImageCard item={item} />;
      case 'file':
        return <FileCard item={item} />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`group relative bg-panel-card border border-panel-border rounded-lg p-3 cursor-pointer hover:bg-panel-hover transition-colors ${
        item.is_pinned ? 'ring-1 ring-panel-accent/50' : ''
      }`}
      onClick={() => onCopy(item)}
    >
      {/* Action buttons - visible on hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onTogglePin(item.id); }}
          className={`p-1 rounded text-xs ${item.is_pinned ? 'text-panel-accent' : 'text-panel-muted hover:text-panel-text'}`}
          title="置顶"
        >
          📌
        </button>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(item.id); }}
          className={`p-1 rounded text-xs ${item.is_favorite ? 'text-yellow-400' : 'text-panel-muted hover:text-panel-text'}`}
          title="收藏"
        >
          ⭐
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(item.id); }}
          className="p-1 rounded text-xs text-panel-muted hover:text-red-400"
          title="删除"
        >
          🗑
        </button>
      </div>

      {renderContent()}

      {/* Footer: time & source */}
      <div className="flex items-center justify-between mt-2 text-xs text-panel-muted">
        <span>{formatTime(item.created_at)}</span>
        {item.source_app && <span>{item.source_app}</span>}
      </div>
    </div>
  );
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'Z');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return dateStr;
  }
}
```

- [ ] **Step 2: Write TextCard.tsx**

Write `src/components/cards/TextCard.tsx`:
```tsx
import type { ClipboardItem } from '../../types';
import { truncateText, formatCharCount } from '../../utils/format';

interface Props {
  item: ClipboardItem;
}

export default function TextCard({ item }: Props) {
  const text = item.content || '';
  const preview = truncateText(text, 3, 200);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-panel-accent/20 text-panel-accent rounded">文字</span>
        {item.char_count && (
          <span className="text-xs text-panel-muted">{formatCharCount(item.char_count)}</span>
        )}
      </div>
      <p className="text-sm text-panel-text whitespace-pre-wrap leading-relaxed">{preview}</p>
    </div>
  );
}
```

- [ ] **Step 3: Write ImageCard.tsx**

Write `src/components/cards/ImageCard.tsx`:
```tsx
import { useState } from 'react';
import type { ClipboardItem } from '../../types';
import { convertFileSrc } from '@tauri-apps/api/core';

interface Props {
  item: ClipboardItem;
}

export default function ImageCard({ item }: Props) {
  const [loaded, setLoaded] = useState(false);
  const thumbSrc = item.thumbnail_path
    ? convertFileSrc(item.thumbnail_path)
    : (item.image_path ? convertFileSrc(item.image_path) : '');

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">图片</span>
        {item.image_size && <span className="text-xs text-panel-muted">{item.image_size}</span>}
      </div>
      <div className="rounded-md overflow-hidden bg-black/30">
        {!loaded && <div className="h-20 flex items-center justify-center text-panel-muted text-xs">加载中...</div>}
        <img
          src={thumbSrc}
          alt="clipboard"
          className={`w-full max-h-48 object-cover ${loaded ? 'block' : 'hidden'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write FileCard.tsx**

Write `src/components/cards/FileCard.tsx`:
```tsx
import type { ClipboardItem } from '../../types';
import { parseFilePaths } from '../../utils/format';

interface Props {
  item: ClipboardItem;
}

export default function FileCard({ item }: Props) {
  const paths = item.file_paths ? parseFilePaths(item.file_paths) : [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">文件</span>
        <span className="text-xs text-panel-muted">{paths.length} 个文件</span>
      </div>
      <div className="space-y-0.5">
        {paths.slice(0, 3).map((p, i) => (
          <p key={i} className="text-sm text-panel-text truncate">
            📄 {p.split('\\').pop() || p}
          </p>
        ))}
        {paths.length > 3 && (
          <p className="text-xs text-panel-muted">...还有 {paths.length - 3} 个文件</p>
        )}
      </div>
    </div>
  );
}
```

---

### Task 5.5: Create CardList with virtual scrolling

**Files:**
- Create: `src/components/CardList.tsx`
- Modify: `src/App.tsx` (already written)

- [ ] **Step 1: Write CardList.tsx**

Write `src/components/CardList.tsx`:
```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { getClipboardHistory, copyToClipboard, autoPaste, togglePin, toggleFavorite, deleteClipboardItem, getSettings } from '../api';
import ClipboardCard from './ClipboardCard';
import type { ClipboardItem, HistoryQuery } from '../types';
import { getDateRange } from '../utils/format';

interface Props {
  query: HistoryQuery;
  refreshKey: number;
  onClose: () => void;
}

const PAGE_SIZE = 50;

export default function CardList({ query, refreshKey, onClose }: Props) {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Load settings for auto-paste
  useEffect(() => {
    getSettings().then(s => setAutoPasteEnabled(s.auto_paste)).catch(() => {});
  }, []);

  // Fetch data
  const fetchItems = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(query.date_from || 'all');
      const q: HistoryQuery = {
        ...query,
        date_from: from,
        date_to: to,
        limit: PAGE_SIZE,
        offset: reset ? 0 : items.length,
      };
      const result = await getClipboardHistory(q);
      if (reset) {
        setItems(result.items);
      } else {
        setItems(prev => [...prev, ...result.items]);
      }
      setTotal(result.total);
      setHasMore(result.items.length === PAGE_SIZE);
    } catch (err) {
      console.error('Failed to fetch clipboard history:', err);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchItems(true);
  }, [query.keyword, query.item_type, query.date_from, query.tab, refreshKey]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!listRef.current || loading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchItems(false);
    }
  }, [loading, hasMore, fetchItems]);

  // Copy handler
  const handleCopy = useCallback(async (item: ClipboardItem) => {
    try {
      await copyToClipboard(item.id);
      if (autoPasteEnabled) {
        await autoPaste();
      }
      onClose();
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [autoPasteEnabled, onClose]);

  // Toggle handlers
  const handleTogglePin = useCallback(async (id: number) => {
    try {
      const newState = await togglePin(id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_pinned: newState } : i).sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)));
    } catch (err) { console.error(err); }
  }, []);

  const handleToggleFavorite = useCallback(async (id: number) => {
    try {
      const newState = await toggleFavorite(id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_favorite: newState } : i));
    } catch (err) { console.error(err); }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteClipboardItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) { console.error(err); }
  }, []);

  return (
    <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-2">
      {items.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-panel-muted">
          <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">暂无剪切板记录</p>
          <p className="text-xs mt-1">使用 Ctrl+C 复制内容开始记录</p>
        </div>
      )}

      {items.map(item => (
        <ClipboardCard
          key={item.id}
          item={item}
          onCopy={handleCopy}
          onTogglePin={handleTogglePin}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDelete}
        />
      ))}

      {loading && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-panel-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Footer stats */}
      {total > 0 && (
        <div className="text-center text-xs text-panel-muted py-2 border-t border-panel-border mt-2">
          共 {total} 条记录
        </div>
      )}
    </div>
  );
}
```

---

## Phase 6: React Frontend — Dialogs & Settings

### Task 6.1: Create ExportDialog

**Files:**
- Create: `src/components/ExportDialog.tsx`

- [ ] **Step 1: Write ExportDialog.tsx**

Write `src/components/ExportDialog.tsx`:
```tsx
import { useState } from 'react';
import { exportText, exportImages } from '../api';
import { open } from '@tauri-apps/plugin-dialog';

interface Props {
  itemIds: number[];
  onClose: () => void;
}

export default function ExportDialog({ itemIds, onClose }: Props) {
  const [exportMode, setExportMode] = useState<'text' | 'images'>('text');
  const [status, setStatus] = useState('');

  const handleExport = async () => {
    try {
      if (exportMode === 'text') {
        const path = await open({
          directory: false,
          multiple: false,
          filters: [{ name: 'Text', extensions: ['txt'] }],
          defaultPath: `superclipboard_export_${Date.now()}.txt`,
        });
        if (!path) return;
        const msg = await exportText(itemIds, path as string);
        setStatus(msg);
      } else {
        const dir = await open({ directory: true, multiple: false });
        if (!dir) return;
        const msg = await exportImages(itemIds, dir as string);
        setStatus(msg);
      }
    } catch (err: any) {
      setStatus(`导出失败: ${err}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">导出</h2>

        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-3 p-3 bg-panel-card rounded-lg cursor-pointer hover:bg-panel-hover">
            <input type="radio" checked={exportMode === 'text'} onChange={() => setExportMode('text')}
                   className="text-panel-accent" />
            <div>
              <div className="text-sm text-panel-text">导出文字</div>
              <div className="text-xs text-panel-muted">合并导出为一个 .txt 文件</div>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 bg-panel-card rounded-lg cursor-pointer hover:bg-panel-hover">
            <input type="radio" checked={exportMode === 'images'} onChange={() => setExportMode('images')}
                   className="text-panel-accent" />
            <div>
              <div className="text-sm text-panel-text">导出图片</div>
              <div className="text-xs text-panel-muted">导出为原始 PNG/JPG 文件</div>
            </div>
          </label>
        </div>

        {status && <p className="text-sm text-panel-muted mb-3">{status}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">取消</button>
          <button onClick={handleExport} className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90">
            选择位置并导出
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 6.2: Create BackupDialog

**Files:**
- Create: `src/components/BackupDialog.tsx`

- [ ] **Step 1: Write BackupDialog.tsx**

Write `src/components/BackupDialog.tsx`:
```tsx
import { useState } from 'react';
import { backup, restore } from '../api';
import { open } from '@tauri-apps/plugin-dialog';

interface Props {
  onClose: () => void;
}

export default function BackupDialog({ onClose }: Props) {
  const [status, setStatus] = useState('');

  const handleBackup = async () => {
    try {
      const path = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        defaultPath: `superclipboard_backup_${new Date().toISOString().slice(0, 10)}.zip`,
      });
      if (!path) return;
      setStatus('备份中...');
      const msg = await backup(path as string);
      setStatus(msg);
    } catch (err: any) {
      setStatus(`备份失败: ${err}`);
    }
  };

  const handleRestore = async () => {
    try {
      const path = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      });
      if (!path) return;
      if (!confirm('恢复将清空当前数据，确定继续？')) return;
      setStatus('恢复中...');
      const msg = await restore(path as string);
      setStatus(msg);
    } catch (err: any) {
      setStatus(`恢复失败: ${err}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">备份与恢复</h2>

        <div className="space-y-4">
          <div className="p-4 bg-panel-card rounded-lg">
            <h3 className="text-sm font-medium text-panel-text mb-2">创建备份</h3>
            <p className="text-xs text-panel-muted mb-3">导出所有数据和图片为 .zip 包</p>
            <button onClick={handleBackup}
                    className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90">
              创建备份
            </button>
          </div>

          <div className="p-4 bg-panel-card rounded-lg">
            <h3 className="text-sm font-medium text-panel-text mb-2">恢复备份</h3>
            <p className="text-xs text-panel-muted mb-3">从 .zip 备份包恢复数据（会清空当前数据）</p>
            <button onClick={handleRestore}
                    className="px-4 py-2 text-sm border border-panel-border text-panel-text rounded-lg hover:bg-panel-hover">
              选择备份文件
            </button>
          </div>
        </div>

        {status && (
          <p className={`text-sm mt-4 p-3 rounded-lg ${status.includes('失败') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
            {status}
          </p>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">关闭</button>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 6.3: Create SettingsPanel

**Files:**
- Create: `src/components/SettingsPanel.tsx`

- [ ] **Step 1: Write SettingsPanel.tsx**

Write `src/components/SettingsPanel.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { getSettings, updateSettings as saveSettings } from '../api';
import type { AppSettings } from '../types';

interface Props {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    hotkey: 'Alt+V',
    max_items: 3000,
    max_images: 500,
    auto_paste: false,
    auto_start: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">设置</h2>

        <div className="space-y-4">
          {/* Hotkey */}
          <div>
            <label className="text-sm text-panel-text block mb-1">全局快捷键</label>
            <input
              type="text"
              value={settings.hotkey}
              onChange={e => setSettings(s => ({ ...s, hotkey: e.target.value }))}
              className="w-full px-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-text"
              readOnly
            />
            <p className="text-xs text-panel-muted mt-1">默认 Alt+V（当前版本不支持自定义）</p>
          </div>

          {/* Max items */}
          <div>
            <label className="text-sm text-panel-text block mb-1">历史记录上限</label>
            <input
              type="number"
              value={settings.max_items}
              onChange={e => setSettings(s => ({ ...s, max_items: parseInt(e.target.value) || 3000 }))}
              min={1000} max={10000} step={500}
              className="w-full px-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-text"
            />
          </div>

          {/* Max images */}
          <div>
            <label className="text-sm text-panel-text block mb-1">图片保留上限</label>
            <input
              type="number"
              value={settings.max_images}
              onChange={e => setSettings(s => ({ ...s, max_images: parseInt(e.target.value) || 500 }))}
              min={100} max={2000} step={100}
              className="w-full px-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-text"
            />
          </div>

          {/* Auto paste */}
          <label className="flex items-center justify-between p-3 bg-panel-card rounded-lg cursor-pointer">
            <div>
              <div className="text-sm text-panel-text">选中后自动粘贴</div>
              <div className="text-xs text-panel-muted">选择记录后自动 Ctrl+V</div>
            </div>
            <input
              type="checkbox"
              checked={settings.auto_paste}
              onChange={e => setSettings(s => ({ ...s, auto_paste: e.target.checked }))}
              className="w-4 h-4 text-panel-accent"
            />
          </label>

          {/* Auto start */}
          <label className="flex items-center justify-between p-3 bg-panel-card rounded-lg cursor-pointer">
            <div>
              <div className="text-sm text-panel-text">开机自启</div>
              <div className="text-xs text-panel-muted">Windows 启动时自动运行</div>
            </div>
            <input
              type="checkbox"
              checked={settings.auto_start}
              onChange={e => setSettings(s => ({ ...s, auto_start: e.target.checked }))}
              className="w-4 h-4 text-panel-accent"
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">关闭</button>
          <button onClick={handleSave}
                  className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90">
            {saved ? '已保存 ✓' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 7: Integration & Final Wiring

### Task 7.1: Wire App.tsx with all dialogs and tray menu handling

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx with dialogs**

Write `src/App.tsx` (full replacement):
```tsx
import { useState, useEffect, useCallback } from 'react';
import { onShowPanel, onClipboardChanged } from './api';
import ClipboardPanel from './components/ClipboardPanel';
import ExportDialog from './components/ExportDialog';
import BackupDialog from './components/BackupDialog';
import SettingsPanel from './components/SettingsPanel';

type DialogType = 'none' | 'export' | 'backup' | 'settings';

function App() {
  const [visible, setVisible] = useState(false);
  const [dialog, setDialog] = useState<DialogType>('none');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const unlistenShow = onShowPanel(() => setVisible(v => !v));
    const unlistenChange = onClipboardChanged(() => setRefreshKey(k => k + 1));
    return () => {
      unlistenShow.then(fn => fn());
      unlistenChange.then(fn => fn());
    };
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setDialog('none');
  }, []);

  if (!visible && dialog === 'none') return null;

  return (
    <>
      {visible && (
        <div className="fixed inset-0 flex items-start justify-center pt-24 bg-black/20"
             onClick={handleClose}>
          <div className="animate-slide-up w-[400px] max-h-[560px] rounded-xl bg-panel-bg border border-panel-border shadow-2xl overflow-hidden"
               onClick={e => e.stopPropagation()}>
            {/* Title bar with action buttons */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border bg-panel-card/50">
              <span className="text-xs font-medium text-panel-text">SuperClipboard</span>
              <div className="flex gap-1">
                <button onClick={() => setDialog('export')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                        title="导出">📤</button>
                <button onClick={() => setDialog('backup')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                        title="备份/恢复">💾</button>
                <button onClick={() => setDialog('settings')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                        title="设置">⚙</button>
                <button onClick={handleClose} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                        title="关闭">✕</button>
              </div>
            </div>
            <ClipboardPanel refreshKey={refreshKey} onClose={handleClose} />
          </div>
        </div>
      )}

      {dialog === 'export' && <ExportDialog itemIds={[]} onClose={() => setDialog('none')} />}
      {dialog === 'backup' && <BackupDialog onClose={() => setDialog('none')} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog('none')} />}
    </>
  );
}

export default App;
```

---

### Task 7.2: Final compilation check and dev run

- [ ] **Step 1: Check TypeScript compiles**

Run:
```bash
cd D:\Desktop\SuperClipboard
npx tsc --noEmit
```

Expected: No TypeScript errors

- [ ] **Step 2: Check Rust compiles**

Run:
```bash
cd D:\Desktop\SuperClipboard\src-tauri
cargo check
```

Expected: No Rust errors (warnings ok for now)

- [ ] **Step 3: Dev run smoke test**

Run:
```bash
cd D:\Desktop\SuperClipboard
cargo tauri dev
```

Expected: Application launches, system tray icon appears, Alt+V shows panel. Test: copy some text, verify it appears in the panel.

---

## Spec Coverage Checklist

| Spec Feature | Task(s) |
|---|---|
| 剪切板监听 (Clipboard Monitor) | 3.1 |
| 系统托盘 (System Tray) | 3.3 |
| 全局快捷键 (Global Hotkey) | 3.2 |
| 文字/图片/文件内容类型 | 2.1, 3.1, 5.4 |
| 卡片式面板 UI | 5.1, 5.4, 5.5 |
| 置顶功能 | 2.2 (toggle_pin), 5.5 |
| 收藏功能 | 2.2 (toggle_favorite), 5.3, 5.5 |
| 搜索功能 (FTS5 + filters) | 2.2 (query), 5.2 |
| 粘贴交互 + 自动粘贴 | 3.5 (copy_to_clipboard, auto_paste), 5.5 |
| 导出 (文字/图片) | 3.4, 3.5, 6.1 |
| 备份与恢复 | 3.4, 3.5, 6.2 |
| 清理策略 | 2.2 (cleanup_old_items), 3.1 |
| 设置面板 | 6.3 |
| 数据模型 | 2.1, 2.2 |
| 扩展性（预留富文本） | 2.1 (metadata field) |
