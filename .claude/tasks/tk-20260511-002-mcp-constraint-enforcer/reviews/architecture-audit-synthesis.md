# Architecture Audit Synthesis — Five-Layer Closed-Loop Design

**Task**: tk-20260511-002-mcp-constraint-enforcer  
**Audit Trigger**: User instruction "先审计" on five-layer architecture proposal  
**Agents Dispatched**: 4 (consistency-reviewer, security-reviewer, feasibility-reviewer, architect-reviewer)  
**Completed**: 3 / 4 (architect-reviewer interrupted)  
**Date**: 2026-05-12

---

## Executive Verdict: **Fail** (2 Fail + 1 Conditional Pass)

The five-layer closed-loop architecture (Spec → Config → Scheduler → Interceptor → Audit) has **critical design flaws** that must be resolved before implementation proceeds. Three of four independent audit dimensions returned blocking findings.

---

## Critical Finding 1: Hook Fail-Open Security Design

**Severity**: P0 / Blocking  
**Affected**: `hook-enforcer-helper.js`, `pre-tool-use-orchestrator.ps1`, `pre-tool-use-orchestrator.sh`

### Problem
All three Hook entry points implement **fail-open** error handling:

| File | Line | Behavior |
|------|------|----------|
| `hook-enforcer-helper.js` | 18 | `JSON.parse` fails → `allowed: true` |
| `pre-tool-use-orchestrator.ps1` | 42 | `ConvertFrom-Json` fails → `exit 0` (allow) |
| `pre-tool-use-orchestrator.sh` | 22-23 | `python3` parse fails → `exit 0` (allow) |

This means any of the following bypass the entire constraint system:
- Malformed stdin payload
- Node.js process crash
- `js-yaml` or JSON parser exception
- PowerShell execution policy blocking

**Impact**: A deliberate or accidental error in the Hook input path results in **zero enforcement**.

### Required Fix
Hooks must be **fail-closed**:
```javascript
// hook-enforcer-helper.js — corrected
} catch {
  console.log(JSON.stringify({ allowed: false, reason: "Unparseable input; blocking operation." }));
  process.exit(1);
}
```

All fallback paths in `.ps1` and `.sh` must similarly `exit 1` on any error condition.

---

## Critical Finding 2: PostToolUse Hook Platform Incompatibility

**Severity**: P0 / Blocking  
**Affected**: Architecture design document (five-layer model)

### Problem
The five-layer architecture assumes a **PostToolUse Hook** exists for the Audit layer to verify outcomes after tool execution. Claude Code's `settings.json` Hook configuration only supports `PreToolUse`:

```json
{
  "hooks": {
    "PreToolUse": ".claude/hooks/pre-tool-use-orchestrator.ps1"
  }
}
```

There is **no `PostToolUse` event** in the current Claude Code platform. The Audit layer cannot be implemented as a Hook.

### Required Fix
Remove PostToolUse Hook from the architecture. Replace with one of:
- **Option A**: MCP `request_phase_transition` performs pre-transition audit internally (already partially implemented via `auditor_verdict` check)
- **Option B**: Explicit Auditor Agent invocation before gate verdict (contractual, not mechanical)

---

## Critical Finding 3: Hook Auto-Dispatch Violates Action-Governance

**Severity**: P1 / High  
**Affected**: Hook design philosophy, `action-governance` contract

### Problem
The Hook's error message auto-suggests calling MCP tools:
```
[MCP FIX SUGGESTION] Call constraint-enforcer MCP tools:
  1. check_phase_readiness
  2. run_mandatory_checkers
  ...
```

This creates an **implicit scheduling loop** where the Hook (an interceptor) tries to direct the Agent to specific tools. This violates `action-governance.md` §2:
> "Agent must judge action_family first, then select tools. Tools must not pre-judge actions."

The Hook should **block with reason only**. The Agent decides which MCP tools (if any) to call.

### Required Fix
Remove numbered "FIX SUGGESTION" lists from Hook output. Replace with single-line `reason` string. Let the Agent's `action-governance` loop handle remediation.

---

## Critical Finding 4: Fallback Protection Surface Mismatch

**Severity**: P1 / High  
**Affected**: `pre-tool-use-orchestrator.ps1` fallback logic (lines 99-131)

### Problem
When the MCP helper is unavailable, the Hook falls back to **4 hardcoded regex patterns**:
- `00-task-state.yaml`
- `evidence-lock-.*\.yaml`
- `checkers/[^/]+\.yaml`
- `reviews/receipt-.*\.yaml`

But `write-permissions.yaml` defines a **much broader matrix**:
- 3 roles × (allow + block) patterns
- `review-bundles/**` blocked for orchestrator
- `artifacts/**` blocked for reviewer
- etc.

**Impact**: Fallback mode silently allows operations that config-driven MCP would block. Example: orchestrator writing `reviews/review-report.md` is blocked by config but allowed by fallback (fallback only checks `receipt-*.yaml`, not `*.md`).

### Required Fix
Either:
- **Option A**: Eliminate fallback entirely — if MCP helper fails, block ALL Write/Edit operations with message "MCP unavailable; retry after fixing MCP server."
- **Option B**: Make fallback read `write-permissions.yaml` directly (parse YAML in PowerShell/bash) — complex and fragile.

**Recommended**: Option A. Fallbacks exist for bootstrapping, not production enforcement.

---

## Critical Finding 5: Config Drift Risk (7 Sources, 0 Sync Checker)

**Severity**: P1 / High  
**Affected**: `.claude/config/*.yaml`, `registry.yaml`, `checkers/index.yaml`, `route-projection.yaml`

### Problem
There are **7 independent configuration sources** that must remain mutually consistent:

| # | Source | What it controls |
|---|--------|----------------|
| 1 | `mechanical-conditions.yaml` | 10 mechanical conditions |
| 2 | `phase-state-machine.yaml` | 10 phases, gates, transitions |
| 3 | `write-permissions.yaml` | Role-based file permissions |
| 4 | `mcp-capabilities.yaml` | Automatable vs manual checks |
| 5 | `registry.yaml` | Active contracts, checker_refs |
| 6 | `checkers/index.yaml` | Checker catalog, implementation status |
| 7 | `route-projection.yaml` | Task-level checker overrides |

**No `config-sync-check` exists.** If `task-tracking-workflow-spec.md` §4.2.1 adds an 11th mechanical condition but `mechanical-conditions.yaml` is not updated, MCP silently skips it.

### Required Fix
Implement a `config-sync-check` checker (or CI job) that:
1. Parses `task-tracking-workflow-spec.md` for numbered conditions
2. Validates each has a corresponding entry in `mechanical-conditions.yaml`
3. Validates `phase-state-machine.yaml` gates match `task-tracking-workflow-spec.md` §4.3 table
4. Validates `registry.yaml` checker_refs exist in `checkers/index.yaml`

---

## Medium Findings

### Finding 6: Hook Cannot Call MCP Tools (Chicken-and-Egg)
**Severity**: P2  
The `.ps1` hook attempts to call `node hook-enforcer-helper.js`, which imports `enforcer.js`. This works only if the MCP server process is already running and `enforcer.js` is loadable. If the MCP server is not started (e.g., first run), the Hook cannot function. This is acceptable if we accept Option A from Finding 4 (block on helper failure).

### Finding 7: `configCache` is Process-Scoped, Not File-Scoped
**Severity**: P2  
`enforcer.js:33-55` caches config in a module-level variable. If config files change on disk, running MCP server continues using stale cache until restart. Acceptable for v1, but should document `invalidateConfigCache()` usage.

---

## Consolidated Remediation Plan

### Must Fix Before Any Implementation
1. **Fail-closed Hook** (Finding 1) — 3 files, ~6 lines each
2. **Remove PostToolUse assumption** (Finding 2) — update architecture doc
3. **Eliminate or equalize fallback** (Finding 4) — either kill fallback or make it conservative

### Must Fix Before Production Use
4. **Remove auto-dispatch from Hook output** (Finding 3) — 2 files, ~8 lines
5. **Implement `config-sync-check`** (Finding 5) — new checker script, ~100 lines

### Can Defer
6. Config cache invalidation (Finding 7)
7. Hook startup ordering (Finding 6)

---

## Auditor Notes

- **Architect-reviewer Agent was interrupted** and did not complete its dimensional audit. Its scope (scalability / coupling / evolution path) remains unverified.
- **Test coverage gap**: `test.js` tests MCP functions directly but does **not** test Hook integration paths (PowerShell stdin parsing, fail-open behavior, fallback logic).
- **Security note**: The fail-open design is a **systemic vulnerability**, not a bug. It must be treated as an architectural decision reversal, not a line-item fix.
