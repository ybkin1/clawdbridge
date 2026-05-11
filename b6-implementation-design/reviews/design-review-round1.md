# Design Review Round 1 — Sprint 1 Dev Plan (tk-20260510-002)

> Reviewer: independent-design-reviewer
> Date: 2026-05-10
> Target: `09-dev-plan.md`
> Scope: B6 Implementation Design
> Source of Truth: `harness-detailed-design-v1.md` v5.2, `harness-architecture-patch-v1.md` v1.0

---

## 1. Review Checklist

### 1.1 Lego Decomposition

| Level | Check | Status |
|-------|-------|--------|
| L0 | Product identified | ✅ Harness 售后智能平台 |
| L1 | Module boundary clear | ✅ `data_import` with explicit neighboring modules |
| L2 | Components ≤ 10, responsibilities disjoint | ✅ 7 components, no overlap |
| L3 | Units cover all B6 requirements | ✅ 20 units map to 6 B6 minimum evidences |
| L4 | Code blocks have method signatures | ✅ All 7 components have async signatures |

**Finding**: L1 module name `data_import` is not in architecture patch v1.0. However, B6 is a new cross-cutting concern and a dedicated module is appropriate.

**Verdict**: Pass

### 1.2 Architecture Alignment

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Schema naming | `harness_*` prefix | `harness_import_staging` | ✅ Pass |
| Tenant scoping | `tenant_id` on all tenant-scoped tables | Present on all 4 staging tables | ✅ Pass |
| RLS design | `ENABLE ROW LEVEL SECURITY` + policies | Defined in WP-8 + test plan | ✅ Pass |
| NATS event naming | `event.{domain}.{action}` | `event.import.batch_created` etc. | ✅ Pass |
| MCP server pattern | `pg_server` extension methods | `ImportMcpServer` with 9 methods | ✅ Pass |
| REST API pattern | `POST/GET/DELETE /api/{resource}` | Consistent with Harness API style | ✅ Pass |
| Audit immutability | Append-only, no UPDATE/DELETE | `adoption_audit_log` append-only | ✅ Pass |

**Cross-Reference with Detailed Design**:
- `harness-detailed-design-v1.md` §17.4 defines RLS with `harness_user_scopes` + `role_level`. Dev plan does not explicitly reference this existing RLS infrastructure.
- `harness-detailed-design-v1.md` §14 defines `harness_audit.audit_logs` with hash chain. Dev plan's `adoption_audit_log` is separate but should reference `harness_audit` schema for consistency.

**Verdict**: Conditional Pass (minor integration gap with existing RLS/audit infrastructure)

### 1.3 Interface Contracts Completeness

| Interface | Count | Coverage | Status |
|-----------|-------|----------|--------|
| REST API | 9 endpoints | CRUD + dry-run + approve + adopt + retract + lineage | ✅ Pass |
| NATS Events | 5 events | batch_created, dry_run_completed, approved, adopted, retracted | ✅ Pass |
| MCP Methods | 9 methods | All operations exposed via MCP | ✅ Pass |

**Finding**: No WebSocket events defined for real-time dry-run progress or adoption status updates. Not required for MVP but worth noting for future.

**Verdict**: Pass

### 1.4 Database Design

| Check | Status | Notes |
|-------|--------|-------|
| Primary keys (UUID) | ✅ | All tables use `gen_random_uuid()` |
| Foreign keys | ✅ | Proper FK constraints with CASCADE where appropriate |
| Indexes for query patterns | ✅ | 7 indexes covering all major query paths |
| JSONB for flexible payload | ✅ | `staged_records.payload` is JSONB |
| No FK from staging to formal | ✅ | Staging is droppable independently |
| Partitioning | ⚠️ | `metrics_snapshots` in formal schema needs RANGE partition; staging tables do not need partition |

**Finding**: `staged_records` table stores full JSONB payload per record. For large bundles (e.g., 100K fault logs), this could cause table bloat. Consider adding `TOAST` compression or a `staged_record_chunks` table for very large payloads.

**Verdict**: Conditional Pass (storage efficiency concern)

### 1.5 Work Package Dependencies

| WP | Effort | Dependencies | Risk |
|----|--------|-------------|------|
| WP-1 DDL | 2d | Sprint 0 | Low |
| WP-2 Parser | 2d | WP-1 | Low |
| WP-3 Validator | 3d | WP-1 | Medium (complex rules) |
| WP-4 State Machine | 3d | WP-3 | Medium (state transitions) |
| WP-5 Reverse Index | 2d | WP-4 | Low |
| WP-6 Rollback | 2d | WP-4 | Medium (transaction safety) |
| WP-7 Audit Logger | 1d | WP-1 | Low |
| WP-8 RBAC/RLS | 2d | WP-1~WP-7 | Medium (integration with existing RLS) |
| WP-9 REST API | 2d | WP-1~WP-8 | Low |
| WP-10 Integration Tests | 3d | WP-1~WP-9 | Medium |
| **Total** | **22d** | | |

**Finding**: WP-8 RBAC/RLS Integration has a dependency gap. It depends on WP-1~WP-7 but also needs to integrate with existing `harness_user_scopes` and `harness_roles` tables from Sprint 0. This integration effort is underestimated at 2d.

**Suggested Adjustment**: Increase WP-8 to 3d and add a dependency on `harness_user_scopes` DDL from Sprint 0.

**Verdict**: Conditional Pass (effort adjustment recommended)

### 1.6 File Ownership

| Check | Status |
|-------|--------|
| New files in dedicated directory | ✅ `src/modules/data_import/` |
| Test files co-located | ✅ `tests/` subdirectory |
| API routes in `src/api/routes/` | ✅ `import.py` |
| NATS subscribers in `src/lib/nats/subscribers/` | ✅ `import_subscriber.py` |
| SQL migrations in `sql/` | ✅ `sprint1_import_staging.sql` |
| No orphan files | ✅ All files have clear ownership |

**Finding**: `src/lib/database.py` is listed as "modified" but no specific modification is described. Need to specify: add `harness_import_staging` schema initialization to existing database connection setup.

**Verdict**: Pass (with clarification request)

### 1.7 Acceptance Criteria

| Category | Count | Verifiable? | Status |
|----------|-------|-------------|--------|
| Functional | 7 | Yes (integration tests) | ✅ Pass |
| Non-Functional | 5 | Yes (unit + integration tests) | ✅ Pass |
| B6 Guardrails | 5 | Yes (code review + tests) | ✅ Pass |

**Finding**: Missing acceptance criterion for "performance under large bundle". Should add: "Bundle of 10K records processes within 60 seconds".

**Verdict**: Conditional Pass (missing performance AC)

### 1.8 Risk and Mitigation

| Risk | Mitigation Adequate? | Status |
|------|---------------------|--------|
| Schema drift | Versioning + strict validation | ✅ Pass |
| Memory pressure | Stream-parse + chunked insert | ✅ Pass |
| Adoption crash | Transaction + idempotency | ✅ Pass |
| Cross-tenant leak | RLS + dry-run validation | ✅ Pass |
| Retraction of shared records | Reverse index shows all batches | ✅ Pass |
| Owner decision bottleneck | Async approval + notification | ✅ Pass |

**Missing Risks**:
1. **Staging table bloat**: `staged_records` JSONB column grows unbounded. Mitigation: periodic archival or cleanup after retention period.
2. **Embedding dimension mismatch**: `vendor_manuals` uses 1024 (bge-m3) but Harness default is 1536 (text-embedding-3-small). Mitigation: Owner ADR-B6-001 already decided on 1024, but migration path to 1536 should be documented.
3. **NATS event replay**: If `event.import.batch_adopted` is replayed, consumers may double-process. Mitigation: Add idempotency key to event payload.

**Verdict**: Conditional Pass (3 missing risks)

### 1.9 Rollback Strategy

| Check | Status |
|-------|--------|
| Code rollback path | ✅ `git revert` or drop `src/modules/data_import/` |
| Database rollback path | ✅ `DROP SCHEMA harness_import_staging CASCADE` |
| No formal data risk before adoption | ✅ True by design |
| Audit preservation during rollback | ✅ `adoption_audit_log` append-only |

**Finding**: Rollback strategy does not cover "partial adoption" scenario (e.g., crash after 50% of batch adopted). The design says "atomic adoption" but does not specify the transaction boundary mechanism (single DB transaction vs. application-level compensating transactions).

**Verdict**: Conditional Pass (transaction boundary clarification needed)

---

## 2. Findings Summary

### Critical (0)

None.

### Major (0)

None.

### Minor (6)

| ID | Finding | Location | Suggested Fix |
|----|---------|----------|---------------|
| M-01 | Dev plan does not explicitly reference existing `harness_user_scopes` / `harness_roles` RLS infrastructure from Sprint 0 | WP-8 | Add integration note with existing RLS tables |
| M-02 | `adoption_audit_log` should reference `harness_audit` schema design for consistency | §3 | Add cross-reference to harness_audit.audit_logs hash chain |
| M-03 | `staged_records` JSONB payload may cause table bloat for large bundles | §3 | Add TOAST note or consider chunked storage |
| M-04 | WP-8 effort underestimated (2d → 3d); missing dependency on Sprint 0 RLS tables | §5 | Adjust estimate and add dependency |
| M-05 | Missing performance acceptance criterion | §7 | Add: "10K record bundle processes within 60s" |
| M-06 | 3 missing risks (staging bloat, embedding mismatch, NATS replay) | §8 | Add to risk table |

### Clarification Requests (2)

| ID | Question | Location |
|----|----------|----------|
| C-01 | How is "atomic adoption" enforced — single DB transaction or application-level? | WP-4, WP-6 |
| C-02 | What is the specific modification to `src/lib/database.py`? | §6 |

---

## 3. Verdict

| Criterion | Result |
|-----------|--------|
| Lego decomposition | Pass |
| Architecture alignment | Conditional Pass (M-01, M-02) |
| Interface contracts | Pass |
| Database design | Conditional Pass (M-03) |
| Work packages | Conditional Pass (M-04) |
| File ownership | Pass (C-02) |
| Acceptance criteria | Conditional Pass (M-05) |
| Risk coverage | Conditional Pass (M-06) |
| Rollback strategy | Conditional Pass (C-01) |

**Overall Verdict**: `conditional_pass`

The design is sound and ready for implementation with minor corrections. The 6 Minor findings and 2 Clarification Requests should be addressed before implementation begins, but they do not require a full design rewrite.

**Recommended Action**:
1. Fix M-01 through M-06 in dev plan (estimated: 2 hours).
2. Answer C-01 and C-02 in dev plan (estimated: 1 hour).
3. No re-review required if fixes are mechanical and do not change architecture.
4. Proceed to implementation authorization.

---

## 4. Reviewer Provenance

```yaml
reviewer: independent-design-reviewer
review_type: implementation_design_review
review_round: 1
verdict: conditional_pass
blocking_findings: 0
non_blocking_findings: 6
clarification_requests: 2
reviewed_at: "2026-05-10T15:00:00+08:00"
```

---

## 5. Next Steps

1. **Address findings M-01~M-06** in dev plan.
2. **Answer C-01, C-02** in dev plan.
3. **Owner authorizes implementation** (updates `implementation_allowed: true` in task state).
4. **Begin Sprint 1 execution** per work packages WP-1~WP-10.
