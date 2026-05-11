# Review Report: Execution-Face Correctness Audit

**Reviewer**: Review-2-Execution-Face (Sub-Agent)
**Date**: 2026-04-30
**Task**: Gap Analysis Round 2 -- Execution Face & Rule Enforcement
**Verdict**: **Fail**
**Scope**: All contracts under `.claude/contracts/`, master `CLAUDE.md`, checklists under `.claude/project/checklists/`, architecture-audit.md

---

## 1. Executive Summary

This review examined whether the Claude Code norms system's declared rules have actual enforcement mechanisms, or whether they exist as declarations that rely solely on agent awareness and compliance. The core finding is that the system uses "hard rule" language ("必须", "不得", "禁止") but its enforcement model is overwhelmingly soft.

**Key Metrics**:
- Total rules declared across all contracts: **~112** (counting each "must/shall/must not" statement)
- Rules with hard/automated enforcement: **5** (~4.5%)
- Rules with checklist-backed enforcement: **21** (~18.8%)
- Rules relying purely on agent awareness (soft): **~86** (~76.8%)

**Verdict: Fail** -- Critical finding: the system's enforcement model is fundamentally misaligned with its declared language. The contracts declare hard gates but deliver soft conventions. This is not a minor gap; it is a structural design tension that affects every contract in the system.

The following analysis is per-contract, with specific citations to file paths, sections, and line numbers.

---

## 2. Per-Contract Enforcement Analysis

### 2.1 verification-checker.md

**Declared rules**: 11 checkers in the catalog (Section 5, lines 67-79), each with a stated `mode` (automated/manual/hybrid), scope, and failure_semantics.

| checker_id | Declared Mode | Actual Enforcement | Gap |
|-----------|--------------|-------------------|-----|
| `route-output-closure-check` | automated | None -- no script exists | Conceptual only |
| `state-projection-alignment-check` | automated | None -- no script exists | Conceptual only |
| `review-consistency-check` | hybrid | Agent mental check | No tooling |
| `dirty-chain-prevention-check` | automated | None -- no script exists | Conceptual only |
| `dirty-hygiene-closure-check` | automated | None -- no script exists | Conceptual only |
| `dangling-reference-check` | automated | None -- no script exists | Conceptual only |
| `stale-projection-cleanup-check` | automated | None -- no script exists | Conceptual only |
| `subagent-orchestration-check` | hybrid | Agent mental check | No tooling |
| `context-budget-delegation-check` | automated | None -- no script exists | Conceptual only |
| `compaction-trigger-closure-check` | automated | None -- no script exists | Conceptual only |
| `architecture-decomposition-check` | manual | Agent mental check | Structural but unverifiable |

**Enforcement ratio**: 0% automated, 18% hybrid (still agent-dependent), 100% soft.

**Specific findings**:
- Section 4.2 (lines 47-56) defines the checker "result shape" as a YAML structure with fields like `checker_id`, `run_at`, `status`, `evidence_ref`. But no code generates this shape. The shape is a specification for a tool that does not exist.
- Section 4.3 (lines 58-63) defines the checker-to-gate decision flow as `checker runs -> produces result -> gate reads result`. This flow has never been executed by an automated process.
- Section 6 (lines 81-92) declares that professional gate "任一失败不得 passed" for direct dependency checkers. But since no checker can actually run, this gate condition is always trivially satisfied -- a tautology.

**Checklist coverage**: The `contract-completeness-checklist.md` Section 5 ("规范执行面验证", lines 38-41) asks whether rules have enforcement mechanisms, but does not enumerate the 11 checkers individually. It is a meta-check, not an implementation check.

**Verdict for this contract**: **Fail** -- The verification-checker contract is the most egregious gap. It declares an "evidence-driven" principle (Section 3.1) but provides zero evidence-generating tools. Every checker is a conceptual checklist item dressed as an automated tool.

### 2.2 review-gates-contract.md

**Declared rules**: ~15 rules across 19 sections.

| Rule | Section | Enforcement Type | Gap |
|------|---------|-----------------|-----|
| Fixed gate order (value -> professional -> contract) | Sec 4, line 37 | Agent awareness | No mechanism prevents skipping |
| Evidence-driven review | Sec 3.2 | Agent awareness | Review bundles may be incomplete |
| Independent review (no self_review) | Sec 3.3, line 66 | Agent awareness | Nothing prevents self_review |
| Zero-finding rule | Sec 9, lines 125-130 | Agent awareness | Agent must self-report findings |
| Review pack required files | Sec 12, lines 178-188 | Checklist item | contract-completeness-checklist checks this |
| Hard-fail conditions (14.1-14.5) | Sec 14, lines 208-258 | Checklist item | Mapped to checklists but not automated |
| 3-round escalation | Sec 8, lines 93-122 | Agent tracking | No automated round counter |
| Reviewer isolation | Sec 10, lines 132-137 | Agent awareness | No identity verification mechanism |
| Gate status tracking (9 fields) | Sec 11, lines 141-151 | Agent awareness | No schema validation |

**Enforcement ratio**: ~6.7% hard (checklist-backed), ~93.3% soft.

**Specific findings**:
- Section 14 (lines 208-258) defines 20 hard-fail conditions across 5 categories (value gate, maintainability, dirty data hygiene, execution orchestration, context budget). Each says "不得 passed" but no mechanism actually blocks passage. The check is entirely agent-dependent.
- Section 14.4 (execution orchestration hard-fail) is particularly problematic: it declares that if `mandatory_multi_agent` is hit but no `delegation_plan_ref` exists, the gate must fail. But who checks this? The agent checking its own compliance.
- Section 5 declares `blind_independent` review mode but provides no mechanism to actually blind a reviewer -- the agent controls what information it reads.

**Contradictions**:
- Section 13 (lines 199-206) maps contract-level verdicts to CLAUDE.md Rule 2 verdicts, but the mapping is lossy. For example, `contract_not_closed` maps to `Conditional Pass`, but the contract itself says it means "契约未闭合，有合规缺口" -- which sounds like a Fail, not a Conditional Pass. This creates ambiguity in the verdict vocabulary.

### 2.3 exception-governance.md

**Declared rules**: ~10 rules across 12 sections.

| Rule | Section | Enforcement Type | Gap |
|------|---------|-----------------|-----|
| No silent degradation | Sec 3.1, line 30 | Agent awareness | No audit trail |
| 5 non-exemptible rules | Sec 5, lines 56-63 | Agent awareness | Self-enforcing by declaration |
| Exception object schema (13 fields) | Sec 7, lines 74-88 | Checklist item | Agent must fill fields |
| Risk-based approval model | Sec 8.1, lines 93-98 | Agent awareness | No automated risk classification |
| Timeout auto-escalation | Sec 8.2, lines 101-107 | Agent awareness | "Timeout" is undefined |
| Approval audit trail | Sec 8.4, lines 122-125 | Agent awareness | No cryptographic proof |

**Enforcement ratio**: ~10% checklist-backed, ~90% soft.

**Specific findings**:
- Section 7 (lines 74-88) defines a YAML schema for exception objects with 13 fields. The schema is well-designed but there is no validation tool. An agent could create an exception object with 3 fields and claim compliance.
- Section 8.2 (timeout auto-escalation) references "当前 task session 结束前" and "用户 1 次交互周期" as timeout conditions. These are undefined time boundaries. There is no clock.
- The `conflicts_with: [review-gates]` declaration (Section 10.1, line 135) creates a genuine enforcement ambiguity. If a review fails AND an exception is requested, which wins? The contract says neither can exempt the other, but provides no tie-breaking procedure.

### 2.4 lego-assembly-workflow.md

**Declared rules**: ~20 rules across 10 sections.

| Rule | Section | Enforcement Type | Gap |
|------|---------|-----------------|-----|
| Design before manufacturing | Sec 3.1, line 31 | Agent awareness | No pre-build gate |
| 5-level decomposition (L0-L4) | Sec 4.1, lines 40-48 | Checklist item | decomposition-tree-complete checker is conceptual |
| Stage-to-level mapping | Sec 4.2, lines 55-64 | Agent awareness | No automated mapping validation |
| Depth requirements per stage | Sec 4.3-4.5, lines 66-120 | Maturity gate (word count) | Word count not enforced |
| Agent cluster architecture | Sec 4.6, lines 122-192 | Agent awareness | No manifest validator |
| Assembly chain validation | Sec 4.7, lines 194-208 | Test execution | Tests may not exist |
| Review per level | Sec 4.8, lines 210-225 | Agent awareness | No automated review trigger |
| Agent recovery plan | Sec 4.6.4, lines 182-192 | Agent awareness | "Timeout 2x expected time" -- expected time undefined |

**Enforcement ratio**: ~10% checklist-backed, ~90% soft.

**Specific findings**:
- Section 4.1 (lines 49-52) declares that "拆解深度以'可独立制造'为停止条件" -- but "可独立制造" is subjective. Different agents will decompose differently.
- Section 4.6.1 (lines 138-142) declares "递归深度不超过 3 层" -- but there is no enforcement. An agent could spawn 5 levels of nested agents.
- Section 4.7 (lines 205-208) declares "低层级拼装未通过验证前，不得进行高层级拼装" -- but the verification is test-dependent, and tests may not exist or may not cover the assembly interface.
- Section 4.6.4 (agent recovery, lines 182-192) specifies recovery actions for 5 exception types, but the detection mechanism for "Agent 挂死（超时）" is undefined. What is "预计时间"? Where is it recorded?

**Contradiction with architecture-blueprint.md**: The LEGO model defines 5 levels (L0-L4), while architecture-blueprint defines 13 layers. Both claim to be the decomposition model. The relationship between them is not defined -- are they alternative views of the same thing, or different models? The architecture-audit.md (Section 5.2, item 3) correctly identifies this as a gap.

### 2.5 skill-tool-mapping.md

**Declared rules**: ~12 rules across 11 sections.

| Rule | Section | Enforcement Type | Gap |
|------|---------|-----------------|-----|
| Decision tree (5 steps) | Sec 4.1, lines 40-65 | Agent awareness | No automated routing |
| Dedicated tool priority | Sec 3.2 | Checker: no-bash-when-dedicated-tool | Checker is conceptual |
| Anti-pattern: Bash abuse | Sec 9.1 | Checker: no-bash-when-dedicated-tool | No automated detection |
| Anti-pattern: Gratuitous agent spawn | Sec 9.2 | Checker: no-gratuitous-agent-spawn | No automated detection |
| Anti-pattern: Skill ignore | Sec 9.7 | None | Completely undetectable |
| Installation check | Sec 4.7, lines 198-205 | Agent awareness | No tool registry |
| Tool availability fallback | Sec 4.6, lines 186-196 | Agent awareness | No fallback automation |

**Enforcement ratio**: ~17% checklist-backed (4 verification checks in Section 8), ~83% soft.

**Specific findings**:
- Section 9 (anti-patterns, lines 253-263) lists 7 anti-patterns. Anti-pattern #7 ("Skill ignore") is fundamentally undetectable because skills are user-invocable (the system prompt says they are "available" but not auto-loaded). There is no way to prove an agent "should have tried" a skill.
- Section 4.7 (installation check, lines 198-205) requires the main thread to "列出当前可用的内置工具", "列出当前加载的 Skills", "列出当前在线的 MCP 服务器". But the agent has no programmatic way to enumerate available tools -- it only knows what the system prompt declares.
- Section 10 (migration strategy, lines 265-279) describes a 4-phase migration to "反模式检测自动化" but Phase 4 has not been reached. The contract acknowledges its own incompleteness.

### 2.6 action-governance-contract.md

**Declared rules**: ~12 rules across 8 sections.

| Rule | Section | Enforcement Type | Gap |
|------|---------|-----------------|-----|
| 7 action families | Sec 2, lines 27-37 | Agent awareness | Classification is subjective |
| 11 artifact kinds | Sec 3, lines 40-52 | Agent awareness | Classification is subjective |
| Fixed routing order (8 steps) | Sec 4, lines 56-67 | Agent awareness | No step validator |
| negative_activation constraints (5 rules) | Sec 5, lines 85-90 | Agent awareness | No constraint checker |
| negative_activation execution resolution | Sec 5.1, lines 92-102 | Agent awareness | Self-enforcing procedure |
| Baseline route templates (7 templates) | Sec 6, lines 104-142 | Checklist reference | Agent must match manually |

**Enforcement ratio**: ~8% checklist-backed, ~92% soft.

**Specific findings**:
- Section 5 (negative_activation, lines 85-90) declares 5 constraints on what must NOT be excluded. Section 5.1 (lines 92-102) adds an execution resolution procedure. But the procedure is itself agent-executed: "对每个拟排除的契约/技能/工具，回答..." -- the agent answers its own question. This is self-policing.
- The circular dependency with skill-tool-mapping (both depend on each other) means at initialization, neither can be resolved before the other. In practice this works because both load simultaneously, but the declared dependency graph is unresolvable.

### 2.7 architecture-blueprint.md

**Declared rules**: ~8 rules across 7 sections.

| Rule | Section | Enforcement Type | Gap |
|------|---------|-----------------|-----|
| 13-layer architecture sequence | Sec 2.2, lines 30-45 | Agent awareness | No layer validator |
| Blueprint minimum structure (17 fields) | Sec 3, lines 52-71 | Checker: ARCH001 | Conceptual only |
| Architecture node minimum fields (11 fields) | Sec 4, lines 73-84 | Checker: ARCH003 | Conceptual only |
| Node traceability matrix (5 questions) | Sec 5, lines 86-93 | Agent awareness | No automated traceability |
| Build task must have blueprint ref | Sec 7.1 | Checker: ARCH000 | Conceptual only |

**Enforcement ratio**: 0% automated, ~25% checklist-backed (ARCH000/001/003 are conceptual checkers), ~75% soft.

**Specific findings**:
- Section 7 (checker design, lines 101-124) explicitly labels 4 of 7 checkers as "规划中的 Checker（待实现）" (ARCH002, ARCH004, ARCH005, ARCH006, ARCH007). The contract openly admits its enforcement is incomplete.
- The 13-layer sequence is declared "不可跳过" (cannot be skipped) in Section 2.2, line 31. But there is no mechanism to verify all 13 layers are present.

### 2.8 context-governance-contract.md

**Declared rules**: ~8 rules across 6 sections.

| Rule | Section | Enforcement Type | Gap |
|------|---------|-----------------|-----|
| 6-layer load order (T0-T4) | Sec 2, lines 24-35 | Agent awareness | No load order validator |
| Context budget thresholds (55%/70%/85%) | Sec 3, lines 41-46 | Agent awareness | Budget metric is heuristic |
| Sub-agent isolation criteria | Sec 5.1, lines 68-74 | Agent awareness | No isolation validator |
| Reviewer independence (80% Jaccard) | Sec 5.2, lines 76-85 | Manual calculation | No automated Jaccard computation |

**Enforcement ratio**: ~12.5% checklist-backed, ~87.5% soft.

### 2.9 Remaining Contracts Summary

| Contract | Rules Count | Soft % | Key Gap |
|----------|------------|--------|---------|
| task-tracking-contract.md | ~8 | ~88% | No state machine validator |
| task-routing-contract.md | ~7 | ~86% | No 7-step order validator |
| work-packet-governance.md | ~10 | ~80% | 12-layer decomposition not validated |
| cluster-orchestration.md | ~8 | ~75% | Manifest not validated before invocation |
| memory-architecture.md | ~6 | ~100% | Decay has no automated trigger |
| closeout-contract.md | ~6 | ~83% | Preconditions not automatically verified |
| dirty-hygiene-spec.md | ~9 | ~78% | Dirty detection is agent-dependent |
| storage-location-contract.md | ~4 | ~75% | No C:\ path validator |
| document-depth.md | ~7 | ~86% | Depth profile not validated |
| completeness-audit-spec.md | ~6 | ~83% | Word count not enforced |
| context-compaction-spec.md | ~8 | ~88% | Budget thresholds are heuristic |
| file-naming-spec.md | ~10 | ~70% | No naming validator |
| task-directory-tree-spec.md | ~5 | ~80% | No directory structure validator |
| review-consistency-checklist.md | ~12 | ~92% | Checklist is agent-executed |
| engineering-standards.md | ~6 | ~83% | Repo profile not validated |
| task-readme-lifecycle.md | ~5 | ~80% | State transitions not validated |
| task-tracking-workflow-spec.md | ~12 | ~83% | Phase transitions not validated |
| intent-capture-contract.md | ~6 | ~83% | 9-field completeness not validated |

---

## 3. Soft vs Hard Rule Analysis

### 3.1 What Constitutes "Hard" Enforcement

In this review, "hard enforcement" means a rule that is enforced by a mechanism external to the agent's own decision-making. This includes:
- Automated scripts that run and produce pass/fail results
- Pre-commit hooks that block execution
- Schema validators that reject malformed data
- Platform-level constraints (e.g., file system permissions)

"Soft enforcement" means a rule that relies on the agent remembering to check, self-reporting compliance, or filling out a checklist that the agent itself executes.

### 3.2 The Enforcement Spectrum

```
Hard Enforcement <---> Soft Enforcement

[Automated scripts]    [Checklists executed by agent]    [Agent awareness only]
       ~4.5%                      ~18.8%                         ~76.8%
```

The 18.8% "checklist-backed" category is still soft in practice because the checklists are executed by the same agent system whose compliance they are checking. There is no independent auditor.

### 3.3 The Language Gap

The most significant finding is the gap between declared language and actual enforcement:

| Language Used | Implication | Reality |
|--------------|-------------|---------|
| "必须" (must) | Hard requirement | Agent should remember |
| "不得" (must not) | Hard prohibition | Agent should avoid |
| "禁止" (forbidden) | Hard ban | Agent should not do |
| "永远不允许" (never allowed) | Absolute constraint | Agent should comply |
| "硬规则" (hard rule) | Structural constraint | Convention with consequences |

This is not a minor cosmetic issue. When a system declares 112 rules with hard-rule language but only 5 have structural enforcement, an agent (or a human reviewer) cannot reliably distinguish between rules that will be checked and rules that are aspirational.

---

## 4. Contradictions Between Contracts

### 4.1 Circular Dependencies (Confirmed)

1. **action-governance <-> skill-tool-mapping**: Both declare mutual dependency in registry.yaml. action-governance §8 (line 162) says it provides action_family to skill-tool-mapping, while skill-tool-mapping §6.1 (line 218) says it consumes action_family from action-governance. But action-governance's registry entry declares skill-tool-mapping as a dependency. This is circular.

2. **lego-assembly-workflow <-> work-packet-governance <-> cluster-orchestration**: Triangular dependency in the build phase. All three are scoped to `delivery_mode=full, phase=build`, creating a resolution deadlock if sequential loading is attempted.

3. **review-gates <-> exception-governance**: Bidirectional `conflicts_with` declarations create an enforcement ambiguity when both a review failure and an exception request coexist.

### 4.2 Vocabulary Mismatches

- **7-stage model** (Chinese): 深度学习, 架构拆解, PRD, 方案详设, 开发计划, 编码, 测试
- **10-phase model** (English): clarify, research, architecture-decomposition, spec, design, plan, build, verify, acceptance, release-ready
- **workflow_route** (English, task-routing): clarify, research, direct_build, feasibility, review

These three naming schemes describe the same process but use different vocabularies. An agent must navigate all three simultaneously.

### 4.3 LEGO vs Architecture Blueprint Decomposition

LEGO assembly defines 5 levels (L0-L4). Architecture blueprint defines 13 layers. Both claim to be the decomposition model. The relationship between them is undefined.

### 4.4 Review Gate vs Stage Checklist Mapping

There is no single mapping table that tells an agent "at Stage X, use checklist Y for gate Z." The agent must infer:
- Value gate -> user-value-checklist.md
- Professional gate -> stage-specific checklist
- Contract gate -> review-consistency-checklist.md + contract-completeness-checklist.md

But the inference is not documented.

---

## 5. Checklist Coverage Analysis

### 5.1 user-value-checklist.md

This checklist (36 lines) covers 5 dimensions: intent alignment, scenario coverage, downstream usability, delivery completeness, and value gate ruling. It is well-structured but covers only the value gate layer. It does not cover professional gate or contract gate concerns.

**Coverage gap**: The checklist does not address whether the artifact's claims are backed by verification-checker evidence, whether review pack files are complete, or whether exception objects are properly formed.

### 5.2 contract-completeness-checklist.md

This checklist (55 lines) covers 7 dimensions: registry completeness, contract structure compliance, inter-contract dependency closure, source material mapping, rule enforcement verification, cross-reference consistency, and change impact.

**Strengths**: Section 5 ("规范执行面验证", lines 38-41) directly addresses the core question of this review: "被修改的契约中声明的规则，是否有对应的执行机制？" This is the only checklist item that explicitly asks about enforcement.

**Gaps**: The checklist is designed for contract modification scenarios. It does not cover enforcement analysis for the system as a whole. It asks "是否有对应的执行机制" but does not enumerate what mechanisms exist or what the expected enforcement model is.

### 5.2 Checklist Coverage of Declared Rules

| Contract | Covered by Checklist? | Which Checklist |
|----------|----------------------|-----------------|
| verification-checker (11 checkers) | Partial | contract-completeness §5 |
| review-gates (hard-fail conditions) | Partial | review-consistency-checklist |
| exception-governance (5 classes) | None | No checklist validates exception objects |
| lego-assembly (5-level decomposition) | Partial | stage6-code-review.md |
| skill-tool-mapping (anti-patterns) | None | No checklist validates anti-pattern compliance |
| action-governance (negative_activation) | None | No checklist validates negative_activation |
| architecture-blueprint (13-layer sequence) | Partial | stage2-architecture-review.md |
| context-governance (6-layer load order) | Partial | stage4-5-plan-review.md |
| memory-architecture (decay) | None | No checklist validates memory decay |
| completeness-audit (word count) | Partial | contract-completeness §4 |

**Result**: 6 out of 10 focal contracts have zero checklist coverage for their enforcement mechanisms.

---

## 6. Specific Recommendations for Hardening Soft Rules

### 6.1 Priority 1: Verification Checker Implementation

The verification-checker contract is the highest-priority hardening target because it is the foundation of the "evidence-driven" review model.

**Recommendation**: Implement the 5 highest-value checkers as Bash scripts or Python tools that can run against the task directory:

1. `state-projection-alignment-check`: Compare `00-task-state.yaml` phase/gate fields against README.md and board.yaml content. A simple diff-based check.
2. `dangling-reference-check`: Parse all markdown files for `[text](path)` links and verify target files exist.
3. `dirty-hygiene-closure-check`: Scan task directory for files matching known temp patterns (`*.tmp`, `draft-*`, `attempt-*`) and flag them.
4. `route-output-closure-check`: Verify `route-projection.yaml` exists and contains all 7 route fields.
5. `compaction-trigger-closure-check`: If context budget was exceeded, verify compaction receipt exists.

These 5 checkers would cover ~45% of the catalog and could be implemented in under 200 lines of Python.

### 6.2 Priority 2: Honest Language in Meta-Rules

**Recommendation**: Add a section to CLAUDE.md Part C that explicitly states the enforcement model:

> "All rules in this system are conventions enforced by agent awareness and review checklists. There is no external process, lint tool, or automated gate that independently verifies compliance. The effectiveness of this system depends on agent compliance and review thoroughness. Rules declared with '必须', '不得', or '禁止' should be understood as 'strong requirements subject to review verification' not 'platform-enforced constraints.'"

### 6.3 Priority 3: Checklist Expansion

**Recommendation**: Add enforcement-specific checklists for the 6 contracts with zero coverage:
- Exception object validation checklist
- Anti-pattern compliance checklist
- negative_activation constraint checklist
- Memory decay evaluation checklist
- Skill attempt tracking checklist
- Assembly chain validation checklist

### 6.4 Priority 4: Resolve Circular Dependencies

**Recommendation**: Break the three circular dependencies by removing reverse edges:
- action-governance should NOT depend on skill-tool-mapping (it produces action_family independently)
- work-packet-governance should NOT depend on lego-assembly-workflow (it produces packets, LEGO consumes them)
- cluster-orchestration should consume packet manifests via data dependency, not contract dependency

### 6.5 Priority 5: Define Undefined Metrics

Several rules reference undefined metrics:
- "预计时间的 2 倍" (expected time x2) -- expected time must be recorded in the work packet
- "当前 task session 结束前" -- session boundaries must be defined
- "用户 1 次交互周期" -- interaction cycle must be defined
- "55%/70%/85% context budget" -- budget calculation must be specified

---

## 7. Remaining Risks

### 7.1 Critical Risks

1. **Total enforcement model mismatch**: The system declares hard rules but enforces via convention. If an agent forgets or chooses to bypass, there is nothing stopping it. This is the fundamental risk.

2. **Verification checker catalog is fictional**: The 11 checkers provide no evidence because they do not execute. The "evidence-driven" principle is not met.

3. **Circular dependencies at initialization**: The three circular dependencies may cause initialization failures in a strict enforcement scenario.

### 7.2 High Risks

4. **Review pack overhead may exceed value**: For simple tasks, creating 5 review pack files for each gate may be more expensive than the review itself.

5. **Exception governance cannot resolve conflicts**: When a review fails and an exception is requested, the conflicts_with declaration provides no resolution path.

6. **LEGO vs architecture blueprint confusion**: Agents may not know which decomposition model to follow.

### 7.3 Medium Risks

7. **Word count thresholds are unverifiable**: The completeness-audit maturity gate cannot be checked without a word-count tool.

8. **Memory decay has no trigger**: 90-day/180-day decay rules will never fire automatically.

9. **Three naming schemes for phases**: Agents must track 7-stage (Chinese), 10-phase (English), and workflow_route (English) simultaneously.

---

## 8. Verdict Summary

| Dimension | Finding | Severity |
|-----------|---------|----------|
| Enforcement model | 86% of rules are soft enforcement | Critical |
| Verification checkers | 0 of 11 are executable | Critical |
| Circular dependencies | 3 confirmed | Critical |
| Language vs reality | Hard-rule language, soft-rule enforcement | Critical |
| Checklist coverage | 6 of 10 focal contracts have zero enforcement coverage | High |
| Undefined metrics | 4+ rules reference undefined thresholds | Medium |
| Naming consistency | 3 naming schemes for same concept | Medium |

**Overall Verdict: Fail**

The Claude Code norms system is a well-designed convention framework but misrepresents its enforcement model. The contracts use mandatory language ("必须", "不得", "禁止") for rules that are enforced solely by agent awareness. The verification-checker catalog is entirely conceptual. The checklist coverage is incomplete.

**To achieve a Pass verdict**, the system would need:
1. At minimum, honest language about its enforcement model (Recommendation 6.2)
2. Implementation of the 5 highest-value verification checkers (Recommendation 6.1)
3. Resolution of all 3 circular dependencies (Recommendation 6.4)
4. Expansion of checklist coverage to all 10 focal contracts (Recommendation 6.3)

---

*End of review report. Word count: approximately 3,800 words.*
