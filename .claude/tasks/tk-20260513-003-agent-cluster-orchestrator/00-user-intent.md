# 用户意图

## 原始请求
将八层架构中的 L4-L6（Orchestrator-Prime / Sub-Orchestrator / Worker）从契约定义落地为可执行代码。

## 期望产出
1. agent_orchestrator MCP 工具（验证 manifest + 生成执行计划）
2. agent_status MCP 工具（查询 Agent 健康状态）
3. checkpoint_sync MCP 工具（上下文检查点）
4. Sub-Orchestrator prompt 模板与分解协议
5. Worker prompt 模板与上下文隔离机制
6. 集成测试验证 L4-L6 工作流

## 验收标准
- MCP 工具可通过 test.js 测试
- Sub-Orchestrator 能产出符合 atomicity-rules.yaml 的原子 packet manifest
- Worker 的 Write/Edit 被 Hook 拦截并校验
- agent_status 能实时反映 Agent 执行状态
