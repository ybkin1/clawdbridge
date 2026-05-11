---
contract_id: "task-tracking"
title: "任务跟踪契约"
owner: "claude-code"
scope: "任务真相源、10阶段状态机、phase推进和恢复机制"
trigger: "每次任务启动/恢复/phase切换时，必须读取和更新task state"
required_inputs: ["intent-capture产出（00-user-intent.md）", "task-routing产出（route-projection.yaml）"]
required_contracts: ["intent-capture", "task-routing"]
required_skills: []
verification_checks: ["truth-hierarchy-enforced", "10-phase-state-machine", "derived-projection-not-override-truth", "dirty-chain-prevention"]
exceptions: ["trivial-task-simplified-structure"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 任务跟踪契约（Task Tracking Contract）

## 1. 目的

定义 Claude Code 任务的真相源、状态机、阶段推进和恢复机制。

## 2. 核心原则

### 2.1 任务真相必须结构化

任务状态不能只存在于聊天摘要或作者口头总结。必须存在机器可读的 task state。

### 2.2 真相层次

权威真相源（按优先级）：
1. 用户最新直接证据
2. 最新 00-user-intent.md
3. 最新 00-task-state.yaml
4. 最新评审报告（review provenance）
5. 最新验证/验收证据
6. 作者口头总结（永远不是主真相源）

### 2.3 派生投影不可覆盖主状态

board.yaml、checkpoint、README、implementation plan 等是派生投影，可加速恢复和协作，但不可覆盖 00-task-state.yaml 的 phase/gate 判断。

## 3. 10 阶段状态机

| Phase | 含义 |
|-------|------|
| `clarify` | 需求澄清 |
| `research` | 外部调研 |
| `architecture-decomposition` | 架构拆解 |
| `spec` | 规格说明 |
| `design` | 方案设计 |
| `plan` | 开发计划 |
| `build` | 编码实现 |
| `verify` | 验证测试 |
| `acceptance` | 用户验收 |
| `release-ready` | 交付就绪 |

### 3.1 Subphase

- `authoring` / `reviewing` / `revising` / `blocked` / `syncing`

### 3.2 Phase Status

- `not_started` / `in_progress` / `in_review` / `passed` / `failed` / `blocked` / `archived`

## 4. 00-task-state.yaml 最小结构

每个 Standard/Complex 任务必须在 `.claude/tasks/<task-id>/00-task-state.yaml` 中维护：

```yaml
task_id: tk-YYYYMMDD-NNN
title: <任务标题>
delivery_mode: full | quick | advisory
phase: <当前阶段>
subphase: <当前子阶段>
phase_status: <当前状态>
current_primary_artifact: <当前主产出文件路径>
current_gate_bundle: <当前 gate bundle ID>
gate_results:
  <bundle_id>:
    phase_anchor: <phase>
    required_gates: [professional, contract]
    active_gate: <current gate>
    status: passed | failed | blocked
closeout_allowed: true | false
last_review_report: <最新评审报告路径>
last_blocker_report: <最新阻塞报告路径>
updated_at: <ISO8601时间戳>
```

## 5. 脏数据/脏链路防止

**本节定义概念。执行面（状态机、检测触发、回收步骤、checker）详见 `dirty-hygiene-spec.md`。**

### 5.1 脏数据定义

- 与当前权威真相不一致的状态值
- 无法回链到 task/state/review/evidence 的孤儿数据
- 半写入、重复冲突、伪 ready/passed/active 的控制面数据

### 5.2 脏链路定义

- `state → review pack → report → receipt → provenance → handoff` 之间的悬空/断裂/错指
- phase/gate 已推进但对应 evidence/provenance/projection 未同步
- closeout 后仍留下未声明失效的临时链路

### 5.3 清理规则

- 检测到脏数据/脏链路时，必须立即进入回收动作（详见 `dirty-hygiene-spec.md` §5 状态机）
- 在回收完成并把证据回写前，不得把 phase/gate 写成 passed
- 任何写操作必须满足 Write-or-Fail-or-Explicit 三选一（详见 `dirty-hygiene-spec.md` §2）

## 6. 恢复顺序

会话中断后恢复读取顺序：
1. 00-task-state.yaml
2. 00-user-intent.md
3. 最新 README.md
4. board.yaml
5. 最新 checkpoint
6. 最新评审报告

## 7. 派生投影

| 投影 | 用途 | 是否参与主状态裁决 |
|------|------|-------------------|
| board.yaml | work items、并行度、workstream 状态 | 否 |
| checkpoint | 恢复所需摘要 | 否 |
| README.md | 人类友好入口 | 否 |
| implementation plan | 实现计划 | 否 |
| architecture blueprint | 架构蓝图 | 否 |
| delegation plan | 委派计划 | 否 |

## 8. 与 7 阶段模型的映射

| 7 阶段 | task-tracking phase |
|--------|-------------------|
| 1 深度学习 | research |
| 2 架构拆解 | architecture-decomposition |
| 3 PRD | spec |
| 4 方案详设 | design |
| 5 开发计划 | plan |
| 6 编码 | build |
| 7 测试 | verify |
