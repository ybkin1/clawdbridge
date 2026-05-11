# B6 Owner Evidence Gap Closure Package

> Task: tk-20260506-001
> Gate: B6 (Data Import / Staging / Adoption / Rollback)
> Status: incomplete
> Scope: docs-only / read-only evidence work
> Generated: 2026-05-10

## Purpose

This package closes the B6 owner evidence gaps identified in the base receipt:

- Base Receipt: `/root/docs/tasks/tk-20260506-001/artifacts/owner-evidence-20260510-b6-openclaw-sql-reference-001.yaml`
- Target Gate: B6
- Intake Status: `incomplete`
- Triage Verdict: `incomplete`

## Contents

| File | Description |
|------|-------------|
| `01-staging-ddl-draft.md` | Import staging table DDL draft (docs-only, not a formal migration) |
| `02-export-bundle-schema.yaml` | OpenClaw export bundle schema definition |
| `03-dry-run-validation-plan.md` | Dry-run validation rules, commands, expected outputs |
| `04-adoption-state-machine.md` | Staged -> Validated -> Approved -> Adopted -> Retracted state machine |
| `05-reverse-index-and-lineage.md` | Reverse index contract: formal object -> import batch/source hash |
| `06-rollback-retract-contract.md` | Rollback/retract input, output, audit, and report format |
| `07-rbac-rls-security-test-plan.md` | RBAC, RLS, and audit test plan for import/adoption |
| `08-owner-decision-request.md` | Owner decision request checklist |
| `owner-evidence-20260510-b6-openclaw-sql-reference-001.addendum.yaml` | Machine-readable addendum receipt |

## Hard Constraints

- No writes to `/opt/harness/src/modules/`
- No writes to `/opt/harness/sql/` (formal migrations)
- No writes to Harness formal database tables
- `intake_status` remains `incomplete` until owner decision and all minimum evidence are present
- `implementation_allowed` remains `false`

## Verification

```bash
python3 -c "import yaml; yaml.safe_load(open('/root/docs/tasks/tk-20260506-001/artifacts/owner-evidence-20260510-b6-openclaw-sql-reference-001.yaml')); print('BASE_RECEIPT_YAML_OK')"
find /opt/harness/src/modules -type f | wc -l   # expected: 5
git -C /opt/harness status --short               # expected: only docs/ untracked
```
