# 数据统计面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 SuperClipboard 中新增独立的数据统计对话框，展示复制次数趋势、来源应用占比、存储空间占用。

**Architecture:** 后端新增 `get_statistics` 命令一次性返回所有统计数据（7 条 SQL + 文件系统计算），前端新增 `StatisticsDialog` 组件用 recharts 渲染图表，通过 App.tsx 标题栏新增按钮进入。

**Tech Stack:** Rust + rusqlite + Tauri 2, React 18 + TypeScript + Tailwind CSS 3 + recharts

## Global Constraints

- 数据仅存在本地，不上传
- 使用 `tauri-plugin-single-instance` 开发的单实例检测
- 遵循项目已有的 modal dialog 模式（fixed overlay + backdrop click dismiss + ESC close）
- 图表库：recharts（npm 安装）
- i18n：zh-CN / en-US 双语言

---

### Task 1: Install recharts dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts**

```bash
cd D:\Users\jscao\Documents\workspace\SuperClipboard && npm install recharts
```

- [ ] **Step 2: Verify install**

```bash
npm ls recharts
```
Expected: `recharts` version listed (e.g. `2.15.x`)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts dependency for statistics charts"
```

---

### Task 2: Add Rust data models

**Files:**
- Modify: `src-tauri/src/models.rs`

**Produces:** `Statistics` and `SourceCount` structs, available for Task 3.

- [ ] **Step 1: Add structs to models.rs**

Add after the `TemplateListResult` block (after line 145):

```rust
/// Statistics for the statistics panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Statistics {
    pub total_items: i64,
    /// Copy count per hour for today (index 0 = hour 0).
    pub today_hourly: Vec<i64>,
    /// (date_label, count) for this week.
    pub week_daily: Vec<(String, i64)>,
    /// (date_label, count) for this month.
    pub month_daily: Vec<(String, i64)>,
    /// Source app stats, ordered by count descending.
    pub source_stats: Vec<SourceCount>,
    /// Text content storage in bytes.
    pub storage_text_bytes: u64,
    /// Image + thumbnail file storage in bytes.
    pub storage_image_bytes: u64,
    /// Database file size in bytes.
    pub storage_db_bytes: u64,
}

/// Per-source-app count for statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceCount {
    pub app: String,
    pub count: i64,
}
```

- [ ] **Step 2: Build to verify compilation**

```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1
```
Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/models.rs
git commit -m "feat: add Statistics and SourceCount structs to models"
```

---

### Task 3: Add get_statistics() to storage layer

**Files:**
- Modify: `src-tauri/src/storage.rs`

**Consumes:** `Statistics`, `SourceCount` from `models.rs` (Task 2)

**Produces:** `storage::get_statistics(app_data_dir)` function, available for Task 4.

- [ ] **Step 1: Add helper to format byte size**

Add at the end of `storage.rs` (before the last closing brace is fine), or just before `get_statistics`:

```rust
/// Format byte count into a human-readable string.
fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    let mut unit_idx = 0;
    while size >= 1024.0 && unit_idx < UNITS.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }
    format!("{:.1} {}", size, UNITS[unit_idx])
}
```

Wait — this helper should actually be on the frontend. Skip Rust-side formatting and just return raw bytes. Scratch this step.

- [ ] **Step 1: Write get_statistics function**

Add to `storage.rs`, after the `get_source_apps` function (near line 562):

```rust
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
        stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect()
    };

    // Month daily
    let month_daily: Vec<(String, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT date(created_at) AS day, COUNT(*) AS cnt
             FROM clipboard_items
             WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
             GROUP BY day ORDER BY day"
        ).map_err(|e| e.to_string())?;
        stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect()
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
        stmt.query_map([], |row| {
            Ok(SourceCount {
                app: row.get::<_, String>(0)?,
                count: row.get::<_, i64>(1)?,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect()
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

    Ok(Statistics {
        total_items,
        today_hourly,
        week_daily,
        month_daily,
        source_stats,
        storage_text_bytes,
        storage_image_bytes,
        storage_db_bytes,
    })
}
```

- [ ] **Step 2: Build to verify compilation**

```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1
```
Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/storage.rs
git commit -m "feat: add get_statistics() with 7 SQL queries and filesystem stats"
```

---

### Task 4: Add Tauri command and register it

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Consumes:** `storage::get_statistics` (Task 3)

- [ ] **Step 1: Add get_statistics command to commands.rs**

Add after the `get_source_apps` command (find its location, likely around line 246):

```rust
#[tauri::command]
pub fn get_statistics() -> Result<Statistics, String> {
    let dir = crate::APP_DATA_DIR.get().ok_or("app data dir not initialized")?;
    storage::get_statistics(dir)
}
```

- [ ] **Step 2: Register command in lib.rs**

In `lib.rs`, add `commands::get_statistics,` to the `generate_handler![]` macro (keep alphabetical or append at end — follow existing pattern; append after `commands::get_source_apps,`):

```rust
commands::get_source_apps,
commands::get_statistics,
```

- [ ] **Step 3: Build to verify compilation**

```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1
```
Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add get_statistics Tauri command"
```

---

### Task 5: Add TypeScript types and API function

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api.ts`

**Consumes:** Rust `Statistics` and `SourceCount` shapes (Task 2)

**Produces:** `Statistics` type and `getStatistics()` API function, available for Task 7.

- [ ] **Step 1: Add types to types.ts**

Add at the end of `types.ts`:

```typescript
export interface SourceCount {
  app: string;
  count: number;
}

export interface Statistics {
  total_items: number;
  today_hourly: number[];         // length 24, index = hour
  week_daily: [string, number][];  // (date_label, count)
  month_daily: [string, number][];
  source_stats: SourceCount[];
  storage_text_bytes: number;
  storage_image_bytes: number;
  storage_db_bytes: number;
}
```

- [ ] **Step 2: Update import and add API function to api.ts**

Update the import line at the top of `api.ts`:

```typescript
import type { HistoryQuery, HistoryResult, ClipboardItem, AppSettings, BuildInfo, ExportResult, BackupResult, RestoreResult, Template, TemplateListResult, Statistics } from './types';
```

Add function after `getSourceApps`:

```typescript
export async function getStatistics(): Promise<Statistics> {
  return invoke('get_statistics');
}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit 2>&1
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/api.ts
git commit -m "feat: add Statistics types and getStatistics API function"
```

---

### Task 6: Add i18n keys

**Files:**
- Modify: `src/locales/zh-CN.json`
- Modify: `src/locales/en-US.json`

- [ ] **Step 1: Add statistics namespace to zh-CN.json**

Add after the `"about"` block:

```json
"statistics": {
  "title": "数据统计",
  "overviewTotal": "总条目",
  "overviewToday": "今日",
  "overviewWeek": "本周",
  "overviewMonth": "本月",
  "trendTitle": "复制趋势",
  "trendTabToday": "今日",
  "trendTabWeek": "本周",
  "trendTabMonth": "本月",
  "sourceTitle": "来源应用占比",
  "sourceOther": "其他",
  "storageTitle": "存储空间",
  "storageText": "文本",
  "storageImage": "图片",
  "storageDb": "数据库",
  "emptyData": "暂无统计数据",
  "loading": "加载中...",
  "close": "关闭"
}
```

- [ ] **Step 2: Add statistics namespace to en-US.json**

```json
"statistics": {
  "title": "Statistics",
  "overviewTotal": "Total Items",
  "overviewToday": "Today",
  "overviewWeek": "This Week",
  "overviewMonth": "This Month",
  "trendTitle": "Copy Trends",
  "trendTabToday": "Today",
  "trendTabWeek": "This Week",
  "trendTabMonth": "This Month",
  "sourceTitle": "Source Apps",
  "sourceOther": "Others",
  "storageTitle": "Storage",
  "storageText": "Text",
  "storageImage": "Images",
  "storageDb": "Database",
  "emptyData": "No statistics available",
  "loading": "Loading...",
  "close": "Close"
}
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/zh-CN.json src/locales/en-US.json
git commit -m "feat: add statistics i18n keys"
```

---

### Task 7: Create StatisticsDialog component

**Files:**
- Create: `src/components/StatisticsDialog.tsx`

**Consumes:** `Statistics` type, `getStatistics()` API, i18n `statistics` namespace (Tasks 5, 6)

**Produces:** `StatisticsDialog` component, available for Task 8.

- [ ] **Step 1: Write the component**

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getStatistics } from '../api';
import type { Statistics } from '../types';
import ScrollArea from './ScrollArea';

interface Props {
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIdx = 0;
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx++;
  }
  return `${size.toFixed(1)} ${units[unitIdx]}`;
}

const WEEK_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEK_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function StatisticsDialog({ onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendTab, setTrendTab] = useState<'today' | 'week' | 'month'>('week');

  useEffect(() => {
    getStatistics()
      .then(s => { setStats(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Trend chart data ──────────────────────────────────────
  const trendData = (() => {
    if (!stats) return [];
    const isZh = i18n.language.startsWith('zh');
    switch (trendTab) {
      case 'today':
        return stats.today_hourly.map((cnt, hour) => ({
          label: `${hour}`,
          count: cnt,
        }));
      case 'week': {
        const labels = isZh ? WEEK_LABELS_ZH : WEEK_LABELS_EN;
        const map = new Map(stats.week_daily);
        return labels.map((l, i) => {
          // match by position (Mon=0 ... Sun=6)
          const key = stats.week_daily[i]?.[0] ?? '';
          return { label: l, count: map.get(key) ?? 0 };
        });
      }
      case 'month':
        return stats.month_daily.map(([day, cnt]) => ({
          label: day.slice(5), // "06-15"
          count: cnt,
        }));
    }
  })();

  // ── Source app data (top 20 + "others") ───────────────────
  const sourceData = (() => {
    if (!stats) return [];
    const top20 = stats.source_stats.slice(0, 20);
    const othersCount = stats.source_stats.slice(20).reduce((s, x) => s + x.count, 0);
    const result = top20.map(s => ({ name: s.app, count: s.count }));
    if (othersCount > 0) {
      result.push({ name: t('statistics.sourceOther'), count: othersCount });
    }
    const max = Math.max(...result.map(r => r.count), 1);
    return result.map(r => ({ ...r, pct: ((r.count / max) * 100).toFixed(0) }));
  })();

  // ── Storage data ──────────────────────────────────────────
  const storageData = stats ? [
    { label: t('statistics.storageText'), bytes: stats.storage_text_bytes, color: '#3b82f6' },
    { label: t('statistics.storageImage'), bytes: stats.storage_image_bytes, color: '#8b5cf6' },
    { label: t('statistics.storageDb'), bytes: stats.storage_db_bytes, color: '#f59e0b' },
  ] : [];
  const storageMax = Math.max(...storageData.map(s => s.bytes), 1);

  const todayTotal = stats ? stats.today_hourly.reduce((a, b) => a + b, 0) : 0;
  const weekTotal = stats ? stats.week_daily.reduce((a, [, b]) => a + b, 0) : 0;
  const monthTotal = stats ? stats.month_daily.reduce((a, [, b]) => a + b, 0) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-panel-bg border border-panel-border rounded-xl p-6 w-[680px] max-h-[90vh] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <h2 className="text-lg font-semibold text-panel-text mb-4">{t('statistics.title')}</h2>

        <ScrollArea className="pr-1 space-y-5">
          {loading ? (
            <p className="text-sm text-panel-muted text-center py-8">{t('statistics.loading')}</p>
          ) : !stats ? (
            <p className="text-sm text-panel-muted text-center py-8">{t('statistics.emptyData')}</p>
          ) : (
            <>
              {/* ── Overview cards ─────────────────────────── */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: t('statistics.overviewTotal'), value: stats.total_items },
                  { label: t('statistics.overviewToday'), value: todayTotal },
                  { label: t('statistics.overviewWeek'), value: weekTotal },
                  { label: t('statistics.overviewMonth'), value: monthTotal },
                ].map(card => (
                  <div key={card.label} className="bg-panel-card rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-panel-text">{card.value.toLocaleString()}</div>
                    <div className="text-xs text-panel-muted mt-1">{card.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Trend chart ────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-panel-text">{t('statistics.trendTitle')}</h3>
                  <div className="flex gap-1 bg-panel-card rounded-lg p-0.5">
                    {(['today', 'week', 'month'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setTrendTab(tab)}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          trendTab === tab
                            ? 'bg-panel-hover text-panel-text font-medium'
                            : 'text-panel-muted hover:text-panel-text'
                        }`}
                      >
                        {t(`statistics.trendTab${tab.charAt(0).toUpperCase() + tab.slice(1)}` as any)}
                      </button>
                    ))}
                  </div>
                </div>
                {trendData.length > 0 && (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={trendData} margin={{ top: 4, right: 4, left: -16, bottom: -8 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ color: '#9ca3af' }}
                        formatter={(value: number) => [value, t('statistics.overviewToday')]}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── Source apps ────────────────────────────── */}
              <div>
                <h3 className="text-sm font-semibold text-panel-text mb-3">{t('statistics.sourceTitle')}</h3>
                {sourceData.length > 0 ? (
                  <div className="space-y-2">
                    {sourceData.map(s => (
                      <div key={s.name} className="flex items-center gap-3">
                        <span className="text-xs text-panel-text w-28 truncate text-right shrink-0" title={s.name}>{s.name}</span>
                        <div className="flex-1 bg-panel-card rounded-full h-5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500/60 transition-all"
                            style={{ width: `${s.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-panel-muted w-12 shrink-0">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-panel-muted">{t('statistics.emptyData')}</p>
                )}
              </div>

              {/* ── Storage ────────────────────────────────── */}
              <div className="pb-2">
                <h3 className="text-sm font-semibold text-panel-text mb-3">{t('statistics.storageTitle')}</h3>
                <div className="space-y-2">
                  {storageData.map(s => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="text-xs text-panel-text w-12 shrink-0">{s.label}</span>
                      <div className="flex-1 bg-panel-card rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(s.bytes / storageMax) * 100}%`, backgroundColor: s.color }}
                        />
                      </div>
                      <span className="text-xs text-panel-muted w-20 shrink-0 text-right">
                        {formatBytes(s.bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-end mt-4 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs text-panel-muted hover:text-panel-text bg-panel-card rounded-lg hover:bg-panel-hover transition-colors">
            {t('statistics.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit 2>&1
```
Expected: no errors. If recharts types cause issues, may need `@types/recharts` — but recharts v2 ships its own types.

- [ ] **Step 3: Commit**

```bash
git add src/components/StatisticsDialog.tsx
git commit -m "feat: add StatisticsDialog component with trend bar chart, source app bars, and storage display"
```

---

### Task 8: Integrate into App.tsx

**Files:**
- Modify: `src/App.tsx`
- Create: `src/assets/icons/chart.svg` (SVG icon for the statistics button)

**Consumes:** `StatisticsDialog` component (Task 7)

- [ ] **Step 1: Create chart SVG icon**

Create `src/assets/icons/chart.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 3v18h18"/>
  <path d="M7 16l4-8 4 4 4-6"/>
</svg>
```

- [ ] **Step 2: Modify App.tsx**

Add import for StatisticsDialog and the icon:

```typescript
import StatisticsDialog from './components/StatisticsDialog';

import chartSvg from './assets/icons/chart.svg?raw';
```

Update `DialogType`:

```typescript
type DialogType = 'none' | 'export' | 'backup' | 'settings' | 'about' | 'statistics';
```

Add button in title bar (before the close button):

```tsx
<button onClick={() => setDialog('statistics')} className="p-1 text-panel-muted hover:text-panel-text transition-colors"
        title={t('statistics.title')}><SvgIcon raw={chartSvg} className="w-4 h-4 block" /></button>
```

Add dialog render (after the about dialog):

```tsx
{dialog === 'statistics' && <StatisticsDialog onClose={() => setDialog('none')} />}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit 2>&1
```
Expected: no errors.

- [ ] **Step 4: Build and verify**

```bash
npm run tauri build 2>&1
```
Expected: builds successfully without errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/assets/icons/chart.svg
git commit -m "feat: integrate statistics dialog into App with title bar button"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run the app**

```bash
npm run tauri dev
```

- [ ] **Step 2: Manual test**
  1. Click the 📊 button in title bar → statistics dialog opens
  2. Verify overview cards show counts
  3. Switch trend tabs (Today / This Week / This Month) → chart updates
  4. Hover over bars → tooltip shows values
  5. Source apps section shows horizontal bars
  6. Storage section shows three bars with byte sizes
  7. ESC or click backdrop → dialog closes
  8. Switch language → all labels update correctly
  9. Empty DB → verify "no data" placeholder shows

- [ ] **Step 3: If all tests pass, done**
