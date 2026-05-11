# OpenClaw 硬件故障分析资产 → Harness 适配报告 v2

> 基于 Harness 方案详设 v5.2 + OpenClaw Source Pack 20260510
> 状态：分析完成，待实施
> 前置结论：**OpenClaw 不是需要"集成"的外部系统，而是已经设计为 Harness `hardware_fault_analysis` vertical slice 的参考实现。**

---

## 1. 总体结论

所有 OpenClaw 资产都可以在符合 Harness 架构约束的前提下适配进入，**不需要重新开发核心逻辑**，但需要以下改造：

| 改造类型 | 工作量 | 说明 |
|---------|--------|------|
| Schema 重命名 + 主键改造 | 2-3 天 | `fault_core` → `harness_hardware`，`TEXT` PK → `BIGSERIAL`/`UUID`，租户引用对齐 |
| TypeScript → Python 重写 | 5-7 天 | facade 骨架逻辑保留，语言栈对齐 Harness |
| Python 脚本模块化封装 | 3-4 天 | 分析脚本从命令行工具改为 Harness worker + service |
| 事件系统集成 | 2-3 天 | 添加 NATS 事件发布/消费 |
| MCP 接口暴露 | 1-2 天 | 通过 `pg_server` 或新增 MCP 方法暴露查询能力 |
| RLS + 审计 | 2-3 天 | 所有新增表添加 RLS 策略和审计触发器 |
| **总计** | **15-22 天** | 不含 B6 import staging（已完成设计） |

---

## 2. OpenClaw 资产清单

| 资产 | 路径 | 体量 | 核心价值 |
|------|------|------|---------|
| **SQL Schema 草案** | `code/.../sql/stage4-hardware-fault.sql` | 10 张表 | 完整的故障生命周期数据模型 |
| **TypeScript Facade** | `code/.../src/business-db/` | ~30 个文件 | fault graph 聚合读取、SQL dialect、traversal |
| **Python 分析脚本** | `code/analysis-scripts/` | 9 个脚本，~180KB | GPU Xid 解析、信号模式匹配、时间提取、去重 |
| **结构化案例数据** | `fault-data/structured/` | 2 个 JSON | GPU 清单、故障码、证据事件、恢复观察 |
| **分析报告** | `fault-data/reports/` | 2 份 Markdown | 完整故障分析报告的写作模板 |
| **设计文档** | `design/current-task/` | 14 份文档 | PRD、架构、接口冻结、开发计划 |

---

## 3. Harness 架构约束（适配必须遵守）

### 3.1 Schema 规范
- **命名空间**：`harness_{domain}`，如 `harness_hardware`、`harness_knowledge`
- **主键**：`BIGSERIAL` 或 `UUID`，不用字符串 ID
- **租户字段**：所有租户表必须有 `tenant_id`，关联 `harness_business.tenants`
- **分区策略**：时间序列表按月 `RANGE` 分区（如 `fault_logs` 已分区）
- **RLS**：`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- **审计**：所有写操作记录 `created_at`、`updated_at`、`created_by`、`updated_by`

### 3.2 模块边界
- **工单处理**：`src/modules/ticket/` — WO-04 远程诊断已有 `diagnosis.py`
- **硬件数据**：`src/modules/hardware/` 或 `harness_hardware` schema — 已有 `fault_logs`、`gpu_fault_dict`
- **知识中心**：`src/modules/knowledge/` — 已有 `gpu_fault_dict.py`（KN-04）
- **报告模块**：`src/modules/business_analysis/report_gen.py`（BA-05）
- **文件模块**：`src/modules/file_server/` 或 `src/api/files.py`

### 3.3 通信规范
- **REST API**：`POST/GET/DELETE /api/{resource}`，FastAPI dependency 注入 RBAC
- **NATS 事件**：`event.{domain}.{action}`，事件只携带 `snapshot_ref`
- **MCP Server**：`pg_server` 扩展 SQL 查询方法

---

## 4. 逐资产适配方案

### 4.1 SQL Schema — `fault_core` → `harness_hardware`

OpenClaw 的 10 张表应该**全部进入 `harness_hardware` schema**，与 Harness 已有的 `fault_logs`、`gpu_fault_dict`、`metrics_snapshots` 共存。

#### 表名映射

| OpenClaw 表名 | Harness 表名 | 说明 |
|--------------|-------------|------|
| `fault_core.fault_incident` | `harness_hardware.fault_incidents` | 故障事件主表，注意复数 |
| `fault_core.fault_evidence` | `harness_hardware.fault_evidences` | 证据记录 |
| `fault_core.diagnosis_record` | `harness_hardware.diagnosis_records` | 诊断记录 |
| `fault_core.repair_action` | `harness_hardware.repair_actions` | 维修动作 |
| `fault_core.verification_check` | `harness_hardware.verification_checks` | 验证检查 |
| `fault_core.incident_result` | `harness_hardware.incident_results` | 事件结论 |
| `fault_core.hardware_asset_identity` | **不新建** | 映射到 `harness_assets.asset_registry` |
| `fault_core.slot_binding` | `harness_hardware.slot_bindings` | 插槽绑定 |
| `fault_core.fault_graph_node` | `harness_hardware.fault_graph_nodes` | 故障图节点（投影表） |
| `fault_core.fault_graph_edge` | `harness_hardware.fault_graph_edges` | 故障图边（投影表） |

#### 主键改造

OpenClaw 使用 `TEXT PRIMARY KEY`（如 `incident_id TEXT PRIMARY KEY`），Harness 规范要求：

```sql
-- OpenClaw 风格（需改造）
CREATE TABLE fault_core.fault_incident (
  incident_id TEXT PRIMARY KEY,  -- ❌ Harness 不用 TEXT PK
  ...
);

-- Harness 风格（目标）
CREATE TABLE harness_hardware.fault_incidents (
  id BIGSERIAL PRIMARY KEY,       -- ✅ Harness 标准
  incident_uuid UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  external_ref TEXT,              -- 保留 OpenClaw 原始 ID
  tenant_id UUID NOT NULL REFERENCES harness_business.tenants(id),
  ...
);
```

#### 租户引用改造

OpenClaw：`tenant_id TEXT REFERENCES app_core.tenant(tenant_id)`
Harness：`tenant_id UUID REFERENCES harness_business.tenants(id)`

#### 分区策略

`fault_incidents`、`fault_evidences` 按 `fault_occurred_at` 或 `detected_at` RANGE 分区，与 `fault_logs` 保持一致（36 个月保留期）。

#### 与现有表的关系

```
harness_hardware.fault_incidents
  → harness_assets.asset_registry (system_asset_id)
  → harness_hardware.slot_bindings (slot_binding_id)
  → harness_hardware.fault_evidences (1:N)
  → harness_hardware.diagnosis_records (1:N)
  → harness_hardware.repair_actions (1:N)
  → harness_hardware.verification_checks (1:N)
  → harness_hardware.incident_results (1:1)
  → harness_hardware.fault_graph_nodes (1:N 投影)
```

### 4.2 TypeScript Facade → Python Service

OpenClaw 的 TypeScript facade（`fault-graph-aggregate-reader.ts`、`sql-fault-graph.ts` 等）需要**重写为 Python**，因为 Harness 是 Python/FastAPI 栈。

但**设计模式保留**：

| OpenClaw 模式 | Harness 对应实现 | 文件 |
|--------------|-----------------|------|
| `SqlQuery` interface | `asyncpg` 参数化查询 | `src/lib/database.py` |
| `FaultGraphAggregateReader` | `FaultGraphService` | `src/modules/hardware/fault_graph_service.py` |
| `SqlFaultGraphDialect` | `FaultGraphRepository` | `src/modules/hardware/fault_graph_repository.py` |
| `PostgresFaultGraphDialect` | SQLAlchemy Core / asyncpg raw SQL | 同上 |
| Graph traversal (WITH RECURSIVE) | 保留 CTE 查询，包装为 Python 方法 | 同上 |

**核心 SQL（traversal）不需要重写**，只需把 TypeScript 的字符串拼接改为 Python f-string 或 SQLAlchemy text()。

### 4.3 Python 分析脚本 → Harness Diagnosis Worker

OpenClaw 的 9 个 Python 脚本是**最大价值资产**，包含：

| 脚本 | 功能 | Harness 归属 |
|------|------|-------------|
| `stream_openclaw_gpu_fault_analysis.py` | 流式 GPU 故障分析（Xid 解析、信号模式匹配） | `src/modules/ticket/diagnosis/gpu_fault_analyzer.py` |
| `aggregate_stream_fast.py` | 流聚合（快速计数） | 同上，作为 `aggregate()` 方法 |
| `extract_later_key_info_fast.py` | 关键信息提取 | 同上，作为 `extract_evidence()` 方法 |
| `targeted_gpu_fault_scan.py` | 定向 GPU 扫描 | 同上，作为 `targeted_scan()` 方法 |
| `build_evidence_summary.py` | 证据摘要生成 | `src/modules/ticket/diagnosis/evidence_summarizer.py` |
| `finalize_report.py` | 报告终稿生成 | `src/modules/business_analysis/report_gen.py` 的 hardware_fault 模板 |
| `minimal_complete_scan.py` | 最小完整扫描 | 诊断 worker 的 `quick_scan()` 方法 |
| `final_counter_scan.py` | 最终计数扫描 | 诊断 worker 的 `counter_scan()` 方法 |

**改造要点**：
1. **输入从文件变为数据库**：不再读取 `.log.gz`，而是读取 `harness_hardware.fault_evidences.raw_payload_ref` 或 `file_server` 解析后的内容
2. **输出从 stdout/JSON 文件变为数据库写入**：分析结果写入 `harness_hardware.diagnosis_records`
3. **添加 Harness 上下文**：注入 `tenant_id`、`ticket_id`、`diagnosis_context_id`、`actor_ref`
4. **移除文件 I/O**：用 `asyncio` 替代同步文件操作
5. **添加降级模式**：当 AI 模型不可用时，回退到规则匹配（OpenClaw 已经是规则匹配，天然支持）

### 4.4 结构化案例数据 → Knowledge / Fixture

`cld-dnode53/dnode55.case-summary.json` 的用途：

| 数据部分 | Harness 归属 | 用途 |
|---------|-------------|------|
| `gpu_inventory` | `harness_assets.asset_registry` + `harness_hardware.components` | 设备/部件主数据 |
| `primary_fault` | `harness_hardware.fault_incidents` | 故障事件 |
| `xid_counts_by_code` | `harness_hardware.gpu_fault_dict` 引用计数 | 故障字典增强 |
| `evidence_events` | `harness_hardware.fault_evidences` | 证据记录 |
| `post_recovery_observation` | `harness_hardware.incident_results` | 事件结论 |
| 整体结构 | `harness_knowledge.documents` (category='case') | 知识案例库 |

**导入路径**：通过 B6 import staging → dry-run → adoption → reverse_index。

### 4.5 分析报告 → Report Template

`cld-dnode53-14018-final-report.md` 是**报告写作模板**，应转化为：

- `src/modules/business_analysis/report_templates/hardware_fault_internal_report.jinja2`
- `src/modules/business_analysis/report_templates/hardware_fault_customer_report.jinja2`

报告模板使用 Jinja2 渲染，数据源为 `harness_hardware.diagnosis_records` + `fault_incidents` + `fault_evidences`。

---

## 5. 模块归属映射（OpenClaw → Harness）

```
OpenClaw vertical slice                Harness 模块
─────────────────────────────────────────────────────────────────
ticket → diagnosis_context           → src/modules/ticket/diagnosis.py (WO-04)
file_server → manifest               → src/api/files.py + src/modules/file_server/
evidence_extractor                   → src/modules/ticket/diagnosis/evidence_extractor.py
diagnosis_run                        → src/modules/ticket/diagnosis/run_service.py
fault_incident / evidence            → harness_hardware schema + src/modules/hardware/
repair_action / verification         → harness_hardware schema + src/modules/hardware/
incident_result                      → harness_hardware schema
fault_graph (node/edge)              → harness_hardware schema + src/modules/hardware/fault_graph_service.py
gpu_fault_dict                       → src/modules/knowledge/gpu_fault_dict.py (KN-04，已存在)
report_gen                           → src/modules/business_analysis/report_gen.py (BA-05)
knowledge_candidate                  → src/modules/knowledge/sediment.py (KN-06)
import_staging                       → src/modules/data_import/ (B6，已设计)
```

---

## 6. 需要重新开发的部分

| 组件 | 原因 | 工作量 |
|------|------|--------|
| **前端 UI** | OpenClaw 没有前端，Harness 需要 ticket diagnosis panel | 5-7 天 |
| **NATS 事件 publisher/consumer** | OpenClaw 无事件系统 | 2-3 天 |
| **MCP Server 扩展** | OpenClaw 无 MCP | 1-2 天 |
| **RLS 策略** | OpenClaw 单租户，无 RLS | 2-3 天 |
| **审计日志集成** | OpenClaw 无审计 | 1-2 天 |
| **REST API 路由** | OpenClaw 无 REST API（分析脚本是命令行工具） | 2-3 天 |
| **文件上传 → manifest → evidence 管道** | OpenClaw 直读文件，无 manifest 中间层 | 3-4 天 |

---

## 7. 实施顺序建议

**Phase 1：数据底座（PKG-01 等价）**
1. Schema 改造：`fault_core` → `harness_hardware` 新增表
2. RLS + 审计
3. Migration + rollback 脚本

**Phase 2：分析引擎移植（PKG-05~PKG-06 等价）**
1. Python 脚本模块化：从命令行 → `src/modules/ticket/diagnosis/` service
2. 输入改造：文件读取 → 数据库读取
3. 输出改造：stdout/JSON → 数据库写入

**Phase 3：Graph 投影层（新增）**
1. Fault graph repository（Python 版）
2. Graph traversal API
3. Aggregate reader

**Phase 4：接口层（PKG-03~PKG-04, PKG-07~PKG-09 等价）**
1. REST API 路由
2. NATS 事件集成
3. MCP Server 扩展
4. Report template

**Phase 5：数据导入（PKG-10 等价）**
1. B6 import staging 执行
2. OpenClaw 结构化数据 adoption
3. Reverse index 建立

**Phase 6：验证（PKG-13 等价）**
1. 单元测试
2. 集成测试
3. App regression

---

## 8. 关键风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| OpenClaw `TEXT` PK → Harness `BIGSERIAL` 的映射破坏外部引用 | 高 | 添加 `external_ref` 字段保留原始 ID，所有 OpenClaw 导入数据通过 external_ref 追溯 |
| OpenClaw 单租户 → Harness 多租户的数据归属 | 高 | Import staging 阶段强制标记 tenant_id，未标记数据拒绝 adoption |
| Python 脚本中的硬编码路径和文件 I/O | 中 | 全面审查并替换为数据库/对象存储访问 |
| Graph traversal 性能（CTE 递归在大图上可能慢） | 中 | 添加 `max_depth` 限制（已有），必要时加物化视图 |
| 与现有 `harness_hardware.fault_logs` 的数据模型冲突 | 中 | `fault_logs` 是原始遥测日志，`fault_incidents` 是聚合事件，两者互补不冲突 |

---

## 9. 最终产出物清单

当适配完成后，Harness 将新增/增强以下产出：

### 数据库（`harness_hardware` schema）
- `fault_incidents` — 故障事件主表
- `fault_evidences` — 证据记录
- `diagnosis_records` — 诊断记录
- `repair_actions` — 维修动作
- `verification_checks` — 验证检查
- `incident_results` — 事件结论
- `slot_bindings` — 插槽绑定
- `fault_graph_nodes` — 故障图节点（投影）
- `fault_graph_edges` — 故障图边（投影）

### 代码模块
- `src/modules/ticket/diagnosis/gpu_fault_analyzer.py` — GPU 故障分析引擎（移植自 OpenClaw）
- `src/modules/ticket/diagnosis/evidence_extractor.py` — 证据提取器
- `src/modules/hardware/fault_graph_service.py` — 故障图服务
- `src/modules/hardware/fault_graph_repository.py` — 故障图存储库
- `src/modules/business_analysis/report_templates/hardware_fault_*.jinja2` — 报告模板

### API / MCP
- `GET /api/hardware/fault-incidents` — 故障事件查询
- `GET /api/hardware/fault-graph/{incident_id}` — 故障图查询
- `POST /api/tickets/{id}/diagnosis-runs` — 诊断运行
- MCP: `pg_server.query_fault_graph` — 图遍历查询

### 数据
- 历史故障案例（cld-dnode53/55）进入知识库
- GPU Xid 故障字典增强

---

*报告 v2 生成时间：2026-05-10*
*基于：Harness 方案详设 v5.2 + OpenClaw Source Pack 20260510*
