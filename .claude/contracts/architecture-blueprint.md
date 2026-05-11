---
contract_id: "architecture-blueprint"
title: "架构蓝图契约"
owner: "claude-code"
scope: "从系统上下文到实现的13层架构顺序，确保先有整体架构图再拆到可独立开发的细节"
trigger: "design/plan/build phase，任何work packet必须从architecture node拆出"
required_inputs: ["task-tracking当前phase状态"]
required_contracts: ["task-tracking"]  # lego-assembly-workflow removed: data consumer, not loading prerequisite (circular dependency fix)
required_skills: []
verification_checks: ["blueprint-structure-complete", "13-level-coverage", "node-traceability-matrix", "work-packet-to-node-mapping"]
exceptions: ["not-applicable-layer"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 架构蓝图契约（Architecture Blueprint Governance Contract）

## 1. 目的

把"先有整体架构图，再拆到可独立开发的细节"变成可检查的规则，防止从文件名直接跳到实现。

## 2. 核心原则

### 2.1 先有架构图，再有实现包

正式 build 的 work packet 必须从 architecture node 拆出，不得从文件名或临场想法直接生成。

### 2.2 从大局到细节逐层下降

13 层架构顺序（不可跳过）：

1. 系统上下文（参与者、外部依赖、系统边界）
2. 能力图（业务能力、用例、成功动作）
3. 模块/组件图（模块、组件、目录边界）
4. 数据模型（table、migration、index、constraint）
5. API 契约面（Req、Res、VO、DTO、错误模型）
6. 持久化路径（PO/entity、DAO/repository）
7. Service/use-case 边界（接口、事务、依赖方向）
8. 业务逻辑（logic-1, logic-2, logic-n）
9. 入口映射（controller、route、handler）
10. 集成接线（DI、router、config、feature flag）
11. 验证映射（unit、integration、contract、e2e）
12. 可运维性（log、audit、metric、alert、recovery）
13. 回滚/隔离路径

### 2.3 每个细节必须可追溯

任何 table/PO/DAO/Req/Res/service/logic/controller/test 都必须能追溯到 architecture node。

## 3. Architecture Blueprint 最小结构

```yaml
blueprint_id: <id>
scope_level: system | subsystem | feature | change
user_goal_ref: <intent引用>
system_context: <参与者/外部依赖/边界/非目标>
capability_map: <业务能力/用例/角色/成功动作>
module_component_map: <模块/组件/目录边界/所有权>
data_model: <table/migration/index/constraint/rollback>
api_contract_surface: <Req/Res/VO/DTO/错误模型>
persistence_path: <PO/DAO/query/事务参与>
service_usecase_boundary: <接口/use-case/事务/依赖方向>
business_logic_map: <logic-1/2/n的规则/触发条件/状态变化>
entrypoint_map: <controller/route/handler/RPC/鉴权>
integration_wiring: <DI/router/config/feature flag/启停策略>
verification_map: <单测/集成/contract/migration/e2e>
operability_recovery_map: <日志/审计/指标/告警/恢复/回滚>
architecture_nodes: [<node_id>, ...]
node_traceability_ref: <追溯矩阵路径>
```

## 4. Architecture Node 最小字段

每个 node 至少包含：
- `node_id` / `node_name`
- `node_type`: system_context | capability | module | component | data_model | api_contract | persistence | service | business_logic | entrypoint | integration | verification | operability
- `responsibility`
- `status`: required | not_applicable | deferred
- `parent_node_refs` / `child_node_refs`
- `provided_contracts` / `consumed_contracts`
- `work_packet_refs`
- `verification_refs`
- `rollback_or_isolation`

## 5. 节点追溯矩阵

必须回答：
- 每个 node 对应哪些 requirement/intent
- 每个 node 对应分层拆解的哪些 layer
- 每个 node 由哪些 work packet 实现
- 每个 packet 是否有清晰的 architecture node
- 每个 node 是否有验证路径和回滚路径

## 6. 与 7 阶段模型的关系

- Stage 2（架构拆解）产出 architecture blueprint
- Stage 3-4（PRD/方案详设）从 blueprint 拆出 spec 和 design
- Stage 6（编码）的 work packet 从 architecture node 拆出

## 7. Checker 设计

### 7.1 已实现的 Checker（当前强制执行）

| checker_id | 检查内容 | 检查方式 | 失败后果 |
|-----------|---------|---------|---------|
| `ARCH000` | build 任务必须有 blueprint ref 或合法豁免 | 检查 `00-task-state.yaml` 中 `architecture_blueprint_ref` 字段是否存在 | professional gate failed |
| `ARCH001` | blueprint 顶层结构字段齐全（levels[]、nodes[]、traceability_matrix） | 检查 blueprint YAML 文件是否包含必需字段 | professional gate failed |
| `ARCH003` | architecture nodes 具备最小字段（node_id、node_type、level、responsibility、validation_path） | 遍历所有 node 检查最小字段 | professional gate failed |

### 7.2 规划中的 Checker（待实现）

- `ARCH002`: architecture levels 覆盖或显式 not_applicable
- `ARCH004`: 每个 required layer 映射到 architecture node
- `ARCH005`: 每个 work packet 映射到 architecture node
- `ARCH006`: 每个 required node 有 verification 与 rollback
- `ARCH007`: 存在从 system 到 implementation layer 的连续路径

### 7.3 检查执行时机

- `ARCH000`：任务进入 build phase 时检查（由 `00-task-state.yaml` 验证）
- `ARCH001`：Stage 2 架构拆解评审时检查（由评审 Agent 执行）
- `ARCH003`：Stage 2 架构拆解评审时检查（由评审 Agent 执行）
