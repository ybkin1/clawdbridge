---
contract_id: "closeout"
title: "收口契约"
owner: "claude-code"
scope: "任务何时允许收口，防止未完成就宣布交付"
trigger: "phase=release-ready且action_family=closeout时，所有gate通过后"
required_inputs: ["review-gates评审结论", "task-readme-lifecycle交付态README"]
required_contracts: ["review-gates", "task-readme-lifecycle"]
required_skills: []
verification_checks: ["4-closeout-types", "preconditions-met", "readme-delivery-state", "no-premature-closeout"]
exceptions: []
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 收口契约（Closeout Contract）

## 1. 目的

定义任务何时允许收口，防止未完成就宣布交付。

## 2. 4 类收口

| 收口类型 | 含义 |
|---------|------|
| `review_closeout` | 评审全部通过，所有 finding 闭合 |
| `delivery_closeout` | 产出交付给用户使用 |
| `git_closeout` | Git 提交/分支/PR 收口 |
| `migration_closeout` | 迁移/替换任务的旧系统下线 |

## 3. 收口前置条件

必须同时满足：
- [ ] 所有 required gates 通过（value + professional + contract）
- [ ] 评审 provenance 已回链到 state
- [ ] 无 unresolved blocker
- [ ] README 处于正确的生命周期状态
- [ ] 脏数据/脏链路已清理或显式标记失效

## 4. README 收口要求

交付态 README 至少包含：
- `What Shipped`: 交付了什么
- `How To Use`: 如何使用/消费/操作
- `Known Limits`: 已知限制
- `Canonical Docs`: 权威文档在哪里
- `If You Need To Continue Development`: 如需继续开发从哪里接续

## 5. 禁止提前收口

以下情况不得宣称收口：
- gate 未全部通过
- provenance 未完整
- README 仍处于开发态
- 有 unresolved blocker
- 仅完成了 git commit 但评审未闭合
