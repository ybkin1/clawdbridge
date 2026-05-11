# 04: Adoption State Machine

> Scope: B6 owner evidence (docs-only)
> Purpose: Define the staged -> validated -> approved -> adopted -> retracted lifecycle

## 1. State Machine Diagram

```
                    +----------+
                    |  STAGED  |
                    +----+-----+
                         |
              +----------v-----------+
              |   DRY-RUN VALIDATE   |<-----+
              +----------+-----------+      |
                         |                  |
                    +----v-----+            |
                    | VALIDATED|            |
                    +----+-----+            |
                         |                  |
              +----------v----------+       |
              |  OWNER APPROVAL     |       |
              |  (manual gate)      |       |
              +----------+----------+       |
                         |                  |
                    +----v----+             |
                    | APPROVED|             |
                    +----+----+             |
                         |                  |
              +----------v----------+       |
              |     ADOPT           |       |
              |  (formal INSERT)    |       |
              +----------+----------+       |
                         |                  |
                    +----v-----+            |
                    | ADOPTED  |            |
                    +----+-----+            |
                         |                  |
              +----------v----------+       |
              |   RETRACT / ROLLBACK|-------+
              |   (formal DELETE)   |
              +----------+----------+
                         |
                    +----v-----+
                    | RETRACTED|
                    +----------+
```

## 2. State Definitions

| State | Description | Allowed Actions | Exit Conditions |
|-------|-------------|-----------------|-----------------|
| `staged` | Batch uploaded to `harness_import_staging.import_batches` | dry-run validate, delete batch | Dry-run initiated |
| `validated` | Dry-run completed with `pass` or `warn` | request owner approval, return to staged | Owner approves or rejects |
| `approved` | Owner explicitly approved (including warnings) | adopt | Adoption executed |
| `adopted` | Records inserted into Harness formal tables | retract | Retraction requested |
| `retracted` | Formal records removed, batch marked retracted | none (terminal) | N/A |

## 3. State Transitions

### 3.1 staged -> validated

```yaml
transition_id: T-01
from: staged
to: validated
trigger: dry_run_complete
preconditions:
  - batch.status == "staged"
  - dry_run_report exists
  - dry_run_report.status in ["pass", "warn"]
actions:
  - UPDATE import_batches SET status = 'validated', validation_report = :report
postconditions:
  - batch.status == "validated"
  - No formal tables modified
```

### 3.2 validated -> approved

```yaml
transition_id: T-02
from: validated
to: approved
trigger: owner_approval
preconditions:
  - batch.status == "validated"
  - owner_decision_ref is not null
  - owner explicitly approves (UI click or API call)
actions:
  - UPDATE import_batches SET status = 'approved'
  - INSERT INTO adoption_audit_log (action='approve', ...)
postconditions:
  - batch.status == "approved"
  - Audit log entry created
```

### 3.3 approved -> adopted

```yaml
transition_id: T-03
from: approved
to: adopted
trigger: adopt_execute
preconditions:
  - batch.status == "approved"
  - All staged records have validation_status in ["pass", "warn-approved"]
actions:
  - For each staged record:
    - Generate Harness UUID (if missing)
    - INSERT INTO formal_table (mapped columns)
    - UPDATE staged_records SET adoption_status = 'adopted', mapped_pk = :new_uuid
    - INSERT INTO reverse_index (formal_table, formal_record_id, batch_id, ...)
    - INSERT INTO adoption_audit_log (action='adopt', snapshot_before=NULL, snapshot_after= formal row)
  - UPDATE import_batches SET status = 'adopted', adoption_report = :report
postconditions:
  - batch.status == "adopted"
  - All adopted records have reverse_index entries
  - Audit log entries for every adopted row
```

### 3.4 adopted -> retracted

```yaml
transition_id: T-04
from: adopted
to: retracted
trigger: retract_request
preconditions:
  - batch.status == "adopted"
  - retract_requested_by has permission (owner or admin)
actions:
  - For each adopted record in reverse_index (ordered by adoption time DESC):
    - SELECT snapshot_before FROM adoption_audit_log (or query formal row)
    - DELETE FROM formal_table WHERE id = formal_record_id
    - INSERT INTO adoption_audit_log (action='retract', snapshot_before=formal row, snapshot_after=NULL)
    - UPDATE reverse_index SET retracted_at = NOW()
    - UPDATE staged_records SET adoption_status = 'retracted'
  - UPDATE import_batches SET status = 'retracted'
postconditions:
  - batch.status == "retracted"
  - All formal rows from this batch are removed
  - Reverse index preserved (with retracted_at timestamp)
  - Audit log preserves full lineage
```

## 4. Guardrails

| Guardrail | Rule |
|-----------|------|
| **No skip** | Cannot transition from `staged` directly to `adopted`. Must pass through `validated` and `approved`. |
| **No re-adopt** | A `retracted` batch cannot be re-adopted. A new batch must be created. |
| **Owner required** | `approved` state MUST have a non-null `owner_decision_ref`. |
| **Warn gate** | If dry-run has `warn` status, each warning must be individually acknowledged by owner before `approved`. |
| **Atomic batch** | Adoption is all-or-nothing within a batch. No partial adoption allowed. |
| **Audit immutability** | `adoption_audit_log` rows are INSERT-only. Never UPDATE or DELETE. |

## 5. Error States

| Error | Recovery |
|-------|----------|
| Dry-run `fail` | Batch stays `staged`. Owner must fix source data and re-upload. |
| Owner rejects | Batch stays `validated`. Can be deleted or kept for reference. |
| Adoption crash mid-batch | Rollback using transaction. Batch returns to `approved`. No partial formal data left. |
| Retract crash mid-batch | Rollback using transaction. Batch stays `adopted`. Retry retract. |

## 6. Implementation Notes (for future)

- State machine logic should be encapsulated in a dedicated `AdoptionStateMachine` class.
- All state transitions must be wrapped in database transactions.
- `adoption_audit_log` should be in an append-only table partition.
- Consider idempotency keys for `adopt` and `retract` operations to allow safe retry.
