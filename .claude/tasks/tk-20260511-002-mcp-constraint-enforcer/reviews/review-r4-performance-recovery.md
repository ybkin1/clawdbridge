# Review Report: Performance + Exception Recovery

## Verdict: Fail

> **Rationale**: The MCP constraint-enforcer architecture exhibits systemic performance degradation under multi-config reload scenarios, sequential checker execution with no cross-call caching, and unbounded filesystem scanning in `evaluateCondition`. More critically, the exception-recovery surface is almost entirely undefined: there is no heartbeat mechanism for dead-agent detection, no specification for Sub-Orchestrator crash recovery, no atomicity guarantee in `requestPhaseTransition`, and orphaned `board.yaml` active_claims are left permanently locked if an agent dies without releasing. These are not edge cases; they are guaranteed failure modes at scale.

---

## Findings

| Severity | ID | Description | Evidence | Remediation |
|----------|----|-------------|----------|-------------|
| Critical | P-001 | `loadConfig` performs **1 `fs.statSync` + 1 `fs.readFileSync` per call**, and is invoked **at least 4 times per tool call** (mechanical-conditions, write-permissions, phase-state-machine, mcp-capabilities). Worst-case all 4 configs modified simultaneously = 4 cache misses = 4 `statSync` + 4 `readFileSync` + 4 YAML parses. | `enforcer.js:46-61` | Batch config loading into a single `loadAllConfigs()` call with one directory `readdirSync` scan; use a single mtime key for the entire config directory. |
| Critical | P-002 | `evaluateCondition` performs **O(n) `fs.readdirSync` scans of `checkers/`** for every `checker_result_status` and `mandatory_checkers_all_passed_or_excepted` condition. With 10 conditions and 20 checker result files, this is **200+ dirent operations per `checkPhaseReadiness` call**. | `enforcer.js:189-194`, `enforcer.js:216-220` | Pre-index checker results into a `Map<checkerId, filepath>` once per `checkPhaseReadiness` invocation; pass it into `evaluateCondition`. |
| Critical | P-003 | `runMandatoryCheckers` spawns subprocesses **strictly sequentially** in a `for...of` loop with `await`. No `Promise.all`, no worker pool, no concurrency limit. A task with 10 checkers each taking 5s = **50s wall-clock time**. | `enforcer.js:426-510` | Implement bounded parallelism (e.g., `p-limit(3)`) for `runBashChecker` invocations; respect resource limits. |
| High | P-004 | **No batching or caching of checker results across multiple MCP tool calls**. If an Agent calls `checkPhaseReadiness` then `validateWritePermission` then `requestPhaseTransition`, `loadConfig` and `evaluateCondition` rerun fully each time. | `enforcer.js:46-61`, `enforcer.js:263-315` | Introduce a **call-scope cache** (or process-level TTL cache) for config + checker index + readiness gaps; invalidate only on mtime change. |
| High | P-005 | For a task with **28 packets and 3 agent tiers**, the estimated MCP tool call count is **unbounded and potentially >200 calls** because each packet transition triggers `checkPhaseReadiness` + `runMandatoryCheckers` + `generateEvidenceLock` + `requestPhaseTransition`, and `evaluateCondition` rescans the filesystem every time. | Derived from `enforcer.js` call graph + `task-tracking-workflow-spec.md` §4.6 | Add a **coalesced transition API** (`batchPhaseTransition`) that validates all packets in a single config load + single filesystem scan. |
| High | P-006 | The Hook (PreToolUse) **adds latency to EVERY tool call** because `validateWritePermission` is designed to be invoked synchronously before any Write/Edit. With filesystem scans + YAML parsing + condition evaluation, this is **~5-20ms per tool call** on SSD, **50-200ms on network fs**, compounding across thousands of calls. | `task-tracking-workflow-spec.md` §4.6 MCP tool call requirements table | Make the Hook **async-cache-backed**: keep a 5-second TTL in-memory cache of `validateWritePermission` results keyed by `(taskDir, filePath, phaseStatus)`. |
| Critical | R-001 | **The spec does NOT define what happens when a Sub-Orchestrator crashes mid-task.** `cluster-orchestration.md` §6.1-6.3 defines multi-agent routing but contains zero text on crash recovery, restart semantics, or partial fan-in handling. | `cluster-orchestration.md` full text search | Add a §"Sub-Orchestrator Crash Recovery" to `cluster-orchestration.md` defining: heartbeat timeout, lease expiry on `board.yaml` claims, and re-invocation policy. |
| Critical | R-002 | **There is no heartbeat or timeout mechanism for detecting dead agents.** `board.yaml` has `claimed_at` but no `expires_at`, `heartbeat_at`, or `timeout_policy`. A dead agent's claim lasts forever. | `task-tracking-workflow-spec.md` §7.4 claim/release table; `board.yaml` schema | Add `claim_timeout_ms` and `heartbeat_interval_ms` to `board.yaml` schema; define a `stale-claim-reaper` checker or background task. |
| High | R-003 | **Fan-In canNOT safely proceed if 1 of 4 review agents fails to return.** `cluster-orchestration.md` §5.2 Fan-in Report requires "Accepted Outputs" and "Discarded Outputs" but does not specify whether partial fan-in (3/4 agents) is allowed, blocked, or requires manual override. | `cluster-orchestration.md` §5.1-5.2 | Add explicit rule: `min_fan_in_ratio: 0.75` (or `all_mandatory_lanes_must_return`) to the Fan-in Report schema; define fallback to `single_thread_exception` if threshold not met. |
| High | R-004 | **`board.yaml` active_claims are permanently orphaned if an agent dies without releasing.** No reaper, no TTL, no `transferred_at` auto-cleanup. Other agents are blocked from claiming the work item forever. | `task-tracking-workflow-spec.md` §7.4: "未 release 的 work item 不得被其他 Agent 修改" | Implement a `claim_lease_expires_at` field; enforce via `checkPhaseReadiness` or a dedicated `board-claim-health` checker. |
| High | R-005 | **There is no checkpoint/retry mechanism for interrupted phase transitions.** If `requestPhaseTransition` crashes after writing the temp file but before `fs.renameSync`, or if the process dies after rename but before returning to the caller, the task state is updated but the caller never received the result. No idempotency key. | `enforcer.js:866-884` | Add an `idempotency_key` to `requestPhaseTransition` args; write it into `phase_transition_history`; on retry, return the existing transition if the key matches. |
| Critical | R-006 | **`requestPhaseTransition` is NOT atomic.** It performs: (1) `checkPhaseReadiness`, (2) `generateEvidenceLock`, (3) `fs.writeFileSync(tempFile)`, (4) `fs.renameSync`. Steps 1-2 are side-effect-free, but step 3+4 are filesystem operations that can fail independently. If rename fails, the temp file is orphaned and state is inconsistent. There is no rollback. | `enforcer.js:787-898` | Wrap the write+rename in a try/catch that deletes the temp file on failure; better yet, use an atomic write library or SQLite-backed state store. |
| High | R-007 | **`runBashChecker` has a hardcoded 60s timeout but no retry, no backoff, no circuit breaker.** A transient network failure (e.g., checker script fetches external data) causes immediate `blocked` status with no recovery path. | `enforcer.js:346` | Add `maxRetries` (default 1) and `retryDelayMs` (default 1000) to `runBashChecker`; distinguish `TIMEOUT` from `FAILED` in status mapping. |
| Medium | R-008 | **`checkPhaseReadiness` returns `auditorRequired: true` only when gaps include the string `auditor_verdict_audited`.** This is fragile string-matching; a renamed condition ID would silently break the signal. | `enforcer.js:304` | Use a structured flag from `evaluateCondition` (e.g., `cond.signals?.includes("auditorRequired")`) instead of substring matching. |

---

## Dimension Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Config Reload Performance** | 2/10 | Per-call `statSync` + `readFileSync` with no directory-level batching. Worst-case 4 cache misses = 8 sync I/O ops + 4 YAML parses per tool invocation. |
| **Checker Execution Performance** | 1/10 | Strictly sequential subprocess spawning. No parallelism, no cross-call caching, O(n*m) directory rescans. 10 checkers × 5s = 50s wall-clock minimum. |
| **MCP Tool Call Overhead** | 2/10 | Hook adds latency to every Write/Edit. No TTL cache on `validateWritePermission`. Thousands of tool calls in a 28-packet task = minutes of cumulative overhead. |
| **Scalability (28 packets × 3 tiers)** | 1/10 | Estimated >200 MCP tool calls with full config reload + filesystem scan each. No batching API. Architecture will collapse under its own weight at this scale. |
| **Sub-Orchestrator Crash Recovery** | 0/10 | Not defined anywhere in the spec or code. Complete gap. |
| **Dead Agent Detection** | 0/10 | No heartbeat, no timeout, no lease expiry. `claimed_at` is a tombstone, not a lease. |
| **Fan-In Partial Failure Handling** | 2/10 | Fan-in report schema exists but lacks rules for partial returns. No minimum threshold, no fallback lane. |
| **Phase Transition Atomicity & Retry** | 2/10 | Temp-file rename is atomic-ish, but the overall operation (readiness → evidence lock → state write) is not. No idempotency, no retry safety. |

---

## Summary

The constraint-enforcer MCP Server is functionally correct for trivial workloads but architecturally unsuited for the scale it is specified to handle (28 packets, 3 agent tiers, 10+ checkers). The performance surface is dominated by **repeated synchronous filesystem I/O** and **sequential subprocess execution** with no caching layer. The exception-recovery surface is worse: **critical failure modes (dead agents, crashed sub-orchestrators, interrupted transitions) are entirely unaddressed** in both code and specification.

**Immediate actions required:**
1. Implement config-directory-level mtime caching and batched loading.
2. Parallelize `runMandatoryCheckers` with a bounded concurrency pool.
3. Add a checker-result index (Map) inside `checkPhaseReadiness` to eliminate O(n) rescans.
4. Define Sub-Orchestrator crash recovery and dead-agent reaper in `cluster-orchestration.md`.
5. Add `claim_lease_expires_at` and `heartbeat_at` to `board.yaml`.
6. Make `requestPhaseTransition` idempotent with an explicit idempotency key and rollback on failure.
7. Add a `min_fan_in_ratio` rule to the Fan-in Report schema.

Without these changes, the architecture will experience cascading failures at scale that no amount of procedural discipline can prevent.
