---
contract_id: "work-packet-governance"
title: "工作包治理契约"
owner: "claude-code"
scope: "搭积木式开发的12层拆包规则，防止粗粒度包、孤儿包和不可追溯的实现"
trigger: "build phase正式启动前，work packet必须从architecture node拆出"
required_inputs: ["architecture-blueprint产出", "task-tracking当前phase状态"]
required_contracts: ["task-tracking"]  # architecture-blueprint removed: data source for work packet decomposition, not loading prerequisite (aligned with registry.yaml)
required_skills: []
verification_checks: ["12-layer-decomposition", "no-coarse-packet-names", "packet-traceable-to-architecture-node", "pre-build-artifacts-complete"]
exceptions: ["standard-task-simplified-to-6-8-layers"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 工作包治理契约（Work Packet Governance Contract）

## 1. 目的

把"搭积木式开发"变成可执行的拆包规则，防止粗粒度包、孤儿包和不可追溯的实现。

## 2. 12 层搭积木拆包

**Complex 任务必须覆盖以下 12 层。Standard 任务可简化到 6-8 层。**

**Standard 任务简化准则**：以下层可标记为 `not_applicable` 或合并到相邻层（需在 work packet manifest 中说明理由）：

| 可跳过的层 | 判定条件 |
|-----------|---------|
| 3. 持久化对象 | 无 ORM/model 层（如纯脚本、API 代理、配置生成） |
| 4. 数据访问 | 无独立 DAO/repository 需求（直接查询或无 DB） |
| 7. 服务接口 | 无业务逻辑抽象（CRUD-only 或直出） |
| 8. 业务逻辑 | 逻辑 < 3 条规则且不涉及跨域 |
| 10. 集成接线 | 无 DI/中间件/feature flag 需求 |
| 12. 可运维性 | 无独立日志/监控/告警需求 |

**必须保留的核心层**（任何 Standard 任务不得跳过）：1. 需求边界、2. 数据结构（如有 DB）、5. 请求契约、6. 响应契约、9. 控制器入口、11. 验证回归。

| 层 | 含义 | 典型产物 |
|----|------|---------|
| 1. 需求边界 | 需求/功能范围 | feature scope |
| 2. 数据结构 | 表/字段/约束 | schema, migration |
| 3. 持久化对象 | PO/entity/model | PO, entity |
| 4. 数据访问 | DAO/repository/mapper | DAO, repository |
| 5. 请求契约 | Req/command/input DTO | Req DTO, validation |
| 6. 响应契约 | Res/VO/view model | Res DTO, serializer |
| 7. 服务接口 | service/use-case 接口 | service interface |
| 8. 业务逻辑 | logic-1, logic-2, logic-n | logic implementation |
| 8a. 函数级 | 单个函数/方法的实现 | function-level packet |
| 9. 控制器入口 | controller/route/handler | controller |
| 10. 集成接线 | DI/config/feature flag | wiring |
| 11. 验证回归 | test/e2e/smoke | test cases |
| 12. 可运维性 | log/audit/metric/alert | observability |

### 2.1 拆包顺序

推荐顺序（分层 web app）：数据结构 → PO → DAO → Req → Res → service interface → logic-n → controller → wiring → verification → operability

对于非分层 web app 架构（如数据库迁移脚本、Cron 任务、Terraform、文档编写、数据分析脚本），12 层模型应映射为等效实现层：
- 数据库迁移：需求边界 → schema → migration → verification → operability
- Cron 任务：需求边界 → 数据结构 → 逻辑 → 调度配置 → 验证 → 可运维性
- Terraform/IaC：需求边界 → 资源定义 → 模块 → 变量配置 → 验证 → 文档
- 文档编写：需求边界 → 大纲 → 正文 → 审查 → 发布

### 2.2 业务逻辑持续拆分

业务逻辑超过 3 个规则/分支时，必须拆成 logic-1, logic-2, logic-n，不得用单个 "business_logic" 吞掉多个规则。

## 3. 禁止的粗粒度包名

不得使用以下包名：
- "实现接口" / "完成后端" / "写业务逻辑"
- "接数据库" / "加controller" / "补DTO"
- "联调" / "整体测试" / "收尾"

## 4. 小功能最小拆分

小功能若跨越 2+ 实现层，必须拆成多个可验收单元。若只涉及 1 层，必须显式标记其他层为 `not_applicable`。

## 4.1 函数级拆包规则（L4 代码块）

当业务逻辑层（第 8 层）的单个逻辑单元仍可拆分时，必须拆到函数级：

| 拆分条件 | 拆包方式 | 示例 |
|---------|---------|------|
| 单个函数 > 50 行有效代码 | 按函数拆分为独立包，或声明 `oversized_justified` | `TaskManager.create` → `TM-001` |
| 单个函数有 ≥3 个独立分支 | 每个分支一个包（如果分支够复杂） | `ApprovalInterceptor.intercept` → `AP-003` |
| 函数被 ≥2 个模块复用 | 提取为独立复用包 | `AuthService.jwtVerifier` → 被 WSServer + WS auth 共用 |
| 纯数据结构/配置 | 允许合并为一个包，标记 `oversized_justified=纯数据结构` | `types/entities.ts` → `TYP-001` |

**硬规则**：
- L4 函数级包的名称必须精确到函数/方法名，禁止 "实现 TaskManager" 这种粗粒度命名
- 每个 L4 包必须在 Dev Plan 中声明 `@ref` 指向 Design §14 具体 STEP
- 每个 L4 包的验收标准必须是可自动验证的一句话（如 "create('x','y') → DB 新增 1 条"）

## 5. 禁止条件

以下 7 种情况必须多包拆分：
1. 涉及数据库表结构变更
2. 涉及 API 接口变更
3. 涉及 2+ 个业务逻辑规则
4. 涉及前端/后端跨越
5. 涉及外部服务集成
6. 涉及配置/数据迁移
7. 涉及 2+ 目录/模块的改动

## 6. Work Packet 最小字段

每个 work packet 必须包含：
- `packet_id`
- `packet_kind`（schema/po/dao/req/res/service/logic-n/controller/wiring/verification/operability）
- `objective`
- `read_scope`
- `write_scope`
- `dependencies`（依赖哪些 packet）
- `acceptance`（怎么算完成）
- `verification`（怎么验证）
- `architecture_node_ref`（追溯到架构节点）
- `design_ref`（指向 Design §14.x STEP N，函数级包必须）
- `oversized`（boolean，是否超过 50 行默认上限）
- `oversized_reason`（if true: 纯数据结构 | 原子逻辑 | 同模式批量 | 强耦合胶水）
- `oversized_review`（评审人批准，oversized=true 时必须）

## 7. 架构节点追溯

每个 packet 必须能回答：
- 来自哪个 architecture node
- 消费哪个上游 contract
- 产出哪个下游 contract
- 如何单独验证
- 失败时如何回滚

## 8. 合并顺序

packet 合并顺序：contract first → implementation → entry last

即：数据结构 → 持久化 → 数据访问 → 服务接口 → 业务逻辑 → 控制器 → 集成接线

## 9. 构建前制品清单（Pre-Build Artifacts）

在 build phase 正式启动前，以下制品必须已落盘并可通过 review：

| # | 制品 | 必需性 | 说明 |
|---|------|--------|------|
| 1 | 需求边界文档 | mandatory | feature scope / user story |
| 2 | 数据结构定义 | mandatory | schema / model / type definition |
| 3 | 接口契约 | mandatory | API req/res definition |
| 4 | 服务接口定义 | mandatory | service interface / use-case contract |
| 5 | 架构蓝图引用 | mandatory | architecture node reference |
| 6 | Work Packet Manifest | mandatory | packet 拆分清单 + 依赖关系 |
| 7 | 评审量表 | mandatory | 当前阶段对应的 checklist |
| 8 | 业务逻辑清单 | mandatory | 规则列表，每个规则有输入/输出/异常路径 |
| 9 | 集成接线图 | recommended | DI 配置 / 中间件 / 路由映射 |
| 10 | 验证计划 | recommended | 测试用例大纲 / smoke test 路径 |
| 11 | 可运维性清单 | recommended | 日志点 / 监控项 / 告警阈值 |
| 12 | 回滚方案 | recommended | 失败时如何安全回退 |

**硬规则**：mandatory 制品缺失时，不得进入 build phase。recommended 制品缺失时，必须在 task state 中记录原因和补充计划。
