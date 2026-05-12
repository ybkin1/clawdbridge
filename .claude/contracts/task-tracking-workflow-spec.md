---
contract_id: "task-tracking-workflow"
title: "任务跟踪流程规范"
owner: "claude-code"
scope: "任务从创建到收口的完整生命周期流程，包括phase推进规则、评审循环、写入权限、并行协作和断线恢复"
trigger: "每次任务初始化时、phase推进时、评审循环中、断线恢复时"
required_inputs: ["task-tracking状态机", "task-routing路由决策"]
required_contracts: ["task-tracking", "task-routing"]
required_skills: []
verification_checks: ["task-init-steps-complete", "phase-transition-rules", "phase-gate-mapping", "review-loop-execution", "write-permission-enforcement", "parallel-collaboration-protocol", "closeout-preconditions", "disconnection-recovery"]
exceptions: []
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 任务跟踪流程规范（Task Tracking Workflow Specification）

## 1. 目的

定义任务从创建到收口的完整生命周期流程，包括 phase 推进规则、评审循环、写入权限、并行协作和断线恢复。

这是整个规范架构中最核心的执行面规范。

## 2. 任务生命周期总览

```
[Task Init] → [Route] → [Phase Loop] → [Review Loop] → [Closeout]
                │            │               │              │
                v            v               v              v
          7步路由决策   phase状态机     3层门控评审     4类收口
```

## 3. 任务初始化流程

### 3.1 触发条件

用户输入非 Trivial 需求时触发：

```
用户输入 → 复杂度判定(Trivial/Standard/Complex) → Rule 3 意图确认 → Rule 1 前置学习 → 正式创建任务
```

### 3.2 任务创建步骤（必须按顺序执行）

```
Step 1: 生成 task_id (tk-YYYYMMDD-NNN)
Step 2: 创建任务目录 .claude/tasks/<task-id>/
Step 3: 从模板复制 00-task-state.yaml 并填充初始值
Step 4: 创建 00-user-intent.md（9字段）
Step 5: 创建 board.yaml（初始 work items）
Step 6: 创建 README.md（开发态最小结构）
Step 7: 执行 7 步路由决策 → 写入 route-projection.yaml
Step 8: 根据 action-governance 加载 required_contracts
Step 9: 更新 .claude/memory/session/recent.md
```

### 3.3 初始化后的初始状态

```yaml
task_id: tk-20260430-001
phase: clarify
subphase: authoring
phase_status: in_progress
delivery_mode: full  # 由路由决定
current_primary_artifact: ".claude/tasks/tk-20260430-001/00-user-intent.md"
current_gate_bundle: ""
gate_results: {}
closeout_allowed: false
updated_at: "2026-04-30T00:00:00Z"
```

## 4. Phase 推进流程

### 4.1 Phase 状态机图

```
clarify
  │ [用户目标明确] 
  ↓
research ──→ architecture-decomposition ──→ spec
  │                                            ↓
  │ [跳过架构拆解, Trivial任务]           design
  │                                            ↓
  │                                      plan
  │                                            ↓
  │                                      build ←───┐
  │                                            ↓   │ [评审不通过, 回退]
  │                                      verify    │
  │                                            ↓   │
  │                                      acceptance │
  │                                            ↓   │
  └───────────────────────────────────── release-ready
```

### 4.2 Phase Transition Rules（Mechanical）

进入下一个 phase 必须同时满足以下机械条件。任一条件不满足时，`phase_status` 不得写入 `passed`。

#### 4.2.1 条件清单

| # | 条件 | 证据位置 | 验证方式 |
|---|------|---------|---------|
| 1 | 当前 phase 的 `phase_status = passed` | `00-task-state.yaml` | 字段值 |
| 2 | 当前 phase 对应的 gate 全部通过 | `gate_results.<bundle_id>.status = passed` | 字段值 |
| 3 | 当前 phase 的主产出 artifact 存在且非空 | 文件系统存在 + size > 0 | `ls` 等价检查 |
| 4 | 无 unresolved blocker | `last_blocker_report` 为空或已标记 resolved | 字段值 |
| 5 | 脏数据/脏链路已清理 | `checkers/dirty-hygiene-closure-check` result = passed | checker result |
| 6 | `00-task-state.yaml` 已更新 | `updated_at` 晚于当前 phase 主产出最后修改时间 | 时间戳比较 |
| 7 | **强制检查器全部通过或有已批准异常** | `checkers/<checker_id>-<run_id>.yaml` | 见 §4.2.2 |
| 8 | **Auditor 验证通过** | `reviews/audit-report-*.yaml` | 见 §4.2.4 |

#### 4.2.2 强制检查器验证协议

对于当前 `action_family + artifact_kind`，读取 `route-projection.yaml` 的 `mandatory_checkers` 列表。对每个 checker：

```
IF checker_result.yaml 存在且 status == "passed":
    → 满足
ELIF exception 对象存在且 class == "verification_exception" 且 status == "approved":
    → 满足（但评审时必须验证 manual_evidence 的完整性）
ELSE:
    → 不满足，phase transition 被机械阻断
```

#### 4.2.3 阻断语义

#### 4.2.4 Auditor 验证协议

条件 8 的执行流程：

1. 主线程触发 Auditor Agent（只读权限）
2. Auditor 按 `verification-checker.md` §11.3 的 7 项检查清单执行验证
3. Auditor 产出 `audit-report.yaml`，写入 `reviews/audit-report-phase_transition-<timestamp>.yaml`
4. 主线程读取 audit report：
   - `verdict=audited` → 条件 8 满足，允许 transition
   - `verdict=mechanical_gap` → 条件 8 不满足，阻断 transition，返回 gap 列表修复
   - `verdict=insufficient_evidence` → 条件 8 不满足，要求补充证据后重新触发 Auditor

**硬规则**：主线程不得覆盖 Auditor verdict。若检测到覆盖 → 标记 `tamper_detected`，task 进入 `blocked`。

#### 4.2.5 阻断语义

当任一条件不满足时：
- 不得进入下一 phase
- 不得创建下一 phase 的 review bundle
- 若 `phase_status` 已被错误写入 `passed`，任何后续 Agent 发现后必须将其降级为 `failed`，并记录 `mechanical_override_detected`

### 4.3 Phase 到 Gate 的映射

| Phase | 必须通过的 Gates |
|-------|----------------|
| clarify | 无（用户确认即可） |
| research | professional（学习报告通过评审） |
| architecture-decomposition | professional + contract |
| spec | value + professional + contract |
| design | professional + contract |
| plan | professional |
| build | professional + contract |
| verify | professional + contract |
| acceptance | value + professional + contract |
| release-ready | contract |

### 4.4 Phase 回退规则

以下情况必须回退到更早 phase：

| 触发条件 | 回退到 |
|---------|--------|
| 评审发现架构设计有根本性错误 | architecture-decomposition |
| 发现需求理解有根本性偏差 | clarify 或 research |
| 实现发现设计不可行 | design |
| 测试发现大量核心逻辑错误 | build |
| 同类问题连续 3 轮未解决 | 上一 stage |

### 4.5 Evidence Lock

每次 phase 推进前，主线程必须执行 Evidence Lock，产出 `evidence-lock-<phase>.yaml`：

```yaml
evidence_lock:
  task_id: "<task-id>"
  phase: "<current-phase>"
  locked_at: "<ISO8601>"
  mandatory_checkers:
    - checker_id: "<id>"
      result_ref: "checkers/<checker_id>-<run_id>.yaml"
      status: passed | excepted
      exception_ref: "<exception-id>"
  gate_results:
    - gate: value | professional | contract
      status: passed
      receipt_ref: "reviews/receipt-<gate>-<attempt>.yaml"
  artifact_hash: "<sha256-of-primary-artifact>"
```

**规则**：
- Evidence Lock 写入 `tasks/<task-id>/checkers/evidence-lock-<phase>.yaml`
- 后续任何 Agent 质疑 phase 推进合法性时，以此文件为权威证据
- 若 Evidence Lock 缺失，评审 Agent 必须将 verdict 降级为 `contract_not_closed`，标记 `mechanical_evidence_missing`

### 4.6 MCP 工具调用要求

Agent 在关键步骤**必须**调用 `constraint-enforcer` MCP Server 的工具，将约束校验从被动提醒转为主动确认。

| 步骤 | 必须调用的 MCP 工具 | 目的 |
|------|-------------------|------|
| 任务初始化后 | `check_phase_readiness` | 确认当前任务状态与预期一致 |
| Phase 推进前 | `check_phase_readiness` | 校验 7 个机械条件是否全部满足 |
| 发现 checker 缺失时 | `run_mandatory_checkers` | 自动运行缺失的 mandatory checkers |
| 准备生成证据锁时 | `generate_evidence_lock` | 收集 checker 结果并锁定证据 |
| 执行 phase transition 时 | `request_phase_transition` | 一站式验证 + 生成 evidence lock + 更新 state |
| 写入敏感文件前 | `validate_write_permission` | 预判 Write/Edit 是否会被 hook 阻断 |

**规则**：
- Agent 不得在 `check_phase_readiness` 返回 `ready: false` 时擅自推进 phase
- Agent 不得绕过 `request_phase_transition` 直接修改 `00-task-state.yaml` 的 `phase_status`
- PreToolUse Hook 作为**保底防线**保留；MCP 工具提供**主动修复能力**，二者互补
- MCP 的约束规则全部来自 `.claude/config/*.yaml`（机械条件、phase 状态机、权限矩阵），不在 MCP 代码中硬编码。规范是 Single Source of Truth，配置层是规范的机器可读投影，MCP 是配置的执行引擎

#### 4.6.1 MCP 响应信号

MCP 工具返回中新增以下信号字段，供 Orchestrator 识别下一步动作：

| 字段 | 来源工具 | 含义 |
|------|---------|------|
| `auditorRequired` | `check_phase_readiness`, `request_phase_transition` | `true` 表示 Auditor 裁决缺失或不通过，主线程必须触发 Auditor Agent 评审 |
| `manualGatesPending` | `request_phase_transition` | 列出需要人工/Agent 确认的 manual gates（如 `value` gate） |

**规则**：
- Orchestrator 不得忽略 `auditorRequired=true` 的信号擅自推进
- `auditorRequired` 由 MCP 自动推导（当 `auditor_verdict` 缺失或不为 `audited` 时），无需 Orchestrator 自行判断

#### 4.6.2 配置热重载

`.claude/config/*.yaml` 修改后，MCP server 在**下一次工具调用时自动检测文件 mtime 变化并重新加载**，无需重启进程或修改 MCP 代码。这保证了规范维护者更新配置后，约束规则立即生效。

## 5. 评审循环流程

```
[Phase 产出] → [创建 Review Pack] → [派发评审 Agent] → [收集报告]
                    │                      │
                    v                      v
              00-04 文件          ≥2 独立 Agent 并行
                                         │
                                         v
                                   [三级裁决]
                                  Pass / CP / Fail
                                         │
                            ┌────────────┼────────────┐
                            v            v            v
                         Pass        CP(修复)      Fail(回退)
                            │            │            │
                            v            v            v
                       进入下阶段     修复后再审      回退phase
```

### 5.1 Review Pack 创建

评审前必须创建 review bundle（存放在 `.claude/tasks/<task-id>/review-bundles/<bundle-id>/`）：

```
<bundle-id>/
├── README.md                    ← bundle 描述
├── 00-user-intent.md            ← 意图来源（链接或复制）
├── 01-truth-sources.md          ← 真相源清单
├── 02-review-rubric.yaml        ← 评审量表
├── 03-hard-fail-rules.yaml      ← 硬失败规则
├── 04-scope-boundary.md         ← 评审范围边界
└── 05-value-evidence.yaml       ← 仅 value gate 需要
```

### 5.2 评审 Agent 派发

```
Standard 任务: 2 个独立 Agent（不同维度）
Complex 任务: 3-4 个独立 Agent（安全/性能/正确性/架构）
```

每个评审 Agent 的 prompt 必须包含：
- 对应阶段 checklist 路径
- 被审 artifact 路径
- 禁止看到的文件（blind review 时）
- 输出格式要求

### 5.3 3 轮升级机制

```
Round 1: request_changes → 作者修复
Round 2: 仍同类问题 → method_issue（标注方法论问题）
Round 3: 仍同类问题 → blocked → 报告用户 → 等待决策
```

**blocked 后禁止**：
- 静默推进
- 用不同措辞重新提交相同内容
- 绕过 blocker 继续写代码

## 6. 写入权限规则

### 6.1 主线程（Orchestrator）

有权写入：
- `00-task-state.yaml`（主状态）
- `00-user-intent.md`（意图，需用户确认后修改）
- `board.yaml`（工作项看板）
- `README.md`（人类入口）
- `checkpoint`（恢复摘要）
- 当前 phase 的主产出 artifact
- `route-projection.yaml`

无权写入：
- review bundle 内的文件
- 评审报告
- 其他子 Agent 的 artifact

### 6.2 子 Agent（Worker）

有权写入：
- 授权范围内的 artifact
- 自己的输出文件

无权写入：
- `00-task-state.yaml`（除非明确授权）
- `00-user-intent.md`
- 其他子 Agent 的 artifact
- review bundle

### 6.3 评审 Agent（Reviewer）

有权写入：
- 评审报告
- review receipt/provenance
- 03-hard-fail-rules.yaml 的填写

无权写入：
- 任何业务 artifact
- `00-task-state.yaml`
- 被审 artifact

## 7. 并行协作流程

### 7.1 触发条件

满足以下任一条件时必须进入并行协作：
- `execution_orchestration_route = mandatory_multi_agent`
- 任务覆盖 ≥2 个 activity family
- 需要全仓库搜索或跨文件分析
- 用户明确要求多 Agent

### 7.2 并行执行流程

```
[Manifest 冻结] → [Fan-Out 派发] → [Wait All] → [Fan-In 综合] → [状态写回]
     │                  │                          │
     v                  v                          v
  packets[]       子Agent并行执行            fan-in report
  read_scope[]    各自产出 artifact         采纳/废弃裁决
  write_scope[]   watchdog timeout          冲突解决
```

### 7.3 并行协作状态字段

`00-task-state.yaml` 在并行模式下必须额外包含：

```yaml
orchestration_model: multi_packet_parallel
parallelism_target: 3
parallelism_actual: 3
delegation_plan_ref: ".claude/tasks/<id>/artifacts/delegation-plan.yaml"
workstream_manifest_path: ".claude/tasks/<id>/artifacts/board.yaml"
aggregation_artifact_path: ".claude/tasks/<id>/artifacts/fan-in-report.md"
context_budget_policy_ref: ".claude/tasks/<id>/artifacts/checkpoint.md"
workstream_status_by_id:
  ws-1: { owner: agent-1, status: in_progress, write_scope: ["src/foo/"] }
  ws-2: { owner: agent-2, status: completed, write_scope: ["src/bar/"] }
```

### 7.4 并行协作板（Board）Claim/Release 协议

Board 上的 work item 必须通过 claim/release 协议管理所有权：

| 动作 | 触发条件 | 必填字段 |
|------|---------|---------|
| **claim** | 子 Agent 开始处理某 work item | `claimed_by`（agent_id）、`claimed_at`（时间戳） |
| **release** | 子 Agent 完成或放弃某 work item | `released_at`（时间戳）、`release_reason`（completed/aborted/transferred） |
| **transfer** | 将 work item 从一个 Agent 转给另一个 | `transferred_from`、`transferred_to`、`transfer_reason` |

**硬规则**：
- 同一 work item 同时只能有一个 active claim
- 未 release 的 work item 不得被其他 Agent 修改
- closeout 时所有 work item 必须处于 released 且 status=done 状态

## 8. Board.yaml 结构

```yaml
board_id: brd-YYYYMMDD-NNN
task_id: tk-YYYYMMDD-NNN
title: <任务标题>
status: active
phase: <当前phase>
subphase: <当前subphase>
next_actor: <下一步执行者>
active_claims:
  - { work_item_id: wi-1, claimed_by: agent-1, claimed_at: <time> }
work_items:
  - id: wi-1
    title: <工作项标题>
    status: pending | claimed | in_progress | in_review | done | blocked
    owner: <agent_id | human>
    deliverable: <产出物路径>
    files: [<影响文件列表>]
    depends_on: [<依赖的wi-id>]
    write_scope: [<可写目录/文件>]
    interface_surface: [<接口面描述>]
    merge_after: [<合并顺序>]
```

## 9. Checkpoint 结构

```markdown
# Checkpoint — tk-YYYYMMDD-NNN

## Current Goal
<当前目标与范围>

## Truth Sources
- 00-user-intent.md: <path>
- 00-task-state.yaml: <path>
- 当前主artifact: <path>

## Approved Conclusions
<已批准的结论>

## Active Threads
<活跃线程与责任边界>

## Unresolved Issues
<未解决问题>

## Key Evidence Paths
<关键证据路径>

## Next Steps
<下一步>
```

## 10. Compaction Receipt 结构

```yaml
trigger_level: 55% | 70% | 85%
trigger_reason: <为什么触发压缩>
estimated_budget_before: <压缩前预算百分比>
compaction_actions:
  - <具体压缩动作, 如"清理旧搜索结果">
  - <如"移除过期讨论">
  - <如"保留真相源引用">
preserved_truth_refs:
  - 00-user-intent.md
  - 00-task-state.yaml
  - <最新checkpoint>
  - <已批准结论路径>
resume_anchor: <恢复锚点, 通常是checkpoint路径>
recorded_at: <ISO8601时间戳>
```

## 11. 断线恢复流程

```
[新会话] → [读取 00-task-state.yaml] → [读取 00-user-intent.md]
                                      → [读取 README.md]
                                      → [读取 board.yaml]
                                      → [读取 checkpoint]
                                      → [重建上下文]
                                      → [继续执行]
```

### 11.1 恢复判定

恢复后必须回答：
1. 任务目标是什么？（00-user-intent.md）
2. 做到哪了？（00-task-state.yaml phase + phase_status）
3. 谁在做？（board.yaml active_claims）
4. 下一步是什么？（checkpoint Next Steps）
5. 有没有 blocker？（00-task-state.yaml last_blocker_report）

### 11.2 恢复后校验

- 检查 state 中的 phase/gate 是否与实际 artifact 状态一致
- 检查 board 中的 work items 是否都有对应的产出
- 检查是否存在脏数据/脏链路
- 检查上下文预算是否需要压缩

## 12. Closeout 流程

```
[所有 gates passed] → [检查收口前置条件] → [更新 README 为交付态]
                        │
                        v
                   [清理脏数据/链路] → [归档 review provenance]
                        │
                        v
                   [更新 state: phase=release-ready, closeout_allowed=true]
                        │
                        v
                   [写入 closeout report] → [记忆沉淀] → [清理临时文件]
```

### 12.1 收口前置条件检查清单

- [ ] 所有 required gates 通过
- [ ] review provenance 已回链
- [ ] 无 unresolved blocker
- [ ] README 已切换到交付态
- [ ] 脏数据/脏链路已清理
- [ ] 所有 work items 状态为 done
- [ ] 评审 finding 全部闭合
- [ ] 记忆已沉淀

### 12.2 收口后动作

1. 归档最后一轮评审报告
2. 删除被否决的评审轮次
3. 删除临时/诊断/override 文件
4. 更新 memory/session/recent.md
5. 如有新踩的坑/验证的规则，更新 agent 记忆
6. 提交 git commit（如适用）
