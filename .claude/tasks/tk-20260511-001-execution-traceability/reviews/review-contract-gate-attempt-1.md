# Contract-Gate Review Report — Task tk-20260511-001

**Review ID**: tk-20260511-001-contract-attempt-1
**Bundle ID**: rb-contract-review-001
**Gate Type**: contract
**Review Mode**: multi_agent (4 agents parallel)
**Review Date**: 2026-05-11
**Round**: 1

---

## 评审结论

**Verdict**: `request_changes`

**理由**: 1 个 critical finding + 5 个 major finding 由本次升级直接引入，需在修复后复评。无 blocked 级别的方法论缺陷。

| Severity | Count (本次引入) | Count (历史遗留) |
|----------|-----------------|-----------------|
| Critical | 1 | 0 |
| Major | 5 | 0 |
| Minor | 6 | 0 |

---

## Critical Findings（本次引入）

### C-1: CLAUDE.md 契约导航表缺失 execution-traceability

- **维度**: 变更影响面
- **文件**: `.claude/CLAUDE.md`
- **规则**: contract-completeness-checklist §7 — "如果修改了 registry.yaml，是否同步更新了 CLAUDE.md Part E 的架构总览？"
- **描述**: `execution-traceability` 契约已加入 registry.yaml（v2 新增），但未同步到 CLAUDE.md "契约导航"表。该表是 Agent 加载契约的核心入口，缺失会导致 `implementation` / `verification` action_family 任务不会自动加载 `execution-traceability` 契约，使执行追溯链失效。
- **证据**:
  - registry.yaml line 385: `action_family=implementation|verification`
  - CLAUDE.md 契约导航表 implementation 行（line ~99）: 未列出 execution-traceability
  - CLAUDE.md 契约导航表 verification 行（line ~100）: 未列出 execution-traceability
- **修复**: 在 CLAUDE.md 契约导航表中，将 `execution-traceability` 加入 `implementation` 和 `verification` 的激活契约列表。

---

## Major Findings（本次引入）

### M-1: registry.yaml 存在 `checker_ref` / `checker_refs` 重复字段（4 处）

- **维度**: 规范执行面验证
- **文件**: `.claude/contracts/registry.yaml`
- **规则**: "规则声明无执行机制（不可验证）"
- **描述**: 本次升级在 registry.yaml 中为所有契约新增 `checklist_refs` / `checker_refs` 字段时，未清理旧的 `checker_ref`（单数）字段，导致 4 个契约同时存在单数和复数字段。YAML 解析器会以最后一个出现的键为准，其中 `contract-schema` 的 `checker_refs: []` 覆盖了 `checker_ref: ["contract-completeness-checklist"]`，导致该契约的 checker 引用实际为空，执行机制悬空。
- **证据**:
  - contract-schema (lines 39-41): `checker_ref: [...]` 后被 `checker_refs: []` 覆盖
  - intent-routing (lines 65-67): 单复数并存
  - task-tracking (lines 118-120): 单复数并存
  - dirty-hygiene (lines 365-367): 单复数并存
- **修复**: 删除所有 `checker_ref` 单数字段，只保留 `checker_refs` 复数字段。确认 contract-schema 的 checker_refs 正确引用 `contract-completeness-checklist`。

### M-2: Stage 4 评审清单缺少 §18 检查项

- **维度**: Stage 清单覆盖度
- **文件**: `.claude/checklists/stage4-design-review.md`
- **规则**: "Stage checklist 新增检查项与 execution-traceability 契约要求不匹配"
- **描述**: `execution-traceability` 和 `document-depth` 均要求 `implementation_blueprint` 深度文档必须包含 §18（单元评审与合入计划）。Stage 4 清单已新增 "函数级设计完整性"（§14）、"复用设计"（§15-§16）、"通信协议设计"（§17），但未包含 §18 的存在性检查。
- **证据**:
  - execution-traceability §4.5.1 / document-depth §3.2 item #8 均要求 §18
  - stage4-design-review.md lines 35-52: 无 §18 相关检查项
- **修复**: 在 stage4-design-review.md 新增 "合入计划设计" 维度，检查 §18 是否存在且每个单元有评审人/合入条件/目标分支/回滚策略。

### M-3: `architecture-blueprint` required_inputs 与 registry depends_on 不一致

- **维度**: 变更影响面
- **文件**: `.claude/contracts/registry.yaml`, `.claude/contracts/lego-assembly-workflow.md`
- **规则**: contract-completeness-checklist §3 — "契约 front matter 中的 `required_contracts` 是否与 registry.yaml 中的 `depends_on` 一致？"
- **描述**: `lego-assembly-workflow` 的 `required_inputs` 列表包含 `architecture-blueprint`，但 registry.yaml 中 `architecture-blueprint` 的 `depends_on` 注释显示 "lego-assembly-workflow removed: breaks circular dependency"。registry 与契约正文对同一依赖关系的声明不一致。
- **证据**:
  - lego-assembly-workflow.md line 8: `required_inputs: [..., "architecture-blueprint"]`
  - registry.yaml line 151: `depends_on: [task-tracking]  # lego-assembly-workflow removed`
- **修复**: 统一两者声明。若确实需要解除循环依赖，应在 lego-assembly-workflow.md 的 `required_inputs` 中也移除 `architecture-blueprint` 或改为 `recommended_inputs`。

---

## Minor Findings（本次引入）

### m-1: Stage 5 未检查 exceptions 的 `approved_by` 字段

- **文件**: `.claude/checklists/stage5-plan-review.md`
- **描述**: execution-traceability §4.1 要求双向引用矩阵的 exceptions 列表中每个 orphan_step/orphan_packet 必须有 `approved_by`。stage5 checklist 检查了 deferred/not_applicable 理由和 glue_code 标记，但未明确要求 `approved_by` 字段存在。
- **修复**: 在 "设计-计划双向追溯" 维度增加检查项："exceptions 列表中每项是否有 `approved_by` 字段？"

### m-2: Stage 6  oversized 审批记录措辞不够精确

- **文件**: `.claude/checklists/stage6-coding-review.md`
- **描述**: execution-traceability §4.4 和 work-packet-governance §6 均要求 oversized 包必须声明 `oversized_review: <评审人批准>`。stage6 checklist 写为 "oversized 包是否有审批记录"，语义相近但未与契约字段名精确对齐。
- **修复**: 改为 "oversized 包是否声明 `oversized_review` 字段并有评审人批准？"

### m-3: Stage 5 未验证 oversized_reason 的 4 个允许类别

- **文件**: `.claude/checklists/stage5-plan-review.md`
- **描述**: execution-traceability §4.4 明确定义了 4 类允许声明 oversized 的条件（纯数据结构/原子逻辑/同模式批量/强耦合胶水）。stage5 checklist 仅检查 "是否声明 oversized_justified"，未验证原因是否属于这 4 类之一。
- **修复**: 增加检查项 "`oversized_reason` 是否为 4 类允许值之一？"

### m-4: Stage 4 未检查 "双向引用就绪"

- **文件**: `.claude/checklists/stage4-design-review.md`
- **描述**: document-depth §3.2 item #10 要求 implementation_blueprint 深度检查中包含 "双向引用就绪"（Dev Plan 已产出或可在同批次产出双向引用矩阵）。stage4 checklist 覆盖了 item #1-#9，但未包含 #10。
- **修复**: 在 "函数级设计完整性" 维度增加检查项："是否已产出或计划在同期产出双向引用矩阵？"

### m-5: manual 模式 checker 缺少触发与归档机制定义

- **文件**: `.claude/checkers/index.yaml`, `.claude/contracts/execution-traceability.md`
- **描述**: `exception-path-coverage-check` 和 `state-transition-coverage-check` 的 mode 为 manual，由评审 Agent 执行。但契约中未定义：评审 Agent 如何被触发、检查结果如何记录、产出格式如何归档到 `reviews/audit-*.yaml`。
- **修复**: 在 execution-traceability §5.5/§5.6 或 checkers/index.yaml 中补充 manual checker 的触发条件和产出格式要求。

### m-6: execution-traceability §6.1 持续审计缺少可执行机制

- **文件**: `.claude/contracts/execution-traceability.md`
- **描述**: §6.1 定义了 "代码缺少 @packet 注释" 的 Intra-Stage 持续审计，由主线程自检触发。但该审计没有对应的 checker 脚本或自动化 hook，完全依赖主线程的自觉执行。
- **修复**: 明确该审计的执行方式（如：作为 `code-packet-annotation-check` 的前置条件，或在 lego-assembly-workflow §4.8 拼装验证中加入）。

---

## Pre-existing Findings（历史遗留，非本次引入）

以下发现 **不在本次评审 scope 内**，但评审过程中被观察到，供后续清理参考：

| # | Severity | 维度 | 描述 |
|---|----------|------|------|
| P-1 | major | 注册表完整性 | registry.yaml 中存在 `layered-architecture-contract.md`, `lifecycle-contract.md`, `project-scale-contract.md` 等文件无对应注册表条目 |
| P-2 | major | 规范执行面验证 | `lego-assembly-workflow.md` §8 声明的 4 个 checkers (`decomposition-tree-complete` 等) 未在 `checkers/index.yaml` 中注册 |
| P-3 | major | 规范执行面验证 | `work-packet-governance.md` front matter 的 4 个 `verification_checks` 未在 `checkers/index.yaml` 中注册 |
| P-4 | minor | 规范执行面验证 | `document-depth.md` §4.1 的 5 条硬规则无对应 checker 或 checklist 绑定 |

**注**: Agent A 报告的 "registry key 与文件名不匹配" 16 条 critical 发现经核实为 **误报**。根据 CLAUDE.md "目录与命名"规则，registry ID → 文件名解析顺序为：先 `<id>.md`，再 `<id>-contract.md`，再 `<id>-spec.md`。当前文件命名符合该规则。

**注**: Agent A 报告的 "execution-traceability.md 缺少 §9/§10" 经核实为 **误报**。该文件包含完整的 §1-§10 章节。

**注**: Agent C 报告的 "7 个新增 checker 无 .sh 脚本" 经与 scope boundary 核对，属于 **已知待办项**（upgrade-summary.md 已声明为"待后续补充"），不在本次评审范围内。

---

## 修复后复评检查清单

修复完成后，复评 Agent 只需验证以下项：

- [ ] CLAUDE.md 契约导航表已添加 `execution-traceability`
- [ ] registry.yaml 已删除所有 `checker_ref` 单数字段
- [ ] stage4-design-review.md 已新增 §18 检查维度
- [ ] lego-assembly-workflow.md `required_inputs` 与 registry `depends_on` 对 `architecture-blueprint` 的声明一致
- [ ] stage5-plan-review.md 已补充 `approved_by` 和 `oversized_reason` 类别检查
- [ ] stage6-coding-review.md 已精确化 `oversized_review` 字段检查
- [ ] stage4-design-review.md 已补充 "双向引用就绪" 检查项
