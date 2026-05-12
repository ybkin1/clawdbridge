# Review Report: Security + Platform Binding
## Verdict: Fail

## Findings

| Severity | ID | Description | Evidence | Remediation |
|----------|----|-------------|----------|-------------|
| Critical | SEC-001 | `validateWritePermission` path traversal guard is bypassable via symlinks and case variations on case-insensitive filesystems | `enforcer.js:593-597` uses `path.resolve(filePath)` and `path.relative(taskDir, resolvedFile)` with `startsWith("..")` check, but does not resolve symlinks via `fs.realpathSync` and does not normalize case on Windows/macOS | Add `fs.realpathSync` resolution for both `filePath` and `taskDir` before comparison; add case-normalization for case-insensitive platforms |
| Critical | SEC-002 | Hook is fail-open when `node` is not in PATH or `node` crashes | `pre-tool-use-orchestrator.sh:35` uses `node "$HELPER_PATH" 2>/dev/null` and `pre-tool-use-orchestrator.ps1:70` uses `& node $helperPath 2>$null`; if `node` is missing, output is `{}`, `MCP_ALLOWED` defaults to `"true"` (sh line 36) or `$mcpResult` becomes `$null` and falls through to fallback block (ps1) | In `.sh`: change default from `"true"` to `"false"` when helper output is unparseable; in `.ps1`: ensure missing `node` is treated as MCP unavailable and falls through to fail-closed fallback |
| Critical | SEC-003 | `validateWritePermission` allows ALL operations when no active task exists | `enforcer.js:588-590` returns `{allowed: true}` if `!taskDir` | This means any Write/Edit outside task directories is automatically permitted. Change to `allowed: false` with reason "No active task; operation blocked." |
| High | SEC-004 | `validateWritePermission` allows ALL operations when task state is unreadable | `enforcer.js:601-603` returns `{allowed: true}` if `!state` | A corrupted or permission-denied state file causes the enforcer to allow sensitive file writes. Change to `allowed: false` |
| High | SEC-005 | `invalidateConfigCache()` is callable by any Agent and forces stale config usage | `enforcer.js:63-66` exports `invalidateConfigCache` which is imported by `test.js` and could be called by any module importing the enforcer | Remove export or gate behind an authorization check; cache invalidation should be an internal maintenance operation |
| High | SEC-006 | `requestPhaseTransition` does not block on empty-string `auditor_verdict` when the string is whitespace-only | `enforcer.js:853-854` checks `if (auditorVerdict !== "audited")` — an empty string `""` is caught, but a whitespace string `" "` would also fail the equality check and be blocked; however, `field_empty_or_null` in `evaluateCondition` (line 139) treats `""` and `"null"` as empty, but the transition function does not use this evaluator for auditor_verdict | The direct check `!== "audited"` is actually correct for blocking non-audited values, but there is no explicit trim. Add `.trim()` to handle `" "` consistently with the intent of empty-or-null semantics |
| High | SEC-007 | Sensitive files outside task directories are not protected | `validateWritePermission` only guards paths relative to `taskDir`. Files like `.claude/config/write-permissions.yaml`, `.claude/contracts/registry.yaml`, and hook scripts themselves are not within any task directory and receive no protection | Extend `validateWritePermission` to also check a global protected-paths list for project-level sensitive files |
| Medium | SEC-008 | `isSensitiveFile` regex patterns are constructed without anchoring, allowing partial matches | `enforcer.js:527` uses `new RegExp(p.regex)` without `^` or `$` anchors; pattern `00-task-state\.yaml$` has an end anchor but no start anchor, so `foo_00-task-state.yaml` would match | Add `^` anchor to all sensitive patterns in `write-permissions.yaml` or prepend `^` in code when constructing RegExp |
| Medium | SEC-009 | `runBashChecker` has a race condition in path traversal check | `enforcer.js:323-325` resolves path synchronously but the file could be swapped via symlink between resolution and spawn | Use `fs.realpathSync` before the `startsWith` check, or pass `cwd` and relative script name to spawn instead of absolute path |
| Medium | SEC-010 | `checkProtectedTransitions` regex does not anchor the target_field match | `enforcer.js:564` uses `new RegExp(`${pt.target_field}\\s*:\\s*${fv}`)` without `^` or word boundaries; could match commented lines or other field names containing the target as substring | Anchor regex with `^\\s*` and word boundary, or parse YAML properly instead of regex fallback |
| Medium | SEC-011 | Hook scripts do not validate that the MCP helper output JSON actually came from the helper | A malicious process named `node` in PATH could intercept the helper call | Document requirement for verified Node.js installation; consider checksum verification of helper script |
| Low | SEC-012 | `generateEvidenceLock` does not verify checker result file integrity against tampering after generation | Hash is computed at lock time but there is no signature or subsequent verification | Add HMAC or signature if threat model includes post-lock tampering |
| Low | SEC-013 | `write-permissions.yaml` `blocks` patterns are loaded but never evaluated in `validateWritePermission` | The `roles` section defines `allows` and `blocks` but `validateWritePermission` only uses `sensitive_patterns` and `protected_transitions` | Either implement role-based permission evaluation or remove unused `roles` section to avoid configuration drift |
| Critical | PLAT-001 | PowerShell Hook assumes `node` is in PATH with no fallback | `pre-tool-use-orchestrator.ps1:70` calls `& node $helperPath` with no `Get-Command` check or explicit Node.js path | Add `Get-Command node` check before invocation; if missing, fall back to fail-closed block |
| Critical | PLAT-002 | Bash Hook assumes `node` is in PATH with no fallback | `pre-tool-use-orchestrator.sh:35` calls `node "$HELPER_PATH"` directly | Add `command -v node` check before invocation; if missing, fall back to fail-closed block |
| High | PLAT-003 | Bash Hook has different fail-closed behavior than PowerShell Hook when MCP helper is unavailable | `.sh` line 36 defaults `MCP_ALLOWED` to `"true"` when helper output is unparseable; `.ps1` line 77 falls through to `$null` and then to fail-closed fallback | Align both hooks to identical fail-closed logic: any unavailability = block |
| High | PLAT-004 | `hook-enforcer-helper.js` uses ES module import which may fail on older Node.js versions | `import { validateWritePermission } from "../mcp-servers/constraint-enforcer/enforcer.js";` requires Node.js >= 14 with `--experimental-modules` or `.mjs` extension | Ensure `package.json` has `"type": "module"` and document minimum Node.js version; or convert to CommonJS |
| Medium | PLAT-005 | `auto-run-checkers.ps1` hardcodes `bash` for `.sh` scripts even on Windows without WSL | `auto-run-checkers.ps1:119` uses `& bash $scriptPath $PWD` which will fail on pure Windows without Git Bash/WSL | Use platform detection: call `.ps1` directly on Windows, `.sh` via bash only if available |
| Medium | PLAT-006 | `auto-run-checkers.sh` hardcodes `bash` and does not check if script is executable | `auto-run-checkers.sh:117` calls `bash "$SCRIPT_PATH"` regardless of shebang or executable bit | Use `"$SCRIPT_PATH"` directly if executable, or document bash dependency |
| Medium | PLAT-007 | `findProjectRoot` in `enforcer.js` may traverse above intended project root on misconfigured systems | `enforcer.js:13-25` walks up until `.claude/checkers` or `.claude/contracts` is found; on a system with these folders in home directory, it could resolve to the wrong root | Add a maximum depth limit or require `PROJECT_ROOT` environment variable |
| Low | PLAT-008 | `runBashChecker` spawns `powershell` for `.ps1` on Windows but does not pass `-NoProfile` or `-ExecutionPolicy` | `enforcer.js:349` uses `spawn("powershell", ["-File", scriptPath, cwd], ...)` without `-NoProfile` or execution policy override | Add `-NoProfile -ExecutionPolicy Bypass` to avoid profile-based interference, or document the requirement |

## Hard Fail Rules Check

| Rule | Result | Evidence |
|------|--------|----------|
| HF1: Hook bypass path allows unauthorized Write/Edit to state files | **FAIL** | `enforcer.js:588-590` — when no active task is found, `validateWritePermission` returns `allowed: true`. This means any Write/Edit to `00-task-state.yaml` (or any other file) outside a task directory is permitted. Additionally, path traversal guard at line 593-597 does not resolve symlinks, allowing symlink-based bypass. |
| HF4: Hook is fail-open when MCP unavailable | **FAIL** | `pre-tool-use-orchestrator.sh:36` — when helper output is unparseable or `node` is missing, the default is `echo "true"` (`d.get("allowed",True)`). This causes the hook to allow the operation. The PowerShell hook is better but still has a gap: if `node` crashes after emitting partial output, `ConvertFrom-Json` may throw and `$mcpResult` becomes `$null`, which falls through to the fail-closed fallback — however, the bash hook's default-true behavior is a definitive fail-open. |
| HF5: `validate_write_permission` has no path traversal protection | **FAIL** | `enforcer.js:593-597` has path traversal protection, but it is incomplete: (1) it does not resolve symlinks via `fs.realpathSync`, allowing symlink traversal attacks; (2) it does not normalize case on Windows/macOS case-insensitive filesystems, allowing case-variation bypasses (e.g., `00-TASK-STATE.YAML`); (3) the `path.isAbsolute(relativeToTask)` check is logically impossible because `path.relative` never returns an absolute path, making it dead code that provides false assurance. |

## Dimension Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Security | 35/100 | Core path traversal guard exists but is bypassable via symlinks and case variations. Two critical fail-open conditions exist (no task = allow, unreadable state = allow). The bash hook defaults to `allowed=true` on any helper failure. Auditor verdict check is present but lacks trim normalization. Role-based permissions in YAML are ignored. |
| Platform Binding | 45/100 | Both hooks assume `node` is in PATH without verification. Bash and PowerShell hooks have divergent failure behaviors. `auto-run-checkers.ps1` hardcodes `bash` on Windows. `hook-enforcer-helper.js` uses ESM which requires modern Node.js. `findProjectRoot` could traverse too far. No explicit Node.js version requirement is documented. |

## Detailed Analysis

### 1. `validateWritePermission` Path Traversal (HF5)

Lines 593-597:
```javascript
const resolvedFile = path.resolve(filePath);
const relativeToTask = path.relative(taskDir, resolvedFile);
if (relativeToTask.startsWith("..") || path.isAbsolute(relativeToTask)) {
```

- `path.resolve(filePath)` resolves `..` and `.` segments but **does not resolve symlinks**.
- An attacker can create a symlink inside `taskDir` pointing to `/etc/passwd` or `../../.claude/config/write-permissions.yaml`, and the check will pass because the symlink path itself is within `taskDir`.
- `path.isAbsolute(relativeToTask)` is logically impossible: `path.relative` always returns a relative string (or empty string if paths are equal). This line provides false assurance.
- On Windows, `path.resolve("C:\\foo")` when `taskDir` is on `D:\\` produces a cross-drive relative path that does not start with `..` but escapes the task directory.

### 2. Fail-Open on Missing Task (HF1)

Lines 588-590:
```javascript
if (!taskDir) {
    return { allowed: true, reason: "No active task; operation allowed." };
}
```

This is the most severe security flaw. If there is no active task (e.g., the project is in an initial state, or `findActiveTask` fails due to directory permissions), **all Write/Edit operations are allowed globally**. This directly violates HF1 because state files like `.claude/tasks/INDEX.md` or global config files are not within any task directory and thus receive zero protection.

### 3. Fail-Open on Unreadable State (HF1-adjacent)

Lines 601-603:
```javascript
if (!state) {
    return { allowed: true, reason: "Task state unreadable; allowing operation." };
}
```

If `00-task-state.yaml` is corrupted, permission-denied, or temporarily locked, the enforcer allows sensitive file writes within the task directory. This is a fail-open design that should be fail-closed.

### 4. Bash Hook Fail-Open (HF4)

`pre-tool-use-orchestrator.sh` line 36:
```bash
MCP_ALLOWED=$(echo "$HELPER_OUTPUT" | python3 -c '... print("true" if d.get("allowed",True) else "false")' 2>/dev/null || echo "true")
```

The Python one-liner defaults to `True` when the key is missing. If `node` is not installed, `HELPER_OUTPUT` is `{}`, `d.get("allowed", True)` returns `True`, and `MCP_ALLOWED` becomes `"true"`. The operation is allowed. This is a definitive fail-open.

The PowerShell hook (line 77-90) is better: if `$mcpResult` is `$null` (helper unavailable), it falls through to the fail-closed fallback block (lines 92-102). However, if `node` is missing, `$helperOutput` is empty, `ConvertFrom-Json` on empty string in PowerShell 7+ throws, `$mcpResult` becomes `$null`, and it correctly falls through to the fallback. The two hooks are **not behaviorally equivalent**.

### 5. `requestPhaseTransition` Auditor Verdict Check

Lines 853-854:
```javascript
const auditorVerdict = state.auditor_verdict || "";
if (auditorVerdict !== "audited") {
```

An empty string `""` is correctly blocked. A whitespace string `" "` would also be blocked (which is correct behavior), but it is inconsistent with `field_empty_or_null` semantics in `evaluateCondition` which trims and normalizes. Adding `.trim()` would make the behavior consistent and explicit.

### 6. Platform Binding: Node.js Dependency

Neither hook checks if `node` is installed before calling it. On a fresh Windows machine without Node.js:
- PowerShell: `& node $helperPath` throws "The term 'node' is not recognized", caught by `catch`, `$mcpResult = $null`, falls through to fail-closed fallback. **OK**.
- Bash: `node "$HELPER_PATH" 2>/dev/null` returns empty, `HELPER_OUTPUT="{}"`, `MCP_ALLOWED="true"`. **FAIL-OPEN**.

The bash hook must be fixed to check `command -v node` before invocation.

### 7. `hook-enforcer-helper.js` Cross-Platform

The helper uses ES module syntax (`import`/`export`). This requires either:
- Node.js >= 14 with `--experimental-modules`
- Node.js >= 12.17 with `"type": "module"` in `package.json`
- `.mjs` extension

The file has a `.js` extension. If the parent project does not have `"type": "module"` in its `package.json`, the helper will fail with `SyntaxError: Cannot use import statement outside a module`. This would cause the bash hook to fail-open (default `true`) and the PowerShell hook to fail-closed (fallback block). The behavior divergence is a platform binding issue.

## Recommendations Summary

1. **Immediate (blocks deployment):**
   - Fix HF1: Change `!taskDir` and `!state` branches in `validateWritePermission` to `allowed: false`.
   - Fix HF4: Change bash hook default from `"true"` to `"false"`; add `command -v node` / `Get-Command node` checks.
   - Fix HF5: Add `fs.realpathSync` resolution, case normalization, and remove dead `path.isAbsolute` check.

2. **High priority:**
   - Unexport `invalidateConfigCache` or add authorization.
   - Implement global protected-paths list for project-level sensitive files.
   - Align PowerShell and bash hook logic to identical behavior.
   - Ensure `package.json` has `"type": "module"` or convert helper to CommonJS.

3. **Medium priority:**
   - Anchor regex patterns in `isSensitiveFile` and `checkProtectedTransitions`.
   - Fix `auto-run-checkers.ps1` to not hardcode `bash` on Windows.
   - Add `-NoProfile -ExecutionPolicy Bypass` to PowerShell spawn in `runBashChecker`.
   - Add max-depth to `findProjectRoot`.
