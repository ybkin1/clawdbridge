# OpenClaw fault_core → Harness harness_hardware 表映射

> 基于 OpenClaw Source Pack 20260510 `stage4-hardware-fault.sql`
> 目标：符合 Harness 方案详设 v5.2 约束

---

## 1. 映射总览

| OpenClaw 表 | Harness 目标表 | 策略 | 备注 |
|-------------|---------------|------|------|
| `fault_core.hardware_asset_identity` | **不新建** | 映射到现有表 | 与 `harness_assets.asset_registry` 重叠 |
| `fault_core.slot_binding` | `harness_hardware.slot_bindings` | 新增 | Harness 无此表 |
| `fault_core.fault_incident` | `harness_hardware.fault_incidents` | 新增 | 注意复数命名 |
| `fault_core.fault_evidence` | `harness_hardware.fault_evidences` | 新增 | 注意复数命名 |
| `fault_core.diagnosis_record` | `harness_hardware.diagnosis_records` | 新增 | 注意复数命名 |
| `fault_core.repair_action` | `harness_hardware.repair_actions` | 新增 | 注意复数命名 |
| `fault_core.verification_check` | `harness_hardware.verification_checks` | 新增 | 注意复数命名 |
| `fault_core.incident_result` | `harness_hardware.incident_results` | 新增 | 注意复数命名 |
| `fault_core.fault_graph_node` | `harness_hardware.fault_graph_nodes` | 新增 | 投影表 |
| `fault_core.fault_graph_edge` | `harness_hardware.fault_graph_edges` | 新增 | 投影表 |

---

## 2. 字段级映射

### 2.1 `hardware_asset_identity` → `harness_assets.asset_registry`（不新建）

OpenClaw 的此表与 Harness 现有 `asset_registry` 高度重叠：

| OpenClaw 字段 | Harness 字段 | 说明 |
|--------------|-------------|------|
| `asset_id TEXT PK` | `id UUID/BIGSERIAL PK` | Harness 不用 TEXT PK |
| `tenant_id TEXT` | `tenant_id UUID` | 类型需转换 |
| `asset_role TEXT` | `asset_type TEXT` 或新增字段 | 需确认 |
| `whole_device_sn TEXT` | `serial_number TEXT` | 可能已有 |
| `component_sn TEXT` | `component_serial TEXT` | 可能需新增 |
| `part_number TEXT` | `part_number TEXT` | 可能已有 |
| `manufacturer TEXT` | `vendor TEXT` | 可能已有 |
| `model TEXT` | `model TEXT` | 可能已有 |
| `redfish_uri TEXT` | `management_endpoint TEXT` | 语义等价 |
| `lifecycle_state TEXT` | `status TEXT` | 语义等价 |

**决策**：不新建表，B6 import staging 将 OpenClaw asset 数据映射到 `harness_assets.asset_registry`，缺失字段通过 ALTER TABLE 添加。

---

### 2.2 `slot_binding` → `harness_hardware.slot_bindings`（新增）

Harness 现有 schema 无插槽绑定表，需新建。

```sql
CREATE TABLE harness_hardware.slot_bindings (
  id BIGSERIAL PRIMARY KEY,
  slot_binding_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,                          -- 保留 OpenClaw slot_binding_id
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  host_system_asset_id UUID NOT NULL REFERENCES harness_assets.asset_registry(id),
  component_asset_id UUID NOT NULL REFERENCES harness_assets.asset_registry(id),
  slot_name TEXT NOT NULL,
  service_label TEXT NULL,
  slot_type TEXT NOT NULL,
  location_path JSONB NOT NULL DEFAULT '{}',
  mounted_at TIMESTAMPTZ NOT NULL,
  unmounted_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES harness_business.users(id),
  updated_by UUID REFERENCES harness_business.users(id),
  CONSTRAINT chk_slot_binding_sn CHECK (
    host_system_asset_id IS NOT NULL AND component_asset_id IS NOT NULL
  )
);

-- 索引
CREATE UNIQUE INDEX idx_slot_bindings_active_slot
  ON harness_hardware.slot_bindings (tenant_id, host_system_asset_id, slot_name)
  WHERE is_active = TRUE;

CREATE UNIQUE INDEX idx_slot_bindings_active_component
  ON harness_hardware.slot_bindings (tenant_id, component_asset_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_slot_bindings_host_mounted
  ON harness_hardware.slot_bindings (tenant_id, host_system_asset_id, mounted_at DESC);
```

---

### 2.3 `fault_incident` → `harness_hardware.fault_incidents`（新增，RANGE 分区）

```sql
-- 父表（RANGE 分区）
CREATE TABLE harness_hardware.fault_incidents (
  id BIGSERIAL,
  incident_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,                          -- 保留 OpenClaw incident_id
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  system_asset_id UUID NOT NULL REFERENCES harness_assets.asset_registry(id),
  primary_component_asset_id UUID NULL REFERENCES harness_assets.asset_registry(id),
  slot_binding_id UUID NULL REFERENCES harness_hardware.slot_bindings(id),
  incident_source TEXT NOT NULL,
  detected_by_type TEXT NULL,
  detected_by_id TEXT NULL,
  fault_occurred_at TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  severity TEXT NOT NULL,
  fault_category TEXT NOT NULL,
  fault_code TEXT NULL,
  fault_name TEXT NOT NULL,
  symptom_text TEXT NOT NULL,
  source_event_key TEXT NULL,
  current_status TEXT NOT NULL,
  location_snapshot JSONB NOT NULL DEFAULT '{}',
  source_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES harness_business.users(id),
  updated_by UUID REFERENCES harness_business.users(id),
  PRIMARY KEY (id, fault_occurred_at)         -- 分区键必须包含在 PK 中
) PARTITION BY RANGE (fault_occurred_at);

-- DEFAULT 分区
CREATE TABLE fault_incidents_default PARTITION OF harness_hardware.fault_incidents DEFAULT;

-- 索引
CREATE INDEX idx_fault_incidents_system_time
  ON harness_hardware.fault_incidents (tenant_id, system_asset_id, fault_occurred_at DESC);

CREATE INDEX idx_fault_incidents_component_time
  ON harness_hardware.fault_incidents (tenant_id, primary_component_asset_id, fault_occurred_at DESC);

CREATE INDEX idx_fault_incidents_status_detected
  ON harness_hardware.fault_incidents (tenant_id, current_status, detected_at DESC);
```

---

### 2.4 `fault_evidence` → `harness_hardware.fault_evidences`（新增，RANGE 分区）

```sql
CREATE TABLE harness_hardware.fault_evidences (
  id BIGSERIAL,
  evidence_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,
  incident_id UUID NOT NULL,                  -- 逻辑外键（分区表不能直接 FK）
  incident_occurred_at TIMESTAMPTZ NOT NULL,  -- 冗余分区键，用于分区裁剪
  evidence_type TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  source_system TEXT NOT NULL,
  source_uri TEXT NULL,
  message_id TEXT NULL,
  metric_name TEXT NULL,
  metric_value_json JSONB NULL,
  raw_payload_ref TEXT NULL,
  summary_text TEXT NOT NULL,
  checksum TEXT NULL,
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES harness_business.users(id),
  PRIMARY KEY (id, incident_occurred_at)
) PARTITION BY RANGE (incident_occurred_at);

CREATE TABLE fault_evidences_default PARTITION OF harness_hardware.fault_evidences DEFAULT;

CREATE INDEX idx_fault_evidences_incident_time
  ON harness_hardware.fault_evidences (incident_id, observed_at DESC);

CREATE UNIQUE INDEX idx_fault_evidences_dedupe
  ON harness_hardware.fault_evidences (tenant_id, dedupe_key);
```

---

### 2.5 `diagnosis_record` → `harness_hardware.diagnosis_records`（新增）

```sql
CREATE TABLE harness_hardware.diagnosis_records (
  id BIGSERIAL PRIMARY KEY,
  diagnosis_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,
  incident_id UUID NOT NULL,
  diagnosis_at TIMESTAMPTZ NOT NULL,
  diagnosis_method TEXT NOT NULL,
  suspected_root_cause TEXT NOT NULL,
  root_cause_category TEXT NULL,
  reasoning_summary TEXT NOT NULL,
  confidence_score NUMERIC(5,4) NULL,
  graph_query_ref TEXT NULL,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id)
);

CREATE INDEX idx_diagnosis_records_incident_time
  ON harness_hardware.diagnosis_records (incident_id, diagnosis_at DESC);
```

---

### 2.6 `repair_action` → `harness_hardware.repair_actions`（新增）

```sql
CREATE TABLE harness_hardware.repair_actions (
  id BIGSERIAL PRIMARY KEY,
  action_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,
  incident_id UUID NOT NULL,
  action_seq INT NOT NULL,
  action_type TEXT NOT NULL,
  target_component_asset_id UUID NULL REFERENCES harness_assets.asset_registry(id),
  replace_from_component_asset_id UUID NULL REFERENCES harness_assets.asset_registry(id),
  replace_to_component_asset_id UUID NULL REFERENCES harness_assets.asset_registry(id),
  executed_at TIMESTAMPTZ NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action_detail JSONB NOT NULL DEFAULT '{}',
  action_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  UNIQUE (incident_id, action_seq)
);

CREATE INDEX idx_repair_actions_incident_time
  ON harness_hardware.repair_actions (incident_id, executed_at DESC);
```

---

### 2.7 `verification_check` → `harness_hardware.verification_checks`（新增）

```sql
CREATE TABLE harness_hardware.verification_checks (
  id BIGSERIAL PRIMARY KEY,
  check_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,
  incident_id UUID NOT NULL,
  action_id UUID NULL REFERENCES harness_hardware.repair_actions(id),
  check_seq INT NOT NULL,
  check_type TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  actual_result TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL,
  verifier_type TEXT NOT NULL,
  verifier_id TEXT NOT NULL,
  pass_flag BOOLEAN NOT NULL,
  evidence_id UUID NULL,                      -- 逻辑外键到 fault_evidences
  check_ref TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  UNIQUE (incident_id, check_seq)
);

CREATE INDEX idx_verification_checks_incident_time
  ON harness_hardware.verification_checks (incident_id, executed_at DESC);
```

---

### 2.8 `incident_result` → `harness_hardware.incident_results`（新增）

```sql
CREATE TABLE harness_hardware.incident_results (
  id BIGSERIAL PRIMARY KEY,
  result_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,
  incident_id UUID NOT NULL UNIQUE,
  concluded_at TIMESTAMPTZ NOT NULL,
  conclusion_code TEXT NOT NULL,
  root_cause_confirmed BOOLEAN NOT NULL,
  final_root_cause TEXT NOT NULL,
  repair_effectiveness TEXT NULL,
  recurrence_risk TEXT NULL,
  monitoring_window_hours INT NULL,
  recommendation TEXT NULL,
  closed_by_type TEXT NOT NULL,
  closed_by_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id)
);

CREATE INDEX idx_incident_results_concluded
  ON harness_hardware.incident_results (concluded_at DESC);
```

---

### 2.9 `fault_graph_node` → `harness_hardware.fault_graph_nodes`（新增，投影表）

```sql
CREATE TABLE harness_hardware.fault_graph_nodes (
  id BIGSERIAL PRIMARY KEY,
  graph_node_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
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
  UNIQUE (tenant_id, canonical_table, canonical_id)
);

CREATE INDEX idx_fault_graph_nodes_type
  ON harness_hardware.fault_graph_nodes (tenant_id, node_type);
```

---

### 2.10 `fault_graph_edge` → `harness_hardware.fault_graph_edges`（新增，投影表）

```sql
CREATE TABLE harness_hardware.fault_graph_edges (
  id BIGSERIAL PRIMARY KEY,
  graph_edge_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  edge_type TEXT NOT NULL,
  src_graph_node_id UUID NOT NULL REFERENCES harness_hardware.fault_graph_nodes(id),
  dst_graph_node_id UUID NOT NULL REFERENCES harness_hardware.fault_graph_nodes(id),
  incident_id UUID NULL,
  evidence_id UUID NULL,
  confidence_score NUMERIC(5,4) NULL,
  provenance_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_no_self_loop CHECK (src_graph_node_id != dst_graph_node_id)
);

CREATE INDEX idx_fault_graph_edges_src
  ON harness_hardware.fault_graph_edges (tenant_id, src_graph_node_id, edge_type);

CREATE INDEX idx_fault_graph_edges_dst
  ON harness_hardware.fault_graph_edges (tenant_id, dst_graph_node_id, edge_type);

CREATE INDEX idx_fault_graph_edges_incident
  ON harness_hardware.fault_graph_edges (tenant_id, incident_id);
```

---

## 3. RLS 策略

所有新增表必须启用 RLS：

```sql
ALTER TABLE harness_hardware.slot_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.fault_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.fault_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.diagnosis_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.repair_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.verification_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.incident_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.fault_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE harness_hardware.fault_graph_edges ENABLE ROW LEVEL SECURITY;

-- RLS 策略模板（以 fault_incidents 为例）
CREATE POLICY tenant_isolation_fault_incidents
  ON harness_hardware.fault_incidents
  FOR ALL
  TO harness_app_role
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

---

## 4. 与 B6 Import Staging 的关系

B6 的 `harness_import_staging` schema 保持不变：
- `import_batches`
- `staged_records`（JSONB payload 存储原始 OpenClaw 记录）
- `adoption_audit_log`
- `reverse_index`

**新增映射**：B6 adoption 时，`staged_records.payload` 中的 OpenClaw 数据按本映射文档转换后写入上述 9 张表。

---

*文档版本: v1.0*
*日期: 2026-05-10*
