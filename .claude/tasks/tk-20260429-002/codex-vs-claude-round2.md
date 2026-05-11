# Codex vs Claude Code 规范框架差距分析（Round 2）

生成时间：2026-04-30
分析范围：Codex 规范框架完整导出包 vs Claude Code `.claude/` 目录全量规范
方法：逐契约/逐机制/逐概念对标，按严重程度分级

---

## 一、Critical 级别差距（缺失核心机制）

### 1. OMX 协调层与 Lore Commit Protocol

**Codex 存在**：`/specs/codex-home/AGENTS.md` 定义了 oh-my-codex (OMX) 协调层作为整个运行时基础。包括：
- Lore Commit Protocol（§1-7）：结构化 git 提交消息，使用 `Constraint:`、`Rejected:`、`Confidence:`、`Scope-risk:`、`Directive:`、`Tested:`、`Not-tested:` 等 trailer，把每个 commit 变成机构知识原子单元。
- Delegation Rules：`$deep-interview` / `$ralplan` / `$team` / `$ralph` 四条明确的委派通道，各有清晰触发条件和交付面边界。
- Model Routing：根据任务复杂度自动匹配角色模型（low complexity -> `explore`/`style-reviewer`/`writer`；standard -> `executor`/`debugger`/`test-engineer`；high complexity -> `architect`/`executor`/`critic`）。

**Claude Code 现状**：CLAUDE.md 的 Multi-Agent Orchestration Rules（Part B）只定义了 Agent 派发条件（3+文件、调研+编码、多维度评审等）和 fan-out/fan-in 规则。没有：
- 任何 Lore 风格的 commit trailer 协议
- 模型路由（不同 Agent 使用不同模型/reasoning effort）
- `$deep-interview` / `$ralplan` / `$ralph` 等结构化委派通道

**差距**：Codex 的 Lore Commit Protocol 是完整的知识沉淀机制，Claude Code 完全没有等价物。Codex 的 model routing 和 delegation channel 体系使不同复杂度任务自动匹配不同角色和模型，Claude Code 的 Agent tool 只有一种角色。

**建议**：在 contracts 中新增 `lore-commit-protocol.md`；在 `skill-tool-mapping.md` 或独立契约中引入 delegation channel 体系。

### 2. Keyword Detection 与 Skill 自动激活

**Codex 存在**：`/specs/codex-home/AGENTS.md` 的 `<keyword_detection>` 段定义了 20+ 个用户语义关键词到 skill 的精确映射（如 `"ralph" -> $ralph`、`"design风格" -> $huashu-design`、`"tdd" -> $tdd` 等），并且有 Runtime Availability Gate 区分 OMX runtime 工作流和 App-safe 表面。关键词检测是自动触发、不请求确认的。

**Claude Code 现状**：CLAUDE.md 中没有关键词检测机制。`skill-tool-mapping.md` 契约只定义了动作到技能的路由决策树，但没有定义用户自然语言关键词到 skill 的自动映射。

**差距**：Codex 用户说 "tdd" 或 "deep interview" 或 "code review" 会直接激活对应 skill，Claude Code 需要依赖用户显式调用或通过意图推理间接激活。

### 3. OpenClaw 双主线归属隔离

**Codex 存在**：`/specs/root/AGENTS.md` 的"永久归属铁律"定义了 `codex` 自研 vs `openclaw` 产品的严格二分法。包括：
- 术语定义：openclaw 是独立 harness 产品，codex 是开发者与执行者
- 两条主线并行：增强 codex 自身能力 vs 开发 openclaw 产品
- 任务归属铁律：所有任务开始前必须判定归属，二选一
- 隔离规则：不得共用任务链、不得复用评审工件、不得混合提交范围
- Mixed Request Rule：同时涉及两侧必须拆成独立任务

**Claude Code 现状**：Claude Code 规范完全没有"双产品归属隔离"概念。CLAUDE.md Part C 只定义了任务复杂度分级（Trivial/Standard/Complex），没有归属判定。

**差距**：这是 Codex 特有的组织级约束，Claude Code 作为通用框架不需要此机制。但如果 Claude Code 未来服务于多产品环境，此机制需要适配。

**严重度降级说明**：由于 Claude Code 不运行 OpenClaw 产品，此差距对当前 Claude Code 实例不是 operational gap。保留为 Critical 是因为它是 Codex AGENTS.md 的最高层约束之一。

### 4. Review OS 独立评审操作系统

**Codex 存在**：`/specs/codex-home/review-os/` 包含 14 个文件的独立评审操作系统：
- `01-phase-gates.yaml`：9 阶段 + 每阶段的 goals / required_artifacts / required_gates / forbidden
- `02-artifact-gates.yaml`：产物门禁
- `03-reviewer-role-matrix.yaml`：评审角色矩阵
- `04-review-pack-contract.md`：Review Pack 契约（含 value evidence 12 字段、conditional evidence inputs、route-driven review pack）
- `05-review-execution-contract.md`：评审执行
- `06-state-contract.yaml`：状态契约（完整的 state schema + gate_results_contract + route_projection_contract）
- `07-blocked-policy.md`：阻塞策略（5 种 blocked 触发条件 + 升级规则 + blocked 报告最少内容 + 样板规则）
- `08-subagent-prompt-templates.md`：子 Agent 提示模板
- `09-review-consistency-checklist.md`：评审一致性检查清单
- `10-multi-agent-orchestration-contract.md`：多 Agent 编排
- `checklists/codex-task-system-go-live-checklist.md`：上线检查清单
- `templates/hard-fail-rules.template.yaml` + `review-rubric.template.yaml`

**Claude Code 现状**：Claude Code 有：
- `review-gates-contract.md`（309 行，较完整地覆盖了 3 层 gate + review pack + decision vocabulary + hard-fail conditions）
- `review-consistency-checklist.md`（91 行）
- `checklists/` 目录下的 9 个阶段检查清单

但缺少：
- 独立的 `06-state-contract.yaml` 机器可读状态 schema（Claude Code 在 task-tracking-contract.md 中用 YAML 代码块描述最小结构，但不如 Codex 的 state contract 完整）
- `blocked-policy.md` 的独立阻塞策略文档（Claude Code 的 review-gates 有 3 轮升级但无独立 blocked 报告规范）
- `review-pack-contract.md` 中的 route-driven review pack（`review_pack_profile`、`maturity_target`、`route_projection_ref` 等字段）
- `03-reviewer-role-matrix.yaml` 评审角色矩阵
- `08-subagent-prompt-templates.md` 子 Agent 提示模板
- `checklists/codex-task-system-go-live-checklist.md` 上线检查清单
- `templates/hard-fail-rules.template.yaml` 和 `review-rubric.template.yaml`

**差距**：Review OS 在 Codex 中是独立的机器可消费评审操作系统，Claude Code 将大部分逻辑吸收到 review-gates-contract.md 中但丢失了机器可读的 YAML gate 定义和 reviewer role matrix。

### 5. Contract Registry 与状态管理基础设施

**Codex 存在**：`contract-registry.yaml` 有完整的 17 个契约注册表，每个条目包含：
- `status`（draft-ready / provisional / active / deprecated / archived）
- `effective_scope`（带 AND/OR 语法的 scope 表达式）
- `depends_on` / `conflicts_with`
- `checker_ref` / `verification_mode` / `manual_verification_ref` / `activation_evidence_ref`
- `migration_state`（working_copy / review_pending / review_passed / live_pending / live_synced / superseded / retired）
- `supersedes` / `superseded_by`

**Claude Code 现状**：Claude Code 有 `registry.yaml`，但结构大幅简化。每个条目只有：
- `status`（active / provisional / draft）
- `effective_scope`（简化为 action_family + artifact_kind 等字段）
- `depends_on` / `conflicts_with`
- `version` / `last_reviewed_at`

缺失：
- `checker_ref`、`verification_mode`、`manual_verification_ref`、`activation_evidence_ref`
- `migration_state`（6 种迁移状态词汇）
- `supersedes` / `superseded_by`
- `conflict_resolution_policy`
- `owner`
- 复杂的 `effective_scope` 语法（Codex 支持 `[a, b]` AND、`key=A|B` OR、比较运算符等）

**差距**：Claude Code 的 registry 是简化版，能驱动基本的契约激活但缺少 checker 绑定、迁移追踪和证据链。

---

## 二、High 级别差距（概念存在但显著稀释）

### 6. Task Routing 深度

**Codex 存在**：`task-routing-contract.md` 定义了 7 步路由决策：
1. `ownership_route`（codex-self / openclaw-product / split_required）
2. `delivery_mode_route`（full / quick / advisory）
3. `task_chain_route`（codex-native / openclaw-native / split_required）
4. `workflow_route`（clarify / research / direct_build / review + 视觉设计 overlay + 架构拆解 gate + 分层拼装评审 gate）
5. `execution_orchestration_route`（mandatory_multi_agent / recommended_multi_agent / single_packet_direct / single_thread_exception）
6. `review_requirement_route`（independent_review / self_check_only）
7. `escalation_route`（none / authority_missing / destructive / branching / blocked）

并且每个路由都有详细的 Route Decision Matrix（6 张表）、Skill Overlay Hints 表、Route Outputs 强规则（字段名/枚举/值形状由 state-contract 定义）。

**Claude Code 现状**：Claude Code 的 `task-routing-contract.md`（117 行）覆盖了：
- 归属判定（简化版，无 openclaw 概念）
- 交付模式（full/quick/advisory）
- 工作流路由（clarify/research/spec/design/plan/build/verify）
- 评审触发
- 异常升级

但缺少：
- `task_chain_route`（任务链归属）
- `execution_orchestration_route` 的独立路由步骤（只在 CLAUDE.md Part B 的 Agent 派发条件中隐含）
- `escalation_route` 的结构化枚举
- Route Decision Matrix 表格
- 视觉设计 overlay（`$huashu-design`、`$playwright`、`$imagegen`、`$visual-verdict`）
- 架构拆解 gate（`7.2d Architecture Decomposition Gate`）和分层拼装评审 gate（`7.2e Layered Assembly Review Gate`）

**差距**：Codex 的 task routing 是 7 步决策矩阵 + 6 张对照表 + 多套 overlay，Claude Code 是线性路由决策。

### 7. Context Governance 深度

**Codex 存在**：`context-governance-contract.md` 定义了：
- 6 层上下文加载顺序（system rules → AGENTS 内核 → intent → truth → contracts/skills → raw materials）
- 5 级信任画像（T0 hard rules → T1 current truth → T2 checked-in contracts → T3 derived summaries → T4 raw materials）
- 8 种 bundle 类型（clarify / research / search / synthesis / build / review / resume / output）
- `overlay bundle rules`（`visual_design_overlay` + `intent_indexed_activation_bundle`）
- 上下文预算自动触发梯度（55%/70%/85%）+ 每级的禁止事项
- Compaction Receipt Contract（7 个必填字段）
- Context Compiler Inputs（16 个显式字段）
- 子线程隔离契约（强制隔离场景 + 返回主线程的最小内容 + 主线程聚合边界）
- 运行辅助脚本（4 个 Python/Shell 脚本）

**Claude Code 现状**：`context-governance-contract.md`（97 行）覆盖了：
- 6 层加载顺序
- 信任画像（简化为 4 级）
- 上下文预算触发（55%/70%/85%）
- Compaction 规则

但缺少：
- 8 种 bundle 类型的详细定义
- `visual_design_overlay` 和 `intent_indexed_activation_bundle`
- Compaction Receipt Contract（只有触发规则，没有 receipt 结构）
- Context Compiler Inputs 显式字段
- 子线程隔离契约的强制场景（`9.1a 强制隔离场景`）
- `negative_activation` 机制（显式排除不应加载的 contracts/skills/tools）
- 运行辅助脚本

**差距**：Claude Code 的 context governance 覆盖了核心触发器和信任层级，但缺少 bundle 类型体系、overlay 机制、compaction receipt 结构和 negative activation。

### 8. Work Packet Governance 深度

**Codex 存在**：`work-packet-governance-contract.md` 定义了：
- 12 层搭积木拆包（Standard 可简化至 6-8 层）
- 实现期 12 项必备产物（implementation goal、work packet list、shared interface freeze、write boundary matrix 等）
- 分层功能拆解硬规则（11 层拆解矩阵：需求边界 → 数据结构 → 持久化对象 → 数据访问 → 请求契约 → 响应契约 → 服务接口 → 业务逻辑 → 控制器入口 → 集成接线 → 验证回归 → 可运维性）
- Layered Feature Decomposition Matrix 最小字段
- Work Packet 拆分通过标准和失败信号
- 每个 work packet 的 12+ 显式字段

**Claude Code 现状**：`work-packet-governance.md`（125 行）覆盖了：
- 工作包基本结构
- 拆分原则（单一目标、单独验收、可回滚）
- 共享接口冻结
- 上下文预算驱动拆分

但缺少：
- 11 层分层功能拆解矩阵（Codex 的核心创新）
- 12 项 build 前必备产物的完整列表
- 拆分失败信号的明确定义
- `layered_feature_decomposition_ref` 和对应矩阵

**差距**：Claude Code 的 work-packet-governance 是原则级覆盖，缺少 Codex 的 11 层拆解矩阵这一核心机制。

### 9. Agent Spec 体系

**Codex 存在**：20 个 `.toml` agent spec 文件，每个包含：
- `name`、`description`、`model`、`model_reasoning_effort`
- `developer_instructions`（身份、约束、scope_guard、ask_gate、execution_loop、tools、style、output_contract）
- `posture_overlay`（frontier-orchestrator / deep-worker）
- `model_class_guidance`（frontier / standard）
- `routing_role`（leader / executor）

涵盖：analyst、architect、build-fixer、code-reviewer、code-simplifier、critic、debugger、dependency-expert、designer、executor、explore、git-master、planner、researcher、security-reviewer、team-executor、test-engineer、verifier、vision、writer

**Claude Code 现状**：没有独立的 agent spec 文件。Agent 角色定义嵌在 CLAUDE.md 的 Part B（主线程=编排器）和 Part D（乐高拼装中的 Agent 角色："每个子 Agent 是一个制造工厂"）。

**差距**：Codex 有 20 个可独立配置的 agent spec（含模型选择、reasoning effort、posture、输出契约），Claude Code 只有一个泛化的"子 Agent"概念。

### 10. Execution Orchestration 独立契约

**Codex 存在**：`execution-orchestration-contract.md` 是独立的契约，定义了：
- 7 种 activity families（search / analysis / authoring / implementation / verification / review / recovery）
- mandatory multi-agent triggers（6 种条件）
- route vocabulary（4 个值 + 每个值的详细解释）
- 单线程例外的 3 类正式原因
- 必备控制面（delegation_plan_ref、delegation_activity_families 等 7 个字段）
- Delegation Plan 最小结构
- 与 review / build 的关系
- 高噪音与高上下文压力活动优先隔离

**Claude Code 现状**：执行编排逻辑分散在：
- CLAUDE.md Part B（Agent 派发条件）
- `cluster-orchestration.md`（多 Agent 集群）
- `task-routing-contract.md`（工作流路由）

但没有独立的 execution orchestration 契约，也没有 activity families 模型。

**差距**：Codex 的 execution orchestration 是把"搜索/分析/输出/验证/实现/评审/恢复"先分类再决定并行度的独立机制，Claude Code 只有"满足条件就派发 Agent"的简化版本。

### 11. Intent Capture 深度

**Codex 存在**：`intent-capture-contract.md` 定义了 10 个必填字段（user_goal / target_user / job_to_be_done / happy_path / failure_trigger / non_goals / hard_constraints / observable_success / example_or_counterexample / open_risks）+ 高风险/可行性扩展块（feasibility_ref / critical_assumptions_summary / top_risks_summary）+ 标准模板 + 生成规则（5 种生成时机）+ 真相层次（5 级）。

**Claude Code 现状**：`intent-capture-contract.md`（78 行）覆盖了：
- 9 个必填字段（缺少 `job_to_be_done`）
- 最小化规则
- 真相层次

但缺少：
- `job_to_be_done` 字段
- 高风险/可行性扩展块
- feasibility route 与 intent 的关联
- 标准模板

**差距**：Claude Code 的 intent capture 缺少 `job_to_be_done`（JTBD 框架核心）和 feasibility 扩展。

### 12. Memory Architecture vs Memory Growth

**Codex 存在**：`memory-growth-contract.md` 定义了：
- 4 层 memory 分层（agent_memory / user_model / session_recall / learning_memory_index）
- 6 种 memory object type（durable_preference / durable_fact / recurring_pitfall / candidate_reflection / validated_reflection / rejected_alternative）
- 先分流再晋升（6 种归宿：rule / task truth / hook/checker / memory / reflection / rejected alternative）
- frozen snapshot 与 session boundary
- 长期学习不都进 memory（procedural -> skill_candidate, tool usage -> tool_description_candidate, prompt phrasing -> prompt_candidate）

**Claude Code 现状**：`memory-architecture.md`（122 行）定义了：
- 4 层记忆（索引层 / 项目层 / 任务层 / 会话层）
- 晋升链
- 衰减机制

但缺少：
- memory object type 分类
- 先分流再晋升的 6 种归宿
- frozen snapshot 机制
- 非 memory 沉淀路径（skill_candidate / tool_description_candidate / prompt_candidate）

**差距**：Claude Code 的记忆架构侧重层级和晋升，Codex 的记忆增长机制侧重对象类型和分流策略。

---

## 三、Medium 级别差距（存在等价物但覆盖不全）

### 13. Document Depth and Confidentiality

**Codex 存在**：`document-depth-and-confidentiality-contract.md` 定义了：
- 9 种 document_class（learning_packet / learning_synthesis / feature_brief / theme_prd / package_prd / confidential_design / execution_plan / machine_control / review_artifact）
- 4 种 depth_profile（summary / detailed / whitepaper_like / implementation_blueprint）
- 密级与外发规则（confidentiality_level + shareability）
- 通过结论区分成熟度（contract-ready / authoring-ready / publish-ready / instructor-ready / implementation-ready）

**Claude Code 现状**：`document-depth.md`（90 行）覆盖了：
- 文档分类
- 深度等级
- 成熟度结论

但缺少：
- 密级与外发规则（`confidentiality_level` + `shareability`）
- document_class 的 9 种细化分类
- depth_profile 的 4 级定义

**差距**：Claude Code 覆盖了深度和成熟度，但缺少密级管理和外发规则。

### 14. Verification Checker

**Codex 存在**：`verification-checker-contract.md` 定义了：
- Checker Object Model（9 个字段：checker_id / purpose / mode / scope / inputs / outputs / failure_semantics / evidence_refs / gate_bindings）
- Checker Result Shape（7 个字段）
- Manual Verification Contract（结构化人工验证）
- Checker 与 route/state/review/registry 的接线方式
- Checker catalog

**Claude Code 现状**：`verification-checker.md`（129 行）覆盖了：
- Checker catalog
- Checker result 形状
- 人工验证

但缺少：
- Checker Object Model 的完整 9 字段
- Checker 与 registry activation 的接线
- `gate_bindings` 字段

**差距**：Claude Code 的 verification checker 有基本结构，但缺少与 registry 和 state 的完整接线。

### 15. Exception Governance

**Codex 存在**：`exception-governance-contract.md` 定义了：
- Exception Object Model（13 个字段：exception_id / exception_class / reason_code / scope / requested_deviation / authority_required / approved_by / recorded_at / expires_at / clear_condition / compensating_controls / evidence_refs / status）
- 5 种 exception class（parallelism / tooling / review_mode / verification / delivery_mode）
- 非豁免规则（明确列出不可豁免的规则）
- 补偿控制
- 失效/清除机制（expires_at / clear_condition）

**Claude Code 现状**：`exception-governance.md`（158 行）覆盖了：
- 5 类异常
- 不可豁免规则
- 审批流程
- 记录方式

但缺少：
- 完整的 13 字段 Exception Object Model
- `compensating_controls`（补偿控制）
- `expires_at` / `clear_condition`（失效/清除机制）

**差距**：Claude Code 覆盖了异常分类和不可豁免规则，但缺少补偿控制和失效机制。

### 16. Task README Lifecycle

**Codex 存在**：`task-readme-lifecycle-contract.md` 定义了：
- README 豁免写回（`00-task-state.yaml.readme_requirement` 最小 4 字段）
- 生命周期两态（development_readme / delivery_readme）
- 开发期最小结构（6 节）
- 完成后最小结构（5 节 + canonical usage docs 链接要求）
- README 必须服务两类读者（下一位开发者 + 下一位使用者）

**Claude Code 现状**：`task-readme-lifecycle.md`（90 行）覆盖了：
- 两态生命周期
- 开发期和交付期最小结构

但缺少：
- README 豁免写回机制
- canonical usage docs 链接要求
- 两类读者要求

**差距**：Claude Code 覆盖了生命周期和最小结构，但缺少豁免写回和 canonical 链接。

### 17. Contract Schema

**Codex 存在**：`contract-schema-contract.md` 定义了统一元数据信封 + 10 章节布局 + Checker/Narrative 分离。每个契约有 `contract_id` / `title` / `owner` / `scope` / `trigger` / `required_inputs` / `required_contracts` / `required_skills` / `execution_aids` / `verification_checks` / `exceptions` / `supersedes` / `intended_path` / `current_draft_path` / `registry_entry_id` / `registry_status_source` / `last_reviewed_at`。

**Claude Code 现状**：`contract-schema.md`（124 行）使用 YAML front matter，包含大部分字段但缺少：
- `required_skills`
- `execution_aids`
- `verification_checks` 的完整定义
- `registry_status_source`

**差距**：Claude Code 的契约 schema 覆盖了核心元数据，但缺少执行辅助和 checker 引用。

### 18. Closeout 深度

**Codex 存在**：`closeout-contract.md` 定义了：
- 4 种 closeout type（review_closeout / delivery_closeout / git_closeout / migration_closeout）
- 收口前置条件（5 项 + 代码/脚本额外条件）
- README 完成态依赖（开发中 vs 已完成的不同要求）
- Writeback Rules（6 个必填回写字段）
- dirty hygiene 回收要求

**Claude Code 现状**：`closeout-contract.md`（57 行）覆盖了：
- 收口前置条件
- README 依赖
- Git 收口

但缺少：
- 4 种 closeout type 的明确定义
- migration_closeout
- Writeback Rules 的 6 个必填字段

**差距**：Claude Code 的 closeout 是简化版，缺少 closeout type 分类和完整 writeback 规则。

### 19. Skill Specs（534 个）

**Codex 存在**：`/specs/codex-home/skills/` 目录下有 534 个 skill spec 文件，涵盖项目管理、架构、评审、测试、部署、视觉、文档等能力。每个 skill 有 SKILL.md、references、scripts、agents 等完整结构。

**Claude Code 现状**：`skill-tool-mapping.md`（280 行）定义了意图到工具的路由决策树和工具注册表，但没有 534 个独立的 skill spec 文件。

**差距**：这是数量级差距。Codex 有 534 个可独立激活的 skill，Claude Code 的技能映射是决策树而非独立 spec。

---

## 四、Low 级别差距（Codex 特有但 Claude Code 不需要或影响有限）

### 20. Cluster Orchestration（tmux-based）

**Codex 存在**：`/specs/codex-home/review-os/10-multi-agent-orchestration-contract.md` 和 `contracts/cluster-orchestration-contract.md` 定义了基于 tmux 的集群编排，包括：
- manifest + fan-in 机制
- 最低并行度（light=1+1、standard=2、complex=3）
- workstream 边界指定
- checkpoint 契约

**Claude Code 现状**：`cluster-orchestration.md`（207 行）覆盖了 Agent tool 并行 + manifest + fan-in，但：
- 缺少 tmux 相关概念（这是 Codex 特有的运行时）
- 最低并行度定义在 CLAUDE.md Part B（light=1+1、standard=2、complex=3）

**差距**：tmux 是 Codex 运行时特有的，Claude Code 用 Agent tool 替代。功能覆盖基本等价。

### 21. File Naming Spec

**Codex 存在**：`task-directory-tree-spec.md` + 文件命名规则（小写+连字符、00-前缀真相源、phase/attempt 格式）

**Claude Code 现状**：`file-naming-spec.md`（201 行）+ `task-directory-tree-spec.md`（184 行）覆盖了相同内容。

**差距**：基本等价，无明显差距。

### 22. Action Governance 深度

**Codex 存在**：`action-governance-contract.md` 定义了：
- Route Decision Order（7 步）
- Action Family Model（clarify / research / authoring / implementation / verification / review / recovery）
- route result 可编译规则
- 高价值治理约束自动继承
- fallback 不得削弱既定义务

**Claude Code 现状**：`action-governance-contract.md`（150 行）覆盖了：
- 7 个 action family
- 先判动作再选工具
- route profile 解析

但缺少：
- 高价值治理约束自动继承机制
- route result 可编译的明确规则
- fallback 与 exception 的严格区分

**差距**：Claude Code 的 action governance 覆盖了基本模型，但缺少治理约束自动继承和 fallback/exception 区分。

### 23. Completeness Audit

**Codex 存在**：`completeness-audit-spec.md` 定义了 3 道防线（对标 + 成熟度 + Self-Audit）+ 触发条件 + 违反处理。

**Claude Code 现状**：`completeness-audit-spec.md`（148 行）+ CLAUDE.md Rule 6 覆盖了相同的 3 道防线。

**差距**：基本等价。Claude Code 甚至在 CLAUDE.md 中把 Rule 6 提升为元规则级别。

---

## 五、Codex 独有机制汇总（Claude Code 无任何等价物）

以下机制在 Claude Code 规范中完全不存在：

| # | Codex 机制 | 文件位置 | 说明 |
|---|-----------|---------|------|
| 1 | **Lore Commit Protocol** | AGENTS.md | 结构化 commit trailer（Constraint/Rejected/Confidence/Scope-risk/Directive/Tested/Not-tested） |
| 2 | **Keyword Detection 自动 skill 激活** | AGENTS.md | 20+ 关键词 -> skill 映射，自动触发不确认 |
| 3 | **Model Routing** | AGENTS.md | 按复杂度匹配不同模型和 reasoning effort |
| 4 | **Delegation Channels** | AGENTS.md | $deep-interview / $ralplan / $team / $ralph 四通道 |
| 5 | **OpenClaw 双主线归属隔离** | root/AGENTS.md | codex 自研 vs openclaw 产品的严格二分 |
| 6 | **20 个 Agent Spec** | agents/*.toml | 每个含 model/reasoning_effort/posture/routing_role/output_contract |
| 7 | **Review OS 14 文件体系** | review-os/ | phase-gates.yaml / artifact-gates.yaml / reviewer-role-matrix.yaml 等 |
| 8 | **Route Projection Contract** | 06-state-contract.yaml | route-only 字段的 canonical 定义和投影规则 |
| 9 | **534 个 Skill Specs** | skills/ | 独立 skill 目录含 SKILL.md / references / scripts / agents |
| 10 | **Intent-Indexed Activation Bundle** | context-governance | negative_activation + active_contract_set + route projection 编译 |
| 11 | **Layered Feature Decomposition Matrix** | work-packet-governance | 11 层拆解（需求→数据结构→持久化→...→可运维性） |
| 12 | **Blocked Policy 独立文档** | review-os/07-blocked-policy.md | 5 种 blocked 触发 + 样板规则 |
| 13 | **Exception Object Model** | exception-governance | 13 字段异常对象 + compensating_controls + expires_at |
| 14 | **Memory Object Types** | memory-growth | 6 种对象类型 + 4 层 memory plane + 分流晋升链 |
| 15 | **Context Compiler Inputs** | context-governance | 16 个显式字段 + negative_activation |
| 16 | **Overlay Bundle Rules** | context-governance | visual_design_overlay + intent_indexed_activation_bundle |
| 17 | **Compaction Receipt Contract** | context-governance | 7 字段 receipt 结构 |
| 18 | **Review Pack Route-Driven 机制** | review-os/04 | review_pack_profile + maturity_target + route_projection_ref |
| 19 | **OMX Runtime Availability Gate** | AGENTS.md | 区分 OMX CLI runtime 工作流和 App-safe 表面 |
| 20 | **Document 密级与外发规则** | document-depth | confidentiality_level + shareability |

---

## 六、Codex 概念在 Claude Code 中被稀释的机制

| # | Codex 概念 | 稀释程度 | Claude Code 等价物 |
|---|-----------|---------|-------------------|
| 1 | Contract Registry | 显著稀释（缺 migration_state / checker_ref / activation_evidence / conflict_resolution_policy） | registry.yaml |
| 2 | Task Routing 7 步决策 | 部分覆盖（缺 task_chain / execution_orchestration_route / escalation_route 的独立步骤） | task-routing-contract.md |
| 3 | Context Governance | 部分覆盖（缺 bundle types / overlay / negative_activation / compaction receipt） | context-governance-contract.md |
| 4 | Work Packet Governance | 显著稀释（缺 11 层拆解矩阵 / 12 项 build 前产物） | work-packet-governance.md |
| 5 | Intent Capture | 部分稀释（缺 job_to_be_done / feasibility 扩展块） | intent-capture-contract.md |
| 6 | Memory Architecture | 部分覆盖（缺 object types / 分流策略 / frozen snapshot） | memory-architecture.md |
| 7 | Document Depth | 部分覆盖（缺密级 + 外发规则 + 9 种分类） | document-depth.md |
| 8 | Verification Checker | 部分覆盖（缺 Object Model 9 字段 / registry 接线） | verification-checker.md |
| 9 | Exception Governance | 部分覆盖（缺 compensating_controls / expires_at） | exception-governance.md |
| 10 | Closeout | 部分覆盖（缺 4 种 type / writeback rules） | closeout-contract.md |
| 11 | Action Governance | 部分覆盖（缺治理约束自动继承 / fallback vs exception） | action-governance-contract.md |
| 12 | Review Gates | 基本覆盖（review-gates 是 Claude Code 最完整的契约之一） | review-gates-contract.md |
| 13 | Task Tracking | 基本覆盖（phase/state/projection 基本等价） | task-tracking-contract.md |

---

## 七、总体评价

### 覆盖率统计

- **Codex 独有机制**：20 项（Critical 5 + High 7 + 独有 8）
- **Claude Code 基本覆盖**：2 项（Task Tracking、Review Gates）
- **Claude Code 部分覆盖**：11 项
- **Claude Code 显著稀释**：3 项（Contract Registry、Work Packet、Agent Specs）

### 差距最大领域

1. **Agent/Role 体系**：Codex 有 20 个独立 agent spec + model routing + delegation channels，Claude Code 只有一个泛化的"子 Agent"。
2. **Review OS 独立性**：Codex 有 14 个独立文件构成的评审操作系统，Claude Code 主要逻辑集中在 review-gates-contract.md 中。
3. **Skill 体系**：Codex 有 534 个独立 skill spec，Claude Code 只有 skill-tool-mapping.md 的决策树。
4. **上下文治理**：Codex 的 bundle types、overlay 机制、negative_activation、compaction receipt 在 Claude Code 中全部缺失。
5. **Work Packet 深度**：11 层分层拆解矩阵是 Codex 的核心创新，Claude Code 未覆盖。

### Claude Code 独有的 Codex 没有的机制

| # | Claude Code 独有机制 | 说明 |
|---|---------------------|------|
| 1 | **非 C 盘存储约束** | storage-location-contract.md — Codex 无此约束 |
| 2 | **7 阶段 × 乐高拼装 × 回退表** | Part D 的 Stage 间回退映射表（12 种失败类型→回退目标） |
| 3 | **反馈循环机制** | feedback.yaml — 规范架构本身的迭代反馈系统 |
| 4 | **完整性审计 3 道防线** | Rule 6 提升为元规则级别 + 自动触发（不等用户追问） |
| 5 | **规范完整性对标检查清单** | contract-completeness-checklist.md — 修改契约时必须加载的独立维度 |

---

*本报告为纯对标分析，不包含任何修改建议或实施方案。*
