# AGENTS.md

Codebase guidance for AI coding assistants (Claude Code / Codex) when working with this repository. This is the single source of truth — `CLAUDE.md` imports it via `@AGENTS.md` and only adds Claude-specific conventions.

## Project Overview

SuperClipboard is a Windows-only clipboard manager — **Tauri 2 + React 18 + TypeScript + Tailwind CSS 3** (frontend) and **Rust** (backend). Monitors Windows clipboard, maintains searchable history of text/images/files in SQLite, floating panel UI summoned by Alt+V. Data stored alongside exe (portable), not in `%APPDATA%`.

## Build & Run

```bash
npm install          # first time only
npm run tauri dev    # development
npm run tauri build  # production
npm run package      # create portable zip
```

> CI: `.github/workflows/ci.yml` runs frontend build + `cargo fmt --check` + `cargo clippy -- -D warnings` + `cargo test --lib` on every push to master and PR — keep it green.
> Toolchain: `stable-x86_64-pc-windows-gnu` (needs `windres.exe` from MSYS2/MinGW-w64 in PATH for the exe icon) or `stable-x86_64-pc-windows-msvc` (needs VS Build Tools C++ workload). Switch via `rustup default <triple>`, then `cargo clean`. MSVC builds link liblzma statically — no `liblzma-5.dll` needed (package script handles both).
> Frontend build check: `npm run build` (tsc + vite). Rust check: `cd src-tauri && cargo check`.

## Project Structure

```
src/                          # React frontend
  App.tsx                     # Root: dialog state, title bar, drag, theme, context menu
  api.ts                      # Tauri invoke() wrappers + event listeners
  types.ts                    # TS types (ClipboardItem, HistoryQuery, AppSettings, Statistics, Template)
  theme.ts                    # applyTheme(): html.light/html.dark classes + system media query
  locales/                    # i18n (zh-CN / en-US), detectSystemLocale
  hooks/                      # Shared state machines (extract here when a component repeats logic)
    useModal.ts               # Modal: backdrop click close, ESC close, stopPropagation
    useContextMenu.ts         # Context menu: edge-flip positioning, outside-click dismiss
    useSettings.ts            # Settings singleton: module-level cache + listener broadcast
    useNoteEdit.ts            # Card note edit flow (draft, sync, save, revert-on-failure)
    useContentEdit.ts         # Card text edit flow (dedup-merge → onDelete, revert)
    useCardExpand.ts          # Card scroll-aware expand/collapse + floating collapse button
  utils/
    format.ts                 # toDateStr, formatTime, formatBytes, truncateText, parseFilePaths, getDateRange
  components/
    ClipboardPanel.tsx        # Main panel: search + tabs + card list / template list
    CardList.tsx              # Paged list, keyboard nav, gen counter, auto-refill after delete
    SettingsPanel.tsx         # Settings form (validation, dirty detection, clear data)
    StatisticsDialog.tsx      # Statistics panel (contribution heatmap, source apps, storage, top-copied)
    ClipboardCard.tsx         # Card shell: chrome + wiring only; state lives in hooks/
    cards/                    # TextCard / ImageCard / FileCard (per-type content rendering)
    TemplateList.tsx          # Template CRUD with placeholder substitution
    ExportDialog.tsx          # Export text/images
    BackupDialog.tsx          # Backup/restore with structured summary
    AboutDialog.tsx           # About dialog (version, build info)
    SearchBar.tsx / DatePicker.tsx / TabBar.tsx / HotkeyInput.tsx / SvgIcon.tsx / ScrollArea.tsx / CopyToast.tsx

src-tauri/src/                # Rust backend
  lib.rs                      # Plugin setup, DB init, single-instance, spawn clipboard monitor
  clipboard.rs                # Clipboard poll loop (CF_UNICODETEXT/DIB/HDROP)
  hash.rs                     # FNV-1a 64-bit hash (shared by clipboard.rs + storage.rs)
  storage.rs                  # SQLite: init_db, upsert/query, item ops, settings, templates, clear
  stats.rs                    # Aggregations: get_statistics (7 queries), get_daily_counts
  models.rs                   # ClipboardItem, HistoryQuery, AppSettings, Statistics, Template
  commands.rs                 # Tauri #[command] handlers (IPC from frontend)
  export.rs                   # Export, backup/restore
  hotkey.rs                   # Global hotkey via tauri-plugin-global-shortcut
  tray.rs                     # System tray icon & context menu
  window.rs                   # Shared toggle_main_window (hotkey + tray)

scripts/
  generate-test-data.mjs      # Test data generator with exponential time distribution
```

## Architecture Notes

### Clipboard Monitor (clipboard.rs)
- Runs in `std::thread`, polls `GetClipboardSequenceNumber()` every 300ms
- Deduplicates via FNV-1a 64-bit hash (`hash.rs`) → `upsert_item()` bumps timestamp + `copy_count` on duplicate
- Thumbnails: Lanczos3 at 360px max. DIB: top-down = negative biHeight. CF_HDROP: 20-byte header + wide-char paths

### Database (storage.rs)
- SQLite via `rusqlite` (bundled), WAL mode. `OnceCell<Mutex<Connection>>` singleton; `get_conn()` is `pub(crate)` — stats.rs shares it
- Search: `LIKE '%keyword%'` for all queries, with wildcards (`%` `_` backslash) escaped via `ESCAPE '\'` so user keywords match literally. FTS5 was removed: its tokenizer can't handle CJK and LIKE is fast enough at clipboard scale
- `init_db()`: CREATE TABLE IF NOT EXISTS + migrations. SQLite has no `ADD COLUMN IF NOT EXISTS` — check via `PRAGMA table_info` first, then ALTER; fresh installs skip
- `clipboard_items` columns: `id, type, content, image_path, thumbnail_path, file_paths, source_app, char_count, image_size, content_hash, is_pinned, is_favorite, metadata, note, copy_count, created_at, updated_at`
- `templates` table: separate from clipboard_items, seeded with 5 presets on first init
- `copy_count`: incremented on monitor dedup AND panel copy, used for top-copied ranking

### Settings (useSettings.ts + storage.rs)
- `useSettings()` is a module-level shared cache: one `get_settings` fetch serves all consumers; `save()` persists then broadcasts to every mounted listener (mirrors the Rust `DB` singleton)
- First-launch language detection (`detectSystemLocale`) runs in the hook at app start, not when the settings panel first opens
- SettingsPanel keeps its own form draft + `original` ref for dirty detection; theme/language are live-previewed in the panel and reverted on discard

### IPC (commands.rs)
- `copy_to_clipboard`: CF_UNICODETEXT / CF_DIB (top-down DIB) / CF_HDROP (DROPFILES) + increments copy_count
- `auto_paste`: hide window → sleep 80ms → `SendInput` Ctrl+V. `start_drag`: `PostMessageW(WM_NCLBUTTONDOWN, HTCAPTION)`
- Image preview: independent Tauri window, `build()` MUST call from `std::thread::spawn` (tokio deadlock), preview.html polls IPC readiness

### Single Instance (lib.rs)
- `tauri-plugin-single-instance = "2"` registered first. Second instance → show/focus existing window, auto-exit

### Statistics (stats.rs)
- `get_statistics` command: 7 SQL queries + fs size checks in one IPC call, returns `Statistics` struct
- `get_daily_counts(year, month)` powers the calendar indicator dots (DatePicker `activeDays`) AND the contribution graph month view (StatisticsDialog)
- Overview cards (total/today/week/month), contribution graph (monthly calendar heatmap, GitHub-style 4-level green scale, month navigation), source app bars (top 10 + others), top-copied list (ranked 1-10, CSS truncation), storage bars (auto unit B/KB/MB/GB)
- Contribution graph: Mon-first grid, `--contrib-0..4` CSS vars in App.css (light/dark), levels bucketed by month max (sparse months max<=4 scale linearly), hover info line + Less/More legend
- Responsive: `w-[calc(100%-2rem)] max-w-[680px]`, grid-cols-2 → grid-cols-4 at 480px

### Key Patterns
- **Time format:** Today → `今天 HH:MM:SS`, Yesterday → `昨天 HH:MM:SS`, Older → `YYYY-MM-DD HH:MM:SS`
- **Pagination:** `pageSizeRef` (10-50) from shared settings, gen counter discards stale responses. Auto-refill after delete, clamp on page shrink
- **Always-on-top / skip_taskbar:** toggled together; on = floating panel, off = normal window with taskbar
- **Theme:** CSS-driven (`html.light`/`html.dark` classes + `@media (prefers-color-scheme: light)` for system). Applied reactively from shared settings in App.tsx Panel colors are RGB triplets in App.css (`--panel-accent: 124 140 248`) consumed by Tailwind as `rgb(var(--panel-x) / <alpha-value>)` — so alpha modifiers (`bg-panel-accent/50`) work; direct `var(--panel-x)` usages in App.css must wrap in `rgb(...)`.
- **Context menus:** global (selected text → Copy), card-level (Edit/Copy/Delete), template-level — all via `useContextMenu` (edge flip + outside-click dismiss)
- **Text editor:** inline `<textarea>`, Ctrl+Enter save, Escape cancel. Cross-row dedup on save (merge → remove card)
- **Templates:** `{date}`, `{time}`, `{datetime}` placeholders replaced on copy
- **Source app:** captured via `GetForegroundWindow` → `QueryFullProcessImageNameW`, filters out self

## Common Tasks

### Adding a Tauri command
1. `#[tauri::command]` fn in `commands.rs` → 2. Register in `lib.rs` `generate_handler![]` → 3. `invoke()` wrapper in `api.ts` → 4. Call from component

### Adding a setting
1. Field in `models.rs` `AppSettings` with `#[serde(default)]` + `Default` impl → 2. CRUD in `storage.rs` → 3. Expose via `commands.rs` → 4. UI in `SettingsPanel.tsx`

### Adding a hook
When a component repeats a state machine (modal, context menu, edit flow, pagination), extract it into `src/hooks/useXxx.ts`. Hooks keep effects + state together and return plain values/handlers — JSX stays in the component.

### Database schema changes
- `ALTER TABLE` in `init_db()` migration section, guarded by `PRAGMA table_info` column check (no `ADD COLUMN IF NOT EXISTS` in SQLite)
- Row→struct mapping lives in one place (`row_to_item` + `ITEM_COLUMNS` in storage.rs); extend those two when adding a column
- Settings persist as a single `app_settings_json` row (atomic write; defaults live only in `AppSettings::default`); legacy per-key rows are read as fallback and migrated on next save

## Debugging Rules

**Same problem, two failed fixes → stop guessing, add logging.** On the third attempt, instrument both sides:
- Rust: `eprintln!()` — visible in `npm run tauri dev` terminal
- Frontend: **visible on-screen text** (not `console.log` — browser devtools inaccessible in Tauri window)

## Git Commits

Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`.
End commit messages with a `Co-Authored-By:` line crediting the assistant — Claude Code or Codex, whichever you are (see the tool-specific file for the exact address).
