# Robustness and Vulnerability Review Report

**Target**: H1-H6 robustness fixes + full spec architecture scan
**Reviewer**: agent-robustness
**Date**: 2026-04-30

---

## Part 1: H1-H6 Fix Verdicts

### H1: registry.yaml version fields

**Verdict: Conditional Pass**

What works: each contract has a version field and comments explain snapshot semantics.

Critical gaps:
1. No enforcement mechanism. The 00-task-state.yaml template does NOT contain a contract_versions_snapshot field.
2. No changelog section in registry.yaml for tracking what changed between versions.
3. All versions hardcoded to 1 with no semver or previous_version tracking.

Required fix: Add contract_versions_snapshot to 00-task-state.yaml template, add changelog to registry.yaml, refuse phase advance if snapshot is empty.

---

### H2: Cross-project isolation

**Verdict: Conditional Pass**

What works: nearest CLAUDE.md wins rule handles basic case.

Gaps:
1. Ambiguity on what nearest means when multiple .claude/CLAUDE.md exist.
2. No isolation verification checker.
3. No monorepo guidance.

Required fix: Define explicit precedence order, add loaded_contracts_origin field to 00-task-state.yaml.
---

### H3: Stage 7 test failure rollback path

**Verdict: Fail**

What exists: CLAUDE.md gives two examples, workflow-spec has 5-row rollback table.

Uncovered rollback scenarios:
- Business logic errors: no mapping (should go to Stage 6)
- Data model errors: no mapping (should go to Stage 2)
- PRD/requirement incomplete: no mapping (should go to Stage 3)
- Test infrastructure failure: no retry vs rollback distinction
- Document quality insufficient: no mapping
- Acceptance user rejection: no mapping (should go to clarify or research)

Required fix: Expand rollback table, add decision tree, distinguish structural rollbacks from transient retries.

---

### H4: Spec feedback loop

**Verdict: Fail**

What exists: YAML format defined, closeout checks for open items.

Critical gaps:
1. Write-only system with no owner, process, or SLA for resolution.
2. No triage process defined.
3. feedback.md file does not exist (not pre-created).
4. Feedback vs Exception boundary undefined.

Required fix: Pre-create feedback.md, add triage step, define lifecycle, link to contract changelog.

---

### H5: Rule 1 research exemption

**Verdict: Fail**

What exists: Exemption for confirmed no external references, requires listing search keywords.

Critical gaps:
1. No proof-of-search requirement. Agent can fabricate keywords.
2. No minimum search threshold defined.
3. Self-certified exemption with no reviewer verification.
4. Too broad - even internal projects have reference patterns.

Required fix: Require 3+ search queries across 2+ sources, subject to Rule 2 reviewer verification, narrow language.

---

### H6: non-file-artifacts directory

**Verdict: Conditional Pass**

What exists: artifact-log.yaml structure with examples for database_migration and env_config.

Gaps:
1. No enumerated artifact kinds, free-form kind field enables inconsistent naming.
2. Missing common kinds: cron_job, api_endpoint, third_party_service, dns_cdn_config, deployed_url, screenshot, file_permissions, seed_data, cache_warmup.
3. No verification enforcement, verification field is self-reported.

Required fix: Define enumerated kind list with custom escape hatch, add verification_status field, require closeout evidence of verification.

---

## Part 2: Additional Vulnerabilities

### V1: Unenforced Contract Dependency Graph (Severity: High)

File: registry.yaml
All 22 contracts have conflicts_with empty except exception-governance. Potential unmarked conflicts:
- document-depth vs completeness-audit: both define maturity thresholds
- cluster-orchestration vs context-governance: both define parallelism rules
- task-tracking vs task-tracking-workflow: both define phase machines
Required fix: Audit all 22 contracts pairwise for scope overlap. Mark or resolve.

---

### V2: Missing Atomic State Update Semantics (Severity: High)

File: task-tracking-contract.md
When updating 00-task-state.yaml, multiple fields change simultaneously with no atomic update mechanism. Agent crash mid-update creates dirty data.
Required fix: Add two-phase update protocol (temp file then rename). Add dirty-hygiene check for state file integrity after writes.

---

### V3: Contradictory Maturity Thresholds (Severity: Medium)

Files: CLAUDE.md Rule 6 vs completeness-audit-spec.md
CLAUDE.md: process/spec >= 2000 words (no percentage). completeness-audit-spec.md: process/spec >= 2000 words OR 50 percent of source.
Learning report, architecture breakdown, PRD thresholds only in spec, not in CLAUDE.md.
Required fix: Consolidate thresholds into single source. CLAUDE.md should reference that source.

---

### V4: No Contract Deprecation Lifecycle (Severity: Medium)

File: registry.yaml
States: draft-ready, provisional, active. Missing deprecated and superseded.
Required fix: Add deprecated and superseded_by fields. Define lifecycle: active - deprecated - archived.

---

### V5: Ambiguous Contract Load Order (Severity: Medium)

File: registry.yaml
depends_on graph is acyclic but loading order ambiguous when multiple contracts triggered. Transitive deps may be missing from activation set.
Required fix: Define topological sort rule. Cross-reference context-governance slice loading with dependency graph.

---

### V6: Checklist/Checker Duplication (Severity: Low)

Files: review-consistency-checklist.md and verification-checker.md
Both list same 10+ check items with identical names.
Required fix: Make checklist reference checker catalog by ID.

---

### V7: Combined Stage 4-5 Checklist (Severity: Low)

File: stage4-5-plan-review.md
Stage 4 (design) and Stage 5 (plan) share one checklist despite different review focuses.
Required fix: Split or clearly separate sections.

---

### V8: No Integrity Protection for Truth Sources (Severity: Medium)

File: task-tracking-contract.md
No checksum or hash mechanism for truth source files. No tampering detection.
Required fix: For Complex tasks, store SHA-256 hashes of truth sources in task state after each write.

---

### V9: Escalation Route Missing Values (Severity: Low)

File: task-routing-contract.md
escalation_route defines normal, needs_user_decision, blocked. Missing needs_scope_change and needs_architecture_review.
Required fix: Add missing values or map to phase rollback mechanism.

---

## Part 3: Summary

### H1-H6 Verdict Summary

| Fix | Verdict | Severity |
|---|---|---|
| H1: Contract versioning | Conditional Pass | Medium |
| H2: Cross-project isolation | Conditional Pass | Low |
| H3: Stage 7 rollback | **Fail** | High |
| H4: Spec feedback loop | **Fail** | Medium |
| H5: Research exemption | **Fail** | High |
| H6: Non-file artifacts | Conditional Pass | Low |

### New Findings Summary

| ID | Issue | Severity |
|---|---|---|
| V1 | Unenforced contract dependency/conflict graph | High |
| V2 | Non-atomic state file updates | High |
| V3 | Contradictory maturity thresholds | Medium |
| V4 | No contract deprecation lifecycle | Medium |
| V5 | Ambiguous contract load order | Medium |
| V6 | Checklist/checker catalog duplication | Low |
| V7 | Combined Stage 4-5 checklist | Low |
| V8 | No integrity protection for truth sources | Medium |
| V9 | Escalation route missing values | Low |

### Overall Verdict

Three of six H-fixes are not yet sufficient:

1. H3 (rollback) is incomplete. Workflow spec table needs expansion for all failure types. Decision tree needed to distinguish structural rollbacks from transient retries.
2. H4 (feedback) is write-only with no ownership or lifecycle. Needs triage process, state machine, and linkage to contract versioning.
3. H5 (research exemption) is easily exploitable. Requires proof-of-search, reviewer verification, and narrower language.

The remaining three (H1, H2, H6) are directionally correct but need implementation hardening.

Beyond H1-H6, 9 additional findings include 2 High-severity issues (unenforced dependency graph V1, non-atomic state updates V2) that should be addressed before declaring the spec architecture production-ready.
