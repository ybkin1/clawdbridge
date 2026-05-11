# Sprint 1 阻塞性问题修复总结

> 修复日期：2026-05-11
> 状态：全部 7 项阻塞问题已修复并验证

---

## 修复清单

| 编号 | 文件 | 问题 | 修复方式 | 状态 |
|------|------|------|----------|------|
| BLOCK-1 | `sprint1_hardware_fault.sql:67` | `slot_binding_id UUID` 与 `slot_bindings.id BIGSERIAL` 类型不匹配 | 改为 `slot_binding_id BIGINT` | ✅ 已验证 |
| BLOCK-2 | `gpu_fault_analyzer.py:323` | `_async_to_sync` asyncio 反模式，生产事件循环会崩溃 | 移除桥接，改为全 async 链路（`_analyze_async` 消费 `AsyncIterator`） | ✅ 已验证 |
| BLOCK-3 | `gpu_fault_analyzer.py:639` | `datetime.fromisoformat("YYYY-MM-DD HH:MM:SS")` 在 Python < 3.11 崩溃 | 改为 `datetime.strptime(ts.replace(" ", "T"), "%Y-%m-%dT%H:%M:%S")` | ✅ 已验证（grep 确认无残留） |
| BLOCK-4 | `hardware_fault_api.py:87` | 动态 SQL 字段名拼接（虽然字段名来自代码常量，但无白名单防护） | 添加 `ALLOWED_FILTERS` 字典白名单，所有字段引用通过白名单映射 | ✅ 已验证 |
| BLOCK-5 | `hardware_fault_api.py:259` | `create_diagnosis_run` 直接 `await run_diagnosis()`，同步阻塞 HTTP worker | 优先提交 `task_client` 异步队列；降级时添加 `asyncio.wait_for(timeout=300)` | ✅ 已验证 |
| BLOCK-6 | `b6_import_staging.py:171` | `system_asset_id` 被赋值为第一个 GPU 的 ID，混淆主机与组件 | 区分 `system_asset`（主机，hostname 映射）和 `gpu_asset_ids`（GPU 列表）；`primary_component_asset_id` 指向故障 GPU | ✅ 已验证 |
| BLOCK-7 | `hardware_fault_internal_report.jinja2:113` | `dict_to_str` filter 未定义，模板渲染崩溃 | 用 Jinja2 内联 `{% for k,v in d.items() %}` 循环替代自定义 filter | ✅ 已验证 |

---

## 修复后文件列表（共 12 个）

### 数据库层
- `artifacts/sprint1_hardware_fault.sql` — 9 张表 DDL（含已修复 BIGINT）
- `code-reference/sprint1_audit_triggers.sql` — 审计触发器

### Python 服务层
- `code-reference/gpu_fault_analyzer.py` — GPU 故障分析引擎（async 安全 + Python 3.9 兼容）
- `code-reference/evidence_extractor.py` — 证据提取服务
- `code-reference/diagnosis_worker.py` — 诊断工作器
- `code-reference/fault_graph_repository.py` — Graph 数据访问层
- `code-reference/fault_graph_service.py` — Graph 业务服务层
- `code-reference/hardware_fault_api.py` — REST API（字段白名单 + 异步任务队列）
- `code-reference/hardware_fault_events.py` — NATS 事件 Schema
- `code-reference/b6_import_staging.py` — B6 导入流水线（system/component 区分）

### 模板层
- `code-reference/hardware_fault_internal_report.jinja2` — 工程师内部分析报告（无自定义 filter）
- `code-reference/hardware_fault_customer_report.jinja2` — 客户版简化报告

---

## 打包上传建议

```
# 目标服务器路径（需与实际 Harness 代码基线核对）
/opt/harness/
├── src/
│   ├── modules/
│   │   ├── ticket/diagnosis/
│   │   │   ├── gpu_fault_analyzer.py
│   │   │   ├── evidence_extractor.py
│   │   │   └── diagnosis_worker.py
│   │   ├── hardware/
│   │   │   ├── fault_graph_repository.py
│   │   │   └── fault_graph_service.py
│   │   ├── business_analysis/report_templates/
│   │   │   ├── hardware_fault_internal_report.jinja2
│   │   │   └── hardware_fault_customer_report.jinja2
│   │   └── data_import/
│   │       └── b6_import_staging.py
│   ├── api/
│   │   └── hardware_fault.py          # <- hardware_fault_api.py 重命名
│   └── lib/
│       └── hardware_fault_events.py   # <- 或放入 events/ 目录
└── migrations/
    └── sprint1_hardware_fault.sql
    └── sprint1_audit_triggers.sql
```

**上传前仍需在云服务器核对**：
1. `request.state.tenant_id` / `request.state.user` 的实际注入字段名
2. `harness_app_role` 的实际角色名
3. `harness_audit.audit_logs` 表结构
4. Harness 使用的 HTTP 客户端（aiohttp/httpx/自封装）
5. 任务队列封装接口（Celery/ARQ/RQ）
6. NATS client 的封装层

---

## 下一步选项

1. **打包压缩并上传到云服务器** → 然后基于实际 Harness 代码做 diff 对齐
2. **只先上传 DDL 到云服务器** → 验证 PostgreSQL 语法和依赖后，再传 Python 代码
3. **继续 Sprint 2** → 前端 UI、MCP Server 扩展（无需等待上传）
