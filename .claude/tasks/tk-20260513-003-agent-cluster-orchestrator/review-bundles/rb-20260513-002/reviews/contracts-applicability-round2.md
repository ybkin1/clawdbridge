# Contracts & Applicability Round 2 Review — rb-20260513-002

## Summary

**Verdict: Conditional Pass**

The yb contract architecture demonstrates strong structural integrity and clear intent. However, several high-severity inconsistencies, real-world applicability gaps, and coverage holes remain that must be addressed before the system can be considered production-grade for teams smaller than 10 people. The most critical issues are: (1) direct contradictions between `task-tracking-workflow-spec.md` and `mechanical-conditions.yaml` on the number of mechanical conditions; (2) the 50-line packet size limit being practically unenforceable for modern frameworks; (3) missing coverage for database migrations, API backward compatibility, and dependency security audits; (4) `config-sync-check` being insufficient to detect semantic drift; and (5) multiple checklist items that have no corresponding checker implementation.

---

## Findings (sorted by severity)

### Critical

#### C1: `task-tracking-workflow-spec.md` §4.2.1 claims 8 mechanical conditions, but `mechanical-conditions.yaml` defines 10 — and the spec text omits 2
- **Evidence**: `task-tracking-workflow-spec.md` §4.2.1 lists conditions 1-8 (phase_status_passed, gates_all_passed, primary_artifact_exists_nonempty, no_unresolved_blocker, dirty_hygiene_passed, state_freshness, mandatory_checkers_passed_or_excepted, auditor_verdict_audited). However, `mechanical-conditions.yaml` adds two more: `evidence_lock_exists` (id 9) and `closeout_not_already_allowed` (id 10).
- **Impact**: Agents reading the spec will believe only 8 conditions exist, miss `evidence_lock_exists` (which is hard-blocked for all phases except clarify), and fail to enforce Evidence Lock protocol. The `closeout_not_already_allowed` soft-blocker is completely undocumented in the spec.
- **Fix**: Update `task-tracking-workflow-spec.md` §4.2.1 to list all 10 conditions, document `evidence_lock_exists` as condition 9 (with clarify exemption), and document `closeout_not_already_allowed` as condition 10 (soft blocker).

#### C2: `review-gates-contract.md` §18.1 requires `Auditor verdict = audited` for gate passed, but `phase-state-machine.yaml` and `task-tracking-workflow-spec.md` §4.3 place `value` gate on `spec` and `acceptance` phases where no automated Auditor exists
- **Evidence**: `review-gates-contract.md` §18.1 says "Auditor verdict = audited → gate 不得 passed". `task-tracking-workflow-spec.md` §4.3 says `spec` phase requires `value + professional + contract` gates. `verification-checker.md` §11.1 defines Auditor as "只读验证" triggered at phase transition, gate verdict, and closeout. But `value` gate is inherently subjective ("是否仍要求下一位使用者重写关键内容才能使用?" — `review-gates-contract.md` §4.1). There is no mechanism for an automated Auditor to verify `value` gate.
- **Impact**: Either `value` gate can never pass (because Auditor cannot audit it), or the rule is silently ignored, eroding trust in the gate system.
- **Fix**: Clarify in `review-gates-contract.md` §18.1 that `value` gate is exempt from Auditor verification, or require `manual_verification_required` evidence (see `verification-checker.md` §13.4) as the equivalent audit artifact.

#### C3: `execution-traceability.md` §4.4 mandates 50-line packet size limit, but `packet-size-check` checker uses `cloc --by-file` which counts file-level lines, not packet-level lines
- **Evidence**: `execution-traceability.md` §4.4 says "默认上限: 50 行有效代码". The `packet-size-check` checker (`checkers/index.yaml`) says: "输入: `tasks/<task-id>/src/**/*`（代码文件）... 对每个代码文件运行语言适配的行数统计". A single file may contain multiple packets (e.g., `TaskManager.create`, `TaskManager.updateStatus` in one file). Conversely, a packet may span multiple files (e.g., controller + service + DTO).
- **Impact**: The checker will false-positive on files with multiple small functions (file > 50 lines, but each packet < 50 lines) and false-negative on multi-file packets (each file < 50 lines, but total packet > 50 lines). This makes the 50-line rule mechanically unenforceable.
- **Fix**: Redefine the checker to map files to packets via `@packet` annotation, sum lines per packet_id across files, and compare against `dev-plan.yaml` `estimated_lines`. Alternatively, change the rule from "per-packet" to "per-file" with explicit rationale.

---

### High

#### H1: `cluster-orchestration.md` §6.1 mandates multi-agent for ≥2 activity families, but `context-governance-contract.md` §5.1 requires sub-agent isolation for the same conditions — creating a circular dependency on context budget
- **Evidence**: `cluster-orchestration.md` §6.1 condition 1: "同一任务当前阶段同时包含 ≥2 个 substantive activity families → mandatory_multi_agent". `context-governance-contract.md` §5.1: "全仓库搜索、高噪音分析、多真相源综合、独立评审 → 必须隔离到子Agent线程". Both trigger on the same conditions. However, `context-governance-contract.md` §3 says context budget thresholds are 55%/70%/85%, and `cluster-orchestration.md` §6.1 condition 5 says "主线程预计上下文预算会因大批量文件读写...逼近 checkpoint 阈值" → mandatory_multi_agent.
- **Impact**: A task with 2 activity families and 60% context budget must spawn sub-agents (per cluster-orchestration), but spawning sub-agents consumes additional context budget for delegation plans, manifests, and fan-in reports (per context-governance). This can push the budget from 60% to 75%, triggering compaction, which may invalidate the manifest before fan-out completes.
- **Fix**: Add a "context budget reservation" protocol in `cluster-orchestration.md` §7.2: before fan-out, reserve 15% of context budget for delegation plan + manifest + fan-in report. If reservation would push budget over 70%, trigger compaction first, then fan-out.

#### H2: `registry.yaml` declares `cluster-orchestration` as `provisional`, but `lego-assembly-workflow.md` and `execution-traceability.md` both depend on it as a hard prerequisite
- **Evidence**: `registry.yaml` line 256: `cluster-orchestration: status: provisional`. `lego-assembly-workflow.md` line 8: `required_contracts: [cluster-orchestration, work-packet-governance, ...]`. `execution-traceability.md` line 9: `required_contracts: [lego-assembly-workflow, work-packet-governance, document-depth, verification-checker, review-gates]` (transitive dependency on cluster-orchestration via lego-assembly).
- **Impact**: A `provisional` contract should be "限定 scope + opt-in 时作参考" (`registry.yaml` line 12 comment). But build-phase contracts treat it as mandatory. This creates confusion about whether multi-agent orchestration is required or optional.
- **Fix**: Either promote `cluster-orchestration` to `active`, or add an exception path in `lego-assembly-workflow.md` for single-agent builds when `cluster-orchestration` is not loaded.

#### H3: `work-packet-governance.md` §2 mandates 12-layer decomposition for Complex tasks, but `lego-assembly-workflow.md` §4.1 defines only 5 lego levels (L0-L4) — creating a mapping gap
- **Evidence**: `work-packet-governance.md` §2 lists 12 layers: 需求边界, 数据结构, 持久化对象, 数据访问, 请求契约, 响应契约, 服务接口, 业务逻辑, 控制器入口, 集成接线, 验证回归, 可运维性. `lego-assembly-workflow.md` §4.1 maps these to L0-L4: L0=成品, L1=模块, L2=组件, L3=单元, L4=代码块. There is no explicit mapping of which work-packet layers map to which lego levels.
- **Impact**: A developer cannot determine whether "数据访问" (layer 4) is L2, L3, or L4. This leads to inconsistent decomposition trees and agent assignment matrices.
- **Fix**: Add an explicit mapping table in `lego-assembly-workflow.md` §4.1 or `work-packet-governance.md` §2.1, e.g.:
  - L1 (模块) ← 需求边界, 数据结构
  - L2 (组件) ← 持久化对象, 数据访问, 请求契约, 响应契约
  - L3 (单元) ← 服务接口, 业务逻辑, 控制器入口
  - L4 (代码块) ← 集成接线, 验证回归, 可运维性 (when they contain logic)

#### H4: `exception-governance.md` §5 lists 5 non-exemptible rules, but `review-gates-contract.md` §15 says "blocked 后静默推进" is also never allowed — yet this is not in `exception-governance.md` §5
- **Evidence**: `exception-governance.md` §5: "1. ownership 判定 2. 破坏性操作的用户确认 3. 权限不足的升级路径 4. formal review 的 reviewer 可追溯性 5. blocked 后静默推进". `review-gates-contract.md` §15: "以下场景永远不允许偏离: ... blocked 后静默推进". The text matches, but `review-gates-contract.md` §18.3 adds "主线程覆盖 Auditor verdict" as a blocked-level offense with `tamper_detected`, which is NOT listed in `exception-governance.md` §5.
- **Impact**: `exception-governance.md` claims to be the canonical list of non-exemptible rules, but `review-gates-contract.md` adds a 6th rule without updating it.
- **Fix**: Add "Auditor verdict tampering" as rule 6 in `exception-governance.md` §5, with cross-reference to `review-gates-contract.md` §18.3.

#### H5: `config-sync-check.js` only validates structural consistency (field presence, gate mapping, version fields) but does NOT validate semantic consistency (e.g., whether a checker's `gate_binding` matches the gate it is assigned to in `verification-checker.md`)
- **Evidence**: `config-sync-check.js` checks 10 things (core conditions present, phase-gate mapping, registry checker refs exist, sensitive patterns present, mcp capabilities, check types known, next-linkage consistency, active contract versions, config versions, role structure). It does NOT check:
  - Whether `checkers/index.yaml` `gate_binding` values match `verification-checker.md` §6 "Checker → Gate 映射表"
  - Whether `checklists/index.yaml` `stage` values match `task-tracking-workflow-spec.md` §4.3 phase names
  - Whether `registry.yaml` `checklist_refs` exist in `checklists/index.yaml`
  - Whether `mechanical-conditions.yaml` `check_type` values are actually implemented in the MCP enforcer
- **Impact**: A project can modify `.claude/config/*.yaml` to change a checker's gate binding from `professional` to `contract`, and `config-sync-check` will pass, but the semantic intent of the contract is violated.
- **Fix**: Extend `config-sync-check.js` with Check 11-14 for semantic cross-validation between config, checkers, checklists, and contracts.

---

### Medium

#### M1: Real-world applicability — the full 10-phase, 27-contract, 19-checker process is not viable for a 5-person startup or solo developer
- **Evidence**: The system has 10 phases (clarify → release-ready), 27 contracts (per `registry.yaml`), 19 checkers (10 existing + 7 execution-traceability + 1 atomicity + 1 config-sync), and mandates 2-4 independent review agents per Standard/Complex task. A typical startup PR (2-3 files, 100 lines) would require: task init → 7-step routing → delegation plan → manifest → fan-out → fan-in → evidence lock → auditor → 3-layer gate review → closeout. Estimated overhead: 30-60 minutes of agent time for a 10-minute code change.
- **Impact**: The system will be ignored or circumvented by small teams, leading to "shadow process" where developers skip formal steps and the contracts become dead text.
- **Mitigation**: Define a "minimum viable subset" explicitly:
  - **Solo/Trivial**: `intent-capture` → `task-tracking` (self-review) → `dirty-hygiene` → closeout. Skip all multi-agent, all gates except self-check, all evidence locks.
  - **Small team/Standard**: `intent-capture` → `task-tracking` → `review-gates` (professional only, 1 reviewer) → `dirty-hygiene` → closeout. Skip `execution-traceability`, `lego-assembly`, `cluster-orchestration`.
  - **Large team/Complex**: Full stack.
  This should be documented in `CLAUDE.md` or a new `applicability-guide.md` contract.

#### M2: Coverage gap — no contract covers database migration review, API backward compatibility, or dependency security audit
- **Evidence**: Searched all 27 contracts. None mention:
  - Database schema migration safety (rollback, data integrity, zero-downtime)
  - API backward compatibility (breaking changes, deprecation policy, version negotiation)
  - Dependency security audit (CVE scanning, license compliance, supply chain)
  - Infrastructure-as-Code review (Terraform state safety, blast radius)
- **Impact**: These are common software engineering scenarios that can cause production incidents. Their absence means the contract system provides no guidance for critical operational tasks.
- **Fix**: Add three new contracts (or extend `engineering-standards`):
  - `migration-governance`: migration rollback, data validation, staging verification
  - `api-compatibility-contract`: breaking change detection, deprecation timeline, consumer notification
  - `dependency-security-contract`: CVE threshold, license whitelist, SBOM generation

#### M3: `checkers/index.yaml` lists 19 checkers, but `verification-checker.md` §5 "最小 Checker Catalog" only lists 11 — and 4 of those 11 are not in `checkers/index.yaml`
- **Evidence**: `verification-checker.md` §5 lists: route-output-closure-check, state-projection-alignment-check, review-consistency-check, dirty-chain-prevention-check, dirty-hygiene-closure-check, dangling-reference-check, stale-projection-cleanup-check, subagent-orchestration-check, context-budget-delegation-check, compaction-trigger-closure-check, architecture-decomposition-check. The last one (`architecture-decomposition-check`) does NOT appear in `checkers/index.yaml`. Conversely, `checkers/index.yaml` has 7 execution-traceability checkers + atomicity-check + config-sync-check that are not in `verification-checker.md` §5.
- **Impact**: `verification-checker.md` claims to define the "最小 Checker Catalog" but is missing 9 checkers. This makes it an unreliable reference for "what checkers must exist".
- **Fix**: Update `verification-checker.md` §5 to include all 19 checkers from `checkers/index.yaml`, or split into "core catalog" (11) and "extended catalog" (8).

#### M4: `review-gates-contract.md` §4.5 mandates 8 dimensions for design-doc review with 3 agents, but `stage4-design-review.md` only lists 8 dimensions without agent allocation guidance
- **Evidence**: `review-gates-contract.md` §4.5 says "设计文档: 8 维度, 3 Agent, 每个 Agent 最多 3 维度". `stage4-design-review.md` lists 8 dimensions (安全纵深, 边界条件, 并发安全, 资源限定, 环境声明, 内部一致性, PRD×Design 对齐, 设计规范符合性) but does not say which dimensions go to which agent. The "维度不可合并规则" says one agent max 3 dimensions, but 8 dimensions / 3 agents = 2.67, so one agent must take 3, two agents take 2 or 3. There are multiple valid allocations.
- **Impact**: Without explicit allocation, different orchestrators will assign dimensions differently, leading to inconsistent coverage.
- **Fix**: Add a default allocation table in `stage4-design-review.md` or `review-gates-contract.md` §4.5, e.g.:
  - Agent A: 安全纵深 + 边界条件 + 并发安全
  - Agent B: 资源限定 + 环境声明 + 内部一致性
  - Agent C: PRD×Design 对齐 + 设计规范符合性

#### M5: `dirty-hygiene-spec.md` §5 defines a 5-state machine (clean → dirty_detected → recovering/blocked/stale → clean), but `task-tracking-workflow-spec.md` §4.2.1 condition 5 only checks `dirty-hygiene-closure-check` result = passed — with no state machine integration
- **Evidence**: `task-tracking-workflow-spec.md` §4.2.1 condition 5: "脏数据/脏链路已清理 → `checkers/dirty-hygiene-closure-check` result = passed". `dirty-hygiene-spec.md` §5 defines states `dirty_detected`, `recovering`, `blocked`, `stale`. But `00-task-state.yaml` schema (in `task-tracking-contract.md` §4) has no `dirty_hygiene_status` field.
- **Impact**: The state machine exists in theory but has no machine-readable representation. An agent could set `dirty-hygiene-closure-check = passed` while `dirty_hygiene_status = recovering` (inconsistent).
- **Fix**: Add `dirty_hygiene_status` to `00-task-state.yaml` schema in `task-tracking-contract.md` §4, and update `task-tracking-workflow-spec.md` §4.2.1 to require `dirty_hygiene_status == clean` (not just checker passed).

---

### Low

#### L1: `registry.yaml` has duplicate `storage-location` entry in the "关键契约索引" table of `CLAUDE.md`
- **Evidence**: `CLAUDE.md` "关键契约索引" table lists `storage-location` twice (rows 22 and 23).
- **Fix**: Remove duplicate row.

#### L2: `checkers/index.yaml` lists `design-plan-bidirectional-ref-check` as `implementation_status: implemented`, but the script is a `.sh` file that likely has no actual implementation (placeholder)
- **Evidence**: All execution-traceability checkers in `checkers/index.yaml` have `implementation_status: implemented`. However, `verification-checker.md` §10.2 says: "对于 7 个未实现 checker... 脚本不存在时，Agent 必须创建 `checker_result.yaml` 且 `status: manual_pending`". This implies at least some of the 7 execution-traceability checkers were originally placeholders. The `.sh` files exist (`design-plan-bidirectional-ref-check.sh`, etc.) but their content is not reviewed here. If they are stubs, `implementation_status` should be `placeholder`.
- **Fix**: Audit all 7 execution-traceability `.sh` scripts. If any are stubs, set `implementation_status: placeholder` in `checkers/index.yaml`.

#### L3: `task-directory-tree-spec.md` is referenced in `registry.yaml` but was not in the review file list — and its content is not reviewed here
- **Evidence**: `registry.yaml` includes `task-directory-tree` as an active contract. The review instructions did not include it. This is a minor coverage gap in the review scope, not a contract issue per se.
- **Fix**: Future reviews should include `task-directory-tree-spec.md` and `file-naming-spec.md`.

#### L4: `context-compaction-spec.md` is active but not reviewed — its 55/70/85 thresholds may conflict with `cluster-orchestration.md` fan-out budget requirements
- **Evidence**: `registry.yaml` shows `context-compaction: status: active`. The review instructions did not include it. Given finding H1 about context budget circularity, this contract is likely relevant.
- **Fix**: Include `context-compaction-spec.md` in the next review round, specifically checking for conflicts with `cluster-orchestration.md`.

---

### Informational

#### I1: The system has strong anti-tampering measures (Auditor verdict immutable, `tamper_detected` → `blocked`) but no defined recovery path after `tamper_detected`
- **Evidence**: `review-gates-contract.md` §18.3: "主线程覆盖 Auditor verdict → `blocked` + `tamper_detected`". `task-tracking-workflow-spec.md` §4.2.4: "task 自动进入 `blocked` 状态". Neither document explains how to recover from `tamper_detected`.
- **Suggestion**: Add a "tamper recovery protocol" in `exception-governance.md` or `task-tracking-workflow-spec.md`: user must acknowledge the override, a new Auditor must be appointed from a different agent pool, and the task must re-audit from the last known clean checkpoint.

#### I2: The "7 阶段" model in `CLAUDE.md` and `lego-assembly-workflow.md` maps to 10 phases in `task-tracking-contract.md`, but the mapping table (§8) is incomplete — it omits `architecture-decomposition` and `release-ready`
- **Evidence**: `task-tracking-contract.md` §8 maps 7 stages to phases but only lists: 1→research, 2→architecture-decomposition, 3→spec, 4→design, 5→plan, 6→build, 7→verify. It omits `clarify`, `acceptance`, and `release-ready` from the 7-stage model. `lego-assembly-workflow.md` §4.2 also uses a 7-stage model but does not map to phases at all.
- **Suggestion**: Unify on either 7 stages or 10 phases. If keeping both, provide a complete bidirectional mapping table.

#### I3: `scenario-traceability-spec.md` is extremely detailed (platform matrices, harness extensions, shallow-walkthrough hard-fail conditions) but has no corresponding checker — making it entirely manual
- **Evidence**: `scenario-traceability-spec.md` defines 9 issue types, 10 hard-fail conditions, platform matrices for Android/PWA/HarmonyOS/Tauri/FastAPI, and security scene requirements. But `checkers/index.yaml` has no checker for scenario traceability. The closest is `stage6-coding-review.md` checklist, which references the spec but provides no automation.
- **Suggestion**: Consider a `scenario-traceability-check` hybrid checker that validates: (1) `scenario-traceability.md` file exists, (2) minimum scenario catalog is present, (3) code location references are valid file paths, (4) no shallow-walkthrough conditions are triggered.

---

## Recommendations

### Immediate (before next release)
1. **Fix C1**: Update `task-tracking-workflow-spec.md` §4.2.1 to document all 10 mechanical conditions.
2. **Fix C2**: Clarify `value` gate Auditor exemption in `review-gates-contract.md`.
3. **Fix C3**: Redefine `packet-size-check` to operate on packet_id aggregates, not files.
4. **Fix H4**: Add "Auditor verdict tampering" to `exception-governance.md` §5.

### Short-term (next 2 weeks)
5. **Fix H1**: Add context budget reservation protocol to `cluster-orchestration.md`.
6. **Fix H2**: Promote `cluster-orchestration` to `active` or add fallback path in `lego-assembly-workflow.md`.
7. **Fix H3**: Add explicit 12-layer → L0-L4 mapping table.
8. **Fix H5**: Extend `config-sync-check.js` with semantic cross-validation (Check 11-14).
9. **Fix M3**: Synchronize `verification-checker.md` §5 with `checkers/index.yaml`.
10. **Fix M5**: Add `dirty_hygiene_status` to `00-task-state.yaml` schema.

### Medium-term (next month)
11. **Address M1**: Publish a "minimum viable subset" guide for solo/small-team usage.
12. **Address M2**: Draft `migration-governance`, `api-compatibility-contract`, and `dependency-security-contract`.
13. **Address M4**: Add default dimension allocation table for design-doc review.
14. **Address I1**: Define `tamper_detected` recovery protocol.
15. **Address I3**: Design `scenario-traceability-check` hybrid checker.

### Ongoing
16. Run `config-sync-check` after every `.claude/config/*.yaml` modification, but treat it as a necessary-not-sufficient condition. Add a manual "semantic diff review" step for config changes.
17. Establish a quarterly contract consistency audit (like this review) as a formal process, with findings tracked in `.claude/contracts/feedback.yaml`.
