# Review 3 (Round 3): LEGO Assembly Workflow and Agent Orchestration Review

**Review ID**: REVIEW-3-LEGO-ORCHESTRATION-R3-FINAL
**Date**: 2026-04-30
**Reviewer Role**: LEGO Model and Agent Orchestration Specialist (Read-Only)
**Scope**: lego-assembly-workflow.md, cluster-orchestration.md, work-packet-governance.md, skill-tool-mapping.md, action-governance-contract.md, CLAUDE.md Part B/D, Codex execution-orchestration-contract.md
**Previous Verdict**: Conditional Pass (Round 2)
**Wave 1 Scope**: Recursive depth contradiction fix (sequential level-by-level + intra-level Fan-Out)

---

## 1. Executive Summary and Verdict

### Verdict: Conditional Pass

The Wave 1 fix correctly addressed the most structural defect -- the recursive nesting depth contradiction -- by explicitly reframing the model as sequential level-by-level assembly with fan-out within each level, and stating that all Fan-Out is controlled by the main thread (no sub-agent nesting). The CLAUDE.md Part C enforcement model declaration honestly characterizes the system as convention-driven. The Gate-to-Stage-to-Checklist mapping table eliminates previous ambiguity about which checklist to use at which gate.

However, 4 Critical issues from Round 2 remain unresolved, 2 new Critical issues were discovered, and several High-severity findings from the previous round are unchanged. The system is conceptually coherent but has persistent gaps between specification and practical operation.

---

## 2. Wave 1 Fix Verification

### 2.1 LEGO Recursive Depth Contradiction: RESOLVED (Effective)

**Round 2 finding**: The contract specified recursive depth not exceeding 3 layers but the assembly model required 4 levels of nesting (L4->L3->L2->L1->L0), creating a mathematical contradiction.

**Wave 1 fix in lego-assembly-workflow.md section 4.6.1**:
- Assembly model changed from recursive nesting to sequential level-by-level plus intra-level Fan-Out
- Main thread controls all Fan-Out; sub-agents cannot nest further sub-agents
- The rule explicitly states: 子 Agent 不得再嵌套派发子 Agent（避免嵌套过深；所有 Fan-Out 由主线程统一调度）
- CLAUDE.md Part C enforcement model declaration honestly states the system is convention-driven

**Assessment**: This fix is correct. It transforms an impossible recursive model into an achievable sequential pipeline model that matches Claude Code actual capabilities. No new contradictions were introduced by this change.

**One minor residual concern**: The contract still uses the term 递归拼装 (recursive assembly) in section 1 and section 3, while the actual mechanism is sequential. The terminology should be updated to match the implementation to avoid confusion.

### 2.2 Other Wave 1 Items (Verified from codex-vs-claude-round3.md)

| Wave 1 Fix | Status | Assessment |
|------------|--------|------------|
| CLAUDE.md enforcement model declaration | Verified | Part C honestly states 约定驱动而非平台强制 |
| Gate-to-Stage-to-Checklist mapping table | Verified | CLAUDE.md Part E table is clear and actionable |
| workflow_route naming alignment | Verified | Resolved from round 2 |
| context-governance false conflict removal | Verified | Resolved from round 2 |
---

## 3. Previous Round Recommendations Adoption Status

### 3.1 Round 2 Critical Recommendations

| # | Recommendation | Status | Assessment |
|---|---------------|--------|------------|
| 1 | Resolve circular dependency (lego/work-packet/cluster) | NOT ADOPTED | registry.yaml triangle still intact |
| 2 | Flatten or fix recursive assembly | ADOPTED (Wave 1) | Resolved via sequential model |
| 3 | Define agent timeout metric | NOT ADOPTED | 超过预计时间的 2 倍未返回 still has no 预计时间 definition |
| 4 | Add re-dispatch context specification | NOT ADOPTED | No specification of re-dispatched agent context |

### 3.2 Round 2 High Recommendations

| # | Recommendation | Status | Assessment |
|---|---------------|--------|------------|
| 5 | Add progressive fan-in support | NOT ADOPTED | No partial fan-in provision |
| 6 | Support agent grouping | NOT ADOPTED | Matrix still 1:1 packet-to-agent |
| 7 | Distinguish conflict vs integration in fan-in | NOT ADOPTED | No separate integration section |
| 8 | Add 4 missing recovery paths | NOT ADOPTED | All 4 remain missing |

### 3.3 Round 2 Medium Recommendations

| # | Recommendation | Status | Assessment |
|---|---------------|--------|------------|
| 9 | Add Standard-Lite mode | NOT ADOPTED | Trivial/Standard cliff persists |
| 10 | Make anti-patterns 6-7 detectable | NOT ADOPTED | No mechanism added |
| 11 | Honest enforcement language | ADOPTED (Wave 1) | Part C enforcement model declaration |
| 12 | Clarify quality failure fix ownership | NOT ADOPTED | Not specified |

**Adoption rate**: 2 of 12 (17 percent). Both adopted items are Wave 1 fixes.
---

## 4. Agent Timeout: 2x Expected Time Still Undefined

### 4.1 Current State

lego-assembly-workflow.md section 4.6.4: Agent hang detection is 超过预计时间的 2 倍未返回. CLAUDE.md Part C Rule 7: 挂死（超时 2x）-> 终止重新派发.

### 4.2 Analysis

**The metric is still not defined.** 预计时间 (expected time) does not exist as a field in any contract, any YAML state file, or any delegation plan structure. Claude Code does not expose an agent execution time metric that the main thread can query.

**Why this is Critical**: Without a definition, this rule is unenforceable. The main thread has no way to know when an agent was dispatched, what expected time was set, or to calculate 2x of anything.

**Recommended fix** (3 options):

- (a) Define per-LEGO-level timeout ranges: L4 = 5 min, L3 = 15 min, L2 = 30 min, L1 = 60 min.
- (b) Require timeout_minutes in delegation plan per packet.
- (c) Remove timeout detection entirely; rely on Claude Code built-in timeout.

### 4.3 No New Problems Introduced by Wave 1

The Wave 1 fix (sequential assembly model) does not introduce new problems. The timeout issue pre-dates Wave 1.
---

## 5. L4 Granularity Mismatch

### 5.1 Current Specification

lego-assembly-workflow.md section 4.1: L4 = code block level = single function/class/config file, manufactured by sub-agent, assembled at L3.

### 5.2 Analysis

**The granularity mismatch from Round 2 persists and remains unaddressed.** Claude Code sub-agents are full conversational agents with their own system prompt copy (2000-5000+ tokens overhead), tool budget, context window, and isolated session. Spawning a full sub-agent to write one function is disproportionate.

The contract acknowledges this indirectly in section 10: L4 code blocks can be handled by main thread directly via Write/Edit. But there is no criterion for when to use sub-agent vs main thread for L4.

**Recommended fix**: Add a decision rule: L4 code blocks with estimated complexity < 50 lines OR < 3 tool calls -> main thread; otherwise -> sub-agent.
---

## 6. Codex Activity Families: Equivalence Assessment

### 6.1 Claude Code Equivalents for Codex 7 Activity Families

| Codex Activity | Claude Code Equivalent | Coverage | Assessment |
|---------------|----------------------|----------|------------|
| search | research + Explore Agent | Equivalent | skill-tool-mapping section 4.3.2 |
| analysis | Embedded in research | Partial | No separate analysis action_family |
| authoring | authoring | Equivalent | Direct 1:1 mapping |
| implementation | implementation | Equivalent | Direct 1:1 mapping |
| verification | verification | Equivalent | Direct 1:1 mapping |
| review | review | Equivalent | Direct 1:1 mapping |
| recovery | closeout + context-compaction | Partial | Split across contracts |

### 6.2 Mandatory Multi-Agent Trigger Equivalence

All 6 Codex mandatory multi-agent triggers have equivalent conditions in cluster-orchestration.md section 6.1. The mapping is complete.

### 6.3 Assessment

**Claude Code has equivalent mechanisms for all 7 Codex activity families.** The mapping is not 1:1 (analysis embedded in research, recovery split), but functional coverage is equivalent.

**Key difference**: Codex has analysis as standalone; Claude Code folds it into research. This means Claude Code cannot independently trigger multi-agent for analysis-only work.
---

## 7. Agent Exception Recovery: 4 Missing Paths Status

### 7.1 Status Table

| # | Missing Path | Round 2 Status | Round 3 Status |
|---|-------------|---------------|----------------|
| 1 | Partial output (correct but incomplete) | Missing | Still Missing |
| 2 | Inter-agent output conflict | Missing | Still Missing |
| 3 | Agent crash mid-execution | Missing | Still Missing |
| 4 | Main thread context expiry | Missing | Still Missing |

### 7.2 Analysis

**None of the 4 missing recovery paths from Round 2 have been added.** The exception table in lego-assembly-workflow.md section 4.6.4 is unchanged.

This is a Critical gap because partial output is the most common failure mode, inter-agent conflicts are inevitable when write scopes overlap, agent crashes are possible, and main thread context expiry is a real risk.
---

## 8. Fan-In Report: Conflict vs. Integration Distinction

**NOT ADOPTED.** cluster-orchestration.md section 5 fan-in report structure does not separate conflict resolution from integration of complementary outputs. The current structure implies Conflict Resolution is always present, but in well-designed decompositions with non-overlapping write scopes, there are no conflicts -- only integration to verify.
---

## 9. New Findings (Not Identified in Round 2)

### 9.1 Critical: Circular Dependency Triangle Unchanged

lego-assembly-workflow depends on work-packet-governance; work-packet-governance depends on lego-assembly-workflow; cluster-orchestration depends on work-packet-governance. All scoped to delivery_mode=full, phase=build. Initialization order unresolvable. Round 2 finding, unfixed.

### 9.2 Critical: action-governance and skill-tool-mapping Circular Dependency Unchanged

Bidirectional dependency in registry.yaml. Both are active and co-load. Declared dependency implies sequential resolution which is impossible. Round 2 finding, unfixed.

### 9.3 High: analysis Not a Standalone Action Family

action-governance.md section 2 defines 7 action families but analysis is folded into research. Pure analysis-only work (e.g., analyze architecture decision) incorrectly routes to research which implies fact harvesting.

### 9.4 High: negative_activation Has No Enforcement

action-governance.md section 5.1 defines a 5-step resolution process but no checklist item references it, no gate verifies it, and the verification_check has no defined procedure.

### 9.5 Medium: L1-L2 Assembly Handoff Ambiguity

lego-assembly-workflow.md section 4.6.1 says agents do own-level assembly, but cluster-orchestration.md section 2.1 forbids sub-agent orchestration. The Wave 1 sequential model resolves this by making main thread do ALL assembly, but the contract text is not updated to match.

### 9.6 Medium: 12-Layer Decomposition Lacks Simplification Criteria

work-packet-governance.md section 2 allows Standard tasks to simplify to 6-8 layers but provides no criteria for which layers to skip. The agent decides ad hoc.
---

## 10. Findings by Severity

### Critical (4)

| # | Finding | File | Description |
|---|---------|------|-------------|
| 1 | Circular dependency: lego/work-packet/cluster | lego-assembly-workflow.md, work-packet-governance.md, cluster-orchestration.md | Triangular dependency; init order unresolvable. Round 2, unfixed. |
| 2 | Circular dependency: action-governance/skill-tool-mapping | action-governance-contract.md, skill-tool-mapping.md | Bidirectional; declared order unresolvable. Round 2, unfixed. |
| 3 | Agent timeout metric undefined | lego-assembly-workflow.md section 4.6.4 | 超过预计时间的 2 倍 not defined. Round 2, unfixed. |
| 4 | 4 missing recovery paths unfixed | lego-assembly-workflow.md section 4.6.4 | Partial output, inter-agent conflict, agent crash, main thread failure. Round 2, unfixed. |

### High (5)

| # | Finding | File | Description |
|---|---------|------|-------------|
| 5 | L4 granularity mismatch | lego-assembly-workflow.md section 4.1 | Sub-agent for single function disproportionate; no dispatch criterion. |
| 6 | analysis not standalone action_family | action-governance.md section 2 | Folded into research; tool matrix mismatched. |
| 7 | negative_activation no execution face | action-governance.md section 5.1 | 5-step process declared, zero enforcement. |
| 8 | Progressive fan-in not supported | cluster-orchestration.md section 8 | All-or-nothing waiting. |
| 9 | Fan-in conflates conflict with integration | cluster-orchestration.md section 5 | No separate integration section. |

### Medium (5)

| # | Finding | File | Description |
|---|---------|------|-------------|
| 10 | L1-L2 assembly handoff ambiguity | lego-assembly-workflow.md section 4.6.1 | Text implies agent assembly but sub-agents forbidden from orchestration. |
| 11 | 12-layer lacks simplification criteria | work-packet-governance.md section 2 | No criteria for layer skip in Standard tasks. |
| 12 | Re-dispatch context unspecified | lego-assembly-workflow.md section 4.6.4 | No context spec for re-dispatched failed agent. |
| 13 | Quality failure fix ownership unspecified | lego-assembly-workflow.md section 4.6.4 | No spec: original agent vs new agent vs main thread. |
| 14 | Terminology mismatch | lego-assembly-workflow.md section 1, 3 | Uses 递归拼装 but mechanism is sequential. |

### Low (2)

| # | Finding | File | Description |
|---|---------|------|-------------|
| 15 | Agent grouping not supported | lego-assembly-workflow.md section 4.6.2 | Matrix assumes 1:1 packet-to-agent. |
| 16 | Anti-patterns 6-7 undetectable | skill-tool-mapping.md section 9 | No enforcement mechanism. |
---

## 11. Codex Comparison Summary

| Dimension | Codex | Claude Code | Gap Status |
|-----------|-------|-------------|------------|
| Activity Families (7) | Defined | Equivalent (analysis embedded) | Resolved |
| Mandatory Multi-Agent Triggers (6) | Defined | Equivalent | Resolved |
| Delegation Plan (7 fields) | Defined | Equivalent | Resolved |
| Fan-Out/Wait/Fan-In | Defined | Equivalent | Resolved |
| Subagent Task Envelope | Defined | Equivalent | Resolved |
| Anti-Patterns (6) | Defined | Equivalent | Resolved |
| Timeout detection | Not specified | Undefined | New Gap |
| Progressive fan-in | Not specified | Not supported | New Gap |

Net assessment: Claude Code cluster orchestration has functionally equivalent mechanisms for all Codex execution orchestration requirements. Remaining gaps are in exception recovery and practical execution details.
---

## 12. Recommendations

### 12.1 Critical (Must Fix Before Full Pass)

1. **Break circular dependency triangles** -- Remove reverse edges: work-packet-governance should not depend on lego-assembly-workflow; skill-tool-mapping should not be in action-governance required_contracts.
2. **Define agent timeout metric** -- Add per-LEGO-level timeout ranges: L4=5min, L3=15min, L2=30min, L1=60min. Or require timeout_minutes in delegation plan. Or remove entirely.
3. **Add 4 missing recovery paths** -- Partial output, inter-agent conflict, agent crash, main thread failure. Each needs detection method, recovery action, rollback scope.
4. **Resolve L4 granularity mismatch** -- Add decision rule: <50 lines or <3 tool calls -> main thread; otherwise -> sub-agent.

### 12.2 High (Should Fix)

5. **Add analysis as standalone action_family** -- Or document that analysis-only routes to research with adjusted tool selection.
6. **Add progressive fan-in support** -- Allow main thread to integrate completed packets without waiting for all agents.
7. **Distinguish conflict vs. integration in fan-in report** -- Add Integration Summary section before Conflict Resolution.
8. **Operationalize negative_activation enforcement** -- Add checklist item or gate to verify 5-step process.

### 12.3 Medium (Should Fix)

9. **Clarify L1-L2 assembly handoff** -- Make explicit that main thread does all assembly, or define limited orchestration scope for sub-agents.
10. **Add simplification criteria for 12-layer decomposition** -- Define mandatory vs optional layers for Standard tasks by architecture type.
11. **Specify re-dispatch context** -- When re-dispatching failed agent: original spec, failed output, error analysis, corrected guidance.
12. **Update terminology** -- Replace 递归拼装 with 顺序拼装 throughout lego-assembly-workflow.md.
---

## 13. Remaining Risks

### 13.1 Execution Risk: Process Overhead (Unchanged)
Process overhead exceeds value for typical Standard tasks. Standard-Lite tier unaddressed.

### 13.2 Context Risk: 8 State Dimensions (Unchanged)
Agent must track phase, stage, subphase, gate status, LEGO level, action family, artifact kind, delivery mode simultaneously. Recommendation to reduce to 4 not adopted.

### 13.3 Correctness Risk: Assembly Verification Without Tests (Unchanged)
When tests are missing, assembly verification becomes mental checking. No test-absent fallback defined.

### 13.4 New Risk: Terminology-Implementation Divergence
Wave 1 changed mechanism to sequential but contract still uses 递归 terminology. Risk of future implementers reintroducing recursive model.

---

## Checklist Coverage

| Checklist | Items Covered | Items Satisfied | Notes |
|-----------|--------------|-----------------|-------|
| stage2-architecture-review.md | 17 items | 14/17 | Circular deps unfixed; recursive terminology misleading |
| stage4-5-plan-review.md | 17 items | 12/17 | Timeout metric missing; fan-in not defined; re-dispatch context unspecified |
| stage6-code-review.md | 24 items | 19/24 | L4 granularity mismatch; test-absent fallback not defined; recovery paths incomplete |

---

*End of review report. Verdict: Conditional Pass.*