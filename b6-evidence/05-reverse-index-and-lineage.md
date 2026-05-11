# 05: Reverse Index and Lineage

> Scope: B6 owner evidence (docs-only)
> Purpose: Define how adopted formal records can be traced back to their OpenClaw import batch

## 1. Principle

Every formal record adopted from OpenClaw must be **reversibly traceable** to its source batch, staged record, and original payload hash. This is non-negotiable for B6 compliance.

## 2. Reverse Index Schema

Already defined in `01-staging-ddl-draft.md` as `harness_import_staging.reverse_index`:

```sql
CREATE TABLE harness_import_staging.reverse_index (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    formal_schema       VARCHAR(64) NOT NULL,
    formal_table        VARCHAR(64) NOT NULL,
    formal_record_id    UUID NOT NULL,
    batch_id            UUID NOT NULL REFERENCES harness_import_staging.import_batches(id),
    staged_record_id    UUID NOT NULL REFERENCES harness_import_staging.staged_records(id),
    source_system       VARCHAR(50) NOT NULL,
    source_version      VARCHAR(20),
    bundle_hash         VARCHAR(64) NOT NULL,
    payload_hash        VARCHAR(64) NOT NULL,
    adopted_at          TIMESTAMPTZ,
    retracted_at        TIMESTAMPTZ,
    UNIQUE(formal_schema, formal_table, formal_record_id, batch_id)
);
```

## 3. Query Patterns

### 3.1 Find source of a formal record

```sql
-- Given a formal record, find its OpenClaw origin
SELECT
    ri.batch_id,
    ri.staged_record_id,
    ri.source_system,
    ri.source_version,
    ri.bundle_hash,
    ri.payload_hash,
    sr.payload AS original_payload,
    ib.exported_at,
    ib.imported_by
FROM harness_import_staging.reverse_index ri
JOIN harness_import_staging.staged_records sr ON sr.id = ri.staged_record_id
JOIN harness_import_staging.import_batches ib ON ib.id = ri.batch_id
WHERE ri.formal_schema = 'harness_hardware'
  AND ri.formal_table = 'servers'
  AND ri.formal_record_id = :server_uuid;
```

### 3.2 Find all formal records from a batch

```sql
-- Given a batch, list all adopted formal records
SELECT
    ri.formal_schema,
    ri.formal_table,
    ri.formal_record_id,
    ri.adopted_at,
    ri.retracted_at
FROM harness_import_staging.reverse_index ri
WHERE ri.batch_id = :batch_uuid
ORDER BY ri.adopted_at;
```

### 3.3 Find all batches that touched a formal table

```sql
-- Audit: which batches have contributed to harness_hardware.servers?
SELECT DISTINCT
    ri.batch_id,
    ib.bundle_name,
    ib.source_system,
    ib.imported_by,
    COUNT(ri.formal_record_id) AS record_count
FROM harness_import_staging.reverse_index ri
JOIN harness_import_staging.import_batches ib ON ib.id = ri.batch_id
WHERE ri.formal_schema = 'harness_hardware'
  AND ri.formal_table = 'servers'
GROUP BY ri.batch_id, ib.bundle_name, ib.source_system, ib.imported_by;
```

## 4. Lineage Chain

```
OpenClaw Export Bundle
    |
    v
[harness_import_staging.import_batches]
    |
    v
[harness_import_staging.staged_records]
    |
    v
[harness_import_staging.reverse_index]
    |
    v
[Harness Formal Table]
```

Each link in the chain carries a hash for integrity verification:
- `bundle_hash`: SHA-256 of the entire export archive
- `payload_hash`: SHA-256 of the individual JSONB record
- `formal_record_id`: UUID of the adopted row in the formal table

## 5. Retraction Lineage

When a batch is retracted:
- `reverse_index.retracted_at` is set to `NOW()`
- The formal record is deleted
- But the lineage chain is **preserved** (read-only historical evidence)
- `adoption_audit_log` captures the snapshot before deletion

This allows answering: "Was this serial number ever adopted from OpenClaw, and when was it removed?"

## 6. Owner Evidence Requirement

The reverse index must be queryable by:
- **Harness owner** (full read)
- **Audit reviewer** (read-only, no tenant filter bypass)
- **Data steward** (read-only, tenant-scoped)

No user may DELETE or UPDATE `reverse_index` rows. Only the retraction process may set `retracted_at`.
