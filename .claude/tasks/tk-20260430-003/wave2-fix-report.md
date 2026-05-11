# Wave 2 修复报告

**Date**: 2026-04-30
**Scope**: Round 3 评审发现的 Critical/High/Medium 问题修复

---

## 修复清单

### Critical 修复（3 项）

| # | 问题 | 修复内容 | 文件 |
|---|------|---------|------|
| 1 | action-governance ↔ skill-tool-mapping 双向依赖 | 移除 action-governance `required_contracts` 中的 skill-tool-mapping，registry `depends_on` 同步更新。实际关系是数据流（action-governance 输出 → skill-tool-mapping 输入），不是加载依赖 | `action-governance-contract.md:8`, `registry.yaml:59` |
| 2 | Agent 超时指标未定义 | 在 LEGO Agent 分配矩阵中新增 `timeout_minutes` 字段 + 各层级默认超时范围（L4=5min, L3=15min, L2=30min, L1=60min）+ 挂死检测阈值（2×） | `lego-assembly-workflow.md:150-180` |
| 3 | 4 个恢复路径缺失 | 新增：产出部分正确、多 Agent 输出冲突、Agent 崩溃、主线程上下文过期。补充重新派发上下文规则和修复归属规则 | `lego-assembly-workflow.md:197-230` |

### High 修复（4 项）

| # | 问题 | 修复内容 | 文件 |
|---|------|---------|------|
| 4 | CLAUDE.md "checker scripts execution" 不准确 | 修正为"检查器目录定义了 11 个检查器的概念形状，但当前为 0 可执行脚本" | `CLAUDE.md:159` |
| 5 | execution-orchestration 缺失 | 在 cluster-orchestration.md 新增 §6.3 build 外活动族编排规则（Stage 1-7 各阶段多 Agent 判定） | `cluster-orchestration.md:119-137` |
| 6 | memory-growth 分流规则缺失 | 在 memory-architecture.md 新增 §7 记忆分流规则（8 目的地）+ §7.1 Frozen Snapshot + §7.2 非记忆沉淀路径 | `memory-architecture.md:99-147` |
| 7 | review receipt 字段不足 | 在 review-gates-contract.md 新增 §13 Review Receipt 最小 Schema（11 字段） | `review-gates-contract.md:178-203` |

### High 修复（额外）

| # | 问题 | 修复内容 | 文件 |
|---|------|---------|------|
| 8 | L4 派发判定标准缺失 | 在 lego-assembly-workflow.md 新增 §4.6.5 L4 派发判定标准（<50 行或 ≤3 tool calls → 主线程） | `lego-assembly-workflow.md:232-248` |

### Medium 修复（1 项）

| # | 问题 | 修复内容 | 文件 |
|---|------|---------|------|
| 9 | 术语不一致（递归→顺序） | 将 §4.6.1 标题从"递归拼装模型"改为"顺序拼装模型" | `lego-assembly-workflow.md:124` |

### 其他修复

| # | 问题 | 修复内容 | 文件 |
|---|------|---------|------|
| 10 | registry DAG 循环依赖（Wave 1 遗留） | 移除 work-packet-governance → architecture-blueprint 依赖边 | `registry.yaml:100` |

---

## Registry 状态验证

修复后 DAG 无循环：

```
action-governance → [task-routing, task-tracking] ✓
skill-tool-mapping → [task-routing] ✓
work-packet-governance → [task-tracking] ✓
cluster-orchestration → [task-tracking, work-packet-governance] ✓
lego-assembly-workflow → [cluster-orchestration, work-packet-governance, task-tracking, skill-tool-mapping] ✓
architecture-blueprint → [task-tracking, lego-assembly-workflow] ✓
```

所有 `depends_on` 指向存在的契约 ID。无悬空引用。

---

## 剩余未修复问题

| 优先级 | 问题 | 原因 |
|--------|------|------|
| Medium | Standard-Light tier 未实现 | 需设计新复杂度等级，影响多个契约 |
| Medium | blocked policy 报告模板 | 非功能性，可延后 |
| Medium | profile → pack 映射表 | 非功能性，可延后 |
| Low | Lore Commit Protocol 适配 | 单模型环境下价值有限 |
| Low | 0/11 checkers 可执行 | 需要脚本开发，非规范修改可解决 |

---

*Wave 2 完成。9 项修复 + 1 项 Wave 1 遗留修复。建议重新评审以验证修复有效性。*
