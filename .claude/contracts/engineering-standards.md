---
contract_id: "engineering-standards"
title: "工程标准契约"
owner: "claude-code"
scope: "工程规范资料（项目结构、技术栈、代码风格、禁止事项、构建测试命令）如何被发现、引用和验证"
trigger: "implementation/verification动作需要repo-specific工程标准参考时"
required_inputs: ["task-routing产出", "action-governance动作分类"]
required_contracts: ["task-routing", "action-governance"]
required_skills: []
verification_checks: ["parsing-order-followed", "command-catalog-not-substitute-for-verification-plan", "prohibition-items-have-owner", "draft-provisional-not-masquerade-as-active"]
exceptions: ["missing-repo-profile-with-manual-evidence", "command-catalog-unavailable-with-task-local-plan"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 工程标准契约（Engineering Standards Contract）

## 1. 目的

定义工程规范资料（项目结构、技术栈、代码风格、禁止事项、构建测试命令）如何被发现、引用和验证。

本契约只管"治理接线"，不写死具体项目的目录/技术栈/命令。

## 2. 核心原则

### 2.1 契约管治理，不写事实

项目结构、技术栈、命令清单是 repo-specific reference，可以被本契约束缚，但不应写进契约正文。

### 2.2 命令目录不是验证计划

command-catalog 只是候选。每个正式任务必须在 task-local verification_plan 中选择实际命令，说明运行目录、触发条件、预期结果和失败处理。

### 2.3 禁止事项必须有 owner

本契约只收纳尚无 owner 的稳定、repo-wide 可验证禁止事项。已有 owner 的只引用不重述。

## 3. 解析顺序

1. task-local explicit refs
2. repo-local docs / config（如 CLAUDE.md, AGENTS.md, .eslintrc）
3. `.claude/contracts/references/`
4. manual evidence

### 3.1 项目结构

最小字段：Path / Purpose / Owner / Allowed Contents / Forbidden Contents / Tests

### 3.2 技术栈

最小字段：Area / Standard / Version Policy / Source Of Truth / Change Rule

### 3.3 代码风格

分两层：
- machine-enforced（工具+配置+命令）
- human-reviewed（规则+owner+验证证据）

### 3.4 构建测试命令

每个正式任务必须写明：command / cwd / required when / expected result / failure handling / not-run reason

## 4. Draft / Provisional 不得伪装成 Active

| 状态 | 含义 |
|------|------|
| `draft-ready` | 只能作为显式 scoped candidate 被人工引用 |
| `provisional` | 只能在限定 scope + 显式 opt-in 时作为参考 |
| `active` | registry 状态为 active 且命中 effective scope 时进入 active_contract_set |

## 5. 异常边界

允许的异常：
- `missing-repo-profile-with-manual-evidence`
- `command-catalog-unavailable-with-task-local-plan`

禁止用异常降低 intent、route、review、verification 或 work-packet 既定义务。
