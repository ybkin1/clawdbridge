-- Sprint 1 Migration: Hardware Fault Analysis Tables
-- Task: tk-20260510-002-b6-implementation-design
-- Scope: OpenClaw fault_core schema adaptation into harness_hardware
-- Depends On: Sprint 0 (harness_business.tenants, harness_assets.asset_registry, harness_business.users)
-- Author: code-agent
-- Reviewed By: data-worker

-- =============================================================================
-- 0. Schema
-- =============================================================================

-- harness_hardware schema already created in Sprint 0
-- Confirm schema exists (idempotent)
CREATE SCHEMA IF NOT EXISTS harness_hardware;

-- =============================================================================
-- 1. slot_bindings
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.slot_bindings (
  id BIGSERIAL PRIMARY KEY,
  slot_binding_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  host_system_asset_id UUID NOT NULL REFERENCES harness_assets.asset_registry(id),
  component_asset_id UUID NOT NULL REFERENCES harness_assets.asset_registry(id),
  slot_name TEXT NOT NULL,
  service_label TEXT,
  slot_type TEXT NOT NULL,
  location_path JSONB NOT NULL DEFAULT '{}',
  mounted_at TIMESTAMPTZ NOT NULL,
  unmounted_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES harness_business.users(id),
  updated_by UUID REFERENCES harness_business.users(id),
  CONSTRAINT uq_slot_bindings_uuid UNIQUE (slot_binding_uuid)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_bindings_active_slot
  ON harness_hardware.slot_bindings (tenant_id, host_system_asset_id, slot_name)
  WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_bindings_active_component
  ON harness_hardware.slot_bindings (tenant_id, component_asset_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_slot_bindings_host_mounted
  ON harness_hardware.slot_bindings (tenant_id, host_system_asset_id, mounted_at DESC);

CREATE INDEX IF NOT EXISTS idx_slot_bindings_tenant
  ON harness_hardware.slot_bindings (tenant_id);

-- =============================================================================
-- 2. fault_incidents (RANGE partitioned by fault_occurred_at)
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.fault_incidents (
  id BIGSERIAL,
  incident_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  system_asset_id UUID NOT NULL REFERENCES harness_assets.asset_registry(id),
  primary_component_asset_id UUID REFERENCES harness_assets.asset_registry(id),
  slot_binding_id BIGINT REFERENCES harness_hardware.slot_bindings(id),
  incident_source TEXT NOT NULL,
  detected_by_type TEXT,
  detected_by_id TEXT,
  fault_occurred_at TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  severity TEXT NOT NULL,
  fault_category TEXT NOT NULL,
  fault_code TEXT,
  fault_name TEXT NOT NULL,
  symptom_text TEXT NOT NULL,
  source_event_key TEXT,
  current_status TEXT NOT NULL,
  location_snapshot JSONB NOT NULL DEFAULT '{}',
  source_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES harness_business.users(id),
  updated_by UUID REFERENCES harness_business.users(id),
  PRIMARY KEY (id, fault_occurred_at)
) PARTITION BY RANGE (fault_occurred_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fault_incidents_uuid
  ON harness_hardware.fault_incidents (incident_uuid);

CREATE INDEX IF NOT EXISTS idx_fault_incidents_system_time
  ON harness_hardware.fault_incidents (tenant_id, system_asset_id, fault_occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_fault_incidents_component_time
  ON harness_hardware.fault_incidents (tenant_id, primary_component_asset_id, fault_occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_fault_incidents_status_detected
  ON harness_hardware.fault_incidents (tenant_id, current_status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_fault_incidents_external_ref
  ON harness_hardware.fault_incidents (external_ref)
  WHERE external_ref IS NOT NULL;

-- DEFAULT partition
CREATE TABLE IF NOT EXISTS fault_incidents_default PARTITION OF harness_hardware.fault_incidents DEFAULT;

-- Pre-create next 3 months partitions (maintenance task will create future ones)
-- NOTE: Adjust dates based on actual deployment date
-- CREATE TABLE fault_incidents_y2026m06 PARTITION OF harness_hardware.fault_incidents
--   FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- CREATE TABLE fault_incidents_y2026m07 PARTITION OF harness_hardware.fault_incidents
--   FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
-- CREATE TABLE fault_incidents_y2026m08 PARTITION OF harness_hardware.fault_incidents
--   FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- =============================================================================
-- 3. fault_evidences (RANGE partitioned by incident_occurred_at)
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.fault_evidences (
  id BIGSERIAL,
  evidence_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  incident_id BIGINT NOT NULL,
  incident_occurred_at TIMESTAMPTZ NOT NULL,
  evidence_type TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  source_system TEXT NOT NULL,
  source_uri TEXT,
  message_id TEXT,
  metric_name TEXT,
  metric_value_json JSONB,
  raw_payload_ref TEXT,
  summary_text TEXT NOT NULL,
  checksum TEXT,
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES harness_business.users(id),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  PRIMARY KEY (id, incident_occurred_at)
) PARTITION BY RANGE (incident_occurred_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fault_evidences_uuid
  ON harness_hardware.fault_evidences (evidence_uuid);

CREATE INDEX IF NOT EXISTS idx_fault_evidences_incident_time
  ON harness_hardware.fault_evidences (incident_id, observed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fault_evidences_dedupe
  ON harness_hardware.fault_evidences (tenant_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_fault_evidences_external_ref
  ON harness_hardware.fault_evidences (external_ref)
  WHERE external_ref IS NOT NULL;

-- DEFAULT partition
CREATE TABLE IF NOT EXISTS fault_evidences_default PARTITION OF harness_hardware.fault_evidences DEFAULT;

-- =============================================================================
-- 4. diagnosis_records
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.diagnosis_records (
  id BIGSERIAL PRIMARY KEY,
  diagnosis_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  incident_id BIGINT NOT NULL,
  diagnosis_at TIMESTAMPTZ NOT NULL,
  diagnosis_method TEXT NOT NULL,
  suspected_root_cause TEXT NOT NULL,
  root_cause_category TEXT,
  reasoning_summary TEXT NOT NULL,
  confidence_score NUMERIC(5,4),
  graph_query_ref TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  CONSTRAINT uq_diagnosis_records_uuid UNIQUE (diagnosis_uuid)
);

CREATE INDEX IF NOT EXISTS idx_diagnosis_records_incident_time
  ON harness_hardware.diagnosis_records (incident_id, diagnosis_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnosis_records_external_ref
  ON harness_hardware.diagnosis_records (external_ref)
  WHERE external_ref IS NOT NULL;

-- =============================================================================
-- 5. repair_actions
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.repair_actions (
  id BIGSERIAL PRIMARY KEY,
  action_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  incident_id BIGINT NOT NULL,
  action_seq INT NOT NULL,
  action_type TEXT NOT NULL,
  target_component_asset_id UUID REFERENCES harness_assets.asset_registry(id),
  replace_from_component_asset_id UUID REFERENCES harness_assets.asset_registry(id),
  replace_to_component_asset_id UUID REFERENCES harness_assets.asset_registry(id),
  executed_at TIMESTAMPTZ NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action_detail JSONB NOT NULL DEFAULT '{}',
  action_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  CONSTRAINT uq_repair_actions_incident_seq UNIQUE (incident_id, action_seq),
  CONSTRAINT uq_repair_actions_uuid UNIQUE (action_uuid)
);

CREATE INDEX IF NOT EXISTS idx_repair_actions_incident_time
  ON harness_hardware.repair_actions (incident_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_repair_actions_external_ref
  ON harness_hardware.repair_actions (external_ref)
  WHERE external_ref IS NOT NULL;

-- =============================================================================
-- 6. verification_checks
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.verification_checks (
  id BIGSERIAL PRIMARY KEY,
  check_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  incident_id BIGINT NOT NULL,
  action_id BIGINT REFERENCES harness_hardware.repair_actions(id),
  check_seq INT NOT NULL,
  check_type TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  actual_result TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL,
  verifier_type TEXT NOT NULL,
  verifier_id TEXT NOT NULL,
  pass_flag BOOLEAN NOT NULL,
  evidence_id BIGINT,
  check_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  CONSTRAINT uq_verification_checks_incident_seq UNIQUE (incident_id, check_seq),
  CONSTRAINT uq_verification_checks_uuid UNIQUE (check_uuid)
);

CREATE INDEX IF NOT EXISTS idx_verification_checks_incident_time
  ON harness_hardware.verification_checks (incident_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_checks_external_ref
  ON harness_hardware.verification_checks (external_ref)
  WHERE external_ref IS NOT NULL;

-- =============================================================================
-- 7. incident_results
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.incident_results (
  id BIGSERIAL PRIMARY KEY,
  result_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  incident_id BIGINT NOT NULL UNIQUE,
  concluded_at TIMESTAMPTZ NOT NULL,
  conclusion_code TEXT NOT NULL,
  root_cause_confirmed BOOLEAN NOT NULL,
  final_root_cause TEXT NOT NULL,
  repair_effectiveness TEXT,
  recurrence_risk TEXT,
  monitoring_window_hours INT,
  recommendation TEXT,
  closed_by_type TEXT NOT NULL,
  closed_by_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  CONSTRAINT uq_incident_results_uuid UNIQUE (result_uuid)
);

CREATE INDEX IF NOT EXISTS idx_incident_results_concluded
  ON harness_hardware.incident_results (concluded_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_results_external_ref
  ON harness_hardware.incident_results (external_ref)
  WHERE external_ref IS NOT NULL;

-- =============================================================================
-- 8. fault_graph_nodes (projection table)
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.fault_graph_nodes (
  id BIGSERIAL PRIMARY KEY,
  graph_node_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  node_type TEXT NOT NULL,
  canonical_table TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  node_props JSONB NOT NULL DEFAULT '{}',
  source_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_fault_graph_nodes_canonical UNIQUE (tenant_id, canonical_table, canonical_id),
  CONSTRAINT uq_fault_graph_nodes_uuid UNIQUE (graph_node_uuid)
);

CREATE INDEX IF NOT EXISTS idx_fault_graph_nodes_type
  ON harness_hardware.fault_graph_nodes (tenant_id, node_type);

CREATE INDEX IF NOT EXISTS idx_fault_graph_nodes_external_ref
  ON harness_hardware.fault_graph_nodes (external_ref)
  WHERE external_ref IS NOT NULL;

-- =============================================================================
-- 9. fault_graph_edges (projection table)
-- =============================================================================

CREATE TABLE IF NOT EXISTS harness_hardware.fault_graph_edges (
  id BIGSERIAL PRIMARY KEY,
  graph_edge_uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  external_ref TEXT,
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  edge_type TEXT NOT NULL,
  src_graph_node_id BIGINT NOT NULL REFERENCES harness_hardware.fault_graph_nodes(id),
  dst_graph_node_id BIGINT NOT NULL REFERENCES harness_hardware.fault_graph_nodes(id),
  incident_id BIGINT,
  evidence_id BIGINT,
  confidence_score NUMERIC(5,4),
  provenance_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_fault_graph_edges_uuid UNIQUE (graph_edge_uuid),
  CONSTRAINT chk_fault_graph_edges_no_self_loop CHECK (src_graph_node_id != dst_graph_node_id)
);

CREATE INDEX IF NOT EXISTS idx_fault_graph_edges_src
  ON harness_hardware.fault_graph_edges (tenant_id, src_graph_node_id, edge_type);

CREATE INDEX IF NOT EXISTS idx_fault_graph_edges_dst
  ON harness_hardware.fault_graph_edges (tenant_id, dst_graph_node_id, edge_type);

CREATE INDEX IF NOT EXISTS idx_fault_graph_edges_incident
  ON harness_hardware.fault_graph_edges (tenant_id, incident_id);

CREATE INDEX IF NOT EXISTS idx_fault_graph_edges_external_ref
  ON harness_hardware.fault_graph_edges (external_ref)
  WHERE external_ref IS NOT NULL;

-- =============================================================================
-- 10. RLS Policies
-- =============================================================================

ALTER TABLE harness_hardware.slot_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.fault_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.fault_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.diagnosis_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.repair_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.verification_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.incident_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.fault_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.fault_graph_edges ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies (harness_app_role is the application role)
CREATE POLICY tenant_isolation_slot_bindings
  ON harness_hardware.slot_bindings FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_fault_incidents
  ON harness_hardware.fault_incidents FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_fault_evidences
  ON harness_hardware.fault_evidences FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_diagnosis_records
  ON harness_hardware.diagnosis_records FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_repair_actions
  ON harness_hardware.repair_actions FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_verification_checks
  ON harness_hardware.verification_checks FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_incident_results
  ON harness_hardware.incident_results FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_fault_graph_nodes
  ON harness_hardware.fault_graph_nodes FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_fault_graph_edges
  ON harness_hardware.fault_graph_edges FOR ALL TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- =============================================================================
-- 11. Comments / Documentation
-- =============================================================================

COMMENT ON SCHEMA harness_hardware IS 'Hardware-related data including fault incidents, diagnosis, and repair tracking. Adapted from OpenClaw fault_core schema.';

COMMENT ON TABLE harness_hardware.fault_incidents IS 'Hardware fault incidents. PARTITIONED BY RANGE (fault_occurred_at). Default partition catches out-of-range dates.';
COMMENT ON TABLE harness_hardware.fault_evidences IS 'Evidence records linked to fault incidents. PARTITIONED BY RANGE (incident_occurred_at).';
COMMENT ON TABLE harness_hardware.fault_graph_nodes IS 'Projection table for fault graph nodes. Not canonical truth; rebuildable from transactional tables.';
COMMENT ON TABLE harness_hardware.fault_graph_edges IS 'Projection table for fault graph edges. Not canonical truth; rebuildable from transactional tables.';

-- =============================================================================
-- 12. Rollback Script (for reference; execute manually if needed)
-- =============================================================================
/*
-- Rollback: Drop all tables created by this migration
-- NOTE: Only execute if no production data has been adopted

DROP TABLE IF EXISTS harness_hardware.fault_graph_edges CASCADE;
DROP TABLE IF EXISTS harness_hardware.fault_graph_nodes CASCADE;
DROP TABLE IF EXISTS harness_hardware.incident_results CASCADE;
DROP TABLE IF EXISTS harness_hardware.verification_checks CASCADE;
DROP TABLE IF EXISTS harness_hardware.repair_actions CASCADE;
DROP TABLE IF EXISTS harness_hardware.diagnosis_records CASCADE;
DROP TABLE IF EXISTS harness_hardware.fault_evidences CASCADE;
DROP TABLE IF EXISTS harness_hardware.fault_incidents CASCADE;
DROP TABLE IF EXISTS harness_hardware.slot_bindings CASCADE;

-- Note: harness_hardware schema itself is NOT dropped (contains existing tables from Sprint 0)
*/

-- =============================================================================
-- 13. Migration Completion Marker
-- =============================================================================

-- For migration tracking systems
-- INSERT INTO schema_migrations (version, applied_at, description)
-- VALUES ('sprint1_hardware_fault', NOW(), 'Add hardware fault analysis tables from OpenClaw adaptation');
