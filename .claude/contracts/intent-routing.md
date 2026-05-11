---
contract_id: "intent-routing"
title: "意图路由契约"
owner: "claude-code"
scope: "用户意图 → action_family → 契约 → 工具 → Skill 的一键路由决策"
trigger: "每次非 Trivial 任务执行前，热路径 Step 1-2 之间"
required_inputs: ["用户原始请求"]
required_contracts: []
required_skills: []
verification_checks: ["intent-classified", "contracts-loaded", "tools-selected", "skills-identified"]
exceptions: ["trivial-task-skip"]
supersedes: []
version: 1
last_reviewed_at: "2026-05-01"
---

# 意图路由契约（Intent Routing Contract）

## 1. 目的

定义「用户一句话 → 完整路由决策」的一步到位机制，解决：
- 看到用户请求后，立刻知道要遵守哪些规范
- 立刻知道要调用哪些工具/Skill/MCP
- 不需要在 3 个不同文件间跳转查找

**执行顺序**：读本文 → 查 §3 路由总表 → 按结果加载契约/工具 → 进入热路径 Step 3。

## 2. 适用范围

所有非 Trivial 任务必须在执行前运行本路由。Trivial 任务可跳过正式路由，但仍需遵守 Karpathy 原则。

## 3. 意图 → 完整路由总表

### 3.1 澄清意图（clarify）

| 用户说 | action_family | 激活契约 | 首选工具 | 推荐 Skill |
|--------|--------------|---------|---------|-----------|
| "解释 XX"、"这是什么"、"帮我看看" | `clarify` | `intent-capture` | `AskUserQuestion`, `Read` | `claude-code-guide`（问功能） |
| "XX 是什么意思"、"这个怎么用" | `clarify` | `intent-capture` | `Read`, `AskUserQuestion` | — |

### 3.2 调研意图（research）

| 用户说 | action_family | 激活契约 | 首选工具 | 推荐 Skill |
|--------|--------------|---------|---------|-----------|
| "调研 XX"、"对比 A 和 B"、"搜一下" | `research` | `context-governance`, `engineering-standards` | `WebSearch`, `WebFetch`, `Read`, `Grep` | `researcher`, `Explore` |
| "找一下 XX 在哪"、"代码在哪" | `research` | `context-governance` | `Grep`, `Glob`, `code-review-graph MCP` | `Explore` |
| "竞品分析"、"行业方案" | `research` | `context-governance` | `WebSearch`, `WebFetch` | `researcher` |

### 3.3 撰写意图（authoring）

| 用户说 | action_family | artifact_kind | 激活契约 | 首选工具 | 推荐 Skill |
|--------|--------------|-------------|---------|---------|-----------|
| "写 PRD"、"写需求文档" | `authoring` | `prd` | `task-tracking`, `document-depth` | `WebSearch`, `Write`, `Read` | — |
| "写设计文档"、"写架构" | `authoring` | `design-spec` | `task-tracking`, `document-depth`, `architecture-blueprint` | `Read`, `Grep`, `Write`, `code-review-graph MCP` | `Plan` |
| "写规范"、"写契约" | `authoring` | `contract` | `task-tracking`, `contract-schema` | `Read`, `Write`, `Edit` | — |
| "写 PPT"、"做演示"、"做笔记" | `authoring` | `prd` | `task-tracking`, `document-depth` | `Write`, `Read` | `anything-notebooklm` |
| "写报告"、"写分析" | `authoring` | `intent` | `task-tracking`, `document-depth` | `Read`, `Write`, `Grep` | — |

### 3.4 实现意图（implementation）

| 用户说 | action_family | 激活契约 | 首选工具 | 推荐 Skill |
|--------|--------------|---------|---------|-----------|
| "写代码"、"改代码"、"实现 XX" | `implementation` | `task-tracking`, `context-governance`, `work-packet-governance`, `architecture-blueprint`, `lego-assembly-workflow`, `skill-tool-mapping`, `cluster-orchestration` | `Read`, `Edit`, `Write`, `Bash` | `Plan` |
| "改配置"、"调参数" | `implementation` | `task-tracking`, `work-packet-governance` | `Read`, `Edit`, `Bash` | — |
| "做 UI"、"写前端"、"设计页面" | `implementation` | `task-tracking`, `work-packet-governance` | `Read`, `Write`, `Edit`, `Bash` | `frontend-design` |
| "写测试"、"加单测" | `implementation` | `task-tracking`, `work-packet-governance` | `Read`, `Write`, `Edit`, `Bash` | `test-reviewer` |

### 3.5 验证意图（verification）

| 用户说 | action_family | 激活契约 | 首选工具 | 推荐 Skill |
|--------|--------------|---------|---------|-----------|
| "跑测试"、"验证 XX" | `verification` | `verification-checker`, `review-gates`, `engineering-standards` | `Bash`, `Read` | `test-reviewer` |
| "检查 XX 对不对"、"看看有没有问题" | `verification` | `verification-checker`, `review-gates` | `Read`, `Grep`, `code-review-graph MCP` | — |

### 3.6 评审意图（review）

| 用户说 | action_family | 激活契约 | 首选工具 | 推荐 Skill |
|--------|--------------|---------|---------|-----------|
| "评审 XX"、"审一下"、"review" | `review` | `review-gates`, `review-consistency-checklist` | `Read`, `Grep`, `Glob`, `code-review-graph MCP` | `architect-reviewer`, `code-reviewer`, `prd-reviewer`, `test-reviewer` |
| "深度评审"、"正式评审" | `review`（升级 Complex） | 同上 | 同上 + 独立 Agent | 3-4 个独立评审 Agent |
| "增强评审"、"加深度度" | `review` | 同上 | 同上 | `superpowers` |

### 3.7 收口意图（closeout）

| 用户说 | action_family | 激活契约 | 首选工具 | 推荐 Skill |
|--------|--------------|---------|---------|-----------|
| "收口"、"归档"、"整理" | `closeout` | `closeout`, `task-readme-lifecycle`, `dirty-hygiene`, `completeness-audit` | `Read`, `Bash`, `Edit` | — |
| "清理脏文件"、"整理任务" | `closeout` | `dirty-hygiene`, `closeout` | `Bash`, `Read` | — |

## 3.8 强制检查器绑定（Mandatory Checker Binding）

每个非 Trivial 路由决策必须在 `route-projection.yaml` 中输出 `mandatory_checkers[]`。该字段在 phase transition 时被机械验证，不可跳过。

| action_family | artifact_kind | mandatory_checkers | 阻断 gate |
|--------------|---------------|-------------------|-----------|
| `authoring` | `contract` | `route-output-closure-check`, `state-projection-alignment-check`, `dangling-reference-check` | contract |
| `authoring` | `prd` | `route-output-closure-check`, `state-projection-alignment-check` | contract |
| `authoring` | `design-spec` | `route-output-closure-check`, `state-projection-alignment-check`, `dangling-reference-check` | contract |
| `implementation` | `code` | `dirty-chain-prevention-check`, `context-budget-delegation-check`, `dangling-reference-check` | professional, contract |
| `verification` | `verification-report` | `review-consistency-check`, `state-projection-alignment-check` | contract |
| `review` | any | `review-consistency-check` | contract |
| `closeout` | `git-closeout` | `dirty-hygiene-closure-check`, `dangling-reference-check`, `stale-projection-cleanup-check` | contract |

**硬规则**：
- `mandatory_checkers` 不可协商。若某个 checker 不可用，必须创建 `verification_exception` 异常对象，声明 `compensating_controls`（人工验证方法）。
- 异常必须在 `00-task-state.yaml` 的 `active_exceptions` 中登记，且 `status=approved`，方可进入 phase transition。

## 4. 路由执行流程

```
收到用户请求
  │
  ├─ Trivial?（单行/纯概念/配置/<30min）
  │  ├─ 是 → 主线程自检，跳过正式路由
  │  └─ 否 ↓
  │
  ├─ Step 1: 判定 action_family + artifact_kind
  │  → 查 §3 路由总表匹配行
  │
  ├─ Step 2: 加载「激活契约」列所有契约
  │  → 读取 .claude/contracts/<contract-id>.md
  │
  ├─ Step 3: 准备「推荐 Skill」列工具
  │  → 检查是否可用（Skill 是否在 available skills 列表）
  │  → 不可用 → fallback 或记录 exception
  │
  ├─ Step 4: 意图确认
  │  → "我将为你[task type]，涉及[scope]，预期产出[output]，需加载[contracts]。是否继续？"
  │
  └─ Step 5: 执行 → 评审 → 收口
```

## 5. 路由冲突解决

当用户请求同时匹配多个 action_family 时：

| 匹配情况 | 解决方案 |
|---------|---------|
| research + authoring | 先 research 后 authoring（先调研再撰写） |
| implementation + review | 先 implementation 后 review（先实现再评审） |
| authoring + verification | 先 authoring 后 verification（先产出再验证） |
| clarify + 任何其他 | 先 clarify 明确意图再进入其他族 |
| 多个 authoring 匹配 | 取 artifact_kind 最精确的匹配行 |
| research + implementation | 先 research 后 implementation（先调研再实现） |
| review + closeout | 先 review 后 closeout（先评审再归档） |
| verification + review | 先 verification 后 review（先验证再审查） |
| clarify + research | 先 clarify 后 research（先澄清再调研） |
| 未列出的组合 | 按依赖顺序执行：clarify → research → authoring → implementation → verification → review → closeout |

### 5.1 Trivial 豁免负面清单

以下场景**永远不得**判定为 Trivial，即使满足 <30 分钟/单文件条件：

| 场景 | 原因 |
|------|------|
| 涉及代码实现/修改 | 需要走 implementation 流程 |
| 涉及多个 action_family | 需要执行编排判定 |
| 需求含"设计"、"架构"、"评审" | 需要多 Agent 评审 |
| 需求含"系统性"、"深入"、"完整" | 用户已声明复杂度为 Complex |
| 跨模块/跨文件改动 | 需要架构拆解 |

### 5.2 兜底匹配规则

当用户请求不匹配 §3 任何明确关键词时，按以下规则判定默认 action_family：

| 用户请求特征 | 默认 action_family |
|-------------|-------------------|
| 含技术动词（写/改/实现/创建/删除/优化） | `implementation` |
| 含疑问词（什么/为什么/怎么/如何/是不是） | `clarify` |
| 含"调研"、"分析"、"对比"、"查一下" | `research` |
| 含"文档"、"报告"、"总结"、"整理" | `authoring` |
| 含"测试"、"验证"、"跑一下" | `verification` |
| 含"review"、"审"、"检查" | `review` |
| 含"收口"、"归档"、"清理" | `closeout` |
| 无法判定 | `clarify`（向用户确认意图） |

## 6. 输出与投影

本契约产出的正式文件：
- `route-projection.yaml` 的 `intent_route` 字段 — 路由决策记录，包含 `action_family`, `artifact_kind`, `mandatory_checkers[]`
- `00-task-state.yaml` 的 `action_family` + `artifact_kind` 字段

## 7. 边界

### 7.1 与其他契约的边界

- 与 action-governance：本契约是 action_family 的快速匹配入口，详细模型仍见 action-governance
- 与 skill-tool-mapping：本契约是工具路由的一键查询，详细工具注册表仍见 skill-tool-mapping
- 与 task-routing：本契约聚焦"意图→动作→工具"的一键路由，task-routing 聚焦"归属/模式/工作流"的多维路由

### 7.2 不覆盖的范围

本契约不定义：
- action_family 的详细语义（由 action-governance 定义）
- 工具的详细注册表（由 skill-tool-mapping 定义）
- 任务归属/模式/工作流判定（由 task-routing 定义）
