# Review Report: Execution-Face Structural Guarantee Audit (Round 3)

**Reviewer**: Review-2-Execution-Face (Sub-Agent, Read-Only)
**Date**: 2026-04-30
**Verdict**: **Conditional Pass**

---

## 1. Executive Summary

Core finding: CLAUDE.md Part C correctly admits the system is **convention-driven, not platform-enforced**, which resolves the language-vs-reality mismatch. However, zero structural enforcement scripts exist. All 11 checkers are conceptual. The system is now transparent about its limitations but not more enforceable.

---

## 2. Per-Contract Execution-Face Analysis

## 2.1 verification-checker.md -- 11 Checkers Executability

__0 / 11 executable today.__

  - #1 route-output-closure: Automated, not executable, __High feasibility__ ~15 lines Python
  - #2 state-projection-alignment: Automated, not executable, __High feasibility__ ~30 lines
  - #3 review-consistency: Hybrid, Agent mental check, __Medium__
  - #4 dirty-chain-prevention: Automated, not executable, __Medium__, needs platform hooks
  - #5 dirty-hygiene-closure: Automated, not executable, __High feasibility__ scan for draft-*/*.tmp
  - #6 dangling-reference: Automated, not executable, __High feasibility__ regex markdown links
  - #7 stale-projection-cleanup: Automated, not executable, __Medium__
  - #8 subagent-orchestration: Hybrid, Agent mental check, __Low__, needs platform access
  - #9 context-budget-delegation: Automated, not executable, __Low__, no programmatic access
  - #10 compaction-trigger-closure: Automated, not executable, __Medium__, when expected undefined
  - #11 architecture-decomposition: Manual, by design manual, inherently requires human judgment


## 2.2 lego-assembly-workflow.md -- Agent Timeout 2x Expected Time

__NOT DEFINED.__ No mechanism exists to record/compute expected time for a work packet. Hang detection rule is non-functional. No `pestimated_duration` field in packet schema. Fix: Add estimated_duration or default fallback (10 min L4, 30 min L3).

## 2.3 skill-tool-mapping.md -- 7 Anti-Patterns Auto-Detectability

  - #1 Bash abuse: __YES__ __High__, regex on execution transcripts
  - #2 Gratuitous Agent spawn: __YES (post-hoc)__ __High__, count tool calls if <= 5
  - #3 Skip intent confirmation: __NO__ __Low__, conversational, no structural signal
  - #4 Tool unavailable not logged: __PARTIAL__ __Medium__, detect failed invocation + no exception
  - #5 Parallel camouflage: __YES (post-hoc)__ __High__, check Task calls in same message
  - #6 Tool selection no rationale: __PARTIAL__ __Medium__, check rationale text presence
  - #7 Skill ignore: __NO__ __Low__, undetectable without Skill invocation policy

> __Summary__: 3 high-feasibility auto-detectable, 2 partial, 2 not. #1 and #5 are highest-value targets.

## 2.4 context-governance-contract.md -- Context Budget 55%/70%/85%

__NOT DEFINED.__ No API to query context consumption %. Agent must self-estimate based on conversation length. Sub-Agent isolation Jaccard >=80% threshold also manual only. Compression triggers are advisory, not enforced.

## 2.5 dirty-hygiene-spec.md -- Automated Tools

__Automated tools: ZERO.__ All detection relies on agent mental execution at the defined trigger points. No standalone scripts, no pre-write hooks, no directory watchers exist. Checkers in section 7 are checklists, not code. The taxonomy and trigger schedule are well-defined but entirely soft execution.

## 2.6 CLAUDE.md -- Enforcement Declaration Honesty

Mostly honest. __One inaccuracy__: 'checker scripts execution' implies scripts are running. Zero exist. Should say 'checker definitions (not yet implemented)'.

---

## 3. Soft / Hard Statistics 

| Enforcement Type | Count | % of ~112 rules |
|------------------|-----|----------------|
| Structural (scripts/hooks) | ****0 (0%) |
------------------------------------
| Checklist-backed (agent)| **~11 (~10%)**|
---------------------------------
| Agent awareness only   | **~86 (~77%)**|
| Explicitly exempt      | **~15 (~13%)**|

**Soft enforcement rate: ~87%** -- consistent with prior rounds. No improvement in structural enforcement, only in honesty.

---

## 4. Undefined Metrics Inventory

1. Expected time 2x - No `estimated_duration` field in packet schema
2. Context budget % - No formula/API for agent to measure
3. Jaccard >=80% - Manual comparison only
4. 50+ tool calls - No tool call counter, agent self-estimates
5. Independently manufacturable - Subjective, different agents decompose differently
6. Word count gate (3000/2000/1500) - No word-count enforcement tool

---

## 5. Recommendations (Prioritized)

**Quick wins (<50 lines, no platform integration needed):**
1. Implement `dangling-reference-check` script -- highest value, most common violation
3. Implement `state-projection-alignment-check` script -- diff state vs README
4. Implement `route-output-closure-check` script -- YAML field existence

**Medium effort:**
5. Add `estimated_duration` field to work packet YAML schema -- fixes Agent hang detection
6. Correct CLAUDE.md enforcement declaration: change 'checker scripts execution' to 'checker definitions (not yet implemented)'

**Longer-term (platform integration needed):**
7. Context budget measurement -- requires Claude Code runtime API exposure
8. Anti-pattern #1 (Bash Abuse) and #5 (Parallel Camouflage) auto-detection -- transcript analysis

---

* End of report.*