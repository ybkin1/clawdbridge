# Review 3: LEGO Assembly Workflow & Agent Orchestration Review

**Review ID**: REVIEW-3-LEGO-ORCHESTRATION
**Date**: 2026-04-30
**Reviewer Role**: LEGO Model & Agent Orchestration Specialist
**Scope**: lego-assembly-workflow.md, cluster-orchestration.md, work-packet-governance.md, skill-tool-mapping.md, action-governance.md, architecture-blueprint.md, CLAUDE.md Part B/C/D/E, architecture-audit.md
**Checklists Applied**: stage2-architecture-review.md, stage4-5-plan-review.md, stage6-code-review.md

---

## 1. Executive Summary & Verdict

### Verdict: Conditional Pass

The LEGO assembly workflow and agent orchestration system represents a genuinely ambitious attempt to formalize multi-agent code production. The conceptual architecture is internally coherent: 5-level decomposition maps cleanly to 7 stages, Fan-Out/Wait/Fan-In is correctly specified, and the agent assignment matrix provides a reasonable envelope for sub-agent dispatch.

However, several **critical practical executability gaps** prevent a full Pass:

1. **Circular dependency triangle** in the build phase cluster (lego-assembly-workflow <-> work-packet-governance <-> cluster-orchestration) makes initialization order unresolvable (already identified in architecture-audit.md, still unresolved).
2. **Recursive agent nesting** is specified as "not exceeding 3 layers" but the assembly model requires 4 levels of nesting (L4->L3->L2->L1->L0), creating a contradiction.
3. **Agent timeout detection** relies on "2x expected time" but "expected time" is not a defined or measurable metric within the Claude Code runtime.
4. **L4 "one code block per agent" assumption** does not match how Claude Code sub-agents actually work: they operate in isolated sub-processes with their own tool budgets, not as fine-grained "manufacture one function" workers.
5. **The 12-layer work packet decomposition** requires 12 mandatory pre-build artifacts before a single line of code can be written -- this is excessive for most real-world Standard tasks and will create significant process overhead.

The system is conceptually sound but practically over-engineered. With the recommended fixes below, it could reach a Pass verdict.

---

## 2. LEGO Model Correctness Analysis

### 2.1 5-Level Decomposition (L0-L4): Conceptual vs. Practical

**Conceptual correctness: Strong.**

The 5-level hierarchy is well-structured and maps intuitively to standard software engineering decomposition:

- L0 (Product) = system level
- L1 (Module) = feature/domain boundary
- L2 (Component) = cohesive unit within a module
- L3 (Unit) = smallest callable/deployable function or endpoint
- L4 (Code Block) = individual function, class, config file

The stop condition ("decompose until independently manufacturable") is practical and mirrors how senior engineers naturally decompose work. The escalation rule (if L3 needs 3+ code blocks, promote to L2) is also sensible.

**Practical executability: Weak.**

The fundamental problem is that **Claude Code does not have a native mechanism to "manufacture one L4 code block per agent."** Sub-agents in Claude Code are full conversational agents with their own tool budget, context window, and file system access. They are designed to handle multi-step tasks, not atomic "write one function" operations.

Specific issues:

- **Granularity mismatch**: An L4 code block is described as "a single function/class/config file." But spawning a full sub-agent to write one function is disproportionate. The minimum practical granularity for a sub-agent is an L3 unit (a complete feature with multiple functions) or an L2 component.
- **Context overhead**: Each sub-agent receives its own copy of system prompts, project context, and task envelope. For an L4-level task (e.g., "write a password hashing function"), the context overhead (5000+ tokens of setup) exceeds the work itself (50 lines of code).
- **State management**: The recursive assembly model (L4->L3->L2->L1->L0) requires each higher level to "assemble" lower-level results. But in Claude Code, there is no mechanism for an L3 agent to "receive" L4 outputs and "assemble" them -- the main thread must do all assembly because sub-agents cannot call other sub-agents (the Multi-Agent Orchestration Rules explicitly state sub-agents cannot spawn further agents).

### 2.2 Recursive Assembly Model: Dead-Lock Risk

**Risk identified: Medium-High.**

The assembly chain specifies:

```
L4 code blocks -> assembled into L3 units -> assembled into L2 components -> assembled into L1 modules -> assembled into L0 product
```

The problem: **this is not truly recursive**. The contract states "each agent assembles within its level and dispatches downward" (lego-assembly-workflow.md §4.6.1), but also states "recursive depth not exceeding 3 layers." These are contradictory:

- L0 (main thread) assembles L1 modules = depth 1
- L1 agent assembles L2 components = depth 2
- L2 agent assembles L3 units = depth 3
- L3 agent assembles L4 code blocks = depth 4

That is 4 levels of nesting, exceeding the stated limit of 3. Either the limit must be raised to 4, or the model must flatten.

Furthermore, the CLAUDE.md Part B states "sub-agents are read-only in review scenarios" and "sub-agents only execute bounded work packets, cannot recursively orchestrate" (cluster-orchestration.md §2.1). This means **only the main thread can do assembly**. The recursive model collapses to a sequential pipeline:

```
Main thread -> fan-out L4 manufacturing -> wait -> fan-in L4 results -> assemble into L3 -> verify -> fan-out L3 manufacturing -> ...
```

This is not recursive -- it is **sequential level-by-level assembly with fan-out within each level**. The contract should be honest about this.

### 2.3 7-Stage x LEGO Level Mapping

**Correctness: Good.**

The mapping table (lego-assembly-workflow.md §4.2) correctly assigns:
- Stage 1 (Learning) to L0+L1 -- correct, architecture research is product/module level
- Stage 2 (Architecture) to L0->L4 -- correct, decomposition spans all levels
- Stage 3 (PRD) to L0+L1 -- correct, PRD is product/module level
- Stage 4 (Detailed Design) to L1->L4 -- correct, design goes down to code block level
- Stage 5 (Development Plan) to L1->L4 -- correct, planning maps to all implementation levels
- Stage 6 (Coding) to L4 -- correct, coding is code-block level
- Stage 7 (Testing) to L3->L0 -- correct, testing verifies upward from unit to product

This mapping is logically consistent and well-reasoned.

### 2.4 Design Depth Requirements

**Assessment: Realistic for Complex, excessive for Standard.**

The depth requirements for Stage 4 (detailed design) requiring "sub-agents can write code without additional decisions" is a good standard. However, for a Standard task (e.g., "add login form"), requiring this level of detail for every L4 code block is excessive. The contract acknowledges this via the Trivial task exemption but does not provide a "lite" mode for Standard tasks that fall in the middle.

**Recommendation**: Add a Standard-Lite mode for Standard tasks where only L0-L2 decomposition is required, and L3/L4 are handled directly by the main thread without full agent dispatch.

---

## 3. Agent Orchestration Analysis

### 3.1 Agent Assignment Matrix

**Correctness: Partially correct.**

The agent assignment matrix (lego-assembly-workflow.md §4.6.2) defines the right fields: packet_id, lego_level, objective, read_scope, write_scope, dependencies, acceptance, verification, rollback. This is a solid envelope.

**Practical issue**: The matrix assumes each work packet maps to one agent. But in practice:
- Multiple L4 packets can be handled by a single agent in one invocation (e.g., "write all DTO classes for the auth module")
- A single complex L3 packet may need multiple agents (e.g., frontend + backend for a login component)

The matrix should support **agent grouping** (multiple packets per agent) and **multi-agent per packet** (complex packets needing parallel frontend/backend work).

### 3.2 Fan-Out -> Wait -> Fan-In Workflow

**Correctness: Fully correct.**

Both lego-assembly-workflow.md (§4.6.3) and cluster-orchestration.md (§8) specify the same workflow:

1. Plan: identify parallelizable tasks
2. Fan-Out: spawn all agents in a single message (critical for true parallelism)
3. Wait: wait for convergence, no busy polling
4. Fan-In: collect results, check conflicts, fill gaps
5. Synthesize: form unified conclusion

This is correctly specified and matches Claude Code's actual parallel execution model. The "single message for parallelism" rule is particularly important and correctly emphasized.

**Minor gap**: The "Wait" step does not specify what happens if a subset of agents completes while others are still running. Can the main thread begin partial assembly? The current model implies all-or-nothing waiting, which is suboptimal for large fan-outs.

**Recommendation**: Add support for **progressive fan-in** -- as agents complete, the main thread can begin verifying and integrating completed packets without waiting for all agents to finish. This is especially important for the ~10 agent upper limit.

### 3.3 Fan-In Report Structure

**Correctness: Good.**

The fan-in report (cluster-orchestration.md §5) includes: Accepted Outputs, Discarded Outputs, Conflict Resolution, Residual Risks, Recovery status. This is comprehensive and well-structured.

**Practical issue**: The report format assumes there will be conflicting outputs to discard. In practice, when agents have non-overlapping write scopes (which they should in a well-designed decomposition), there are no conflicts. The report structure should distinguish between "conflict resolution" (agents produced competing outputs) and "integration" (agents produced complementary outputs that need to be combined).

### 3.4 Anti-Pattern Detection

**Correctness: Detectable in theory, not in practice.**

The skill-tool-mapping.md §9 lists 7 anti-patterns. Assessing detectability:

| Anti-Pattern | Detectable? | How |
|--------------|-------------|-----|
| Bash abuse | Yes | Review the git diff for grep/cat/find/sed/awk usage |
| Gratuitous agent spawn | Yes | Count tool calls; if <5, flag |
| Skip intent confirmation | Yes | Check if 00-user-intent.md exists before first work |
| Tool unavailable not logged | Partially | Requires checking that every tool failure has a corresponding exception record |
| Parallel disguised as serial | Yes | Check if agent calls span multiple assistant messages |
| Tool selection without rationale | No | Relies on agent self-documentation |
| Skill ignore | No | No mechanism to track skill availability vs. usage |

The last two anti-patterns are **not detectable in practice**. The contract should either remove them or add an enforcement mechanism (e.g., require agents to log tool selection decisions in route-projection.yaml).

---

## 4. Exception Recovery Analysis

### 4.1 Exception Types and Recovery Paths

**Correctness: Incomplete.**

The exception table (lego-assembly-workflow.md §4.6.4) covers 5 exception types:

1. **Agent hang (timeout)**: "2x expected time" -- the problem is "expected time" is undefined. Claude Code does not expose an agent execution time metric that the main thread can query. The main thread would need to manually track wall-clock time, which is impractical in an LLM-driven system.

2. **Insufficient output**: "Fan-In discovers acceptance not met" -- this is detectable but the recovery action ("mark incomplete -> re-dispatch") does not specify what context the re-dispatched agent receives. Does it get the original design spec again? Does it get the failed output as negative example? This gap means re-dispatch may produce the same failure.

3. **Quality failure**: "Review Fail -> fix -> re-review (max 3 rounds)" -- this is correct and aligns with Rule 2. But the contract does not specify who does the fix: the original agent, a new agent, or the main thread? For quality failures, re-dispatching to the same agent is likely to produce the same result (the agent made the same mistake because of the same understanding).

4. **Dependency not ready**: "Put in wait queue -> re-dispatch when dependency completes" -- this is correct in concept but Claude Code has no native "wait queue" mechanism. The main thread would need to manage this manually.

5. **Context budget insufficient**: "Execute compaction -> checkpoint -> continue" -- this is correct but conflates two different problems: context budget (main thread issue) vs. agent failure (sub-agent issue).

### 4.2 Recovery Priority

The stated priority (hang > insufficient output > quality failure > dependency not ready) is reasonable. However, the contract does not address **compound failures** -- what if an agent hangs AND its output (if partially received) is of poor quality? The priority system assumes single-failure scenarios.

### 4.3 Recovery Path Completeness

**Missing recovery paths:**

- **Agent produces correct but incomplete output**: e.g., implements 3 of 5 required functions. Not quite "insufficient" (some output is correct) but not "complete" either.
- **Agent produces output that conflicts with another agent's output**: e.g., both agents define the same function differently. This is an integration conflict, not a quality issue.
- **Agent crashes mid-execution**: Claude Code can kill sub-agents, but the contract does not define what happens to partially written files.
- **Main thread failure**: If the orchestrator's context expires or the session disconnects during a multi-agent execution, there is no recovery path for the partially completed fan-out.

**Recommendation**: Add these four recovery paths to the exception table.

---

## 5. Comparison to Codex Cluster Orchestration

### 5.1 Architectural Differences

The cluster-orchestration contract (§6) explicitly references Codex's execution-orchestration-contract.md as the source of the 7 Activity Families. Comparing:

| Aspect | Codex Model | Claude Code Model (This System) |
|--------|-------------|--------------------------------|
| Communication | tmux team sessions with shared state | Agent tool with isolated sub-processes |
| Coordination | File-based contracts in /root/.codex/ | YAML manifests and fan-in reports |
| Parallelism | OS-level tmux panes (true parallel) | Agent tool (parallel only within single message) |
| State machine | OMX runtime | 00-task-state.yaml (file-driven) |
| Skills | 534 skillSpecs | skill-tool-mapping decision tree (~9 skills) |
| Enforcement | Shell hooks + contract registry | Agent awareness + checklists |

### 5.2 Assessment: Different, Not Better or Worse

**Where this system is better:**
- The skill-tool-mapping decision tree is more practical than 534 skillSpecs (which are unmanageable)
- The YAML manifest + fan-in report structure is more auditable than tmux shared state
- The file-driven state machine (00-task-state.yaml) is more portable than OMX runtime
- The 4-gate closeout system provides better quality assurance than Codex's minimal closeout

**Where Codex is better:**
- tmux provides true OS-level parallelism and shared file system access -- agents can literally see each other's output in real time. Claude Code's agent isolation means no inter-agent communication.
- Shell hooks provide actual enforcement (pre-commit hooks can block bad commits). Claude Code relies on agent self-compliance.
- The 534 skillSpecs, while unwieldy, provide finer-grained capability definitions than the 9-skill mapping.

**Where the models diverge:**
- Codex assumes persistent infrastructure (tmux sessions, shell hooks, CLI tools). Claude Code assumes ephemeral sessions with no persistent state between invocations.
- Codex's cluster model is designed for a dedicated server environment. Claude Code's model must work within the constraints of a CLI tool with limited parallelism (~10 agents max).

**Key insight**: This system should not try to replicate Codex's cluster model -- it should embrace Claude Code's constraints. The Fan-Out/Wait/Fan-In model is correct for Claude Code. The recursive assembly model (which assumes inter-agent communication) is not.

---

## 6. Specific Recommendations

### 6.1 Critical (Must Fix Before Pass)

1. **Resolve circular dependency**: Break the lego-assembly-workflow <-> work-packet-governance <-> cluster-orchestration triangle. The correct DAG is: work-packet-governance (produces packets) -> cluster-orchestration (orchestrates) -> lego-assembly-workflow (assembles). Remove reverse edges.

2. **Flatten or fix recursive assembly**: Either raise the nesting limit from 3 to 4, or reframe the model as "sequential level-by-level assembly with fan-out within levels" (which is what actually happens in Claude Code).

3. **Define agent timeout**: Replace "2x expected time" with a concrete metric. Options: (a) use Claude Code's built-in timeout mechanism if available, (b) define expected time ranges per LEGO level (L4: 5 min, L3: 15 min, L2: 30 min), (c) remove timeout detection entirely and rely on manual intervention.

4. **Add re-dispatch context specification**: When re-dispatching a failed agent, specify what context it receives: original design spec, failed output, error analysis, and any corrected guidance.

### 6.2 High (Should Fix)

5. **Add progressive fan-in support**: Allow the main thread to begin integrating completed packets without waiting for all agents to finish.

6. **Support agent grouping in assignment matrix**: Allow multiple L4 packets per agent invocation, and allow multi-agent assignment for complex L3 packets.

7. **Distinguish conflict vs. integration in fan-in report**: Add separate sections for "conflict resolution" (competing outputs) and "integration summary" (complementary outputs).

8. **Add 4 missing recovery paths**: partial output, inter-agent conflict, agent crash, main thread failure.

### 6.3 Medium (Nice to Have)

9. **Add Standard-Lite decomposition mode**: For Standard tasks, allow L0-L2 only decomposition with main-thread handling of L3/L4.

10. **Make anti-patterns 6-7 detectable**: Require agents to log tool selection decisions in route-projection.yaml.

11. **Honest language about enforcement**: The system should explicitly state that all rules are "strong conventions" not "hard gates," since 86% of rules rely on agent awareness (as documented in architecture-audit.md §9.3).

12. **Clarify who fixes quality failures**: The contract should specify that quality failures trigger re-dispatch to a NEW agent (not the original), or escalation to the main thread.

---

## 7. Remaining Risks

### 7.1 Execution Risk: Agent Overhead

The biggest risk is that the process overhead of the LEGO assembly model (decomposition -> planning -> agent dispatch -> fan-in -> assembly -> verification) exceeds the value it provides for typical Standard tasks. For a feature that takes 30 minutes to code manually, the process requires:
- 30+ minutes of Stage 1-5 planning
- 10+ minutes of agent dispatch and fan-in
- 10+ minutes of assembly and verification
- 10+ minutes of review and closeout

Total process overhead: 60+ minutes for a 30-minute coding task.

**Mitigation**: The Trivial task exemption helps, but Standard tasks are the majority of real-world work. The Standard-Lite mode (Recommendation 9) would help.

### 7.2 Context Risk: State Explosion

An agent executing a full Standard task must track 8 dimensions of state simultaneously (architecture-audit.md §8.3): phase, stage, subphase, gate status, LEGO level, action family, artifact kind, and delivery mode. This exceeds the practical context management capacity of a single agent session.

**Mitigation**: The context-compaction contract helps, but compaction fires at 55% budget, which may be too late for a task that needs all 8 dimensions throughout execution. Recommendation: reduce the number of tracked dimensions by merging related ones (e.g., stage + phase are redundant).

### 7.3 Correctness Risk: Assembly Verification Gap

The assembly chain requires unit tests (L4->L3), integration tests (L3->L2), module tests (L2->L1), and e2e tests (L1->L0). But most codebases do not have this level of test infrastructure. When tests are missing, the assembly verification becomes manual (agent mental checking), which undermines the "evidence-driven" principle.

**Mitigation**: The contract should define a "test-absent fallback" for assembly verification: when automated tests are not available, the main thread must perform manual code review of the integration points with specific checkpoints.

### 7.4 Scalability Risk: ~10 Agent Limit

The system is designed for large fan-outs but Claude Code caps at ~10 concurrent agents. For a feature with 20+ L4 code blocks, the system must batch into multiple fan-out rounds, which introduces sequential dependencies between batches. The current model does not address inter-batch coordination.

**Mitigation**: The development plan (Stage 5) should include batch planning -- grouping L4 packets into batches of <=10 that can be dispatched in parallel, with clear inter-batch dependencies.

---

## Checklist Coverage

| Checklist | Items Covered | Items Satisfied | Notes |
|-----------|--------------|-----------------|-------|
| stage2-architecture-review.md | 17 items | 15/17 | Recursive assembly depth (item on L3->L2 promotion) needs clarification |
| stage4-5-plan-review.md | 17 items | 13/17 | Agent timeout metric missing, progressive fan-in not defined, Standard-Lite mode absent |
| stage6-code-review.md | 24 items | 20/24 | Test-absent fallback not defined, inter-agent conflict handling not specified |

---

*End of review report. Verdict: Conditional Pass.*
