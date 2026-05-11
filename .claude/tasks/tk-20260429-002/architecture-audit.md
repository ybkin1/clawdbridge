# Architecture Audit: Claude Code Norms System

Generated: 2026-04-30
Scope: Full contract system + master CLAUDE.md + registry.yaml + all checklists
Reference: Round 2 gap analysis (`codex-vs-claude-round2.md`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Full Contract Dependency Graph](#2-full-contract-dependency-graph)
3. [Activation Chain: From "Do X" to Closeout](#3-activation-chain-from-do-x-to-closeout)
4. [Per-Contract Analysis: Trigger, Input, Output, Verification, Exception](#4-per-contract-analysis)
5. [Potential Problems and Flaws](#5-potential-problems-and-flaws)
6. [Circular Dependencies and Dead-Locks](#6-circular-dependencies-and-dead-locks)
7. [Contracts with Rules but No Execution Face](#7-contracts-with-rules-but-no-execution-face)
8. [Over-Complexity and Agent Confusion](#8-over-complexity-and-agent-confusion)
9. [Soft vs Hard Enforcement](#9-soft-vs-hard-enforcement)
10. [Registry vs File Divergence Audit](#10-registry-vs-file-divergence-audit)
11. [Contract Schema Compliance Matrix](#11-contract-schema-compliance-matrix)

---

## 1. Executive Summary

The Claude Code norms system consists of **27 contract files**, **1 master CLAUDE.md** entry point, **9 review checklists**, and **1 YAML registry** that tracks contract status and dependency relationships. The system implements a 7-stage workflow (learning through testing) with a 10-phase state machine, a 5-level LEGO decomposition model, a 3-layer review gate system, and a 4-layer memory architecture.

This audit identifies the following:

- **Total contracts**: 27 (22 active, 5 provisional, 0 draft-ready)
- **Dependency depth**: Maximum chain length of 5 hops (intent-capture -> task-routing -> action-governance -> context-governance -> context-compaction)
- **Circular dependencies**: 1 confirmed bidirectional circular dependency (action-governance <-> skill-tool-mapping) and 1 near-circular cluster (lego-assembly-workflow <-> work-packet-governance <-> architecture-blueprint)
- **Execution face gaps**: 8 contracts declare rules but lack any automated checker or enforcement mechanism
- **Soft enforcement**: 14+ rules rely purely on agent awareness/memory rather than structural enforcement
- **Critical flaw**: The `negative_activation` mechanism (declared in action-governance) has no defined evaluation procedure and is never referenced in any checklist or gate

---

## 2. Full Contract Dependency Graph

### 2.1 Registry Dependency Table (from `registry.yaml`)

The following table is reconstructed from `registry.yaml` `depends_on` fields. Each row shows what a contract consumes.

| Contract | depends_on (consumes) | conflicts_with | effective_scope |
|----------|----------------------|----------------|-----------------|
| `contract-schema` | [] | [] | all contracts |
| `intent-capture` | [] | [] | ownership_route, delivery_mode, task_chain_route |
| `task-routing` | [intent-capture] | [] | ownership_route, delivery_mode, task_chain_route, workflow_route, execution_orchestration_route, review_requirement_route, escalation_route |
| `action-governance` | [task-routing, task-tracking, skill-tool-mapping] | [] | action_family, artifact_kind |
| `skill-tool-mapping` | [action-governance, task-routing] | [] | action_family, artifact_kind |
| `context-governance` | [action-governance] | [context-compaction] | action_family |
| `task-tracking` | [intent-capture, task-routing] | [] | phase, subphase, phase_status, delivery_mode |
| `lego-assembly-workflow` | [cluster-orchestration, work-packet-governance, task-tracking, skill-tool-mapping] | [] | delivery_mode=full, phase=build, action_family=implementation |
| `work-packet-governance` | [task-tracking, architecture-blueprint, lego-assembly-workflow] | [] | delivery_mode=full, phase=build |
| `architecture-blueprint` | [task-tracking] | [] | delivery_mode=full, phase=design|plan|build |
| `review-gates` | [task-tracking, intent-capture] | [exception-governance] | phase, action_family=review |
| `review-consistency-checklist` | [review-gates, task-tracking] | [] | phase, action_family=review |
| `memory-architecture` | [] | [] | all |
| `verification-checker` | [review-gates] | [] | phase=verify|acceptance, action_family=verification |
| `exception-governance` | [] | [review-gates] | all |
| `closeout` | [review-gates, task-readme-lifecycle] | [] | phase=release-ready, action_family=closeout |
| `task-readme-lifecycle` | [task-tracking] | [] | delivery_mode=full, phase=research|spec|design|build|verify |
| `document-depth` | [review-gates] | [] | action_family=authoring, artifact_kind=prd|design-spec|contract |
| `engineering-standards` | [task-routing, action-governance] | [] | action_family=implementation|verification, delivery_mode=full |
| `cluster-orchestration` | [task-tracking, work-packet-governance] | [] | execution_orchestration_route=mandatory_multi_agent|recommended_multi_agent |
| `task-tracking-workflow` | [task-tracking, task-routing] | [] | delivery_mode=full|quick, all phases |
| `task-directory-tree` | [task-tracking] | [] | all tasks |
| `file-naming` | [] | [] | all files |
| `context-compaction` | [context-governance] | [] | all tasks, context_budget >= 55% |
| `completeness-audit` | [document-depth] | [] | all Standard/Complex tasks, any source material adaptation |
| `dirty-hygiene` | [task-tracking, context-compaction] | [] | all tasks, all write operations, phase transitions, closeout |
| `storage-location` | [task-directory-tree, file-naming] | [] | all tasks, all write operations |

### 2.2 Bidirectional Dependency Analysis

**Confirmed bidirectional dependencies** (A depends on B AND B depends on A):

1. **`action-governance` <-> `skill-tool-mapping`**
   - `action-governance` depends on `skill-tool-mapping` (registry line 59)
   - `skill-tool-mapping` depends on `action-governance` (registry line 67)
   - **This is a true circular dependency.** Both are `status: active`, meaning they are both always loaded when their scope matches. At initialization, neither can be resolved before the other.

2. **`lego-assembly-workflow` <-> `work-packet-governance`**
   - `lego-assembly-workflow` depends on `work-packet-governance` (registry line 92)
   - `work-packet-governance` depends on `lego-assembly-workflow` (registry line 100)
   - **Another true circular dependency.** Both are scoped to `delivery_mode=full, phase=build`, meaning they co-activate simultaneously.

3. **`review-gates` <-> `exception-governance`** (declared as `conflicts_with`, not `depends_on`, but functionally creates a constraint loop)
   - `review-gates` declares `conflicts_with: [exception-governance]`
   - `exception-governance` declares `conflicts_with: [review-gates]`
   - This is a symmetric conflict declaration, correctly noting that exception governance cannot exempt formal review. This is not a dependency cycle per se, but it creates an enforcement ambiguity: if a task is blocked by both a review failure AND an exception, which gate wins?

### 2.3 Dependency Cluster Diagram

```
ROOT NODES (no dependencies):
  contract-schema
  intent-capture
  memory-architecture
  exception-governance
  file-naming

LEVEL 1 (depends on ROOT only):
  task-routing -> [intent-capture]
  task-tracking -> [intent-capture, task-routing]

LEVEL 2:
  action-governance -> [task-routing, task-tracking, skill-tool-mapping]  ← CIRCULAR with skill-tool-mapping
  skill-tool-mapping -> [action-governance, task-routing]                  ← CIRCULAR with action-governance
  context-governance -> [action-governance]
  architecture-blueprint -> [task-tracking]
  task-readme-lifecycle -> [task-tracking]
  task-tracking-workflow -> [task-tracking, task-routing]
  task-directory-tree -> [task-tracking]
  review-gates -> [task-tracking, intent-capture]

LEVEL 3:
  review-consistency-checklist -> [review-gates, task-tracking]
  verification-checker -> [review-gates]
  document-depth -> [review-gates]
  context-compaction -> [context-governance]
  engineering-standards -> [task-routing, action-governance]

LEVEL 4:
  closeout -> [review-gates, task-readme-lifecycle]
  completeness-audit -> [document-depth]
  dirty-hygiene -> [task-tracking, context-compaction]
  storage-location -> [task-directory-tree, file-naming]

LEVEL 5 (BUILD PHASE CLUSTER - CIRCULAR):
  lego-assembly-workflow -> [cluster-orchestration, work-packet-governance, task-tracking, skill-tool-mapping]
  work-packet-governance -> [task-tracking, architecture-blueprint, lego-assembly-workflow]
  cluster-orchestration -> [task-tracking, work-packet-governance]
```

### 2.4 Consumption/Production Relationships

Beyond `depends_on`, contracts define implicit consumption/production relationships through their `required_inputs` and `required_outputs`:

| Producing Contract | Produces | Consumed By |
|-------------------|----------|-------------|
| `intent-capture` | `00-user-intent.md` (9-field artifact) | `task-routing`, `review-gates`, `closeout` (via review pack) |
| `task-routing` | `route-projection.yaml` | `action-governance`, `skill-tool-mapping`, `task-tracking`, `engineering-standards` |
| `action-governance` | `action_family` + `artifact_kind` classification | `context-governance` (§4 contract slice loading), `skill-tool-mapping` (§4.4 tool matrix) |
| `task-tracking` | `00-task-state.yaml` (10-phase state machine) | `lego-assembly-workflow`, `work-packet-governance`, `architecture-blueprint`, `task-readme-lifecycle`, `task-tracking-workflow`, `task-directory-tree`, `review-gates`, `review-consistency-checklist`, `dirty-hygiene` |
| `review-gates` | 3-layer gate verdicts | `verification-checker`, `document-depth`, `closeout`, `review-consistency-checklist` |
| `context-governance` | context load order + bundle types | `context-compaction` |
| `context-compaction` | `compaction-receipt.yaml` + `checkpoint.md` | `dirty-hygiene` |
| `document-depth` | depth profiles + maturity targets | `completeness-audit` |
| `architecture-blueprint` | architecture nodes + traceability matrix | `work-packet-governance` |
| `work-packet-governance` | work packet manifest (12-layer decomposition) | `lego-assembly-workflow`, `cluster-orchestration` |
| `cluster-orchestration` | fan-in report + delegation plan | `lego-assembly-workflow` |
| `task-readme-lifecycle` | `README.md` (dev/delivery states) | `closeout` |
| `task-directory-tree` | directory structure definition | `storage-location` |
| `file-naming` | naming conventions | `storage-location` |
| `lego-assembly-workflow` | `lego-decomposition-tree.yaml` + assembly chain | `work-packet-governance` (circular) |

---

## 3. Activation Chain: From "Do X" to Closeout

### 3.1 Full Chain Diagram

```
USER INPUT: "do X"
    |
    v
[COMPLEXITY JUDGE] (CLAUDE.md Part C table)
    |--> Trivial: Self-check only, skip most contracts
    |--> Standard: Full pipeline + 2-Agent review
    |--> Complex: Full pipeline + 3-4 Agent review + mandatory ADR
    |
    v (Standard/Complex path)
[RULE 3: INTENT CONFIRMATION]
    |--> "I will do [type], scope [scope], output [output], contracts [list]. Continue?"
    |--> Wait for user confirmation
    |
    v
[TASK INIT] (task-tracking-workflow-spec §3.2)
    Step 1: Generate task_id (tk-YYYYMMDD-NNN)
    Step 2: Create .claude/tasks/<task-id>/
    Step 3: Copy 00-task-state.yaml template
    Step 4: Create 00-user-intent.md (9 fields, intent-capture)
    Step 5: Create board.yaml
    Step 6: Create README.md (development state)
    Step 7: Execute 7-step routing -> route-projection.yaml (task-routing)
    Step 8: Load required_contracts via action-governance
    Step 9: Update .claude/memory/session/recent.md
    |
    v
[CONTRACT ACTIVATION] (registry.yaml effective_scope evaluation)
    |
    |-- action_family=clarify --> load: intent-capture
    |-- action_family=research --> load: context-governance, engineering-standards
    |-- action_family=authoring --> load: task-tracking, document-depth
    |-- action_family=implementation --> load: task-tracking, work-packet-governance, architecture-blueprint
    |-- action_family=verification --> load: verification-checker, review-gates
    |-- action_family=review --> load: review-gates, review-consistency-checklist
    |-- action_family=closeout --> load: closeout, task-readme-lifecycle
    |
    v
[STAGE 1: DEEP LEARNING] (CLAUDE.md Rule 1 + Part D.3)
    |--> WebSearch + WebFetch (>=3 references, >=2 deep sources)
    |--> Output: learning-report.md (>=2000 words, competitor comparison)
    |--> Review: stage1-learning-review.md checklist, >=2 Agent parallel
    |--> Rule 2: Pass/Conditional Pass/Fail, max 3 rounds
    |
    v
[STAGE 2: ARCHITECTURE DECOMPOSITION]
    |--> Input: requirements + learning report
    |--> Output: architecture-breakdown.md + lego-decomposition-tree.yaml (L0->L4)
    |--> architecture-blueprint contract activates: 13-layer architecture sequence
    |--> Review: stage2-architecture-review.md checklist
    |
    v
[STAGE 3: PRD]
    |--> Input: requirements + learning report + architecture breakdown
    |--> Output: prd.md (product-level design)
    |--> Review: stage3-prd-review.md + user-value-checklist.md (mandatory)
    |
    v
[STAGE 4: DETAILED DESIGN]
    |--> Input: PRD + architecture breakdown
    |--> Output: design.md (manufacturing-level: interfaces, data flow, schema, protocol)
    |--> Review: stage4-5-plan-review.md
    |
    v
[STAGE 5: DEVELOPMENT PLAN]
    |--> Input: detailed design
    |--> Output: dev-plan.md + Agent assignment matrix + milestones
    |--> Review: stage4-5-plan-review.md
    |
    v
[STAGE 6: CODING (BUILD PHASE)]
    |--> lego-assembly-workflow activates
    |--> LEGO assembly: L4->L3->L2->L1->L0 recursive assembly
    |--> work-packet-governance: 12-layer decomposition
    |--> cluster-orchestration: manifest -> fan-out -> wait -> fan-in
    |--> Each work packet: skill-tool-mapping selects tools based on action_family
    |--> Review: stage6-code-review.md
    |
    v
[STAGE 7: TESTING]
    |--> verification-checker runs (checker catalog)
    |--> Review: stage7-test-review.md
    |--> Test failure rollback table (CLAUDE.md Part D.5)
    |
    v
[ACCEPTANCE]
    |--> User acceptance
    |--> If reject: rollback to corresponding stage
    |
    v
[RELEASE-READY + CLOSEOUT]
    |--> Gate 1: Contract load confirmation (CLAUDE.md Part E, Gate 1)
    |--> Gate 2: Review completeness check (CLAUDE.md Part E, Gate 2)
    |--> Gate 3: Contract compliance check (CLAUDE.md Part E, Gate 3)
    |--> Gate 4: LEGO compliance check (CLAUDE.md Part E, Gate 4)
    |--> dirty-hygiene: full detection + recovery
    |--> closeout-contract: 4-type closeout + preconditions
    |--> task-readme-lifecycle: switch to delivery state
    |--> context-compaction: if budget >= 55%
    |--> storage-location: verify no C:\ writes
    |--> completeness-audit: 3-line defense check
    |--> memory-architecture: promote validated reflections
    |
    v
[FEEDBACK LOOP]
    |--> Check feedback.yaml for open items
    |--> Rule 4: Dirty data cleanup
    |--> Rule 5: Verify all files in project directory
```

### 3.2 Tool Selection Flow (within each work packet)

```
action_family identified (action-governance §2)
    |
    v
skill-tool-mapping §4.1 decision tree:
    Step 1: What action_family? -> Select capability category
    Step 2: What capability needed? -> From capability catalog (§4.2)
    Step 3: Which tool provides it? -> From tool registry (§4.3)
    Step 4: Is tool available? -> Installation check (§4.7)
        |--> Available -> Call
        |--> Not available -> Fallback (§4.6) or tooling_exception
    Step 5: Verify output satisfies current action goal
```

### 3.3 Build-Phase Specific Chain (LEGO Assembly)

```
Phase transitions to 'build'
    |
    v
[architecture-blueprint] validates: 13-layer architecture sequence complete
    |
    v
[work-packet-governance] decomposes: 12-layer packet split, mandatory pre-build artifacts (12 items)
    |
    v
[lego-assembly-workflow] activates:
    L0 -> L1 -> L2 -> L3 -> L4 decomposition tree written
    Agent assignment matrix: each packet gets objective/read_scope/write_scope/acceptance/verification/rollback
    |
    v
[cluster-orchestration] if multi-agent:
    manifest frozen -> fan-out -> wait -> fan-in
    |
    v
Each L4 code block manufactured by sub-agent (skill-tool-mapping selects tools)
    |
    v
L4->L3 assembly: unit tests verify
    |
    v
L3->L2 assembly: integration tests verify
    |
    v
L2->L1 assembly: module tests verify
    |
    v
L1->L0 assembly: end-to-end tests verify
    |--> Any level fails: rollback to that level, not restart from L4
```

---

## 4. Per-Contract Analysis: Trigger, Input, Output, Verification, Exception

### 4.1 Meta Contracts

#### contract-schema
- **Trigger**: Whenever a new contract is written or an existing one is substantially revised.
- **Input**: New contract content.
- **Output**: Structured contract with YAML front matter (13 fields) + 10 canonical sections.
- **Verification**: 5 checks in §7 (envelope complete, envelope at top, required_contracts declared, sections covered, contract_id matches registry).
- **Exception**: Spec files (`-spec.md`) may use simplified 4-section layout.

### 4.2 Intent & Routing Contracts

#### intent-capture
- **Trigger**: Before every Standard/Complex task begins.
- **Input**: User's raw requirement input.
- **Output**: `00-user-intent.md` with 9 fields (user_goal, target_user, happy_path, failure_trigger, non_goals, hard_constraints, observable_success, open_risks, plus optional feasibility_ref/critical_assumptions_summary/top_risks_summary).
- **Verification**: 3 checks (9-field completeness, observable_success is verifiable, non-explicitly-confirmed).
- **Exception**: Trivial tasks (<=5 tool calls), user says "direct do", pure translation/summary/Q&A.
- **Gap**: Missing `job_to_be_done` field (noted in round 2 gap analysis, item 11). The 9-field set is missing JTBD framework core.

#### task-routing
- **Trigger**: Before any task begins work, fixed 7-step sequence.
- **Input**: `00-user-intent.md` from intent-capture.
- **Output**: `route-projection.yaml` with ownership_route, delivery_mode, task_chain_route, workflow_route, execution_orchestration_route, review_requirement_route, escalation_route.
- **Verification**: 3 checks (7-step complete, no skip/reorder, route-projection written).
- **Exception**: Trivial tasks skip full routing, continuous task chains skip re-routing.
- **Gap**: The `workflow_route` enum in `task-routing-contract.md` §Step 4 lists `clarify/research/direct_build/feasibility/review` but CLAUDE.md Part D.2 maps Stage 3 as "spec" and Stage 4 as "design" — there is no `spec` or `design` workflow_route value. The routing vocabulary does not align with the 7-stage model.

### 4.3 Action & Tool Contracts

#### action-governance
- **Trigger**: After task-routing completes, for each formal work packet.
- **Input**: task-routing output (ownership/delivery/workflow results).
- **Output**: `action_family` + `artifact_kind` classification + route_profile.
- **Verification**: 4 checks (action_family identified, artifact_kind identified, route_profile resolved, negative_activation constraints).
- **Exception**: Equivalent tool fallback.
- **Critical Problem**: The `negative_activation` constraint (§5) declares what NOT to load but provides zero procedure for how to evaluate or enforce it. No checklist references it. No gate checks it. This is a declared rule with no execution face.

#### skill-tool-mapping
- **Trigger**: After action-governance determines action_family + artifact_kind.
- **Input**: action_family, artifact_kind, execution_orchestration_route.
- **Output**: Tool selection decision recorded in `route-projection.yaml` tool_routing field + `available_tools` snapshot + `tooling_exception` if needed.
- **Verification**: 4 checks (tool-selection-intent-aligned, no-bash-when-dedicated-tool, no-gratuitous-agent-spawn, required-tool-available-or-fallback).
- **Exception**: tooling_exception, missing-shared-interface.
- **Gap**: The anti-pattern list (§9) item 7 says "Skill ignore: matching skill but never tried to call" — but there is no automated way to verify whether a skill was attempted. This relies entirely on agent self-reporting.

### 4.4 Context Contracts

#### context-governance
- **Trigger**: Every task startup + when context budget reaches thresholds.
- **Input**: action-governance's required_contracts list.
- **Output**: Context load order (T0-T4) + bundle type selection (§6) + sub-agent isolation decisions.
- **Verification**: 4 checks (6-layer-load-order, context-budget-threshold, compaction-triggered, subagent-context-isolation).
- **Exception**: missing-repo-profile-with-manual-evidence.
- **Conflicts with**: context-compaction (declared conflict in registry, priority unspecified).

#### context-compaction
- **Trigger**: Context budget reaches 55%/70%/85%.
- **Input**: context-governance current budget state.
- **Output**: `checkpoint.md` (at 55%), `compaction-receipt.yaml` (at 70%/85%).
- **Verification**: 7 checks (3-level gradient, preserve-vs-compress-vs-discard, receipt written, checkpoint written, subagent isolation at 70%, phase independent from compaction, budget monitoring).
- **Exception**: None.
- **Critical Problem**: The budget monitoring heuristic (§10.1) explicitly states "Claude Code does not expose direct context_budget_percent metric." The 55%/70%/85% triggers are based on heuristic signals (file count, message count, system prompts) which are imprecise. The "conservative bias" means compression may fire prematurely, but this is acknowledged and accepted.

### 4.5 Task Tracking Contracts

#### task-tracking
- **Trigger**: Every task startup/resumption/phase transition.
- **Input**: intent-capture output + task-routing output.
- **Output**: `00-task-state.yaml` with 10-phase state machine.
- **Verification**: 4 checks (truth-hierarchy-enforced, 10-phase-state-machine, derived-projection-not-override-truth, dirty-chain-prevention).
- **Exception**: trivial-task-simplified-structure.

#### task-tracking-workflow
- **Trigger**: Task initialization, phase advancement, review loop, disconnection recovery.
- **Input**: task-tracking state machine + task-routing decisions.
- **Output**: Complete lifecycle flow: init -> route -> phase loop -> review loop -> closeout.
- **Verification**: 8 checks (task-init-steps-complete, phase-transition-rules, phase-gate-mapping, review-loop-execution, write-permission-enforcement, parallel-collaboration-protocol, closeout-preconditions, disconnection-recovery).
- **Exception**: None.

#### task-directory-tree
- **Trigger**: Task initialization (create structure) and closeout (cleanup).
- **Input**: task-tracking state.
- **Output**: Standard directory structure under `.claude/tasks/<task-id>/`.
- **Verification**: 5 checks (global-directory-structure, truth-vs-derived-classification, directory-creation-timing, closeout-cleanup-rules, trivial-task-simplified-structure).
- **Exception**: None.

#### file-naming
- **Trigger**: Any file creation, rename, or reference.
- **Input**: None.
- **Output**: Consistent file naming across all contract system files.
- **Verification**: 10 checks (global convention, task-id format, truth-source 00-prefix, artifact naming, review-bundle format, checker-result naming, exception-ledger naming, memory-file naming, contract-file naming, checklist naming).
- **Exception**: legacy-underscore-files.

### 4.6 Build Phase Contracts

#### lego-assembly-workflow
- **Trigger**: Standard/Complex tasks entering build phase.
- **Input**: Detailed design document, development plan, architecture-blueprint.
- **Output**: `lego-decomposition-tree.yaml` + `agent-assignment-matrix.yaml` + assembly chain verification results.
- **Verification**: 4 checks (decomposition-tree-complete, agent-assignment-matrix, assembly-chain-valid, recovery-plan-defined).
- **Exception**: trivial-task-single-pass, agent-failure-no-recovery.
- **Critical Problem**: The agent failure recovery mechanism (§4.6.4) specifies what to do when an agent hangs, produces insufficient output, or fails quality review, but it provides no automated detection mechanism for "agent hangs" or "timeout 2x expected time". The expected time is not a defined metric. This is a soft rule relying on agent judgment.

#### work-packet-governance
- **Trigger**: Before build phase正式启动, work packets must be decomposed from architecture nodes.
- **Input**: architecture-blueprint output + task-tracking current phase state.
- **Output**: Work packet manifest with 12-layer decomposition, 12 pre-build artifacts.
- **Verification**: 4 checks (12-layer-decomposition, no-coarse-packet-names, packet-traceable-to-architecture-node, pre-build-artifacts-complete).
- **Exception**: standard-task-simplified-to-6-8-layers.
- **Gap**: The registry says `depends_on: [task-tracking, architecture-blueprint, lego-assembly-workflow]` but lego-assembly-workflow also depends on work-packet-governance — this is the circular dependency confirmed in §2.2.

#### architecture-blueprint
- **Trigger**: design/plan/build phase, any work packet.
- **Input**: task-tracking current phase state.
- **Output**: architecture blueprint with 13 levels, architecture nodes, traceability matrix.
- **Verification**: 4 checks (blueprint-structure-complete, 13-level-coverage, node-traceability-matrix, work-packet-to-node-mapping).
- **Exception**: not-applicable-layer.
- **Gap**: The 13-layer architecture sequence (§2.2) is "不可跳过" (cannot be skipped) but there is no enforcement mechanism. No checklist validates that all 13 layers are present. The checker design (§7) lists ARCH000-ARCH007 but these are "future verification checks" — they do not exist as actual automated checkers.

#### cluster-orchestration
- **Trigger**: execution_orchestration_route = mandatory_multi_agent or recommended_multi_agent.
- **Input**: task-tracking state + work-packet-governance decomposition results.
- **Output**: Work packet manifest, delegation plan, fan-in report.
- **Verification**: 6 checks (manifest-before-invocation, fan-in-report-exists, orchestration-decision-correct, single-thread-exception-reason-code, fan-out-wait-fan-in-workflow, anti-pattern-prevention).
- **Exception**: 5 reason codes for single_thread_exception (strong_dependency_single_critical_path, write_scope_conflict, tool_policy_limits, missing-shared-interface, sensitive-destructive-single-owner).

### 4.7 Review Contracts

#### review-gates
- **Trigger**: Before every phase advancement.
- **Input**: task-tracking state + intent-capture intent + review bundle.
- **Output**: 3-layer gate verdict (value -> professional -> contract), review bundle directory, review results.
- **Verification**: 5 checks (3-layer-gate-order, review-pack-required-files, hard-fail-conditions, 3-round-escalation, zero-finding-rule).
- **Exception**: trivial-task-self-review.
- **Conflicts with**: exception-governance (bidirectional).

#### review-consistency-checklist
- **Trigger**: After every formal review completion.
- **Input**: review-gates report + task-tracking state.
- **Output**: 12-item consistency verification report.
- **Verification**: 9 checks (truth-consistency, route-consistency, independence-consistency, finding-closure, dirty-chain-consistency, verification-exception-consistency, readme-closeout-consistency, orchestration-context-consistency, 10-automated-checks).
- **Exception**: None.

### 4.8 Governance Contracts

#### memory-architecture
- **Trigger**: Cross-session knowledge sedimentation, user feedback memory, pitfall recording, major decision changes.
- **Input**: None (reads from task context).
- **Output**: 4-layer memory structure (user/project/agent/session).
- **Verification**: 4 checks (4-layer-structure, promotion-chain, decay-policy, memory-vs-truth-boundary).
- **Exception**: None.
- **Gap**: The decay mechanism (§5) uses time-based rules (90 days stale, 180 days archived) but there is no automated trigger for decay evaluation. Memory decay relies on the agent noticing during closeout.

#### verification-checker
- **Trigger**: verify/acceptance phase or any claim verification scenario.
- **Input**: review-gates conclusions.
- **Output**: Checker results in `checkers/checker-results.yaml`.
- **Verification**: 4 checks (checker-result-shape, manual-validation-evidence, gate-checker-binding, minimal-catalog-coverage).
- **Exception**: checker-unavailable-with-manual-evidence.
- **Gap**: The checker catalog (§4.3) lists 11 checkers but none of them are automated scripts. They are all defined as `automated` or `manual` or `hybrid` modes, but the actual implementation is agent mental checking. There is no code that runs `dirty-chain-prevention-check` — it is a conceptual checklist, not an executable tool.

#### exception-governance
- **Trigger**: Any deviation from existing contracts.
- **Input**: None.
- **Output**: Exception object YAML files in `exceptions/` directory.
- **Verification**: 4 checks (5-exception-class, non-exemptible-rules, exception-object-complete, explicit-logging).
- **Exception**: non-exemptible-rules-never-waivable (self-referential — the only exception is that non-exemptible rules are never waivable).

#### closeout
- **Trigger**: phase=release-ready and action_family=closeout, after all gates pass.
- **Input**: review-gates conclusions + task-readme-lifecycle delivery-state README.
- **Output**: 4-type closeout (review/delivery/git/migration).
- **Verification**: 4 checks (4-closeout-types, preconditions-met, readme-delivery-state, no-premature-closeout).
- **Exception**: None.

#### task-readme-lifecycle
- **Trigger**: Full-mode tasks entering development or before closeout (switch to delivery state).
- **Input**: task-tracking current phase state.
- **Output**: README.md (development or delivery state).
- **Verification**: 4 checks (two-state-model, development-readme-minimum, delivery-readme-minimum, trigger-rules).
- **Exception**: advisory-pure-translation-summary-minor-fix.

### 4.9 Quality Contracts

#### document-depth
- **Trigger**: authoring action producing PRD/design-spec/contract documents.
- **Input**: review-gates conclusions.
- **Output**: Document with declared depth_profile, maturity_target, confidentiality_level.
- **Verification**: 5 checks (document-classification, depth-profile-match, maturity-target-declared, confidentiality-level-declared, review-explicit-answers).
- **Exception**: None.

#### engineering-standards
- **Trigger**: implementation/verification actions need repo-specific engineering standard references.
- **Input**: task-routing output + action-governance classification.
- **Output**: Parsing order, project structure reference, tech stack reference, code style reference, build/test commands.
- **Verification**: 4 checks (parsing-order-followed, command-catalog-not-substitute, prohibition-items-have-owner, draft-provisional-not-masquerade-as-active).
- **Exception**: missing-repo-profile-with-manual-evidence, command-catalog-unavailable-with-task-local-plan.

#### completeness-audit
- **Trigger**: Extracting/adapting content from source materials; user asks "anything else"; review finds deliverable thinner than source.
- **Input**: document-depth classification + complete source materials.
- **Output**: Completeness mapping table (✅/⚠️/❌) + maturity gate word count check + self-audit checklist.
- **Verification**: 4 checks (completeness-mapping-table, maturity-gate-word-count, self-audit-checklist, source-to-deliverable-traceability).
- **Exception**: None.

### 4.10 Hygiene & Infrastructure Contracts

#### dirty-hygiene
- **Trigger**: After every write operation, before phase transitions, during gate conclusion changes, before handoff, before closeout, during compaction, on session resume.
- **Input**: task-tracking state + context-compaction receipts.
- **Output**: Dirty hygiene state (clean/dirty_detected/recovering/blocked/stale) + recovery evidence.
- **Verification**: 9 checks (write-or-fail-or-explicit, dirty-data-classification, detection-trigger-timing, state-machine-transitions, recovery-action-list, 4 checker designs).
- **Exception**: None.

#### storage-location
- **Trigger**: Any write operation.
- **Input**: None (implicit).
- **Output**: All files in project directory (never C:\).
- **Verification**: Closeout pre-condition: confirm no C:\ writes.
- **Exception**: Claude Code runtime files (not agent-controlled), user explicitly authorized paths.

---

## 5. Potential Problems and Flaws

### 5.1 Circular Dependencies (Severity: HIGH)

**Issue 1: `action-governance` <-> `skill-tool-mapping`**
Both contracts are `status: active` and mutually dependent. At task initialization, the activation order cannot be resolved: action-governance needs skill-tool-mapping's output (action_family -> tool mapping), and skill-tool-mapping needs action-governance's output (action_family classification). In practice this works because both are loaded simultaneously when their scope matches, but the declared dependency implies sequential resolution which is impossible.

**Fix**: Remove one direction of the dependency. Since skill-tool-mapping §4.1 clearly consumes action_family from action-governance, the correct direction is: action-governance -> skill-tool-mapping. The reverse dependency (action-governance depends on skill-tool-mapping) should be removed — action-governance defines action_family/artifact_kind independently; it does not need tool mapping to do so.

**Issue 2: `lego-assembly-workflow` <-> `work-packet-governance` <-> `cluster-orchestration`**
Three contracts form a dependency triangle:
- lego-assembly-workflow depends on work-packet-governance + cluster-orchestration
- work-packet-governance depends on lego-assembly-workflow
- cluster-orchestration depends on work-packet-governance

This creates a circular dependency in the build phase cluster. All three are scoped to `delivery_mode=full, phase=build`, meaning they co-activate simultaneously. The circular dependency makes it impossible to define a clean initialization order.

**Fix**: The dependency graph should be a DAG. The correct direction is: work-packet-governance (produces packets) -> cluster-orchestration (orchestrates packets) -> lego-assembly-workflow (assembles results). Remove the reverse edges: work-packet-governance should NOT depend on lego-assembly-workflow; cluster-orchestration should NOT depend on work-packet-governance directly (it consumes packets via the manifest, which is a data dependency, not a contract dependency).

**Issue 3: `context-governance` conflicts_with `context-compaction` (no resolution policy)**
The registry declares a conflict but provides no resolution policy. Both are active. Which wins? If context-governance says "load all required contracts" and context-compaction says "compress at 55%", which takes priority when they conflict during budget pressure?

**Fix**: Add a `conflict_resolution_policy` field to the registry. For this specific case, the resolution should be: context-compaction is the enforcement mechanism for context-governance's budget thresholds, so they are not truly in conflict — the conflict_with declaration should be removed or changed to a "priority" relationship.

### 5.2 Contracts with Rules but No Execution Face (Severity: HIGH)

The following contracts declare rules but have no automated enforcement:

1. **action-governance §5 `negative_activation`**: Declares what contracts/skills/tools must NOT be loaded. No checklist item verifies this. No gate checks this. The only verification check is `negative_activation-constraints` but there is no procedure defined for what that check actually does.

2. **context-governance §5.2 reviewer isolation**: The 80% Jaccard similarity threshold for agent isolation checking is defined but never enforced by any mechanism. The check requires manual calculation by the orchestrator.

3. **architecture-blueprint §7 checker design**: ARCH000-ARCH007 are listed as "future verification checks" — they do not exist. The architecture blueprint contract has no actual enforcement.

4. **skill-tool-mapping §9 anti-pattern item 7**: "Skill ignore" — no automated mechanism detects whether a matching skill was attempted.

5. **memory-architecture §5 decay**: The 90-day/180-day decay rules have no automated trigger. Decay evaluation relies on agent noticing during closeout.

6. **verification-checker catalog**: All 11 checkers are declared as `automated` or `hybrid` but none are implemented as actual executable tools. They are conceptual checklists.

7. **completeness-audit maturity gate**: The word count thresholds (≥3000, ≥2000, etc.) cannot be verified without a word-count tool. An agent must manually count.

8. **task-tracking-workflow §7.4 board claim/release protocol**: The claim/release protocol for board work items has no locking mechanism. If two agents try to claim the same item simultaneously, there is no atomic operation to prevent conflict.

### 5.3 Execution Face Relies on Agent Awareness (Severity: MEDIUM)

The entire system has a fundamental design tension: it declares hard rules ("must", "不得", "禁止") but the enforcement mechanism is always "agent remembers to check." There is no external process, no lint tool, no automated gate that runs before phase advancement.

Specific examples:
- CLAUDE.md Part E Gate 1: "主线程必须读取 registry.yaml" — the agent must remember to do this.
- CLAUDE.md Part E Gate 2: "至少 1 个评审 Agent 的维度必须是规范完整性对标" — the agent must remember to assign this dimension.
- CLAUDE.md Part E Gate 3: "任何契约未遵守时，不得设置 closeout_allowed=true" — the agent must remember to check all contracts.
- CLAUDE.md Part E Gate 4: "任何检查不通过时，professional gate 不得 passed" — the agent must remember to check LEGO compliance.

**This is not a flaw per se** — it is inherent to a prompt-based governance system. But it means the system should be honest about its enforcement model: these are "strong conventions" not "hard gates."

### 5.4 Over-Complexity (Severity: MEDIUM)

**The 12-layer work packet decomposition** (`work-packet-governance.md` §2) requires 12 mandatory pre-build artifacts before build phase can start. For a typical Standard task (e.g., "add a login form"), this means producing: feature scope, schema, PO, DAO, Req DTO, Res DTO, service interface, logic-n, controller, wiring, test cases, and observability — before writing a single line of code. This is excessive for most real-world tasks.

The contract acknowledges that "Standard 任务可简化到 6-8 层" but provides no criteria for which layers can be skipped. The agent must decide ad hoc, which undermines the "hard rule" nature.

**The 7-step routing** (`task-routing-contract.md` §2) is executed before ANY task starts work. For a simple bug fix, this means going through: ownership_route, delivery_mode_route, task_chain_route, workflow_route, execution_orchestration_route, review_requirement_route, escalation_route — each with multiple enum values. This is reasonable for the first task in a session but becomes redundant for subsequent steps in the same task chain.

**The review pack structure** (`review-gates-contract.md` §6) requires 5 files (00-user-intent.md through 05-value-evidence.yaml) for every review bundle. For a Standard task with 3 phase transitions (e.g., research -> design -> build), this means creating 15 review pack files total. The overhead of managing review pack files may exceed the value of the review itself for simple transitions.

### 5.5 Missing Enforcement Faces

**The 4 gate system** (CLAUDE.md Part E) is the critical enforcement mechanism but has no independent verifier. The gates check:
1. Contracts loaded — verified by agent reading registry
2. Review completeness — verified by assigning a review agent
3. Contract compliance — verified by agent self-checking
4. LEGO compliance — verified by agent self-checking

All four gates rely on the agent (or sub-agents) performing checks. There is no external script, no lint tool, no pre-commit hook that independently verifies gate compliance. This means if the agent forgets or decides to skip, there is nothing stopping it.

**The feedback loop** (`CLAUDE.md` Part E, feedback.yaml) has no enforcement. Feedback items are collected at closeout but the contract says "accepted 的反馈必须创建独立任务修复" — there is no mechanism to ensure this actually happens.

---

## 6. Circular Dependencies and Dead-Locks

### 6.1 Confirmed Circular Dependencies

| Cycle | Contracts Involved | Type | Risk |
|-------|-------------------|------|------|
| A | `action-governance` <-> `skill-tool-mapping` | Mutual depends_on | Medium: Both are always loaded together in their shared scope, so initialization works. But the declared dependency order is unresolvable. |
| B | `lego-assembly-workflow` <-> `work-packet-governance` <-> `cluster-orchestration` | Triangular depends_on | High: Three contracts in build phase depend on each other, creating a resolution deadlock if sequential loading is attempted. |
| C | `review-gates` <-> `exception-governance` (conflicts_with) | Symmetric conflict | Low: This is a correct declaration that neither can exempt the other. But it creates ambiguity when both are violated simultaneously. |

### 6.2 Potential Dead-Locks

**Dead-Lock Scenario 1: Review -> Fix -> Review cycle with no progress**
- Stage 6 coding produces output
- Review finds issues (request_changes)
- Agent fixes issues
- Review finds same issues again (method_issue, round 2)
- Agent fixes again
- Review finds same issues (blocked, round 3)
- Agent reports to user
- User says "先这样" (CLAUDE.md user intervention command)
- But closeout requires all gates passed (closeout-contract §3)
- **Dead-lock**: User says "ship it" but gate cannot pass.

**Resolution**: The exception-governance contract has a `delivery_mode_exception` for this scenario, but it conflicts with review-gates (conflicts_with). The system has no clean path for "user wants to ship despite gate failure."

**Dead-Lock Scenario 2: Context compaction during review**
- Review is in progress (multiple agents, large review packs)
- Context budget hits 70%
- context-compaction triggers: clean old search results, compress discussions
- But review agents may still need those search results for their analysis
- Context-governance conflicts_with context-compaction
- **Dead-lock**: Compression may remove context that review agents need.

**Resolution**: The sub-agent isolation strategy in context-compaction §7 says "transfer to sub-agent at 70%" but does not specify what happens if the main thread is in the middle of fan-in.

**Dead-Lock Scenario 3: Dirty hygiene blocks phase transition, but phase transition is needed to fix dirty data**
- Phase is build, but dirty data detected in artifacts/
- dirty-hygiene state: dirty_detected -> cannot advance phase
- But the fix requires advancing to verify phase to run tests
- **Dead-lock**: Cannot advance because dirty, cannot fix dirty because stuck in build.

**Resolution**: The dirty-hygiene state machine (§5.1) has a `recovering` state that allows recovery actions within the current phase. But it does not explicitly state that recovery actions can include phase-advancing activities (e.g., running tests in verify phase to validate build artifacts).

---

## 7. Contracts with Rules but No Execution Face

This section catalogs every declared rule that has no automated enforcement, no checklist item, and no gate verification step.

### 7.1 action-governance: negative_activation

**Declared rule** (§5): Current task must explicitly declare what contracts/skills/tools are NOT loaded. Must not exclude active contracts, required skills, required verification checks, or downgrade formal review.

**Execution face**: None. No checklist checks for negative_activation. No gate verifies it. The verification_check `negative_activation-constraints` has no defined procedure.

**Impact**: Medium. This mechanism was designed to reduce context noise but has no enforcement. Agents will simply ignore it because nothing checks it.

### 7.2 context-governance: reviewer isolation Jaccard threshold

**Declared rule** (§5.2): If >=2 review agents have >80% file path Jaccard similarity, mark as `low_confidence`.

**Execution face**: None. No tool computes Jaccard similarity of file paths. The orchestrator must manually compare agent reports.

**Impact**: Low. Agents rarely produce identical reports by accident.

### 7.3 architecture-blueprint: 13-layer sequence enforcement

**Declared rule** (§2.2): 13 layers "不可跳过" (cannot be skipped).

**Execution face**: None. The checker design (§7) lists ARCH000-ARCH007 as "future verification checks" — none exist.

**Impact**: High. This is the foundation of the build phase. Without enforcement, agents may skip layers.

### 7.4 skill-tool-mapping: skill ignore anti-pattern

**Declared rule** (§9, item 7): Having a matching skill but never attempting to call it is an anti-pattern.

**Execution face**: None. No tool tracks which skills were available vs which were called.

**Impact**: Medium. Skills are user-invocable (not auto-activated), so this is partially unenforceable by design.

### 7.5 memory-architecture: decay mechanism

**Declared rule** (§5.1): 90 days unused -> stale, 180 days -> archived.

**Execution face**: None. No cron job or hook triggers decay evaluation.

**Impact**: Low. Memory files are small; decay is a nice-to-have cleanup, not a correctness concern.

### 7.6 verification-checker: automated checker catalog

**Declared rule** (§4.3): 11 checkers with `automated`/`hybrid` modes.

**Execution face**: None. No scripts implement any of these checkers. They are all conceptual checklists.

**Impact**: High. The entire verification system is built on the assumption that checkers provide evidence. If checkers are just mental checklists, the "evidence-driven" principle (§3.1 of verification-checker) is not met.

### 7.7 completeness-audit: word count thresholds

**Declared rule** (§3, maturity gate): Contracts >=3000 words or 60% of source material.

**Execution face**: None. No word-count tool is invoked. Agents must manually estimate.

**Impact**: Medium. The thresholds are useful as guidelines but unverifiable as hard rules.

### 7.8 task-tracking-workflow: board claim/release atomicity

**Declared rule** (§7.4): "同一 work item 同时只能有一个 active claim."

**Execution face**: None. board.yaml is a flat YAML file; there is no locking mechanism for concurrent agents.

**Impact**: Medium. In practice, the orchestrator controls fan-out and assigns non-overlapping write scopes, so collisions are rare. But the contract declares it as a "hard rule" without enforcement.

---

## 8. Over-Complexity and Agent Confusion

### 8.1 Conflicting Phase Mappings

**CLAUDE.md Part D.2** maps 7 stages to task-tracking phases:

| 7 Stage | task-tracking phase |
|---------|-------------------|
| 1 深度学习 | research |
| 2 架构拆解 | architecture-decomposition |
| 3 PRD | spec |
| 4 方案详设 | design |
| 5 开发计划 | plan |
| 6 编码 | build |
| 7 测试 | verify |

But **task-tracking-contract.md §3** defines 10 phases: clarify, research, architecture-decomposition, spec, design, plan, build, verify, acceptance, release-ready.

And **task-tracking-workflow-spec.md §4.1** shows the phase state machine including `clarify` and `acceptance` and `release-ready`.

And **task-routing-contract.md §Step 4** defines `workflow_route` with values: clarify, research, direct_build, feasibility, review — none of which map directly to the 7-stage model.

**The problem**: An agent executing a task must navigate three different naming schemes for "where am I in the process?" The 7-stage model (Chinese), the 10-phase model (English), and the workflow_route model (English, different values). An agent might be at "Stage 4" (方案详设), "phase: design", and "workflow_route: direct_build" simultaneously. This is confusing.

### 8.2 Review Gate vs Stage Checklists: Duplication

The review-gates-contract defines 3-layer gates (value -> professional -> contract), and the checklists/ directory defines 7 stage-specific checklists plus 3 supplemental checklists. The relationship between gates and checklists is:

- Value gate uses user-value-checklist.md
- Professional gate uses stage-specific checklist (e.g., stage1-learning-review.md)
- Contract gate uses review-consistency-checklist.md + contract-completeness-checklist.md (when modifying contracts)

But there is no single mapping table that tells an agent "at Stage X, use checklist Y for gate Z." The agent must infer this from multiple documents. This is a significant source of potential confusion.

### 8.3 LEGO Assembly vs 7-Stage Model: Overlap

The LEGO assembly model (CLAUDE.md Part D, lego-assembly-workflow contract) defines 5 levels (L0-L4) and maps them to the 7 stages. But the 7 stages already define depth requirements (D.3: "各级产出的深度要求"). The LEGO model adds another layer of abstraction on top of the stage model, requiring agents to think about both "which stage am I in?" and "which LEGO level am I assembling?" simultaneously.

For a Standard task, the agent must track:
1. Phase (task-tracking: 10 options)
2. Stage (7-stage model: 7 options + Stage 0)
3. Subphase (task-tracking: 5 options)
4. Gate status (3 options: value/professional/contract)
5. LEGO level (5 options: L0-L4)
6. Action family (7 options)
7. Artifact kind (11 options)
8. Delivery mode (3 options)

That is 8 dimensions of state tracking. For a single task, this is excessive.

### 8.4 Registry effective_scope Syntax Complexity

The registry.yaml effective_scope syntax supports: AND lists, OR within fields, bare string domain qualifiers, comparison operators, and `all` wildcard. But only a handful of contracts use the advanced features:

- `lego-assembly-workflow`: `delivery_mode=full, phase=build, action_family=implementation` (3-field AND)
- `context-compaction`: `all tasks, context_budget >= 55%` (comparator)
- `completeness-audit`: `all Standard/Complex tasks, any source material adaptation` (bare string)

The complexity of the syntax is not matched by its actual usage. Most contracts use simple field-value matching. The syntax specification (§1-12 of registry.yaml header) is over-engineered for the actual needs.

---

## 9. Soft vs Hard Enforcement

### 9.1 Hard Enforcement (mechanism-backed)

Rules that have some form of structural enforcement:

| Rule | Enforcement Mechanism | Strength |
|------|----------------------|----------|
| Rule 5: No C:\ writes | storage-location contract + closeout check | Medium: Agent must check, but no automated path validation |
| file-naming: 00- prefix for truth sources | File naming convention + agent awareness | Weak: Convention only, no enforcement |
| Review 3-round escalation | review-gates-contract §8 | Medium: Agent must track rounds, but no automated counter |
| Write-or-Fail-or-Explicit | dirty-hygiene §2 | Weak: Agent must self-enforce |
| Intent 9-field completeness | intent-capture §3 | Weak: Agent must fill fields, no automated validation |

### 9.2 Soft Enforcement (agent-awareness-only)

Rules that rely entirely on the agent remembering:

| Rule | Document Reference |
|------|-------------------|
| 7-step routing order | task-routing-contract.md §2 |
| 6-layer context load order | context-governance-contract.md §2 |
| negative_activation exclusion | action-governance-contract.md §5 |
| 13-layer architecture sequence | architecture-blueprint.md §2.2 |
| 12-layer work packet decomposition | work-packet-governance.md §2 |
| 3-layer gate order (value->professional->contract) | review-gates-contract.md §4 |
| LEGO L4->L0 assembly order | lego-assembly-workflow.md §4.7 |
| Memory decay timeline | memory-architecture.md §5 |
| Skill ignore anti-pattern | skill-tool-mapping.md §9 |
| Board claim/release atomicity | task-tracking-workflow-spec.md §7.4 |
| Compaction trigger thresholds | context-compaction-spec.md §2 |
| Completeness maturity word counts | completeness-audit-spec.md §3 |
| Contract schema 10-section order | contract-schema.md §5 |
| Reviewer isolation Jaccard threshold | context-governance-contract.md §5.2 |
| Feedback loop processing | CLAUDE.md Part E |

### 9.3 Assessment

**Hard enforcement ratio**: ~5 out of ~35 declared rules have even weak structural enforcement. **86% of rules are soft.**

This is not necessarily a design flaw — it is an honest assessment of what prompt-based governance can achieve. But the system should be explicit about this: it is a "strong convention system" not a "hard gate system." The language ("必须", "不得", "禁止") implies hard enforcement, which is misleading.

**Recommendation**: The system should adopt honest language in its meta-rules: "All rules in this system are conventions enforced by agent awareness. There is no external process, lint tool, or automated gate. The effectiveness of this system depends on agent compliance."

---

## 10. Registry vs File Divergence Audit

### 10.1 File-to-Registry Mapping

Every file in `contracts/` was checked against registry.yaml:

| Registry Entry | File Exists | contract_id matches | Status |
|---------------|-------------|---------------------|--------|
| contract-schema | contract-schema.md | "contract-schema" | active |
| intent-capture | intent-capture-contract.md | "intent-capture" | active |
| task-routing | task-routing-contract.md | "task-routing" | active |
| action-governance | action-governance-contract.md | "action-governance" | active |
| skill-tool-mapping | skill-tool-mapping.md | "skill-tool-mapping" | active |
| context-governance | context-governance-contract.md | "context-governance" | active |
| task-tracking | task-tracking-contract.md | "task-tracking" | active |
| lego-assembly-workflow | lego-assembly-workflow.md | "lego-assembly-workflow" | active |
| work-packet-governance | work-packet-governance.md | "work-packet-governance" | active |
| architecture-blueprint | architecture-blueprint.md | "architecture-blueprint" | active |
| review-gates | review-gates-contract.md | "review-gates" | active |
| review-consistency-checklist | review-consistency-checklist.md | "review-consistency-checklist" | active |
| memory-architecture | memory-architecture.md | "memory-architecture" | active |
| verification-checker | verification-checker.md | "verification-checker" | active |
| exception-governance | exception-governance.md | "exception-governance" | active |
| closeout | closeout-contract.md | "closeout" | active |
| task-readme-lifecycle | task-readme-lifecycle.md | "task-readme-lifecycle" | active |
| document-depth | document-depth.md | "document-depth" | provisional |
| engineering-standards | engineering-standards.md | "engineering-standards" | provisional |
| cluster-orchestration | cluster-orchestration.md | "cluster-orchestration" | provisional |
| task-tracking-workflow | task-tracking-workflow-spec.md | "task-tracking-workflow" | active |
| task-directory-tree | task-directory-tree-spec.md | "task-directory-tree" | active |
| file-naming | file-naming-spec.md | "file-naming" | active |
| context-compaction | context-compaction-spec.md | "context-compaction" | active |
| completeness-audit | completeness-audit-spec.md | "completeness-audit" | active |
| dirty-hygiene | dirty-hygiene-spec.md | "dirty-hygiene" | active |
| storage-location | storage-location-contract.md | "storage-location" | active |

**Result**: All 27 registry entries have corresponding files. All contract_id fields in YAML front matter match their registry keys. No divergence found.

### 10.2 Registry Entry Count vs CLAUDE.md Part E

CLAUDE.md Part E lists 27 contract files in the directory tree. The registry has 27 entries. The count matches.

---

## 11. Contract Schema Compliance Matrix

Each contract was checked against `contract-schema.md` requirements (13 metadata fields + 10 semantic sections).

### 11.1 Metadata Envelope Compliance

| Contract | Has front matter | 13 fields present | Sections 1-10 covered | Notes |
|----------|-----------------|-------------------|----------------------|-------|
| contract-schema.md | N/A (is the schema) | N/A | 6 sections (self-describing) | OK |
| intent-capture-contract.md | Yes | 13/13 | 1-7 covered (missing 8-10: verification, migration, non-goals) | Partial |
| task-routing-contract.md | Yes | 13/13 | 1-5 covered (missing 6-10) | Partial |
| action-governance-contract.md | Yes | 13/13 | 1-8 covered (missing 9-10) | Partial |
| skill-tool-mapping.md | Yes | 13/13 | 1-11 covered | Full |
| context-governance-contract.md | Yes | 13/13 | 1-6 covered (missing 7-10) | Partial |
| task-tracking-contract.md | Yes | 13/13 | 1-8 covered (missing 9-10) | Partial |
| lego-assembly-workflow.md | Yes | 13/13 | 1-10 covered | Full |
| work-packet-governance.md | Yes | 13/13 | 1-9 covered (missing 10) | Partial |
| architecture-blueprint.md | Yes | 13/13 | 1-7 covered (missing 8-10) | Partial |
| review-gates-contract.md | Yes | 13/13 | 1-19 covered (over-structured) | Full+ |
| review-consistency-checklist.md | Yes | 13/13 | 1-10 covered | Full |
| memory-architecture.md | Yes | 13/13 | 1-7 covered (missing 8-10) | Partial |
| verification-checker.md | Yes | 13/13 | 1-10 covered | Full |
| exception-governance.md | Yes | 13/13 | 1-12 covered | Full+ |
| closeout-contract.md | Yes | 13/13 | 1-5 covered (missing 6-10) | Partial |
| task-readme-lifecycle.md | Yes | 13/13 | 1-5 covered (missing 6-10) | Partial |
| document-depth.md | Yes | 13/13 | 1-6 covered (missing 7-10) | Partial |
| engineering-standards.md | Yes | 13/13 | 1-5 covered (missing 6-10) | Partial |
| cluster-orchestration.md | Yes | 13/13 | 1-10 covered | Full |
| task-tracking-workflow-spec.md | Yes | 13/13 | 1-12 covered | Full+ |
| task-directory-tree-spec.md | Yes | 13/13 | 1-4 covered (missing 5-10) | Partial |
| file-naming-spec.md | Yes | 13/13 | 1-13 covered (over-structured for a spec) | Full+ |
| context-compaction-spec.md | Yes | 13/13 | 1-10 covered | Full |
| completeness-audit-spec.md | Yes | 13/13 | 1-7 covered (missing 8-10) | Partial |
| dirty-hygiene-spec.md | Yes | 13/13 | 1-9 covered (missing 10) | Partial |
| storage-location-contract.md | No front matter | 0/13 | 7 sections (different format) | **FAIL** |

**Result**: 25/27 contracts have YAML front matter. `storage-location-contract.md` uses plain markdown without YAML front matter, violating the contract-schema requirement. The front matter fields are generally complete where present, but many contracts are missing the later semantic sections (8-10: verification, migration strategy, non-goals).

### 11.2 Spec File Simplification

The contract-schema allows Spec files (`-spec.md`) to use a simplified 4-section layout: 目的 -> 规则 -> 触发条件 -> 违反处理. Checking spec files:

| Spec File | Uses simplified layout | Compliant |
|-----------|----------------------|-----------|
| task-tracking-workflow-spec.md | No — uses full 12-section layout | Yes (full is allowed) |
| task-directory-tree-spec.md | No — uses 4-section layout but not exactly matching the simplified template | Partial |
| file-naming-spec.md | No — uses 13-section layout | Yes (full is allowed) |
| context-compaction-spec.md | No — uses 10-section layout | Yes (full is allowed) |
| completeness-audit-spec.md | No — uses 7-section layout | Partial |
| dirty-hygiene-spec.md | No — uses 9-section layout | Partial |

None of the spec files strictly follow the simplified template, but the schema says "可简化为" (may be simplified to), not "必须" (must). So this is a deviation, not a violation.

---

## 12. Summary of Findings by Severity

### Critical (3)

1. **Circular dependency: action-governance <-> skill-tool-mapping** — Unresolvable dependency order at initialization.
2. **Circular dependency: lego-assembly-workflow <-> work-packet-governance <-> cluster-orchestration** — Triangular dependency in build phase cluster.
3. **architecture-blueprint 13-layer sequence has no enforcement** — Core build-phase foundation declared but not enforced.

### High (5)

4. **negative_activation mechanism: declared but no execution face** — Rule exists with zero enforcement.
5. **verification-checker catalog: all checkers are conceptual, not executable** — "Evidence-driven" principle not met.
6. **Review gate vs stage checklist mapping is not explicit** — Agent must infer which checklist to use for which gate at which stage.
7. **8 state dimensions must be tracked simultaneously** — Excessive cognitive load for agents.
8. **86% of declared rules are soft enforcement** — System declares "hard rules" but enforces via convention only.

### Medium (6)

9. **context-governance conflicts_with context-compaction without resolution policy** — Ambiguity during budget pressure.
10. **workflow_route enum does not align with 7-stage model** — Vocabulary mismatch between routing and stages.
11. **intent-capture missing job_to_be_done field** — JTBD framework core missing from 9-field set.
12. **12-layer work packet decomposition excessive for most tasks** — With no criteria for simplification.
13. **storage-location-contract.md missing YAML front matter** — Schema compliance failure.
14. **Multiple phase naming schemes (7-stage Chinese, 10-phase English, workflow_route English)** — Three naming systems for the same concept.

### Low (4)

15. **Registry effective_scope syntax over-engineered** — Advanced syntax features rarely used.
16. **Memory decay has no automated trigger** — Nice-to-have cleanup, not correctness-critical.
17. **Review pack file overhead for simple transitions** — 5 files per review bundle may exceed value.
18. **Feedback loop has no enforcement** — Feedback collected but not guaranteed to create follow-up tasks.

---

*End of architecture audit report.*
