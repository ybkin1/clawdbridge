---
adr_id: ADR-B6-001
status: approved
owner: harness-project-owner
date: "2026-05-10"
scope: B6 Data Import / Staging / Adoption / Rollback
target_gate: B6
---

# ADR-B6-001: Owner Decision on OpenClaw MVP Data Adoption

## Context

B6 owner evidence gap closure package has been reviewed. This ADR records the Harness owner decisions required to advance B6 to `accepted_for_rehearing_review`.

## Decisions

### D-01: Adoption Scope

| OpenClaw Table | Decision | Rationale |
|----------------|----------|-----------|
| `harness_hardware.servers` | **APPROVE** | Core hardware asset data; aligns with harness_hardware schema |
| `harness_hardware.components` | **APPROVE** | Component hierarchy required for fault analysis |
| `harness_hardware.gpu_fault_dict` | **APPROVE** | Seed data valuable for KN-04; expand later |
| `harness_hardware.fault_logs` | **APPROVE** | Historical fault data for PM-02/PM-06 trend analysis |
| `harness_hardware.metrics_snapshots` | **APPROVE** | WITH RANGE partition addition (monthly) |
| `harness_hardware.vendor_manuals` | **APPROVE** | WITH embedding dimension = 1024 (bge-m3) per D-02 |
| `harness_hardware.component_replacements` | **APPROVE** | Part lifecycle data for spare management |
| `harness_hardware.gpu_models` | **APPROVE** | Seed data for fault dictionary matching |
| `harness_business.devices` | **APPROVE with mapping** | Map to `harness_asset.devices` with schema alignment per D-07 |
| `harness_business.tickets` | **REJECT** | MVP ticket schema lacks service_event linkage; incompatible with Harness ticket state machine |
| `harness_business.customers` | **APPROVE** | Master data; add tenant_id |
| `harness_business.contracts` | **APPROVE** | Master data; add tenant_id |
| `harness_business.users` | **APPROVE with role mapping** | Add tenant_id and map roles to Harness RBAC |
| `harness_business.inventory` | **REJECT** | Reconcile later with `harness_spare_parts` module; premature to adopt now |
| `harness_business.warranties` | **APPROVE** | Add tenant_id |
| `harness_business.sops` | **REJECT** | Must enter through `harness_knowledge.documents` with proper categorization workflow |

### D-02: Embedding Dimension Strategy

**Decision**: **Option A (1024, bge-m3)**

Rationale:
- Matches OpenClaw existing dimension
- bge-m3 is open-source, no API vendor lock-in
- Harness detailed design v6.1 allows `enabled: offline` for local GPU environments
- Vendor manual ingestion is a batch operation that can run on GPU-equipped workstations

### D-03: Tenant Assignment

**Decision**: **Single default tenant (catch-all)**

Rationale:
- OpenClaw MVP is a single-tenant prototype
- Creating one catch-all tenant (`tenant_id = '00000000-0000-0000-0000-000000000001'`) is the lowest-friction path
- Future multi-tenant split can be done via a subsequent migration if needed

### D-04: Data Retention for Staging

**Decision**: **90 days**

Rationale:
- Sufficient for verification, audit, and error recovery
- Prevents indefinite accumulation of staging data
- Aligned with typical compliance review cycles

### D-05: Retraction Permission

**Decision**: **Dual approval (importer + admin)**

Rationale:
- Data retraction is a destructive operation affecting formal tables
- Dual control prevents accidental or malicious removal
- Importer knows context; admin has global oversight

### D-06: GPU Fault Dictionary Completeness

**Decision**: **Adopt current 10 entries, expand later**

Rationale:
- 10 seed entries already cover critical Xid codes (31, 43, 63, 64, 79, 121, 13, 48)
- No need to block adoption for non-critical GPU models (4090, 5090 are consumer cards)
- Expansion to B200/B300/H800 can be done as a follow-up data enrichment task

### D-07: Devices Reconciliation Strategy

**Decision**: **Migrate to `harness_asset.devices` with schema alignment**

Rationale:
- Harness architecture patch v1.0 defines `harness_asset` as the asset fact source
- `harness_asset.devices` already includes `current_rack_unit_id`, `is_active`, and DCIM linkage
- OpenClaw `harness_business.devices` fields map cleanly after adding missing columns
- Keeping separate tables would create data fragmentation

## Constraints

- All adoption MUST go through `harness_import_staging` staging layer
- No direct INSERT into formal tables from OpenClaw export bundles
- Dry-run validation MUST pass before any `approved` -> `adopted` transition
- This ADR does NOT authorize implementation; it only authorizes rehearing review
- `implementation_allowed` remains `false` until B6 rehearing passes

## References

- B6 Evidence Package: `/opt/harness/docs/norms-archive/openclaw-codex-gate-refs/b6-owner-evidence/`
- Base Receipt: `/root/docs/tasks/tk-20260506-001/artifacts/owner-evidence-20260510-b6-openclaw-sql-reference-001.yaml`
- Addendum Receipt: `/opt/harness/docs/norms-archive/openclaw-codex-gate-refs/b6-owner-evidence/owner-evidence-20260510-b6-openclaw-sql-reference-001.addendum.yaml`
