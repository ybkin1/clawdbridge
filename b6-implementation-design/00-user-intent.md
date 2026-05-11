# User Intent: B6 Implementation Design

## Background

B6 gate (Data Import / Staging / Adoption / Rollback) has passed rehearing review.
Owner ADR-B6-001 approved 11 OpenClaw tables for adoption into Harness formal tables.

## Goal

Produce a detailed implementation design for:
1. `harness_import_staging` schema and tables
2. OpenClaw export bundle ingestion pipeline
3. Dry-run validation engine
4. Adoption state machine (staged -> validated -> approved -> adopted)
5. Reverse index and lineage tracking
6. Rollback / retract contract
7. RBAC / RLS integration

## Scope

### In Scope
- Implementation design documents (L0-L4 decomposition)
- Sprint 1 development plan
- Interface contracts (MCP Server methods, NATS events, REST APIs)
- Data model refinement
- Test plan for adoption pipeline

### Out of Scope
- Product code implementation (next sprint)
- Formal DDL migration execution (next sprint)
- Actual OpenClaw data import (next sprint)
- Frontend UI changes
- Changes to non-B6 modules

## Constraints
- Must follow Harness Lego Assembly Workflow
- Must align with harness-architecture-patch-v1.md schema definitions
- Must preserve B6 guardrails (staging layer, owner decision, reverse index, rollback)
- Must be tenant-scoped
