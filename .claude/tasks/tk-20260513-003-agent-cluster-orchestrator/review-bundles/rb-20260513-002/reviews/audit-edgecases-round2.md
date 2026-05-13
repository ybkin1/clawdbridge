# Audit & Edge Cases Round 2 Review — rb-20260513-002

## Summary
**Conditional Pass**

The constraint-enforcer MCP Server and its surrounding configuration demonstrate strong fail-closed design in the common path, with atomic writes, path traversal guards, role-based permissions, and config-driven mechanical conditions. However, several critical gaps remain in tamper detection implementation, circular dependency resolution, implicit allow paths under compound failure scenarios, and edge case handling for malformed inputs. The system is safe for controlled deployments but requires remediation before being trusted as a single point of enforcement.

---

## Findings (sorted by severity)

### Critical

#### C-1: `tamper_detected` is documented but NOT implemented in `enforcer.js`
- **Evidence**: `auditor.md` (line 42) defines `tamper_detected: true|false` in the verdict schema. `.claude/CLAUDE.md` Rule 8 states: "检测到 Auditor verdict 被覆盖时，标记 `tamper_detected`，task 自动进入 `blocked` 状态。"
- **Gap**: `enforcer.js` `requestPhaseTransition` (line 1230) reads `state.auditor_verdict` and blocks if not `"audited"`, but there is NO code path that:
  1. Detects an orchestrator overwrite of `auditor_verdict` (e.g., comparing file mtime, hash, or a signed receipt).
  2. Sets `tamper_detected: true` in state or returns it in the transition result.
  3. Forces the task into a `blocked` phase.
- **Impact**: An orchestrator can freely edit `00-task-state.yaml` to set `auditor_verdict: audited`, and the enforcer will accept it without cryptographic or receipt-based verification. The "read-only" property of the auditor verdict is purely social/conventional.
- **Recommendation**: Implement an evidence-lock signature or HMAC for the auditor verdict; store auditor receipts in `reviews/receipt-auditor.yaml`; `requestPhaseTransition` must validate the receipt signature/hash before trusting `auditor_verdict`.

#### C-2: Orchestrator can fake `auditor_verdict: audited` with no cryptographic barrier
- **Evidence**: `requestPhaseTransition` line 1230: `const auditorVerdict = state.auditor_verdict || ""; if (auditorVerdict !== "audited") { ... }`
- **Gap**: There is no check of WHO wrote `auditor_verdict`. The `write-permissions.yaml` blocks `worker` and `reviewer` from writing `00-task-state.yaml`, but `orchestrator` is explicitly ALLOWED to write it (line 15). The `validateWritePermission` function permits orchestrator writes to state files after readiness checks, but readiness does NOT include "was this field modified by an unauthorized party."
- **Impact**: The orchestrator (which is also the party requesting phase transitions) can self-approve by editing the state file it controls.
- **Recommendation**: Remove `orchestrator` write permission to `auditor_verdict` field entirely; require auditor receipts to be written by a separate `auditor` role to `reviews/receipt-auditor.yaml`, and have `requestPhaseTransition` read the verdict from the receipt file instead of from mutable state.

#### C-3: Circular dependency in rule activation is unresolved and silently accepted
- **Evidence**: `registry.yaml` shows `action-governance` depends on `task-tracking`, and `task-tracking` depends on `task-routing`, which depends on `intent-capture`. `lego-assembly-workflow` depends on `cluster-orchestration`, which depends on `work-packet-governance`, which depends on `task-tracking`. No cycles exist in the current registry, but:
- **Gap**: `getActiveContractSetInternal` (line 1429) builds a `dependencyGraph` but NEVER validates it for cycles. If a future edit introduces a cycle (e.g., `task-tracking` accidentally depends on `review-gates`, which depends on `task-tracking`), the function will silently return a potentially inconsistent active set.
- **Impact**: Configuration drift or human error in `registry.yaml` could produce undefined behavior in contract loading, leading to skipped checks or infinite loops in downstream consumers.
- **Recommendation**: Add cycle detection in `getActiveContractSetInternal` using DFS or topological sort; return `success: false` with a clear error if a cycle is detected.

### High

#### H-1: `unknown_check_type_policy: do_not_block: true` creates an implicit allow path
- **Evidence**: `mcp-capabilities.yaml` line 72: `do_not_block: true`. `enforcer.js` `evaluateCondition` default case (line 418): if policy says `do_not_block`, it returns `passed: true`.
- **Gap**: If `mechanical-conditions.yaml` is corrupted or a `check_type` is misspelled (e.g., `field_equalse`), the condition is silently bypassed rather than blocking.
- **Impact**: A single typo in config converts a hard blocker into an automatic pass.
- **Recommendation**: Change default policy to `do_not_block: false` (fail-closed). Warnings should be emitted, but the condition must block unless explicitly exempted.

#### H-2: `validateWritePermission` has a fallback implicit allow for non-sensitive files
- **Evidence**: `enforcer.js` line 895: `if (!sensitivity.sensitive) { return { allowed: true, ... } }`
- **Gap**: If `write-permissions.yaml` fails to load (returns null) or `sensitive_patterns` is empty/malformed, ALL files are treated as non-sensitive and implicitly allowed.
- **Impact**: Compound failure (config missing + path traversal) results in allow.
- **Recommendation**: If `write-permissions.yaml` cannot be loaded, default to `allowed: false` for ALL write operations, or at least require explicit allow-list matching.

#### H-3: `runBashChecker` timeout does NOT kill the child process
- **Evidence**: `enforcer.js` line 557: `spawn(..., { timeout: timeoutMs })`. Node.js `child_process.spawn` with `timeout` emits `SIGTERM` but the handler at line 562 only resolves the promise; it does NOT call `child.kill()`.
- **Gap**: A hanging checker script (e.g., infinite loop, network wait) will be marked `blocked` in the result, but the zombie process may continue running, consuming resources, writing to temp files, or causing side effects.
- **Impact**: Resource exhaustion; potential for concurrent zombie processes to interfere with subsequent checkers.
- **Recommendation**: Store the `child` reference and explicitly call `child.kill('SIGKILL')` when timeout is detected.

#### H-4: `timestamp_freshness` returns `passed: true` when reference file is missing
- **Evidence**: `enforcer.js` line 336: `if (!fs.existsSync(artifactPath)) return { passed: true, gap: null };`
- **Gap**: If the primary artifact referenced by `current_primary_artifact` is deleted or renamed, the freshness check passes instead of failing.
- **Impact**: Stale state can transition phases even though the artifact no longer exists.
- **Recommendation**: Return `passed: false` when the reference file is missing; the artifact must exist for freshness to be meaningful.

### Medium

#### M-1: No handling for malformed `00-task-state.yaml` (valid YAML but wrong schema)
- **Evidence**: `loadYaml` (line 36) returns parsed YAML or null. If `00-task-state.yaml` contains a string instead of an object (e.g., user accidentally saves `"null"`), `state` becomes a string, and all `state?.[field]` lookups return `undefined`.
- **Gap**: `checkPhaseReadiness` would report `phase_status` as `undefined` (not `"passed"`), so gaps would include "Phase status is 'undefined', not passed." This is acceptable, but `requestPhaseTransition` at line 1179 checks `phaseStatus !== "passed"` which would also catch it.
- **However**: `validateWritePermission` line 863 loads state and checks `if (!state) return blocked`. A string is truthy, so it would proceed. Then `state.phase_status` is undefined, causing `phaseStatus = "unknown"`, which fails `isInProgress` check (line 928). This is fail-closed, but the error message is misleading.
- **Recommendation**: Add schema validation (e.g., check `typeof state === 'object' && state !== null`) after loading state; reject non-object states explicitly.

#### M-2: `runMandatoryCheckers` skips already-run checkers without verifying freshness
- **Evidence**: `enforcer.js` line 660: `if (existing) { tasks.push(() => Promise.resolve({ checkerId, action: "SKIP", file: existing })); continue; }`
- **Gap**: If a checker result exists from a previous phase or a stale run, it is reused even if the underlying files have changed.
- **Impact**: Stale checker results can satisfy readiness for a new phase transition without re-running.
- **Recommendation**: Compare checker result mtime against artifact mtime or state `updated_at`; re-run if stale.

#### M-3: `generateEvidenceLock` normalizes all non-passed checker statuses to `failed`
- **Evidence**: `enforcer.js` line 1116: `const normalizedStatus = c.status === "passed" || c.status === "excepted" ? c.status : "failed";`
- **Gap**: If a checker returns `"blocked"` or `"manual_pending"`, it is silently recorded as `"failed"` in the evidence lock. This loses semantic information and may confuse downstream audit.
- **Recommendation**: Preserve original status in the evidence lock; normalization should only affect the `all_checkers_passed` boolean, not the stored status values.

#### M-4: `agentOrchestrator` does not validate that `packet_id` values are unique
- **Evidence**: `enforcer.js` line 1641 loops over packets but never checks for duplicate `packet_id`.
- **Gap**: Duplicate `packet_id` values cause `packetAgentMap` overwrites, leading to orphaned agent assignments and lost execution plan entries.
- **Recommendation**: Add a uniqueness check for `packet_id` in the manifest validation loop.

#### M-5: `checkpointSync` "load" operation does not restore state to disk
- **Evidence**: `checkpointSync` load (line 1867) returns the snapshot but does NOT write `task_state` back to `00-task-state.yaml`.
- **Gap**: The "load" operation is a read-only query, not an actual restore. Users may mistakenly believe it rolls back state.
- **Recommendation**: Rename to "query" or implement a true restore that writes snapshot data back to task files with atomic writes.

### Low

#### L-1: `getKnownCheckTypes` has a fallback hard-coded set that may diverge from config
- **Evidence**: `enforcer.js` lines 125-135: fallback hard-coded set.
- **Gap**: If `mechanical-conditions.yaml` is temporarily unreadable, the system falls back to an older hard-coded list. New check types added to config will be rejected during validation until the config is readable again.
- **Recommendation**: Remove the fallback; if the config defining check types is unreadable, `validateConfigs` should fail loudly.

#### L-2: `evaluateEffectiveScope` treats bare strings as literal context keys
- **Evidence**: `enforcer.js` line 1387 handles `"all"`, `"all tasks"`, etc., but any other bare string falls through to line 1422: `const actual = context[str]; if (actual === undefined || actual === null || actual === false) return false;`
- **Gap**: A scope like `"all contracts"` or `"all files"` is handled, but a typo like `"all task"` (missing 's') would be treated as a context key lookup and fail silently, deactivating a contract.
- **Recommendation**: Log a warning when a scope expression falls through to the literal check and does not match any known context key.

#### L-3: `validateBashCommand` allows empty commands
- **Evidence**: `enforcer.js` line 1011: `if (command.length === 0) { return { allowed: true, ... } }`
- **Gap**: An empty command is technically harmless, but allowing it without logging creates an invisible bypass if the caller relies on this function for all Bash validation.
- **Recommendation**: Return `allowed: false` for empty commands, or at least log an informational message.

#### L-4: `requestPhaseTransition` atomic write rollback can leave temp file on disk
- **Evidence**: `enforcer.js` lines 1268-1286: rollback logic attempts cleanup but catches and ignores `unlinkSync` errors.
- **Gap**: On certain filesystems or permission issues, the temp file may persist, potentially leaking state snapshots.
- **Recommendation**: Ensure temp file cleanup is attempted at least once with logging on failure.

### Informational

#### I-1: `test.js` does not test the "no active task" path for most tools
- Most tests assume `TEST_TASK_DIR` exists. Broader edge case coverage (missing config, corrupted YAML, network failures in WebFetch) is not exercised.

#### I-2: `auditor.md` and `researcher.md` are prompt-level definitions, not runtime-enforced roles
- The system relies on LLM adherence to these prompts. There is no runtime identity system binding an Agent instance to a role credential. This is an architectural limitation of the current design, acknowledged but not mitigated.

#### I-3: `mechanical-conditions.yaml` `closeout_not_already_allowed` is a soft blocker
- This is by design (line 118: `blocker_level: "soft"`), but it means `closeout_allowed: true` does NOT block phase readiness. It only generates a warning. If the intent is to prevent double-closeout, this should be `hard`.

---

## Recommendations

1. **Implement cryptographic or receipt-based auditor verdict verification** (C-1, C-2): Store auditor verdicts in `reviews/receipt-auditor.yaml` with a hash/signature. `requestPhaseTransition` must validate the receipt against the evidence lock before allowing transition. Remove orchestrator write access to `auditor_verdict` in state.

2. **Change `unknown_check_type_policy` to fail-closed** (H-1): Set `do_not_block: false` in `mcp-capabilities.yaml`. Unknown check types should block and emit an error, not pass silently.

3. **Add dependency cycle detection** (C-3): In `getActiveContractSetInternal`, perform topological sort or DFS cycle detection on `dependencyGraph` before returning the active set.

4. **Harden `validateWritePermission` against missing config** (H-2): If `write-permissions.yaml` or `sensitive_patterns` is missing/empty, default to `allowed: false` for all write operations, or require explicit allow-list matching.

5. **Kill zombie checker processes on timeout** (H-3): Store the `spawn` child reference and call `child.kill('SIGKILL')` when the timeout signal is received.

6. **Fix `timestamp_freshness` missing-reference semantics** (H-4): Return `passed: false` when the reference artifact does not exist.

7. **Add schema validation for state files** (M-1): Reject non-object YAML content for `00-task-state.yaml` with a clear error.

8. **Implement checker result freshness validation** (M-2): Compare checker result mtimes against state/artifact mtimes before skipping.

9. **Preserve original checker status in evidence lock** (M-3): Do not normalize `"blocked"` or `"manual_pending"` to `"failed"` in the lock document.

10. **Clarify `checkpointSync` "load" semantics** (M-5): Rename to "query" or implement a true restore operation that writes snapshot data back to disk atomically.
