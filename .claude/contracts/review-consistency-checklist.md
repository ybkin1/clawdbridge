---
contract_id: "review-consistency-checklist"
title: "审查一致性清单"
owner: "claude-code"
scope: "评审Agent的结构化一致性检查清单，确保state/review pack/provenance/report不自相矛盾"
trigger: "每次正式评审完成后，用于校验评审结论的一致性"
required_inputs: ["review-gates评审报告", "task-tracking状态"]
required_contracts: ["review-gates", "task-tracking"]
required_skills: []
verification_checks: ["truth-consistency", "route-consistency", "independence-consistency", "finding-closure", "dirty-chain-consistency", "verification-exception-consistency", "readme-closeout-consistency", "orchestration-context-consistency", "10-automated-checks"]
exceptions: []
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 审查一致性清单（Review Consistency Checklist）

## 1. 目的

为评审 Agent 提供结构化的一致性检查清单，确保 state / review pack / provenance / report 不自相矛盾。

## 2. 真相一致性

- [ ] `00-task-state.yaml` 的 active bundle / gate 与 review report 一致
- [ ] `last_review_report` 指向当前最新正式结论
- [ ] 兼容字段没有与主真相冲突
- [ ] 若 decision=state_sync_pending，存在对应 leader formal state sync 证据

## 3. 路由一致性

- [ ] 路由投影存在且与当前 gate bundle 一致
- [ ] review_pack_profile、maturity_target 在路由、评审包、评审报告之间一致
- [ ] required_gates、value_gate_policy、active_contract_set 以 state 为主真相

## 4. 独立性一致性

- [ ] reviewer identity 可验真
- [ ] blind review pack 未污染
- [ ] 主线程确实执行了多子Agent分工，不是只挂名并行
- [ ] reviewer / author / reviser 三者隔离可证明

## 5. Finding 闭环

- [ ] 每个 finding 有类别
- [ ] 每个 finding 有 open|closed|deferred|blocked 状态
- [ ] same-class streak 可追踪
- [ ] 第 3 轮未消除时已 blocked

## 6. 脏数据/脏链路一致性

- [ ] active `state → review pack → report → provenance → handoff` 链无悬空/错指
- [ ] temp artifact、失败 bundle、旧 projection 已清理或显式标记 stale
- [ ] 若检测到脏数据，dirty_hygiene_status 不得写 clean
- [ ] dirty_hygiene_status 在 dirty_detected/recovering/blocked 时不得把 bundle/gate 写成 passed

## 7. 验证/异常一致性

- [ ] checker results、manual verification、exception ledger 与真相源引用一致
- [ ] verification_mode != checker 时，manual_verification_ref 存在且被消费
- [ ] exception_refs 非空时，exception-ledger 存在并能回链补偿控制

## 8. README/收口一致性

- [ ] readme_requirement.status=required 时，task-root README 存在且能回链 intent/state/handoff
- [ ] 收口前 report 明确引用了 registry / checker / manual verification 证据

## 9. 编排与上下文治理

- [ ] execution_orchestration_route 与当前阶段真实 activity families 一致
- [ ] delegation_plan_ref 与实际多子Agent分工一致
- [ ] parallelism_actual >= 2 时，存在 aggregation_artifact_path
- [ ] 未达最低并行度时已记录 parallelism_exception_reason
- [ ] context_budget_status 与 context_budget_percent_estimate 不自相矛盾
- [ ] 需要压缩时，last_compaction_receipt_path 或 checkpoint 已存在

## 10. 自动化检查最小集合

> 完整 checker catalog（含 mode/scope/failure_semantics/gate_binding）见 `verification-checker.md` §5。以下列出适用于 review 一致性的 checkers，引用相同 checker_id：

| checker_id | gate_binding |
|-----------|-------------|
| `review-consistency-check` | contract gate |
| `dirty-chain-prevention-check` | professional gate, contract gate |
| `dirty-hygiene-closure-check` | contract gate |
| `dangling-reference-check` | professional gate |
| `stale-projection-cleanup-check` | contract gate |
| `subagent-orchestration-check` | professional gate |
| `context-budget-delegation-check` | professional gate |
| `compaction-trigger-closure-check` | contract gate |

此外，review 一致性特有但尚未录入 checker catalog 的检查项：

| 检查项 | 检查面 |
|--------|--------|
| `requirements-traceability-check` | 需求→设计→计划→实现→测试→验收闭合 |
| `document-quality-check` | 是否只有口号没有案例/动作 |
| `context-bundle-minimization-check` | bundle 是否优先消费 refs 而非全量历史 |
