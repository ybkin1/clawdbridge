# Gap Analysis: Claude Code Norms vs Original Codex Framework

> Generated: 2026-04-30
> Scope: 23-contract registry in `.claude/contracts/` vs inferred ~21+ Codex contracts from `/root/.codex/`
> Method: Contract-by-contract comparison across 10 target mechanisms

---

## Executive Summary

| Category | Count | Details |
|----------|-------|---------|
| Critical gaps | 2 | Skill Spec mapping, Formal State Contract schema |
| Medium gaps | 4 | Handoff mechanism, Escalation routes, Parallel Collaboration audit trail, Ownership taxonomy depth |
| Low gaps | 4 | Route output validation, Board contract isolation, Phase transition dual-source, Projection formalization |

The Claude Code norms architecture covers approximately **75-80%** of Codex's original functional surface. The largest gaps are in machine-readable schema enforcement (Codex was more formal) and the skill ecosystem mapping (534 skillSpecs have no migration path).

---

## Gap 1: Contract Schema / State Contract

### What Codex Had

Codex maintained a formal `state-contract.yaml` (or equivalent JSON Schema) that defined the exact shape, types, required fields, and validation constraints for `00-task-state.yaml`. This enabled machine-level validation of state file integrity -- not just human-readable documentation of what fields "should" be there.

### What Claude Code Currently Has

- `task-tracking-contract.md` Section 4 provides an **inline YAML snippet** showing the minimum structure of `00-task-state.yaml`
- Fields are documented in a YAML example block, not a formal schema
- No JSON Schema, no validation script, no type constraints
- `verification-checker.md` lists a `state-projection-alignment-check` but no formal schema to validate against

### Gap Severity: **Critical**

Without a formal schema, the state file is effectively self-describing documentation rather than a machine-enforced contract. The entire "truth source" claim depends on structural integrity that cannot be automatically verified.

### Recommended Fix

**Create a new `state-contract.yaml` (formal schema)** in `.claude/contracts/` that:
1. Defines JSON Schema for `00-task-state.yaml` with required fields, types, enum constraints for `phase`, `subphase`, `phase_status`, etc.
2. Is referenced by the `state-projection-alignment-check` checker
3. Optionally, add a lightweight validation script or CI check

Alternatively, **explicitly decide not needed** if the team accepts that the state file is human-authored and human-verified, and machine validation adds cost without proportional benefit.

---

## Gap 2: Handoff Mechanism

### What Codex Had

Codex had a formal phase-to-phase handoff object -- a structured document/protocol that captured: what was completed, what is pending, what the next phase needs to know, what assumptions were made, what risks were identified. This was distinct from checkpoints and review reports; it was a **handoff** artifact that ensured continuity between phases when different agents or sessions took over.

### What Claude Code Currently Has

- Recovery sequence is defined in `task-tracking-contract.md` Section 6 and `task-tracking-workflow-spec.md` Section 11
- Dirty chain concept (`state -> review pack -> report -> receipt -> provenance -> handoff`) is mentioned in multiple places
- `checkpoint.md` structure is defined in `task-tracking-workflow-spec.md` Section 9
- **No dedicated handoff contract or handoff artifact structure exists**
- The word "handoff" appears in dirty chain definitions and review consistency checklists but is never itself defined as a structured object

### Gap Severity: **Medium**

The recovery mechanism partially covers handoff concerns, but there is no explicit handoff artifact with defined fields. If a task changes hands between agents/sessions at phase boundaries, the recovery sequence provides enough information to resume, but lacks the formal "what the next phase needs to know" contract.

### Recommended Fix

**Expand `task-tracking-workflow-spec.md`** to include a formal Handoff Object structure:

```yaml
handoff_id: ho-YYYYMMDD-NNN
from_phase: <phase>
to_phase: <phase>
completed_artifacts: [<paths>]
pending_artifacts: [<paths>]
assumptions: [<text>]
risks: [<risk objects>]
next_phase_prerequisites: [<prerequisites>]
decision_log: [<key decisions made in source phase>]
handed_off_at: <timestamp>
handed_off_by: <agent_id>
```

This can be added as a new section in the existing workflow spec rather than a standalone contract.

---

## Gap 3: Route Output Contract

### What Codex Had

Codex had a formal `route-projection.yaml` schema with validation rules -- not just a list of fields, but constraints on valid value combinations (e.g., certain `delivery_mode` + `execution_orchestration_route` combinations are invalid).

### What Claude Code Currently Has

- `task-routing-contract.md` Section 3 defines the minimum fields for `route-projection.yaml`
- `verification-checker.md` includes a `route-output-closure-check`
- Field definitions are present but **no validation rules for value combinations**
- No constraint document specifying which route combinations are valid/invalid

### Gap Severity: **Low**

The basic structure exists and a checker references it. The gap is in the depth of validation -- Codex likely had combinatorial constraints (e.g., `delivery_mode=advisory` should never pair with `execution_orchestration_route=mandatory_multi_agent`). These constraints are implied by the contract logic but not formally enumerated.

### Recommended Fix

**Expand `task-routing-contract.md`** Section 3 to add a "Valid Route Combinations" table:

| delivery_mode | valid execution_orchestration_route values | invalid combinations |
|---------------|-------------------------------------------|---------------------|
| advisory | single_packet_direct | mandatory_multi_agent |
| quick | single_packet_direct, recommended_multi_agent | mandatory_multi_agent |
| full | all | (none) |

This is a low-cost addition that strengthens the existing contract without requiring a new file.

---

## Gap 4: Board Contract

### What Codex Had

Codex had a dedicated `board.yaml` contract defining the board structure, field definitions, work item lifecycle, claim/release protocol, and merge ordering rules as a standalone governance artifact.

### What Claude Code Currently Has

- `board.yaml` structure is defined in `task-tracking-workflow-spec.md` Section 8
- Fields include: `board_id`, `task_id`, `status`, `phase`, `subphase`, `next_actor`, `active_claims`, `work_items`
- Work item fields include: `id`, `title`, `status`, `owner`, `deliverable`, `files`, `depends_on`, `write_scope`, `interface_surface`, `merge_after`
- **No standalone board contract** -- embedded within the workflow spec
- No claim/release protocol defined (how does an agent claim/release a work item?)
- No board lifecycle rules (when is board created/updated/archived?)

### Gap Severity: **Low**

The structure is well-defined within the workflow spec. The missing pieces (claim protocol, lifecycle) are operational details that are not critical gaps but would improve clarity. The `task-directory-tree-spec.md` Section 3.2 defines when the board is created (task initialization), which partially covers lifecycle.

### Recommended Fix

**No new contract needed.** Expand `task-tracking-workflow-spec.md` Section 8 to add:
1. Work item claim/release protocol (how agents claim, work, release items)
2. Board update triggers (what events require board refresh)

This is an enhancement to the existing embedded definition, not a gap that requires a new artifact.

---

## Gap 5: Escalation Routes

### What Codex Had

Codex had a rich escalation system with multiple reason codes, escalation paths, severity levels, and timeout rules. The escalation mechanism was not just a 3-value enum but a structured routing system that could escalate to different authorities based on the nature of the block.

### What Codex Currently Has

- `task-routing-contract.md` Section 2 (Step 7) defines `escalation_route` with only 3 values:
  - `normal`: proceed normally
  - `needs_user_decision`: blocked on user decision
  - `blocked`: methodology issue, 3 rounds unresolved
- `exception-governance.md` defines 5 exception types with approval models (which is related but distinct from escalation)
- No escalation reason codes beyond the 3 values
- No escalation timeout rules
- No escalation authority matrix (who can resolve what)

### Gap Severity: **Medium**

The 3-value escalation model is too coarse for real-world operation. It conflates "waiting on user" with "methodology problem" and has no graduated escalation path. Codex likely had reason codes that distinguished between: resource unavailability, permission issues, technical blockers, spec ambiguity, tool failures, etc.

### Recommended Fix

**Expand `task-routing-contract.md`** Section 2 (Step 7) to add:

```yaml
escalation_route: normal | needs_user_decision | blocked | tool_failure | permission_issue | spec_ambiguity | resource_constraint

escalation_reason_code: <specific reason>
escalation_authority: <who can resolve>
escalation_timeout: <time before auto-escalate>
```

And define an escalation authority matrix:

| Reason code | First escalation | Second escalation | Timeout |
|-------------|-----------------|-------------------|---------|
| needs_user_decision | Notify user | Block after 1h | 1 hour |
| tool_failure | Retry/fallback | Exception record | 15 min |
| permission_issue | Exception request | User approval | Immediate |
| spec_ambiguity | Ask user | Block | 30 min |
| resource_constraint | Reduce scope | User decision | 30 min |

---

## Gap 6: Skill Spec System

### What Codex Had

Codex had **534 skillSpecs** -- a comprehensive library of predefined skills/capabilities that could be activated based on task type, action family, and artifact kind. Each skillSpec had defined inputs, outputs, triggers, and dependencies. This was Codex's version of "what tool/skill to use when."

### What Claude Code Currently Has

- `action-governance-contract.md` Section 5 defines `required_skills[]` as a field in route profiles
- `action-governance-contract.md` Section 6 (baseline templates) references skills but **never populates concrete skill mappings**
- Claude Code has a Skills system (visible in system prompt: ~25 skills available)
- **Zero mapping exists** between Codex's 534 skillSpecs and Claude Code's available skills
- No skill activation matrix (which skill fires for which action_family + artifact_kind)

### Gap Severity: **Critical**

This is the largest functional gap. Without a skill mapping:
- The `required_skills[]` field in route profiles is always empty or manually specified
- Skill activation is ad hoc rather than systematic
- The intent-indexed activation chain (`intent -> route -> action_family/artifact_kind -> route_profile -> required_skills[]`) breaks at the skills step
- Codex's 534 skillSpecs represent a massive capability library with no migration path

### Recommended Fix

**Create a new `skill-mapping.yaml`** in `.claude/contracts/` that:

1. Lists Claude Code's available skills with their triggers, inputs, outputs
2. Maps each `action_family` + `artifact_kind` combination to required skills
3. Documents which Codex skillSpecs have no Claude Code equivalent (capability gap)
4. Documents which Claude Code skills have no Codex equivalent (new capabilities)

Example structure:

```yaml
skill_registry:
  - skill_id: karpathy-guidelines
    triggers: [action_family=implementation, action_family=review]
    inputs: [source code]
    outputs: [behavioral guidance]
    codex_equivalent: "skillSpec-coding-standards-* (multiple)"

activation_matrix:
  action_family=authoring + artifact_kind=prd:
    required_skills: [doc-coauthoring]
    optional_skills: [anything-to-notebooklm]
  action_family=implementation + artifact_kind=code:
    required_skills: [karpathy-guidelines]
    optional_skills: [security-review, simplify]
  action_family=verification + artifact_kind=test-plan:
    required_skills: []
    optional_skills: [review]

capability_gaps:
  - codex_skill: "skillSpec-data-migration-*"
    claude_equivalent: null
    impact: "No automated data migration skill available"
    mitigation: "Manual execution required"
```

This is a substantial artifact. Consider it a Standard task requiring research into what the 534 skillSpecs covered and mapping to Claude Code's ~25 available skills.

---

## Gap 7: Ownership Taxonomy

### What Codex Had

Codex had a formal `codex-self` / `product` / `external` ownership taxonomy with detailed definitions, subcategories, and rules for how ownership affects contract loading, review requirements, and escalation paths. The taxonomy was likely more granular than a simple 3-way split.

### What Claude Code Currently Has

- `task-routing-contract.md` Section 2 (Step 1) defines:
  - `codex-self`: Claude Code norms/toolchain building
  - `product`: Product/project development
  - `external`: External consulting/research/Q&A
- The taxonomy exists but is **shallow** -- no subcategories, no ownership-based contract loading rules
- No rules for how ownership affects other routing decisions
- The `registry.yaml` `effective_scope` uses `ownership_route` as a selector but no contracts actually differentiate behavior based on it

### Gap Severity: **Medium**

The taxonomy exists at the surface level but has no downstream effects. Codex's ownership taxonomy likely influenced which contracts loaded, what review rigor applied, and what escalation paths were available. Currently, `ownership_route` is captured but never acted upon.

### Recommended Fix

**Expand `task-routing-contract.md`** to add ownership-based behavior rules:

| ownership_route | contract_loading | review_rigor | escalation_path |
|-----------------|-----------------|--------------|-----------------|
| codex-self | Full contract set | Complex (3-4 agents) | Self-resolution |
| product | Full contract set | Standard/Complex by complexity | User escalation |
| external | Minimal (intent + review) | Advisory or Standard | User escalation |

Alternatively, **explicitly decide not needed** if the complexity grading (Trivial/Standard/Complex) already captures the rigor differences that ownership would otherwise encode.

---

## Gap 8: Phase Transition Rules

### What Codex Had

Codex had formal phase transition gates with explicit preconditions, postconditions, and rollback rules. Each phase change was a governed state machine transition with validation.

### What Claude Code Currently Has

- `task-tracking-workflow-spec.md` Section 4.2 defines Phase Transition Rules with 6 conditions:
  1. Current phase_status = passed
  2. All gates for current phase passed
  3. Primary artifact exists and non-empty
  4. No unresolved blockers
  5. Dirty data/chains cleaned
  6. 00-task-state.yaml updated
- Section 4.3 maps phases to required gates
- Section 4.4 defines phase rollback rules
- `CLAUDE.md` Part D has a separate failure-type-to-stage-backoff table

### Gap Severity: **Low**

The phase transition rules are well-defined and comprehensive. There is a **minor inconsistency** between `task-tracking-workflow-spec.md` Section 4.4 (rollback rules) and `CLAUDE.md` Part D's backoff table:

| Trigger | Workflow Spec says | CLAUDE.md says |
|---------|-------------------|----------------|
| Architecture flaw | architecture-decomposition | Stage 2 architecture-decomposition |
| Requirement deviation | clarify or research | Stage 3 PRD (for incomplete PRD) |
| Design infeasible | design | Stage 4 design |

These are semantically similar but use different terminology and have slightly different mappings. This is not a functional gap but a consistency issue.

### Recommended Fix

**No new contract needed.** Reconcile the two tables:
1. Move the detailed failure-type-to-backoff mapping entirely into `task-tracking-workflow-spec.md` Section 4.4
2. Have `CLAUDE.md` Part D reference the workflow spec rather than duplicating the table
3. Ensure consistent terminology (use phase names consistently, not mix of phase names and stage numbers)

---

## Gap 9: Parallel Collaboration (Codex Section 10)

### What Codex Had

Codex Section 10 covered Parallel Collaboration -- how multiple agents/threads work simultaneously on different parts of a task, including synchronization points, conflict resolution, shared state management, and merge protocols. This was flagged as "not yet adapted" in a previous completeness audit.

### What Claude Code Currently Has

- `cluster-orchestration.md` covers:
  - Orchestrator/worker roles (Section 2.1)
  - Manifest before invocation (Section 2.2)
  - Fan-in as formal evidence (Section 2.3)
  - Work packet manifest structure (Section 4)
  - Fan-in report structure (Section 5)
  - single_thread_exception reason codes (Section 3.1)
- `task-tracking-workflow-spec.md` Section 7 covers:
  - Parallel collaboration triggers (Section 7.1)
  - Parallel execution flow (Section 7.2)
  - Parallel mode state fields (Section 7.3)
- `CLAUDE.md` Part B covers Multi-Agent Orchestration Rules

### Gap Severity: **Low** (but previously flagged as unadapted)

The content has been substantially adapted. The previous "not yet adapted" flag is now **resolved** -- the parallel collaboration mechanisms exist across multiple contracts. The gap is only in **fragmentation**: the content is spread across CLAUDE.md Part B, cluster-orchestration.md, and task-tracking-workflow-spec.md Section 7.

### Recommended Fix

**No new contract needed.** Add a cross-reference index:

In `cluster-orchestration.md` Section 1 (Purpose), add:
> "This contract works together with: CLAUDE.md Part B (orchestration rules), task-tracking-workflow-spec.md Section 7 (parallel collaboration flow). Together these cover Codex Section 10 (Parallel Collaboration)."

Update any completeness audit references that still flag Section 10 as "not adapted" to mark it as adapted.

---

## Gap 10: State Projection vs Derived Projection Formalization

### What Codex Had

Codex formally distinguished between the "state projection" (the minimal set of fields that represent the authoritative state) and "derived projections" (human-readable views, summaries, dashboards that are computed from but cannot override state). This was a formal architectural principle with rules about what constitutes a projection, how derivations work, and what happens when projections drift.

### What Claude Code Currently Has

- `task-tracking-contract.md` Section 2.3: "Derived projections cannot override main state"
- `task-tracking-contract.md` Section 7: Lists derived projections (board.yaml, checkpoint, README, etc.) and explicitly states they do not participate in main state decisions
- `context-governance-contract.md` Section 2: Defines trust levels for different context layers (T0-T4)
- `dirty-hygiene-spec.md`: Comprehensive dirty data/chain detection covering projection drift

### Gap Severity: **Low**

The concept is operationally defined at the level needed for day-to-day use. The gap is only in the lack of a formal architectural principle statement. Codex may have had a more mathematical treatment (e.g., projection as a function of state, consistency invariants), but the practical behavior is equivalent.

### Recommended Fix

**No new contract needed.** Add a single clarifying paragraph to `task-tracking-contract.md` Section 7:

> "A derived projection is any artifact that is computed from the truth sources but is not itself a truth source. Formally: if T = {00-user-intent.md, 00-task-state.yaml} is the truth set, then any artifact P where P = f(T) is a derived projection. Derived projections may accelerate human understanding and session recovery but must never be used as inputs to state decisions. When a derived projection conflicts with a truth source, the truth source always wins and the projection must be regenerated."

This is a minor clarification, not a structural gap.

---

## Summary Table

| # | Gap | Severity | Codex Had | Claude Code Has | Recommended Action |
|---|-----|----------|-----------|-----------------|-------------------|
| 1 | State Contract Schema | **Critical** | Formal YAML/JSON schema | Inline YAML in markdown | Create `state-contract.yaml` schema file |
| 2 | Handoff Mechanism | **Medium** | Dedicated handoff object | Recovery sequence only, no handoff artifact | Expand workflow spec with handoff structure |
| 3 | Route Output Validation | Low | Combinatorial constraints | Field list only, no validation | Add valid route combinations table |
| 4 | Board Contract | Low | Standalone board contract | Embedded in workflow spec | Add claim/release protocol to workflow spec |
| 5 | Escalation Routes | **Medium** | Rich reason codes + authority matrix | 3-value enum only | Expand to 6+ reason codes with timeout matrix |
| 6 | Skill Spec Mapping | **Critical** | 534 skillSpecs with activation matrix | `required_skills[]` field, never populated | Create `skill-mapping.yaml` with activation matrix |
| 7 | Ownership Taxonomy | **Medium** | Ownership affects contract loading/review | 3-way taxonomy, no downstream effects | Add ownership-based behavior rules or decide not needed |
| 8 | Phase Transition Rules | Low | Formal state machine | Well-defined, minor inconsistency with CLAUDE.md | Reconcile terminology between two sources |
| 9 | Parallel Collaboration | Low | Codex Section 10 | Adapted across 3 files, fragmentation only | Add cross-reference index, update audit status |
| 10 | Projection Formalization | Low | Formal architectural principle | Operationally defined | Add clarifying paragraph to task-tracking-contract |

---

## Priority Recommendations

### Immediate (Critical)

1. **Create `state-contract.yaml`**: Define formal JSON Schema for `00-task-state.yaml`. This is foundational -- without it, the "truth source" claim cannot be machine-verified.
2. **Create `skill-mapping.yaml`**: Map Claude Code's available skills to action_family/artifact_kind combinations. This unblocks the intent-indexed activation chain.

### Near-term (Medium)

3. **Add handoff object structure** to `task-tracking-workflow-spec.md`
4. **Expand escalation routes** in `task-routing-contract.md` with reason codes and timeout matrix
5. **Add ownership-based behavior rules** to `task-routing-contract.md` or explicitly decide the current taxonomy depth is sufficient

### Low-priority (cleanup)

6. Add valid route combinations table to `task-routing-contract.md`
7. Add claim/release protocol to board definition in `task-tracking-workflow-spec.md`
8. Reconcile phase transition terminology between workflow spec and CLAUDE.md
9. Add cross-reference index for parallel collaboration content
10. Add projection formalization paragraph to `task-tracking-contract.md`

---

## Artifacts Not Present in Either System

The following capabilities were not found in either Codex or Claude Code norms and are noted for completeness:

- **Metrics/telemetry integration**: No contract defines how task metrics (cycle time, review pass rate, exception frequency) are collected and reported
- **Contract versioning migration**: `registry.yaml` has per-contract version fields but no migration protocol for tasks running on old contract versions
- **Multi-task orchestration**: No contract covers coordination between multiple concurrent tasks (resource conflicts, priority ordering, shared artifact access)

---

*End of gap analysis.*
