# Fan-In Synthesis — Round 2 Independent Review rb-20260513-002

## Review Panel

| Reviewer | Focus | Verdict |
|----------|-------|---------|
| auditor-reviewer | 规则自洽性、边界情况、Fail-Closed 完整性 | **Conditional Pass** |
| code-reviewer | MCP 约束能力、性能/资源开销、代码可维护性、扩展性 | **Conditional Pass** |
| contract-reviewer | 契约一致性、规范要求覆盖、实际应用场景、冲突检测 | **Conditional Pass** |
| architect-reviewer | 八层架构完整性、层间耦合、部署映射、目录结构 | **Conditional Pass** |

**Bundle Verdict: Conditional Pass**

All four reviewers independently reached Conditional Pass. No reviewer assigned Fail. The system is structurally sound and safe for controlled deployments, but requires remediation before being trusted as a single point of enforcement or deployed to teams smaller than 10 people without a "minimum viable subset" guide.

---

## Cross-Cutting Themes

### Theme 1: Hard-Coded Constants in L3 MCP (7 reviewers × 10 findings)

Every reviewer identified hard-coded values in `enforcer.js` that violate the "zero hard-coded rules" claim:

- `getKnownCheckTypes()` fallback Set — **auditor L-1**, **architect C-1**
- `allowedExts = [".sh", ".ps1", ".js"]` — **architect C-2**
- `MAX_CONCURRENCY = 3` — **architect C-3**, **constraints L-3**
- `groupSize = 3` — **architect H-3**
- `validDecisions` array — **architect M-1**
- `manualGates` filters only `"value"` — **architect M-2**
- `ALL_CONFIG_NAMES` manual manifest — **architect M-3**
- `SUPPORTED_CONFIG_VERSION_MIN/MAX = 1` — **architect M-4**
- `timeout: 60000` — **constraints L-3**
- `getKnownCheckTypes` fallback — **audit L-1**

**Synthesis**: This is not a collection of isolated bugs; it is a systematic architectural drift. The original plan to eliminate hard-coding was partially implemented (phase order, mechanical conditions, write permissions are now config-driven), but operational constants, fallback sets, and orchestration parameters remain embedded in L3. The root cause is the lack of a **config-meta.yaml** or **mcp-capabilities.yaml** schema that explicitly enumerates which operational parameters must be externalized.

**Unified recommendation**: Create `config-meta.yaml` with a `runtime_constants` section. All findings in this theme can be resolved by migrating constants to this file and reading them via `loadConfig()`.

---

### Theme 2: Hook / MCP Complementarity Gaps (3 reviewers × 5 findings)

- **Unhandled disk-writing tools**: Hook only intercepts `Write`, `Edit`, `Bash`. Future tools (e.g., `ApplyPatch`, `CreateFile`) or current Bash commands (`cp`, `mv`, `touch`, `rm`) bypass both layers — **constraints C-1**, **architect H-4**
- **Bash redirection parsing duplicated**: Both Hook (Python regex) and MCP (JS regex) implement nearly identical parsing — **architect M-5**
- **Hook helper imports from MCP**: `hook-enforcer-helper.js` uses `../mcp-servers/constraint-enforcer/enforcer.js` — **architect L-2**
- **python3 dependency in Hook**: Minimal CI containers without Python will hard-block all writes — **constraints L-2**
- **Hook fallback comment misleading**: Claims "falls back to legacy hardcoded logic" but actually fails closed — **architect H-2**

**Synthesis**: The Hook is robust in its current scope but not complete. The duplication of bash parsing and the cross-layer import create maintenance hazards. The most serious gap is `cp/mv/touch/rm` bypass, which allows disk writes without validation.

**Unified recommendation**:
1. Extend Hook's `TOOL_NAME` check to include a catch-all for any tool with `file_path` or `path` fields.
2. Extend `validateBashCommand()` to detect `cp`, `mv`, `touch`, `rm`, `mkdir` targets and validate them.
3. Extract shared `validateWritePermission()` logic to `.claude/lib/constraint-core.js` to eliminate cross-layer import.
4. Replace Python JSON parsing in Hook with a minimal Node script or `jq` fallback.

---

### Theme 3: Auditor / Tamper Detection Unimplemented (2 reviewers × 3 findings)

- `tamper_detected` is documented in `.claude/CLAUDE.md` Rule 8 and `auditor.md` but **not implemented** in `enforcer.js` — **audit C-1**
- Orchestrator can freely edit `auditor_verdict` to `"audited"` because `orchestrator` has write permission to `00-task-state.yaml` — **audit C-2**
- No recovery path defined after `tamper_detected` — **contract I-1**

**Synthesis**: This is the most severe security gap. The entire "Auditor verdict is read-only" guarantee is social/conventional, not technical. An orchestrator can self-approve phase transitions by editing its own state file.

**Unified recommendation**:
1. Remove `orchestrator` write permission to `auditor_verdict` field.
2. Store auditor verdicts in `reviews/receipt-auditor.yaml` with an HMAC or hash.
3. `requestPhaseTransition` must validate the receipt before trusting the verdict.
4. Define a tamper recovery protocol in `exception-governance.md`.

---

### Theme 4: Spec-Config-Code Divergence (3 reviewers × 6 findings)

- `task-tracking-workflow-spec.md` §4.2.1 claims 8 mechanical conditions, but `mechanical-conditions.yaml` has 10 — **contract C-1**
- `verification-checker.md` §5 lists 11 checkers, but `checkers/index.yaml` has 19 — **contract M-3**
- `agent-orchestration-rules.yaml` duplicates atomicity constants from `atomicity-rules.yaml` — **architect L-3**
- `config-sync-check.js` only validates structural consistency, not semantic cross-references — **contract H-5**
- `getActiveContractSetInternal` builds a dependency graph but never checks for cycles — **audit C-3**
- `registry.yaml` declares `cluster-orchestration` as `provisional`, but `lego-assembly-workflow` and `execution-traceability` depend on it — **contract H-2**

**Synthesis**: The "single source of truth" principle is violated in multiple dimensions: spec vs config count mismatches, config vs config duplicate constants, and registry vs contract dependency inconsistencies. The existing `config-sync-check.js` is necessary but not sufficient.

**Unified recommendation**:
1. Update `task-tracking-workflow-spec.md` §4.2.1 to document all 10 conditions.
2. Synchronize `verification-checker.md` §5 with `checkers/index.yaml`.
3. Remove duplicate constants from `agent-orchestration-rules.yaml`.
4. Extend `config-sync-check.js` with semantic cross-validation (checker gate bindings, checklist stage names, registry checklist refs, mechanical condition check_type implementations).
5. Add cycle detection to `getActiveContractSetInternal`.
6. Resolve `cluster-orchestration` status (promote to active or add fallback path).

---

### Theme 5: Monolith / Performance / Scalability (2 reviewers × 4 findings)

- `enforcer.js` at 1897 lines contains 10+ tool handlers, 3 config loaders, 2 registry parsers, orchestration logic, checkpoint sync — **constraints H-1**
- L4-L6 orchestration logic (agentOrchestrator, agentStatus, checkpointSync) co-located in L3 MCP — **architect H-1**
- Each checker spawns a new OS process — 19 checkers = ~950ms minimum wall time — **constraints H-2**
- `fs.statSync` mtime hot-reload can miss edits within 1 second on coarse filesystems — **constraints H-3**

**Synthesis**: The monolithic `enforcer.js` is approaching unmaintainability. The spawn-per-checker model will not survive 50+ checkers. However, these are forward-looking concerns, not immediate blockers for the current 19-checker deployment.

**Unified recommendation**:
1. **Short-term**: Split `enforcer.js` into `enforcer/` sub-modules (config-loader, condition-engine, permission-gate, checker-runner, contract-resolver, agent-orchestrator, checkpoint-store).
2. **Medium-term**: Implement in-process JS checker runtime (`require()` `.js` checkers and call exported `run(taskDir)`), reserving `spawn()` only for `.sh`/`.ps1`.
3. **Low-priority**: Add `configCacheMaxAgeMs` or switch to `fs.watch` for event-driven reload.

---

### Theme 6: Real-World Applicability & Coverage Gaps (1 reviewer × 3 findings)

- Full 10-phase, 27-contract, 19-checker process is not viable for solo developers or 5-person startups — **contract M-1**
- No contract covers database migrations, API backward compatibility, or dependency security audits — **contract M-2**
- 50-line packet size limit is mechanically unenforceable with current `packet-size-check` (counts file lines, not packet lines) — **contract C-3**

**Synthesis**: These are product/strategy issues, not code bugs. The system is over-engineered for small tasks and under-specified for operational scenarios (migrations, API compatibility, security).

**Unified recommendation**:
1. Define a "minimum viable subset" in `CLAUDE.md` or a new `applicability-guide.md`.
2. Draft `migration-governance`, `api-compatibility-contract`, and `dependency-security-contract`.
3. Redefine `packet-size-check` to map files to packets via `@packet` annotation, or change the rule to "per-file" with explicit rationale.

---

### Theme 7: Value Gate / Auditor Paradox (1 reviewer × 1 finding)

- `review-gates-contract.md` §18.1 requires `Auditor verdict = audited` for gate passed, but `value` gate is inherently subjective and has no automated Auditor — **contract C-2**

**Synthesis**: This is a logical contradiction in the contract layer. Either `value` gate can never pass, or the Auditor rule is silently ignored.

**Unified recommendation**: Clarify in `review-gates-contract.md` that `value` gate is exempt from Auditor verification, and `manual_verification_required` evidence serves as the equivalent audit artifact.

---

## Conflict Matrix

| Finding A | Finding B | Relationship |
|-----------|-----------|-------------|
| audit C-1 (tamper_detected unimplemented) | contract C-2 (value gate Auditor paradox) | **Independent but related**: Both concern Auditor enforcement. C-1 is "no technical enforcement exists"; C-2 is "even if it existed, value gate cannot be audited". Fix C-2 first (clarify exemption), then C-1 (implement receipt-based verification). |
| constraints C-1 (Hook bypass for unhandled tools) | architect H-4 (Hook misses cp/mv/touch/rm) | **Overlapping**: Constraints frames it as "architectural bypass for future tools"; Architect frames it as "current Bash commands bypass". Same fix: extend tool/command detection. |
| constraints H-1 (enforcer.js monolith) | architect H-1 (L4-L6 in L3) | **Overlapping**: Both identify the same root problem — enforcer.js has too many responsibilities. Constraints focuses on file size; Architect focuses on layer violation. Same fix: extract orchestration logic. |
| audit H-1 (unknown_check_type do_not_block) | constraints M-3 (silent skip of unknown atomicity check_type) | **Independent but related**: Both are "silent skip on unknown type" issues. H-1 is in mechanical conditions; M-3 is in atomicity rules. Same fix: fail-closed + warning. |

**No direct contradictions** were found between reviewers. All four agree on fail-closed as the correct default posture.

---

## Unified Priority Action List

### P0 — Security / Integrity Blockers (must fix before production)

| # | Finding | Source | Action |
|---|---------|--------|--------|
| P0-1 | `tamper_detected` unimplemented | audit C-1 | Implement receipt-based auditor verdict verification |
| P0-2 | Orchestrator can fake `auditor_verdict` | audit C-2 | Remove orchestrator write access to `auditor_verdict`; store receipts separately |
| P0-3 | `unknown_check_type_policy` allows bypass | audit H-1 | Change `do_not_block: false` in `mcp-capabilities.yaml` |
| P0-4 | `validateWritePermission` implicit allow on missing config | audit H-2 | Default to `allowed: false` when config missing |
| P0-5 | Hook / MCP miss `cp/mv/touch/rm` | architect H-4 | Extend detection to common disk-writing bash commands |

### P1 — Architecture / Maintainability (fix before scale)

| # | Finding | Source | Action |
|---|---------|--------|--------|
| P1-1 | `enforcer.js` monolith (1897 lines) | constraints H-1, architect H-1 | Split into `enforcer/` sub-modules; extract orchestration to separate file/server |
| P1-2 | Hard-coded constants cluster | architect C-1..C-3, M-1..M-4 | Create `config-meta.yaml` with `runtime_constants` section; migrate all constants |
| P1-3 | Spawn-per-checker overhead | constraints H-2 | Implement in-process JS checker runtime |
| P1-4 | Dependency cycle detection missing | audit C-3 | Add DFS topological sort in `getActiveContractSetInternal` |
| P1-5 | Spec-config divergence (8 vs 10 conditions) | contract C-1 | Update spec to document all 10 conditions |

### P2 — Contract Consistency / Applicability (fix before team onboarding)

| # | Finding | Source | Action |
|---|---------|--------|--------|
| P2-1 | Value gate Auditor paradox | contract C-2 | Clarify `value` gate exemption in `review-gates-contract.md` |
| P2-2 | 50-line packet size unenforceable | contract C-3 | Redefine checker to operate on `packet_id` aggregates or change rule to per-file |
| P2-3 | Context budget circular dependency | contract H-1 | Add budget reservation protocol in `cluster-orchestration.md` |
| P2-4 | `cluster-orchestration` provisional but depended upon | contract H-2 | Promote to active or add fallback path |
| P2-5 | 12-layer → L0-L4 mapping gap | contract H-3 | Add explicit mapping table |
| P2-6 | Exception governance missing Auditor tampering rule | contract H-4 | Add rule 6 to `exception-governance.md` §5 |
| P2-7 | Config-sync-check insufficient | contract H-5 | Extend with semantic cross-validation |

### P3 — Polish / Edge Cases (fix in next iteration)

| # | Finding | Source | Action |
|---|---------|--------|--------|
| P3-1 | Checker timeout does not kill child | audit H-3 | Call `child.kill('SIGKILL')` on timeout |
| P3-2 | `timestamp_freshness` passes on missing file | audit H-4 | Return `passed: false` when reference missing |
| P3-3 | Config cache mtime granularity | constraints H-3 | Add `configCacheMaxAgeMs` or switch to `fs.watch` |
| P3-4 | Token estimator ±30% accuracy | constraints M-2 | Replace with `gpt-tokenizer` or add safety margin |
| P3-5 | Agent ID collision under rapid calls | constraints L-4 | Append random suffix or use `Date.now()` |
| P3-6 | Python3 dependency in Hook | constraints L-2 | Rewrite JSON extraction in pure Bash or Node |
| P3-7 | `checkpointSync` "load" is read-only | audit M-5 | Rename to "query" or implement true restore |

---

## Metrics

| Metric | Count |
|--------|-------|
| Total findings across 4 reviewers | 66 |
| Critical findings | 12 |
| High findings | 16 |
| Medium findings | 20 |
| Low findings | 14 |
| Informational | 4 |
| Overlapping findings (cross-reviewer) | 14 |
| Unique action items after dedup | 28 |

---

## Conclusion

The yb project's 8-layer architecture is **structurally sound** but **not yet production-hardened**. The config-driven design is correct in principle, but L3 MCP (`enforcer.js`) contains too many hard-coded constants and co-located orchestration logic. The Hook/MCP dual-layer defense is robust in the common path but has bypass gaps for disk-writing bash commands and unhandled tools. The contract layer has internal contradictions (8 vs 10 conditions, value gate Auditor paradox) and coverage gaps (no migration/API/security contracts).

**The system is safe for controlled deployments with the following operational constraints**:
1. Do not trust `auditor_verdict` without manual verification (until P0-1/P0-2 are fixed).
2. Do not use `cp`, `mv`, `touch`, `rm` in Bash tools without manual review (until P0-5 is fixed).
3. Do not modify `mechanical-conditions.yaml` check_types without also updating `mcp-capabilities.yaml` (until P1-2 is fixed).
4. Limit checker count to <30 to avoid spawn overhead (until P1-3 is fixed).

**Next step**: Address all P0 items, then re-run a focused audit round.
