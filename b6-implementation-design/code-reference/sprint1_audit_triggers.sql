-- Sprint 1 Audit Triggers: harness_hardware schema
-- Task: tk-20260510-002-b6-implementation-design
-- Scope: Audit logging for all harness_hardware write operations
-- Depends On: sprint1_hardware_fault.sql, harness_audit.audit_logs (Sprint 0)

-- =============================================================================
-- 0. Prerequisites
-- =============================================================================

-- Assume harness_audit.audit_logs exists from Sprint 0
-- If not, minimal definition:
-- CREATE TABLE IF NOT EXISTS harness_audit.audit_logs (
--   id BIGSERIAL PRIMARY KEY,
--   table_schema TEXT NOT NULL,
--   table_name TEXT NOT NULL,
--   record_id TEXT NOT NULL,
--   action TEXT NOT NULL,  -- INSERT | UPDATE | DELETE
--   old_values JSONB,
--   new_values JSONB,
--   changed_by UUID,
--   changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   tenant_id UUID NOT NULL,
--   session_id TEXT,
--   hash_chain TEXT  -- Sprint 0 hash chain design
-- );

-- =============================================================================
-- 1. Generic Audit Trigger Function
-- =============================================================================

CREATE OR REPLACE FUNCTION harness_hardware.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_record_id TEXT;
    v_tenant_id UUID;
    v_user_id UUID;
BEGIN
    -- Extract tenant_id from the row (all tables have tenant_id)
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
        v_record_id := OLD.id::TEXT;
        v_old := to_jsonb(OLD);
        v_new := NULL;
    ELSE
        v_tenant_id := NEW.tenant_id;
        v_record_id := NEW.id::TEXT;
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    END IF;

    -- Get current user from session (set by app layer)
    BEGIN
        v_user_id := current_setting('app.current_user_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    INSERT INTO harness_audit.audit_logs (
        table_schema,
        table_name,
        record_id,
        action,
        old_values,
        new_values,
        changed_by,
        tenant_id,
        session_id
    ) VALUES (
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        v_record_id,
        TG_OP,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE v_old END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_new END,
        v_user_id,
        v_tenant_id,
        current_setting('app.session_id', true)
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 2. Attach Triggers to harness_hardware Tables
-- =============================================================================

DROP TRIGGER IF EXISTS audit_slot_bindings ON harness_hardware.slot_bindings;
CREATE TRIGGER audit_slot_bindings
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.slot_bindings
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_fault_incidents ON harness_hardware.fault_incidents;
CREATE TRIGGER audit_fault_incidents
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.fault_incidents
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_fault_evidences ON harness_hardware.fault_evidences;
CREATE TRIGGER audit_fault_evidences
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.fault_evidences
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_diagnosis_records ON harness_hardware.diagnosis_records;
CREATE TRIGGER audit_diagnosis_records
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.diagnosis_records
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_repair_actions ON harness_hardware.repair_actions;
CREATE TRIGGER audit_repair_actions
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.repair_actions
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_verification_checks ON harness_hardware.verification_checks;
CREATE TRIGGER audit_verification_checks
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.verification_checks
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_incident_results ON harness_hardware.incident_results;
CREATE TRIGGER audit_incident_results
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.incident_results
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_fault_graph_nodes ON harness_hardware.fault_graph_nodes;
CREATE TRIGGER audit_fault_graph_nodes
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.fault_graph_nodes
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_fault_graph_edges ON harness_hardware.fault_graph_edges;
CREATE TRIGGER audit_fault_graph_edges
    AFTER INSERT OR UPDATE OR DELETE ON harness_hardware.fault_graph_edges
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.audit_trigger_func();

-- =============================================================================
-- 3. Updated-at Trigger Function
-- =============================================================================

CREATE OR REPLACE FUNCTION harness_hardware.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to tables with updated_at column
DROP TRIGGER IF EXISTS set_updated_slot_bindings ON harness_hardware.slot_bindings;
CREATE TRIGGER set_updated_slot_bindings
    BEFORE UPDATE ON harness_hardware.slot_bindings
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_fault_incidents ON harness_hardware.fault_incidents;
CREATE TRIGGER set_updated_fault_incidents
    BEFORE UPDATE ON harness_hardware.fault_incidents
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_fault_graph_nodes ON harness_hardware.fault_graph_nodes;
CREATE TRIGGER set_updated_fault_graph_nodes
    BEFORE UPDATE ON harness_hardware.fault_graph_nodes
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_fault_graph_edges ON harness_hardware.fault_graph_edges;
CREATE TRIGGER set_updated_fault_graph_edges
    BEFORE UPDATE ON harness_hardware.fault_graph_edges
    FOR EACH ROW EXECUTE FUNCTION harness_hardware.set_updated_at();

-- =============================================================================
-- 4. Comments
-- =============================================================================

COMMENT ON FUNCTION harness_hardware.audit_trigger_func() IS 'Generic audit trigger for harness_hardware tables. Writes to harness_audit.audit_logs.';
COMMENT ON FUNCTION harness_hardware.set_updated_at() IS 'Auto-updates updated_at timestamp on row modification.';
