# SuperClipboard

[English](README.md)

Windows 平台轻量级剪切板管理器。按 **Alt+V** 呼出悬浮面板，浏览剪切板历史记录——文字、图片、文件路径。支持置顶、收藏、导出等操作。

基于 **Tauri 2 + React + TypeScript + Tailwind CSS** 构建。

## 功能

### 剪切板历史
- **文字 / 图片 / 文件** — 自动捕获复制的文字、截图和文件路径（Ctrl+C）
- **去重** — 重复复制相同内容只更新时间戳，不产生新记录
- **粘贴真实文件** — 文件条目粘贴为真实文件（CF_HDROP），而非 JSON 字符串
- **自动粘贴** — 可选择记录后自动 Ctrl+V 粘贴（设置中开启）

### 搜索浏览
- **全文搜索** — 支持中文、英文、日文、韩文（CJK）混合搜索
- **类型筛选** — 文字 / 图片 / 文件
- **日期筛选** — 今天 / 3 天 / 7 天 / 自定义
- **分页浏览** — ← 上一页 | 1/20 | 下一页 →，每页数量可配置（10/20/30/40/50），支持海量记录
- **收藏标签页** — 一键查看星标条目

### 整理
- **备注** — 为任意记录添加备注（✏️），内联编辑自动保存，过长省略悬停显示
- **置顶** 条目保持在列表顶部（📌↔📍）
- **收藏** 条目快速找回（☆↔⭐）
- **删除** 附带淡出动效
- **设置** — 历史记录上限、图片保留上限、语言切换、主题、自动粘贴、窗口置顶、每页数量等

### 导出备份
- **导出文字** — 合并所有文字记录为 `.txt` 文件，带时间戳
- **导出图片** — 保存所有图片为 PNG/JPG 原文件
- **备份** — 所有数据（含图片）打包为 `.zip`
- **恢复** — 从备份追加导入，自动去重，超限时截断并提示

### 预览展开
- **图片预览** — 点击 `<预览>` 在独立可缩放窗口中查看图片
- **文字展开** — 超长内容（>3 行 / 200 字）显示 `<展开>`，内联展开全文
- **文件展开** — 超过 3 个文件时点击 `<展开>` 显示全部路径
- **悬浮收起** — 展开卡片超出窗口时，右下角固定显示 `收起 ▲` 悬浮按钮
- **自动收起** — 滚动越过展开卡片后自动折叠

### 数据与便携性
- **默认便携** — 所有数据（数据库、图片、缩略图）存储在 exe 所在目录，而非 `%APPDATA%`
- **干净卸载** — 删除应用文件夹即可完全移除
- **清除数据** — 在设置 → 存储中一键清除所有历史记录和图片文件
- **轻松迁移** — 复制整个文件夹到另一台机器即可迁移全部数据
- ⚠️ **避免放在 `C:\Program Files\`** — 应用需要对数据目录的写入权限；解压到受保护的系统目录会导致启动错误。请使用用户目录（如 `D:\Tools\SuperClipboard`）

### 交互体验
- **多语言** — 中文 / English，设置中随时切换，首次启动自动识别系统语言
- **悬浮面板** — Alt+V 切换显示，ESC 关闭
- **窗口置顶** — 设置中可配置；关闭后窗口显示在任务栏
- **系统托盘** — 常驻通知区域，左键切换面板
- **拖拽移动** — 拖拽标题栏任意位置移动窗口
- **关于页面** — ℹ️ 显示版本号、构建时间、意见反馈链接（可跳转浏览器）
- **智能时间** — 今天（Today）、昨天（Yesterday）、更早（YYYY-MM-DD）
- **自定义右键菜单** — 右键选中文字即可复制
- **悬停提示** — 鼠标悬停文件路径查看完整路径
- **按钮动效** — 点击图标有缩放反馈，删除有淡出动画
- **深色 / 浅色主题** — 支持深色、浅色、跟随系统三种模式，CSS 原生响应，即时切换

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | [Tauri 2](https://v2.tauri.app/) |
| 前端 | React 18 + TypeScript |
| 样式 | Tailwind CSS 3 |
| 国际化 | react-i18next / i18next |
| 后端 | Rust |
| 数据库 | SQLite（rusqlite，bundled 编译） |
| 剪切板 | Windows Clipboard API（Win32） |
| 图片处理 | `image` crate（PNG、DIB 等） |
| 导出 | `zip` crate（备份打包） |

## 开发

### 环境要求

- **Node.js** 18+ 和 npm
- **Rust** 工具链（通过 [rustup.rs](https://rustup.rs/) 安装）
- **Windows** — 仅支持 Windows（使用 Win32 剪切板 API）

如果使用 `x86_64-pc-windows-gnu` 工具链，还需安装：
- **MSYS2** 配合 MinGW-w64（提供 `gcc`、`windres` 等工具）
- 确保 `D:\msys64\mingw64\bin` 在 PATH 中

或者使用 `x86_64-pc-windows-msvc` 工具链配合 Visual Studio Build Tools。

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/yourusername/superclipboard.git
cd superclipboard

# 安装前端依赖
npm install

# 开发模式运行
npm run tauri dev
```

首次构建需编译 Rust 后端（几分钟）。后续构建使用增量编译，速度较快。

### 项目结构

```
SuperClipboard/
├── public/                       # 静态资源
│   └── preview.html               # 独立图片预览窗口
├── src/                          # React 前端
│   ├── App.tsx                   # 根组件，弹窗状态管理，拖拽逻辑
│   ├── api.ts                    # Tauri invoke 封装和事件监听
│   ├── types.ts                  # TypeScript 类型定义
│   ├── App.css                   # 全局样式、CSS 变量与主题支持
│   ├── theme.ts                   # 主题工具（深色/浅色/跟随系统）
│   ├── locales/                   # i18n 翻译文件
│   │   ├── zh-CN.json, en-US.json  # 中文/英文翻译
│   │   └── index.ts               # i18next 初始化
│   └── components/
│       ├── ClipboardPanel.tsx    # 主面板：搜索、标签页、卡片列表
│       ├── ClipboardCard.tsx     # 卡片：展开/收起、预览、悬浮收起按钮
│       ├── CardList.tsx          # 可滚动卡片列表，含动效和通知
│       ├── SearchBar.tsx         # 搜索框和筛选条件
│       ├── TabBar.tsx            # 全部 / 收藏标签页
│       ├── SettingsPanel.tsx     # 设置表单（校验、脏检测）
│       ├── ExportDialog.tsx      # 导出文字/图片弹窗
│       ├── BackupDialog.tsx      # 备份/恢复弹窗
│       └── cards/
│           ├── TextCard.tsx      # 文字内容展示
│           ├── ImageCard.tsx     # 图片缩略图展示
│           └── FileCard.tsx      # 文件路径展示（含悬停提示）
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml                # Rust 依赖
│   ├── tauri.conf.json           # Tauri 2 配置
│   ├── build.rs                  # Cargo 构建脚本（图标嵌入）
│   ├── icons/                    # 应用图标（全平台格式）
│   └── src/
│       ├── main.rs               # 程序入口
│       ├── lib.rs                # 插件注册，应用初始化
│       ├── clipboard.rs          # Windows 剪切板监听
│       ├── storage.rs            # SQLite 数据库操作
│       ├── models.rs             # 数据模型和类型定义
│       ├── commands.rs           # Tauri 命令处理（IPC）
│       ├── export.rs             # 文字/图片/备份导出逻辑
│       ├── hotkey.rs             # 全局热键注册（Alt+V）
│       └── tray.rs               # 系统托盘图标和菜单
├── index.html                    # Vite 入口 HTML
├── package.json                  # npm 脚本和依赖
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 打包配置
├── tailwind.config.js            # Tailwind CSS 配置
└── postcss.config.js             # PostCSS 配置
```

### Rust 模块架构

```
lib.rs  ── 应用启动，数据库初始化，剪切板监听线程
  ├── clipboard.rs  ── Windows 剪切板轮询循环
  │                    (CF_UNICODETEXT / CF_DIB / CF_HDROP)
  ├── hotkey.rs     ── 全局 Alt+V 热键注册
  ├── tray.rs       ── 系统托盘图标和右键菜单
  ├── storage.rs    ── SQLite CRUD，全文搜索，去重，设置
  ├── models.rs     ── ClipboardItem、ItemType、HistoryQuery
  ├── commands.rs   ── Tauri IPC 命令处理器
  └── export.rs     ── 文字/图片导出，备份/恢复
```

### 剪切板数据流

```
用户复制 → Windows 剪切板
  → clipboard.rs 轮询 GetClipboardSequenceNumber()
    → 检测到变化 → 读取 CF_* 格式
      → 计算 FNV-1a 内容哈希
        → upsert_item()：检查哈希 → 新记录或更新时间戳
          → 发送 'clipboard-changed' 事件到前端
            → React 刷新列表
```

### 关键设计决策

- **去重** 使用 FNV-1a 64 位哈希，对原始字节内容计算——确定性、速度快
- **图片处理** 使用 top-down DIB（负 biHeight）——直接转为 PNG 存储
- **文件粘贴** 使用 CF_HDROP 配合 `DROPFILES` 结构——粘贴为真实文件
- **窗口拖拽** 直接使用 `PostMessageW` 而非 Tauri 的 `startDragging()`——避免异步 IPC 丢失鼠标事件上下文
- **图片预览** 使用独立 Tauri 窗口——在线程中调用 `build()` 以避免 tokio 死锁；通过窗口标签隔离状态；轮询等待 WebView2 IPC 就绪
- **国际化** 基于 `react-i18next` + JSON 翻译文件——首次启动识别系统语言，设置持久化到 SQLite，切换即时生效无需重启
- **搜索** 统一使用 SQL `LIKE` 做子串匹配——FTS5 默认分词器无法处理 CJK；剪切板规模下（数千条）LIKE 足够快

### 发布构建

```bash
# 构建生产版本
npm run tauri build

# 打包为便携 zip（生成在项目根目录）
npm run package
```

exe 生成在 `src-tauri/target/release/SuperClipboard.exe`。zip 为自包含便携包——数据目录和数据库首次运行时自动在 exe 旁边创建。解压到除 `C:\Program Files\` 以外的任意位置（系统目录需要管理员写入权限）。

### 图标生成

应用图标通过 Rust 代码生成（代码绘制 → 1024×1024 PNG → `npx tauri icon` → 全平台格式）。要重新生成：

```bash
cd src-tauri
npx tauri icon icons/icon.png
```

如果重新构建后文件资源管理器中的 exe 图标没更新：
1. 清除 Windows 图标缓存：`ie4uinit.exe -show`
2. 或重命名 exe 文件——Windows 会缓存图标

## License

MIT
