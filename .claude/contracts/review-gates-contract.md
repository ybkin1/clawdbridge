---
contract_id: "review-gates"
title: "评审门控契约"
owner: "claude-code"
scope: "3层评审门控模型（value→professional→contract），确保评审有结构化检查面、证据和结论。v2 新增 §4.4 首轮全维并行审计规则。"
trigger: "每个phase推进前必须通过对应gate评审"
required_inputs: ["task-tracking状态", "intent-capture意图", "评审包（review bundle）"]
required_contracts: ["task-tracking", "intent-capture"]
required_skills: []
verification_checks: ["3-layer-gate-order", "review-pack-required-files", "hard-fail-conditions", "3-round-escalation", "zero-finding-rule", "round1-multi-agent-mandatory"]
exceptions: ["trivial-task-self-review"]
supersedes: []
version: 2
last_reviewed_at: "2026-05-11"
---

# 评审门控契约（Review Gates Contract）

## 1. 目的

定义 3 层评审门控模型，确保评审不流于"看一下说通过了"，而是有结构化的检查面、证据和结论。

## 2. 适用范围

本契约适用于所有 Standard/Complex 任务的 phase 推进评审。
Trivial 任务通过主线程自检，不需要正式评审门控。

## 3. 核心原则

1. **固定顺序不可跳层** — value → professional → contract，不得跳过或提前
2. **证据驱动** — 评审结论必须有结构化证据，禁止"我看过了"式口头通过
3. **独立评审** — Standard/Complex 任务禁止 self_review，作者不自审
4. **零发现不等于通过** — passed 结论必须说明检查了哪些方面、排除了哪些失败假设

## 4. 3 层门控模型

评审必须按固定顺序通过 3 层门，不可跳层：

### Layer 1: Value Gate（用户价值）
- **问题**：当前产出是否满足用户真实诉求？
- **定义**：value gate = `00-user-intent.md` 中 `observable_success` 字段的可验证达成。检查当前产出是否能让 `happy_path` 场景跑通，`failure_trigger` 是否被排除。
- **检查面**：目标用户、关键场景、成功动作、失败触发点、不可接受缺口
- **证据**：`05-value-evidence.yaml`（仅 PRD 和交付类任务强制）
- **裁决**：是否仍要求下一位使用者重写关键内容才能使用？

### Layer 2: Professional Gate（工程合理性）
- **问题**：架构/设计/实现在工程上是否合理？
- **检查面**：架构对应、模块交互、接口设计、数据流、失败语义、幂等/重试、边界条件、可维护性（日志/审计/监控/回滚/降级/恢复）
- **裁决**：是否存在方法论问题或结构性缺陷？

### Layer 3: Contract Gate（契约合规）
- **问题**：是否遵守了所有适用的契约和规范？
- **检查面**：task-tracking 状态一致性、work-packet 拆包合规、context-governance 加载正确、review consistency 12 项检查
- **裁决**：是否有契约违反或脏数据/脏链路？

**硬规则**：Contract Gate 永远是最后一层，不得提前。

### 4.4 首轮全维并行审计规则（v2 新增·防递减收益）

> **背景**：ClawdBridge Design v3 评审实证数据表明——R1-R6 用单一维度审同一文档，仅发现 44 findings（7.3/轮）；R7 切换为 8 维并行多 Agent 审计，单轮发现 43 findings。**证明单维度重复评审存在严重的递减收益，必须在首轮启用全维审计。**

| 规则 | 内容 |
|------|------|
| **R1-全维** | Standard/Complex 任务的**第 1 轮评审**必须采用多 Agent 并行模式。Agent 数 ≥ 任务复杂度对应的最低数（见 §4.5） |
| **R1-覆盖** | 第 1 轮必须覆盖全部最低评审维度（见 §4.5）。任何维度不得延后到第 2 轮 |
| **R1-独立** | 每个 Agent 分配不同的评审维度集合，Agent 间不交叉阅读彼此的评审报告（blind independent） |
| **R1-聚合** | 主线程通过 Fan-In 合并所有 Agent 的 findings，统一输出 synthesis report + receipt |
| **R2+** | 后续轮次只需验证 R1 发现的修复情况 + 新引入问题的增量审计。不再重复全维 |

**违反此规则的后果**：
- 未启用多 Agent 的 R1 评审 → verdict 自动降级为 `contract_not_closed`，标记 `round1_multi_agent_missing`
- 缺失维度的 R1 评审 → 缺失维度计入 `contract_not_closed`，必须在 R2 补充

### 4.5 最低评审维度表（按任务类型）

| 任务类型 | 最低维度数 | 最低 Agent 数 | 维度清单 |
|---------|:--:|:--:|------|
| **设计文档 (design-doc)** | 8 | 3 | 安全纵深 / 边界条件 / 并发安全 / 资源限定 / 环境声明 / 内部一致性 / PRD×Design 对齐 / 设计规范符合性 |
| **PRD (prd-doc)** | 5 | 2 | 功能完整度 / 用户画像对齐 / 竞品差异度 / 可验证性 / 优先级合理性 |
| **代码 (code)** | 6 | 2+MCP | 功能正确性 / 安全 / 性能 / 可维护性 / 测试覆盖 / 风格一致性 |
| **开发计划 (dev-plan)** | 5 | 2 | 算术一致性 / 依赖无循环 / 资源合理性 / PRD×Design 覆盖 / 里程碑可验证 |
| **契约文档 (contract-doc)** | 4 | 2 | 条款完整性 / 冲突检测 / 可执行性 / 迁移路径 |

**维度不可合并规则**：一个 Agent 最多承担 3 个维度。若维度数 > 3，必须拆分给多个 Agent。

## 5. 评审模式

| 模式 | 说明 |
|------|------|
| `blind_independent` | 评审者看不到作者解释和状态文件，只能看产出物本身 |
| `independent` | 独立评审，作者不自审 |
| `self_review` | 仅 Trivial 任务允许 |

**Standard/Complex 任务禁止 self_review。**

## 6. Review Pack 结构与必需文件矩阵

评审包存放在 `.claude/tasks/<task-id>/review-bundles/<bundle-id>/`，不同 gate 类型需要的文件不同：

| 文件 | value gate | professional gate | contract gate |
|------|:----------:|:-----------------:|:-------------:|
| `00-user-intent.md` | required | required | required |
| `01-truth-sources.md` | required | required | required |
| `02-review-rubric.yaml` | required | required | required |
| `03-hard-fail-rules.yaml` | required | required | required |
| `04-scope-boundary.md` | required | required | required |
| `05-value-evidence.yaml` | **required** | optional | — |
| task state | — | — | required |
| registry.yaml | — | — | required |

**规则**：required 文件必须存在；optional 文件在未触发对应 gate 时可省略，但需在 bundle README 中说明原因。缺失必需文件时对应 gate 不得宣称 passed。

## 7. 评审结论词汇与 CLAUDE.md Rule 2 映射

| 本契约（单个 gate finding） | CLAUDE.md Rule 2（整体裁决） | 含义 |
|---------------------------|---------------------------|------|
| `passed` | `Pass` | 所有 gates 通过，无阻塞问题 |
| `request_changes` | `Conditional Pass` | 有需要修复的问题，但方法论正确 |
| `blocked` | `Fail` | 方法论问题，3 轮同类未解决 |
| `contract_not_closed` | `Conditional Pass` | 契约未闭合，有合规缺口 |

## 8. 3 轮升级机制

| 轮次/级别 | 触发条件 | 结论 | 决策者 | SLA 超时 | 超时后动作 | 通知方式 |
|----------|---------|------|--------|---------|-----------|---------|
| 1 | 第1轮 `request_changes` | `request_changes` | 作者自主修复 | 当前 task session | 进入第2轮 | task state + 直接输出 |
| 2 | 第2轮 `request_changes` | `request_changes` + `method_issue` | 主线程裁决 | 当前 task session | 标记 blocked，报告用户 | task state + 用户提示 |
| 3 | 第3轮 `blocked` | `blocked` | 用户最终决策 | 用户下次交互 | 硬停止 | 正式报告（摘要+建议+选项） |
| 4 | blocked 后用户要求继续 | 按用户指令 | 用户 + 主线程 | 用户指定 | 按指令执行 | risk accepted + disclaimer |

**blocked 是 finding 的终态，不是流程的终态。** blocked 后必须报告用户并等待决策（详见 CLAUDE.md Rule 2 用户干预命令表）。

## 9. 零发现规则

若评审结论为 `passed` 但没有任何 finding，必须说明：
- 检查了哪些方面
- 排除了哪些失败假设
- 为什么认为通过了

禁止"无发现 = 通过"的默认行为。

## 10. 评审者职责

- reviewer 不写业务 artifact
- reviewer 仅产出评审报告和控制面文件
- reviewer 身份可验证
- reviewer/author/reviser 三者隔离可证明

## 11. Gate 状态映射

每个 gate 至少应记录以下字段：

| 字段 | 含义 |
|------|------|
| `status` | pending / in_review / passed / failed / blocked |
| `round` | 当前评审轮次 |
| `same_class_streak` | 同类结论连续出现次数 |
| `blind` | 是否盲审 |
| `decision` | approved / request_changes / blocked / state_sync_pending |
| `findings_ref` | finding 列表引用 |
| `provenance_ref` | 评审证明引用 |

### 11.1 Reviewer Verdict → Gate Attempt 映射

| reviewer outward verdict | gate `status` | gate `decision` | leader 可否收口 |
|-------------------------|--------------|-----------------|----------------|
| `passed` | `passed` | `approved` | 可以；前提是 receipt/transcript/report 已完整落盘 |
| `request_changes` | `failed` | `request_changes` | 不可；必须先修订再复评 |
| `blocked` | `blocked` | `blocked` | 不可；需先解除阻塞 |
| `contract_not_closed` 且仅剩 leader formal writeback | `in_review` | `state_sync_pending` | 可；待 leader 完成 formal state/provenance/summary 写回后再收口 |
| `contract_not_closed` 且缺 reviewer lane 必需 receipt/transcript/hash | `failed` | `request_changes` | 不可；因为 formal proof 仍未闭合 |

**规则**：
- `state_sync_pending` 不是最终 outward verdict，而是 gate attempt decision
- `passed` 不是一个模糊好评词，而是 `status=passed + decision=approved`
- `contract_not_closed` 不是 state decision 值，而是 reviewer outward verdict，需要 leader 映射后再回写

### 11.2 `state_sync_pending` 规则

`state_sync_pending` 只表示：
- reviewer 已确认内容层面已足够
- 剩余动作仅是 leader 的 state / provenance / summary 正式写回

它不表示：
- 还需要新一轮同类 reviewer
- 还缺新的实质证据

### 11.3 多 Agent Verdict 聚合规则

当 ≥2 个独立评审 Agent 并行评审时，主线程按以下规则聚合 verdict：

| 聚合场景 | 最终 verdict | gate status | gate decision |
|---------|-------------|-------------|---------------|
| 全部 reviewer 返回 `passed` | `passed` | `passed` | `approved` |
| 任一 reviewer 返回 `blocked` | `blocked` | `blocked` | `blocked` |
| 任一 reviewer 返回 `request_changes`（含 Critical finding） | `request_changes` | `failed` | `request_changes` |
| 全部 reviewer 返回 `contract_not_closed` | `contract_not_closed` | `in_review` | `state_sync_pending` |
| 混合（部分 passed + 部分 contract_not_closed） | `contract_not_closed` | `in_review` | `state_sync_pending` |
| 混合（部分 passed + 部分 request_changes） | `request_changes` | `failed` | `request_changes` |

**一票否决规则**：任一 reviewer 发现 Critical finding → 整体 verdict = `request_changes`。无需多数决。

**同 streak 判定**：聚合 verdict 记入 same_class_streak。当 ≥2 轮聚合 verdict 为同类时，自动标记 `method_issue`。

## 12. Review Receipt 最小 Schema

每次评审完成后，必须在 `tasks/<task-id>/reviews/` 下写入评审 receipt，包含以下字段：

```yaml
review_id: "<task-id>-<gate>-attempt-<N>"
task_id: "<task-id>"
gate_type: "value | professional | contract"
review_mode: "single | multi_agent"    # 单评审员或多 Agent 并行
reviewers:                             # 多 Agent 时必填数组
  - reviewer_id: "<agent-id>"
    verdict: "passed | request_changes | blocked | contract_not_closed"
    report_path: "<relative path>"
  # ... 更多 reviewer
verdict: "passed | request_changes | blocked | contract_not_closed"  # 聚合后最终 verdict（见 §11.3）
review_date: "<ISO 8601 timestamp>"
round: <N>                    # 当前评审轮次
parent_agent_id: "<主线程 agent ID>"  # 标识评审由哪个 agent 发起
attempts_in_streak: <N>       # 同类结论连续次数
findings_summary:             # 最少发现摘要
  - critical: []
  - major: []
  - minor: []
```

**规则**：
- review_id 全局唯一
- review_mode = `multi_agent` 时，`reviewers` 数组长度 ≥2
- reviewer_id 必须可区分于作者（禁止 self_review）
- 每个 reviewer 的 report_path 必须指向存在的评审报告文件
- attempts_in_streak ≥ 2 时自动标记 `method_issue`，≥ 3 时自动标记 `blocked`
- 单评审员时 `reviewers` 可省略，此时 `verdict` 直接取自单个 reviewer

## 13. 输出与投影

本契约产出的正式文件：
- `tasks/<task-id>/review-bundles/<bundle-id>/` — 评审包目录
- `tasks/<task-id>/reviews/` — 评审结果目录
- `00-task-state.yaml` 的 gate 状态字段 — 门控决策索引
- `05-value-evidence.yaml` — 用户价值验证证据（value gate 强制）
- `review-provenance.yaml` — 评审可追溯性证据

### 13.1 Provenance Manifest Schema

多轮评审历史的可追溯证据：

```yaml
review_provenance_manifest:
  task_id: "<task-id>"
  gate_type: "value | professional | contract"
  attempts:
    - attempt: 1
      date: "<ISO 8601>"
      mode: "single | multi_agent"
      reviewers: ["<agent-id>"]
      verdict: "passed | request_changes | blocked"
      findings:
        - severity: critical | major | minor
          description: "<发现>"
      report_ref: "reviews/review-<gate>-attempt-1.md"
      receipt_ref: "reviews/receipt-<gate>-attempt-1.yaml"
  final_verdict: "<聚合 verdict>"
  final_decision: "<最终 decision>"
```

**规则**：attempts[] 必须按时间顺序记录全部轮次；每轮必须有 report_ref + receipt_ref；closeout 前验证引用完整性。

### 13.2 Blocked Report 模板

`blocked` 时必须在 `tasks/<task-id>/reviews/blocked-report-<N>.md` 中写入：

| 字段 | 内容 |
|------|------|
| `task_id` | 被阻塞的任务 ID |
| `blocked_gate` | value / professional / contract |
| `block_reason` | 方法论问题 / 结构性缺陷 / 3 轮同类未解决 |
| `findings_chain` | 各轮 finding 摘要，证明同类重复 |
| `remediation_options` | 修复路径（≥2 选项） |
| `recommended_action` | Agent 推荐的下一步 |

**硬规则**：blocked 报告必须包含 findings_chain，不得只写"评审不通过"。

### 13.3 Artifact Profile → Review Pack 映射

| artifact_kind | 必需文件 | Agent 数 |
|---------------|---------|---------|
| `contract-doc` | `00-user-intent.md`, `02-review-rubric.yaml`, `03-hard-fail-rules.yaml`, 契约正文 | 2-3 |
| `prd-doc` | `00-user-intent.md`, `01-truth-sources.md`, `05-value-evidence.yaml`, PRD 正文 | 2 |
| `design-doc` | `00-user-intent.md`, `01-truth-sources.md`, 设计正文, PRD 引用, `design-round1-multi-agent-checklist.md`（首轮强制） | 3-5 |
| `code` | 代码 diff, 追溯矩阵, 测试报告, lint 报告 | 2 + MCP |
| `test-plan` | `00-user-intent.md`, 测试计划正文 | 2 |
| `report` | 报告正文, 源材料引用表 | 1-2 |

## 18. Gate Evidence Validation Rules（新增）

### 18.1 Mechanical Preconditions for Gate Passed

任何 gate 被声明 `passed` 前，必须满足以下机械条件：

| 条件 | 验证来源 | 失败后果 |
|------|---------|---------|
| 对应 phase 的 Evidence Lock 存在 | `checkers/evidence-lock-<phase>.yaml` | gate 不得 passed |
| 所有 direct-dependency checker 结果存在 | `checkers/<checker_id>-*.yaml` | gate 不得 passed |
| 无 failed 状态的 direct checker（除非有 approved exception） | checker result YAML | gate 自动 failed |
| Review receipt 引用所有 checker runs | receipt YAML 的 `checker_runs[]` | gate 不得 passed |
| receipt 的 `findings_summary` 与 report 一致 | 交叉验证 | professional gate 不得 passed |
| Auditor verdict = audited | `reviews/audit-report-*.yaml` | gate 不得 passed |

### 18.2 Checker Run Reference in Receipt

Review receipt 必须包含 `checker_runs` 数组：

```yaml
checker_runs:
  - checker_run_id: "<id>"
    checker_id: "<checker-id>"
    result_ref: "checkers/<file>.yaml"
    status: passed | excepted
    exception_ref: "<exception-id>"  # 若 excepted
```

缺失 `checker_runs` 或引用不存在的 result 文件 → receipt 无效 → gate 不得 passed。

### 18.3 自动降级规则

若评审 Agent 发现以下情况，必须自动降级 verdict：

| 发现 | 降级至 | 标记 |
|------|--------|------|
| `phase_status=passed` 但 Evidence Lock 缺失 | `contract_not_closed` | `mechanical_evidence_missing` |
| `gate=passed` 但 direct checker failed 且无 exception | `failed` | `mechanical_checker_failed` |
| receipt 未引用 mandatory checker | `contract_not_closed` | `mechanical_receipt_incomplete` |
| 同一 checker run_id 被多个 gate 复用（时间戳不同） | `request_changes` | `mechanical_evidence_reuse` |
| Auditor 发现 mechanical_gap | `failed` | `auditor_mechanical_gap` |
| 主线程覆盖 Auditor verdict | `blocked` | `tamper_detected` |

### 18.4 写入 §11.1 映射表

在 §11.1 `Reviewer Verdict → Gate Attempt 映射` 表中新增一行：

| `contract_not_closed` 且 mechanical evidence 缺失 | `failed` | `mechanical_evidence_missing` | 不可 |

## 14. 边界

### 14.1 与其他契约的边界

- 与 task-tracking：评审门控读取 task state，但不修改 phase 本身（phase 推进由 task-tracking-workflow 定义）
- 与 verification-checker：checker 提供验证证据，gate 基于证据做出裁决
- 与 exception-governance：异常治理不豁免 formal review（`conflicts_with` 双向声明）
- 与 cluster-orchestration：多 Agent 评审的编排方式由 cluster-orchestration 定义，评审内容标准由本契约定义

### 14.2 不覆盖的范围

本契约不定义：
- 评审的具体 checklist 内容（由各 Stage checklist 定义）
- 代码质量或功能正确性（由 `scenario-traceability-spec.md` 和 `engineering-standards` 定义；场景追溯评审在 Professional Gate 执行时作为检查项加载，其裁决结果计入 Professional Gate 的 findings）
- 评审 Agent 的派发机制（由 CLAUDE.md Rule 2 + cluster-orchestration 定义）

### 14.3 Review Action 专用 Checklist 选择规则

当 `action_family=review`（独立评审任务，非 Stage gate review）时，按被评审对象的 artifact_kind 选择 checklist：

| 被评审对象 | 加载 checklist | 补充检查 |
|-----------|---------------|---------|
| PRD/需求文档 | `stage3-prd-review.md` | `user-value-checklist.md` |
| 架构/设计文档 | `stage2-architecture-review.md` + `stage4-5-plan-review.md` | — |
| 代码 | `stage6-code-review.md` | `scenario-traceability-spec.md` + `code-review-graph` MCP |
| 测试计划/用例 | `stage7-test-review.md` | — |
| 契约/规范文档 | `contract-completeness-checklist.md` | — |
| 学习分析报告 | `stage1-learning-review.md` | — |

## 15. 异常边界

以下场景允许偏离本契约：
- Trivial 任务：允许 self_review（主线程自检）
- 用户明确说"草版即可"/"不用评审"：降级评审要求，但风险记录到 exception
- 无法拉起独立 reviewer：通过 verification_exception 记录，提供等效人工证据

以下场景**永远不允许**偏离：
- Standard/Complex 任务的 self_review
- 跳层评审（如直接从 value gate 跳到 contract gate）
- 无证据的 passed 结论

## 16. 迁移策略

从"看一眼说通过"到结构化评审门控的过渡：
1. 第一阶段：评审结论词汇标准化（passed/request_changes/blocked/contract_not_closed）
2. 第二阶段：评审包结构化和证据化（review bundle 目录 + provenance）
3. 第三阶段：3 层门控固定顺序执行 + 硬失败条件生效
4. 第四阶段：checker 证据自动绑定 gate（verification-checker 集成）

## 17. 非目标

本契约不追求：
- 评审速度 — 深度优先于速度（Standard/Complex 任务）
- 零 finding 的评审 — 零发现规则要求即使 passed 也要说明检查了哪些方面
- 替代代码审查 — 评审门控是过程门控，不是代码级别的 review

