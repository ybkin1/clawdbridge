---
contract_id: "intent-capture"
title: "意图捕获契约"
owner: "claude-code"
scope: "标准化用户意图捕获，确保Standard/Complex任务启动前有结构化的9字段intent artifact"
trigger: "每次Standard/Complex任务正式开始前，必须捕获结构化用户意图"
required_inputs: ["用户原始需求输入"]
required_contracts: []
required_skills: []
verification_checks: ["intent-9-field-completeness", "observable-success-verifiable", "non-explicitly-confirmed"]
exceptions: ["trivial-task-exemption", "pure-translation-summary-qa"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 意图捕获契约（Intent Capture Contract）

## 1. 目的

本契约规定：每次 Standard/Complex 任务正式开始前，必须捕获结构化的用户意图，不得仅依赖聊天上下文或口头说明。

## 2. 核心原则

### 2.1 意图是任务真相的最高层

真相层次中，用户最新直接证据 > 已捕获的意图 > 已接受的 spec/design > 作者口头总结 > 历史记忆。

### 2.2 意图必须结构化

不得把用户意图写成一段模糊描述。必须填充 9 字段 intent artifact。

## 3. Intent Artifact（9 字段）

每次 Standard/Complex 任务必须在 `.claude/tasks/<task-id>/00-user-intent.md` 中记录：

| 字段 | 含义 | 示例 |
|------|------|------|
| `user_goal` | 用户真正要达成什么结果 | "让所有任务的规范约束强制执行" |
| `target_user` | 谁最终消费这个产出 | "我自己 / 团队 / 外部用户" |
| `job_to_be_done` | 用户在什么场景下需要它 | "每次开启新任务时自动加载对应规范" |
| `happy_path` | 一切顺利时用户会做什么操作 | "输入需求 → 自动路由 → 产出合规结果" |
| `failure_trigger` | 什么情况下结果会让用户觉得失败 | "规范被静默跳过 / 产出与需求不匹配" |
| `non_goals` | 明确不做什么 | "不改 Claude Code 底层行为 / 不建数据库" |
| `hard_constraints` | 不可妥协的约束 | "必须用当前 Claude Code 已有机制" |
| `observable_success` | 怎么知道做成了 | "用户能在 3 步内完成登录，错误率 <5%" |

**observable_success 格式约束**：必须包含至少一个可验证的结果描述（如"用户能在 X 步内完成 Y"、"测试通过率 >= Z%"），不得使用纯主观描述。如果 `observable_success` 无法写成可检查的条件，意图捕获不完整，必须向用户澄清。

| `open_risks` | 已知的不确定性和风险 | "某些契约可能超出当前工具能力" |

### 3.1 可行性扩展字段（可选）

- `feasibility_ref`: 可行性分析引用
- `critical_assumptions_summary`: 关键假设摘要
- `top_risks_summary`: 前3大风险摘要

## 4. 意图确认流程（强制执行，无例外）

> **Hard Rule（Rule 10）**：任何用户输入的功能/修改/实现类需求，Agent 不得直接调用工具开始执行。必须严格执行以下三步：
> 1. **理解**：解析用户输入，提取目标、范围、预期产出；
> 2. **复述**：向用户输出详细理解（含范围、预期产出、涉及文件、执行步骤），以清单或段落形式呈现；
> 3. **确认**：等待用户明确确认（如"确认"/"开始"/"ok"）后方可执行。
> **此规则每次交互均生效，不设任何例外**（包括用户说"直接做"、"立刻执行"、"不要确认"、Trivial 任务、纯翻译/摘要/问答等）。若用户催促执行，Agent 仍须先完成复述并请求确认。

具体流程：
1. 解析用户输入 → 提取上述 9 字段
2. 向用户输出详细理解并请求确认："我将为你[task type]，涉及[scope]，预期产出[output]。是否继续？"
3. 用户确认后写入 `00-user-intent.md`
4. 后续所有阶段以该 intent 为准，除非用户显式修改

## 5. 意图变更

用户中途修改需求时：
1. 更新 `00-user-intent.md` 并标注变更原因
2. 触发 Rule 3 / Rule 10 重新确认
3. 已进行的阶段若与新意图冲突，标记为 `superseded`

## 6. 豁免（已废止）

> **⚠️ 注意**：自 Rule 10 生效起，本契约不再承认任何豁免情形。此前列出的"Trivial 任务"、"用户明确说直接做"、"纯翻译/摘要/问答"等豁免条款全部废止。所有用户输入均须经过§4的三步确认流程后方可执行。
