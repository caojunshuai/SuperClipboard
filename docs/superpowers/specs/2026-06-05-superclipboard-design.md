# SuperClipboard 设计规格

## 概述

在 Windows 上开发一款剪切板增强工具，替代系统自带 Win+V 功能。采用 **Tauri + React + TypeScript + Tailwind CSS** 技术栈，轻量、现代化、便于 AI 辅助开发。

---

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 桌面框架 | Tauri 2.x | Rust 后端 + WebView 前端，包体小、内存低 |
| 前端 | React 18 + TypeScript | AI 训练数据最多，代码生成质量高 |
| 样式 | Tailwind CSS | 快速构建卡片式 UI |
| 存储 | SQLite (rusqlite) | 元数据及文本内容存储 |
| 文件管理 | Rust std::fs | 图片、缩略图、导出备份文件管理 |
| 全文搜索 | SQLite FTS5 | 中文分词搜索支持 |

---

## 功能清单

### 1. 剪切板监听

- 后台持续监听 Windows 剪切板变化
- 策略：定时轮询（300ms 间隔），后续可升级为实时监听
- 识别内容类型：文字、图片、文件
- 内容变化时自动存入历史记录

### 2. 呼出方式

- **系统托盘**：常驻托盘图标，左键点击弹出面板
- **全局快捷键**：默认 `Alt + V`，可在设置中自定义
- 面板屏幕居中弹出，重复按快捷键或点关闭按钮隐藏
- 窗口为无边框实色背景（非透明），标题栏支持拖动

### 3. 内容类型

| 类型 | 优先级 | 存储方式 | 卡片展示 |
|------|--------|---------|---------|
| 文字 | 首批 | SQLite 存文本内容 | 前 3 行文字预览 |
| 图片 | 首批 | 文件存 PNG，SQLite 存路径 | 缩略图 |
| 文件 | 首批 | SQLite 存文件路径 JSON | 文件路径 + 图标 |
| 富文本/HTML | 预留 | metadata JSON 扩展 | 架构预留，暂不实现 |

### 4. 卡片式面板 UI

- 弹出面板尺寸约 380x520px（可调整）
- 每条记录为卡片：缩略信息 + 操作按钮
- 支持键盘导航（上下箭头选择，回车确认）
- 虚拟滚动：3000 条记录流畅展示

### 5. 置顶功能

- 每条记录可切换置顶状态（📌 图标）
- 置顶卡片永远排列在列表最前面
- 置顶记录不受清理策略影响

### 6. 收藏功能

- 每条记录可切换收藏状态（⭐ 图标）
- 面板设有 "全部 / 收藏" 两个标签页
- 收藏列表中可以取消收藏
- 收藏记录不受清理策略影响

### 7. 搜索功能

- 顶部搜索框，实时关键词过滤
- 类型筛选：全部 / 文字 / 图片 / 文件
- 时间筛选：不限 / 今天 / 近3天 / 近7天 / 自定义范围
- 三个条件可任意组合
- 底层使用 SQLite FTS5 全文索引

### 8. 粘贴交互

- 点击卡片主体 → 内容写回剪切板 → 面板关闭
- 设置项 "选中后自动粘贴"：开启后自动向前台窗口发送 Ctrl+V
- 也可键盘操作：↑↓ 选择，Enter 确认

### 9. 导出功能

- **导出文字**：多选记录 → 合并导出为 `.txt` 文件，条间有时间戳分隔符
- **导出图片**：选中图片记录 → 导出为原始格式 PNG/JPG 文件
- 支持全选、多选操作

### 10. 备份与恢复

- **备份**：导出完整 `.zip` 包（含 SQLite 数据库 + 所有图片文件），文件名带时间戳
- **恢复**：选择 `.zip` 备份包 → 清空当前数据 → 加载备份数据
- 可在不同机器间迁移

### 11. 清理策略

- 普通记录上限：默认 **3000 条**（可在设置中调整 1000~10000）
- 图片记录额外上限：默认 **500 张**
- 超出上限后 FIFO 清除最旧记录
- 置顶/收藏记录不受清理影响，永久保留

### 12. 设置面板

- 快捷键自定义
- 历史记录数量上限
- 图片保留数量上限
- 选中后自动粘贴开关
- 开机自启开关

---

## 数据模型

### 主表 `clipboard_items`

```sql
CREATE TABLE clipboard_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    type            TEXT NOT NULL,          -- 'text' | 'image' | 'file'
    content         TEXT,                   -- 文本内容（text 类型）
    image_path      TEXT,                   -- 图片文件路径（image 类型）
    thumbnail_path  TEXT,                   -- 缩略图路径
    file_paths      TEXT,                   -- JSON 数组（file 类型）
    source_app      TEXT,                   -- 来源应用名称
    char_count      INTEGER,               -- 文本字数
    image_size      TEXT,                   -- 图片尺寸 "WxH"
    is_pinned       INTEGER DEFAULT 0,      -- 是否置顶
    is_favorite     INTEGER DEFAULT 0,      -- 是否收藏
    metadata        TEXT,                   -- JSON 扩展字段（预留富文本等）
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_type ON clipboard_items(type);
CREATE INDEX idx_created_at ON clipboard_items(created_at);
CREATE INDEX idx_pinned ON clipboard_items(is_pinned);
CREATE INDEX idx_favorite ON clipboard_items(is_favorite);

-- FTS5 全文搜索虚拟表
CREATE VIRTUAL TABLE clipboard_fts USING fts5(
    content,
    content=clipboard_items,
    content_rowid=id
);
```

### 文件系统结构

```
{app_data_dir}/
├── superclipboard.db
├── images/{id}_{timestamp}.png
├── thumbnails/{id}_{timestamp}_thumb.png
├── exports/
└── backups/backup_{timestamp}.zip
```

---

## 架构

```
┌──────────────────────────────────────────────────┐
│                  Tauri Shell                       │
│                                                    │
│  Rust Backend              React Frontend           │
│  ┌──────────────┐         ┌────────────────────┐   │
│  │ Clipboard    │──Event──►  SearchBar          │   │
│  │ Monitor      │         │  TabBar (全部/收藏) │   │
│  ├──────────────┤         │  CardList (虚拟滚动) │   │
│  │ Hotkey Mgr   │◄─Cmd────│  ClipboardCard[]    │   │
│  ├──────────────┤         │  ExportDialog       │   │
│  │ Tray Mgr     │         │  BackupDialog       │   │
│  ├──────────────┤         │  SettingsPanel      │   │
│  │ Storage      │         └────────────────────┘   │
│  │ (SQLite+FS)  │                                   │
│  ├──────────────┤                                   │
│  │ Export/Backup│                                   │
│  └──────────────┘                                   │
└──────────────────────────────────────────────────┘
```

### Tauri 命令接口

| 命令 | 方向 | 说明 |
|------|------|------|
| `get_clipboard_history(query)` | 前端→后端 | 查询历史列表（支持搜索、筛选、分页）|
| `copy_to_clipboard(id)` | 前端→后端 | 将指定记录写回剪切板 |
| `auto_paste()` | 前端→后端 | 向前台窗口发送 Ctrl+V |
| `toggle_pin(id)` | 前端→后端 | 切换置顶 |
| `toggle_favorite(id)` | 前端→后端 | 切换收藏 |
| `delete_item(id)` | 前端→后端 | 删除单条 |
| `delete_items(ids)` | 前端→后端 | 批量删除 |
| `export_text(ids, path)` | 前端→后端 | 导出文字为 txt |
| `export_images(ids, dir)` | 前端→后端 | 导出图片文件 |
| `backup(path)` | 前端→后端 | 创建备份 zip |
| `restore(path)` | 前端→后端 | 从备份恢复 |
| `get_settings()` | 前端→后端 | 获取设置 |
| `update_settings(settings)` | 前端→后端 | 更新设置 |
| `hide_window()` | 前端→后端 | 隐藏主窗口 |
| `clipboard_changed` (Event) | 后端→前端 | 剪切板新增内容通知 |
| `panel_shown` (Event) | 后端→前端 | 窗口显示通知，触发前端刷新 |

---

## 非功能需求

- **启动速度**：应用冷启动 < 1s，面板弹出 < 200ms
- **内存占用**：空闲 < 30MB，3000 条记录 < 80MB
- **面板关闭**：失焦自动关闭，不残留进程
- **数据安全**：应用崩溃不影响已持久化数据
- **扩展性**：新增内容类型只需添加 Rust 解析器 + React 卡片组件，不改动核心逻辑

---

## 不在本期范围

- 富文本/HTML 格式保留（架构预留，后续加）
- 云同步
- 多设备协同
- 剪贴板分组/分类管理
- OCR 图片文字识别
