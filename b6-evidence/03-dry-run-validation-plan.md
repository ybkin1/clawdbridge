# 03: Dry-Run Validation Plan

> Scope: B6 owner evidence (docs-only)
> Purpose: Define dry-run validation rules before any OpenClaw data adoption into Harness formal tables

## 1. Principle

Dry-run = **simulate adoption without writing to formal tables**. Every batch must pass dry-run before owner approval.

## 2. Dry-Run Execution Flow

```
+-------------+     +------------------+     +------------------+
|   Staged    | --> |   Dry-Run        | --> |   Validation     |
|   Records   |     |   Simulation     |     |   Report         |
+-------------+     +------------------+     +------------------+
                           |                          |
                           v                          v
                    +------------------+     +------------------+
                    |   Read-Only      |     |   Pass / Fail /  |
                    |   Formal Schema  |     |   Warn           |
                    |   Introspection  |     +------------------+
                    +------------------+
```

## 3. Validation Rules

### 3.1 Schema Compatibility (DR-01)

| Check | Command / Logic | Expected Result |
|-------|----------------|-----------------|
| Column existence | Compare staging payload keys against formal table columns | All payload keys map to existing formal columns |
| Type compatibility | `information_schema.columns` type check | Types are compatible or castable |
| NOT NULL constraints | Check formal `is_nullable` vs payload | No NULL in required columns |
| Enum validation | Check formal `CHECK` constraints | Values match allowed enums |
| FK existence | Check referenced UUIDs exist in formal tables | All FK references resolve |
| Unique constraints | Check formal `UNIQUE` indexes | No duplicates against existing formal data |

### 3.2 Tenant Safety (DR-02)

| Check | Logic | Expected Result |
|-------|-------|-----------------|
| Tenant isolation | All staged records have same `tenant_id` | `tenant_id` is consistent within batch |
| Tenant validity | `tenant_id` exists in `harness_business.tenants` (or tenant registry) | Valid tenant reference |
| Cross-tenant leak | No staged record references formal data from another tenant | Zero cross-tenant FK violations |

### 3.3 Data Integrity (DR-03)

| Check | Logic | Expected Result |
|-------|-------|-----------------|
| Payload hash integrity | Recompute SHA-256 of payload, compare to `staged_records.payload_hash` | 100% match |
| Bundle hash integrity | Recompute SHA-256 of bundle, compare to `import_batches.bundle_hash` | Match |
| JSON well-formedness | `jsonb_valid(payload)` | All payloads valid JSONB |
| Temporal sanity | `detected_at <= NOW()`, `install_date <= NOW()` | No future dates |
| Serial number uniqueness | `serial_no` within batch vs formal table | No conflicts (or explicit merge strategy) |

### 3.4 Security & Compliance (DR-04)

| Check | Logic | Expected Result |
|-------|-------|-----------------|
| No PII leak | Scan payload for email, phone, SSN patterns | No unexpected PII in non-PII columns |
| Password/credential absence | Reject payloads containing `password`, `secret`, `token` keys | Clean |
| Audit field presence | `created_at`, `updated_at` are ISO-8601 | Valid timestamps |

## 4. Dry-Run Report Format

```yaml
dry_run_id: dr-20260510-001
batch_id: <import_batch_id>
status: pass | fail | warn
started_at: "2026-05-10T12:00:00Z"
completed_at: "2026-05-10T12:01:30Z"
performed_by: <user_id>
rules_checked:
  - rule_id: DR-01
    category: schema_compatibility
    status: pass
    details: "1280/1280 records compatible"
  - rule_id: DR-02
    category: tenant_safety
    status: pass
    details: "tenant_id=uuid-xxx consistent; no cross-tenant leaks"
  - rule_id: DR-03
    category: data_integrity
    status: warn
    details: "3 records have future install_date; flagged for owner review"
  - rule_id: DR-04
    category: security_compliance
    status: pass
    details: "No PII or credential leak detected"
summary:
  total_records: 1280
  pass_count: 1277
  warn_count: 3
  fail_count: 0
  fail_details: []
  warn_details:
    - record_id: <uuid>
      issue: "install_date > NOW()"
      suggested_action: "Set install_date = created_at or request owner confirmation"
```

## 5. Failure Handling

| Severity | Action |
|----------|--------|
| **Fail** | Batch blocked. Return to owner. No adoption allowed. |
| **Warn** | Batch flagged. Owner must explicitly approve each warning before adoption. |
| **Pass** | Batch eligible for owner approval. |

## 6. Dry-Run Command Examples (Read-Only)

```bash
# 1. Schema introspection (read-only)
psql -d harness -c "
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'harness_hardware'
ORDER BY table_name, ordinal_position;
"

# 2. Check existing serial numbers (read-only)
psql -d harness -c "
SELECT serial_no FROM harness_hardware.servers WHERE tenant_id = '<tenant_id>';
"

# 3. Simulate FK check (read-only)
psql -d harness -c "
SELECT s.id FROM staging_servers s
LEFT JOIN harness_hardware.servers f ON f.serial_no = s.serial_no AND f.tenant_id = s.tenant_id
WHERE f.id IS NOT NULL;
"
```

## 7. Guardrails

- Dry-run must be **100% read-only**.
- No `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` on formal tables during dry-run.
- Dry-run must run in a transaction that is always `ROLLBACK`.
- Dry-run report must be persisted to `harness_import_staging.import_batches.validation_report`.
