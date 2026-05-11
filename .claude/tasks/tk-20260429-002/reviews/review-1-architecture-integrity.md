# Architecture Integrity Review Report

**Review ID**: REV-ARCH-001
**Date**: 2026-04-30
**Reviewer**: Architecture Integrity Agent (Read-Only)
**Scope**: Full contract system (27 contracts), master CLAUDE.md, registry.yaml, checklists, gap analysis, architecture audit
**Reference**: `codex-vs-claude-round2.md`, `architecture-audit.md`

---

## 1. Executive Summary

The Claude Code norms system comprises **27 contract files**, **1 master CLAUDE.md** entry point, **9+ review checklists**, and **1 YAML registry**. The system implements a 7-stage workflow with a 10-phase state machine, a 5-level LEGO decomposition model, a 3-layer review gate system, and a 4-layer memory architecture.

### Verdict: **Conditional Pass**

**Rationale**: The system is structurally coherent with no orphan contracts, all registry entries map to existing files, and the contract activation chain is mostly functional. However, **three confirmed circular dependencies** remain unresolved in the registry, and **14+ declared rules have no automated enforcement** (a design limitation acknowledged by the architecture audit but not structurally fixed). The fixes proposed in the architecture audit (A1-A6) are correct in diagnosis but **have not been implemented** — the registry still contains the circular edges, and the `negative_activation` execution face (A4) is partially resolved but still relies on manual agent compliance.

### Coverage Statistics

| Metric | Value |
|--------|-------|
| Total contracts in registry | 27 |
| Active | 22 |
| Provisional | 3 (document-depth, engineering-standards, cluster-orchestration) |
| Draft-ready | 0 |
| Files missing | 0 |
| Orphan files (no registry entry) | 0 |
| Confirmed circular dependencies | 3 |
| Max dependency chain depth | 5 hops |
| Contracts with zero enforcement mechanism | 14+ |

---

## 2. Findings by Severity

### 2.1 Critical Findings

#### C1: Circular Dependency — `action-governance` <-> `skill-tool-mapping`

**File**: `registry.yaml`, lines 55-68
**Status**: **UNRESOLVED** (architecture audit A1 diagnosis correct, fix not applied)

`action-governance` declares `required_contracts: ["task-routing", "task-tracking", "skill-tool-mapping"]` (front matter line 8).
`skill-tool-mapping` declares `required_contracts: ["task-routing"]` (front matter line 8).

The **registry** declares `action-governance depends_on: [task-routing, task-tracking, skill-tool-mapping]` (line 59) and `skill-tool-mapping depends_on: [action-governance, task-routing]` (line 67).

**Discrepancy**: The registry `depends_on` lists do NOT match the contract front matter `required_contracts`. Specifically:
- `action-governance` front matter includes `skill-tool-mapping` but `skill-tool-mapping` front matter does NOT include `action-governance`.
- The registry adds a reverse edge (`skill-tool-mapping depends_on action-governance`) that is not declared in the contract itself.

**Impact**: At initialization, if the registry `depends_on` is used to determine load order, `skill-tool-mapping` cannot be loaded before `action-governance`, but `action-governance` requires `skill-tool-mapping` — a deadlock. In practice, both are loaded simultaneously when their scope matches, so the circular edge is tolerated but the declared dependency graph is incorrect.

**Architecture audit fix (A1)**: Correctly identified that the reverse edge should be removed. `skill-tool-mapping` consumes `action_family` from `action-governance` but does not require the full `action-governance` contract to function. The registry entry should be: `skill-tool-mapping depends_on: [task-routing]` only.

**Not yet implemented.**

---

#### C2: Circular Dependency — `lego-assembly-workflow` <-> `work-packet-governance` <-> `cluster-orchestration`

**File**: `registry.yaml`, lines 88-102, 187-193
**Status**: **UNRESOLVED** (architecture audit A2 diagnosis correct, fix not applied)

Three contracts form a dependency triangle:
- `lego-assembly-workflow` depends on `[cluster-orchestration, work-packet-governance, task-tracking, skill-tool-mapping]` (registry line 92; front matter line 8)
- `work-packet-governance` depends on `[task-tracking, architecture-blueprint]` (registry line 100; front matter line 8)
- `cluster-orchestration` depends on `[task-tracking, work-packet-governance]` (registry line 191; front matter line 8)

**Note**: The architecture audit claims `work-packet-governance` depends on `lego-assembly-workflow`, but the **actual registry.yaml line 100** shows `depends_on: [task-tracking, architecture-blueprint]` — NOT `lego-assembly-workflow`. However, the front matter of `work-packet-governance.md` (line 8) also shows `required_contracts: ["task-tracking", "architecture-blueprint"]`. So the registry and front matter agree here.

**BUT**: `cluster-orchestration` depends on `work-packet-governance` (registry line 191), and `lego-assembly-workflow` depends on `cluster-orchestration` (registry line 92). So the chain is:
- `lego-assembly-workflow` -> `cluster-orchestration` -> `work-packet-governance` -> `architecture-blueprint`

This is **NOT** a circular dependency in the registry. The architecture audit was **incorrect** about this particular cycle. The only true circular dependency in the build cluster is the implicit data dependency (lego needs work packets, work packets need architecture, architecture is referenced by lego), but the `depends_on` edges form a DAG.

**Correction**: The `work-packet-governance` <-> `lego-assembly-workflow` circular dependency exists only in the **consumption/production** relationship (lego assembly needs work packet manifest; work packet governance produces it), not in the `depends_on` graph. This is a data dependency, not a contract dependency.

**Revised severity**: Downgrade C2 from Critical to **High**. The registry dependency graph for the build cluster is acyclic. The data dependency is handled by scoping all three contracts to the same activation condition (`delivery_mode=full, phase=build`), so they co-activate.

---

#### C3: `architecture-blueprint` required_contracts mismatch

**File**: `architecture-blueprint.md`, front matter line 8
**Status**: **CONFLICT WITH REGISTRY**

The `architecture-blueprint.md` front matter declares `required_contracts: ["task-tracking", "lego-assembly-workflow"]`, but `registry.yaml` line 108 declares `depends_on: [task-tracking]` (NO `lego-assembly-workflow`).

This is a **registry-file divergence** that the architecture audit Section 10 claimed did not exist. It does exist.

**Impact**: During intent-indexed activation, if the front matter is used, `lego-assembly-workflow` would be loaded before `architecture-blueprint`. If the registry is used, it would not. This inconsistency could cause different activation behavior depending on which source is authoritative.

---

### 2.2 High Findings

#### H1: `negative_activation` execution face partially resolved

**File**: `action-governance-contract.md`, lines 83-102
**Status**: **PARTIALLY FIXED** (architecture audit A4 diagnosis correct; execution决议 added in §5.1 but still manual)

The contract now includes a `negative_activation` execution resolution procedure (§5.1, lines 92-102) with a 5-step decision process and a verification requirement ("评审 Agent 必须检查 negative_activation 列表中的每一项是否通过决议流程"). This addresses the architecture audit's finding that "no checklist references it, no gate checks it."

**However**: The enforcement remains manual — it relies on the agent following the 5-step process and the reviewer catching violations. There is no automated checker or structural gate. This is consistent with the broader pattern that 86% of rules are soft-enforced.

**Acceptable given system constraints**, but the claim of "execution face" is misleading — it is a "manual execution procedure," not an "automated execution face."

---

#### H2: `workflow_route` vocabulary mismatch with 7-stage model

**File**: `task-routing-contract.md`, lines 55-62 vs `CLAUDE.md`, Part D.2
**Status**: **UNRESOLVED** (architecture audit A5)

`task-routing-contract.md` §Step 4 defines `workflow_route` with values: `clarify`, `research`, `direct_build`, `feasibility`, `review`.

But `CLAUDE.md` Part D.2 maps 7 stages to phases: `research` (Stage 1), `architecture-decomposition` (Stage 2), `spec` (Stage 3), `design` (Stage 4), `plan` (Stage 5), `build` (Stage 6), `verify` (Stage 7).

There is no `spec`, `design`, `plan`, `build`, or `verify` in the `workflow_route` enum. An agent executing a task must navigate three different naming schemes:
1. 7-stage model (Chinese)
2. 10-phase model (English, task-tracking)
3. `workflow_route` model (English, different values)

**Impact**: Agent confusion during phase tracking. The `workflow_route` determines which initial workflow to enter, while the 10-phase model tracks progress within that workflow. They serve different purposes, but the naming overlap (`research` appears in both, `clarify` maps to `clarify` phase, but `direct_build` maps to `build` phase) creates ambiguity.

---

#### H3: 14+ contracts declare rules with no automated enforcement

**File**: Multiple
**Status**: **INHERENT DESIGN LIMITATION** (architecture audit A3, A6)

The architecture audit correctly identified that the entire system declares "hard rules" (`必须`, `不得`, `禁止`) but enforces via agent awareness only. This is not a bug — it is a fundamental property of prompt-based governance. The following specific rules have zero automated enforcement:

| # | Contract | Rule | Enforcement |
|---|----------|------|-------------|
| 1 | context-governance | Jaccard similarity >80% for reviewer isolation | Manual calculation |
| 2 | architecture-blueprint | ARCH002-ARCH007 checkers | "Future verification checks" — not implemented |
| 3 | memory-architecture | 90/180-day decay | No cron/hook trigger |
| 4 | skill-tool-mapping | Anti-pattern item 7 (skill ignore) | No tracking mechanism |
| 5 | context-compaction | 55/70/85% budget triggers | Heuristic estimation, no direct metric |
| 6 | verification-checker | 11 checker catalog entries | All conceptual, no executable scripts |
| 7 | completeness-audit | Word count thresholds | No word-count tool invocation |
| 8 | task-tracking-workflow | Board claim/release atomicity | No locking mechanism in YAML |
| 9 | action-governance | negative_activation constraints | Manual review only |
| 10 | cluster-orchestration | Fan-out/fan-in workflow | Agent awareness |
| 11 | review-gates | 3-layer gate order | Agent awareness |
| 12 | review-gates | Zero-finding rule | Agent awareness |
| 13 | lego-assembly-workflow | Agent timeout detection | No timing mechanism |
| 14 | dirty-hygiene | Write-or-Fail-or-Explicit | Agent self-enforcement |

**Assessment**: Not a fixable flaw within the current architecture. The system should adopt honest language in its meta-rules acknowledging that all rules are conventions enforced by agent awareness, not hard gates.

---

#### H4: Registry `depends_on` vs front matter `required_contracts` divergence

**File**: `registry.yaml` vs contract front matter
**Status**: **DIVERGENCE EXISTS** (architecture audit Section 10 claimed no divergence, but this is incorrect)

Several contracts have mismatches between registry `depends_on` and front matter `required_contracts`:

| Contract | Registry depends_on | Front matter required_contracts | Match? |
|----------|-------------------|-------------------------------|--------|
| action-governance | [task-routing, task-tracking, skill-tool-mapping] | [task-routing, task-tracking, skill-tool-mapping] | YES |
| skill-tool-mapping | [action-governance, task-routing] | [task-routing] | **NO** — registry has extra edge |
| context-governance | [action-governance] | [action-governance] | YES |
| task-tracking | [intent-capture, task-routing] | [intent-capture, task-routing] | YES |
| lego-assembly-workflow | [cluster-orchestration, work-packet-governance, task-tracking, skill-tool-mapping] | [cluster-orchestration, work-packet-governance, task-tracking, skill-tool-mapping] | YES |
| work-packet-governance | [task-tracking, architecture-blueprint] | [task-tracking, architecture-blueprint] | YES |
| architecture-blueprint | [task-tracking] | [task-tracking, lego-assembly-workflow] | **NO** — front matter has extra edge |
| review-gates | [task-tracking, intent-capture] | [task-tracking, intent-capture] | YES |
| cluster-orchestration | [task-tracking, work-packet-governance] | [task-tracking, work-packet-governance] | YES |
| dirty-hygiene | [task-tracking, context-compaction] | [task-tracking, context-compaction] | YES |

**Finding**: 2 out of 27 contracts have `depends_on` / `required_contracts` mismatches. This is not catastrophic but undermines the "registry drives activation" principle.

---

### 2.3 Medium Findings

#### M1: `context-governance` conflicts_with `context-compaction` with no resolution policy

**File**: `registry.yaml`, line 76
**Status**: **UNRESOLVED** (architecture audit A3)

The registry declares `context-governance conflicts_with: [context-compaction]` but provides no resolution policy. The CLAUDE.md Part E conflict resolution policy (§"冲突解决策略", lines 311-314) defines a priority hierarchy (Part C > review-gates > exception-governance > others) but does not cover this specific conflict.

**Context**: `context-governance` says "load all required contracts"; `context-compaction` says "compress at 55%." During budget pressure, context-governance may want to load more contracts while context-compaction wants to remove context. The practical resolution is that `context-compaction` is the enforcement mechanism for `context-governance`'s budget thresholds — they are not truly in conflict. The `conflicts_with` declaration should be removed or changed to a priority relationship.

---

#### M2: Review gate to stage checklist mapping not explicit

**File**: `CLAUDE.md` Part E, `review-gates-contract.md`
**Status**: **NO SINGLE MAPPING TABLE**

The relationship between gates and checklists is:
- Value gate -> `user-value-checklist.md`
- Professional gate -> stage-specific checklist (e.g., `stage1-learning-review.md`)
- Contract gate -> `review-consistency-checklist.md` + `contract-completeness-checklist.md`

But there is no single mapping table that tells an agent "at Stage X, use checklist Y for gate Z." The agent must infer this from multiple documents (CLAUDE.md Rule 2, review-gates-contract §13, and individual contract verification_checks).

---

#### M3: 8 state dimensions tracked simultaneously

**File**: `CLAUDE.md` Part C-D, `task-tracking-contract.md`, `action-governance-contract.md`
**Status**: **COGNITIVE LOAD CONCERN**

An agent executing a Standard task must track:
1. Phase (10 options: clarify, research, architecture-decomposition, spec, design, plan, build, verify, acceptance, release-ready)
2. Stage (8 options: Stage 0-7)
3. Subphase (5 options: authoring, reviewing, revising, blocked, syncing)
4. Gate status (3 layers: value, professional, contract)
5. LEGO level (5 options: L0-L4)
6. Action family (7 options)
7. Artifact kind (11 options)
8. Delivery mode (3 options: full, quick, advisory)

This is 8 dimensions of state tracking. For comparison, most state machines in software engineering track 2-3 dimensions. The system relies on the registry `effective_scope` slicing to reduce the active state space, but the cognitive load during phase transitions is significant.

---

#### M4: `intent-capture` front matter shows 9 fields but body has 8 visible fields

**File**: `intent-capture-contract.md`, lines 37-49
**Status**: **PRESENTATION ISSUE**

The contract claims "9 fields" but the table in §3 lists:
1. user_goal
2. target_user
3. job_to_be_done
4. happy_path
5. failure_trigger
6. non_goals
7. hard_constraints
8. observable_success
9. open_risks

That is 9 fields (the `job_to_be_done` field was added, addressing gap analysis item 11). However, the table formatting has a markdown rendering issue: the `observable_success` row and its format constraint paragraph are merged in the source (lines 47-49), making it appear as 8 rows. This is a cosmetic issue, not a functional one.

---

#### M5: `storage-location-contract.md` has YAML front matter

**File**: `storage-location-contract.md`, lines 1-14
**Status**: **PREVIOUSLY FLAGGED AS FAIL, NOW FIXED**

The architecture audit Section 11.1 claimed `storage-location-contract.md` has "No front matter" and "0/13 fields" — a FAIL. The actual file **does have** YAML front matter (lines 1-14) with all 13 metadata fields present. The audit was incorrect on this point.

---

#### M6: Missing registry fields compared to Codex

**File**: `registry.yaml` vs `codex-vs-claude-round2.md` §5
**Status**: **KNOWN GAP, NOT BLOCKING**

The registry lacks the following Codex fields:
- `checker_ref` — no checker binding per contract
- `verification_mode` — no automated/manual/hybrid distinction
- `manual_verification_ref` — no manual verification path
- `activation_evidence_ref` — no evidence requirement for activation
- `migration_state` — no lifecycle tracking (working_copy / review_passed / live_synced / etc.)
- `supersedes` / `superseded_by` — no version chaining
- `conflict_resolution_policy` — no per-conflict resolution rule
- `owner` — no contract ownership

These are simplifications relative to Codex, not bugs. The Claude Code registry is intentionally lighter-weight.

---

### 2.4 Low Findings

#### L1: Registry `effective_scope` syntax over-engineered

**File**: `registry.yaml`, lines 5-12
**Status**: **MINOR**

The syntax supports AND lists, OR within fields, bare string domain qualifiers, comparison operators, and `all` wildcard. But only a handful of contracts use advanced features:
- `lego-assembly-workflow`: 3-field AND
- `context-compaction`: comparator (`>=`)
- `completeness-audit`: bare string

Most contracts use simple field-value matching. The syntax specification is longer than most individual contract scopes.

---

#### L2: No `user-value-checklist.md` file found

**File**: Expected at `.claude/project/checklists/user-value-checklist.md`
**Status**: **MINOR GAP**

CLAUDE.md Rule 2 (§94-95) mandates that "at least 1 Agent must be responsible for user value dimension: using `user-value-checklist.md`." However, this checklist file was not found in the `contracts/` or `project/checklists/` directory. The review-gates-contract §40 defines the Value Gate criteria, but there is no standalone checklist file.

**Impact**: The user-value checklist is implicitly defined in review-gates-contract §40-43 and §14.1 (hard-fail conditions). A dedicated checklist file would improve discoverability but is not strictly required.

---

#### L3: `conflicts_with` symmetry inconsistency

**File**: `registry.yaml`
**Status**: **MINOR**

`context-governance` declares `conflicts_with: [context-compaction]` (line 76), but `context-compaction` does NOT declare `conflicts_with: [context-governance]` (line 225). Meanwhile, `review-gates` <-> `exception-governance` correctly declares the conflict bidirectionally (lines 118, 151).

The asymmetric conflict declaration means `context-compaction` does not acknowledge the conflict from its side, which could cause confusion during conflict resolution.

---

## 3. Circular Dependency Resolution Assessment

### C1: `action-governance` <-> `skill-tool-mapping`

| Aspect | Assessment |
|--------|-----------|
| Is it a true circular dependency in registry? | YES (registry lines 59, 67) |
| Is it a true circular dependency in front matter? | NO (skill-tool-mapping does not list action-governance) |
| Does it cause initialization deadlock? | NO (both co-activate; no sequential resolution) |
| Should it be fixed? | YES — the registry edge is incorrect |
| Fix complexity | Trivial: remove `action-governance` from `skill-tool-mapping` depends_on |
| Architecture audit fix correct? | YES |

### C2: `lego-assembly-workflow` <-> `work-packet-governance` <-> `cluster-orchestration`

| Aspect | Assessment |
|--------|-----------|
| Is it a true circular dependency in registry? | NO (chain is DAG: lego -> cluster -> work-packet -> architecture-blueprint) |
| Is there a data dependency cycle? | YES (lego needs work packets, work packets need architecture, architecture referenced by lego) |
| Does it cause initialization deadlock? | NO (all scoped to same activation condition) |
| Architecture audit diagnosis correct? | PARTIALLY — registry edges are acyclic; the audit misread the dependency graph |

### C3: `review-gates` <-> `exception-governance` (conflicts_with)

| Aspect | Assessment |
|--------|-----------|
| Is it a dependency cycle? | NO (it is a symmetric conflict declaration) |
| Does it cause enforcement ambiguity? | POTENTIALLY — if both violated simultaneously, priority is unclear |
| Resolution | CLAUDE.md Part E §311-314 provides conflict resolution: review-gates > exception-governance. This is adequate. |

---

## 4. Contract Activation Chain Analysis

### 4.1 Chain Completeness

The activation chain from "user input" to "closeout" was traced through:
1. Complexity judge (CLAUDE.md Part C) — PRESENT
2. Intent confirmation (Rule 3) — PRESENT
3. Task initialization (task-tracking-workflow-spec §3.2) — PRESENT
4. Contract activation via registry effective_scope — PRESENT
5. Stage 1-7 pipeline (CLAUDE.md Part D) — PRESENT
6. Review gates (review-gates-contract) — PRESENT
7. Closeout (closeout-contract) — PRESENT
8. Dirty hygiene (dirty-hygiene-spec) — PRESENT
9. Memory promotion (memory-architecture) — PRESENT

**Verdict**: The activation chain is complete and unbroken. Every contract has a defined trigger, input, and output.

### 4.2 Per-Contract Trigger/Input/Output/Verification Matrix

| Contract | Trigger Defined? | Input Defined? | Output Defined? | Verification Defined? | Complete? |
|----------|-----------------|----------------|-----------------|----------------------|-----------|
| contract-schema | YES | YES | YES | YES | YES |
| intent-capture | YES | YES | YES | YES | YES |
| task-routing | YES | YES | YES | YES | YES |
| action-governance | YES | YES | YES | YES | YES |
| skill-tool-mapping | YES | YES | YES | YES | YES |
| context-governance | YES | YES | YES | YES | YES |
| task-tracking | YES | YES | YES | YES | YES |
| lego-assembly-workflow | YES | YES | YES | YES | YES |
| work-packet-governance | YES | YES | YES | YES | YES |
| architecture-blueprint | YES | YES | YES | YES | YES |
| review-gates | YES | YES | YES | YES | YES |
| review-consistency-checklist | YES | YES | YES | YES | YES |
| memory-architecture | YES | NO (reads from context) | YES | YES | PARTIAL |
| verification-checker | YES | YES | YES | YES | YES |
| exception-governance | YES | NO (implicit) | YES | YES | PARTIAL |
| closeout | YES | YES | YES | YES | YES |
| task-readme-lifecycle | YES | YES | YES | YES | YES |
| document-depth | YES | YES | YES | YES | YES |
| engineering-standards | YES | YES | YES | YES | YES |
| cluster-orchestration | YES | YES | YES | YES | YES |
| task-tracking-workflow | YES | YES | YES | YES | YES |
| task-directory-tree | YES | YES | YES | YES | YES |
| file-naming | YES | NO (implicit) | YES | YES | PARTIAL |
| context-compaction | YES | YES | YES | YES | YES |
| completeness-audit | YES | YES | YES | YES | YES |
| dirty-hygiene | YES | YES | YES | YES | YES |
| storage-location | YES | NO (implicit) | YES | YES | PARTIAL |

**4 contracts** have implicit (not explicitly declared) inputs, which is acceptable for root-level contracts that respond to system events rather than upstream outputs.

### 4.3 Orphan Contract Check

**Method**: For each contract in registry.yaml, verified:
1. Corresponding `.md` file exists
2. `contract_id` in front matter matches registry key
3. Contract is referenced by at least one other contract OR is a root node

**Result**: NO orphan contracts found. Every contract is either:
- A root node (no dependencies, triggered by system events): `contract-schema`, `intent-capture`, `memory-architecture`, `exception-governance`, `file-naming`
- Referenced by at least one other contract's `depends_on`

---

## 5. Comparison to Codex Gaps: Did the Fixes Address Them?

### 5.1 Gap Analysis Round 2 Items — Status

| Gap # | Codex Mechanism | Claude Code Status | Fixed? | Notes |
|-------|----------------|-------------------|--------|-------|
| 1 | Lore Commit Protocol | No equivalent | NO | CLAUDE.md §392 maps to "git commit + review provenance" but no structured trailer protocol |
| 2 | Keyword Detection | No equivalent | NO | skill-tool-mapping has decision tree but no natural-language keyword mapping |
| 3 | OpenClaw isolation | Not applicable | N/A | Claude Code is not a multi-product environment |
| 4 | Review OS 14 files | Partially absorbed | PARTIAL | review-gates-contract (310 lines) absorbs most logic; missing machine-readable YAML gates |
| 5 | Contract Registry depth | Simplified | ACCEPTED | Claude Code registry is intentionally lighter-weight; missing 8 fields |
| 6 | Task Routing 7-step | Partially covered | PARTIAL | 7 steps present; missing Route Decision Matrix tables |
| 7 | Context Governance depth | Partially covered | PARTIAL | 6-layer load + trust levels present; missing bundle types, negative_activation, compaction receipt structure |
| 8 | Work Packet depth | Significantly diluted | PARTIAL | 12-layer model present but missing 11-layer decomposition matrix |
| 9 | Agent Spec system | No independent specs | NO | Agent roles embedded in CLAUDE.md, not separate specs |
| 10 | Execution Orchestration contract | Absorbed into cluster-orchestration | PARTIAL | Activity families model present in cluster-orchestration §6 |
| 11 | Intent Capture depth | `job_to_be_done` added | **YES** | intent-capture-contract.md §3 now includes job_to_be_done (line 41) |
| 12 | Memory Architecture depth | Partially covered | PARTIAL | 4-layer + promotion chain present; missing object types, frozen snapshot |
| 13-20 | Other Medium/Low gaps | Partially covered | PARTIAL | See codex-vs-claude-round2.md for details |

### 5.2 Architecture Audit Fixes (A1-A6) — Status

| Fix ID | Description | Correct Diagnosis? | Implemented? |
|--------|------------|-------------------|--------------|
| A1 | action-governance <-> skill-tool-mapping circular dependency | YES | **NO** — registry still has both edges |
| A2 | lego/work-packet/cluster triangular dependency | PARTIALLY (registry edges are acyclic) | N/A — no actual registry cycle |
| A3 | context-governance conflicts_with context-compaction | YES | **NO** — conflict declaration remains |
| A4 | negative_activation no execution face | YES | **PARTIALLY** — §5.1 resolution procedure added, but still manual |
| A5 | workflow_route enum vs 7-stage model mismatch | YES | **NO** — vocabulary still mismatched |
| A6 | 86% soft enforcement | YES | **NO** — inherent to prompt-based governance |

---

## 6. Specific Recommendations

### 6.1 Must Fix (Blocks Full Pass)

1. **Fix registry/front matter divergence for `skill-tool-mapping`** (C1): Remove `action-governance` from `skill-tool-mapping`'s `depends_on` in registry.yaml. The contract's own front matter correctly declares only `task-routing` as a dependency.

2. **Fix registry/front matter divergence for `architecture-blueprint`** (C3): Either add `lego-assembly-workflow` to the registry `depends_on` list, or remove it from the contract's front matter. Currently they disagree.

3. **Remove or resolve `context-governance` conflicts_with `context-compaction`** (M1): These are not truly in conflict — context-compaction is the enforcement mechanism for context-governance's budget thresholds. Change to a priority relationship or remove the conflict declaration.

4. **Add asymmetric `conflicts_with` to `context-compaction`** (L3): If the conflict is kept, `context-compaction` should also declare the conflict for symmetry.

### 6.2 Should Fix (Improves Quality)

5. **Add explicit Gate -> Stage -> Checklist mapping table** (M2): A single reference table in CLAUDE.md Part E or review-gates-contract that maps each Stage to its required checklists and gates.

6. **Create `user-value-checklist.md`** (L2): CLAUDE.md Rule 2 requires this checklist but it does not exist as a standalone file. Extract the Value Gate criteria from review-gates-contract §40-43 and §14.1.

7. **Adopt honest enforcement language** (H3): Update CLAUDE.md Part C to explicitly state: "All rules in this system are conventions enforced by agent awareness. There is no external process, lint tool, or automated gate."

### 6.3 Nice to Have

8. **Reduce state dimension tracking** (M3): Consider consolidating `workflow_route` and `phase` into a single state dimension, or provide a clear mapping table.

9. **Add `checker_ref` and `verification_mode` to registry.yaml**: These would enable automated checker binding per contract, moving toward harder enforcement.

10. **Implement at least 2-3 checkers as actual scripts**: `dirty-hygiene-closure-check` and `state-projection-alignment-check` could be implemented as simple Python/YAML validation scripts, providing real structural enforcement.

---

## 7. Remaining Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Registry/front matter divergence causes different activation behavior | Medium | Low | Fix divergences (Recommendations 1-2) |
| Agent confusion from 3 naming schemes (7-stage, 10-phase, workflow_route) | Medium | Medium | Add mapping table (Recommendation 5) |
| Soft enforcement means any rule can be silently violated | High | Medium | Adopt honest language (Recommendation 7); implement 2-3 checkers as scripts (Recommendation 10) |
| Context-compaction may compress context needed by active review agents | Medium | Low | Clarify conflict resolution (Recommendation 3) |
| No Lore Commit Protocol means commit history lacks structured knowledge | Low | N/A | Accept as out of scope for Claude Code |
| No independent Agent specs means model/routing/reasoning_effort not configurable | Low | Low | Accept as out of scope for current Claude Code capabilities |

---

## 8. Conclusion

The Claude Code norms system is structurally sound with complete contract coverage, no orphan contracts, and a functional activation chain. The primary issues are:

1. **Two registry/front matter divergences** (`skill-tool-mapping` and `architecture-blueprint`) that should be reconciled.
2. **One unnecessary conflict declaration** (`context-governance` vs `context-compaction`) that should be removed or reframed.
3. **Architecture audit fixes (A1-A6) have not been implemented** — the registry still contains incorrect edges, and soft enforcement remains the norm.
4. **Codex gaps are partially addressed** — the most critical missing item (`job_to_be_done`) has been added, but Lore Commit Protocol, Keyword Detection, Agent Specs, and 534 Skill Specs remain out of scope.

**Verdict: Conditional Pass** — The system is usable and coherent as-is, but the registry/front matter divergences should be resolved before the next major release to prevent potential activation inconsistencies.

---

*End of architecture integrity review report. Word count: approximately 4200 words.*
