# Codex vs Claude Code 规范架构比对报告（Round 3）

**Date**: 2026-04-30
**Scope**: Codex 原版规范架构 vs 当前 Claude Code 规范架构（含 Wave 1 修复后状态）

---

## 1. 架构级差异

### 1.1 契约覆盖矩阵

| Codex 契约 | Claude Code 对应 | 状态 | 差异详情 |
|-----------|-----------------|------|---------|
| `intent-capture-contract.md` | `intent-capture-contract.md` | **OK** | 已吸收 job_to_be_done |
| `task-routing-contract.md` | `task-routing-contract.md` | **OK** | 已添加命名对齐表 |
| `action-governance-contract.md` | `action-governance-contract.md` | **OK** | 已添加 negative_activation 决议 |
| `context-governance-contract.md` | `context-governance-contract.md` | **PARTIAL** | 缺少 bundle types、visual_design_overlay、compaction receipt、context compiler inputs、sub-agent isolation contract |
| `task-tracking-contract.md` | `task-tracking-contract.md` | **OK** | 基本吸收 |
| `review-gates-contract.md` | `review-gates-contract.md` | **PARTIAL** | 吸收为 310 行单文件，但丢失了 machine-readable YAML gate definitions、reviewer role matrix、blocked policy document、sub-agent prompt templates |
| `work-packet-governance-contract.md` | `work-packet-governance.md` | **PARTIAL** | 12 层模型存在，但缺少 11-layer layered feature decomposition matrix、12 mandatory pre-build artifacts |
| `execution-orchestration-contract.md` | `cluster-orchestration.md` | **GAP** | Claude Code 缺失独立的执行编排契约。cluster-orchestration 仅覆盖 build phase 多 Agent 编排，未覆盖 build 外的 search/analysis/authoring/verification 活动族编排 |
| `memory-growth-contract.md` | `memory-architecture.md` | **GAP** | Claude Code 只有 4 层+晋升链，缺少 memory object types（6 种）、分流规则（8 目的地）、frozen snapshot、non-memory sedimentation paths |
| `closeout-contract.md` | `closeout-contract.md` | **OK** | 基本吸收 |
| `exception-governance-contract.md` | `exception-governance.md` | **OK** | 已添加升级路径 |
| `verification-checker-contract.md` | `verification-checker.md` | **PARTIAL** | Checker catalog 存在但 0 可执行 |
| `contract-schema-contract.md` | `contract-schema.md` | **OK** | 10 章节布局完整 |
| `contract-registry-contract.md` | `registry.yaml` | **PARTIAL** | 缺少 checker_ref、verification_mode、manual_verification_ref、activation_evidence_ref、migration_state、supersedes/superseded_by、conflict_resolution_policy、owner |
| `document-depth-and-confidentiality-contract.md` | `document-depth.md` | **PARTIAL** | 缺少 confidentiality / 密级体系 |
| `engineering-standards-contract.md` | `engineering-standards.md` | **OK** | 基本吸收 |
| `architecture-blueprint-governance-contract.md` | `architecture-blueprint.md` | **OK** | 已添加 checker 设计 |
| `cluster-orchestration-contract.md` | `cluster-orchestration.md` | **OK** | 基本吸收 |
| `task-readme-lifecycle-contract.md` | `task-readme-lifecycle.md` | **OK** | 基本吸收 |

### 1.2 Review OS 差异

| Codex Review OS 文件 | Claude Code 对应 | 状态 | 差异详情 |
|---------------------|-----------------|------|---------|
| `01-phase-gates.yaml` | review-gates-contract §5 | **OK** | 已吸收 |
| `02-artifact-gates.yaml` | review-gates-contract §14 | **OK** | 已吸收为 hard-fail 条件 |
| `03-reviewer-role-matrix.yaml` | review-gates-contract §10 | **PARTIAL** | 缺少 machine-readable reviewer role 定义 |
| `04-review-pack-contract.md` | review-gates-contract §12 | **PARTIAL** | 5 文件最小 pack 已定义，但缺少 05-value-evidence.yaml 字段定义、profile→pack 映射表、conditional evidence inputs 规则 |
| `05-review-execution-contract.md` | **无** | **GAP** | 平台可验真要求、review receipt canonical fields、review transcript canonical header、provenance manifest canonical shape、state_sync_pending 语义、leader 约束 |
| `06-state-contract.yaml` | 00-task-state.yaml 隐式 | **PARTIAL** | 缺少 execution_mode、task_complexity_profile、parallelism_profile 等 16 个编排执行字段 |
| `07-blocked-policy.md` | review-gates-contract §8 + exception-governance §6.3 | **PARTIAL** | 已部分吸收升级规则，但缺少 blocked 报告最少内容模板、样板课特殊规则 |
| `08-subagent-prompt-templates.md` | CLAUDE.md Sub-Task Prompt Template | **OK** | 已定义 |
| `09-review-consistency-checklist.md` | review-consistency-checklist.md | **OK** | 已吸收 |
| `10-multi-agent-orchestration-contract.md` | cluster-orchestration.md + CLAUDE.md Part B | **OK** | 已吸收 |

### 1.3 独有机制

| Codex 独有 | Claude Code 状态 | 影响 |
|-----------|-----------------|------|
| Lore Commit Protocol | 无 | 中：提交历史缺少结构化知识 |
| Keyword Detection + Auto-Activation | 无 | 低：用户体验，不影响功能 |
| 534 Skill Specs | skill-tool-mapping.md 替代 | 正面：简化为决策树 |
| Model Routing | 无 | 低：单模型环境 |
| Delegation Channels ($deep-interview / $ralplan / $team / $ralph) | 通用 Agent tool 替代 | 正面：统一接口 |
| 20 Agent Specs | 通用 sub-agent 概念 | 中：缺少角色差异化配置 |
| Activity Families (7 种) | 部分（skill-tool-mapping 有 action_family，但无 substantive activity families 用于执行编排判定） | **GAP**：无法判定 build 外活动是否需要多 Agent |
| Memory Object Types (6 种) | 无 | **GAP**：所有经验混为一类 |
| Memory 分流规则 (8 目的地) | 无 | **GAP**：不知道什么该进 memory |
| Frozen Snapshot + Session Boundary | 无 | 中：prompt-visible memory 管理 |
| Review Receipt Canonical Fields (15+ fields) | 部分（review-gates 有 reviewer/verdict 但缺少 receipt_hash、parent_agent_id、submission_id） | 中：评审可追溯性 |
| Provenance Manifest (bundle→gate→attempts[]) | 无 | 中：多轮评审历史追溯 |
| state_sync_pending 语义 | 无 | 低：特定状态收口 |
| Leader Constraints (可以/不可以) | 部分（CLAUDE.md 有主线程职责） | 低 |
| Delegation Plan 最小结构 (7 字段) | 部分（LEGO 有 agent 分配矩阵，但非通用） | 中 |
| Parallelism Exception Reasons | 无 | 低 |
| Blocked Policy 报告模板 | 部分（exception-governance 有异常对象但无 blocked 专项模板） | 低 |

| Claude Code 独有（Codex 没有） | 评价 |
|------------------------------|------|
| feedback.yaml 反馈循环 | 正面 |
| Rule 6 完整性审计（meta-rule 级别） | 正面 |
| 存储位置契约（非 C 盘写入） | 正面（Windows 特定） |
| Stage 间回退表（12 种失败类型） | 正面 |
| LEGO 拆装工作流 | 正面（原创） |
| skill-tool-mapping 决策树 | 正面（替代 534 Skill Specs） |
| 规范架构完整性保障（registry 自验证） | 正面 |
| 执行面声明（Enforcement Model，Wave 1 新增） | 正面 |

---

## 2. 逐文档约束差异（Top Issues）

### 2.1 新增 GAP：execution-orchestration

**问题**：Codex 有独立的 `execution-orchestration-contract.md`，覆盖 7 种活动族（search/analysis/authoring/implementation/verification/review/recovery）的编排判定，明确哪些活动需要多 Agent、delegation plan 结构、单线程例外理由。Claude Code 的 `cluster-orchestration.md` 仅覆盖 build phase 的多 Agent 编排，未覆盖 build 外的活动。

**影响**：当任务同时涉及 research + authoring（如写 PRD），没有规范判定"这需要多 Agent 并行"。

**建议**：在 `cluster-orchestration.md` 中增加 build 外活动族的编排判定规则，或创建独立的 `execution-orchestration-contract.md`。

### 2.2 新增 GAP：memory-growth vs memory-architecture

**问题**：Codex `memory-growth-contract.md` 定义了 6 种 memory object types、8 种分流目的地、frozen snapshot 策略、晋升链（raw → candidate → validated → durable）、衰减规则。Claude Code `memory-architecture.md` 只有 4 层（agent_memory / user_model / session_recall / learning_memory_index）和简单的晋升/衰减。

**影响**：经验采集没有类型化，所有经验混为一类，不知道什么值得记、什么不该记。

**建议**：补充 memory object types + 分流规则到 `memory-architecture.md`。

### 2.3 新增 GAP：review execution proof schema

**问题**：Codex `05-review-execution-contract.md` 定义了平台可验真的评审 receipt（15+ 字段）、review transcript canonical header、provenance manifest（bundle→gate→attempts[]）。Claude Code 只有 reviewer agent id + verdict + report path。

**影响**：评审追溯性不足，多轮评审历史记录不完整。

**建议**：简化为 Claude Code 可执行的最小 receipt schema（5-7 字段）。

### 2.4 新增 GAP：review pack profile → pack mapping

**问题**：Codex `04-review-pack-contract.md` 定义了 profile（contract-doc/prd-doc/design-doc/implementation-code/verification-doc/closeout-doc）到 pack 文件的精确映射，以及 05-value-evidence.yaml 的 12 个必需字段。Claude Code 只定义了"5 文件最小 pack"但无 profile 映射。

**影响**：不同 artifact 类型的评审使用同样的 pack 结构，不精确。

**建议**：在 review-gates-contract.md 中增加 profile→pack 映射表。

---

## 3. 已知未修复问题（从 Round 2 继承）

| # | 问题 | 状态 | 优先级 |
|---|------|------|--------|
| 1 | 0/11 checkers 可执行 | Unfixed | Critical |
| 2 | 缺少 Standard-Light 复杂度层级 | Unfixed | High |
| 3 | 11 of 13 partial Codex gaps unfixed | Unfixed | Medium |
| 4 | 20 Codex 独有机制无等价物 | Unfixed | Low-Medium |
| 5 | 状态维度 8 个过多 | Unfixed | Medium |

## 4. Wave 1 修复状态（已验证）

| # | 修复 | 状态 |
|---|------|------|
| 1 | CLAUDE.md 执行面声明 | **Done** |
| 2 | Gate→Stage→Checklist 映射表 | **Done** |
| 3 | workflow_route 命名对齐表 | **Done** |
| 4 | LEGO 递归深度矛盾修复 | **Done** |
| 5 | context-governance 虚假冲突移除 | **Done** |
