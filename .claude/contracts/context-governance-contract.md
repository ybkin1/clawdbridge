---
contract_id: "context-governance"
title: "上下文治理契约"
owner: "claude-code"
scope: "任务上下文的加载顺序、裁剪压缩、契约切片加载和子Agent隔离"
trigger: "每次任务启动时按6层顺序加载上下文；上下文预算达55%/70%/85%时触发压缩"
required_inputs: ["action-governance产出的required_contracts清单"]
required_contracts: ["action-governance"]
required_skills: []
verification_checks: ["6-layer-load-order", "context-budget-threshold", "compaction-triggered", "subagent-context-isolation"]
exceptions: ["missing-repo-profile-with-manual-evidence"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 上下文治理契约（Context Governance Contract）

## 1. 目的

定义 Claude Code 在每次任务中如何加载、裁剪和压缩上下文，确保相关规范被加载、无关内容不被堆入上下文预算。

## 2. 6 层上下文输入顺序

每次任务启动时，上下文必须按以下固定顺序加载：

| 层级 | 内容 | 信任级别 |
|------|------|---------|
| T0 | 系统硬规则（CLAUDE.md Part A-E 的元规则） | 最高，不可覆盖 |
| T1 | 当前任务真相（00-user-intent.md + 00-task-state.yaml） | 当前事实，高于摘要 |
| T2 | 已签入的契约（.claude/contracts/ 中 active 的契约） | 稳定规则 |
| T3 | 派生摘要（checkpoint / README / board.yaml） | 人类友好，不可覆盖 T0-T1 |
| T4 | 原始材料（搜索结果、参考文档、历史对话） | 最低，需要验证 |

**规则**：
- 上层可触发下层刷新，下层不可反向覆盖上层
- 禁止把原始搜索结果直接当事实消费
- 禁止把摘要当主真相源

## 3. 上下文预算阈值

| 阈值 | 触发动作 |
|------|---------|
| 55% | `prepare_checkpoint`: 准备检查点，把当前结论写入 checkpoint |
| 70% | `compaction_required`: 必须压缩，清理旧上下文，保留真相源引用 |
| 85% | `emergency_compaction`: 紧急压缩，不得继续扩展上下文 |

### 3.1 压缩策略

达到压缩阈值时：
1. 保留：00-user-intent.md、00-task-state.yaml、最新已批准结论、关键证据路径
2. 清理：旧搜索结果、过期的讨论、被否决的方案、重复的引用
3. 写回压缩记录到 checkpoint

## 4. 契约切片加载

通过 `action-governance` 的 `required_contracts` 决定加载哪些契约：
- `clarify` 动作 → 加载 `intent-capture`
- `research` 动作 → 加载 `context-governance`、`engineering-standards`
- `authoring` 动作 → 加载 `task-tracking`、对应文档深度契约
- `implementation` 动作 → 加载 `task-tracking`、`work-packet-governance`、`architecture-blueprint`
- `verification` 动作 → 加载 `verification-checker`、`review-gates`
- `review` 动作 → 加载 `review-gates`、`review-consistency-checklist`
- `closeout` 动作 → 加载 `closeout`、`task-readme-lifecycle`

## 5. 子Agent上下文隔离

### 5.1 隔离判定标准

以下操作必须隔离到子Agent线程，避免污染主线程上下文：
- 全仓库搜索（grep/find/glob across entire repo）
- 高噪音分析（大量日志、多个文档对比）
- 多真相源综合（需要同时读取多个长文档）
- 独立评审（不得让作者和评审共享同一上下文窗口）

### 5.2 评审独立性检查

多 Agent 并行评审时，必须满足以下隔离条件：
- **不同 prompt 焦点**：不同 Agent 的 prompt 中必须指定不同的检查维度（如安全/性能/正确性），不得使用完全相同的 prompt
- **不同输入切片**：至少提供不同的代码段/文档段作为起始焦点，防止所有 Agent 从完全相同的入口开始
- **主线程验证**：主线程必须在 fan-in report 中记录每个 Agent 实际搜索/检查的路径，证明不是"只挂名并行"
- **检测标准**：如果 ≥2 个 Agent 的 report 中引用的文件路径和行号重合度 >80%，视为隔离不足，需在下一轮增加差异化 prompt
  - 重合度计算：两个 Agent 引用文件的 Jaccard 相似度 = 交集文件数 / 并集文件数（仅文件级，不要求行号精确匹配）
  - 若被审 artifact 本身文件数 ≤5，则 80% 阈值不适用，改为检查 prompt 焦点是否不同
  - 若检测到隔离不足，主线程应标记本轮评审结果为 low_confidence，并在交付物中说明。"不同输入切片"由主线程在构造子 Agent prompt 时保证，非平台自动执行

## 6. Bundle 类型

根据不同动作编译最小上下文包：

| Bundle 类型 | 包含内容 |
|-----------|---------|
| `clarify` | T0 + intent + relevant contracts |
| `research` | T0 + T1 + search results + engineering standards |
| `build` | T0 + T1 + T2(implementation-related) + architecture |
| `review` | T0 + T1(被审artifact) + review gates + consistency checklist |
| `resume` | T0 + T1 + latest checkpoint + board.yaml |
