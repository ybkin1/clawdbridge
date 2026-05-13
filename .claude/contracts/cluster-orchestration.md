---
contract_id: "cluster-orchestration"
title: "多Agent集群编排契约"
owner: "claude-code"
scope: "多Agent并行时的可审计执行结构：Manifest冻结、Fan-Out派发、Fan-in综合、禁止子Agent自行重组"
trigger: "execution_orchestration_route=mandatory_multi_agent或recommended_multi_agent时"
required_inputs: ["task-tracking状态", "work-packet-governance拆包结果"]
required_contracts: ["task-tracking", "work-packet-governance"]
required_skills: []
verification_checks: ["manifest-before-invocation", "fan-in-report-exists", "orchestration-decision-correct", "single-thread-exception-reason-code", "fan-out-wait-fan-in-workflow", "anti-pattern-prevention"]
exceptions: ["strong-dependency-single-critical-path", "write-scope-conflict", "tool-policy-limits", "missing-shared-interface", "sensitive-destructive-single-owner"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 多Agent集群编排契约（Cluster Orchestration Contract）

## 1. 目的

定义 Claude Code 多 Agent 并行时的可审计执行结构，而不是"开多个 agent"的口号。

## 2. 核心原则

### 2.1 主线程始终是 orchestrator

主线程负责：归属判定、拆分、分发、回收、冲突裁决、fan-in、状态写回、最终验证。
子Agent 只执行被分配的 bounded work packet，不得自行递归编排。

### 2.2 Manifest 先于 invocation

多 Agent 执行前必须先冻结 work packet manifest。Manifest 描述计划；agent invocation 描述实际执行。

### 2.3 Fan-in 是正式证据

多 packet 任务必须有 fan-in report。最终回复不能替代 fan-in evidence。

## 3. 编排决策

| 决策 | 含义 |
|------|------|
| `multi_packet_parallel` | ≥2 个 packet，需要 fan-in |
| `single_packet_direct` | 只有 1 个 packet |
| `single_thread_exception` | 本可并行但有正式例外 |

### 3.1 single_thread_exception 允许的原因代码

- `strong_dependency_single_critical_path`
- `write_scope_conflict_prevents_safe_parallelism`
- `tool_policy_limits_parallel_delegation`
- `missing_shared_interface_freeze`
- `sensitive_destructive_action_requires_single_owner`

## 4. Work Packet Manifest 最小结构

```yaml
version: 1
manifest_id: <id>
task_id: <task-id>
scope: <范围描述>
orchestration_decision: multi_packet_parallel | single_packet_direct | single_thread_exception
packets:
  - packet_id: <id>
    packet_kind: <类型>
    objective: <目标>
    read_scope: <可读范围>
    write_scope: <可写范围>
    dependencies: [<依赖的packet_id>]
    acceptance: <怎么算完成>
    verification: <怎么验证>
    rollback: <如何回滚>
fan_in_plan:          # packets > 1 时必需
  - 合并顺序
  - 冲突裁决方式
  - 责任归属
```

## 5. Fan-in Report 最小结构

### 5.1 Implementation/Authoring 场景

```markdown
## Accepted Outputs
- <哪些子Agent产出被采纳>

## Discarded Outputs
- <哪些被废弃及原因>

## Conflict Resolution
- <冲突及裁决>

## Residual Risks
- <残余风险>

## Recovery
- 已完成 packet:
- 可重试 packet:
- 不可重试 packet:
- 需要人工裁决的冲突:
```

### 5.2 Review 场景

评审场景的 Fan-In 聚合的是多个 reviewer 的 verdict 和 findings，而非代码/文档产出：

```markdown
## Review Summary
- 评审对象: <artifact path>
- 评审维度: <各 reviewer lane>
- 评审模式: single | multi_agent

## Verdict Aggregation (见 review-gates §11.3)
- 各 reviewer verdict 汇总:
- 聚合后最终 verdict:
- one-vote veto 触发: 是/否

## Findings Consolidation
- Critical findings (去重合并):
- Major findings:
- Minor findings:
- 共识项 vs 分歧项:

## Gate Attempt Mapping
- gate type: value | professional | contract
- gate status after aggregation:
- same_class_streak:
```

## 6. 7 个 Activity Families

substantive execution 至少拆成以下活动族（来自 Codex execution-orchestration-contract.md）：

| # | Activity Family | 含义 | 典型操作 |
|---|----------------|------|---------|
| 1 | `search` | 事实抓取、truth source harvesting | repo-wide 检索、索引、外部搜索 |
| 2 | `analysis` | 对比、综合、归纳、风险判断 | 方案提炼、竞品分析、风险判断 |
| 3 | `authoring` | 正文输出、结构化产物生成 | 交付稿、汇总稿、规范文档 |
| 4 | `implementation` | 代码实现、重构、脚本编写 | build 阶段的具体编码 |
| 5 | `verification` | 测试、checker、回归、对齐校验 | 单元测试、集成测试、回归 |
| 6 | `review` | 独立评审、finding 闭环、复评 | 多 Agent 独立评审 |
| 7 | `recovery` | checkpoint、resume、dirty recovery、closeout | 断线恢复、脏数据清理、链路回收 |

**规则**：
- 同一任务若同时命中 ≥2 个 substantive activity families，默认应触发执行编排判定
- `implementation` 的细化拆包继续由 work-packet-governance 负责
- 本契约覆盖的是"build 外也要做的执行编排"

### 6.1 强制多 Agent 触发条件

满足以下任一条件时，`execution_orchestration_route` 必须判成 `mandatory_multi_agent`：

1. 同一任务当前阶段同时包含 ≥2 个 substantive activity families
2. 主线程预计需要同时完成搜索/检索、分析/综合、正文产出/汇总、验证/回归中的任意两类及以上
3. 命中 repo-wide 搜索、大日志分析、多文档综合、多产物输出、多 truth source 梳理
4. 当前任务需要"先搜再判再写再验"，而不是单一局部改动
5. 主线程预计上下文预算会因大批量文件读写、搜索结果、子结果回收或长文档综合而逼近 checkpoint 阈值
6. 用户明确要求"详细"/"完整"/"深入"/"系统性"/"可直接使用"，且当前任务不属于 trivially scoped
7. **`action_family=review` 且复杂度为 Standard/Complex**（详见 §6.3 review 行）

### 6.2 路由词汇

| 路由值 | 含义 |
|--------|------|
| `mandatory_multi_agent` | 必须拉起多个独立 Agent |
| `recommended_multi_agent` | 建议并行，但未达硬阈值 |
| `single_packet_direct` | 任务 trivially scoped，合法地不需要并行 |
| `single_thread_exception` | 理论应并行，但有正式例外（见 §3.1） |

### 6.3 build 外活动族编排规则

本契约不仅覆盖 build phase（implementation），还覆盖以下阶段的执行编排判定：

| 阶段 | 涉及活动族 | 多 Agent 判定 |
|------|-----------|-------------|
| Stage 1 深度学习 | `search` + `analysis` + `authoring` | 需要调研 ≥3 参考项目 + 产出分析报告 → `mandatory_multi_agent`（search lane + analysis lane 并行） |
| Stage 2 架构拆解 | `analysis` + `authoring` | 需要竞品架构拆解 + 技术选型对比 → `recommended_multi_agent` |
| Stage 3 PRD | `analysis` + `authoring` | 产品级设计稿需要多维度覆盖 → `recommended_multi_agent` |
| Stage 4 方案详设 | `analysis` + `authoring` | 需要模块级 + 组件级 + 单元级设计 → `recommended_multi_agent`（可按模块分 lane） |
| Stage 5 开发计划 | `analysis` + `authoring` | 需要排期 + Agent 矩阵 + 里程碑 → 通常 `single_packet_direct` |
| Stage 7 测试 | `implementation` + `verification` + `authoring` | 需要编写测试 + 执行测试 + 产出报告 → `mandatory_multi_agent`（写测试与执行测试并行） |
| Stage 评审 / review action_family | `review` | 独立评审需要多维度覆盖（架构/安全/正确性/价值）→ `mandatory_multi_agent`（按评审维度分 lane：Standard=2 lanes, Complex=3-4 lanes） |

**规则**：build 外的活动族编排不要求像 build 一样做 work packet 级拆包，但仍需遵守 delegation plan 最小结构（§7）和 Fan-Out/Fan-In 工作流（§8）。

## 7. Delegation Plan 最小结构

当任务命中 `mandatory_multi_agent` 或 `recommended_multi_agent` 时，必须先形成 delegation plan，至少回答：

1. 当前阶段目标是什么
2. 为什么命中多 Agent 触发条件
3. 计划拆成哪些 activity lanes
4. 每个子 Agent 的：`goal`、`scope`、`read/write boundary`、`expected output`
5. 主线程如何回收与聚合
6. 子线程何时停止，何时移交
7. 若未并行，正式例外理由是什么

### 7.1 Subagent Task Envelope

每个子 Agent 的 task payload 固定为：

- **TASK**：单一、明确、可判定完成的目标
- **CONTEXT**：当前项目/任务背景、相关文件、truth sources、已知状态
- **CONSTRAINTS**：禁止修改面、时间预算、completion criteria
- **DELIVERABLE**：结果应写到哪里、返回给主线程时采用什么结构

**硬规则**：若 task payload 缺失上述最小 envelope，视为 delegation plan 质量不足。

### 7.2 必备控制面字段

当任务命中 `mandatory_multi_agent`、`recommended_multi_agent` 或 `single_thread_exception` 时，`00-task-state.yaml` 必须包含：

```yaml
execution_orchestration_route: mandatory_multi_agent | recommended_multi_agent | single_packet_direct | single_thread_exception
delegation_plan_ref: "<delegation plan 路径>"
delegation_activity_families: ["search", "analysis", ...]
delegation_trigger_reasons: ["同时包含 search + authoring", ...]
parallelism_target: 2
parallelism_actual: 2
context_budget_policy_ref: "<checkpoint/compaction receipt 路径>"
aggregation_artifact_path: "<fan-in report 路径>"  # parallelism_actual >= 2 时必需
```

## 8. Fan-Out / Fan-In 工作流

正式多 Agent 执行默认遵守：

1. **Plan**：主线程分析任务、识别可独立 activity lanes
2. **Fan-Out**：一次性拉起独立子 Agent，避免边做边临时想起再补 spawn
3. **Wait**：等待子线程收敛；禁止用高频轮询代替正式等待/回收
4. **Fan-In**：主线程回收结果、检查冲突、补缺口
5. **Synthesize**：主线程形成统一结论、统一输出、统一状态写回

**规则**：
- 子线程结果不得绕过主线程直接充当最终正式结论
- `parallelism_actual >= 2` 时，必须存在聚合锚点
- 若需要二次协调，应由主线程先综合，再决定是否拉下一轮子 Agent

### 8.1 MCP `agent_orchestrator` 工具边界（短期方案）

当前 MCP Server 提供的 `agent_orchestrator` 工具**仅负责验证与计划生成**，不替代主线程执行完整的 Fan-Out / Fan-In 工作流：

| 步骤 | 责任方 | `agent_orchestrator` 是否覆盖 |
|------|--------|------------------------------|
| Plan（Manifest 验证 + 原子性检查） | MCP + 主线程 | **是** — 验证 manifest、分配 agent_ids、生成 `orchestrator-plan.yaml` |
| Fan-Out（实际 spawn 子 Agent） | **主线程** | **否** — 由 Claude Code Orchestrator-Prime 在同一消息中发出 Agent 调用 |
| Wait（等待子线程收敛） | **主线程** | **否** — 主线程统一等待，禁止高频轮询 |
| Fan-In（回收结果、冲突裁决） | **主线程** | **否** — 主线程读取子 Agent 产出，执行比较与裁决 |
| Synthesize（统一结论、状态写回） | **主线程** | **否** — 主线程形成最终输出并写回 task state |

**为什么这样设计**：
- MCP Server 运行在 Node 进程内，无法直接调用 Claude Code Agent SDK 的 `Agent` 工具
- Fan-Out/Fan-In 需要主线程的上下文理解（如冲突裁决、用户意图修正）
- 将"计划验证"与"执行编排"分离，使 MCP 成为配置化约束层，主线程保留编排灵活性

**未来长期方案**：
- 选项 A：新增 `fan_out_agents` 和 `fan_in_synthesize` MCP 工具，由 MCP Server 直接维护 Agent 生命周期（需 Agent SDK 集成）
- 选项 B：维持当前边界，将 Fan-Out/Fan-In 的模板/检查清单固化到契约中，由主线程机械化执行

## 9. 典型反模式

以下行为默认视为执行编排失败：

1. 为 <5 次工具调用即可完成的小任务拉子 Agent
2. 子 Agent task 描述模糊，缺少 TASK/CONTEXT/CONSTRAINTS/DELIVERABLE
3. Fan-Out 后持续 busy polling，而不是统一 wait/回收
4. 子 Agent 结果直接外露，主线程不做综合
5. 明明已命中多活动族，却仍由主线程自己搜索、分析、写稿、验证全包
6. 子 Agent 在未授权的情况下自行扩大 scope 或重编排

## 10. 禁止例外

- 多个 packet 伪装成 single_packet_direct
- 子 Agent 自行扩大写入范围
- 缺 fan-in report 仍把 gate 写成 passed
