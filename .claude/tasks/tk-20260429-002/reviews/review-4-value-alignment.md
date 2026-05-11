# Review 4: User Value & Codex Completeness Alignment

**Generated:** 2026-04-30
**Reviewer:** Independent Review Agent (Value + Completeness dimension)
**Scope:** Full Claude Code norms system (CLAUDE.md + 27 contracts + 9 checklists + registry) vs Codex original framework (660 files, 534 skill specs, 20 agent specs, 14-file Review OS, Lore Commit Protocol, keyword routing, model routing, delegation channels)
**Method:** Two-axis analysis -- (1) user value gate across 5 dimensions, (2) Codex completeness alignment with Critical/High gap tracking

---

## 1. Executive Summary + Verdict

### Verdict: **Conditional Pass**

The Claude Code norms system is a **genuine simplification** of Codex that preserves the core value proposition (structured development workflow with review gates, LEGO decomposition, multi-agent orchestration) while shedding Codex-specific runtime dependencies (OMX CLI, tmux teams, Lore commit protocol, 534 skill specs, keyword routing). However, the system carries **significant process overhead** that makes it unsuited for anything below a Standard-complexity task, and several Codex mechanisms that provide real user value (not just internal consistency) have been lost without replacement.

**Key findings:**

- **User value**: The 7-stage + LEGO model provides real structure for complex tasks, but adds 3-5x friction for simple tasks that could ship in one pass. The Trivial/Standard/Complex complexity grading is the system's most important simplification mechanism, but it is too coarse -- there is no "Medium" tier between Trivial and Standard, creating a cliff where a 45-minute task gets the full Standard treatment.
- **Codex completeness**: 11 of 13 "partial coverage" gaps from Round 2 gap analysis remain unfixed. 20 Codex-unique mechanisms have no Claude Code equivalent. The most consequential losses are: Lore Commit Protocol (institutional knowledge), keyword-based skill activation (user UX), model routing (cost/quality optimization), and the 11-layer work packet decomposition matrix (architecture rigor).
- **Where Claude Code is better**: The feedback loop mechanism (feedback.yaml), completeness audit as a meta-rule (Rule 6), non-C-drive storage constraint, and Stage-to-stage rollback table are genuine improvements over Codex. The simplified registry is more readable than Codex's 17-entry YAML with AND/OR scope expressions.
- **Critical risk**: 86% of declared rules rely on agent awareness (soft enforcement). The system declares "必须/不得/禁止" but has no external verifier. This is not a flaw per se, but the language creates false expectations of enforcement.

---

## 2. User Value Analysis (5 Dimensions)

### 2.1 Intent Alignment (Does it solve a real problem?)

**Score: 3/5**

The system addresses a real problem: LLM coding agents producing shallow, unstructured, non-reviewable output. The 7-stage model (deep learning -> architecture decomposition -> PRD -> detailed design -> development plan -> coding -> testing) forces depth that LLMs would otherwise skip.

However, the problem being solved is **"how to make AI produce enterprise-grade deliverables,"** not "how to help a user write code faster." These are related but different. For a user who says "I just want to write code," this system adds:

1. Intent confirmation (Rule 3) -- 1 extra interaction
2. Complexity grading (Part C) -- decision overhead
3. Deep learning with 3+ references (Rule 1) -- 5-10 minutes of research
4. Architecture decomposition to L4 -- document overhead
5. PRD creation -- document overhead
6. Detailed design -- document overhead
7. Development plan with agent matrix -- document overhead
8. Review cycles (minimum 2 agents) -- time overhead
9. Closeout with 4 gates -- cleanup overhead

For a **Standard** task like "add a login form," the user gets value from the structured design process (preventing common mistakes like missing error states, poor validation). But the process overhead means a task that could take 15 minutes of coding now takes 45-90 minutes of process.

**For a Complex task like "build a permission system,"** the process overhead is likely justified -- the cost of getting it wrong is high, and the 7-stage model catches architectural issues early.

**For a Trivial task like "change a variable name,"** the system correctly exempts these. The Trivial/Standard/Complex grading is the system's best simplification mechanism.

**Gap:** There is no "Medium" tier. A task that takes 1-2 hours but doesn't need deep learning or multi-agent review falls into Standard and gets the full pipeline. The complexity grading should have 4 levels, not 3.

### 2.2 Scenario Coverage (Does it handle real-world constraints?)

**Score: 3/5**

The system handles these scenarios well:
- Multi-file development (LEGO decomposition + cluster orchestration)
- Cross-session knowledge persistence (memory architecture)
- Quality degradation prevention (review gates + escalation)
- User interruption (Rule 2 intervention commands)

The system handles these scenarios poorly:
- **Time pressure**: No "quick mode" for Standard tasks. If a user needs a feature by end of day, the system has no path that preserves quality while compressing stages.
- **Single-developer context**: The multi-agent model assumes Claude Code can spawn sub-agents. But in practice, some Claude Code deployments may not have Agent tool access, leaving the system with no fallback path.
- **Iterative development**: The Stage model is waterfall-ish. Real development often requires cycling between design and code. The rollback table (D.5) addresses this partially but assumes you only go back, not forward-and-back.
- **Partial adoption**: A team that wants only review gates but not the 7-stage model has no "pick and choose" path. The system is all-or-nothing.

### 2.3 Downstream Usability (Can the next person use it without rewriting?)

**Score: 3.5/5**

The task-tracking state machine (`00-task-state.yaml`) and README lifecycle (dev/delivery states) are genuine usability improvements over Codex. The closeout process ensures deliverables are documented.

However:
- The 8-dimensional state tracking (phase, stage, subphase, gate status, LEGO level, action family, artifact kind, delivery mode) identified in the architecture audit is excessive. A new developer looking at a task mid-flight would need to understand all 8 dimensions to know "where am I?"
- Review bundles require 5 files per review. For 3 phase transitions, that is 15 files to manage. The overhead of managing review pack files can exceed the value of the review itself for simple transitions.
- The exception governance mechanism is well-designed but requires the user to understand YAML exception objects, which is a significant cognitive barrier for non-technical users.

### 2.4 Delivery Completeness (Does the output satisfy the user's actual need?)

**Score: 4/5**

The value gate (review-gates Layer 1) is the system's strongest user-value mechanism. It forces the question: "Can the next user take this deliverable and use it without rewriting key content?" This is a real, user-centric check that Codex also has but Claude Code executes well.

The user-value-checklist.md covers:
- Intent alignment (back to 00-user-intent.md)
- Scenario coverage (happy path, failure triggers, real constraints)
- Downstream usability (no rewrite needed)
- Delivery completeness (value gate evidence)

This is well-designed. The hard-fail conditions in review-gates §14.1 are particularly strong:
1. No user scenario back-linking
2. Key actions require downstream rewriting
3. Only works on ideal path
4. Cannot prove user usability

### 2.5 Value Gate Verdict

**Assessment:** The system's value gate is structurally sound and user-centric. The problem is not the gate itself but the process overhead required to reach the gate. For a Standard task, the user must go through 6 stages before hitting the first formal value gate (at Stage 3 PRD review). That means the first user-value check happens after significant investment.

**Recommendation:** Value gate checks should occur at Stage 1 (deep learning), not just Stage 3. If the deep learning analysis shows the user's real need is simpler than assumed, the system should down-scope before investing in architecture decomposition.

---

## 3. Codex Completeness Alignment

### 3.1 Critical Gap Status

Based on the Round 2 gap analysis (`codex-vs-claude-round2.md`), here is the status of Critical gaps:

| # | Critical Gap | Status | Notes |
|---|-------------|--------|-------|
| 1 | Lore Commit Protocol | **UNFIXED** | No equivalent in Claude Code. This is Codex's institutional knowledge mechanism. Claude Code uses git commit + review provenance, which is weaker. |
| 2 | Keyword Detection + Skill Auto-Activation | **UNFIXED** | Users must explicitly invoke skills or rely on intent inference. Codex auto-activates on 20+ keywords. This is a user experience gap. |
| 3 | OpenClaw Dual-Lineage Isolation | **N/A** | Claude Code does not run OpenClaw. Correctly omitted. |
| 4 | Review OS 14-File System | **PARTIALLY** | Claude Code absorbed most logic into review-gates-contract.md (309 lines) but lost machine-readable YAML gate definitions, reviewer role matrix, blocked policy document, and sub-agent prompt templates. |
| 5 | Contract Registry + State Management | **PARTIALLY** | Claude Code's registry.yaml is functional but missing checker_ref, migration_state, supersedes/superseded_by, conflict_resolution_policy, owner, and advanced effective_scope syntax. |

### 3.2 High Gap Status

| # | High Gap | Status | Notes |
|---|----------|--------|-------|
| 6 | Task Routing Depth (7-step vs linear) | **UNFIXED** | Claude Code task-routing-contract.md is 117 lines vs Codex's 7-step matrix + 6 decision tables. Missing task_chain_route, execution_orchestration_route as independent steps, escalation_route structured enum. |
| 7 | Context Governance Depth | **UNFIXED** | Missing bundle types (8 kinds), visual_design_overlay, compaction receipt contract, context compiler inputs (16 fields), negative_activation, sub-agent isolation contract. |
| 8 | Work Packet Governance Depth | **UNFIXED** | Missing 11-layer layered feature decomposition matrix (Codex's core innovation) and 12 mandatory pre-build artifacts. |
| 9 | Agent Spec System (20 specs) | **UNFIXED** | Claude Code has one generic "sub-agent" concept vs Codex's 20 independently configurable agent specs with model selection, reasoning effort, posture, and output contract. |
| 10 | Execution Orchestration Independent Contract | **UNFIXED** | Logic scattered across CLAUDE.md Part B, cluster-orchestration.md, and task-routing-contract.md. No activity families model (search/analysis/authoring/implementation/verification/review/recovery). |
| 11 | Intent Capture Depth | **PARTIALLY** | Missing job_to_be_done field (JTBD framework core) and feasibility extension block. |
| 12 | Memory Architecture vs Memory Growth | **PARTIALLY** | Missing memory object type classification (6 kinds),分流晋升 (6 destinations), frozen snapshot, non-memory sedimentation paths. |

### 3.3 What Codex Mechanisms Are Completely Absent?

1. **Lore Commit Protocol** -- structured git commit trailers (Constraint/Rejected/Confidence/Scope-risk/Directive/Tested/Not-tested). This is not just formatting -- it is a knowledge preservation mechanism that prevents future agents from re-exploring rejected alternatives.
2. **Keyword-Based Skill Auto-Activation** -- Codex users type "tdd" or "deep interview" or "code review" and the corresponding workflow activates automatically. Claude Code requires explicit skill invocation or intent inference.
3. **Model Routing** -- Codex automatically matches task complexity to appropriate models (low -> spark model, standard -> gpt-5.4-mini, high -> gpt-5.4). Claude Code uses a single model for all agents. This is a cost optimization and quality optimization mechanism.
4. **Delegation Channels** -- $deep-interview / $ralplan / $team / $ralph are four distinct delegation paths with different purposes (clarify vs plan vs execute vs persistent loop). Claude Code has one generic "spawn agent" mechanism.
5. **20 Agent Spec Files** -- Each with model, reasoning_effort, posture_overlay, routing_role, output_contract. Claude Code's agents are homogeneous.
6. **534 Skill Specs** -- Independently activatable capabilities with SKILL.md, references, scripts, agents. Claude Code's skill-tool-mapping.md is a decision tree, not a capability system.
7. **Layered Feature Decomposition Matrix** -- Codex's 11-layer breakdown (requirements -> data structure -> persistence -> data access -> request contract -> response contract -> service interface -> business logic -> controller -> integration wiring -> validation -> operability) is a core architectural innovation that Claude Code completely lacks.

### 3.4 What Claude Code Does Better Than Codex

1. **Feedback Loop System** -- feedback.yaml with collection/triage/execution/closeout lifecycle. Codex has no equivalent norm-governance feedback mechanism.
2. **Completeness Audit as Meta-Rule** -- Rule 6 with 3 defense lines, auto-triggered for all Standard/Complex tasks. Codex has completeness-audit-spec but it is not elevated to a meta-rule in AGENTS.md.
3. **Stage-to-Stage Rollback Table** -- 12 failure types mapped to specific rollback targets. Codex's review-gates have escalation but not this explicit stage mapping.
4. **Non-C-Drive Storage Constraint** -- Practical Windows-specific constraint that Codex does not need (Linux-native).
5. **Contract Completeness Checklist** -- When modifying contracts, the contract-completeness-checklist.md is mandatory. This is a self-improvement mechanism Codex lacks.
6. **Simplified Readability** -- Claude Code's CLAUDE.md is one file that serves as the entry point. Codex requires reading specs/root/AGENTS.md, specs/codex-home/AGENTS.md, then contracts/README.md, then contract-registry.yaml to understand the system. Claude Code is more accessible to new users.

### 3.5 Trade-off Assessment

**The simplification vs completeness trade-off is partially justified but over-extended.**

Justified simplifications:
- Removing OMX runtime dependencies (tmux, omx CLI, shell hooks) -- correct because Claude Code runs in a different environment.
- Removing OpenClaw dual-lineage isolation -- correct because Claude Code does not manage multiple products.
- Simplifying the registry -- correct because Codex's AND/OR scope syntax was over-engineered for actual usage.
- Removing 534 skill specs to a decision tree -- correct because Claude Code does not have a skill installation/activation system.

Questionable simplifications:
- Removing Lore Commit Protocol -- this is environment-independent and provides genuine value (knowledge preservation). Should be added back.
- Removing keyword detection -- this is a user experience feature, not a runtime dependency. Could be implemented in CLAUDE.md.
- Removing model routing -- Claude Code may not support model selection today, but the architecture should plan for it.
- Removing 11-layer work packet decomposition -- this is the most consequential loss. The decomposition matrix is not platform-specific; it is architectural rigor. Removing it makes the LEGO model less concrete.
- Removing agent spec differentiation -- having all agents be the same model with same reasoning effort is a quality and cost inefficiency.

---

## 4. Cost-Benefit Analysis

### 4.1 Process Overhead vs Quality Gain

| Scenario | Without Norms | With Norms | Overhead | Quality Delta | Net Value |
|----------|--------------|------------|----------|---------------|-----------|
| Trivial (rename variable) | 2 min | 2 min (exempt) | 0x | 0% | Neutral |
| Small (fix bug in known module) | 15 min | 30-45 min | 2-3x | Moderate (prevents regression) | Positive |
| Standard (add login form) | 1-2 hours | 3-5 hours | 2-3x | High (structured design catches edge cases) | Positive |
| Complex (build permission system) | 1-2 days | 2-4 days | 1.5-2x | Very High (architectural rigor prevents rework) | Positive |
| Iterative (small tweak to existing feature) | 10 min | 45-60 min | 4-6x | Low (overkill for incremental change) | **Negative** |

The system is **over-weighted toward greenfield development** and **under-weighted toward iterative enhancement**. A user who says "add a validation check to the login form" gets the full Standard pipeline, when what they need is a surgical change with a lightweight review.

### 4.2 Is the Overhead Justified?

For **first-time development of significant features** (new modules, new products): **Yes**, the overhead is justified. The 7-stage model catches issues that would be expensive to fix later.

For **iterative development** (small additions, bug fixes, refactors): **No**, the overhead is not justified. The system needs a "Standard-Light" mode that requires only 2-3 stages (research -> design -> code) with simplified review (self-check + 1 reviewer instead of 2 independent agents).

For **contract/system modification** (changing the norms themselves): **Yes**, the overhead is justified and the completeness audit meta-rule ensures rigor.

---

## 5. Recommendations

### 5.1 Simplification (Reduce Friction)

1. **Add a "Standard-Light" complexity tier** between Trivial and Standard. Criteria: 30min-2hour tasks, single-module scope, known patterns. Requirements: Stage 1 (light research), Stage 4 (focused design for changed components only), Stage 6 (code). Skip Stage 2 (full architecture decomposition), Stage 3 (full PRD), Stage 5 (full development plan). Review: 1 agent instead of 2.

2. **Reduce review pack file overhead**. Instead of 5 required files per review bundle, make 00-user-intent.md and 04-scope-boundary.md the only mandatory files. The rubric, hard-fail rules, and truth sources can be referenced from the contract system rather than duplicated.

3. **Unify phase naming**. The architecture audit identified 3 naming schemes (7-stage Chinese, 10-phase English, workflow_route English). Collapse to a single naming convention. The 7-stage model is the user-facing model; use it everywhere.

4. **Reduce state dimensions from 8 to 4**. Keep: stage (0-7), gate status (pending/passed/failed), delivery mode (full/quick/advisory), complexity (trivial/standard/complex). Remove: phase (redundant with stage), subphase (too granular), LEGO level (implementation detail), action family (used internally, not for state tracking).

5. **Honest enforcement language**. Change "必须/不得/禁止" to "应当/不应/避免" for soft-enforced rules, or add a preamble: "All rules in this system are conventions enforced by agent awareness. There is no external automated gate."

### 5.2 Strengthening (Close Critical Gaps)

1. **Add Lore Commit Protocol** as a standalone contract. This is the highest-value missing mechanism. It requires no platform changes -- just a commit message format convention.

2. **Add keyword-to-skill mapping** in CLAUDE.md. Define a simple table: when the user says X, activate capability Y. This improves UX without requiring a runtime system.

3. **Restore the 11-layer work packet decomposition matrix** (or a simplified 7-layer version) in work-packet-governance.md. The current version is too principle-level; it needs concrete decomposition guidance.

4. **Add agent spec differentiation**. Even without model routing, define different agent roles with different responsibilities (explorer: read-only analysis, builder: code implementation, reviewer: audit). The skill-tool-mapping.md already has agent types -- formalize them into role specs.

5. **Add blocked policy as a standalone contract**. The review-gates-contract.md has escalation but no explicit blocked policy. Codex's 07-blocked-policy.md defines 5 blocked trigger conditions, escalation rules, and blocked report minimum content.

---

## 6. Remaining Risks

### 6.1 Critical Risks

1. **Soft enforcement illusion**: The system declares hard rules ("必须/不得/禁止") but 86% rely on agent awareness. Users may believe the system provides stronger guarantees than it actually does. If an agent forgets a rule, there is no safety net.

2. **Circular dependencies in registry**: The action-governance <-> skill-tool-mapping and lego-assembly-workflow <-> work-packet-governance <-> cluster-orchestration circular dependencies make contract activation order undefined. In practice this works because contracts are loaded simultaneously, but the declared dependencies imply sequential resolution.

3. **No automated verification for any checker**: The verification-checker catalog lists 11 checkers, all declared as "automated" or "hybrid," but none are implemented as executable tools. They are conceptual checklists. The "evidence-driven" principle is not met.

### 6.2 High Risks

4. **Over-weighted toward greenfield**: The 7-stage model is excellent for building from scratch but excessive for iterative development. Users will either skip stages (violating norms) or resent the process (abandoning the system).

5. **Agent state tracking overload**: 8 dimensions of state tracking per task is excessive cognitive load. Agents will make mistakes tracking all 8, leading to inconsistent state.

6. **Missing institutional knowledge mechanism**: Without Lore Commit Protocol, the system loses the ability to preserve why decisions were made and what alternatives were rejected. Future agents will re-explore the same dead ends.

### 6.3 Medium Risks

7. **No graceful degradation path**: When the system cannot be fully executed (time pressure, tool unavailability, agent failures), there is no clear "reduced capability" mode. The exception governance mechanism exists but is heavy-weight for everyday use.

8. **Context budget management is heuristic, not precise**: The 55%/70%/85% triggers are based on heuristic signals (file count, message count) because Claude Code does not expose a direct context_budget_percent metric. This means compression may fire prematurely or too late.

9. **Memory decay has no automated trigger**: The 90-day/180-day decay rules rely on the agent noticing during closeout. In practice, they will never fire.

---

## 7. Final Verdict Rationale

**Conditional Pass** -- The Claude Code norms system provides genuine user value for Standard and Complex tasks through its structured development workflow, review gate system, and LEGO decomposition model. The simplifications relative to Codex are largely justified for a different runtime environment (Claude Code vs OMX). However, the following conditions must be addressed within the next iteration cycle:

1. Add a "Standard-Light" complexity tier to reduce overhead for iterative development
2. Add Lore Commit Protocol as a standalone contract
3. Unify phase/stage naming to eliminate the 3-naming-scheme confusion
4. Reduce state dimensions from 8 to 4
5. Add honest enforcement language to the meta-rules

If these conditions are not addressed, the system risks being too heavy for the majority of real-world use cases (iterative development, small enhancements, bug fixes), which represent the bulk of daily development work.

---

*End of Review 4: User Value & Codex Completeness Alignment*
