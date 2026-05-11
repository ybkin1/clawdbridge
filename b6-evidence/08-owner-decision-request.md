# 08: Owner Decision Request

> Scope: B6 owner evidence (docs-only)
> Purpose: Document the decisions Harness owner must make before B6 can advance

## 1. Current Status

| Item | Value |
|------|-------|
| Base Receipt | `/root/docs/tasks/tk-20260506-001/artifacts/owner-evidence-20260510-b6-openclaw-sql-reference-001.yaml` |
| Target Gate | B6 |
| Intake Status | `incomplete` |
| Owner Decision Ref | `null` |

## 2. Decisions Required

### D-01: Adoption Scope

**Question**: Which OpenClaw tables should be adopted into Harness formal tables?

| OpenClaw Table | Recommendation | Harness Target | Owner Decision |
|----------------|---------------|----------------|----------------|
| `harness_hardware.servers` | Adopt with mapping | `harness_hardware.servers` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_hardware.components` | Adopt with mapping | `harness_hardware.components` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_hardware.gpu_fault_dict` | Adopt seed data | `harness_hardware.gpu_fault_dict` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_hardware.fault_logs` | Adopt with tenant_id | `harness_hardware.fault_logs` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_hardware.metrics_snapshots` | Adopt with RANGE partition | `harness_hardware.metrics_snapshots` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_hardware.vendor_manuals` | Adopt after embedding decision | `harness_hardware.vendor_manuals` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_hardware.component_replacements` | Adopt with mapping | `harness_hardware.component_replacements` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_hardware.gpu_models` | Adopt seed data | `harness_hardware.gpu_models` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_business.devices` | Reconcile with asset registry | `harness_asset.devices` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_business.tickets` | Adopt with service_event mapping | `harness_business.tickets` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_business.customers` | Adopt with tenant_id | `harness_business.customers` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_business.contracts` | Adopt with tenant_id | `harness_business.contracts` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_business.users` | Adopt with tenant_id + role mapping | `harness_business.users` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_business.inventory` | Reconcile with spare parts | `harness_spare_parts.spare_pool_entitlements` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_business.warranties` | Adopt with tenant_id | `harness_business.warranties` | [ ] Approve [ ] Reject [ ] Modify |
| `harness_business.sops` | Map to knowledge documents | `harness_knowledge.documents` | [ ] Approve [ ] Reject [ ] Modify |

### D-02: Embedding Dimension Strategy

**Question**: What embedding dimension should `vendor_manuals` use?

| Option | Dimension | Model | Pros | Cons |
|--------|-----------|-------|------|------|
| A | 1024 | bge-m3 (local) | Matches OpenClaw; no API cost | Requires GPU for local inference |
| B | 1536 | text-embedding-3-small | Matches Harness default; cloud | API cost; vendor lock-in |
| C | Dual | Both | Flexibility | Complexity; storage overhead |

**Owner Decision**: [ ] Option A [ ] Option B [ ] Option C [ ] Other: __________

### D-03: Tenant Assignment

**Question**: OpenClaw MVP has no `tenant_id`. Which tenant should adopted data belong to?

- [ ] Single default tenant (create one catch-all tenant)
- [ ] Multiple tenants (requires manual mapping per record)
- [ ] Reject adoption until OpenClaw data has explicit tenant assignment

### D-04: Data Retention for Staging

**Question**: How long should staged records remain in `harness_import_staging` after adoption?

- [ ] 30 days
- [ ] 90 days
- [ ] 1 year
- [ ] Indefinite (for full lineage)
- [ ] Other: __________

### D-05: Retraction Permission

**Question**: Who can authorize retraction of an adopted batch?

- [ ] Only the original importer
- [ ] Any `data_steward` role
- [ ] Any `admin` role
- [ ] Dual approval (importer + admin)
- [ ] Other: __________

### D-06: GPU Fault Dictionary Completeness

**Question**: OpenClaw seed data covers 10 entries. Should we block adoption until full GPU model coverage?

- [ ] Yes, expand seed data to all models before adoption
- [ ] No, adopt current seed data and expand later
- [ ] Reject gpu_fault_dict adoption entirely

### D-07: Devices Reconciliation Strategy

**Question**: `harness_business.devices` (OpenClaw) vs `harness_asset.devices` (Harness) have different schemas. How to reconcile?

- [ ] Migrate OpenClaw devices to `harness_asset.devices` with schema alignment
- [ ] Keep separate tables and create a view
- [ ] Reject device adoption until schema unified

## 3. Approval Workflow

```
Owner reviews this document
    |
    v
Owner makes decisions (check boxes / fill blanks)
    |
    v
Owner signs with UUID reference or ADR
    |
    v
Update owner_decision_ref in addendum receipt
    |
    v
If all B6 minimum evidence present -> accepted_for_rehearing_review
If not -> remain incomplete
```

## 4. Contact

- **Evidence Package Location**: `/opt/harness/docs/norms-archive/openclaw-codex-gate-refs/b6-owner-evidence/`
- **Base Receipt**: `/root/docs/tasks/tk-20260506-001/artifacts/owner-evidence-20260510-b6-openclaw-sql-reference-001.yaml`
