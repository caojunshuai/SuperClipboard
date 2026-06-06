# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

SuperClipboard is a Windows-only clipboard manager built with **Tauri 2 + React 18 + TypeScript + Tailwind CSS 3** (frontend) and **Rust** (backend). It monitors the Windows clipboard, maintains a searchable history of text/images/files in SQLite, and provides a floating panel UI summoned by Alt+V.

## Build & Run

```bash
# Install deps (first time only)
npm install

# Development
npm run tauri dev

# Production build
npm run tauri build
```

> **Toolchain note:** The default toolchain is `stable-x86_64-pc-windows-gnu`. `windres.exe` must be in PATH (from MSYS2/MinGW-w64) for the Windows resource (.rc) compilation that embeds the app icon. Without it, the build succeeds but the .exe has no icon. If using MSVC, `link.exe` must be available.

## Project Structure

```
src/                        # React frontend
  App.tsx                   # Root: dialog state, title bar, drag
  api.ts                    # Tauri invoke() wrappers + event listeners
  types.ts                  # TS type definitions (ClipboardItem, etc.)
  components/
    ClipboardPanel.tsx      # Main panel: search + tabs + card list
    ClipboardCard.tsx       # Single clip card (pin/fav/delete actions)
    CardList.tsx            # Virtual scroll list, toast notifications
    SearchBar.tsx           # Search input, type/date filters
    TabBar.tsx              # All / Favorites tabs
    SettingsPanel.tsx       # Settings form with validation & dirty detection
    ExportDialog.tsx        # Export text or images
    BackupDialog.tsx        # Backup to zip / Restore from zip
    cards/
      TextCard.tsx          # Renders text content
      ImageCard.tsx         # Renders image thumbnail
      FileCard.tsx          # Renders file paths with tooltip

src-tauri/src/              # Rust backend
  main.rs                   # Entry point
  lib.rs                    # Plugin setup, DB init, spawn clipboard monitor
  clipboard.rs              # Windows clipboard poll loop (CF_UNICODETEXT/DIB/HDROP)
  storage.rs                # SQLite: upsert, query, FTS, settings CRUD
  models.rs                 # ClipboardItem, ItemType, HistoryQuery, AppSettings
  commands.rs               # Tauri #[command] handlers (IPC from frontend)
  export.rs                 # Text export, image export, zip backup/restore
  hotkey.rs                 # Global hotkey Alt+V via tauri-plugin-global-shortcut
  tray.rs                   # System tray icon & context menu
```

## Architecture Notes

### Clipboard Monitoring
- `clipboard.rs` runs in a spawned `std::thread` (not tokio)
- Polls `GetClipboardSequenceNumber()` every 500ms to detect changes
- Reads CF_UNICODETEXT (text), CF_DIB (images), CF_HDROP (files)
- Images are converted from DIB to PNG via the `image` crate
- Content is deduplicated via FNV-1a 64-bit hash → `upsert_item()`

### Database (storage.rs)
- SQLite with `rusqlite` (bundled, not system lib)
- WAL mode enabled
- `clipboard_items` table with FTS5 external content table for search
- `upsert_item()`: checks `content_hash` → updates timestamp if duplicate, inserts if new
- Search uses `LIKE` for all queries (not FTS5). FTS5's `unicode61` tokenizer can't tokenize CJK characters, and substring `LIKE` is fast enough for clipboard-scale data (thousands of rows)
- A global `OnceCell<Mutex<Connection>>` holds the DB connection

### IPC (commands.rs)
- All commands are async via `#[tauri::command]`
- `copy_to_clipboard`: writes to Windows clipboard (text → CF_UNICODETEXT, image → CF_DIB, file → CF_HDROP with DROPFILES structure)
- `auto_paste`: simulates Ctrl+V via `keybd_event` (no Tauri plugin needed for this)
- `hide_window`: hides the panel window
- `start_drag`: uses `PostMessageW(WM_NCLBUTTONDOWN, HTCAPTION)` directly — Tauri's `startDragging()` doesn't work because the async IPC loses the mouse gesture context

### Frontend (React)
- Single window app, no routing
- `ClipboardPanel` manages all state: search query, selected tab, filter type, pagination
- `refreshKey` in App.tsx triggers re-fetch on clipboard change or panel show
- Dialogs (export, backup, settings) are conditionally rendered overlays
- Tailwind CSS with custom theme colors in `tailwind.config.js`
- Delete animation: `deletingIds` Set in CardList → CSS transition 200ms → remove from list

### CJK Search
- Detects CJK characters (CJK Unified, Hiragana, Katakana, Hangul ranges)
- Falls back to `content LIKE '%keyword%'` for all queries
- This is simpler and works for both English and CJK

### Icon
- `icons/icon.png` is the source (1024×1024)
- `npx tauri icon` generates all platform formats
- Tray icon embedded via `include_bytes!("../icons/icon.png")` → `image::load_from_memory()` → `Image::new_owned()`
- Windows exe icon embedded via `tauri-build` → `.rc` file → `windres`/`rc.exe`

## Common Tasks

### Adding a new Tauri command
1. Add `#[tauri::command]` fn in `commands.rs`
2. Register in `lib.rs` `generate_handler![]` list
3. Add `invoke()` wrapper in `api.ts`
4. Call from component

### Adding a new setting
1. Add field to `AppSettings` struct in `models.rs` (with `#[serde(default)]`)
2. Add default in `Default` impl
3. Add to `get_all_settings()` and `save_all_settings()` in `storage.rs`
4. Expose via command in `commands.rs`
5. Add TS type in `types.ts`
6. Add fetch in `api.ts`
7. Add UI in `SettingsPanel.tsx`

### Debugging clipboard issues
- The clipboard monitor runs in a separate thread — use `eprintln!` or `dbg!` for debugging
- Check `clipboard.rs` → `run_monitor()` for the main loop
- DIB format: top-down DIBs have negative `biHeight`, row 0 = top
- CF_HDROP: `DROPFILES` struct is 20 bytes (pFiles, pt, fNC, fWide), followed by NUL-terminated wide-char paths, terminated by an extra NUL

### Database schema changes
- Add column with `ALTER TABLE` in `init_db()` migration section
- Use `.ok()` to ignore errors for idempotent migrations
- SQLite FTS5 triggers must be re-created if the content changes

## Git Commits

This project uses conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`.

Co-Authored-By: Claude Code <noreply@anthropic.com>
