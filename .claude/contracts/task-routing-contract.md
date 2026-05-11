---
contract_id: "task-routing"
title: "任务路由契约"
owner: "claude-code"
scope: "任务开始时的7步路由决策，明确归属、模式、工作流和评审要求"
trigger: "每次任务动手之前，必须按固定顺序完成7步路由"
required_inputs: ["intent-capture产出（00-user-intent.md）"]
required_contracts: ["intent-capture"]
required_skills: []
verification_checks: ["7-step-routing-complete", "no-skip-no-reorder", "route-projection-written"]
exceptions: ["trivial-task-skip-full-routing", "continuous-task-chain-rerouting"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 任务路由契约（Task Routing Contract）

## 1. 目的

本契约定义任务开始时的 7 步路由决策，确保每个任务在动手前先明确归属、模式、工作流和评审要求。

## 2. 7 步路由顺序

路由必须按以下固定顺序执行，禁止跳步或倒序：

### Step 1: ownership_route

判定当前任务属于哪个归属：
- `codex-self`: Claude Code 自身的规范/能力/工具链建设
- `product`: 产品/项目开发（OpenClaw 或其他业务项目）
- `external`: 外部咨询、调研、问答

### Step 2: delivery_mode_route

判定交付模式：
- `full`（默认）: 正式开发任务，需走完整流程
- `quick`: 用户明确要求快速处理的小改动
- `advisory`: 纯讨论/翻译/摘要，不产出现实产物

**判定规则**：
- 用户说"简单做"/"草版"/"先看一下" → `quick`
- 涉及代码/架构/文档正式产出 → `full`
- 纯聊天/咨询 → `advisory`

### Step 3: task_chain_route

判定任务类型：
- `self_improvement`: Claude Code 自身能力/规范建设
- `project_build`: 项目/产品开发
- `research`: 调研/学习
- `review`: 独立评审
- `fix`: 修复/补丁

### Step 4: workflow_route

判定进入哪个初始工作流：
- `clarify`: 目标/范围不清晰，需要先澄清 → 对应 7 阶段 Stage 0
- `research`: 需要外部事实/调研/竞品分析 → 对应 7 阶段 Stage 1
- `direct_build`: 范围极小，可直接实现（trivially scoped）→ 对应 7 阶段 Stage 6 直跳
- `feasibility`: 高风险任务，需要先做可行性分析 → 对应 7 阶段 Stage 1-2
- `review`: 需要独立评审闭环 → 对应 7 阶段之外

**与 7 阶段 / 10 阶段的映射关系**：

| workflow_route | 7 阶段 | 10 阶段 (task-tracking) | 说明 |
|---------------|--------|------------------------|------|
| `clarify` | Stage 0 | clarify | 意图澄清 |
| `research` | Stage 1 | research | 深度学习/调研 |
| `feasibility` | Stage 1-2 | research → architecture-decomposition | 可行性→架构拆解 |
| `direct_build` | Stage 6 | build | 小范围直跳编码（Trivial 任务） |
| `review` | — | — | 独立评审，不在 7 阶段内 |

**完整阶段命名对齐表**（供 Agent 参考）：

| 7 阶段（中文，用户可见） | 10 阶段（英文，状态机） | workflow_route（英文，路由） |
|----------------------|---------------------|--------------------------|
| Stage 0 意图确认 | clarify | clarify |
| Stage 1 深度学习 | research | research |
| Stage 2 架构拆解 | architecture-decomposition | feasibility |
| Stage 3 PRD | spec | — |
| Stage 4 方案详设 | design | — |
| Stage 5 开发计划 | plan | — |
| Stage 6 编码 | build | direct_build |
| Stage 7 测试 | verify | — |
| — | acceptance | — |
| — | release-ready | — |

> **规则**：7 阶段模型是用户可见的主模型，10 阶段是状态机内部跟踪模型，workflow_route 是初始路由模型。Agent 在内部状态跟踪时使用 10 阶段英文值，与用户沟通时使用 7 阶段中文值。

### Step 5: execution_orchestration_route

判定执行编排模式：
- `mandatory_multi_agent`: 必须多 Agent 并行（覆盖 2+ 活动族、全仓库搜索、上下文预算逼近检查点）
- `recommended_multi_agent`: 建议多 Agent，但单线程也可接受
- `single_packet_direct`: 单一工作包，不需要分发
- `single_thread_exception`: 本可并行但有正式例外原因

**强制多 Agent 触发条件**（满足任一即 `mandatory_multi_agent`）：
- 任务覆盖 ≥2 个 activity family
- 需要全仓库搜索或跨文件分析
- 上下文预算逼近 55% 检查点

### Step 6: review_requirement_route

判定评审要求：
- `independent_required`: 必须独立评审（作者不自审）
- `self_review_allowed`: 允许作者自审
- `review_not_required`: 不需要正式评审

### Step 7: escalation_route

判定升级路径：
- `normal`: 正常推进
- `needs_user_decision`: 遇到需要用户决策的阻塞
- `blocked`: 方法论问题，3 轮同类未解决

## 3. 路由结果写回

路由决策必须写入：`.claude/tasks/<task-id>/artifacts/route-projection.yaml`

最小字段：
```yaml
task_id: <id>
ownership_route: <value>
delivery_mode: <value>
task_chain_route: <value>
workflow_route: <value>
execution_orchestration_route: <value>
review_requirement_route: <value>
escalation_route: <value>
routed_at: <timestamp>
routed_by: <agent_id>
```

## 4. 与动作治理的边界

本契约负责"这票归谁、什么模式、什么工作流"。
具体"当前正在做什么动作、需要什么工具/规范"由 `action-governance-contract` 负责。

## 5. 豁免

- Trivial 任务可跳过完整路由，但仍需在聊天中口头确认 delivery_mode
- 连续任务链（已确认过的后续步骤）可省略 re-routing
