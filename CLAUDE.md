# CLAUDE.md

Codebase guidance for Claude Code when working with this repository.

## Project Overview

SuperClipboard is a Windows-only clipboard manager — **Tauri 2 + React 18 + TypeScript + Tailwind CSS 3** (frontend) and **Rust** (backend). Monitors Windows clipboard, maintains searchable history of text/images/files in SQLite, floating panel UI summoned by Alt+V.

## Build & Run

```bash
npm install          # first time only
npm run tauri dev    # development
npm run tauri build  # production
```

> Default toolchain: `stable-x86_64-pc-windows-gnu`. `windres.exe` must be in PATH (MSYS2/MinGW-w64) for the exe icon. Build succeeds without it but the .exe has no icon.

### Package for release

```bash
npm run tauri build    # build the binary
npm run package        # create portable zip in project root
```

The zip contains `SuperClipboard.exe` + `WebView2Loader.dll` + `liblzma-5.dll`. Data directories and DB are auto-created alongside the exe on first run.

## Project Structure

```
public/preview.html           # Standalone image preview window (polls for IPC init)

src/                          # React frontend
  App.tsx                     # Root: dialog state, title bar, drag, theme init, context menu
  api.ts                      # Tauri invoke() wrappers + event listeners
  types.ts                    # TS types (ClipboardItem, ExportResult, etc.)
  theme.ts                    # applyTheme(), Theme type (dark/light/system)
  components/
    ClipboardPanel.tsx        # Main panel: search + tabs + card list
    ClipboardCard.tsx         # Card: expand/collapse, preview, floating collapse button
    CardList.tsx              # Page-based list, toast notifications, gen counter for race safety
    SearchBar.tsx             # Search input, type/date filters
    DatePicker.tsx            # Custom calendar dropdown (replaces native date inputs)
    TabBar.tsx                # All / Favorites tabs
    SettingsPanel.tsx         # Settings form with validation, dirty detection, clear data
    ExportDialog.tsx          # Export text or images
    BackupDialog.tsx          # Backup to zip / Restore from zip with structured summary
    AboutDialog.tsx           # Version info + feedback link
    cards/
      TextCard.tsx            # Text content (expandable: line-clamp-3 → full)
      ImageCard.tsx           # Image thumbnail (object-contain) + preview button
      FileCard.tsx            # File paths (expandable: capped at 3 → show all)

src-tauri/src/                # Rust backend
  main.rs                     # Entry point
  lib.rs                      # Plugin setup, DB init, spawn clipboard monitor
  clipboard.rs                # Windows clipboard poll loop (CF_UNICODETEXT/DIB/HDROP)
  storage.rs                  # SQLite: upsert, query, FTS, settings CRUD, clear_all_data
  models.rs                   # ClipboardItem, ItemType, HistoryQuery, AppSettings, Result structs
  commands.rs                 # Tauri #[command] handlers (IPC from frontend)
  export.rs                   # Text export, image export, zip backup/restore
  hotkey.rs                   # Global hotkey Alt+V via tauri-plugin-global-shortcut
  tray.rs                     # System tray icon & context menu
```

## Architecture Notes

### Clipboard Monitor (clipboard.rs)
- Runs in `std::thread` (not tokio). Polls `GetClipboardSequenceNumber()` every 500ms
- Reads CF_UNICODETEXT / CF_DIB / CF_HDROP; converts DIB → PNG via `image` crate
- Thumbnails: Lanczos3 resampling at 360px max dimension, aspect-ratio-preserving
- Deduplicates via FNV-1a 64-bit hash → `upsert_item()` bumps timestamp on duplicate

### Portable Data Directory (lib.rs)
- **Data stored alongside exe** (`current_exe().parent()`), not in `%APPDATA%`
- Subdirectories: `images/`, `thumbnails/`, `exports/`, `backups/`, plus `superclipboard.db`
- Delete app folder → clean uninstall, no residual data
- Global `APP_DATA_DIR: OnceCell<PathBuf>` for use by `export.rs` restore
- ⚠️ Don't place exe in `C:\Program Files\` — write permission will fail

### Database (storage.rs)
- SQLite via `rusqlite` (bundled), WAL mode. Global `OnceCell<Mutex<Connection>>` singleton
- Search uses `LIKE '%keyword%'` for all queries — FTS5's `unicode61` tokenizer can't handle CJK, and `LIKE` is fast enough at clipboard scale
- **Restore** uses `try_restore_item()`: append mode with content_hash dedup, respects max_items/max_images limits, truncates with warning when over capacity
- **Missing image detection:** query checks file existence on disk, auto-deletes stale DB rows, excludes from results
- **Clear all data:** `clear_all_data()` collects image/thumbnail paths, DELETEs all rows, optimizes FTS5, removes files

### IPC (commands.rs)
- All commands async via `#[tauri::command]`
- `copy_to_clipboard`: CF_UNICODETEXT / CF_DIB (top-down, negative biHeight) / CF_HDROP (DROPFILES struct)
- `auto_paste`: hides window, sleeps 80ms, then `SendInput` Ctrl+V to previous window. `start_drag`: `PostMessageW(WM_NCLBUTTONDOWN, HTCAPTION)` — Tauri's `startDragging()` loses mouse gesture in async IPC
- **Structured results:** `ExportResult`, `BackupResult`, `RestoreResult` structs in models.rs. Restore computes expected/imported/duplicates/skipped_by_limit. Frontend displays color-coded summary rows (✓ green / — yellow / ! red)

### Image Preview (commands.rs + preview.html)
- Opens independent Tauri window (`image-preview-{N}`) via `WebviewUrl::App("preview.html")`
- **Tokio deadlock fix:** `WebviewWindowBuilder::build()` must call from `std::thread::spawn`, not tokio command thread pool
- **IPC init race:** `preview.html` polls every 50ms for `typeof ipc.invoke === 'function'` (10s timeout)
- **Per-window state:** `HashMap<String, String>` keyed by window label in `LazyLock<Mutex<>>`. `PREVIEW_ID: AtomicU64` for unique labels. Image data via `read_image_base64(path)` (custom base64, no crate)

### Expand/Collapse & Floating Button (ClipboardCard.tsx)
- Text: exceeds 3 lines / 200 chars → `<Expand>` link. Files: >3 entries → `<Expand>` link
- **Floating collapse:** fixed `Collapse ▲` pill at viewport bottom-right when expanded card overflows container. Hidden when footer is in view
- **Auto-collapse:** when card scrolls entirely above viewport → `setExpanded(false)`. `scrollIntoView` before collapse prevents viewport jumping
- Detection: `requestAnimationFrame` + passive scroll listener on `.overflow-y-auto` ancestor

### Note Feature (ClipboardCard.tsx)
- `clipboard_items.note TEXT` column. Click ✏️ → inline `<input>`, Enter/blur saves via `update_note`, Esc cancels
- Display: note truncated with `title` tooltip. `·` separator hidden when note is empty
- Type badge + metadata rendered in ClipboardCard top bar; child cards (TextCard/ImageCard/FileCard) are content-only

### Time Format
- Today → `今天 HH:MM:SS`, Yesterday → `昨天 HH:MM:SS`, Older → `YYYY-MM-DD HH:MM:SS`

### CJK Search
- Detects CJK ranges (Unified, Hiragana, Katakana, Hangul) → `LIKE '%keyword%'` substring match

### Pagination (CardList.tsx)
- `pageSizeRef` loaded from settings (default 20), user-configurable (10/20/30/40/50). `totalPages = ceil(total / pageSizeRef.current)`
- **Ref-based query:** `queryRef.current` always has latest filter values — no stale closures
- **Gen counter:** `fetchGenRef` increments on each request; responses with stale gen are discarded
- **Page refill after delete:** immediate `fetchPage(page)` after optimistic removal keeps page at max capacity
- **Delete recovery:** empty page after delete → auto-navigate to previous page; shrunk total → clamp to last valid page
- **Bottom bar:** total count (left) · ← Prev | N/M | Next → (right). Hidden when only one page

### Always-On-Top Setting (commands.rs + lib.rs + SettingsPanel.tsx)
- `AppSettings.always_on_top: bool`, default `true`. Applied at startup and on settings save
- Toggles `skip_taskbar`: on = floating panel (no taskbar), off = normal window (taskbar icon)

### Theme Switching (App.css + theme.ts + SettingsPanel.tsx)
- Values: `"dark"` / `"light"` / `"system"`, default `"dark"`
- **CSS-driven:** `:root` for dark defaults; `@media (prefers-color-scheme: light)` for system light; `html.light`/`html.dark` classes force specific themes. No JS listener needed for system mode
- `applyTheme()` removes both classes, then adds the forced class if not system. Called on startup and on settings change
- SettingsPanel discard reverts language via `i18n.changeLanguage()` and theme via `applyTheme()` to original values

### Date Filter (SearchBar.tsx + DatePicker.tsx)
- Dropdown: All / Today / 3 days / 7 days / Custom
- Custom mode shows two `DatePicker` components (from/to) with mutual constraints
- **DatePicker:** custom dropdown calendar widget, i18n-aware month/day labels, popup alignment, year 2000–2100 range
- `buildQuery()` (CardList.tsx) appends ` 23:59:59` to `date_to` for same-day capture

### Context Menu (App.tsx)
- Intercepts native `contextmenu` event, shows custom "Copy" button for selected text via `navigator.clipboard.writeText`
- Auto-positions with flip detection (avoids overflow on right/bottom edges). Dismisses on outside click

### Clear All Data (storage.rs + commands.rs + SettingsPanel.tsx)
- `clear_all_data()` in storage.rs: collects image/thumbnail paths, DELETEs all rows from clipboard_items (triggers FTS5 delete), optimizes FTS5, removes files
- Exposed via `clear_all_data` Tauri command, wrapped in `api.ts`
- UI in SettingsPanel → Storage section: red-border danger button → custom confirm dialog overlay

## Common Tasks

### Adding a Tauri command
1. `#[tauri::command]` fn in `commands.rs`
2. Register in `lib.rs` → `generate_handler![]`
3. `invoke()` wrapper in `api.ts`
4. Call from component

### Adding a setting
1. Field in `models.rs` `AppSettings` with `#[serde(default)]` + `Default` impl
2. CRUD in `storage.rs` (`get_all_settings` / `save_all_settings`)
3. Expose via `commands.rs`, wrap in `api.ts`, UI in `SettingsPanel.tsx`

### Debugging clipboard issues
- Clipboard monitor is a separate `std::thread` — use `eprintln!` / `dbg!` for logging
- DIB: top-down has negative `biHeight`, row 0 = top
- CF_HDROP: 20-byte `DROPFILES` header + wide-char NUL-terminated paths, double-NUL end

### Database schema changes
- `ALTER TABLE` in `init_db()` migration section, `.ok()` to ignore idempotency errors
- FTS5 triggers must be re-created if content schema changes

## Debugging Rules

**Same problem, two failed fixes → stop guessing, add logging.** On the third attempt, instrument both sides with diagnostic output:

- Rust: `eprintln!()` — visible in `npm run tauri dev` terminal
- Frontend: **visible on-screen text** (not `console.log` — browser devtools inaccessible in Tauri window)

Log inputs, intermediate state, and decisions. Pinpoint the divergence before proposing another fix.

## Git Commits

Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`.

Co-Authored-By: Claude Code <noreply@anthropic.com>
