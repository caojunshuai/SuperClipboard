# CLAUDE.md

本仓库的 AI 协作指导在 `AGENTS.md`（与 Codex 共用的单一事实源），此处通过 `@` 导入引用，仅补充 Claude Code 特有约定。

@AGENTS.md

## Claude Code 特有约定

- Git 提交署名行：`Co-Authored-By: Claude Code <noreply@anthropic.com>`
- 重构节奏：小步提交——每完成一个自包含的改动（hooks 提取、模块拆分）即构建验证、提交并推送
