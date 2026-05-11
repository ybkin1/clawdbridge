# Agent 经验：经验反思

> 在此文件中记录已验证的跨任务经验。

## 已验证反思

### [REF-001] Checker 自动化从概念到脚本化的最佳实践
- **首次发现日期**: 2026-05-09
- **已验证次数**: 1
- **反思内容**: verification-checker.md 中定义了 11 个 checker，但仅有 3 个有 bash 实现。将概念定义转化为可执行脚本时，应遵循原有 3 个脚本的结构（set -euo pipefail、TASK_ROOT 参数、ERRORS 数组、统一输出格式），并保持 gate_binding 和 failure_semantics 与契约定义一致。
- **验证方式**: 本次任务新编写了 7 个 checker 脚本，运行后均按预期输出 PASSED/FAILED。

### [REF-002] 任务状态文件（00-task-state.yaml）的必需字段必须实时维护
- **首次发现日期**: 2026-05-09
- **已验证次数**: 1
- **反思内容**: state-projection-alignment-check 会检查 task_id、action_family、phase、status 等字段。创建任务后若遗漏 action_family，checker 直接失败。应在任务初始化时就从模板填充所有字段。
- **验证方式**: 修复两个当前任务的 state 文件后，checker 通过。

### [REF-003] 插件安装后需立即验证可用性
- **首次发现日期**: 2026-05-09
- **已验证次数**: 1
- **反思内容**: `claude plugin install` 成功不等于 Skill 立即可用。需运行 `claude plugin list` 确认 Status=enabled。此外，外部 Skill 可能在不同 marketplace 中名称不同，安装前应搜索确认。
- **验证方式**: frontend-design 和 superpowers 安装后 list 显示 enabled；anything-notebooklm 安装失败并记录异常。
