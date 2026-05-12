---
contract_id: "verification-checker"
title: "验证检查器契约"
owner: "claude-code"
scope: "checker catalog、checker结果形状和人工验证规则"
trigger: "verify/acceptance phase或任何需要验证claim是否成立的场景"
required_inputs: ["review-gates评审结论"]
required_contracts: ["review-gates"]
required_skills: []
verification_checks: ["checker-result-shape", "manual-validation-evidence", "gate-checker-binding", "minimal-catalog-coverage"]
exceptions: ["checker-unavailable-with-manual-evidence"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 验证检查器契约（Verification Checker Contract）

## 1. 目的

定义 Claude Code 的 checker catalog、checker 结果形状和人工验证规则，确保验证不是口头说"我看过了"，而是有结构化的证据。

## 2. 适用范围

本契约适用于 verify/acceptance phase 或任何需要验证 claim 是否成立的场景。
所有 Standard/Complex 任务的评审循环必须至少运行 1 个 checker 或提供等效人工验证证据。

## 3. 核心原则

1. **Checker 提供证据，Gate 判断是否通过** — checker 不是 gate 的替代，而是 gate 的输入
2. **失败必须有语义** — checker 失败不能只说"不通过"，必须说明影响了哪个 gate、为什么影响
3. **人工验证不可口头化** — 必须有结构化证据（manual_verification_ref），禁止聊天式说明代替正式验证

## 4. 规则与决策模型

### 4.1 Checker Object Model

每条 checker 至少包含：
- `checker_id`: 唯一标识
- `purpose`: 检查什么
- `mode`: `automated` | `manual` | `hybrid`
- `scope`: 覆盖哪个 artifact/bundle
- `failure_semantics`: 失败时如何影响 gate

### 4.2 Checker 结果形状

每次 checker 运行至少产出：
- `checker_id`
- `run_at`
- `mode`
- `status`: `passed` | `failed` | `blocked` | `not_run` | `manual_pending`
- `target_ref`: 被检查目标
- `summary`: 检查摘要
- `evidence_ref`: 证据路径
- `gate_binding`: 影响哪个 gate

### 4.3 Checker → Gate 决策流

```
checker runs → produces result(shape) → gate reads result
  → if direct dependency & status=failed → gate blocked
  → if indirect dependency → gate reads manual evidence instead
```

### 4.4 结构化输出 Schema（Checker Result YAML）

所有 checker 运行必须产出 `checker_result.yaml`，路径约定：`tasks/<task-id>/checkers/<checker_id>-<run_id>.yaml`。

```yaml
checker_run_id: "<checker_id>-<task-id>-<timestamp>"
checker_id: "<id>"
task_id: "<task-id>"
run_at: "<ISO8601>"
mode: automated | manual | hybrid
status: passed | failed | blocked | not_run | manual_pending
target_ref: "<被检查目标路径>"
summary: "<检查摘要，≤200字>"
evidence_ref: "<证据文件路径>"
gate_binding: value | professional | contract | [gate1, gate2]

# 仅在 failed/blocked 时必填
failure_detail:
  affected_gate: "<gate>"
  severity: critical | major | minor
  description: "<失败原因>"
  remediation_hint: "<修复建议>"

# 仅在 manual_pending 时必填
manual_evidence:
  method: "<检查方法>"
  result: "<检查结果>"
  evidence_path: "<证据路径>"
  reviewed_by: "<评审者>"

# 兼容性字段：支持现有 bash checker 的文本输出
legacy_text_output: "<原始文本输出，可选>"
```

**规则**：
- `status=passed` 时，`failure_detail` 必须省略
- `status=failed` 时，`failure_detail` 必须完整
- `mode=automated` 时，`legacy_text_output` 可包含原始 bash 输出以便追溯

## 5. 最小 Checker Catalog

| checker_id | 检查面 | mode | scope | failure_semantics | gate_binding |
|-----------|--------|------|-------|-------------------|-------------|
| `route-output-closure-check` | 路由输出是否闭合 | automated | task state, 00-task-state.yaml | 路由决策未落盘或输出不完整 → gate blocked | contract gate |
| `state-projection-alignment-check` | 状态与投影是否一致 | automated | 00-task-state.yaml vs README.md/board.yaml | state 与派生投影不一致 → gate failed | contract gate |
| `review-consistency-check` | state/review pack/provenance 是否一致 | hybrid | review-bundles/, reviews/ | 评审证据链断裂 → gate failed | contract gate |
| `dirty-chain-prevention-check` | 脏链路防止是否到位 | automated | task directory, artifacts/ | 存在悬空或错指引用 → gate failed | professional gate, contract gate |
| `dirty-hygiene-closure-check` | 脏数据卫生是否闭合 | automated | task directory, all write ops | 未清理的临时/失败产物 → gate failed | contract gate |
| `dangling-reference-check` | 是否有悬空引用 | automated | 所有 markdown/yaml 交付物 | 引用不存在的文件/章节 → gate failed | professional gate |
| `stale-projection-cleanup-check` | 过期投影是否清理 | automated | README.md, board.yaml, 派生文件 | 过期派生文件未更新 → gate failed | contract gate |
| `subagent-orchestration-check` | 子Agent编排是否合规 | hybrid | Agent tool invocations, manifest | 缺 manifest/fan-in report → gate failed | professional gate |
| `context-budget-delegation-check` | 上下文预算委派是否正确 | automated | context compaction receipts | 预算超标无委派证据 → gate failed | professional gate |
| `compaction-trigger-closure-check` | 压缩触发是否闭合 | automated | compaction receipts, checkpoint | 触发压缩但无 receipt → gate failed | contract gate |
| `architecture-decomposition-check` | 架构拆解是否完整 | manual | architecture blueprint, design docs | 模块交互/选型依据缺失 → gate failed | professional gate |

## 6. Checker → Gate 映射表

| Gate | 依赖的 Checkers | 依赖强度 |
|------|----------------|---------|
| **Value Gate** | 无直接依赖（通过人工验证证据间接覆盖） | indirect |
| **Professional Gate** | `dangling-reference-check`, `subagent-orchestration-check`, `context-budget-delegation-check`, `architecture-decomposition-check`, `dirty-chain-prevention-check` | direct — 任一失败不得 passed |
| **Contract Gate** | `route-output-closure-check`, `state-projection-alignment-check`, `review-consistency-check`, `dirty-hygiene-closure-check`, `stale-projection-cleanup-check`, `compaction-trigger-closure-check` | direct — 任一失败不得 passed |

**规则**：
- `direct` 依赖：checker 失败 → gate 不得 passed
- `indirect` 依赖：checker 不直接阻塞 gate，但人工验证必须覆盖等效检查面
- 一个 gate 可以依赖多个 checkers；任一 direct checker 失败即阻塞该 gate

## 7. 人工验证规则

当自动 checker 不可用时：
- 必须有 `manual_verification_ref`
- 必须记录：检查目标、检查方法、检查结果、证据路径、影响的 gate
- 不能只是作者聊天说明
- 若人工验证仍缺证据，则应 `blocked`

## 8. 边界

### 8.1 与评审门控的关系

- checker 提供证据，gate 判断是否通过
- 一个 gate 可以依赖多个 checkers
- review report 必须指出当前结论依赖了哪些 checker 或 manual evidence
- checker 失败时，依赖该 checker 的 gate 不得 passed

### 8.2 不覆盖的范围

本契约专注于"验证是否有结构化证据"，不定义：
- 评审的具体检查内容（由 review-gates 和 checklists 定义）
- 代码质量或功能正确性（由 testing/engineering-standards 定义）

## 9. 迁移策略

从"口头说看过了"到结构化 checker 证据的过渡：
1. 第一阶段：人工验证证据化（记录 manual_verification_ref）
2. 第二阶段：高频 checker 自动化（state-projection, dirty-hygiene, compaction-trigger）
3. 第三阶段：全部 checker 自动化或 hybrid，人工验证仅作为 fallback

## 10. Bash Checker Wrapper Protocol

现有 10 个 bash checker 输出纯文本（PASSED/FAILED）。为兼容这些 checker 同时满足 §4.4 结构化输出要求，采用以下 wrapper 协议。

### 10.1 Wrapper 行为

当 Agent 调用 bash checker 时，执行以下后处理：

1. 运行 checker 脚本，捕获 stdout/stderr
2. 解析最后一行：
   - 含 `PASSED` 且无 `ERROR` → `status: passed`
   - 含 `FAILED` 或 `ERROR` → `status: failed`
   - 脚本返回非 0 退出码 → `status: blocked`
3. 生成 `checker_result.yaml`，填充：
   - `legacy_text_output`: 完整 stdout
   - `summary`: 从 stdout 提取的第一行摘要
   - `evidence_ref`: 指向本次运行的日志文件
   - `gate_binding`: 从 `checkers/index.yaml` 读取

### 10.2 未实现 Checker 的占位符处理

对于 7 个未实现 checker（`design-plan-bidirectional-ref-check`, `packet-size-check`, `code-packet-annotation-check`, `orphan-code-detection`, `exception-path-coverage-check`, `state-transition-coverage-check`, `assembly-interface-alignment-check`）：

- 脚本不存在时，Agent 必须创建 `checker_result.yaml` 且 `status: manual_pending`
- 必须同时创建 `manual_evidence` 块，记录人工验证方法
- 必须在 `00-task-state.yaml` `active_exceptions` 中注册 `verification_exception`
- 评审 Agent 必须验证 `manual_evidence` 的完整性，否则 gate 不得 passed

## 11. Auditor Agent（新增）

Auditor Agent 是规范架构的**第四层独立验证者**，在三个关键节点强制触发，verdict 直接落盘，主线程无权修改。

### 11.1 职责与权限

- **职责**：只读验证，不修改任何源码或交付物。唯一产出是 `audit-report.yaml`。
- **权限**：只读（Read / Grep / Glob）。禁止 Write / Edit / Bash。
- **独立性**：主线程不得修改、不得忽略、不得以任何理由覆盖 Auditor verdict。

### 11.2 触发时机（三处不可跳过）

1. **Phase Transition 前**：验证 Evidence Lock + 所有 mandatory checker results
2. **Gate Verdict 后**：验证 Receipt 引用了所有 checker runs + exception 合规
3. **Closeout 前**：最终审计，确认全生命周期证据链完整

### 11.3 检查清单（7项）

| # | 检查项 | 通过标准 | 失败后果 |
|---|--------|---------|---------|
| 1 | Evidence Lock 存在 | `checkers/evidence-lock-<phase>.yaml` 存在且 schema 完整 | mechanical_gap |
| 2 | Mandatory checkers 全部有 result | 每个 mandatory checker 有对应的 `checker_result.yaml` | mechanical_gap |
| 3 | Checker statuses 合规 | 所有 result `status` ∈ {passed, excepted} | mechanical_gap |
| 4 | Exceptions 合规 | 每个 `excepted` 有 approved exception + `compensating_controls` 非空 | mechanical_gap |
| 5 | Receipt 引用完整 | Gate receipt 包含 `checker_runs[]` 且引用路径存在 | mechanical_gap |
| 6 | Findings 一致性 | Receipt `findings_summary` 与 review report 的 findings 数量/severity 一致 | mechanical_gap |
| 7 | 无 mechanical_override | `00-task-state.yaml` 无 `mechanical_override_detected` 标记 | mechanical_gap |

### 11.4 裁决规则

- `audited`：7 项全部通过 → 允许 transition / gate 可 passed
- `mechanical_gap`：任一项失败 → 产出 gap 列表，transition 自动 blocked，gate 不得 passed
- `insufficient_evidence`：证据缺失但无法判定合规性 → 要求补充证据后再审

### 11.5 防篡改规则

- Auditor 的 verdict 写入 `reviews/audit-report-<trigger>-<timestamp>.yaml`
- 主线程只能读取 audit report，不得修改其内容
- 若主线程试图覆盖 Auditor verdict，任何后续 Agent 检测到 `audit-report` 与 `task-state` 不一致时，必须标记 `tamper_detected`
- 标记 `tamper_detected` 后，task 自动进入 `blocked` 状态，必须用户介入

### 11.6 产出格式

`tasks/<task-id>/reviews/audit-report-<trigger>-<timestamp>.yaml`

```yaml
audit_id: "aud-phase-build-20260511-001"
trigger: "phase_transition"  # phase_transition | gate_verdict | closeout
task_id: "<task-id>"
phase: "<phase>"
auditor_agent_id: "<agent-id>"
audited_at: "<ISO8601>"
verdict: "audited | mechanical_gap | insufficient_evidence"
checklist:
  - item: "Evidence Lock 存在"
    result: pass | fail | na
    evidence_ref: "checkers/evidence-lock-<phase>.yaml"
  - item: "Mandatory checkers 全部有 result"
    result: pass | fail
    missing: []
  - item: "Checker statuses 合规"
    result: pass | fail
    violations: []
  - item: "Exceptions 合规"
    result: pass | fail
    violations: []
  - item: "Receipt 引用完整"
    result: pass | fail
    missing_refs: []
  - item: "Findings 一致性"
    result: pass | fail
    discrepancies: []
  - item: "无 mechanical_override"
    result: pass | fail
findings:
  - severity: critical | major | minor
    description: "<具体问题>"
    affected_checker: "<id>"
    remediation: "<修复建议>"
gap_count: 0
```

## 12. MCP Checker Runner Protocol

当 Agent 通过 MCP 调用 `run_mandatory_checkers` 时，Server 按以下标准流程执行：

### 12.1 执行流程

```
1. 解析 taskDir（显式传入或自动检测最近修改的 active task）
2. 读取 route-projection.yaml → 获取 mandatory_checkers 列表
3. 对每个 checkerId：
   a. 检查 task/checkers/ 下是否已有结果文件 → 有则 SKIP
   b. 在 .claude/checkers/ 下寻找脚本（优先 .sh，备选 .ps1）
   c. 脚本存在 → spawn bash 执行，捕获 stdout/stderr
   d. 脚本不存在 → 生成 manual_pending 占位结果
4. 解析输出：包含 "PASSED" → status=passed，否则 status=failed
5. 生成标准 checker_result.yaml（符合 §4.4 Schema）
6. 返回 JSON 摘要：{success, taskId, results[], summary}
```

### 12.2 占位符 Checker 处理

对于尚未实现的 checker（implementation_status=placeholder）：
- Server 生成 `manual_pending` 结果文件
- `manual_evidence` 字段填写待办项
- Agent 必须补充人工验证证据或催促实现脚本
- Evidence Lock 的 `all_checkers_passed` 对 `manual_pending` 视为**通过**（允许过渡），但必须在收口前全部替换为实际结果

### 12.3 与 Hook 的协作关系

| 层级 | 触发方式 | 职责 | 阻断能力 |
|------|---------|------|---------|
| MCP 工具 | Agent 主动调用 | 修复 gap、生成证据 | 无（返回结构化结果） |
| PreToolUse Hook | 平台自动触发 | 检测敏感操作、提醒 Agent | 有（exit 1 阻断） |

Agent 的**最佳实践**：先调用 MCP 工具修复 gap，再执行敏感操作，避免触发 hook 阻断。

## 13. 配置层与 MCP 的接口规范

### 13.1 设计原则

MCP 约束执行器（`constraint-enforcer`）不内置任何规范规则。所有规则从 `.claude/config/*.yaml` 读取：

| 配置文件 | 来源契约 | MCP 消费方 |
|---------|---------|-----------|
| `mechanical-conditions.yaml` | `task-tracking-workflow-spec.md` §4.2.1 | `check_phase_readiness`, `request_phase_transition` |
| `phase-state-machine.yaml` | `task-tracking-workflow-spec.md` §4.1, §4.3 | `request_phase_transition` |
| `write-permissions.yaml` | `task-tracking-workflow-spec.md` §6 | `validate_write_permission`, PreToolUse Hook |
| `mcp-capabilities.yaml` | 本契约 §13 | `request_phase_transition`（manual gate 处理） |
| `registry.yaml` | 全部 active contracts | `get_active_contract_set`, `get_checker_catalog`, `run_mandatory_checkers` |

**核心原则**：规范是 Single Source of Truth；配置层是规范的机器可读投影；MCP 只读取配置，绝不内置规则。

### 13.2 配置变更生效机制

- MCP 在启动时加载配置到内存缓存
- 配置变更后，`loadConfig()` 自动检测文件 mtime 变化并重新加载，无需重启 MCP server 或修改 MCP 代码
- 手动调用 `invalidateConfigCache()` 可强制清空缓存

### 13.3 Registry 感知协议

`run_mandatory_checkers` 采用双源读取策略：
1. **优先**：任务级 `route-projection.yaml` 的 `mandatory_checkers`
2. **回退**：从 `registry.yaml` 聚合所有 active contract 的 `checker_refs`

这样即使任务创建时未写 `route-projection.yaml`，MCP 也能推导出应运行的 checkers。

### 13.4 Manual Gate 处理

对于无法机械自动化的 gate（如 `value` gate）：
- MCP 不阻断 phase transition
- 在 `evidence_lock` 中记录 `manual_gates_pending`
- 在 transition result 中附带 `manual_verification_required`
- 由 Agent/人类确认后，填写 `manual_gates_acknowledged` 再推进

## 14. 非目标

本契约不追求：
- 100% 自动化验证 — 部分检查面（如架构拆解完整性）天然需要人工判断
- 替代评审 — checker 是评审的输入，不是评审本身
- 运行时监控 — 本契约关注交付物验证，不是生产环境监控
