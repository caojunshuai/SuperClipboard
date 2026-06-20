# 数据统计面板设计文档

> 日期：2026-06-20 | 状态：已确认

## 概述

在 SuperClipboard 中新增独立的「数据统计」对话框，展示剪贴板使用数据的可视化统计。所有数据仅从本地 SQLite + 文件系统计算，不上传。

## UI 结构

入口：标题栏新增 📊 图标按钮，点击打开独立对话框（与 Export / Backup / Settings 模式一致）。

对话框宽 680px，四个区块从上到下排列：

### 1. 概览卡片行

4 个横向排列的小方块卡片：

| 卡片 | 显示 | 说明 |
|------|------|------|
| 总条目 | `total_items` | 数据库中总条目数 |
| 今日 | `sum(today_hourly)` | 今日复制总数 |
| 本周 | `sum(week_daily)` | 本周复制总数 |
| 本月 | `sum(month_daily)` | 本月复制总数 |

### 2. 复制趋势

三个 Tab 按钮（今日 / 本周 / 本月），默认选中「本周」。点击切换粒度：

- **今日** — 横向柱状图，X 轴 0~23 小时
- **本周** — 横向柱状图，X 轴 周一~周日
- **本月** — 横向柱状图，X 轴 1 号~当天

使用 recharts `BarChart` 绘制，hover 显示具体数值。

### 3. 来源应用占比

recharts 水平条形图，按复制次数降序排列。显示：
- 应用名（左）
- 百分比 + 次数（右）

最多展示 Top 20，剩余归入「其他」。

### 4. 存储空间

CSS 手绘条形图（三个值，无需 recharts）：

| 行 | 计算方式 |
|----|----------|
| 文本 | `SUM(LENGTH(content))` WHERE type = 'text' |
| 图片 | 遍历 `images/` + `thumbnails/` 目录累计文件大小 |
| 数据库 | `fs::metadata("superclipboard.db").len()` |

自动选择单位（B / KB / MB / GB），数字保留 1 位小数。

## 数据结构

### Rust

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Statistics {
    pub total_items: i64,
    pub today_hourly: Vec<i64>,           // [0] = 0点, [23] = 23点
    pub week_daily: Vec<(String, i64)>,   // ("周一", 12), ...
    pub month_daily: Vec<(String, i64)>,  // ("06-01", 45), ...
    pub source_stats: Vec<SourceCount>,   // 按 count 降序
    pub storage_text_bytes: u64,
    pub storage_image_bytes: u64,
    pub storage_db_bytes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SourceCount {
    pub app: String,
    pub count: i64,
}
```

### TypeScript

对应前端类型，去除 `Vec` → `Array`、`u64` → `number`。

## SQL 查询

### 今日按小时
```sql
SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour,
       COUNT(*) AS cnt
FROM clipboard_items
WHERE date(created_at) = date('now', 'localtime')
GROUP BY hour
ORDER BY hour
```

### 本周按天
```sql
SELECT date(created_at) AS day, COUNT(*) AS cnt
FROM clipboard_items
WHERE created_at >= date('now', '-6 days', 'localtime')
GROUP BY day ORDER BY day
```

### 本月按天
```sql
SELECT date(created_at) AS day, COUNT(*) AS cnt
FROM clipboard_items
WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
GROUP BY day ORDER BY day
```

### 来源应用占比
```sql
SELECT source_app, COUNT(*) AS cnt
FROM clipboard_items
WHERE source_app IS NOT NULL AND source_app != ''
GROUP BY source_app
ORDER BY cnt DESC
```

### 存储
- 文本：`SELECT COALESCE(SUM(LENGTH(content)), 0) FROM clipboard_items WHERE type = 'text'`
- 图片/数据库：Rust `std::fs` 目录遍历 + 文件元数据

## 行为

- 打开对话框时实时查询，不缓存
- 数据全部为空时显示灰色占位提示
- ESC / 点击遮罩关闭对话框

## 涉及文件

| 文件 | 操作 |
|------|------|
| `src-tauri/src/models.rs` | 新增 Statistics, SourceCount |
| `src-tauri/src/storage.rs` | 新增 get_statistics() |
| `src-tauri/src/commands.rs` | 新增 get_statistics 命令 |
| `src-tauri/src/lib.rs` | 注册命令 |
| `src/types.ts` | 新增类型 |
| `src/api.ts` | 新增 getStatistics() |
| `src/components/StatisticsDialog.tsx` | **新建** |
| `src/App.tsx` | 新增 dialog type + 标题栏按钮 |
| `src/locales/zh-CN.json` | 新增 statistics namespace |
| `src/locales/en-US.json` | 新增 statistics namespace |
| `package.json` | 新增 recharts 依赖 |
