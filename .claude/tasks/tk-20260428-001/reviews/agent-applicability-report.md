# Applicability Fixes Review Report (N1-N4)

**Date**: 2026-04-30
**Reviewer**: Applicability and Scalability Review Agent
**Scope**: Four contract fixes (N1-N4) targeting task-size applicability
**Input files**:
- completeness-audit-spec.md (N1)
- work-packet-governance.md (N2)
- review-gates-contract.md (N3)
- document-depth.md (N4)

---

## N1: completeness-audit-spec.md -- Dual-Threshold Model

**Change**: Line 2 of maturity gate replaces absolute word counts with dual-threshold (>=X words OR >=source Y%, take higher), plus a note that for Trivial/lightweight Standard tasks, the percentage threshold takes priority over the absolute floor.

**Verdict: Conditional Pass**

### What works
- The dual-threshold model correctly prevents both under-writing for large sources (percentage floor kicks in) and over-filling for small sources (absolute floor prevents absurd ratios). Example: for a 10,000-word source, 60% = 6,000 words (higher than the 3,000-word floor); for a 1,000-word source, 60% = 600 words, but the 3,000-word absolute floor still applies for Standard tasks.
- The note for Trivial/lightweight Standard tasks is a necessary escape valve.

### Issues requiring fix

**Issue 1 (Medium -- ambiguity in percentage priority for small tasks)**
The note says percentage takes priority but does not state whether the absolute word count floor is waived or merely deprioritized. This creates an operational ambiguity: for a 100-word source with a contract/spec document, 60% = 60 words versus 3,000-word absolute floor. An agent interpreting priority as use whichever is higher would still be forced to 3,000 words -- defeating the purpose.

Required fix: The note should use unambiguous language. Replace with:
> For small tasks (Trivial/lightweight Standard), the absolute word count thresholds are not hard requirements; only the source material percentage applies. When the percentage result is far below the absolute threshold, the percentage takes precedence.

**Issue 2 (Minor -- inconsistency between spec table and checklist)**
The spec table lists contract/spec as one row, but the checklist (completeness-audit.md) splits this into contract/spec category and process/spec category with different thresholds (3,000 vs 2,000 words). The checklist wording is confusingly overlapping.

Required fix: Align checklist terminology with the spec table.

**Issue 3 (Low -- no upper bound on percentage)**
For a 100,000-word source, 60% = 60,000 words. The dual-threshold model has no ceiling.

Recommended (not required): Add a practical upper bound for extreme source sizes.
---

## N2: work-packet-governance.md -- Standard Task Simplification

**Change**: Section 2 line 1 allows Standard tasks to simplify from 12 layers to 6-8 core layers. Non-core layers marked as not_applicable or deferred with justification.

**Verdict: Conditional Pass**

### What works
- The simplification principle is sound -- not every Standard task needs full 12-layer coverage.
- The 6 named core layers cover the essential request-to-response flow for a typical layered web app.
- The requirement to mark omitted layers with reasoning provides traceability.

### Issues requiring fix

**Issue 1 (Major -- architecture pattern lock-in)**
The 12-layer model is explicitly modeled on a layered web application pattern (DTO to DAO to Service to Controller to DI wiring). The 6 core layers inherit this same bias. The spec provides no guidance for tasks that do not fit this pattern:
- A database migration script: no controller, no DTO, no service interface.
- A cron job / scheduled task: no request/response contracts, no controller.
- An infrastructure provisioning task (Terraform): none of the 12 layers directly apply.
- A documentation-only task: no code layers apply.
- A pure data analysis script: no service layer, no controller.

Required fix: Add a layer mapping clause to section 2 that addresses non-web-app tasks:
> The above 12 layers assume a layered web application as the default model. For non-typical architecture tasks (scripts, data migration, infrastructure, documentation-only), the minimum granularity should be functional units, mapping the 12 layers to actually applicable levels: input contract (Req/external data), processing logic, output contract (Res/result), verification (test), observability (log/monitor). The mapping must be declared in the work packet.

**Issue 2 (Medium -- 6-8 layers is vague)**
The spec says 6-8 layers but only names exactly 6.

Required fix: Specify which layers constitute the 7-layer and 8-layer variants:
> 6-layer: the 6 named core layers. 7-layer: adds integration wiring (DI/config). 8-layer: adds observability (log/audit/metric/alert).

**Issue 3 (Medium -- no explicit guidance on deferred vs not_applicable)**
The spec allows marking non-core layers as either not_applicable or deferred but does not define when to use which.

Required fix: Add a decision rule:
> not_applicable: the layer concept does not exist in this task type (e.g., script tasks have no Controller). deferred: the concept exists but is not implemented this round; must be recorded in task state as deferred_item with planned implementation phase.
---

## N3: review-gates-contract.md -- Required/Optional Bundle Labeling

**Change**: Section 4 labels bundle files as [required] vs [optional]. 05-value-evidence is marked [optional].

**Verdict: Pass**

### What works
- The [required]/[optional] labeling is clear and executable.
- The 4 required files (00-user-intent, 01-truth-sources, 02-review-rubric, 03-hard-fail-rules, 04-scope-boundary) are the minimum set needed for any review.
- Making 05-value-evidence optional does NOT create a gap in value gate verification because the Value Gate definition is based on 00-user-intent.md observable_success field, which is a [required] file.
- The labeling is consistent with the existing value gate logic.

### Issues (none blocking)

**Observation 1 (Minor)**: The phrase about PRD and delivery tasks is slightly ambiguous about which stages count as delivery.
Recommended (not required): Reference the 7-stage model explicitly (Stage 3 PRD and Stage 6+).

**Observation 2 (Minor)**: The bundle README requirement assumes a README exists in the bundle directory. The spec does not mandate one.
Recommended (not required): Either mandate a minimal bundle README or allow the omission reason in an existing file.

---

## N4: document-depth.md -- not_applicable Confidentiality Level

**Change**: Section 6 adds not_applicable as a confidentiality level, equivalent to internal.

**Verdict: Conditional Pass**

### What works
- Pragmatically useful for single-developer projects or experimental code.
- The equivalence to internal prevents abuse.
- Reduces friction for adoption without reducing protection.

### Issues requiring fix

**Issue 1 (Medium -- risk of lazy classification)**
The description is subjective. An agent could apply not_applicable to any document it does not want to classify, including documents that genuinely should be project_confidential.

Required fix: Narrow the scope:
> not_applicable: Only for pure personal projects (single developer, no team collaboration, no business-sensitive data) or experimental code. Not applicable to any project documents involving business data, user information, or commercial logic. Such documents should use internal or project_confidential.

**Issue 2 (Low -- registry.yaml not updated)**
The document-depth contract in registry.yaml is still at version 1.
Recommended: Update document-depth entry in registry.yaml to version 2.

---

## Additional Applicability Issues Not in Original List

### Issue A1: Trivial tasks are under-constrained across all four contracts
None of the four fixes define what Trivial tasks should do. The contracts have no Trivial-mode despite CLAUDE.md saying Trivial tasks are exempt.
Recommendation: Add a Trivial mode footnote to each contract specifying the minimal applicable subset.

### Issue A2: No cross-contract consistency for lightweight Standard
completeness-audit-spec.md introduces lightweight Standard as a sub-category. No other contract recognizes it.
Recommendation: Either define lightweight Standard formally or remove the term.

### Issue A3: document-depth maturity targets not referenced by completeness-audit thresholds
The two systems are related but not explicitly linked.
Recommendation: Add a mapping between maturity targets and word count thresholds.

---

## Summary Table

| Fix | Verdict | Critical | Major | Minor | Recommended |
|-----|---------|----------|-------|-------|-------------|
| N1 (dual-threshold) | Conditional Pass | - | 1 (ambiguity in small-task waiver) | 1 (checklist inconsistency) | 1 (no upper bound) |
| N2 (WP simplification) | Conditional Pass | - | 2 (arch pattern lock-in, deferred vs n/a) | 1 (6-8 not explicit) | - |
| N3 (bundle labeling) | Pass | - | - | 1 (trigger criteria vague) | 1 (README requirement) |
| N4 (not_applicable) | Conditional Pass | - | 1 (lazy classification risk) | - | 1 (registry version) |

**Overall verdict**: The four fixes are directionally correct. However, N1, N2, and N4 each have at least one Medium-severity issue that should be fixed before declaring them production-ready. N3 is acceptable as-is.

**Risk if shipped without fixes**:
- N1: Agents may still over-write for small tasks or under-justify deviations.
- N2: Non-web-app tasks will have no clear layer-mapping guidance, leading to inconsistent work packet structures.
- N4: Agents may over-use not_applicable to avoid classifying sensitive documents.
