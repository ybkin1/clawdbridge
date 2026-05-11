# 01: Staging DDL Draft

> Docs-only draft. NOT a formal migration. Do NOT write to `/opt/harness/sql/`.
> Source: OpenClaw MVP SQL (`03_hardware.sql`, `01_business.sql`)
> Target: Harness formal schemas (`harness_hardware`, `harness_business`, etc.)

## 1. Design Principle

All OpenClaw data must flow through a **staging layer** before adoption into Harness formal tables. Staging tables are **ephemeral** and **tenant-scoped**.

## 2. Schema: `harness_import_staging`

```sql
CREATE SCHEMA IF NOT EXISTS harness_import_staging;

-- Import batch registry: one row per OpenClaw export bundle
CREATE TABLE harness_import_staging.import_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name          VARCHAR(100) NOT NULL,           -- e.g. "openclaw-mvp-hardware-20260510"
    source_system       VARCHAR(50) NOT NULL,            -- "openclaw"
    source_version      VARCHAR(20),                     -- "mvp-202604"
    tenant_id           UUID NOT NULL,                   -- harness tenant scope
    exported_at         TIMESTAMPTZ,                     -- original export timestamp
    imported_by         UUID REFERENCES harness_business.users(id),
    bundle_hash         VARCHAR(64) NOT NULL,            -- SHA-256 of the export bundle
    status              VARCHAR(20) DEFAULT 'staged'
                        CHECK (status IN ('staged','validated','approved','adopted','retracted')),
    validation_report   JSONB DEFAULT '{}',
    adoption_report     JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_import_batches_tenant ON harness_import_staging.import_batches(tenant_id);
CREATE INDEX idx_import_batches_status ON harness_import_staging.import_batches(status);

-- Staged raw records: one row per OpenClaw record, JSONB payload
CREATE TABLE harness_import_staging.staged_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            UUID NOT NULL REFERENCES harness_import_staging.import_batches(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL,
    source_table        VARCHAR(64) NOT NULL,            -- e.g. "harness_hardware.servers"
    source_pk           VARCHAR(64),                     -- original OpenClaw primary key (if any)
    payload             JSONB NOT NULL,                  -- full OpenClaw record as JSONB
    payload_hash        VARCHAR(64) NOT NULL,            -- SHA-256 of payload
    mapped_table        VARCHAR(64),                     -- target Harness formal table
    mapped_pk           UUID,                            -- assigned Harness UUID after adoption
    validation_status   VARCHAR(20) DEFAULT 'pending'
                        CHECK (validation_status IN ('pending','pass','fail','warn')),
    validation_errors   JSONB DEFAULT '[]',              -- array of error objects
    adoption_status     VARCHAR(20) DEFAULT 'pending'
                        CHECK (adoption_status IN ('pending','adopted','skipped','retracted')),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_staged_records_batch ON harness_import_staging.staged_records(batch_id);
CREATE INDEX idx_staged_records_source ON harness_import_staging.staged_records(source_table, source_pk);
CREATE INDEX idx_staged_records_mapped ON harness_import_staging.staged_records(mapped_table, mapped_pk);
CREATE INDEX idx_staged_records_validation ON harness_import_staging.staged_records(validation_status);

-- Adoption audit log: immutable record of every adoption/retract action
CREATE TABLE harness_import_staging.adoption_audit_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            UUID NOT NULL REFERENCES harness_import_staging.import_batches(id),
    tenant_id           UUID NOT NULL,
    action              VARCHAR(20) NOT NULL
                        CHECK (action IN ('adopt','retract','rollback','validate','approve')),
    staged_record_id    UUID REFERENCES harness_import_staging.staged_records(id),
    formal_table        VARCHAR(64),
    formal_record_id    UUID,
    performed_by        UUID REFERENCES harness_business.users(id),
    reason              TEXT,
    snapshot_before     JSONB,                           -- formal record state before action
    snapshot_after      JSONB,                           -- formal record state after action
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_adoption_audit_batch ON harness_import_staging.adoption_audit_log(batch_id);
CREATE INDEX idx_adoption_audit_formal ON harness_import_staging.adoption_audit_log(formal_table, formal_record_id);

-- Reverse index: formal object -> import batch/lineage
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
CREATE INDEX idx_reverse_index_formal ON harness_import_staging.reverse_index(formal_schema, formal_table, formal_record_id);
CREATE INDEX idx_reverse_index_batch ON harness_import_staging.reverse_index(batch_id);
```

## 3. Staging -> Formal Mapping (OpenClaw -> Harness)

| OpenClaw Source | Staging `source_table` | Harness Formal Target | Notes |
|-----------------|------------------------|----------------------|-------|
| `harness_hardware.servers` | `harness_hardware.servers` | `harness_hardware.servers` | Add `tenant_id`, `asset_device_id` FK |
| `harness_hardware.components` | `harness_hardware.components` | `harness_hardware.components` | Add `tenant_id` |
| `harness_hardware.gpu_fault_dict` | `harness_hardware.gpu_fault_dict` | `harness_hardware.gpu_fault_dict` | Expand seed data to all GPU models |
| `harness_hardware.fault_logs` | `harness_hardware.fault_logs` | `harness_hardware.fault_logs` | Add `tenant_id` |
| `harness_hardware.metrics_snapshots` | `harness_hardware.metrics_snapshots` | `harness_hardware.metrics_snapshots` | Add RANGE partition (monthly) |
| `harness_hardware.vendor_manuals` | `harness_hardware.vendor_manuals` | `harness_hardware.vendor_manuals` | Verify embedding dimension (1024 vs 1536) |
| `harness_hardware.component_replacements` | `harness_hardware.component_replacements` | `harness_hardware.component_replacements` | Add `tenant_id` |
| `harness_hardware.gpu_models` | `harness_hardware.gpu_models` | `harness_hardware.gpu_models` | Seed data usable |
| `harness_business.users` | `harness_business.users` | `harness_business.users` | Add `tenant_id` |
| `harness_business.devices` | `harness_business.devices` | `harness_asset.devices` + `harness_business.devices` | Reconcile with asset registry |
| `harness_business.tickets` | `harness_business.tickets` | `harness_business.tickets` | Add `service_event_id` FK |
| `harness_business.customers` | `harness_business.customers` | `harness_business.customers` | Add `tenant_id` |
| `harness_business.contracts` | `harness_business.contracts` | `harness_business.contracts` | Add `tenant_id` |
| `harness_business.inventory` | `harness_business.inventory` | `harness_spare_parts.spare_pool_entitlements` | Reconcile with spare parts model |
| `harness_business.warranties` | `harness_business.warranties` | `harness_business.warranties` | Add `tenant_id` |
| `harness_business.sops` | `harness_business.sops` | `harness_knowledge.documents` | Category mapping required |

## 4. Constraints

- `harness_import_staging` tables are **NOT** RLS-protected (they are pre-tenant import buffers).
- `tenant_id` must be populated at staging time.
- `bundle_hash` must match the SHA-256 of the exported OpenClaw bundle.
- No foreign keys from staging to formal tables (staging must be droppable independently).
