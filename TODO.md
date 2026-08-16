# SuperClipboard TODO

> 只记录未完成事项。完成一项即删除。最后更新：2026-08-16

---

## 🟡 功能扩展

### 1. 排除应用列表
- [ ] 设置面板新增「排除应用」section
- [ ] 通过进程名/窗口标题添加排除规则（如 `1Password.exe`、`KeePass.exe`）
- [ ] 剪贴板 monitor 读取排除规则，命中则跳过不入库
- [ ] 无 UI 提示（静默忽略）

### 2. 批量操作
- [ ] 卡片左侧增加 checkbox（长按或勾选模式进入多选）
- [ ] 操作栏：批量删除 / 批量导出 / 合并复制
- [ ] 全选/反选
- [ ] 多选后的操作反馈（toast + 计数）

### 3. 连续粘贴模式
- [ ] 设置中增加「连续粘贴」开关
- [ ] 按住快捷键不放 → 弹出迷你选择器（带数字标签）
- [ ] ↑↓ 或数字键选择 → 松开 → 自动粘贴
- [ ] 松开快捷键时面板自动关闭

### 4. 内容类型标记
- [ ] 自动识别 URL → 🌐 图标
- [ ] 自动识别邮箱 → ✉️ 图标
- [ ] 自动识别 JSON/XML/HTML → 代码图标
- [ ] 自动识别纯数字 → 数字图标
- [ ] 卡片上显示类型标签

### 5. 云同步
- [ ] 支持 WebDAV / S3 远端同步
- [ ] 增量同步（仅变更部分）
- [ ] 冲突处理策略（时间戳优先/手动选择）
- [ ] 同步状态指示器

### 6. 剪贴板历史搜索增强
- [ ] 正则搜索
- [ ] 全文高亮搜索结果中的关键字
- [ ] 搜索建议/自动补全

---

## 🔧 代码重构（渐进式）

> 目标：模块化、可维护、可扩展。每项完成后构建验证（`npm run build` / `cargo check`）、提交并推送。

- [ ] **storage.rs 进一步拆分**
  - [ ] 提取 `settings.rs`：`get_setting` / `set_setting` / `get_all_settings` / `save_all_settings`
  - [ ] 提取 `templates.rs`：`get_all_templates` / `add_template` / `update_template` / `delete_template`
  - [ ] 提取 `db.rs`：DB 单例 + `init_db`（schema 迁移 + 预设模板），`get_conn` 改为 `db::get_conn`，storage.rs 与 stats.rs 共同依赖
- [ ] **storage.rs 提取 `clear.rs`**：`clear_all_data` / `clear_data_by_type` / `get_item_counts`（含图片文件清理逻辑）
- [ ] **CardList 提取 `usePagination`**：分页状态 + gen 计数器防竞态 + 删除后自动补页 + 页数收缩钳制
- [ ] **其他可选优化**
  - [ ] App.tsx 标题栏拆为组件（5 个图标按钮 + 拖拽区）
  - [ ] `get_item` 调用点是否都避免了冗余查询（copy_to_clipboard / auto_paste 链路）
  - [ ] 主包 628KB：recharts 等大依赖按需加载（StatisticsDialog 动态 import）
