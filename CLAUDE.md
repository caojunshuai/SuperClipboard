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

## Project Structure

```
public/preview.html           # Standalone image preview window (polls for IPC init)

src/                          # React frontend
  App.tsx                     # Root: dialog state, title bar, drag
  api.ts                      # Tauri invoke() wrappers + event listeners
  types.ts                    # TS types (ClipboardItem, etc.)
  components/
    ClipboardPanel.tsx        # Main panel: search + tabs + card list
    ClipboardCard.tsx         # Card: expand/collapse, preview, floating collapse button
    CardList.tsx              # Virtual scroll list, toast notifications
    SearchBar.tsx             # Search input, type/date filters
    TabBar.tsx                # All / Favorites tabs
    SettingsPanel.tsx         # Settings form with validation & dirty detection
    ExportDialog.tsx          # Export text or images
    BackupDialog.tsx          # Backup to zip / Restore from zip
    cards/
      TextCard.tsx            # Text content (expandable: line-clamp-3 → full)
      ImageCard.tsx           # Image thumbnail + preview button
      FileCard.tsx            # File paths (expandable: capped at 3 → show all)

src-tauri/src/                # Rust backend
  main.rs                     # Entry point
  lib.rs                      # Plugin setup, DB init, spawn clipboard monitor
  clipboard.rs                # Windows clipboard poll loop (CF_UNICODETEXT/DIB/HDROP)
  storage.rs                  # SQLite: upsert, query, FTS, settings CRUD
  models.rs                   # ClipboardItem, ItemType, HistoryQuery, AppSettings
  commands.rs                 # Tauri #[command] handlers (IPC from frontend)
  export.rs                   # Text export, image export, zip backup/restore
  hotkey.rs                   # Global hotkey Alt+V via tauri-plugin-global-shortcut
  tray.rs                     # System tray icon & context menu
```

## Architecture Notes

### Clipboard Monitor (clipboard.rs)
- Runs in `std::thread` (not tokio). Polls `GetClipboardSequenceNumber()` every 500ms
- Reads CF_UNICODETEXT / CF_DIB / CF_HDROP; converts DIB → PNG via `image` crate
- Deduplicates via FNV-1a 64-bit hash → `upsert_item()` bumps timestamp on duplicate

### Database (storage.rs)
- SQLite via `rusqlite` (bundled), WAL mode. Global `OnceCell<Mutex<Connection>>` singleton
- Search uses `LIKE '%keyword%'` for all queries — FTS5's `unicode61` tokenizer can't handle CJK, and `LIKE` is fast enough at clipboard scale

### IPC (commands.rs)
- All commands async via `#[tauri::command]`
- `copy_to_clipboard`: CF_UNICODETEXT / CF_DIB (top-down, negative biHeight) / CF_HDROP (DROPFILES struct)
- `auto_paste`: `keybd_event` Ctrl+V. `start_drag`: `PostMessageW(WM_NCLBUTTONDOWN, HTCAPTION)` — Tauri's `startDragging()` loses mouse gesture in async IPC

### Image Preview (commands.rs + preview.html)
- Opens independent Tauri window (`image-preview-{N}`) via `WebviewUrl::App("preview.html")`
- **Tokio deadlock fix:** `WebviewWindowBuilder::build()` blocks on main event loop → must call from `std::thread::spawn`, not tokio command thread pool
- **IPC init race:** `__TAURI_INTERNALS__.invoke` not attached synchronously by WebView2 → `preview.html` polls every 50ms for `typeof ipc.invoke === 'function'` (10s timeout)
- **Per-window state:** `HashMap<String, String>` keyed by window label in `LazyLock<Mutex<>>`. `open_image_preview` inserts path, `get_preview_image_path(window)` looks up by `window.label()` and removes entry. `PREVIEW_ID: AtomicU64` for unique labels
- Image data via `read_image_base64(path)` → `data:image/png;base64,...` (custom base64, no crate)

### Expand/Collapse & Floating Button (ClipboardCard.tsx)
- Text: exceeds 3 lines / 200 chars → `<展开>` link. `TextCard` accepts `expanded` prop (removes `line-clamp-3`)
- Files: >3 entries → `<展开>` link. `FileCard` shows capped vs all
- **Floating collapse:** fixed `收起 ▲` pill at viewport bottom-right when expanded card overflows container. Hidden when footer is in view (inline `收起` takes over)
- **Auto-collapse:** when card scrolls entirely above viewport → `setExpanded(false)`
- **scrollIntoView before collapse:** prevents viewport jumping to unrelated cards
- Detection: `requestAnimationFrame` + passive scroll listener on `.overflow-y-auto` ancestor

### Time Format
- Today → `今天 HH:MM:SS`, Yesterday → `昨天 HH:MM:SS`, Older → `YYYY-MM-DD HH:MM:SS`
- Bottom bar: time (left) · action link (right)

### CJK Search
- Detects CJK ranges (Unified, Hiragana, Katakana, Hangul) → `LIKE '%keyword%'` substring match

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
