# 06: Rollback / Retract Contract

> Scope: B6 owner evidence (docs-only)
> Purpose: Define the contract for undoing an adoption, including inputs, outputs, audit, and report format

## 1. Terminology

| Term | Definition |
|------|------------|
| **Rollback** | Undo adoption **before** it is committed (transaction-level). |
| **Retract** | Remove adopted records **after** they have been committed to formal tables. |
| **Recovery** | Restore formal data from a previous snapshot after retraction. |

## 2. Rollback Contract (Pre-Commit)

### Trigger
- Adoption transaction fails mid-batch.
- Owner cancels adoption before commit.

### Action
```sql
ROLLBACK;  -- Database transaction rollback
```

### Postconditions
- No formal table rows modified.
- `import_batches.status` returns to `approved`.
- `staged_records.adoption_status` returns to `pending`.
- `reverse_index` has no new rows.

## 3. Retract Contract (Post-Commit)

### 3.1 Input

```yaml
retract_request:
  batch_id: UUID                    # Required
  requested_by: UUID                # User ID (must be owner or admin)
  reason: TEXT                      # Mandatory free-text reason
  retraction_mode: full | selective # "full" = entire batch; "selective" = specific records
  selective_record_ids: [UUID]      # Only if mode == selective
  confirmation_code: VARCHAR(32)    # Optional: owner-provided confirmation token
```

### 3.2 Validation

| Check | Failure Action |
|-------|---------------|
| `batch.status == 'adopted'` | Reject if not adopted |
| `requested_by` has `retract` permission | Reject with 403 |
| `reason` is non-empty | Reject if empty |
| If selective: all `selective_record_ids` belong to this batch | Reject if any foreign |

### 3.3 Execution

```sql
BEGIN;

-- 1. Capture snapshots before deletion
INSERT INTO harness_import_staging.adoption_audit_log
SELECT
    gen_random_uuid(),
    ri.batch_id,
    ri.tenant_id,
    'retract',
    ri.staged_record_id,
    ri.formal_table,
    ri.formal_record_id,
    :requested_by,
    :reason,
    to_jsonb(f.*),       -- snapshot before
    NULL                 -- snapshot after = NULL (deleted)
FROM harness_import_staging.reverse_index ri
JOIN harness_hardware.servers f ON f.id = ri.formal_record_id  -- dynamic table per row
WHERE ri.batch_id = :batch_id
  AND ri.retracted_at IS NULL;

-- 2. Delete formal records (dynamic per formal_table)
--    This must be executed per-table by application code.

-- 3. Mark reverse index retracted
UPDATE harness_import_staging.reverse_index
SET retracted_at = NOW()
WHERE batch_id = :batch_id;

-- 4. Update staged records
UPDATE harness_import_staging.staged_records
SET adoption_status = 'retracted'
WHERE batch_id = :batch_id;

-- 5. Update batch status
UPDATE harness_import_staging.import_batches
SET status = 'retracted'
WHERE id = :batch_id;

COMMIT;
```

### 3.4 Output (Retraction Report)

```yaml
retraction_report:
  batch_id: UUID
  status: retracted
  requested_by: UUID
  reason: TEXT
  started_at: TIMESTAMPTZ
  completed_at: TIMESTAMPTZ
  total_records: INT
  retracted_records: INT
  failed_records: INT
  failures: []
  audit_log_entries: [UUID]  # References to adoption_audit_log rows
```

## 4. Recovery Contract

If a retraction was erroneous, recovery requires:
1. A **new import batch** (do not reuse old batch ID).
2. New staged records from the original OpenClaw export bundle.
3. New dry-run, approval, and adoption cycle.

**Direct recovery from `adoption_audit_log.snapshot_before` is NOT supported** as a one-click operation. The snapshot is for forensic/audit purposes only, not for transactional restore.

## 5. Audit Requirements

- Every retraction must generate at least one `adoption_audit_log` row per formal record.
- The `snapshot_before` JSONB must contain the complete formal row at the moment of deletion.
- Retraction reports must be retained for 7 years (compliance default).
- No one may DELETE or UPDATE `adoption_audit_log` rows.

## 6. Guardrails

| Rule | Enforcement |
|------|-------------|
| No silent retract | Retraction must be explicitly requested with a reason. |
| No bulk retract without confirmation | Full-batch retraction requires elevated permission. |
| No retraction of already-retracted batch | Idempotency: second retract is a no-op. |
| No retraction bypassing reverse index | Formal records must be deleted via reverse index lookup. |
| Snapshot required | Every deleted formal row must have a `snapshot_before` in audit log. |
