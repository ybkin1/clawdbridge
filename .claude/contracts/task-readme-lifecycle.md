---
contract_id: "task-readme-lifecycle"
title: "README生命周期契约"
owner: "claude-code"
scope: "task-root README.md的开发态和交付态生命周期管理"
trigger: "full模式任务进入实际开发链路或closeout前切换交付态"
required_inputs: ["task-tracking当前phase状态"]
required_contracts: ["task-tracking"]
required_skills: []
verification_checks: ["two-state-model", "development-readme-minimum", "delivery-readme-minimum", "trigger-rules"]
exceptions: ["advisory-pure-translation-summary-minor-fix"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# README 生命周期契约（Task README Lifecycle Contract）

## 1. 目的

定义 task-root README.md 在任务中的生命周期：开发态记录进度和注意点，交付态切换为使用说明。

## 2. 适用范围

`full` 模式且进入实际开发链路（research/spec/design/build/verify）的任务必须创建 README.md。

豁免：advisory、纯翻译、纯摘要、无开发链路的小修复。豁免必须说明理由。

## 3. 两态模型

### 3.1 开发态（development_readme）

任务进行中，README 至少包含：

```markdown
## What This Task Is
<当前目标>

## Current Status
<当前阶段>

## Read First
- <00-user-intent.md 路径>
- <00-task-state.yaml 路径>
- <关键真相源>

## Key Notes
<关键注意点/非显然约束>

## Do Not Do
<当前不要做什么>

## Next Step
<下一步入口>
```

### 3.2 交付态（delivery_readme）

任务完成后，README 至少包含：

```markdown
## What Shipped
<交付了什么>

## How To Use
<如何使用/消费/操作>

## Known Limits
<已知限制>

## Canonical Docs
<权威文档路径>

## If You Need To Continue Development
<继续开发从哪里接续>
```

## 4. 触发规则

以下时刻必须创建/刷新 README：
- 任务从纯 planning 进入实际开发链
- phase 变化导致入口和注意点改变
- 发现高价值注意事项/环境前提/坑点
- 任务 closeout 前（切换到交付态）

## 5. 与其他工件的边界

- README 是稳定入口，不是主真相源
- `00-task-state.yaml` 是机器真相，README 可引用但不可覆盖
- README 与 handoff 分层：handoff 处理当前阶段恢复，README 处理长期入口
