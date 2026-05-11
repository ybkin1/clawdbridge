# 分层架构契约 (Layered Architecture Contract)

> 版本: v1.0
> 状态: draft-ready
> 归属: L3 专项契约
> 依赖: runtime-execution-spec.md (L1), lifecycle-contract.md (L3) §4.5
> 设计原则: **分层是强制的,具体分层数按项目类型套用预置套装**

---

## Metadata Envelope

```yaml
contract_id: layered-architecture
owner: claude-bridge
scope: standard-and-complex-tasks
status: draft-ready
depends_on: [runtime-execution, lifecycle-contract]
registry_entry_required: draft-ready
last_reviewed_at: 2026-04-28
review_evidence: "Professional Gate + Contract Gate 并行评审, 2 Critical 修复后重新发布"
```

---

## 1. 设计目标

### 1.1 问题陈述

开发者在实现新功能时容易"直接写一个函数把所有逻辑塞进去",导致:
- Controller 直连数据库,跳过业务校验
- DTO 混用(Req 当 VO 用,PO 当 Res 用)
- 一个 500 行文件包含路由+校验+业务+SQL
- 后续修改时改一处破坏多处,无法独立单测

### 1.2 核心原则

**分层是架构的骨架,搭积木是开发的节奏。**

- 每个新功能必须先"分层拆解"再"逐个实现"
- 小功能 → 拆分成 N 个原子任务(N ≥ 5),每个 ≤30 分钟
- 调用方向严格单向,禁止逆向/跨层
- DTO 分类独立,禁止复用

### 1.3 与 Karpathy 规范的协调

本契约与 [CLAUDE.md](CLAUDE.md) 中 "Simplicity First" 的协调规则:

| 场景 | 适用规则 | 理由 |
|------|---------|------|
| Standard/Complex 任务 | 强制分层 + 原子拆分 | 功能有业务逻辑,拆分换来可维护性 |
| Trivial 任务(纯透传/健康检查/静态资源) | 满足 §1.3 判定流程 1 或 2 时豁免分层 | 不违背 Simplicity First |
| 组件 ≤3 但仍有业务逻辑 | 必须分层 | 业务逻辑是分层触发条件,不看组件数 |

**简洁性豁免判定流程**(满足任一条件即可豁免):
1. 该端点是否直接返回静态数据或健康状态?(是 → 豁免,如 GET /health)
2. 该端点是否只涉及 1 次数据库 CRUD 且无业务计算/校验/转换?(是 → 豁免,如 GET /users/:id)
3. 该端点是否需要校验/转换/编排/多表事务?(是 → 必须分层)

豁免端点**仍须填写 §4.3 组件矩阵**,在"类型"列标注 `Exempt` 即可。

---

## 2. 项目类型识别

### 2.1 探测机制

项目类型在 `IntentParse` 阶段由主线程自动探测,复用 `project-scale-contract.md` 的文件特征机制。**如已显式启用 project-scale,可直接复用其探测结果。**

| 类型 | 探测特征 | 适用套装 | 套装状态 |
|------|---------|---------|---------|
| 后端 Web | `pom.xml`/`build.gradle` 或 `package.json` 含 `express\|koa\|nest\|fastify\|spring` | §4 后端 Web | **已交付 v1.0** |
| 前端 SPA | `package.json` 含 `react\|vue\|angular\|svelte` + `vite\|webpack` | §5 前端 SPA | 待扩展 |
| 嵌入式/系统 | `CMakeLists.txt`/`Makefile` 或含 STM32/ESP/Linux 头文件 | §6 嵌入式 | 待扩展 |
| CLI / 脚本 | `bin/` 目录 + `commander\|click\|cobra` | §7 CLI | 待扩展 |

### 2.2 多类型并存

全栈项目(前后端分离):前端走 §5,后端走 §4,在不同章节展开,禁止混用。

### 2.3 类型变更

- 首次探测后结果缓存到 `project-scale.yaml`
- 根目录文件结构变更时重新探测
- 用户可显式覆盖项目类型判定(如强制指定为前端),但覆盖决定须记录在 ADR 中

---

## 3. 通用分层规则(所有类型适用)

### 3.1 调用方向

```
外层 → 内层 → 更内层
(对外)     (核心逻辑)    (基础设施)
```

**禁止**: 逆向调用(内层调外层)、跨层调用(跳层)、环形依赖(A→B→A)。

### 3.2 原子任务拆分规则

> 与 lifecycle-contract Phase 3(WBS) 嵌套声明:Phase 3 的 "≤3 天/任务" 是**里程碑管理粒度**,本节 "≤30 分钟/原子任务" 是**编码实现粒度**。两者正交,不强制换算。1 个 3 天里程碑任务通常对应 1-3 个小功能,每个小功能拆为 8-15 个原子任务,合计约 8-45 个原子任务。

```
拆分公式:
1 个小功能 → N 个原子任务(N ≥ 5,推荐 8-15)
每个原子任务 = 1 个组件实现 + 1 组单测 + 1 次独立提交
```

### 3.3 依赖图模板

原子任务按依赖图调度,**可并行的链允许同时推进**:

```
DDL ──→ PO ──→ DAO ──→ Service ──→ Controller ──→ E2E Test
                        ↑
Util ──→ Logic ────────┘

DTO (Req/Res) ──→ (独立链,可与上述任意链并行)
Mapper ──→ (在 PO 和 VO 完成后)
```

**关键路径**(加粗): DDL → PO → **DAO → Service → Controller → E2E Test**

### 3.4 DTO 分类强制

| DTO 类型 | 用途 | 禁止 |
|---------|------|------|
| Req | HTTP 入参校验 | 不得用于 Service 内部传递 |
| Res | Controller 返回前端 | 不得直接由 Service 返回 |
| VO | Service 返回给 Controller 的展示对象 | 不得直接返回前端 |
| PO | 数据库持久化对象 | 不得跨出数据层 |

**禁止互相复用同一个类**: Req ≠ Res ≠ VO ≠ PO,各自独立定义。

---

## 4. 后端 Web 套装(种子方案 v1.0)

### 4.1 分层定义

```
┌─ ① API 层(对外) ─────────────────────────────────
│   ├─ Req     请求 DTO,与 HTTP 入参一一对应,带校验注解
│   ├─ Res     响应 DTO,Controller 返回前端的最终结构
│   └─ Controller   路由 + 参数校验 + 调用 Service + 异常映射
│
├─ ② 业务层(领域) ──────────────────────────────────
│   ├─ Service     业务编排 + 事务边界 + 跨 Logic 协调
│   ├─ Logic-N     拆分的子逻辑/领域服务,单一职责
│   └─ VO          展示对象,Service 返回给 Controller
│
├─ ③ 数据层(持久化) ───────────────────────────────
│   ├─ DAO/Repo    数据访问接口,SQL/ORM 入口
│   ├─ PO          持久化对象,与表结构一一对应
│   └─ Mapper      PO ↔ DB / PO ↔ VO 的转换
│
└─ ④ 基础层(基础设施) ─────────────────────────────
    ├─ Entity      数据库实体定义(可与 PO 合并)
    ├─ Const       常量与枚举
    └─ Util/Common 通用工具(无业务依赖)
```

### 4.2 标准目录结构

```
src/
├── controller/          # ① API 层
│   └── UserController.ts
├── dto/
│   ├── req/             # ① API 层 - Req
│   │   └── UserRegisterReq.ts
│   └── res/             # ① API 层 - Res
│       └── UserRegisterRes.ts
├── service/             # ② 业务层
│   ├── UserService.ts
│   └── logic/           # ② 业务层 - Logic
│       ├── UserValidLogic.ts
│       ├── UserDupLogic.ts
│       └── PasswordHashLogic.ts
├── vo/                  # ② 业务层 - VO
│   └── UserVO.ts
├── dao/                 # ③ 数据层
│   └── UserDAO.ts
├── po/                  # ③ 数据层 - PO
│   └── UserPO.ts
├── mapper/              # ③ 数据层 - Mapper
│   └── UserMapper.ts
├── entity/              # ④ 基础层
│   └── UserEntity.ts
└── util/                # ④ 基础层
    └── bcryptUtil.ts

sql/ddl/                 # ③ 数据层 - DDL 脚本
└── user.sql

test/
├── controller/          # Controller 单测
├── service/             # Service + Logic 单测
├── dao/                 # DAO 单测
├── mapper/              # Mapper 单测
└── integration/         # E2E 集成测试
```

### 4.3 组件清单矩阵(填空模板)

> 每个功能填写此表,每行 = 1 个原子组件 = 1 个 WBS 原子任务。

| 组件名 | 所属层 | 类型 | 职责(一句话) | 上游调用方 | 下游依赖 | 文件路径 | 测试文件 | Owner |
|--------|-------|------|--------------|-----------|---------|---------|---------|-------|
| | ① API | Req | | | — | `dto/req/` | — | /dev |
| | ① API | Res | | | — | `dto/res/` | — | /dev |
| | ① API | Controller | | HTTP Router | | `controller/` | `test/controller/` | /dev |
| | ② 业务 | Service | | Controller | Logic/DAO | `service/` | `test/service/` | /dev |
| | ② 业务 | Logic | | Service | — | `service/logic/` | `test/service/` | /dev |
| | ② 业务 | VO | | Service | — | `vo/` | — | /dev |
| | ③ 数据 | DAO | | Service/Logic | PO | `dao/` | `test/dao/` | /dev |
| | ③ 数据 | PO | | DAO | — | `po/` | — | /dev |
| | ③ 数据 | Mapper | | Service | PO/VO | `mapper/` | `test/mapper/` | /dev |
| | ④ 基础 | Entity | 数据库实体定义 | DAO | — | `entity/` | — | /dev |
| | ④ 基础 | Util | | Logic | — | `util/` | `test/util/` | /dev |

> Entity 可与 PO 合并为同一文件;合并时在矩阵中标注"Entity+PO"即可,不单独占行。
>
> 文件路径相对于 `src/` 目录;如项目无 `src/`,则相对于项目根目录。

### 4.4 WBS 派生示例(以"用户注册"为例)

```
T01: 写 sql/ddl/user.sql                    → 15min  → 验证: DESCRIBE user 字段对齐
T02: 写 po/UserPO.ts                        → 15min  → 验证: TS 类型与表 1:1
T03: 写 dao/UserDAO.ts + 单测               → 30min  → 验证: Vitest CRUD 全过
T04: 写 util/bcryptUtil.ts + 单测            → 15min  → 验证: 单测往返一致
T05: 写 service/logic/UserValidLogic + 单测  → 25min  → 验证: 边界用例全过
T06: 写 service/logic/UserDupLogic + 单测    → 20min  → 验证: mock DAO 查重
T07: 写 service/logic/PasswordHashLogic + 单测 → 15min → 验证: bcrypt hash/compare
T08: 写 vo/UserVO.ts + 单测(脱敏 password)   → 20min  → 验证: 序列化无 password 字段
T09: 写 mapper/UserMapper.ts + 单测(PO→VO)   → 15min  → 验证: PO↔VO 转换单测
T10: 写 service/UserService.ts + 单测(编排+事务回滚) → 30min → 验证: 集成场景单测全过
T11: 写 dto/req/UserRegisterReq + dto/res/UserRegisterRes → 25min → 验证: JSON 序列化往返
T12: 写 controller/UserController.ts + 异常映射 + 单测 → 25min → 验证: 4 个状态码场景
T13: 写 E2E 集成测(supertest + 真实 MySQL)   → 30min  → 验证: 200/400/409/500 全覆盖
```

总工期: ~5-6 小时 | 关键路径: T01 → T02 → T03 → T10 → T12 → T13

---

## 5. 强制约束矩阵

> 以下约束在 **review-gates-contract Professional Gate** 触发。C = Critical(阻塞),M = Major(需修复计划),m = Minor(建议)。

| ID | 约束 | 等级 | 触发 Gate | 验证方式 |
|----|------|------|----------|---------|
| C1 | 核心层(① API + ② 业务 + ③ 数据)至少 1 个组件,空核心层禁止;④ 基础层可按需为空,须标注原因 | Critical | Professional | 矩阵自检 |
| C2 | 调用方向 ① → ② → ③ → ④,**禁止逆向/跨层** | Critical | Professional | Code Review + 静态分析 |
| C3 | Controller 不得直接访问 DAO/Mapper/PO | Critical | Professional | Code Review |
| C4 | DTO 分类独立(Req/Res/VO/PO 互不复用) | Critical | Professional | Code Review |
| M1 | 同层组件间调用须经过明确接口,禁止跨包直接 new | Major | Professional | Code Review |
| M2 | 每个组件文件 ≤200 行(默认值,可在 §9 ADR 中按语言调整) | Major | Professional | 行数检查 |
| M3 | 业务层 Logic-N 拆分粒度:单一职责,无副作用 Logic 优先纯函数,有 IO 的 Logic 显式标注依赖 | Major | Professional | Code Review |
| m1 | 组件矩阵每行对应 1 个原子任务,矩阵填写完整率 ≥80% | Minor | Professional | 矩阵自检 |
| m2 | 组件矩阵的"测试文件"列:基础层 Util 必填,DDL 可豁免 | Minor | Professional | 矩阵自检 |

---

## 6. 前端 SPA 套装(待扩展 v2.0)

> 前端项目的分层思路与后端不同:不是 Controller/Service/DAO,而是 View / ViewModel / Model / API / Component。待前端项目实际需求时交付。

**预定义结构(草案)**:
```
┌─ ① View 层 ────────────────── 页面/路由/布局
├─ ② ViewModel 层 ──────────── 状态管理 + 业务编排 + 表单校验
├─ ③ Model 层 ──────────────── 领域对象 + 数据转换
├─ ④ API 层 ────────────────── HTTP 客户端 + 拦截器 + 缓存
└─ ⑤ Component 层 ──────────── 可复用 UI 组件(无业务逻辑)
```

> 待扩散时参考 React Container/Component 分离模式或 Vue 3 Composition API 模式。

---

## 7. 嵌入式/系统套装(待扩展 v3.0)

> 嵌入式/C 语言项目的分层思路:HAL / BSP / Middleware / Application。待实际需求时交付。

---

## 8. CLI / 脚本套装(待扩展 v4.0)

> CLI 项目分层:Command / Handler / Domain / Infrastructure。待实际需求时交付。

> **注意**: §6-§8 待扩展套装可按需拆出独立文件(如 `layered-architecture-frontend.md`),本契约只保留索引行。

---

## 9. 设计决策记录(ADR)

| ID | 决策 | 备选方案 | 选择理由 | 可逆性 | 日期 |
|----|------|---------|---------|--------|------|
| ADR-LA-001 | 规则持有在 L3 契约而非 L5 模板 | 规则直接写在模板中 | 模板是填空骨架,契约是权威定义;规则在 L5 违反单一职责 | 高 | 2026-04-28 |
| ADR-LA-002 | 按项目类型分套,先落地后端 Web | 全局统一一套分层 | 前端/嵌入式/CLI 无法套用 Controller/Service/DAO,硬套变伪分层 | 中 | 2026-04-28 |
| ADR-LA-003 | Trivial 场景简洁性豁免 ≤3 组件 | 不豁免,任何场景强制分层 | 纯透传/健康检查强制 13 个原子任务违反 Simplicity First | 中 | 2026-04-28 |
| ADR-LA-004 | L1-L7 改为 C1-C4/M1-M3/m1-m2 编号 | 保持 L1-L7 | L 编号与规范架构 L0-L6 层号撞名,极易混淆 | 高 | 2026-04-28 |
| ADR-LA-005 | WBS 原子粒度 ≤30min,与 Phase 3 ≤3天正交 | 只用一种粒度 / 强制 24:1 换算 | 3 天=管理粒度(1-3 功能),30min=编码粒度(8-15 原子/功能);两者正交,不强制换算 | 中 | 2026-04-28 |

---

## 10. 与相关契约的边界

| 契约 | 边界 | 说明 |
|------|------|------|
| `lifecycle-contract.md` | lifecycle 持有 Phase 3 WBS"≤3 天/任务"权威定义 | 本契约定义"≤30 分钟/原子任务",两者嵌套不冲突 |
| `review-gates-contract.md` | review-gates 持有 Professional Gate 判定框架 | 本契约提供该 Gate 中"分层完整性"维度的具体判定标准 |
| `engineering-standards-contract.md` | engineering-standards 持有 linter/typecheck 规范 | 本契约持有分层架构规范,正交不重叠 |
| `project-scale-contract.md` | project-scale 持有项目规模判定 | 本契约复用其文件特征探测机制,但不依赖其规模判定 |
| `03-arch-design-template.md` | 模板(L5)提供填空骨架 | 本契约(L3)提供规则定义;模板引用本契约,不反向依赖 |
| `04-dev-plan-template.md` | 模板(L5)提供 WBS 排期骨架 | 本契约提供 WBS 原子任务派生公式 |

---

## Phase 2 出口自检(分层架构)

- [ ] [C1] §2 项目类型识别完成,选定了对应的分层套装?
- [ ] [C2] §4(或对应套装)分层架构图完整产出,四层(API / 业务 / 数据 / 基础)均有定义?(基础层可标注为空,须注明原因)
- [ ] [C3] 组件清单矩阵覆盖每一层,**无空层**?
- [ ] [C4] 跨层调用方向合规,**无逆向/无跨层/Controller 不直连 DAO**?
- [ ] [M1] DTO 已分类独立(Req/Res/VO/PO 互不复用)?
- [ ] [M2] §3 通用规则(调用方向/原子拆分/依赖图)已遵循?

**通过标准**: C1-C4 全部通过;M1/M2 全部通过或有明确修复计划;Minor 问题 ≤3。

---

*本文档为分层架构契约。修改分层定义、新增约束或新增项目类型套装需经过评审闭环。规则持有在 L3 契约,L5 模板只引用本契约,不反向承载规则。*

> Last updated: 2026-04-28 | Version: v1.0
