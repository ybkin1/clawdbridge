---
contract_id: "action-governance"
title: "动作治理契约"
owner: "claude-code"
scope: "路由决策后将任务动作映射为action_family/artifact_kind，驱动契约/技能/检查器激活"
trigger: "路由决策完成后，每个正式work packet的动作路由"
required_inputs: ["task-routing产出的归属/模式/工作流结果"]
required_contracts: ["task-routing", "task-tracking"]  # skill-tool-mapping removed: it consumes action-governance output, not a prerequisite to load
required_skills: []
verification_checks: ["action-family-identified", "artifact-kind-identified", "route-profile-resolved", "negative_activation-constraints"]
exceptions: ["equivalent-tool-fallback"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 动作治理契约（Action Governance Contract）

## 1. 目的

在路由决策完成后，本契约定义如何把"当前正在做什么动作、产出什么类型的产物"转换成可执行的规范/技能/工具/检查器激活矩阵。

核心原则：**先判动作，再选工具。**

## 2. Action Family 模型

每个任务动作必须归类为以下 7 个族之一：

| action_family | 含义 | 典型输出 |
|--------------|------|---------|
| `clarify` | 澄清目标/约束/非目标 | intent、范围说明 |
| `research` | 冻结事实来源/区分事实与推断 | 学习笔记、研究报告 |
| `authoring` | 起草正式交付物 | PRD、设计稿、契约文档 |
| `implementation` | 改代码/配置/数据结构 | 代码、配置、测试 |
| `verification` | 证明 claim 成立 | 测试报告、验证日志 |
| `review` | 正式评审（非作者继续写） | 评审报告 |
| `closeout` | 收口/归档/同步 | 归档记录、release-ready |

## 3. Artifact Kind 模型

| artifact_kind | 含义 |
|--------------|------|
| `intent` | 意图文档 |
| `feature-brief` | 特性简报 |
| `prd` | 产品需求文档 |
| `design-spec` | 设计规格书 |
| `contract` | 契约/规范文档 |
| `code` | 代码/配置 |
| `test-plan` | 测试计划 |
| `verification-report` | 验证报告 |
| `review-report` | 评审报告 |
| `handoff` | 交接文档 |
| `git-closeout` | Git 收口 |

## 4. 路由决策顺序

每个正式 work packet 的动作路由顺序固定：

1. 读取 `ownership_route`（来自 task-routing）
2. 读取 `delivery_mode`（来自 task-routing）
3. 识别 `action_family`
4. 识别 `artifact_kind`
5. 解析 `route_profile`（见第 6 节基线模板）
6. 解析 `required_contracts` / `required_skills` / `verification_checks`
7. 解析 `phase_anchor` / `required_gates` / `review_pack_profile`
8. 写回 task truth

**禁止**：先写产物再事后解释"这次其实是什么动作"。

## 5. 意图索引激活（Intent-Indexed Activation）

不是所有契约在所有任务中都加载。激活路径：

```
intent → ownership/delivery route → action_family/artifact_kind → route_profile → activation → context/checker bundle
```

每个非平凡 `full` 任务的路由投影至少包含：
- `action_family` + `artifact_kind`
- `required_contracts[]`: 当前动作必须先读取的契约
- `required_skills[]`: 当前动作需要优先调用的技能
- `verification_checks[]`: 当前动作至少要运行的检查
- `negative_activation`: 当前任务明确不加载的契约/技能/工具（用于减少无关上下文）

**negative_activation 约束**：
- 不得排除当前 active 的契约
- 不得排除 required skills
- 不得排除必需的 verification checks
- 不得把 formal review 降级为自审
- 不得绕过脏数据/脏链路卫生

### 5.1 negative_activation 执行决议

当需要声明 negative_activation 时，主线程必须执行以下决议流程：

1. 列出当前 action_family + artifact_kind 下所有 active 契约
2. 对每个拟排除的契约/技能/工具，回答：排除后是否违反上述 5 条约束？
3. 任一约束被违反 → 该契约/技能/工具**不得排除**
4. 所有约束均不违反 → 可排除，写入 `route-projection.yaml` 的 `negative_activation` 字段
5. 写入时必须附理由：为什么当前任务不需要该契约/技能/工具

**验证**：评审 Agent 必须检查 negative_activation 列表中的每一项是否通过决议流程。发现违反约束的排除项 → professional gate failed。

## 6. 基线路由模板

### 6.1 authoring + contract
- phase_anchor: `design`
- required_gates: `professional + contract`
- maturity_target: `contract-ready`
- required_contracts: `task-tracking`, `contract-schema`
- mandatory_checker_refs: [`route-output-closure-check`, `state-projection-alignment-check`, `dangling-reference-check`]

### 6.2 authoring + prd
- phase_anchor: `spec`
- required_gates: `value + professional + contract`
- maturity_target: `authoring-ready`
- mandatory_checker_refs: [`route-output-closure-check`, `state-projection-alignment-check`]

### 6.3 authoring + design-spec
- phase_anchor: `design`
- required_gates: `professional + contract`
- maturity_target: `authoring-ready`
- mandatory_checker_refs: [`route-output-closure-check`, `state-projection-alignment-check`, `dangling-reference-check`]

### 6.4 implementation + code
- phase_anchor: `build`
- required_gates: `professional + contract`
- maturity_target: `review-ready`
- required_contracts: `task-tracking`, `context-governance`, `work-packet-governance`
- verification_checks: `dirty-chain-prevention`, `context-budget-pressure`, `failure-state-explicitness`
- mandatory_checker_refs: [`dirty-chain-prevention-check`, `context-budget-delegation-check`, `dangling-reference-check`]

### 6.5 verification + test-plan / verification-report
- phase_anchor: `verify`
- required_gates: `professional + contract`
- maturity_target: `contract-ready`
- mandatory_checker_refs: [`review-consistency-check`, `state-projection-alignment-check`]

### 6.6 review + any formal artifact
- phase_anchor: 继承被审 artifact
- required_gates: 继承被审 artifact
- mandatory_checker_refs: [`review-consistency-check`]

### 6.7 closeout + git-closeout
- phase_anchor: `release-ready`
- required_gates: `contract`
- maturity_target: `release-ready`
- verification_checks: `dirty-hygiene-closure`, `dangling-reference-closure`, `stale-projection-cleanup`
- mandatory_checker_refs: [`dirty-hygiene-closure-check`, `dangling-reference-check`, `stale-projection-cleanup-check`]

## 7. Fallback vs Exception 边界

允许的 fallback（等价替代）：
- 同等能力的替代工具/技能

不允许写成 fallback 的情况（必须走异常治理）：
- 不拉独立 reviewer
- 跳过 required checker
- 跳过 required gates
- 把并行改成单线程且不记录理由
- 因缺工具而减少 evidence 或 verification

## 9. 机械执行规则（Mechanical Enforcement Rules）

以下规则使治理链具备自 enforcement 能力，不依赖外部工具：

### 9.1 Route Profile 不可变性

`route-projection.yaml` 写入后，`action_family`、`artifact_kind`、`mandatory_checker_refs` 冻结。变更需：
1. 创建新的 route-projection 版本（`version` 字段 +1）
2. 在 `00-task-state.yaml` `route_profile.change_reason` 中记录变更原因
3. 重新运行新 profile 下的所有 mandatory checkers

### 9.2 Checker 前置条件（Phase Status）

任何 Agent 不得将 `phase_status` 设为 `passed`，除非：
- 当前 `action_family + artifact_kind` 对应的所有 `mandatory_checker_refs` 均有 `checker_result.yaml`
- 每个 result 的 `status` 为 `passed`，或存在 `status=approved` 的 `verification_exception`
- result 的 `run_at` 晚于当前 phase 主产出的最后修改时间

### 9.3 Gate Verdict 前置条件

任何 gate 被声明 `passed` 前，所有 `gate_binding` 匹配该 gate 的 checkers 必须：
- 有 `checker_result.yaml` 且 `status=passed`，或
- 有 approved exception 且 `compensating_controls` 完整

### 9.4 Agent Override 禁止项

以下理由**永远不可**用于跳过 mandatory checker：
- "我已经人工检查过了"
- "任务很小"
- "checker 还没实现"（应走 exception + manual evidence）
- "我稍后再运行"
- "这次先不跑"

违反以上任一禁止项 → professional gate 自动 failed，标记 `mechanical_override_detected`。

## 8. 与下层契约的关系

- 消费 `task-routing` 的归属/模式/工作流结果
- 为 `context-governance` 提供需要加载的契约/技能清单
- 为 `task-tracking` 提供 phase_anchor / required_gates
- 为 `review-gates` 提供 review_pack_profile / maturity_target
- 为 `skill-tool-mapping` 提供 action_family / artifact_kind（工具路由的输入）
- 为 `verification-checker` 提供 mandatory_checker_refs 激活清单
