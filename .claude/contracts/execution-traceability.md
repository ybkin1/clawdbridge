---
contract_id: "execution-traceability"
title: "执行追溯契约"
owner: "claude-code"
scope: "Design-Plan-Code 三层追溯链、双向引用矩阵、包级即时评审、拼装级评审、审计检查器"
trigger: "implementation action_family 进入 design/plan/build phase 时自动激活"
required_inputs: ["architecture-blueprint", "work-packet-governance", "document-depth"]
required_contracts: ["lego-assembly-workflow", "work-packet-governance", "document-depth", "verification-checker", "review-gates"]
required_skills: []
verification_checks: ["design-plan-bidirectional-ref-check", "packet-size-check", "code-packet-annotation-check", "orphan-code-detection", "exception-path-coverage-check", "state-transition-coverage-check", "assembly-interface-alignment-check"]
exceptions: ["glue-code-exemption", "trivial-task-skip"]
supersedes: []
version: 1
last_reviewed_at: "2026-05-11"
---

# 执行追溯契约（Execution Traceability Contract）

## 1. 目的

将「设计文档 → 开发计划 → 代码实现」从人工自觉对齐升级为**可自动审计的追溯链**，解决：
- 设计写了函数伪代码，计划没覆盖到
- 计划排了包，代码写出来是另一回事
- 代码中新增函数找不到设计来源（AI 脑补）
- 异常路径、状态变更在代码里实现了，但设计文档里没定义

## 2. 适用范围

本契约在以下场景生效：
- `delivery_mode=full` 且 `phase=design|plan|build`
- `action_family=implementation` 或 `verification`
- `depth_profile=implementation_blueprint` 的文档产出

**豁免**：
- Trivial 任务：跳过正式追溯链，主线程自检即可
- 胶水代码（glue code）：允许不引用 Design §14，但必须在 Dev Plan 中标记

## 3. 核心原则

### 3.1 三层追溯链

```
L1 Design §14 伪代码
   ↑↓ 双向引用矩阵（≥95% 覆盖率）
L2 Dev Plan 工作包（@packet + @ref）
   ↑↓ 代码溯源注释
L3 代码实现（@packet 头部注释）
```

> **概念定义**：§14 是 `confidential_design` 文档在 `depth_profile=implementation_blueprint` 时的强制章节，包含函数级 STEP-by-STEP 伪代码（粒度达到 if/try/for/await 级别），以及 §14.0 DI 总表、§14.7 异常传播边界图、状态变更追踪。完整 schema 见 `document-depth` §3.2 和 `lego-assembly-workflow` §4.5.1。L4（代码块级）是乐高层级模型中最小制造单元，对应单个函数/类/组件/配置文件，定义见 `lego-assembly-workflow` §4.1。

### 3.2 无追溯即阻断

- 详设评审发现 §14 覆盖率 < 95% → 不得进入 Stage 5
- 计划评审发现双向引用覆盖率 < 95% → 不得进入 Stage 6
- 编码评审发现 orphan 代码（无 @packet 来源）→ professional gate failed
- 拼装测试发现接口类型不匹配 → 不得向上拼装

### 3.3 纵向映射即契约

registry.yaml 中 `execution-traceability` 契约显式声明：
- 依赖哪些 checklist（stage4/5/6 评审清单）
- 依赖哪些 checker（7 个自动化/半自动化检查器）

评审 Agent 加载本契约时，自动加载关联 checklist 和 checker。

## 4. 规则与决策模型

### 4.1 Design → Plan 双向引用矩阵

**正向检查**：Design §14 每个 STEP 必须有 ≥1 个 Dev Plan 包覆盖
**反向检查**：Dev Plan 每个包必须引用 ≥1 个 Design §14 STEP

**双向引用矩阵格式**（写入 `artifacts/bidirectional-ref-matrix.yaml`）：

```yaml
matrix_version: 1
audit_date: "2026-05-11"
# 正向：Design STEP → Plan Packets
design_to_plan:
  - step_ref: "§14.1 STEP 4"
    step_function: "StdinStdoutBridge.write"
    covered_by: ["CP-004"]
    status: covered
  - step_ref: "§14.2 STEP 2"
    step_function: "ApprovalInterceptor.intercept"
    covered_by: ["AP-003"]
    status: covered
  - step_ref: "§14.4 STEP 2"
    step_function: "TaskBuilder.plan"
    covered_by: ["TB-001"]
    status: covered
  # ... 全部 §14 STEP
# 反向：Plan Packet → Design STEP
plan_to_design:
  - packet_id: "TM-001"
    packet_name: "TaskManager.create"
    refs: ["§14.4 STEP 1"]
    status: traced
  - packet_id: "TM-002"
    packet_name: "TaskManager.updateStatus"
    refs: ["§14.6 STEP 3"]
    status: traced
  # ... 全部 packets
# 异常项
exceptions:
  - type: orphan_step
    step_ref: "§14.3 STEP 4"
    reason: "文件上传流程将在 Sprint 2 实现，当前标记为 deferred"
    approved_by: "user"
  - type: orphan_packet
    packet_id: "GLUE-001"
    packet_name: "Express app.ts bootstrap"
    reason: "glue_code"
    approved_by: "system"
# 覆盖率统计
coverage:
  design_to_plan_percent: 98
  plan_to_design_percent: 100
  threshold: 95
  passed: true
```

**矩阵创建者与时机**：
- 双向引用矩阵由 **Stage 5 作者**（开发计划撰写者）在 Stage 5 期间创建并维护
- 创建工具：`design-plan-bidirectional-ref-check`（自动化提取 + 人工确认 exceptions）
- 初稿应在 Stage 5 开始后 24 小时内产出；终稿在 Stage 5 评审前必须落盘
- Stage 4 评审不检查矩阵覆盖率，只检查 Dev Plan packet manifest 中 ≥80% 函数级包已有 `@ref` 指向 §14

**硬规则**：
- 双向引用覆盖率均 ≥ 95% 方可通过 Stage 5 计划评审
- orphan_step 必须显式标记 `deferred`/`not_applicable` 并有审批人
- orphan_packet 必须标记 `glue_code` 并有合理理由（glue code 包数不得超过总包数 10%）
- 所有 deferred 项必须在下一个任务的 Stage 4 重新评估（`deferred_expiry` 字段）

### 4.2 Plan → Code 代码溯源

**代码文件头部注释模板**（强制）：

```typescript
/**
 * @packet {packet_id}
 * @input  {从哪个包读什么数据}
 * @output {对外导出什么}
 * @contract {必须满足的接口签名}
 * @ref    {Design §14.x STEP N — 精确伪代码位置}
 * @test   {验证一句话}
 * @oversized {true|false}
 * @oversized_reason {if true: 纯数据结构|原子逻辑|同模式批量|强耦合胶水}
 */
```

**示例**：

```typescript
/**
 * @packet TM-001
 * @input  DAO-001 (taskDAO), REQ-001 (CreateTaskReqSchema)
 * @output TaskManager.create(title, repo, userId?) → Task
 * @contract create(title: string, repo: string, userId?: string): Task
 * @ref    Design §14.4 STEP 1 (POST /api/v1/tasks → TaskController.create → TaskManager.create)
 * @test   create('fix login', 'main-project') → DB 中新增 1 条 task
 * @oversized false
 */
```

**溯源规则**：
- 每个新增代码文件必须有 `@packet` 注释
- 每个 `export function` / `export class` 必须在 Dev Plan 中有对应条目
- glue code 允许不引用 §14，但必须标记 `@packet GLUE-xxx`

### 4.3 Code → Design 反向验证

编码完成后，必须反向验证：

| 验证项 | 检查内容 | 检查方式 | 通过标准 |
|-------|---------|---------|---------|
| 异常路径覆盖 | 代码中的 try/catch/throw 在 §14 异常传播链中有定义 | `exception-path-coverage-check` (manual) | 每个异常路径可追溯 |
| 状态变更覆盖 | 代码中的状态赋值在 Design 状态变更追踪中有定义 | `state-transition-coverage-check` (manual) | 每个状态变更可追溯 |
| 接口契约对齐 | 代码签名与 §14 伪代码签名一致（参数名/类型/返回值） | `assembly-interface-alignment-check` (automated) | 类型检查通过 |

### 4.4 包大小约束（认知负荷上限）

```
默认上限: 50 行有效代码（不含注释、空行、import）

允许声明 oversized_justified 的条件（满足任一即可）:
  1. 纯数据结构/配置/枚举（无逻辑分支）
  2. 必须原子实现的逻辑（拆分会破坏正确性，如状态机转换表）
  3. 同模式批量代码（3+ 个相似函数，一次生成模式一致）
  4. 强耦合的胶水代码（DI 接线、路由注册）

约束: 任何超出 50 行的包必须在定义中显式声明:
  - oversized: true
  - oversized_reason: <上述 4 类之一>
  - oversized_review: <评审人批准>
```

### 4.5 四级评审体系

| 评审类型 | 触发时机 | 评审者 | 评审焦点 | 不通过后果 |
|---------|---------|--------|---------|-----------|
| 详设评审 | Stage 4 结束 | 2-3 独立 Agent | §14 函数级伪代码完整性、DI 表、异常边界图、状态追踪 | 不得进入 Stage 5 |
| 计划评审 | Stage 5 结束 | 2 独立 Agent | 双向引用矩阵、包粒度 ≤50 行、依赖无环 | 不得进入 Stage 6 |
| **包级评审** | **每个 L4 包编码完成** | **主线程自检 / 子 Agent** | **@contract 实现正确性、§14 伪代码对齐、单元测试通过** | **不得进入拼装** |
| **拼装评审** | **每级拼装完成** | **独立评审 Agent** | **接口对齐、类型一致、集成测试通过** | **不得向上拼装** |
| 编码阶段评审 | Stage 6 结束 | 2 Agent + MCP | 场景走读、追溯矩阵、孤儿代码检测 | 不得进入 Stage 7 |
| 验收评审 | Stage 7 结束 | 2 Agent | E2E 通过、覆盖率、价值验证 | 不得 closeout |

> **Verdict 映射说明**：包级/拼装评审使用 `lego-assembly-workflow` §4.8 verdict 体系（Pass / Conditional Pass / Fail）；Stage gate 评审使用 `review-gates` 体系（passed / request_changes / blocked）。映射关系：Pass→passed，Conditional Pass→request_changes，Fail→blocked（3 轮后）。

### 4.6 拼装验证链

```
L4 代码块制造完成
  → 包级评审（@contract / @test / packet-size-check）
  → 通过 → L4→L3 拼装
    → 拼装评审（assembly-interface-alignment-check + 集成测试）
    → 通过 → L3→L2 拼装
      → 拼装评审（模块接口对齐 + 模块测试）
      → 通过 → L2→L1 拼装
        → 拼装评审（端到端测试）
        → 通过 → L1→L0 成品
```

**硬规则**：低层级拼装未通过验证前，不得进行高层级拼装。

**阻断范围**：
- 包级评审失败 → 仅阻断该 packet 向上拼装，不影响同 Stage 的其他 packet
- 拼装评审失败 → 仅阻断该拼装层级向上拼装，已完成的其他层级不受影响
- Stage 6 gate 失败 → 整个 Stage 6 不得进入 Stage 7，触发全局复评
- 判定条件：单个 packet Critical 未修复且超过 3 轮，或拼装覆盖率 < 阈值，或最终集成测试失败

## 5. Checker 详细定义

本契约依赖的 7 个 checker 定义如下（完整索引见 `checkers/index.yaml`）：

### 5.1 design-plan-bidirectional-ref-check

- **mode**: automated（需人工确认 exceptions）
- **scope**: design doc, dev plan, `artifacts/bidirectional-ref-matrix.yaml`
- **输入**: `tasks/<task-id>/artifacts/design.md`（§14 章节）、`tasks/<task-id>/artifacts/dev-plan.yaml`（packet manifest）
- **算法**:
  1. 提取 Design §14 所有 STEP（正则匹配 `STEP\s+\d+[a-z]?`，匹配 `STEP 1`、`STEP 4a`；不跨段匹配，即 §14.1 的 STEP 1 与 §14.2 的 STEP 1 视为不同 STEP）
  2. 提取 Dev Plan 所有包的 `@ref` 字段（格式：`Design §14.x STEP N`，支持 `N` 或 `N[letter]`）
  3. 标准化匹配：忽略 `Design ` 前缀和章节号前缀，只比较 `STEP N` 部分；允许 1:N 映射（一个 STEP 可被多个包引用，一个包可引用多个 STEP）
  4. 计算正向覆盖率：有 ≥1 个包引用的 STEP / 总 STEP 数
  5. 计算反向覆盖率：有 ≥1 个 `@ref` 的包 / 总包数
  6. 检查 exceptions 中每个 orphan_step/orphan_packet 是否有 `approved_by` 字段且非空
  7. 检查所有 deferred 项是否有 `deferred_expiry` 字段（ISO 8601 日期，不得超过当前任务结束日期）
- **输出**: YAML 格式的覆盖率报告（schema 见 §6.3）
- **失败语义**: 任一覆盖率 < 95%，或存在未审批 orphan，或存在无 `deferred_expiry` 的 deferred 项 → contract gate blocked
- **CI 退出码**: 0=pass, 2=contract-block

### 5.2 packet-size-check

- **mode**: automated
- **scope**: code files, dev plan
- **输入**: `tasks/<task-id>/src/**/*`（代码文件，排除 `node_modules/`、`vendor/`、`*.generated.*`）、`tasks/<task-id>/artifacts/dev-plan.yaml`
- **有效代码行定义**:
  - 使用 `cloc --by-file --quiet` 提取逻辑行数（SLOC），排除空白行和注释行
  - TypeScript/JavaScript: 排除 `import`/`require` 语句和 `//` / `/* */` 注释；`interface`/`type` 声明计入有效行
  - Python: 排除 `import` 和 docstrings；类型注解计入有效行
  - JSON/YAML/Config: 无注释语法的文件直接豁免，不计算行数
  - 生成代码（`*pb.go`、`*generated.ts`、GraphQL codegen 等）：自动豁免，不计入统计
- **算法**:
  1. 对每个代码文件运行语言适配的行数统计
  2. 对比 Dev Plan 中的 `estimated_lines` 字段（如缺失，跳过对比，仅检查 oversized 声明）
  3. 若文件 > 50 行，检查 Dev Plan 中对应包的 `oversized` 是否为 true，`oversized_reason` 是否为 4 类允许值之一，`oversized_review` 是否有评审人 ID
- **失败语义**: 文件 > 50 行且无完整 oversized 声明 → professional gate failed
- **CI 退出码**: 0=pass, 1=professional-fail

### 5.3 code-packet-annotation-check

- **mode**: automated
- **scope**: source code
- **输入**: 本次 git diff 中新增/修改的所有代码文件（排除 `*.json`、`*.yaml`、`*.sql`、无注释语法文件）
- **"文件头部"定义**: 文件前 20 行，或第一个非注释/非空白 token 之前（取较小值）
- **算法**:
  1. 对每个代码文件提取头部区域，匹配 `@packet\s+\{?\w+[-_]?\w+\}?` 格式
  2. 检查 `@packet` 值是否在 Dev Plan packet manifest 中存在（支持驼峰/连字符/下划线命名，大小写敏感）
  3. 检查是否包含必填字段：`@input`、`@output`、`@contract`、`@ref`、`@test`
  4. 检查 `@oversized` 若为 true，则必须有 `@oversized_reason`
  5. 支持多 `@ref`（一个包对应多个 STEP）：格式为逗号分隔列表或重复 `@ref` 行
- **失败语义**: 缺失 `@packet` 注释、缺失必填字段、或 `@packet` 值不在 Dev Plan 中 → professional gate failed
- **CI 退出码**: 0=pass, 1=professional-fail

### 5.4 orphan-code-detection

- **mode**: hybrid（工具提取 + 人工确认）
- **scope**: git diff, dev plan, source code
- **语言支持**: TypeScript/JavaScript（主目标）、Python、Go；其他语言按相同原则扩展
- **输入**: 本次变更的 git diff、Dev Plan packet manifest
- **算法**:
  1. 语言检测：按文件扩展名 `.ts`/`.tsx`/`.js`/`.jsx` / `.py` / `.go` 区分
  2. 按语言提取新增公开符号：
     - **TypeScript/JavaScript**: `export function`, `export class`, `export const`, `export async function`, `export default class/function`, `module.exports.xxx`
     - **Python**: 模块级别的 `def `（缩进为 0）且函数名不以 `_` 开头；模块级别的 `class `（缩进为 0）
     - **Go**: `func ` 且首字母大写的函数/方法（exported）；`type ` 定义的 `struct`/`interface`
  3. 与 Dev Plan 中的包名/函数签名匹配（支持驼峰/连字符/下划线命名归一化）
  4. 无法匹配的列为 orphan code 候选
  5. 人工确认：是否属于 glue code？是否应补充到 Dev Plan？
- **失败语义**: 存在未解释的 orphan code → professional gate request_changes

### 5.5 exception-path-coverage-check

- **mode**: manual（评审 Agent 执行）
- **scope**: source code, design doc §14.7
- **执行步骤**:
  1. 评审 Agent 读取 Design §14.7 异常传播边界图，建立「异常类型 → 传播路径 → 终点」对照表
  2. 遍历本次变更的所有代码文件，提取每个 `try/catch/throw/raise/Error` 位置及所在函数名
  3. 对每个提取的异常处理点，在对照表中查找对应设计定义
  4. 记录匹配结果：`matched`（有设计定义）、`unmatched`（无设计定义）、`partial`（有异常类型但传播终点不一致）
  5. 对 `unmatched` 和 `partial` 项，判断是否为新增异常路径（对比基线版本或设计文档历史）
  6. 若是新增路径，检查是否属于 glue code 或已记录在 `exceptions/` 目录的 `verification_exception`
  7. 生成 `exception-path-coverage-check` 报告，列出所有 `unmatched`/`partial` 项及修复建议
- **失败语义**: 存在未定义的异常路径 → professional gate request_changes

### 5.6 state-transition-coverage-check

- **mode**: manual（评审 Agent 执行）
- **scope**: source code, design doc §14.x 状态变更追踪
- **执行步骤**:
  1. 评审 Agent 读取 Design 状态变更追踪和状态机定义，建立「当前状态 → 条件 → 下一状态」对照表
  2. 遍历本次变更的所有代码文件，提取每个状态赋值语句（如 `state = X`, `setState(X)`, `this.status = Y`, `self._state = Z`）及所在上下文
  3. 对每个状态赋值点，在对照表中查找对应设计定义
  4. 记录匹配结果：`matched`（有设计定义）、`unmatched`（无设计定义）、`partial`（有状态但转换条件不一致）
  5. 对 `unmatched` 和 `partial` 项，判断是否为新增状态转换（对比基线版本或设计文档历史）
  6. 若是新增转换，检查是否属于设计文档已批准的变更或已记录在 `exceptions/` 目录
  7. 生成 `state-transition-coverage-check` 报告，列出所有 `unmatched`/`partial` 项及修复建议
- **失败语义**: 存在未追踪的状态变更 → professional gate request_changes

### 5.7 assembly-interface-alignment-check

- **mode**: automated（有类型语言）/ manual（无类型语言）
- **scope**: 拼装后的代码；主目标为有静态类型系统的语言（TypeScript, Python with type hints, Go, Rust, Java 等）
- **无类型语言降级**: 纯 JavaScript（无 JSDoc/TypeScript）项目降级为人工检查，由评审 Agent 按 §14 伪代码逐条核对函数签名、参数顺序、返回值及调用约定
- **输入**: 拼装后的代码（TypeScript `tsc --noEmit` / Python `mypy` / Go `go build` / Rust `cargo check` 等）
- **算法**:
  1. 运行类型检查器，收集所有类型错误和接口不匹配报告
  2. 检查跨模块/跨包的接口调用类型是否匹配（参数类型、返回类型、泛型约束）
  3. 检查函数签名是否与 §14 伪代码一致（参数个数/类型/顺序、返回类型、可选参数、`async` 修饰符）
  4. 对无类型语言项目，评审 Agent 手动比对关键路径的函数签名与 §14 STEP 定义
- **失败语义**: 类型不匹配或签名不一致 → 阻断拼装

## 6. 审计执行机制

### 6.1 持续审计（Intra-Stage）

| 审计项 | 触发时机 | 执行者 | 产出 | 阻断级别 |
|-------|---------|--------|------|---------|
| 代码缺少 @packet 注释 | 每次 Write/Edit 工具调用后 | 主线程自检 | warning | warning（不阻断） |
| 新增 orphan 函数 | git diff 时 | `orphan-code-detection` checker | orphan 列表 | 阻断拼装 |
| 包行数超限 | 编码完成后 | `packet-size-check` | oversized 报告 | 阻断包级评审 |
| 异常路径未定义 | 代码评审时 | 评审 Agent | finding (major) | 计入评审 |

#### 6.1.1 主线程自检清单（Intra-Stage Self-Check Mini-Checklist）

主线程在每次 Write/Edit 工具调用后、每次拼装前，必须执行以下自检（目标耗时 <30 秒）：

| # | 检查项 | 通过标准 | 失败处理 |
|---|--------|---------|---------|
| 1 | 文件头部有 `@packet` | 前 20 行内找到 `@packet <id>` | 立即补充注释 |
| 2 | `@packet` ID 在 Dev Plan 中存在 | manifest 中有该 packet 条目 | 核对拼写；若为新包则先更新 Dev Plan |
| 3 | 新增公开符号有来源 | 新增 `export`/`def`/`func` 能在 Dev Plan 中找到对应包 | 标记为 orphan candidate，等待确认 |
| 4 | 异常处理有设计来源 | 新增 `try/catch/throw` 在 §14.7 中有对应路径 | 记录到 exception-path-finding 列表 |
| 5 | 状态变更有追踪 | 新增状态赋值在 Design 状态变更追踪中有定义 | 记录到 state-transition-finding 列表 |

> **执行约定**：自检不阻断当前 Write/Edit 操作，但产出 warning；所有 warning 必须在进入下一阶段（拼装或提交）前清零或记录为已接受的 exception。

### 6.2 阶段审计（Inter-Stage）

| 审计项 | 触发时机 | 执行者 | 产出 |
|-------|---------|--------|------|
| 详设-计划双向引用 | Stage 4→5 转换 | `design-plan-bidirectional-ref-check` | 双向引用覆盖率报告 |
| 计划-代码溯源 | Stage 6 结束时 | `code-packet-annotation-check` + `orphan-code-detection` | 溯源完整性报告 |
| 异常路径覆盖 | Stage 6 评审时 | 评审 Agent | exception-path-coverage-check 报告 |
| 拼装接口对齐 | 每级拼装后 | `assembly-interface-alignment-check` | 类型对齐报告 |

### 6.3 审计报告模板

每个审计产出必须写入 `tasks/<task-id>/reviews/audit-<checker_id>-<timestamp>.yaml`：

```yaml
audit_id: "tk-xxx-design-plan-bidirectional-ref-check-20260511"
checker_id: "design-plan-bidirectional-ref-check"
task_id: "tk-xxx"
run_at: "2026-05-11T10:00:00Z"
status: "passed | failed | warning"
coverage:
  design_to_plan: 98   # §14 STEP 被覆盖比例
  plan_to_design: 100  # 包有 @ref 比例
  orphan_steps: []      # 未被覆盖的 STEP
  orphan_packets: []    # 无 @ref 来源的包
findings:
  - severity: major
    description: "TM-005 包无 @ref 指向 Design §14"
    remediation: "补充 @ref 或标记为 glue_code"
evidence_ref: "tasks/tk-xxx/reviews/audit-evidence-design-plan-ref.md"
gate_impact: "contract gate blocked if failed"
```

## 7. 输出与投影

本契约产出的正式文件：
- `tasks/<task-id>/artifacts/bidirectional-ref-matrix.yaml` — 设计-计划双向引用矩阵
- `tasks/<task-id>/reviews/audit-*.yaml` — 审计报告
- `tasks/<task-id>/reviews/packet-level-reviews/` — 包级评审结果
- `tasks/<task-id>/reviews/assembly-reviews/` — 拼装级评审结果
- `tasks/<task-id>/exceptions/orphan-code-exceptions.yaml` — orphan code 豁免记录

### 7.1 轻量级评审回执（Lightweight Review Receipt）

包级评审和拼装评审通过后，评审人必须产出回执文件。回执设计目标：机器可解析、人工可读、生成成本 <2 分钟。

**包级回执**: `tasks/<task-id>/reviews/packet-level-reviews/<packet-id>-receipt.yaml`

```yaml
receipt_id: "pkt-auth-service-receipt-001"
packet_id: "auth-service"
reviewer: "agent-code-reviewer"
reviewed_at: "2026-05-11T14:00:00Z"
verdict: "passed | request_changes | blocked"
criteria:
  - item: "代码有 @packet 注释"
    result: "pass"          # pass / fail / na
  - item: "包大小 ≤50 行或有 oversized 声明"
    result: "pass"
  - item: "无未解释的 orphan 代码"
    result: "pass"
    notes: "发现 1 处 helper 函数，已确认为 glue code 并记录"
findings: []  # 空数组表示无问题；非空时每项需有 severity + description
```

**拼装级回执**: `tasks/<task-id>/reviews/assembly-reviews/<assembly-level>-receipt.yaml`

```yaml
receipt_id: "asm-l4-to-l3-receipt-001"
assembly_level: "L4_to_L3"   # L4_to_L3 | L3_to_L2 | L2_to_L1
reviewer: "agent-architect-reviewer"
reviewed_at: "2026-05-11T14:00:00Z"
verdict: "passed | request_changes | blocked"
criteria:
  - item: "L4 包级评审全部通过"
    result: "pass"
  - item: "接口类型对齐"
    result: "pass"
  - item: "无新增 orphan 代码"
    result: "pass"
  - item: "异常路径覆盖"
    result: "pass"
    notes: "2 处异常路径已在 §14.7 中定义"
findings: []
```

> **回执校验规则**：
> - 必须包含 `verdict` 和 `criteria` 两个字段
> - `criteria` 每项必须有 `result`，取值 `pass`/`fail`/`na`
> - 若 `verdict=passed`，则所有 `result≠na` 的 criteria 必须为 `pass`
> - 回执缺失视为拼装未验证，阻断向上拼装

## 8. 边界

### 8.1 与其他契约的边界

- 与 `lego-assembly-workflow`：本契约定义追溯链规则，lego-assembly-workflow 定义拼装流程
- 与 `work-packet-governance`：本契约定义包大小约束和溯源注释，work-packet-governance 定义拆包规则
- 与 `verification-checker`：本契约的 checkers 注册到 verification-checker catalog
- 与 `document-depth`：本契约要求 `implementation_blueprint` 深度必须包含 §14-§18

### 8.2 不覆盖的范围

本契约不定义：
- 具体代码的写法（由工程标准和方案详设定义）
- 评审的具体技术细节（由 Stage checklist 定义）
- 工具的具体调用方式（由 skill-tool-mapping 定义）

## 9. 异常边界

本契约的异常处理遵循 `exception-governance` 的分类体系。以下偏离情况按 `exception-governance` §4 记录为对应异常类型：

**允许偏离**（须记录到 `exceptions/` 目录）：
- Trivial 任务：跳过正式追溯链 → `delivery_mode_exception`
- 胶水代码：允许不引用 §14，但必须在 Dev Plan 中标记并声明理由 → `verification_exception`（原因代码: `glue_code`）
- 用户明确说"快速迭代"：减少追溯层级 → `delivery_mode_exception`（须附用户原话截图或消息引用）

**永远不允许偏离**（优先于任何 exception，即使 `exception-governance` 中未显式列出）：
- Standard/Complex 任务无双向引用矩阵
- 无 @packet 注释的代码文件进入拼装
- orphan 代码未经解释就宣称完成
- 低层级拼装未验证就向上拼装

> 注：上述"永远不允许偏离"项已同步为 `exception-governance` §5 不可豁免规则的补充条款。若两者冲突，以本契约为准。

## 10. 验证要求

| checker_id | 检查内容 | 失败后果 |
|-----------|---------|---------|
| `design-plan-bidirectional-ref-check` | 双向引用覆盖率 ≥95% | contract gate blocked |
| `packet-size-check` | 包大小 ≤50 行或声明 oversized_justified | professional gate failed |
| `code-packet-annotation-check` | 代码文件有 @packet 注释 | professional gate failed |
| `orphan-code-detection` | 无未解释的 orphan 代码 | professional gate request_changes |
| `exception-path-coverage-check` | 异常路径在设计中有定义 | professional gate request_changes |
| `state-transition-coverage-check` | 状态变更在设计中有追踪 | professional gate request_changes |
| `assembly-interface-alignment-check` | 拼装接口类型对齐 | 阻断拼装 |
