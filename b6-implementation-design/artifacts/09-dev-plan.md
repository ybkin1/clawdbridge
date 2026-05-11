# 09: Sprint 1 Dev Plan — B6 Import Staging + Adoption Pipeline

> Task: tk-20260510-002-b6-implementation-design
> Phase: Implementation Design (NOT execution)
> Gate: B6
> Date: 2026-05-10

---

## 1. Executive Summary

**Goal**: Design the complete implementation of B6 (Data Import / Staging / Adoption / Rollback) for the Harness After-Sales Intelligence Platform.

**Scope**: This plan covers design documents only. No product code, no formal DDL execution, no database writes.

**Duration Estimate**: 2 days for design review + approval.

**Sprint 1 Execution Estimate**: 3-4 weeks for implementation + testing.

---

## 2. Lego L0-L4 Decomposition

### L0: Product

**Harness 售后智能平台** (After-Sales Intelligence Platform)

### L1: Module

**`data_import`** — OpenClaw / external system data ingestion and adoption module

**Position in Harness**: New module under `src/modules/data_import/`

**Neighboring Modules**:
- `harness_hardware` (adoption target)
- `harness_business` (adoption target)
- `harness_asset` (adoption target)
- `harness_spare_parts` (future adoption target)
- `harness_knowledge` (future adoption target)
- `harness_service` (service_event source, not B6 scope)

### L2: Components

| Component | File | Responsibility |
|-----------|------|---------------|
| **ImportController** | `import_controller.py` | Batch lifecycle: create, list, get, delete staging batch |
| **ExportBundleParser** | `bundle_parser.py` | Parse OpenClaw export bundle, validate manifest, checksum verification |
| **DryRunValidator** | `dry_run_validator.py` | Schema compatibility, tenant safety, data integrity, security scans |
| **AdoptionStateMachine** | `state_machine.py` | State transitions: staged → validated → approved → adopted → retracted |
| **ReverseIndexManager** | `reverse_index.py` | Build and query reverse index (formal record → import batch lineage) |
| **RollbackExecutor** | `rollback_executor.py` | Pre-commit rollback (transaction) and post-commit retract |
| **AuditLogger** | `audit_logger.py` | Append-only adoption/retract audit logging |

### L3: Functional Units

| Unit | Component | I/O | Description |
|------|-----------|-----|-------------|
| **DI-01 create_import_batch** | ImportController | POST `/api/import/batches` | Create batch, upload bundle, parse into staged_records |
| **DI-02 list_import_batches** | ImportController | GET `/api/import/batches` | List batches with filter by status, tenant, date |
| **DI-03 get_import_batch** | ImportController | GET `/api/import/batches/{id}` | Get batch detail with staged record summary |
| **DI-04 delete_import_batch** | ImportController | DELETE `/api/import/batches/{id}` | Delete batch (only if status=staged) |
| **DI-05 parse_export_bundle** | ExportBundleParser | bundle.tar.gz → staged_records | Validate manifest, checksum, parse JSONL per table |
| **DI-06 validate_schema_compatibility** | DryRunValidator | staged_record → validation_result | Column existence, type compat, NOT NULL, enum, FK |
| **DI-07 validate_tenant_safety** | DryRunValidator | batch → validation_result | Tenant consistency, cross-tenant leak detection |
| **DI-08 validate_data_integrity** | DryRunValidator | staged_record → validation_result | Payload hash, bundle hash, JSON validity, temporal sanity |
| **DI-09 validate_security_compliance** | DryRunValidator | staged_record → validation_result | PII scan, credential absence |
| **DI-10 execute_dry_run** | DryRunValidator | batch_id → dry_run_report | Run all validators, produce structured report |
| **DI-11 transition_to_validated** | AdoptionStateMachine | batch_id + dry_run_report → batch | Update status, persist report |
| **DI-12 request_owner_approval** | AdoptionStateMachine | batch_id → approval_request | Generate approval request with decision checklist |
| **DI-13 transition_to_approved** | AdoptionStateMachine | batch_id + owner_decision → batch | Record owner_decision_ref, update status |
| **DI-14 execute_adoption** | AdoptionStateMachine | batch_id → adoption_report | Atomic insert into formal tables, build reverse_index |
| **DI-15 transition_to_adopted** | AdoptionStateMachine | batch_id + adoption_report → batch | Update status, persist report |
| **DI-16 execute_retraction** | RollbackExecutor | batch_id + reason → retraction_report | Reverse lookup formal records, delete, audit log |
| **DI-17 transition_to_retracted** | AdoptionStateMachine | batch_id + retraction_report → batch | Update status, mark reverse_index retracted_at |
| **DI-18 query_lineage** | ReverseIndexManager | formal_record_id → lineage_chain | Trace formal record back to batch/staged_record/original payload |
| **DI-19 query_batch_lineage** | ReverseIndexManager | batch_id → [lineage_records] | List all formal records adopted from a batch |
| **DI-20 log_adoption_audit** | AuditLogger | action + snapshot → audit_record | Immutable append-only audit logging |

### L4: Code Blocks

#### L4.1 ImportController

```python
class ImportController:
    async def create_batch(self, bundle: UploadFile, tenant_id: UUID, user_id: UUID) -> ImportBatch
    async def list_batches(self, tenant_id: UUID, status: Optional[str], limit: int, offset: int) -> List[ImportBatchSummary]
    async def get_batch(self, batch_id: UUID, tenant_id: UUID) -> ImportBatchDetail
    async def delete_batch(self, batch_id: UUID, tenant_id: UUID) -> None
```

#### L4.2 ExportBundleParser

```python
class ExportBundleParser:
    def validate_manifest(self, manifest: dict) -> ManifestValidationResult
    def verify_checksums(self, bundle_path: Path, manifest: dict) -> ChecksumResult
    def parse_table(self, table_file: Path, table_manifest: dict) -> Iterator[StagingRecord]
```

#### L4.3 DryRunValidator

```python
class DryRunValidator:
    async def validate(self, batch_id: UUID) -> DryRunReport
    
    async def _check_schema_compatibility(self, batch_id: UUID) -> ValidationResult
    async def _check_tenant_safety(self, batch_id: UUID) -> ValidationResult
    async def _check_data_integrity(self, batch_id: UUID) -> ValidationResult
    async def _check_security_compliance(self, batch_id: UUID) -> ValidationResult
```

#### L4.4 AdoptionStateMachine

```python
class AdoptionStateMachine:
    ALLOWED_TRANSITIONS = {
        'staged': ['validated'],
        'validated': ['approved', 'staged'],
        'approved': ['adopted', 'staged'],
        'adopted': ['retracted'],
        'retracted': []  # terminal
    }
    
    async def transition(self, batch_id: UUID, from_state: str, to_state: str, context: dict) -> Batch
    async def _on_validated(self, batch_id: UUID, dry_run_report: DryRunReport) -> None
    async def _on_approved(self, batch_id: UUID, owner_decision_ref: str) -> None
    async def _on_adopted(self, batch_id: UUID, adoption_report: AdoptionReport) -> None
    async def _on_retracted(self, batch_id: UUID, retraction_report: RetractionReport) -> None
```

#### L4.5 ReverseIndexManager

```python
class ReverseIndexManager:
    async def build_index(self, batch_id: UUID, formal_schema: str, formal_table: str, mappings: List[FormalMapping]) -> None
    async def query_lineage(self, formal_schema: str, formal_table: str, formal_record_id: UUID) -> LineageChain
    async def query_batch_lineage(self, batch_id: UUID) -> List[LineageRecord]
```

#### L4.6 RollbackExecutor

```python
class RollbackExecutor:
    async def rollback_pre_commit(self, batch_id: UUID) -> None  # Transaction ROLLBACK
    async def retract_post_commit(self, batch_id: UUID, requested_by: UUID, reason: str) -> RetractionReport
```

#### L4.7 AuditLogger

```python
class AuditLogger:
    async def log(self, batch_id: UUID, action: str, staged_record_id: Optional[UUID], 
                  formal_table: Optional[str], formal_record_id: Optional[UUID],
                  performed_by: UUID, reason: str, snapshot_before: Optional[dict], 
                  snapshot_after: Optional[dict]) -> AuditRecord
```

---

## 3. Database Design (Formal DDL for Sprint 1 Execution)

### Schema: `harness_import_staging`

Already defined in `b6-owner-evidence/01-staging-ddl-draft.md`. Summary:

| Table | Purpose |
|-------|---------|
| `import_batches` | Batch registry with status, hash, reports |
| `staged_records` | Individual OpenClaw records as JSONB |
| `adoption_audit_log` | Immutable action log |
| `reverse_index` | Formal record → batch/lineage mapping |

#### Integration with Existing Harness Infrastructure

**RLS (M-01)**: This schema integrates with existing Sprint 0 RLS infrastructure:
- `harness_user_scopes` (table, Sprint 0): provides `tenant_id` + `user_id` → `role_level` mapping
- `harness_roles` (table, Sprint 0): provides role hierarchy for RBAC enforcement
- WP-8 creates RLS policies on `harness_import_staging.*` that reference `harness_user_scopes.role_level` rather than defining standalone role tables

**Audit (M-02)**: `adoption_audit_log` is logically related to `harness_audit.audit_logs` (Sprint 0) but remains a separate table because:
- Adoption actions have a different lifecycle (batch-scoped, not record-scoped)
- `harness_audit.audit_logs` uses hash-chain integrity (§14 of harness-detailed-design-v1.md); `adoption_audit_log` references this design pattern and may be unified in a future Sprint
- Cross-reference: `adoption_audit_log.batch_id` can be correlated with `harness_audit.audit_logs.correlation_id` for end-to-end traceability

**Storage (M-03)**: `staged_records.payload` is JSONB. For bundles with very large individual records (e.g., 100K fault logs), PostgreSQL TOAST automatically compresses out-of-line storage. If average payload exceeds 2KB per record, consider adding `ALTER TABLE staged_records ALTER COLUMN payload SET STORAGE EXTERNAL;` or a companion `staged_record_chunks` table in a future optimization Sprint.

### Indexes

```sql
-- import_batches
CREATE INDEX idx_import_batches_tenant ON harness_import_staging.import_batches(tenant_id);
CREATE INDEX idx_import_batches_status ON harness_import_staging.import_batches(status);

-- staged_records
CREATE INDEX idx_staged_records_batch ON harness_import_staging.staged_records(batch_id);
CREATE INDEX idx_staged_records_source ON harness_import_staging.staged_records(source_table, source_pk);
CREATE INDEX idx_staged_records_mapped ON harness_import_staging.staged_records(mapped_table, mapped_pk);
CREATE INDEX idx_staged_records_validation ON harness_import_staging.staged_records(validation_status);

-- adoption_audit_log
CREATE INDEX idx_adoption_audit_batch ON harness_import_staging.adoption_audit_log(batch_id);
CREATE INDEX idx_adoption_audit_formal ON harness_import_staging.adoption_audit_log(formal_table, formal_record_id);

-- reverse_index
CREATE INDEX idx_reverse_index_formal ON harness_import_staging.reverse_index(formal_schema, formal_table, formal_record_id);
CREATE INDEX idx_reverse_index_batch ON harness_import_staging.reverse_index(batch_id);
```

---

## 4. Interface Contracts

### 4.1 REST API Endpoints

| Method | Path | Unit | Auth |
|--------|------|------|------|
| POST | `/api/import/batches` | DI-01 | data_steward+ |
| GET | `/api/import/batches` | DI-02 | data_steward+ |
| GET | `/api/import/batches/{id}` | DI-03 | data_steward+ |
| DELETE | `/api/import/batches/{id}` | DI-04 | data_steward+ (own batch only) |
| POST | `/api/import/batches/{id}/dry-run` | DI-10 | data_steward+ |
| POST | `/api/import/batches/{id}/approve` | DI-13 | admin (owner decision required) |
| POST | `/api/import/batches/{id}/adopt` | DI-14 | admin |
| POST | `/api/import/batches/{id}/retract` | DI-16 | dual approval (importer + admin) |
| GET | `/api/import/lineage/{formal_schema}/{formal_table}/{record_id}` | DI-18 | data_steward+ |

### 4.2 NATS Events

| Event | Producer | Consumer | Trigger |
|-------|----------|----------|---------|
| `event.import.batch_created` | ImportController | audit_logger | Batch created |
| `event.import.dry_run_completed` | DryRunValidator | AdoptionStateMachine | Validation done |
| `event.import.batch_approved` | AdoptionStateMachine | notification | Owner approval |
| `event.import.batch_adopted` | AdoptionStateMachine | notification, audit | Adoption complete |
| `event.import.batch_retracted` | RollbackExecutor | notification, audit | Retraction complete |

### 4.3 MCP Server Methods (pg_server extension)

```python
class ImportMcpServer:
    async def import_create_batch(self, bundle_path: str, tenant_id: str) -> dict
    async def import_list_batches(self, tenant_id: str, status: Optional[str]) -> list[dict]
    async def import_get_batch(self, batch_id: str) -> dict
    async def import_delete_batch(self, batch_id: str) -> bool
    async def import_dry_run(self, batch_id: str) -> dict
    async def import_approve_batch(self, batch_id: str, owner_decision_ref: str) -> dict
    async def import_adopt_batch(self, batch_id: str) -> dict
    async def import_retract_batch(self, batch_id: str, reason: str) -> dict
    async def import_query_lineage(self, formal_schema: str, formal_table: str, record_id: str) -> dict
```

---

## 5. Sub-Work Packages

| Work Package | Units | Owner | Depends On | Est. Effort |
|-------------|-------|-------|-----------|------------|
| WP-1: Staging DDL + Migration | DI-01~DI-04 | code-agent | Sprint 0 complete | 2d |
| WP-2: Bundle Parser | DI-05 | code-agent | WP-1 | 2d |
| WP-3: Dry-Run Validator | DI-06~DI-10 | code-agent | WP-1 | 3d |
| WP-4: Adoption State Machine | DI-11~DI-15 | code-agent | WP-3 | 3d |
| WP-5: Reverse Index + Lineage | DI-18~DI-19 | code-agent | WP-4 | 2d |
| WP-6: Rollback + Retract | DI-16~DI-17 | code-agent | WP-4 | 2d |
| WP-7: Audit Logger | DI-20 | code-agent | WP-1 | 1d |
| WP-8: RBAC/RLS Integration | — | code-agent | WP-1~WP-7, Sprint 0 RLS tables | 3d |
| WP-9: REST API Routes | DI-01~DI-19 | code-agent | WP-1~WP-8 | 2d |
| WP-10: Integration Tests | — | test-agent | WP-1~WP-9 | 3d |
| **Total** | | | | **~23d** |

#### Atomic Adoption Transaction Boundary (C-01)

Atomic adoption is enforced via **single PostgreSQL database transaction** (not application-level compensating transactions):

1. `BEGIN` transaction
2. Insert into formal tables (all records from batch)
3. Build reverse_index entries
4. Write adoption_audit_log entry
5. Update import_batches status → `adopted`
6. `COMMIT`

If any step fails, the entire transaction rolls back. No partial adoption state is visible to other sessions. This satisfies the "all-or-nothing" AC requirement.

---

## 6. File Ownership

### New Files

```
src/modules/data_import/
├── __init__.py
├── import_controller.py          # WP-1, WP-9
├── bundle_parser.py              # WP-2
├── dry_run_validator.py          # WP-3
├── state_machine.py              # WP-4
├── reverse_index.py              # WP-5
├── rollback_executor.py          # WP-6
├── audit_logger.py               # WP-7
├── rbac_decorator.py             # WP-8
└── tests/
    ├── test_bundle_parser.py
    ├── test_dry_run_validator.py
    ├── test_state_machine.py
    ├── test_reverse_index.py
    ├── test_rollback.py
    └── test_integration.py

src/api/routes/
└── import.py                     # WP-9

src/lib/nats/subscribers/
└── import_subscriber.py          # WP-4, WP-6

sql/
└── sprint1_import_staging.sql    # WP-1 (formal migration)
```

### Modified Files (read-only during design)

```
src/api/main.py                   # Register import routes
src/lib/database.py               # Add harness_import_staging schema search_path on connection init; register asyncpg type codec for UUID[] if needed by reverse_index batch lookups
```

---

## 7. Acceptance Criteria

### Functional

- [ ] Engineer can upload an OpenClaw export bundle and create a staging batch
- [ ] Dry-run validates schema compatibility, tenant safety, data integrity, security compliance
- [ ] Owner can approve a validated batch (with explicit decision ref)
- [ ] Approved batch can be atomically adopted into formal tables
- [ ] Every adopted record has a reverse_index entry
- [ ] Retraction removes formal records and preserves lineage in reverse_index
- [ ] Audit log contains immutable records of every action

### Non-Functional

- [ ] Batch adoption is atomic (all-or-nothing)
- [ ] Dry-run is 100% read-only (uses transaction rollback)
- [ ] All operations are tenant-scoped (RLS enforced)
- [ ] Retraction requires dual approval
- [ ] Audit log is append-only (no UPDATE/DELETE)

### Performance

- [ ] Bundle of 10,000 records processes through staging + dry-run within 60 seconds (single tenant, standard hardware)

### B6 Guardrails

- [ ] No direct INSERT into formal tables from external bundles
- [ ] All data flows through `harness_import_staging`
- [ ] Owner decision required before adoption
- [ ] Reverse index exists for every adopted record
- [ ] Rollback/retract contract documented and executable

---

## 8. Risk and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| OpenClaw schema drift | High | Medium | Bundle schema versioning + strict validation |
| Large bundle memory pressure | High | High | Stream-parse JSONL + chunked staging insert |
| Adoption crash mid-batch | High | Low | Wrap in DB transaction + idempotency keys |
| Cross-tenant data leak | Critical | Low | RLS + tenant validation in dry-run |
| Retraction of shared records | Medium | Low | Reverse index shows all batches per formal record |
| Owner decision bottleneck | Medium | High | Async approval workflow with notification |
| Staging table bloat | Medium | Medium | Periodic archival or cleanup after retention period; TOAST for large payloads |
| Embedding dimension mismatch (1024 vs 1536) | Low | Low | ADR-B6-001 locked to 1024 (bge-m3); migration path to 1536 documented in ADR |
| NATS event replay / double processing | Medium | Low | Add idempotency key (`batch_id` + `adopted_at`) to all adoption events |

---

## 9. Rollback Strategy

If Sprint 1 implementation encounters unresolvable issues:

1. **Code Rollback**: Revert git commits. `src/modules/data_import/` is a new directory, easy to remove.
2. **Database Rollback**: `harness_import_staging` schema is isolated. `DROP SCHEMA harness_import_staging CASCADE;` removes all staging data without affecting formal tables.
3. **No Formal Data Risk**: Until adoption is executed, no formal tables are modified.
4. **Audit Preservation**: Even during rollback, audit logs in `adoption_audit_log` are preserved (append-only).

---

## 10. Definition of Done (Design Phase)

This design phase is complete when:

- [x] Lego L0-L4 decomposition complete
- [x] Interface contracts (REST, NATS, MCP) defined
- [x] Database schema refined with indexes
- [x] Sub-work packages defined with dependencies
- [x] File ownership clear
- [x] Acceptance criteria defined
- [x] Risk and mitigation identified
- [x] Rollback strategy documented
- [ ] Independent design review passed
- [ ] Owner approved design for implementation
