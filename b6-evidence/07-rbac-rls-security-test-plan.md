# 07: RBAC / RLS Security Test Plan

> Scope: B6 owner evidence (docs-only)
> Purpose: Define security tests for the import/adoption pipeline

## 1. Threat Model

| Threat | Mitigation |
|--------|------------|
| T1: Unauthorized user triggers adoption | RBAC: only `data_steward` or `admin` role can adopt |
| T2: Tenant A data leaks into Tenant B | RLS: staging and formal tables enforce tenant isolation |
| T3: Staging data exfiltrated | RBAC: `import_staging` schema read restricted to adopters |
| T4: Audit log tampered | RBAC: `adoption_audit_log` is append-only, no UPDATE/DELETE grants |
| T5: PII leaked during import | Validation: dry-run scans for unexpected PII |
| T6: Malformed payload causes SQL injection | Validation: all payloads parsed as JSONB, never interpolated |

## 2. RBAC Matrix

| Role | Create Batch | Read Staging | Approve | Adopt | Retract | Read Audit | Read Reverse Index |
|------|-------------|--------------|---------|-------|---------|-----------|-------------------|
| `engineer` | Yes | Own tenant only | No | No | No | Own tenant only | Own tenant only |
| `data_steward` | Yes | Own tenant only | Yes | Yes | Yes | Own tenant only | Own tenant only |
| `admin` | Yes | All tenants | Yes | Yes | Yes | All tenants | All tenants |
| `auditor` | No | All tenants (read) | No | No | No | All tenants | All tenants |
| `external_system` | Yes (API key) | No | No | No | No | No | No |

## 3. RLS Policies (Draft)

```sql
-- Staging tables: tenant-scoped read
ALTER TABLE harness_import_staging.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_import_batches ON harness_import_staging.import_batches
    FOR ALL TO harness_app_user
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

ALTER TABLE harness_import_staging.staged_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_staged_records ON harness_import_staging.staged_records
    FOR ALL TO harness_app_user
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Reverse index: tenant-scoped read
ALTER TABLE harness_import_staging.reverse_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_reverse_index ON harness_import_staging.reverse_index
    FOR ALL TO harness_app_user
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Audit log: tenant-scoped read, no write for app user
ALTER TABLE harness_import_staging.adoption_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_audit_read ON harness_import_staging.adoption_audit_log
    FOR SELECT TO harness_app_user
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

## 4. Security Test Cases

### TC-S01: Tenant Isolation

```gherkin
Given Tenant A has batch BA with staged records
And Tenant B has batch BB with staged records
When Tenant A's data_steward queries harness_import_staging.staged_records
Then only records from BA are returned
And records from BB are NOT visible
```

### TC-S02: Unauthorized Adoption

```gherkin
Given an engineer user with role "engineer"
And a validated batch exists
When the engineer attempts to execute adoption
Then the action is rejected with HTTP 403
And no formal table rows are modified
```

### TC-S03: Audit Log Immutability

```gherkin
Given an existing adoption_audit_log row
When any user (including admin) attempts to UPDATE or DELETE it
Then the database rejects the operation
```

### TC-S04: PII Detection in Dry-Run

```gherkin
Given a staged record with payload containing an email address in a non-PII column
When dry-run validation executes
Then the validation status is "warn"
And the warning message flags unexpected PII
```

### TC-S05: SQL Injection Resistance

```gherkin
Given a staged record with payload containing SQL keywords
When the record is parsed
Then it is treated as JSONB text
And no SQL execution occurs from payload content
```

### TC-S06: Cross-Tenant FK Rejection

```gherkin
Given a staged record references a formal record from another tenant
When dry-run FK validation executes
Then the validation fails with "cross-tenant FK violation"
```

## 5. Security Test Execution Plan

| Test | Type | Environment | Frequency |
|------|------|-------------|-----------|
| TC-S01 | Integration | Staging DB | Per deployment |
| TC-S02 | Integration | Staging DB | Per deployment |
| TC-S03 | Unit | CI | Every PR |
| TC-S04 | Unit | CI | Every PR |
| TC-S05 | Unit | CI | Every PR |
| TC-S06 | Integration | Staging DB | Per deployment |

## 6. Compliance Mapping

| Control | Evidence |
|---------|----------|
| Access control (ISO 27001 A.9.1.2) | RBAC matrix + RLS policies |
| Audit logging (ISO 27001 A.12.4) | adoption_audit_log design + immutability tests |
| Data integrity (ISO 27001 A.12.2) | Dry-run validation + hash verification |
| Tenant isolation (SOC 2 CC6.1) | RLS policy specs + TC-S01 results |
