# Sprint 1 产出物评估报告

> 评估日期：2026-05-11
> 评估范围：b6-implementation-design/code-reference/ 下全部 12 个文件
> 评估标准：Harness 方案详设 v5.2 + OpenClaw 适配映射文档

---

## 总览

| 文件 | 类型 | 完成度 | 质量 | 关键问题数 | 风险等级 |
|------|------|--------|------|-----------|----------|
| sprint1_hardware_fault.sql | DDL | 95% | A- | 2 | 中 |
| sprint1_audit_triggers.sql | DDL | 85% | B+ | 3 | 低 |
| gpu_fault_analyzer.py | Python | 90% | A- | 4 | 中 |
| evidence_extractor.py | Python | 80% | B+ | 5 | 中 |
| diagnosis_worker.py | Python | 85% | B+ | 6 | 中高 |
| fault_graph_repository.py | Python | 90% | A- | 3 | 中 |
| fault_graph_service.py | Python | 85% | B+ | 4 | 中 |
| hardware_fault_api.py | Python | 75% | B | 6 | 高 |
| hardware_fault_events.py | Python | 70% | B | 5 | 中 |
| hardware_fault_internal_report.jinja2 | Template | 85% | A- | 3 | 低 |
| hardware_fault_customer_report.jinja2 | Template | 80% | A- | 3 | 低 |
| b6_import_staging.py | Python | 80% | B+ | 5 | 中高 |

**整体平均完成度：83%，整体质量：B+**

---

## 1. 数据库层评估

### 1.1 sprint1_hardware_fault.sql

**状态**：设计参考级，可直接用于远程语法验证

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| M-01 | `fault_incidents.slot_binding_id` 为 `UUID` 类型，但 `slot_bindings.id` 为 `BIGSERIAL` | **高** | 外键类型不匹配，会导致 DDL 执行失败 |
| M-02 | 月分区被注释，仅保留 DEFAULT 分区 | 中 | 需要部署时解注释或运行分区维护脚本 |
| M-03 | `fault_evidences.incident_id` 为 `BIGINT`，但 mapping 文档注释中写 `UUID` | 低 | 实际实现正确（分区表不能 FK），注释误导 |
| M-04 | `updated_at` trigger 不在本文件中 | 低 | 已分离到 audit_triggers.sql，但可能导致遗忘部署 |

**改进建议**：
1. 修复 M-01：将 `fault_incidents.slot_binding_id` 改为 `BIGINT`，或 `slot_bindings.id` 改为 `BIGSERIAL` 自增 + `slot_binding_uuid` 保持 UUID
2. 添加分区预创建脚本的独立文件，不要在主 DDL 中依赖手动解注释
3. 添加 DDL 执行前置检查（schema、依赖表存在性）

### 1.2 sprint1_audit_triggers.sql

**状态**：设计参考级，依赖 Sprint 0 审计表结构

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| A-01 | `harness_audit.audit_logs` 表结构假设 | 中 | 如果 Sprint 0 审计表字段名不同会失败 |
| A-02 | `current_setting('app.session_id', true)` 在 session_id 未设置时返回空字符串而非 NULL | 低 | 可能导致 audit log 中 session_id 为空字符串 |
| A-03 | 分区表上的逐行触发器会影响批量插入性能 | 中 | 10K records/60s 的 AC 可能受此影响 |

**改进建议**：
1. 上传远程前，先 `\d harness_audit.audit_logs` 核对字段名
2. 考虑对 `fault_evidences`（高频写入）使用 statement-level trigger 或批量审计
3. 添加 `IF EXISTS` 保护，避免重复执行报错

---

## 2. 分析引擎层评估（WP-2）

### 2.1 gpu_fault_analyzer.py

**状态**：核心逻辑完整，可直接用于功能验证

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| G-01 | `_async_to_sync` 桥接是 asyncio 反模式 | **高** | 在生产事件循环中可能引发 `RuntimeError: This event loop is already running` |
| G-02 | `datetime.fromisoformat` 在 Python < 3.11 不支持空格分隔 | **高** | 代码中 `timestamp` 格式为 `"YYYY-MM-DD HH:MM:SS"`，会崩溃 |
| G-03 | GPU 型号扩展只有注释，无注册接口 | 中 | H100、H200 等无法扩展 |
| G-04 | `line[:1000]` 截断可能破坏多字节 UTF-8 | 低 | 导致末尾乱码 |
| G-05 | 时间解析正则不支持带时区的 ISO8601 | 低 | 如 `2026-05-11T10:30:00+08:00` |

**改进建议**：
1. 将 `_analyze` 改为全 async：`async for line in async_stream:` 替代 `_async_to_sync`
2. 使用 `datetime.strptime(ts.replace(" ", "T"), "%Y-%m-%dT%H:%M:%S")` 兼容 Python 3.9+
3. 添加 `register_gpu_pattern()` 方法支持动态扩展
4. 截断时使用 `line.encode("utf-8")[:1000].decode("utf-8", "ignore")`

### 2.2 evidence_extractor.py

**状态**：架构合理，IO 层需要与 Harness 实际基础设施对齐

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| E-01 | `aiohttp` 依赖与 Harness HTTP 客户端可能不一致 | 中 | Harness 可能使用 `httpx` 或自封装 |
| E-02 | `from_inline_text` 返回类型与 `from_incident` 不一致 | 低 | 前者返回 `EvidenceStream`，后者 `AsyncIterator[EvidenceStream]` |
| E-03 | `_fetch_file_lines` 未处理 gzip 二进制响应 | 中 | file_server 返回 gzip 时解码失败 |
| E-04 | `dedupe_key` 使用 SHA256 前 32 位，大规模下碰撞风险 | 低 | 建议用完整 hash 或加随机盐 |
| E-05 | 流读取无错误降级，单点失败导致整个诊断失败 | 中 | 应跳过无法读取的 evidence |

**改进建议**：
1. 抽象 `HttpClient` 接口，适配 Harness 实际使用的 HTTP 库
2. 统一所有 `from_*` 方法返回 `AsyncIterator`
3. 添加 `aiohttp` 的 `content_encoding=gzip` 自动解压支持
4. 在 `from_incident` 中包裹 `try/except`，单流失败不阻断整体诊断

### 2.3 diagnosis_worker.py

**状态**：规则框架完整，生产级功能有缺口

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| D-01 | 根因规则是硬编码 if-elif 链，扩展性差 | 中 | 新增规则需改源码 |
| D-02 | `ai_assisted` 方法无实际 AI 调用 | 中 | 只有枚举，无实现 |
| D-03 | `_update_status` 为空 pass | 中 | 诊断状态丢失，无法追踪 |
| D-04 | `streams` 全量加载到内存 | **高** | 大量 evidence 时 OOM |
| D-05 | 无事务边界 | **高** | `persist` 成功 + `publish` 失败 = 数据不一致 |
| D-06 | `graph_query_ref` 始终 None | 低 | 未集成 graph service |
| D-07 | 无超时控制 | 中 | 单条分析卡住会阻塞整个 worker |

**改进建议**：
1. 将规则提取为 `Rule` 接口 + 注册表，支持配置化加载
2. `ai_assisted` 预留 LLM 调用接口，当前 fallback 到 rule_based
3. 接入 ticket 诊断状态表（即使先简单写入 notes）
4. `run()` 改为逐流分析并释放，不缓存全部 streams
5. 使用数据库事务包裹 `persist_diagnosis`，事件发布在事务外或失败可补偿
6. 添加 `asyncio.wait_for(analysis, timeout=300)`

---

## 3. Graph 层评估（WP-3）

### 3.1 fault_graph_repository.py

**状态**：SQL 层面完整，CTE 查询正确

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| R-01 | `insert_edge` 的 `ON CONFLICT DO NOTHING` 缺少冲突目标 | 中 | 如果表无唯一约束会报错 |
| R-02 | CTE 遍历无结果数限制 | 中 | 超大规模图可能返回百万级数据 |
| R-03 | `_row_to_edge` 的 prefix 处理较脆弱 | 低 | 字段名变化时易出错 |

**改进建议**：
1. 在 `fault_graph_edges` 上添加 `(src_graph_node_id, dst_graph_node_id, edge_type)` 唯一约束，或指定 `ON CONFLICT ON CONSTRAINT ...`
2. 为 CTE 查询添加 `LIMIT` 参数
3. 使用 TypedDict 替代 prefix 字符串拼接

### 3.2 fault_graph_service.py

**状态**：业务语义清晰，部分实现简化

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| S-01 | `build_from_incident` 幂等性不完整 | 中 | 重复调用会尝试重复建边（依赖 DO NOTHING） |
| S-02 | `get_impact_paths` 只返回扁平列表，非真实路径树 | 低 | 前端可视化需要完整树形结构 |
| S-03 | `AggregateStats` 查询在大图上全表扫描 | 中 | 十万级节点时可能慢 |
| S-04 | `build_from_incident` 的 `display_name` 截断为 8 字符，可读性差 | 低 | 建议用 asset_registry 中的实际名称 |

**改进建议**：
1. 明确 `build_from_incident` 的幂等语义：先查后插，或全量重建
2. `get_impact_paths` 改为返回树形 JSON（children 嵌套）
3. 为 `AggregateStats` 查询添加物化视图或计数缓存
4. `build_from_incident` 时 JOIN asset_registry 获取 display_name

---

## 4. API 层评估（WP-6）

### 4.1 hardware_fault_api.py

**状态**：接口设计完整，生产安全有缺口

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| API-01 | 动态 SQL 字段名未白名单化 | **高** | 虽然参数化，但字段名直接来自 Query 参数，存在注入风险 |
| API-02 | `create_diagnosis_run` 同步阻塞调用分析引擎 | **高** | 分析可能耗时分钟级，阻塞 HTTP worker |
| API-03 | `request.state.*` 是假设 | 中 | 需与实际中间件对齐 |
| API-04 | `harness_ticket.tickets` 字段假设 | 中 | `incident_id` 可能不存在或命名不同 |
| API-05 | `get_fault_incident` 使用 `SELECT *` | 中 | 返回过多字段，泄露内部数据 |
| API-06 | Pydantic Response Model 未绑定到路由 | 低 | 缺少 `response_model=` 装饰器参数 |

**改进建议**：
1. 字段过滤白名单化：`ALLOWED_FILTER_FIELDS = {"system_asset_id", ...}`
2. `create_diagnosis_run` 改为提交异步任务（Celery/ARQ），返回 `job_id` 轮询
3. 上传远程后核对 `request.state` 实际字段名
4. 使用显式列名替代 `SELECT *`
5. 绑定 `response_model=...` 以生成正确 OpenAPI schema

---

## 5. 事件层评估（WP-7）

### 5.1 hardware_fault_events.py

**状态**：Schema 设计合理，Consumer 实现不完整

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| EVT-01 | `nats.aio.client` 依赖与 Harness 封装层可能不一致 | 中 | 可能已有 NATS 包装类 |
| EVT-02 | Consumer handler 的 `getattr` 在通配符 subject 下失效 | 中 | `event.hardware.>` 会匹配到 `event.hardware.diagnosis.completed`，但替换后是 `_handle_event_hardware_diagnosis_completed` |
| EVT-03 | `snapshot_ref` 始终为 None | 低 | 未实现 Harness 规范要求的 snapshot_ref 模式 |
| EVT-04 | 无事件版本号 | 低 | 向后兼容困难 |
| EVT-05 | 无 DLQ（死信队列） | 中 | 消费失败时事件丢失 |

**改进建议**：
1. 抽象 `EventBus` 接口，适配 Harness 现有事件封装
2. Consumer 使用显式字典映射 subject → handler
3. snapshot_ref 指向 `file_server` 或 DB 中的事件快照
4. 添加 `schema_version` 字段到事件基类
5. 失败重试 3 次后转入 `event.hardware.dlq`

---

## 6. 报告模板评估（WP-9）

### 6.1 hardware_fault_internal_report.jinja2

**状态**：内容结构完整，存在运行时 filter 缺失

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| RPT-01 | 使用了未定义的 `dict_to_str` filter | **高** | `c.xids | dict_to_str` 会运行时崩溃 |
| RPT-02 | `tojson(indent=2)` 不是 Jinja2 内置 filter | 中 | 需要 `json.dumps` 自定义 filter 或 `pprint` |
| RPT-03 | `analysis.events` 假设为 dict 列表 | 低 | 实际可能是 dataclass 列表 |

**改进建议**：
1. 在模板渲染器中注册 `dict_to_str = lambda d: ", ".join(f"{k}={v}" for k, v in d.items())`
2. 注册 `tojson = json.dumps` filter
3. 模板接收数据前统一做 `asdict()` 转换

### 6.2 hardware_fault_customer_report.jinja2

**状态**：面向客户的简化版，变量来源需明确

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| RPT-04 | `root_cause_description` 变量未定义来源 | 中 | 需要在 worker 中生成并注入 |
| RPT-05 | `service_impact` 变量未定义来源 | 中 | 无对应数据源 |
| RPT-06 | `tenant_name` 变量未定义来源 | 低 | 需要从 `harness_business.tenants` 查询 |

**改进建议**：
1. 在 report generation service 中预查询 `tenant_name` 注入模板上下文
2. `root_cause_description` 可映射为 `gpu_fault_dict` 中的用户友好描述
3. `service_impact` 可基于 severity + fault_category 自动生成

---

## 7. 数据导入评估（WP-10）

### 7.1 b6_import_staging.py

**状态**：流程框架完整，数据映射有缺陷

**问题清单**：

| 序号 | 问题 | 严重性 | 说明 |
|------|------|--------|------|
| IMP-01 | `asset_registry` 的 `ON CONFLICT (tenant_id, serial_number)` 假设唯一约束存在 | 中 | 如果 Sprint 0 未创建会失败 |
| IMP-02 | `system_asset_id` 被赋值为第一个 GPU 的 ID，但 system 应该是主机 | **高** | 概念错误：主机 ≠ GPU |
| IMP-03 | `gpu_inventory[0]` 在列表为空时会 IndexError | 中 | 虽然 dry-run 会拦截，但防御性不足 |
| IMP-04 | 重复导入同一 case 会产生重复 incident | 中 | `external_ref` 有唯一索引吗？没有 |
| IMP-05 | `xid_counts_by_code` 数据被读取但未写入 | 低 | 未增强 `gpu_fault_dict` |

**改进建议**：
1. 导入前检查 `asset_registry` 约束，必要时 ALTER TABLE
2. 区分 `system_asset`（主机）和 `component_assets`（GPU），前者需要额外映射
3. 在 `fault_incidents` 的 `external_ref` 上添加唯一约束 `UNIQUE (tenant_id, external_ref)`
4. 添加 `xid_counts_by_code` → `harness_hardware.gpu_fault_dict` 的引用计数更新逻辑

---

## 8. 阻塞性问题汇总（必须修复后才能上云）

| 编号 | 文件 | 问题 | 修复工作量 |
|------|------|------|-----------|
| **BLOCK-1** | sprint1_hardware_fault.sql | slot_binding_id 类型不匹配 | 5 min |
| **BLOCK-2** | gpu_fault_analyzer.py | `_async_to_sync` asyncio 反模式 | 30 min |
| **BLOCK-3** | gpu_fault_analyzer.py | `fromisoformat` Python < 3.11 不兼容 | 10 min |
| **BLOCK-4** | hardware_fault_api.py | 动态 SQL 字段注入风险 | 20 min |
| **BLOCK-5** | hardware_fault_api.py | diagnosis_run 同步阻塞 | 1-2 h |
| **BLOCK-6** | b6_import_staging.py | system_asset_id 概念错误 | 30 min |
| **BLOCK-7** | hardware_fault_internal_report.jinja2 | `dict_to_str` filter 未定义 | 10 min |

**总计阻塞修复工作量：约 3-4 小时**

---

## 9. 下一步建议

### 选项 A：先修复阻塞问题，再整体上传云服务器（推荐）
1. 修复 BLOCK-1 ~ BLOCK-7
2. 在本地做一次 mock 测试（用 SQLite 或内存 DB 验证 SQL 语法）
3. 打包上传云服务器，与实际 Harness 代码做 diff 对齐
4. 按模块归属复制到正确 `src/` 路径

### 选项 B：直接上传草稿到云服务器，现场修复
- 适合：需要实际 Harness 代码上下文才能判断的假设点
- 风险：在远程直接编辑，无本地版本备份

### 选项 C：只上传 DDL，先做数据库层验证
- 先验证 sprint1_hardware_fault.sql + audit_triggers.sql 的语法和依赖
- 确认 RLS policy 与 Harness 现有认证体系兼容
- 再逐步上传 Python 代码

**我的建议：选 A**，因为 7 个阻塞性问题都很明确，本地修复成本低，上传后只需对齐路径和依赖即可。

是否需要我现在开始修复阻塞性问题？
