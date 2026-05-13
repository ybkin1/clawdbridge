# Code Review — rb-20260513-001

## Summary
**Conditional Pass**

The constraint-enforcer MCP implementation and its 7 new shell checkers are functionally sound and the test suite passes all 83 assertions. The architecture correctly implements config-driven evaluation with zero hard-coded spec knowledge. However, there are several correctness edge cases, security hardening gaps, and test coverage holes that should be addressed before declaring full production readiness.

---

## Findings (sorted by severity)

### Critical

1. **Race condition in atomic state write rollback (enforcer.js:1174-1195)**
   - The `requestPhaseTransition` function writes a temp file and renames it atomically, but if `renameSync` fails after `writeFileSync` succeeds, the rollback only deletes the temp file. It does NOT restore the original state file content. A partial failure (e.g., disk full during rename) leaves the task in an undefined state.
   - **Recommendation**: Snapshot the original state file content before writing, and restore it on any write error.

2. **Bash redirection regex misses heredoc and process substitution (enforcer.js:911-927)**
   - `extractBashRedirectionTargets` does not detect heredoc writes (`cat <<EOF > file`) or process substitution output (`command >(tee file)`). An attacker could bypass redirection detection with `cat <<EOF > 00-task-state.yaml`.
   - **Recommendation**: Expand the regex set to cover heredoc redirections and bash process substitutions, or document the known limitation explicitly.

### High

3. **Path traversal guard incomplete for symlinks (enforcer.js:809-822)**
   - `validateWritePermission` uses `fs.realpathSync` for both taskDir and the target file, but the check `relativeToTask.startsWith("..")` can be bypassed on Windows with case variations (`..` vs `..`) or UNC paths. Additionally, `path.isAbsolute(relativeToTask)` on Windows may not catch all absolute path forms.
   - **Recommendation**: Normalize the resolved paths with `path.normalize` before comparison, and explicitly reject paths containing null bytes or control characters.

4. **`runBashChecker` status mapping is fragile (enforcer.js:541-553)**
   - The status mapping relies on string matching (`output.includes("FAILED")`, `output.includes("PASSED")`) against checker stdout/stderr. A checker that outputs "PASSED" in an error message (e.g., `echo "Previous run PASSED, now FAILED"`) would incorrectly map to `passed` even with `exitCode !== 0`.
   - The current logic checks `code !== 0` first and returns `blocked`, which is correct, but the subsequent `output.includes("PASSED")` branch for `code === 0` is still vulnerable to misleading output.
   - **Recommendation**: Require checkers to emit a structured last line (e.g., `__STATUS__:passed`) and parse that instead of scanning the entire output.

5. **Missing input validation on `command` in `validateBashCommand` (enforcer.js:929-948)**
   - `validateBashCommand` accepts `command` as a string but does not validate it is non-null, non-empty, or within a reasonable length limit before passing it to the regex extractor. Extremely long commands could cause regex backtracking issues.
   - **Recommendation**: Add a length cap (e.g., 10,000 chars) and null/empty check before regex extraction.

### Medium

6. **Soft blocker `closeout_not_already_allowed` logic is inverted in intent (enforcer.js:450-452, 475-478)**
   - The `field_not_equals` check for `closeout_not_already_allowed` expects `closeout_allowed !== true`. When `closeout_allowed` is already `true`, the condition fails and surfaces as a warning (soft blocker). The test comment at test.js:462-463 acknowledges this: "The soft blocker alone would allow ready=true."
   - However, the semantic intent of a "soft blocker" is unclear here: if closeout is already allowed, why warn? The naming suggests it should block transitioning TO closeout, not block when already IN closeout.
   - **Recommendation**: Clarify the business rule in config comments and ensure the test asserts the intended behavior.

7. **Checker shell scripts use unquoted variables susceptible to word splitting**
   - `packet-size-check.sh:22`: `val=$(echo "$line" | sed 's/.*max_lines:\s*//')` followed by `[ "$val" -gt 50 ]` will error if `val` is non-numeric.
   - `design-plan-bidirectional-ref-check.sh:30-31`: `grep -c "design_to_plan:.*{}"` uses unquoted regex that may fail on unusual YAML formatting.
   - **Recommendation**: Add `[[ "$val" =~ ^[0-9]+$ ]]` guards before numeric comparisons, and quote all regex arguments.

8. **`agentOrchestrator` plan file write is non-atomic (enforcer.js:1628)**
   - The orchestrator plan is written directly with `fs.writeFileSync(planFile, yaml.dump(planDoc))` without a temp-file+rename pattern. A crash during write produces a corrupt plan file.
   - **Recommendation**: Use the same atomic write pattern as `requestPhaseTransition`.

9. **Test `testBashRedirectionDetection` has a misleading assertion (test.js:728-730)**
   - The test comment says "Should block append redirect to sensitive file" but the assertion expects `allowed === true` for `artifacts/design.md`. The assertion is correct (non-sensitive file should be allowed), but the comment is wrong.
   - **Recommendation**: Fix the comment to match the assertion intent.

10. **`index.js` does not expose new MCP tools (index.js:14-21)**
    - `index.js` only imports and exposes 6 tools, missing `get_active_contract_set`, `agent_orchestrator`, `agent_status`, and `checkpoint_sync`. These tools are defined in `tools.js` and implemented in `enforcer.js`, but the MCP server entry point does not wire them up.
    - **Recommendation**: Add the missing tool imports and switch cases in `index.js`.

### Low

11. **`loadConfig` swallows YAML parse errors silently (enforcer.js:36-44)**
    - `loadYaml` logs to `console.error` but returns `null`, causing upstream callers to treat parse errors as "missing config." This can mask configuration drift.
    - **Recommendation**: Distinguish "file not found" from "parse error" in return values so callers can surface the difference.

12. **`getActiveContractSet` context does not include `task_id` or `artifact_kind` (enforcer.js:1370-1378)**
    - The context object only passes `action_family`, `phase`, `delivery_mode`, and `context_budget`. The registry may in future define scopes based on `task_id` patterns or `artifact_kind`, but the function does not accept or forward them.
    - **Recommendation**: Accept optional `task_id` and `artifact_kind` parameters and include them in the context.

13. **Shell checkers lack `set -euo pipefail` consistency in error paths**
    - `assembly-interface-alignment-check.sh` runs `npx tsc --noEmit 2>&1` inside a subshell with `if ! (...); then`. If `npx` is not found, the `command -v npx` check handles it, but the `go build` and `python3` branches do not uniformly suppress or handle stderr.
    - **Recommendation**: Redirect stderr consistently and capture it into the `ERRORS` array for reporting.

14. **Test coverage gap: no test for `checkpoint_sync` restore/rollback semantics**
    - The checkpoint tests cover save, list, and load, but do not test what happens when loading a checkpoint overwrites existing agent files, or whether a failed load leaves the task directory in a consistent state.
    - **Recommendation**: Add a test that verifies checkpoint load is idempotent and does not corrupt existing state.

15. **Test coverage gap: no test for `validateBashCommand` with `role: orchestrator`**
    - All Bash redirection tests use `role: "worker"`. There is no test verifying that an orchestrator role is allowed to redirect to state files (or that it is still blocked by readiness).
    - **Recommendation**: Add role-matrix tests for Bash redirection.

### Informational

16. **Code structure observation: `enforcer.js` is 1794 lines**
    - While well-organized with section comments, the file is approaching the threshold where modular decomposition would improve maintainability. Consider splitting into `conditions.js`, `permissions.js`, `orchestration.js`, and `checkers.js`.

17. **Shell checker `exception-path-coverage-check.sh` and `state-transition-coverage-check.sh` are marked `mode: manual` but exit 0 even when design doc is missing**
    - This is by design (graceful degradation), but it means these checkers will never produce a `failed` status, only `PASSED` or `WARNING` printed to stdout. The MCP `runBashChecker` maps non-zero exit codes to `blocked`, so these will never block a phase transition.
    - **Recommendation**: Document this intentional leniency in the checker headers.

18. **Config hot-reload test mutates production config (test.js:282-310)**
    - `testConfigCacheHotReload` reads, modifies, and restores `mechanical-conditions.yaml` in the actual project config directory. If the test is interrupted (e.g., Ctrl+C), the config file may be left in a modified state.
    - **Recommendation**: Use a temporary copy of the config file for hot-reload tests, or wrap the test in a `try/finally` with stronger cleanup guarantees.

---

## Recommendations

| Priority | Action | File(s) |
|----------|--------|---------|
| P0 | Fix atomic write rollback to restore original state on failure | `enforcer.js` |
| P0 | Wire missing MCP tools in `index.js` | `index.js` |
| P1 | Harden Bash redirection detection against heredoc/process substitution | `enforcer.js` |
| P1 | Harden path traversal guard for Windows edge cases | `enforcer.js` |
| P1 | Fix `runBashChecker` status mapping to use structured output | `enforcer.js`, checkers |
| P1 | Add input validation to `validateBashCommand` | `enforcer.js` |
| P2 | Use atomic writes for orchestrator plan file | `enforcer.js` |
| P2 | Harden shell checker numeric parsing and quoting | `*.sh` |
| P2 | Fix misleading test comment in `testBashRedirectionDetection` | `test.js` |
| P2 | Add tests for orchestrator-role Bash redirection | `test.js` |
| P2 | Add checkpoint restore consistency test | `test.js` |
| P3 | Modularize `enforcer.js` into smaller files | `enforcer.js` |
| P3 | Distinguish "parse error" from "missing" in `loadConfig` | `enforcer.js` |
| P3 | Protect production config during hot-reload test | `test.js` |

---

*Review conducted by: code-reviewer agent*  
*Scope: enforcer.js, test.js, tools.js, index.js, 7 new shell checkers, and supporting config files*  
*Tests executed: 83 passed, 0 failed*
