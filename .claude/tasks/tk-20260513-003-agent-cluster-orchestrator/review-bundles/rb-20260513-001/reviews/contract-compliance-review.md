# Contract Compliance Review — rb-20260513-001

## Summary

**Verdict: Conditional Pass**

The contract registry, checker index, checklist index, and four core config files are fully synchronized between the upstream `claude-code-rule` reference repo and the `yb` project repo. All 15 active-contract checker_refs resolve to entries in `checkers/index.yaml`, and all active-contract checklist_refs resolve to entries in `checklists/index.yaml`. However, two issues prevent a clean Pass:

1. **High**: `mechanical-conditions.yaml` source references use a hyphenated sub-number format (`§4.2.1-1` through `§4.2.1-8`) that does not exist as discrete section headings in `task-tracking-workflow-spec.md`. The spec only has a single `#### 4.2.1 条件清单` heading, followed by a table. This makes the 8 source references mechanically unverifiable.
2. **Medium**: `enforcer.js` `runBashChecker` has an extension whitelist that only allows `.sh` and `.ps1`, but `checkers/index.yaml` declares `atomicity-check` with `script: atomicity-check.js`. This creates a runtime blocker if `runMandatoryCheckers` ever attempts to execute `atomicity-check`.

---

## Findings (sorted by severity)

### Critical

*None.*

### High

#### H-1: Source references in `mechanical-conditions.yaml` point to non-existent sub-sections

- **Location**: `c:\Users\Administrator\Documents\trae_projects\yb\.claude\config\mechanical-conditions.yaml`, `conditions[*].source`
- **Details**: The 8 conditions `phase_status_passed` through `auditor_verdict_audited` cite sources such as `task-tracking-workflow-spec.md §4.2.1-1`, `§4.2.1-2`, etc. The actual `task-tracking-workflow-spec.md` contains only one heading `#### 4.2.1 条件清单` (line 100), which is a single section containing a table with 8 rows. There are no sub-headings `4.2.1-1` through `4.2.1-8`.
- **Impact**: Automated or human verification of "does this condition trace back to the spec?" fails because the referenced anchors do not exist.
- **Recommendation**: Either (a) split `§4.2.1` into 8 sub-sections in the spec, or (b) change the `source` fields to `task-tracking-workflow-spec.md §4.2.1` (row 1), `§4.2.1` (row 2), etc., and add a `source_row` field for disambiguation, or (c) adopt a table-cell reference convention such as `§4.2.1#row-1`.

### Medium

#### M-1: `atomicity-check.js` blocked by `runBashChecker` extension whitelist

- **Location**: `c:\Users\Administrator\Documents\trae_projects\yb\.claude\mcp-servers\constraint-enforcer\enforcer.js` lines 515–521
- **Details**: `runBashChecker` explicitly rejects any script whose extension is not `.sh` or `.ps1`:
  ```js
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".sh" && ext !== ".ps1") {
    return Promise.resolve({
      output: `[BLOCKED] disallowed script extension: ${ext}`,
      status: "blocked",
      exitCode: 1,
    });
  }
  ```
  Meanwhile, `checkers/index.yaml` declares:
  ```yaml
  atomicity-check:
    script: atomicity-check.js
    mode: automated
    ...
  ```
- **Impact**: If `atomicity-check` is ever included in a task's `mandatory_checkers`, `runMandatoryCheckers` will emit a `blocked` result instead of executing the script.
- **Recommendation**: Add `.js` to the extension whitelist and invoke it via `node` (or remove `atomicity-check` from the index if it is not intended to be executed by `runBashChecker`).

#### M-2: `mcp-capabilities.yaml` `unknown_check_type_policy` is not consumed by `enforcer.js`

- **Location**: `c:\Users\Administrator\Documents\trae_projects\yb\.claude\config\mcp-capabilities.yaml` lines 69–72
- **Details**: The config declares:
  ```yaml
  unknown_check_type_policy:
    fallback_status: "manual_review_required"
    log_warning: true
    do_not_block: true
  ```
  However, `enforcer.js` `evaluateCondition` default case hard-codes:
  ```js
  default:
    return {
      passed: false,
      gap: `Condition '${cond.id}': Unknown check_type '${checkType}' — no handler implemented. ...`,
    };
  ```
  It does not read `mcp-capabilities.yaml`, does not set `fallback_status: "manual_review_required"`, and always treats unknown check_types as a hard failure (`passed: false`).
- **Impact**: The policy document promises a non-blocking fallback, but the implementation blocks. This is a config-to-code contract drift.
- **Recommendation**: Update `evaluateCondition` default case to load `mcp-capabilities.yaml` and respect `unknown_check_type_policy.do_not_block` / `fallback_status`.

### Low

#### L-1: 4 checkers in `index.yaml` are not referenced by any active contract

- **Details**: The following checkers exist in `checkers/index.yaml` but are not listed in any `active` contract's `checker_refs`:
  - `route-output-closure-check`
  - `subagent-orchestration-check`
  - `atomicity-check`
  - `config-sync-check`
- **Impact**: These checkers will never be auto-derived as mandatory by `getActiveContractSetInternal`. They can still be triggered manually or via task-level `route-projection.yaml`, but they are "dark" from the registry-driven automation perspective.
- **Recommendation**: Review whether these checkers should be bound to specific contracts. For example:
  - `route-output-closure-check` → `intent-routing` or `task-routing`
  - `subagent-orchestration-check` → `cluster-orchestration` (already bound to `cluster-orchestration` in checker index `contracts` field, but `cluster-orchestration` contract status is `provisional`, not `active`)
  - `atomicity-check` → `work-packet-governance` or `execution-traceability`
  - `config-sync-check` → `verification-checker`

#### L-2: 7 checklists in `index.yaml` are not referenced by any active contract

- **Details**: The following checklists exist in `checklists/index.yaml` but are not listed in any `active` contract's `checklist_refs`:
  - `user-value-checklist`
  - `code-review-checklist`
  - `interface-review`
  - `plan-review-checklist`
  - `product-review-checklist`
  - `tech-review-checklist`
  - `test-review-checklist`
- **Impact**: Same as L-1 — they are available for manual use but not auto-loaded.
- **Recommendation**: Bind them to appropriate contracts (e.g., `code-review-checklist` and `tech-review-checklist` to `engineering-standards`; `test-review-checklist` to `verification-checker`).

#### L-3: `cluster-orchestration` contract status is `provisional`, orphaning `subagent-orchestration-check`

- **Details**: `cluster-orchestration` has `status: provisional`. Its only `checker_refs` entry is `subagent-orchestration-check`. Because `getActiveContractSetInternal` only includes `status === "active"` contracts, this checker will never be auto-mandatory.
- **Recommendation**: Either promote `cluster-orchestration` to `active`, or move `subagent-orchestration-check` to another active contract (e.g., `lego-assembly-workflow` which already references it).

### Informational

#### I-1: Full sync status between upstream and project repos

| Artifact | Identical? | Notes |
|----------|-----------|-------|
| `contracts/registry.yaml` | Yes | byte-identical |
| `checkers/index.yaml` | Yes | byte-identical (19 checkers) |
| `checklists/index.yaml` | Yes | byte-identical (18 checklists) |
| `config/mechanical-conditions.yaml` | Yes | byte-identical |
| `config/phase-state-machine.yaml` | Yes | byte-identical |
| `config/write-permissions.yaml` | Yes | byte-identical |
| `config/mcp-capabilities.yaml` | Yes | byte-identical |
| `checklists/*.md` | Yes | 21 files each, identical sets |

#### I-2: `enforcer.js` correctly implements all 9 `automatable` check_types

- `field_equals`, `field_not_equals`, `field_empty_or_null`, `gate_results_all_passed`, `file_exists_and_size_gt_0`, `timestamp_freshness`, `checker_result_status`, `mandatory_checkers_all_passed_or_excepted`, `evidence_lock_exists` — all have matching `case` handlers in `evaluateCondition`.

#### I-3: `manual_gate_pending_policy` is consumed; `unknown_check_type_policy` is not

- `manual_gate_pending_policy.block_transition` is read in `requestPhaseTransition` (line ~1135).
- `unknown_check_type_policy` is never referenced in code.

---

## Recommendations

1. **Fix H-1** (source references): Align `mechanical-conditions.yaml` `source` fields with actual section headings in `task-tracking-workflow-spec.md`. Prefer adding sub-section headings `#### 4.2.1.1` through `#### 4.2.1.8` in the spec to preserve traceability.
2. **Fix M-1** (`.js` checker execution): Extend `runBashChecker` to support `.js` scripts via `node`, or change `atomicity-check` to a `.sh` wrapper.
3. **Fix M-2** (unknown check_type policy): Implement config-driven fallback in `evaluateCondition` default case.
4. **Address L-1 / L-3** (orphan checkers): Bind `route-output-closure-check`, `atomicity-check`, and `config-sync-check` to active contract `checker_refs`. Decide whether to promote `cluster-orchestration` to `active` or re-home `subagent-orchestration-check`.
5. **Address L-2** (orphan checklists): Bind supplementary checklists to active contracts so they are auto-loaded during relevant phases.
