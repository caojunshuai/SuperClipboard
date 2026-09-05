# SuperClipboard 代码成熟度优化计划

> 2026-09 制定。来源:全库代码评审(后端 ~2500 行 Rust + 前端 ~3000 行 TS/TSX)。
> 每项完成后运行 `cargo check` / `cargo test` / `npm run build` 验证,并单独提交。
>
> **状态:P0–P3 全部完成**(暂缓项除外)。验证:cargo test --lib 8/8 通过,
> cargo clippy -- -D warnings 零警告,cargo fmt --check 干净,npm run build 通过。

## P0 — 数据正确性与安全(必须先做)

### P0-1 去重命中 hash 后校验实际内容
- **位置**:`storage.rs` 的 `upsert_item` / `update_content` / `try_restore_item`
- **问题**:去重只比较 FNV-1a 64 位哈希(`type + content_hash`)。非加密哈希存在碰撞可能,一旦碰撞,用户的新内容会被当作重复静默丢弃。
- **方案**:哈希命中后取出现有行的实际内容做二次比对:
  - text:比较 `content` 字段;
  - image:比较两个 PNG 文件字节(新文件此刻已在磁盘上);
  - file:比较 `file_paths` 字符串。
  不一致则视为新条目正常插入。

### P0-2 重 IO 命令移出主线程
- **位置**:`commands.rs`
- **问题**:Tauri 2 的同步 `#[tauri::command]` 在主线程执行。`backup`/`restore`(含图片读写)、`export_*`、`clear_data_by_type`(含 VACUUM)、`get_statistics`、`auto_paste`(sleep 80ms)都会卡住 UI 与事件循环。
- **方案**:改为 `async fn`,重活包进 `tauri::async_runtime::spawn_blocking(...).await`;`auto_paste` 只把 hide 之后的部分放入 spawn_blocking(保持 hide → sleep → SendInput 的顺序)。

### P0-3 IPC 路径校验(任意文件读取)
- **位置**:`commands.rs` 的 `read_image_base64`、`open_image_preview`
- **问题**:前端可传磁盘上任意绝对路径,后端照读返回 base64——webview 一旦加载不可信内容即成文件外泄通道。
- **方案**:新增 `ensure_inside_app_data(path)`:canonicalize 后校验位于 `APP_DATA_DIR` 之内,两个命令入口都调用。`open_image_preview` 保留 "Image file not found" 语义(前端依赖它清理失效卡片)。

### P0-4 LIKE 关键字转义
- **位置**:`storage.rs::query_history`
- **问题**:用户搜索词中的 `%` / `_` 被当作通配符,`100%` 会匹配全部内容。
- **方案**:`escape_like()` 转义 `\` `%` `_`,LIKE 子句追加 `ESCAPE '\'`。

### P0-5 复制操作的错误契约结构化
- **位置**:`commands.rs`(copy 路径)→ `CardList.tsx::handleCopy`
- **问题**:前端用正则 `^(\d+) files not found$` 与字符串全等解析 Rust 错误;错误文案中英混杂,改一个标点 i18n 即静默失效。
- **方案**:新增 `CopyError { code, count }`(Serialize),`set_clipboard_*` / `copy_to_clipboard` 返回 `Result<_, CopyError>`;错误码:`image_not_found` / `file_not_found` / `files_not_found` / `clipboard_error`。前端按 `code` 映射 i18n,保留字符串兜底。

## P1 — 结构与可维护性

### P1-6 消除行映射四处复制
- **位置**:`storage.rs`
- **问题**:`query_history` / `get_item` / `get_all_items_for_backup` 各有一份 17 列按位号的手工映射,加一列要改 5 处,漏一处即运行时错位。
- **方案**:抽出 `ITEM_COLUMNS` 常量 + `row_to_item(&Row)`,三处共用。

### P1-7 移除未使用的 FTS5
- **位置**:`storage.rs` init_db、`clear_*`
- **问题**:FTS5 表 + 3 个触发器建了但搜索全走 LIKE(注释已说明原因),只剩每次写操作的纯开销。
- **方案**:新库不再创建;旧库执行 `DROP TRIGGER ... / DROP TABLE clipboard_fts` 迁移;删除 clear 路径的 `'optimize'` 调用。

### P1-8 设置改为单行 JSON 存储
- **位置**:`storage.rs` `get_all_settings` / `save_all_settings`
- **问题**:默认值在 `models.rs::Default`、`get_all_settings` 的逐行 `unwrap_or`、前端三处漂移(page_size 默认值已不一致);10 条独立写语句无事务。
- **方案**:settings 表存一行 `app_settings_json`;读取时优先反序列化,不存在则回退旧的按 key 读取(升级兼容);默认值收敛到 `models.rs` 一处;写入天然原子。

### P1-9 新剪贴板条目增量插入,不再整页刷新
- **位置**:`App.tsx` / `CardList.tsx`
- **问题**:每次 `clipboard-changed` 都 bump refreshKey → 重置到第 1 页重新请求。用户翻到第 3 页时复制任何内容都会被拽回首页,而事件 payload 里明明带着完整的新条目。
- **方案**:`CardList` 自行监听 `clipboard-changed`,在无过滤条件且停在第 1 页时本地插入(按 `is_pinned DESC, created_at DESC` 定位、超出 pageSize 截尾、去重);有过滤条件或自定义日期范围不含当前日期时忽略(下次刷新自然出现)。`App.tsx` 仅保留 `panel-shown` 触发刷新。

### P1-10 CardList 合并重复 fetch
- **位置**:`CardList.tsx`
- **问题**:挂载时 settings effect、query effect、page effect 各触发一次 `fetchPage(1)`,gen counter 只是掩盖了重复。
- **方案**:引入 `resetToken`(查询条件/settings/refreshKey 变化时 `setPage(1)`+bump token),唯一的数据 effect 依赖 `[resetToken, page]`,每次状态变更至多一次请求。

## P2 — 工程化

### P2-11 Rust 单元测试(当前为 0)
- 纯函数:`hash.rs` FNV 已知向量、`clipboard.rs::dib_to_png`(BMP 编码往返)、`hotkey.rs` 快捷键解析。
- SQL 层(临时目录一次性 init_db,单测串行覆盖):upsert 去重/同 hash 不同内容、LIKE 转义行为、`update_content` 合并、`cleanup_old_items` 保护位、设置 JSON 往返 + 旧格式迁移、`clear_data_by_type`。

### P2-12 GitHub Actions CI
- `windows-latest` 单 job:`npm ci && npm run build`(tsc 严格检查)、`cargo fmt --check`(若存量代码不干净则先 fmt 一次)、`cargo clippy -- -D warnings`、`cargo test`。

### P2-13 热键注册失败反馈
- **位置**:`hotkey.rs::register` → `update_settings` → `SettingsPanel`
- **问题**:注册失败只有 `eprintln!`,用户换了被占用的热键得不到任何提示。
- **方案**:`register` 返回 `Result<(), String>`;`update_settings` 保存成功但注册失败时返回错误;SettingsPanel 保存失败时在界面上显示错误文案。

## P3 — 顺手小修

- **P3-1** `toggle_window` 在 `tray.rs` / `hotkey.rs` 重复 → 抽到公共模块。
- **P3-2** 手写 `base64_encode` → `base64` crate。
- **P3-3** `cleanup_old_items` / `clear_all_data` 在持有 DB 锁期间删文件 → 先收集路径,释放锁后删除。
- **P3-4** 文档漂移:AGENTS.md 轮询周期 500ms → 实际 300ms;同步 FTS 移除、设置 JSON、错误码等结构性变更。

## 暂缓(明确不做,留档)

- `file_paths` JSON 字符串 → 模型层 `string[]`:涉及 DB serde 边界与多个组件,收益/改动比不高,单独做。
- `ts-rs` 自动生成 TS 类型、前端 vitest:`types.ts` 目前稳定,待前后端类型漂移真实发生后再引入。
- `update_content` 返回空串表示"已合并"的隐式契约:与 P0-5 同类但改动面更大,单独做。

## 验证口径

```bash
cd src-tauri && cargo check && cargo test   # 后端
npm run build                               # 前端 tsc + vite
npm run tauri dev                           # 手工冒烟:复制文本/图片/文件、搜索、翻页、编辑、备份恢复
```
