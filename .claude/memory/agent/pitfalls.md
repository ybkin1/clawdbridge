# Agent 经验：踩坑记录

> 在此文件中记录反复踩过的坑和解决方案。

## 踩坑列表

### [PIT-001] dangling-reference-check 遍历 node_modules 导致大量误报
- **首次发现日期**: 2026-05-09
- **复现条件**: 在项目根目录运行 dangling-reference-check.sh，未排除第三方依赖目录
- **解决方案**: 修改 find 命令添加 `-not -path '*/node_modules/*'` 排除规则；同时排除 `.claude/tasks/*/reviews/*` 避免评审报告内部引用被误检
- **验证次数**: 1

### [PIT-002] 旧历史任务目录缺少标准子目录触发 dirty-hygiene 警告
- **首次发现日期**: 2026-05-09
- **复现条件**: 规范架构升级后，历史任务（tk-20260428 等）在规范建立前创建，缺少 artifacts/、review-bundles/、checkers/、exceptions/
- **解决方案**: 历史任务标记为 archived，不强制补齐目录；新任务严格执行 task-directory-tree-spec 初始化流程
- **验证次数**: 1

### [PIT-003] 外部 Skill 名称与 marketplace 实际条目不一致
- **首次发现日期**: 2026-05-09
- **复现条件**: skill-tool-mapping.md 中列出的 `anything-notebooklm` 在官方市场中搜索不到
- **解决方案**: 安装前先用 `claude plugin list` 确认可用性；不可用时记录 tooling_exception 并启用 fallback（主线程 Markdown 大纲）
- **验证次数**: 1
