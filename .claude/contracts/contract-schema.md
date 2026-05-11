---
contract_id: "contract-schema"
title: "契约结构规范"
owner: "claude-code"
scope: "所有契约的统一元数据信封 + 10章节布局 + Checker/Narrative分离"
trigger: "新契约编写前 / 现有契约结构性修订时"
required_inputs: []
required_contracts: []
required_skills: []
verification_checks: ["metadata-envelope-complete", "10-section-layout", "required-fields-present"]
exceptions: ["spec-simplified"]
supersedes: []
version: 1
last_reviewed_at: "2026-05-01"
---

# Contract Schema（契约结构规范）

> 本契约定义所有下层契约的统一结构模板，确保新增契约不再各自发明字段和章节。
> Checker 可从固定位置提取元数据，Narrative 与 Machine-Consumable 字段分离。

## 1. 目的

解决三类问题：
1. 新契约结构各自不同，无法编写通用格式检查器
2. Checker 不知道哪些字段是稳定可消费的
3. 叙述性说明与机器可消费元数据混在一起

## 2. 适用范围

适用于 `.claude/contracts/` 目录下所有契约文件。新契约必须遵守；现有契约在下次实质性修订时补齐。

## 3. 核心原则

- **一套 schema，多份契约**：契约语义各自不同，但结构与元数据必须统一
- **元数据先于叙述**：Checker 优先消费 metadata envelope，narrative body 用于解释原因和边界
- **Checker 可消费字段必须稳定**：必须能从固定位置提取，不得把必须字段埋在叙述段落里
- **Schema 不替代语义**：本契约只定义契约怎么写，不定义每份契约的具体业务规则

## 4. 统一元数据信封（Metadata Envelope）

每份契约必须在 `## 1. 目的` 之前声明以下元数据块：

```yaml
---
contract_id: "契约唯一标识（如 task-tracking）"
title: "契约中文标题"
owner: "契约维护者（如 claude-code）"
scope: "约束范围简述"
trigger: "什么时候必须读取本契约"
required_inputs: ["上游依赖列表"]
required_contracts: ["依赖的其他契约 ID"]
required_skills: ["需要的技能列表，可为空"]
verification_checks: ["本契约要求的检查项"]
exceptions: ["允许的异常类别"]
supersedes: ["被替代的旧契约 ID"]
version: 1
last_reviewed_at: "YYYY-MM-DD"
---
```

### 4.1 字段解释

| 字段 | 含义 |
|------|------|
| `contract_id` | 稳定唯一标识，与 registry.yaml 中的 entry key 对应 |
| `title` | 契约中文标题，不能只存在于 H1 |
| `owner` | 契约维护者，如 `claude-code` |
| `scope` | 约束哪些任务、动作或产物 |
| `trigger` | 什么时候必须读取本契约 |
| `required_inputs` | 执行本契约至少需要哪些上游对象 |
| `required_contracts` | 依赖的其他契约 ID 列表 |
| `required_skills` | 要求优先调用的 skills |
| `verification_checks` | 本契约至少要求的检查项 |
| `exceptions` | 允许引用哪些 exception classes |
| `supersedes` | 替代了哪些旧契约 |
| `version` | 契约版本号，每次实质性修订 +1 |
| `last_reviewed_at` | 正式评审通过后的日期 |

### 4.2 编码位置

元数据信封的 Canonical 编码位置为 YAML front matter（`---` 分隔符之间）。Checker 从文件开头解析此块。

## 5. 统一章节布局（Canonical Section Layout）

每份契约正文至少应包含以下章节（按顺序）：

| 序号 | 章节名 | 语义 |
|------|--------|------|
| 1 | 目的 | 本契约解决什么问题 |
| 2 | 适用范围 | 哪些场景/任务/产物适用，哪些不适用 |
| 3 | 核心原则 | 不可妥协的基础规则 |
| 4 | 规则/决策模型 | 具体的执行规则、判断条件、枚举值 |
| 5 | 输出与投影 | 向下游提供什么信息，如何投影到状态文件 |
| 6 | 与其他契约的边界 | 与哪些契约有接口关系，各自的职责边界 |
| 7 | 异常边界 | 允许哪些例外，不允许哪些例外 |
| 8 | 验证要求 | 如何验证本契约被遵守 |
| 9 | 迁移策略 | 如何从旧状态过渡到新状态 |
| 10 | 非目标 | 本契约不负责的事情 |

**规则**：
- 章节名允许小范围调整，但语义不得缺失
- 对于 Spec 类文件（后缀 `-spec.md`），可简化为：目的 → 规则 → 触发条件 → 违反处理
- 章节顺序不得打乱，1→10 递增

## 6. Checker-Consumable vs Narrative 分离

| 类型 | 内容 | 位置 |
|------|------|------|
| **Checker-Consumable** | 元数据信封全部字段、registry binding、supersede relation、required_contracts、required_skills、verification_checks | YAML front matter + §4 规则段 |
| **Narrative** | 背景说明、设计理由、反例、风险说明 | 各章节正文叙述 |

**硬规则**：
- Narrative 不能替代 Checker-Consumable 元数据
- Checker-Consumable 元数据不能只出现在 Narrative 里

## 7. 验证要求

每份契约必须通过以下检查：
1. 元数据信封完整，所有必填字段存在
2. 元数据信封位于文件顶部 YAML front matter
3. 契约声明了 `required_contracts`、`verification_checks`、`exceptions` 字段
4. 契约正文覆盖了 §5 要求的语义章节
5. `contract_id` 与 `registry.yaml` 中的 entry key 一致

## 8. 迁移策略

| 阶段 | 动作 |
|------|------|
| 阶段 1 | 新契约立即按本 schema 编写 |
| 阶段 2 | 现有契约在下次实质性修订时补齐元数据信封 |
| 阶段 3 | 编写通用契约格式检查器，校验所有契约符合本 schema |

## 9. 非目标

本契约不负责：
- 定义每份契约的业务语义
- 决定某份契约是否 active（由 registry.yaml 负责）
- 定义 review gate 的细节（由 review-gates-contract.md 负责）
- 授权 exception（由 exception-governance.md 负责）
