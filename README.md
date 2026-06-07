# SuperClipboard

[中文文档](README_zh.md)

A fast, lightweight clipboard manager for Windows. Press **Alt+V** to summon a floating panel that shows your clipboard history — text, images, and files. Pin frequently used clips, star favorites, and export your history.

Built with **Tauri 2 + React + TypeScript + Tailwind CSS**.

## Features

### Clipboard History
- **Text, images, and files** — automatically captures copied text, screenshots, and file paths (Ctrl+C on files)
- **Deduplication** — copying the same content again just bumps the timestamp instead of creating a duplicate
- **Paste as files** — file entries paste as actual files (CF_HDROP), not JSON strings
- **Auto-paste** — optionally paste immediately after selecting a clip (configurable in settings)

### Search & Browse
- **Full-text search** — supports both English and Chinese/Japanese/Korean (CJK)
- **Filter by type** — text / image / file
- **Date filters** — today / 3 days / 7 days / custom range
- **Favorites tab** — quick access to starred items

### Organize
- **Notes** — add personal notes to any clip (✏️), inline editing, auto-save, truncated with hover tooltip
- **Pin** items to keep them at the top (📌↔📍)
- **Favorite** items for quick recall (☆↔⭐)
- **Delete** with a smooth fade-out animation
- **Settings** — configure history limit, image limit, language, auto-paste, and more

### Export & Backup
- **Export text** — merge all text clips into a `.txt` file with timestamps
- **Export images** — save all image clips as PNG/JPG files to a folder
- **Backup** — zip all data (including images) into a `.zip` file
- **Restore** — append from a previous backup with dedup & limits, truncated with warning when over capacity

### Preview & Expand
- **Image preview** — click `<预览>` to open images in a separate, resizable window
- **Text expand** — long text (>3 lines / 200 chars) shows `<展开>`; inline expand to full content
- **File expand** — when >3 files, click `<展开>` to show all paths
- **Floating collapse** — when an expanded card overflows the viewport, a fixed `收起 ▲` button appears at the bottom-right
- **Auto-collapse** — scrolling past an expanded card collapses it automatically

### Data & Portability
- **Portable by default** — all data (database, images, thumbnails) stored alongside the exe, not in `%APPDATA%`
- **Clean uninstall** — delete the app folder to remove everything
- **Easy migration** — copy the entire folder to another machine to move all data
- ⚠️ **Avoid `C:\Program Files\`** — the app needs write permission for its data directory; extracting to a protected system folder will cause startup errors. Use a user directory (e.g. `D:\Tools\SuperClipboard`) instead.

### UI / UX
- **Multi-language** — Chinese (中文) and English, switch in Settings, auto-detect on first launch
- **Floating panel** — press Alt+V to toggle, ESC to dismiss
- **System tray** — runs quietly in the notification area
- **Drag to move** — drag the title bar to reposition the window
- **Smart timestamps** — today (Today), yesterday (Yesterday), older (YYYY-MM-DD)
- **Tooltips** — hover on file paths to see the full path
- **Delete animation** — graceful fade-out when removing items
- **Dark theme** — easy on the eyes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | [Tauri 2](https://v2.tauri.app/) |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS 3 |
| i18n | react-i18next / i18next |
| Backend | Rust |
| Database | SQLite (via rusqlite, bundled) |
| Clipboard | Windows Clipboard API (Win32) |
| Image handling | `image` crate (PNG, DIB, etc.) |
| Export | `zip` crate (backup), plain text |

## Development

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** toolchain (install via [rustup.rs](https://rustup.rs/))
- **Windows** — this is a Windows-only app (uses Win32 clipboard API)

For the `x86_64-pc-windows-gnu` toolchain, you'll also need:
- **MSYS2** with MinGW-w64 (for `gcc`, `windres`, etc.)
- Make sure `D:\msys64\mingw64\bin` is in your PATH

Or use the `x86_64-pc-windows-msvc` toolchain with Visual Studio Build Tools.

### Quick Start

```bash
# Clone
git clone https://github.com/yourusername/superclipboard.git
cd superclipboard

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev
```

The first build compiles the Rust backend (takes a few minutes). Subsequent builds use incremental compilation.

### Project Structure

```
SuperClipboard/
├── public/                       # Static assets
│   └── preview.html               # Standalone image preview window
├── src/                          # React frontend
│   ├── App.tsx                   # Root component, dialogs, drag logic
│   ├── api.ts                    # Tauri invoke wrappers & event listeners
│   ├── types.ts                  # TypeScript type definitions
│   ├── App.css                   # Global styles & scrollbar themes
│   ├── locales/                   # i18n translation files
│   │   ├── zh-CN.json, en-US.json  # Chinese & English translations
│   │   └── index.ts               # i18next initialization
│   └── components/
│       ├── ClipboardPanel.tsx    # Main panel: search, tabs, card list
│       ├── ClipboardCard.tsx     # Card with expand, preview, floating collapse
│       ├── CardList.tsx          # Scrollable card list with animations
│       ├── SearchBar.tsx         # Search input & filters
│       ├── TabBar.tsx            # All / Favorites tabs
│       ├── SettingsPanel.tsx     # Settings form with validation
│       ├── ExportDialog.tsx      # Export text/images dialog
│       ├── BackupDialog.tsx      # Backup & restore dialog
│       └── cards/
│           ├── TextCard.tsx      # Text clip display
│           ├── ImageCard.tsx     # Image thumbnail display
│           └── FileCard.tsx      # File path display
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri 2 configuration
│   ├── build.rs                  # Cargo build script (icon embedding)
│   ├── icons/                    # App icons (all platforms)
│   └── src/
│       ├── main.rs               # Entry point
│       ├── lib.rs                # Plugin setup, app initialization
│       ├── clipboard.rs          # Windows clipboard monitor
│       ├── storage.rs            # SQLite database layer
│       ├── models.rs             # Data models & type definitions
│       ├── commands.rs           # Tauri command handlers
│       ├── export.rs             # Text/image/backup export logic
│       ├── hotkey.rs             # Global hotkey registration (Alt+V)
│       └── tray.rs               # System tray icon & menu
├── index.html                    # Vite entry HTML
├── package.json                  # npm scripts & dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite bundler config
├── tailwind.config.js            # Tailwind CSS config
└── postcss.config.js             # PostCSS config
```

### Rust Module Architecture

```
lib.rs  ── App startup, DB init, clipboard monitor spawn
  ├── clipboard.rs  ── Windows clipboard polling loop
  │                    (CF_UNICODETEXT / CF_DIB / CF_HDROP)
  ├── hotkey.rs     ── Global Alt+V hotkey registration
  ├── tray.rs       ── System tray icon and context menu
  ├── storage.rs    ── SQLite CRUD, FTS, dedup, settings
  ├── models.rs     ── ClipboardItem, ItemType, HistoryQuery
  ├── commands.rs   ── Tauri IPC command handlers
  └── export.rs     ── Text/image export, backup/restore
```

### Clipboard Pipeline

```
User copies → Windows clipboard
  → clipboard.rs polls GetClipboardSequenceNumber()
    → detects change → reads CF_* formats
      → computes FNV-1a content hash
        → upsert_item(): checks hash → new row or bump timestamp
          → emits 'clipboard-changed' event to frontend
            → React re-renders clip list
```

### Key Design Decisions

- **Deduplication** uses FNV-1a 64-bit hashing on raw content bytes — deterministic and fast
- **Image clipboard** uses top-down DIBs (negative biHeight) — converted to PNG for storage
- **File clipboard** uses CF_HDROP with the `DROPFILES` structure — pastes as real files, not paths
- **Window drag** uses direct `PostMessageW` instead of Tauri's `startDragging()` — avoids async IPC losing the mouse gesture
- **Image preview** opens independent Tauri windows per image — spawns an OS thread for `build()` to avoid tokio deadlock, uses `HashMap` keyed by window label for per-window state, polls for WebView2 IPC readiness
- **i18n** uses `react-i18next` with JSON locale files — auto-detects system language on first launch, persisted in SQLite settings, instant switching without reload
- **CJK search** uses SQL `LIKE` instead of FTS5 — FTS5's `unicode61` tokenizer can't handle CJK without word boundaries; `LIKE` is fast enough at clipboard scale (thousands of items)

### Building for Release

```bash
# Build the production binary
npm run tauri build

# The installer / executable will be in:
# src-tauri/target/release/
```

### Icon Generation

The app icon is generated programmatically (Rust code → 1024×1024 PNG → `npx tauri icon` → all platform formats). To regenerate:

```bash
# Write a gen_icon binary, run it, then clean up
# The icon source is at src-tauri/icons/icon.png
cd src-tauri
npx tauri icon icons/icon.png
```

If the exe icon in File Explorer doesn't update after a rebuild:
1. Clear Windows icon cache: `ie4uinit.exe -show`
2. Or rename the exe file — Windows caches icons aggressively

## License

MIT
