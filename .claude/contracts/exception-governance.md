---
contract_id: "exception-governance"
title: "异常治理契约"
owner: "claude-code"
scope: "无法遵守规范时的异常管理机制，禁止静默降级规则"
trigger: "任何规范偏离必须走异常记录，不得口头例外"
required_inputs: []
required_contracts: []
required_skills: []
verification_checks: ["5-exception-class", "non-exemptible-rules", "exception-object-complete", "explicit-logging"]
exceptions: ["non-exemptible-rules-never-waivable"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 异常治理契约（Exception Governance Contract）

## 1. 目的

定义在无法遵守规范时的异常管理机制，禁止静默降级规则。

## 2. 适用范围

本契约适用于所有 Standard/Complex 任务中任何无法遵守已有契约的场景。
Trivial 任务的例外通过主线程自检记录，不需要正式 exception 对象。

## 3. 核心原则

1. **禁止静默降级** — 任何规范偏离必须显式记录，不得"这次先不按规范来"
2. **不可豁免规则永远不可豁免** — §5 列出的 5 条规则在任何情况下不得通过异常绕过
3. **异常可追溯** — 每个异常必须有批准者、过期时间和解除条件

## 4. 规则与决策模型

### 4.1 5 类异常

| 异常类型 | 含义 |
|---------|------|
| `parallelism_exception` | 无法达到最低并行要求 |
| `tooling_exception` | 必需工具/技能不可用 |
| `review_mode_exception` | 无法拉独立 reviewer |
| `verification_exception` | 无法运行必需 checker |
| `delivery_mode_exception` | 需要变更 delivery_mode |
| `mechanical_violation` | 违反机械执行规则（如跳过强制检查器、无 Evidence Lock 推进 phase） |
| `checker_unavailable` | 强制检查器未实现或无法运行，需人工证据替代 |

### 4.2 Fallback vs Exception 边界

| 情况 | 分类 |
|------|------|
| 同等能力工具替代 | fallback（不需要异常） |
| 减少 checker 数量 | exception |
| 减少 review 要求 | exception |
| 减少 evidence 要求 | exception |
| 降低并行度 | exception |

## 5. 不可豁免规则

以下规则永远不得通过异常豁免：
1. ownership 判定（任务归属）
2. 破坏性操作的用户确认
3. 权限不足的升级路径
4. formal review 的 reviewer 可追溯性
5. blocked 后静默推进

## 6. 输出与投影

本契约产出的正式文件：
- `tasks/<task-id>/exceptions/<exception_id>.yaml` — 异常对象落盘位置
- `00-task-state.yaml` 的 `active_exceptions` 字段 — 异常索引
- 评审时 reviewer 通过 exception 完整性 checklist 验证异常记录

## 7. 异常对象

### 7.1 完整对象（Complex / 高风险异常）

```yaml
exception_id: exc-YYYYMMDD-NNN
class: <异常类型>
reason_code: <原因代码>
scope: <影响范围>
deviation: <偏离了什么规范>
authority: <谁批准的>
approved_by: <批准者>
created_at: <创建时间>
updated_at: <最后更新时间>
expires_at: <过期时间>
clear_condition: <什么条件下解除>
compensating_controls: [<补偿控制措施>, ...]
evidence_refs: [<证据路径>, ...]
status: requested | approved | expired | resolved
```

### 7.2 轻量对象（Standard / 低风险异常）

当异常为低风险且可逆时，可使用简化格式（仅 5 个必填字段）：

```yaml
exception_id: exc-YYYYMMDD-NNN
class: <异常类型>
deviation: <偏离了什么>
reason: <为什么>
approved_by: <主线程/用户>
status: approved
```

**必填字段**：`exception_id`, `class`, `deviation`, `reason`, `approved_by`。其余字段可省略（closeout 时统一补全）。

## 8. 异常批准模型

### 8.1 风险等级与批准者

| 风险等级 | 批准者 | 记录要求 |
|---------|--------|---------|
| 低风险可逆（如临时工具替代） | 主线程记录即可 | exception 对象落盘，status=approved |
| 权限/破坏性操作/delivery_mode 变更 | 必须用户批准 | exception 对象 + 用户确认证据 |
| 无批准权限的阻塞 | 报告用户并等待 | exception 对象 + status=requested，不推进 |

### 8.2 超时自动升级

| 当前级别 | 超时条件 | 升级动作 |
|---------|---------|---------|
| 主线程可批准的低风险异常 | 当前 task session 结束前未记录 | 自动升级到用户可见的 task state |
| 需用户批准的异常 | 用户 1 次交互周期未响应 | 报告用户并等待（status=requested），不自动推进 |
| blocked 状态下的异常 | 用户明确要求继续 | 按用户指令执行，风险记录到 exception |

### 8.3 多级升级路径

```
异常发现 → 主线程评估风险等级
  → 低风险可逆 → 主线程批准 → 记录 exception → 继续
  → 需用户批准 → 提交用户 → 用户批准 → 记录 exception → 继续
    → 用户未响应 → status=requested → 报告并等待
    → 用户拒绝 → status=blocked → 不推进
  → 无批准权限 → 报告用户 → 等待决策
```

### 8.4 批准审计

每个批准的异常必须可追溯：
- `approved_by` 字段必须填写（主线程 / 用户 / 其他 Agent）
- `evidence_refs` 必须指向批准证据（用户确认消息 / task state 记录）
- 评审时 reviewer 必须验证 exception 对象的完整性（§7 所有字段）

## 9. 异常必须显式记录

禁止"这次先不按规范来"的口头例外。任何规范偏离必须记录异常对象，包括原因、范围、补偿控制和过期时间。

## 10. 边界

### 10.1 与其他契约的边界

- 与 review-gates：异常治理不豁免 formal review（`conflicts_with: [review-gates]`）
- 与 task-tracking：异常记录是 task state 的一部分，但异常审批流程独立于 phase 推进
- 与 exception-governance 自身的不可豁免规则：这些规则不得被本契约的异常机制绕过

### 10.2 不覆盖的范围

本契约不定义：
- 具体契约的内容规范（由各契约自身定义）
- 评审的具体检查面（由 review-gates 定义）
- 运行时异常处理（本契约关注规范合规，不是代码运行时异常）

## 11. 迁移策略

从"口头例外"到正式异常对象的过渡：
1. 第一阶段：主线程开始记录 exception 对象（之前可能只是聊天中提到"这次不做了"）
2. 第二阶段：exception 对象与 task state 双向索引（active_exceptions 字段）
3. 第三阶段：评审 Agent 自动检查 exception 完整性（verification_checks 覆盖）

## 12. Checker Exception Rules（新增）

### 12.1 何时允许 Checker 例外

仅以下情况允许为 mandatory checker 创建 exception：

1. Checker 脚本物理不存在（未实现）
2. Checker 运行环境缺失（如依赖工具未安装）
3. Checker 对当前任务 scope 不适用（需在 exception 中论证）

**禁止**：
- "我已经人工检查过了"（这不是环境限制，是偷懒）
- "任务很小"（mandatory 与任务大小无关）
- "Checker 有 bug"（应修复 checker 或记录 bug exception 并升级）

### 12.2 Checker Exception 的最小内容

```yaml
exception_id: exc-YYYYMMDD-NNN
class: verification_exception | checker_unavailable
deviation: "未运行 <checker_id>，原因：<具体原因>"
reason: "<为什么当前无法运行>"
approved_by: "<批准者>"
compensating_controls:
  - "人工验证方法：<方法>"
  - "验证证据路径：<路径>"
  - "验证执行者：<agent-id>"
  - "验证时间：<ISO8601>"
evidence_refs:
  - "<manual_evidence_path>"
status: approved
```

### 12.3 未实现 Checker 的统一处理

对于 7 个未实现 checker，不单独为每个任务创建 exception。改为：

1. 在 `checkers/index.yaml` 中标记 `implementation_status: placeholder`
2. 任务初始化时，若 mandatory checker 列表包含 placeholder checker：
   - 自动创建轻量 exception（模板化）
   - 要求 agent 在 `manual_evidence` 中记录等效验证
3. closeout 时汇总所有 placeholder checker 的 exception，提示用户优先实现高频 checker

## 13. 非目标

本契约不追求：
- 零异常 — 某些场景下合理偏离规范是必要的，关键是显式记录
- 自动化批准 — 高风险异常仍需用户手动确认
- 替代契约 — 异常是契约无法遵守时的降级路径，不是契约的替代
