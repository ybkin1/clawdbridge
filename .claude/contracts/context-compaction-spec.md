---
contract_id: "context-compaction"
title: "上下文压缩规范"
owner: "claude-code"
scope: "上下文预算逼近时如何压缩、保留策略、丢弃策略和可恢复的压缩记录"
trigger: "上下文预算达到55%/70%/85%阈值，或监控信号提示预算紧张时"
required_inputs: ["context-governance当前预算状态"]
required_contracts: ["context-governance"]
required_skills: []
verification_checks: ["3-level-trigger-gradient", "preserve-vs-compress-vs-discard", "compaction-receipt-written", "checkpoint-written", "subagent-isolation-at-70", "phase-independent-from-compaction", "budget-monitoring-heuristics"]
exceptions: []
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 上下文压缩规范（Context Compaction Specification）

## 1. 目的

定义 Claude Code 在上下文预算逼近时如何压缩、保留什么、丢弃什么、以及如何恢复。
确保压缩不是简单"删掉旧内容"，而是有结构化的保留策略和可恢复的压缩记录。

## 2. 三级触发梯度

| 阈值 | 状态 | 触发动作 | 是否可逆 |
|------|------|---------|---------|
| **55%** | `prepare_checkpoint` | 准备检查点，写入当前结论 | 完全可逆 |
| **70%** | `compaction_required` | 执行压缩，清理旧上下文 | 可逆（有 checkpoint） |
| **85%** | `emergency_compaction` | 紧急压缩，停止扩展上下文 | 部分可逆 |

## 3. 压缩决策模型

### 3.1 什么必须保留（不可压缩）

以下上下文在任何压缩级别都不得删除：
- 00-user-intent.md 的核心字段
- 00-task-state.yaml 的当前状态
- 已通过的 gate 结论
- 已批准的评审结论
- 当前 phase 的主产出 artifact 的关键部分

### 3.2 什么可以压缩

以下上下文在 70% 时应压缩：
- 旧搜索结果的详细输出 → 保留摘要 + 证据路径
- 过期的讨论和辩论 → 保留结论
- 被否决的方案 → 保留名称 + 否决原因
- 重复的引用 → 保留一次
- 工具调用的完整输出 → 保留关键部分

### 3.3 什么必须丢弃

以下上下文在 85% 时应丢弃：
- 工具调用的原始输出（非关键部分）
- 详细的文件读取内容（保留路径 + 摘要）
- Agent 的推理过程
- 聊天中的重复确认
- 已解决的 finding 的详细讨论

## 4. 压缩动作清单

### 4.1 55% — 准备检查点

```
动作:
1. 将当前结论写入 checkpoint.md
2. 记录当前 phase/subphase/gate 状态
3. 记录当前活跃的 work items
4. 记录未解决问题
5. 记录关键证据路径
```

不需要删除任何上下文，只是保存恢复锚点。

### 4.2 70% — 执行压缩

```
动作:
1. 清理所有旧搜索结果的详细输出
   → 保留: 搜索关键词 + 关键结论 + 证据路径
2. 清理过期的讨论
   → 保留: 最终结论
3. 清理被否决的方案
   → 保留: 方案名称 + 否决原因
4. 清理重复引用
   → 保留: 唯一引用
5. 清理工具调用的完整输出
   → 保留: 命令 + 关键结果
6. 写入 compaction-receipt.yaml
```

### 4.3 85% — 紧急压缩

```
动作:
1. 执行 70% 的全部压缩动作
2. 清理所有详细的文件读取内容
   → 保留: 文件路径 + 关键行摘要
3. 清理所有 Agent 推理过程
   → 保留: 结论
4. 停止继续扩展上下文
5. 如果还需要更多上下文:
   - 将后续操作拆分为子 Agent
   - 或者先提交当前产出再开启新会话
```

## 5. Compaction Receipt

每次压缩必须写入 `artifacts/compaction-receipt.yaml`：

```yaml
trigger_level: 70%
trigger_reason: "上下文预算达到70%阈值，当前为72%"
estimated_budget_before: 72%
estimated_budget_after: 35%
compaction_actions:
  - action: "清理搜索结果详细输出"
    items_removed: 12
    preserved_summary: "保留3个关键结论 + 6条证据路径"
  - action: "清理过期讨论"
    items_removed: 8
    preserved_summary: "保留最终结论"
  - action: "清理被否决方案"
    items_removed: 3
    preserved_summary: "保留方案名称 + 否决原因"
  - action: "清理工具调用输出"
    items_removed: 15
    preserved_summary: "保留命令 + 关键结果"
preserved_truth_refs:
  - ".claude/tasks/tk-xxx/00-user-intent.md"
  - ".claude/tasks/tk-xxx/00-task-state.yaml"
  - ".claude/tasks/tk-xxx/artifacts/checkpoint.md"
  - ".claude/tasks/tk-xxx/reviews/rb-build-001/synthesis-report.md"
resume_anchor: ".claude/tasks/tk-xxx/artifacts/checkpoint.md"
recorded_at: "2026-04-30T14:30:00Z"
```

## 6. Checkpoint 内容

每次压缩前（55%）的 checkpoint 必须包含：

```markdown
# Checkpoint — tk-YYYYMMDD-NNN

## Current Goal
<当前任务目标>

## Current State
- Phase: <phase>
- Subphase: <subphase>
- Phase Status: <phase_status>
- Primary Artifact: <path>

## Truth Sources
- 00-user-intent.md: <path>
- 00-task-state.yaml: <path>

## Approved Conclusions
<已批准的关键结论，每行一条>

## Active Threads
<当前活跃线程，每行一条>
- <线程名>: <执行者> → <目标>

## Unresolved Issues
<未解决问题，每行一条>

## Key Evidence Paths
<关键证据路径，每行一条>

## Next Steps
<下一步，按顺序列出>
```

## 7. 子Agent隔离策略

当上下文预算逼近 70% 时，以下操作必须转移到子Agent：

| 操作 | 原因 |
|------|------|
| 全仓库搜索 | 搜索结果会大量占用上下文 |
| 多文档对比分析 | 需要同时读取多个长文件 |
| 复杂代码分析 | 需要遍历大量代码 |
| 独立评审 | 需要隔离上下文，防止作者偏见 |

子Agent 完成后，主线程只接收摘要结论，不接收详细输出。

## 8. 压缩与 Phase 推进的关系

压缩不得替代 phase 推进：

- 压缩只是为了保留恢复能力，不代表当前 phase 已完成
- 压缩后的 `compaction-receipt.yaml` 是恢复锚点，不是 gate 证据
- phase 推进仍然需要完整的 gate 通过

## 9. 恢复时的上下文重建

从压缩状态恢复时：

1. 读取 checkpoint → 了解当前状态
2. 读取 compaction-receipt → 了解哪些内容被压缩
3. 根据 next steps 继续执行
4. 如果被压缩的内容后续需要，重新加载

## 10. 上下文预算监控

### 10.1 估算方法

Claude Code 未暴露直接的 `context_budget_percent` 指标。使用以下启发式估算：

| 信号 | 估算规则 |
|------|---------|
| 系统提示 "session approaching context limit" | ≥85% |
| 系统提示 "context compression may help" | ≥70% |
| 已读取 ≥15 个长文件（>100行）或 Agent 返回 ≥5 份长报告 | ≥55% |
| 消息数量 >20 条 | 警惕，接近 55% |
| Claude Code 开始截断输出或跳过历史内容 | ≥85% |

**规则**：宁可提前触发压缩，不可延迟。信号不确定时按上一档处理。

**保守策略说明**：本估算采用保守偏置（宁可提前压缩）。这可能导致部分可保留的上下文被提前压缩，但通过 checkpoint 和 compaction-receipt 可恢复。本阈值基于 200K token 上下文窗口估算，首次使用时应根据实际体验校准。

**监控时机优化**：Claude Code 不提供每次工具调用后的预算回调。改为事件驱动估算：
- (a) 连续读取 ≥5 个文件后
- (b) 写入长文档后
- (c) 子 Agent 返回后
- (d) 感知到响应质量下降（输出被截断、遗漏历史内容）时

### 10.2 监控时机

- 每次工具调用后估算当前预算
- 每次写入长文档后重新估算
- 每次读取长文件后重新估算

### 10.3 预防策略

- 优先使用 `Grep`/`Glob` 而非 `Read` 完整文件
- 优先读取关键部分而非全文
- 搜索时限制输出行数
- 使用子Agent处理高噪音操作
