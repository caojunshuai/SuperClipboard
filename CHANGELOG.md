## 🎉 v0.3.0 — Pagination, Date Filters & Settings

> Released 2026-06-12 · 6 commits since v0.2.0

### ✨ New Features

- **Page-based pagination** — Replace "Load More" with page navigation (← 上一页 | 1/20 | 下一页 →). Each page shows 50 items, memory stays fixed regardless of database size. Supports thousands of records. ([aba9bb8](https://github.com/caojunshuai/SuperClipboard/commit/aba9bb8))
- **Always-on-top setting** — Toggle whether the main window stays on top of other apps (Settings > 窗口置顶). When off, the window appears in the taskbar for easy access. ([4251867](https://github.com/caojunshuai/SuperClipboard/commit/4251867))
- **Custom date range filter** — Date filter now includes "自定义" option with from/to date pickers. Validated year range 2000–2100, auto-adjust from ≤ to. ([56198e2](https://github.com/caojunshuai/SuperClipboard/commit/56198e2))
- **Copy success toast** — Green "已复制" notification at the bottom of the window when a clip is copied. ([6aa1005](https://github.com/caojunshuai/SuperClipboard/commit/6aa1005))

### 🔧 Improvements

- **Auto-paste** now uses `SendInput` (reliable) instead of deprecated `keybd_event`. Window hides first so Ctrl+V targets the previous app. ([340ccbf](https://github.com/caojunshuai/SuperClipboard/commit/340ccbf))
- **UI text** changed from "文字" to "文本" across all Chinese labels. ([6aa1005](https://github.com/caojunshuai/SuperClipboard/commit/6aa1005))
- **White calendar icon** in date pickers via CSS `filter: invert(1)` — visible on dark theme. ([56198e2](https://github.com/caojunshuai/SuperClipboard/commit/56198e2))

### 🐛 Fixes

- **Filter freeze** — Fixed async race condition where stale responses overwrote newer filter results after loading many items. Replaced `useCallback`+`useEffect` pattern with ref-based generation counter immune to React StrictMode double-invocation. ([f79a283](https://github.com/caojunshuai/SuperClipboard/commit/f79a283))
- **Same-day date filter** — `date_to` now includes `23:59:59` so same-day selection captures all records from that day. ([56198e2](https://github.com/caojunshuai/SuperClipboard/commit/56198e2))
- **Date filter responsiveness** — Added `query.date_to` to effect dependency array so changing the "to" date triggers an immediate refresh. ([56198e2](https://github.com/caojunshuai/SuperClipboard/commit/56198e2))

### 🏗️ Build

- `liblzma-5.dll` bundled in portable zip — required on PCs without MSYS2/MinGW. ([b85478b](https://github.com/caojunshuai/SuperClipboard/commit/b85478b))

---

## 🎉 v0.2.0 — Portable, International, and Smarter

> Released 2026-06-07 · 34 commits since v0.1.0

### ✨ New Features

- **Multi-language (i18n)** — Chinese & English UI, switch in Settings, auto-detect on first launch ([95b63ab](https://github.com/caojunshuai/SuperClipboard/commit/95b63ab), [f2056e4](https://github.com/caojunshuai/SuperClipboard/commit/f2056e4))
- **Notes (备注)** — Add inline notes to any clip, edit with ✏️, auto-save, truncated with hover tooltip ([edcc89b](https://github.com/caojunshuai/SuperClipboard/commit/edcc89b))
- **About Dialog** — ℹ️ in title bar shows version, build time, and feedback link ([b207f0e](https://github.com/caojunshuai/SuperClipboard/commit/b207f0e))
- **Portable Data Directory** — All data (DB, images, thumbnails) stored alongside exe instead of `%APPDATA%`. Delete the folder = clean uninstall ([f3eadb8](https://github.com/caojunshuai/SuperClipboard/commit/f3eadb8))
- **Image Preview** — Click `<预览>` to open images in a separate resizable window ([e3d55fa](https://github.com/caojunshuai/SuperClipboard/commit/e3d55fa))
- **Text/File Expand** — Long text (>3 lines) and file lists (>3 files) show `<展开>`, inline expand to full content ([e3d55fa](https://github.com/caojunshuai/SuperClipboard/commit/e3d55fa))
- **Floating Collapse Button** — Fixed `收起 ▲` pill at bottom-right when expanded card overflows viewport; auto-collapse on scroll past ([16101d3](https://github.com/caojunshuai/SuperClipboard/commit/16101d3))
- **Append Restore** — Backup restore now appends instead of replacing; deduplicates by content hash; respects max_items/max_images limits with truncation warning ([ea4baff](https://github.com/caojunshuai/SuperClipboard/commit/ea4baff))
- **Thumbnail Regeneration** — Restored images automatically regenerate thumbnails ([1908fa2](https://github.com/caojunshuai/SuperClipboard/commit/1908fa2))
- **Social Preview Image** — GitHub repo now has a proper social card ([6cbd898](https://github.com/caojunshuai/SuperClipboard/commit/6cbd898))

### 🔧 Improvements

- **Smart timestamps** — Today (今天 HH:MM:SS) · Yesterday (昨天 HH:MM:SS) · older (YYYY-MM-DD HH:MM:SS) ([e3d55fa](https://github.com/caojunshuai/SuperClipboard/commit/e3d55fa))
- **Card layout** — Time on left, action link on right with dot separator ([510b081](https://github.com/caojunshuai/SuperClipboard/commit/510b081))
- **Unified top bar** — Type badge, metadata, note, and action icons (✏️📌⭐🗑) in a single row ([07d61ba](https://github.com/caojunshuai/SuperClipboard/commit/07d61ba))
- **Backup uses save dialog** — Fixed "file not available" when creating backup ([81d753b](https://github.com/caojunshuai/SuperClipboard/commit/81d753b))
- **Settings scroll support** — Settings panel now scrollable when content overflows ([87b2568](https://github.com/caojunshuai/SuperClipboard/commit/87b2568))

### 🐛 Fixes

- Note separator dot hidden when note is empty ([e926345](https://github.com/caojunshuai/SuperClipboard/commit/e926345))
- Note edit icon right-aligned with other action icons ([07d61ba](https://github.com/caojunshuai/SuperClipboard/commit/07d61ba))
- Missing `note` field in clipboard monitor struct initializers ([25ec335](https://github.com/caojunshuai/SuperClipboard/commit/25ec335))
- Missing `note` column in backup restore INSERT ([81d753b](https://github.com/caojunshuai/SuperClipboard/commit/81d753b))
- About dialog ESC key now closes it ([f7079ce](https://github.com/caojunshuai/SuperClipboard/commit/f7079ce))
- Language dropdown now syncs correctly on first launch ([f7079ce](https://github.com/caojunshuai/SuperClipboard/commit/f7079ce))
- Feedback link opens in system browser instead of being blocked ([035bab3](https://github.com/caojunshuai/SuperClipboard/commit/035bab3))

### 🏗️ Build

- Replaced NSIS installer with portable zip packaging ([9553036](https://github.com/caojunshuai/SuperClipboard/commit/9553036))

---

**⚠️ Important:** This release changes the data directory from `%APPDATA%` to the exe's folder. Data from v0.1.0 will not auto-migrate. To keep your old data, use the Backup feature in v0.1.0 before upgrading, then Restore in v0.2.0. Do NOT extract the portable zip into `C:\Program Files\` — write permission will fail.
