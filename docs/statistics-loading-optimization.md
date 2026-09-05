# 统计页加载慢优化方案

## 问题

数据量大时,点击打开统计弹窗会先显示"加载中..."占位,等待明显的一段时间后整个页面才一次性撑开。

## 根因

`get_statistics`(src-tauri/src/stats.rs:7)在一次 IPC 调用里做 7 个 SQL 聚合,其中真正的瓶颈不是 SQL,而是"图片占用空间"这一项:每次调用都用 `read_dir` 遍历 `images/` 与 `thumbnails/` 两个目录,并逐文件 `metadata()` 累加字节数(stats.rs:138-153)。图片历史达到几万条时,这是几万次文件系统调用,Windows 上耗时数百毫秒。

DB 里现有的 `image_size` 字段**不能**用于此统计:它存的是分辨率字符串 `"宽x高"`(clipboard.rs:118),展示在图片卡片元信息上(ClipboardCard.tsx:103),与磁盘字节数无关;缩略图大小也完全没有记录。

## 方案总览

核心思路:**图片磁盘字节数落库,统计改 SUM 查询,消灭目录遍历**;前端配合 stale-while-revalidate 缓存,重开弹窗零等待。

| # | 改动 | 位置 | 批次 |
|---|------|------|------|
| 1 | 加列 `image_bytes INTEGER`(原图+缩略图磁盘字节数合计),`PRAGMA table_info` 守卫迁移 | storage.rs `init_db()` | 待定 |
| 2 | 存图时写入:`png_data.len()` + 缩略图字节数;`generate_thumbnail` 改为返回大小;`image_size`(分辨率)保留不动 | clipboard.rs `get_clipboard_image` | 待定 |
| 3 | 老数据一次性回填:遍历 `image_bytes IS NULL` 的行,按路径 stat 文件累加后 UPDATE,孤儿文件记 0;仅在刚加列时触发 | storage.rs | 待定 |
| 4 | 统计改 SUM:删除双目录 `read_dir` 遍历,换成 `SELECT COALESCE(SUM(image_bytes),0) WHERE type='image'`;DB 文件大小那条 `fs::metadata` 保留 | stats.rs:138-153 | 待定 |
| 5 | 备份恢复写入字节数:导入备份拷贝图片文件时,INSERT 行同步写 `image_bytes`,否则恢复出的库统计为 0 | export.rs | 待定 |
| 6 | 删除/清理路径无需改动:按行删数据(含 storage.rs:418 修剪)时行随之消失,SUM 自动一致 | — | 无需改动 |
| 7 | 前端 stale-while-revalidate + 骨架屏:模块级缓存上次 `Statistics`,重开弹窗立即用旧值渲染,后台重新拉取后原位更新(仿 useSettings 模式);首次打开渲染与真实布局同构的骨架屏,替代"加载中"文字 | StatisticsDialog.tsx | **批次 1,已实现** |

## 批次划分

- **批次 1(已实现)**:#7 前端缓存 + 骨架屏。重开弹窗数据秒显,后台静默刷新;首次打开显示骨架屏,布局不再跳变。首次打开的实际耗时仍受后端影响。
- **批次 2(待定)**:#1–#5 后端落库改造,治根因,首次打开也降到几十毫秒。

## 验证

- 改前后在 `get_statistics` 前后加 `eprintln!` 计时,`npm run tauri dev` 下用 `scripts/generate-test-data.mjs` 造大批量数据对比耗时;
- 核对存储条"图片"数值与改造前一致(验证回填与写入正确性);
- 备份 → 清空 → 恢复后,统计数字应保持不变。
