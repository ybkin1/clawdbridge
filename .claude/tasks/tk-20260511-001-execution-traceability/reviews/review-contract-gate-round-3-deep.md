# Round 3 深度评审报告 — Task tk-20260511-001

**Review ID**: tk-20260511-001-contract-round-3-deep
**Bundle ID**: rb-contract-review-001
**Review Mode**: multi_agent (4 agents parallel, deep review)
**Review Date**: 2026-05-11
**Scope**: 体系内在一致性、可执行性深度、闭环完整性压力测试

---

## 评审结论

**本评审为 Round 2 `passed` 后的补充深度压力测试，不改变 Round 2 的 gate 结论。**

深度评审发现了 **2 个体系级 critical 风险** 和 **14 个 major 改进项**，建议分阶段修复。按修复紧迫性分为三类：

| 类别 | 数量 | 说明 |
|------|------|------|
| **P0 — 立即修复** | 4 | 语义缺失、循环依赖、阻断范围冲突，AI Agent 可能执行错误 |
| **P1 — 本轮补充** | 8 | checker 算法不精确、契约间重复定义、评审收据缺失，影响落地质量 |
| **P2 — 后续迭代** | 6 | 多语言支持、债务遏制、CI/CD 集成，属于增强型优化 |

---

## P0 — 立即修复（4 项）

### P0-1: 双向引用矩阵的创建者、时机与循环依赖

**维度**: 端到端追溯链 / AI Agent 落地可行性
**影响**: Stage 4 评审与 Stage 5 产出之间的循环依赖

问题：
- `document-depth` §3.2 #10 要求 Stage 4 评审时验证 "Dev Plan 已产出或可在同批次产出双向引用矩阵"
- 但 Dev Plan 是 Stage 5 的产出，Stage 4 评审时不可能存在
- `execution-traceability` §6.2 说矩阵在 "Stage 4→5 转换" 时产出，但 WHO 创建？用什么工具？
- AI Agent 会因此阻塞 Stage 4  indefinitely，或跳过检查违反规则

建议：
- 将 `bidirectional-ref-matrix.yaml` 明确为 **Stage 5 交付物**
- Stage 4 只检查 "Dev Plan packet manifest 草稿已产出且 ≥80% 函数级包有 @ref 指向 §14"
- Stage 5 评审时验证覆盖率 ≥95%
- 在 `execution-traceability` §4.1 增加："矩阵由 Stage 5 作者使用 `design-plan-bidirectional-ref-check` 工具生成"

---

### P0-2: 包级评审失败阻断范围冲突

**维度**: 四级评审体系 / 契约间冲突
**影响**: 一个 packet 失败是否导致整个 Stage 6 失败？

问题：
- `execution-traceability` §4.5: "不得进入拼装" — 暗示仅阻断该 packet
- `stage6-coding-review.md` verdict: "Fail: 任何Critical未解决" — 暗示 Stage 6 整体失败
- `lego-assembly-workflow` §4.7: "回退到失败的层级重新拼装，不是重做全部" — 支持 per-packet
- 三个文件给出矛盾信号

建议：
- 统一为 **per-packet blocking**：单个 packet 失败只阻塞该 packet 向上拼装
- Stage 6 gate 失败条件改为：(a) 拼装覆盖率 < 阈值，或 (b) 最终集成测试失败，或 (c) 某 packet Critical 未修复且超过 3 轮
- 在 `stage6-coding-review.md` verdict 部分明确区分 "packet-level" 与 "stage-level" 失败

---

### P0-3: "§14" 在 execution-traceability 中未定义

**维度**: AI Agent 落地可行性
**影响**: 仅加载 execution-traceability 的 Agent 无法理解 §14 是什么

问题：
- `execution-traceability` header 的 `required_contracts` 未包含 `document-depth` 或 `lego-assembly-workflow`
- 但正文中大量使用 "§14"、"§14.7"、"L4" 等概念
- AI Agent 按 header 加载契约后，无法定位 §14 的定义

建议：
- 在 `execution-traceability` §3.1 或 §4.1 增加 §14 的最小定义：
  > "§14 是 `confidential_design` 文档中 `depth_profile=implementation_blueprint` 的强制章节，包含 STEP-by-STEP 函数级伪代码，粒度达到 if/try/for/await 级别。完整定义见 `document-depth` §3.2 和 `lego-assembly-workflow` §4.5.1。"

---

### P0-4: "主线程自检" 无算法或清单

**维度**: AI Agent 落地可行性
**影响**: AI Agent 无法执行 "自检"，因为不知道检查什么

问题：
- `execution-traceability` §3.2、§6.1 多次出现 "主线程自检"
- 但没有定义自检的 checklist、步骤数、覆盖范围
- AI Agent 可能什么都不做，也可能做过多/过少

建议：
- 在 `execution-traceability` 增加附录 "Intra-Stage Self-Check Mini-Checklist"：
  - 每次 Write/Edit 后：检查文件头部是否有 @packet 注释
  - 每次 git diff 后：检查新增 export 是否在 Dev Plan 中有对应包
  - 每次拼装前：检查下级拼装是否已通过验证

---

## P1 — 本轮补充（8 项）

### P1-1: 7 个新 checker 的算法不够精确（3 项合并）

**维度**: Checker 可执行性

| Checker | 问题 | 建议 |
|---------|------|------|
| `design-plan-bidirectional-ref-check` | STEP 正则 `STEP \d+` 无法匹配 `STEP 1a`、`STEP 1.1` | 定义规范化的 STEP ID 格式 |
| `packet-size-check` | "有效代码行" 未按语言定义 | 引用 `cloc` 标准或定义 per-language 规则 |
| `code-packet-annotation-check` | "文件头部" 未定义；JSON/YAML/SQL 等无注释语法的文件如何处理 | 定义 "头部" = 前 20 行或第一个非注释 token 之前；豁免无注释语法文件 |
| `orphan-code-detection` | 仅支持 `export function/class`（JS/TS） | 声明当前为 JS/TS-only，其他语言待扩展 |
| `assembly-interface-alignment-check` | 假设静态类型语言 | 声明为 typed-language-only，动态语言降级为 manual |

### P1-2: 包级/拼装评审不是真正的一级评审

**维度**: 四级评审体系

- `execution-traceability` §4.5 声明 6 种评审类型
- 但 `checklists/index.yaml` 只有 stage4/5/6/7，无独立的 "packet-level" 或 "assembly-level" checklist
- 评审收据格式也未定义

建议：
- 在 `execution-traceability` §7 定义轻量级收据格式（简化版 review-gates §12）
- 明确 "包级评审" 使用 `stage6-coding-review.md` 的 "包级验收" 维度，产出写入 `reviews/packet-level-reviews/`
- 明确 "拼装评审" 使用 `stage6-coding-review.md` 的 "拼装验证" 维度，产出写入 `reviews/assembly-reviews/`

### P1-3: 评审词汇体系混淆

**维度**: 契约间重叠

- `review-gates`：passed / request_changes / blocked / contract_not_closed
- `lego-assembly-workflow` / `stage6-coding-review`：Pass / Conditional Pass / Fail
- 两者映射关系未显式声明

建议：
- 在 `execution-traceability` §4.5 增加脚注：
  > "包级/拼装评审使用 lego-assembly-workflow §4.8 verdict 体系（Pass/Conditional Pass/Fail）。Stage gate 评审使用 review-gates 体系（passed/request_changes/blocked）。映射关系：Pass→passed, Conditional Pass→request_changes, Fail→blocked（3轮后）。"

### P1-4: @packet 模板重复定义

**维度**: 契约间重复

- `execution-traceability` §4.2 和 `lego-assembly-workflow` §4.6.5 定义了完全相同的模板

建议：
- `lego-assembly-workflow` §4.6.5 改为引用："L4 代码块头部注释模板遵循 `execution-traceability` §4.2"

### P1-5: 拼装验证序列差异

**维度**: 契约间不一致

- `lego-assembly-workflow` §4.7 将包级评审折叠进 L4→L3 行
- `execution-traceability` §4.6 将包级评审作为独立步骤放在 L4→L3 之前

建议：
- 以 `execution-traceability` §4.6 为准（更明确）
- `lego-assembly-workflow` §4.7 表格更新为：
  - L4 完成 → 包级评审 → L4→L3 拼装 → 拼装评审

### P1-6: 异常边界与 exception-governance 冲突

**维度**: 契约间冲突

- `execution-traceability` §9 定义了 "允许偏离" 和 "永远不允许偏离"
- `exception-governance` 定义了 5 种异常类型和 5 条不可豁免规则
- 两者范围不一致：`execution-traceability` 的 "低层级拼装未验证就向上拼装" 不在 `exception-governance` 的不可豁免规则中

建议：
- `execution-traceability` §9 改为引用 `exception-governance`：
  > "允许偏离的情况按 `exception-governance` §4 分类记录。以下情况永远不可豁免，优先于任何 exception：...[列表]。"

### P1-7: 手动 checker 缺少执行步骤

**维度**: Checker 可执行性

- `exception-path-coverage-check` 和 `state-transition-coverage-check` 是 manual，但无执行步骤

建议：
- 在 `execution-traceability` §5.5/§5.6 各增加 5-7 步的执行程序

### P1-8: review-gates 未在 required_contracts 中声明

**维度**: AI Agent 落地可行性

- `execution-traceability` 正文大量使用 "professional gate" / "contract gate" 术语
- 但 header 的 `required_contracts` 未包含 `review-gates`

建议：
- 将 `review-gates` 加入 `execution-traceability` 的 `required_contracts`

---

## P2 — 后续迭代（6 项）

### P2-1: 5% 豁免缺口的债务遏制机制

**维度**: 端到端追溯链

- 双向引用矩阵允许 5% 未覆盖
- 但 deferred/orphan 项没有过期时间或重新评估机制
- 长期累积会导致系统性追溯衰减

建议：
- 增加 `deferred_expiry` 字段到 bidirectional-ref-matrix.yaml 的 exceptions 条目
- 要求所有 deferred 项在下一个任务的 Stage 4 重新评估

### P2-2: 胶水代码豁免的滥用防护

**维度**: 端到端追溯链

- glue code 可以不经 §14 引用，仅需标记
- `approved_by: "system"` 不是真正的审批

建议：
- 要求 glue code 的 orphan_packet 必须有 `approved_by: <reviewer_id>`
- 限制每任务 glue code 包比例 ≤10%

### P2-3: oversized 审批不跨阶段持久

**维度**: 端到端追溯链

- Stage 5 批准的 oversized 可能在 Stage 6 被重新质疑

建议：
- 声明 "Stage 5 oversized 审批对 Stage 6 具有约束力，除非代码实际违反声明的 justification"

### P2-4: 审计报告所有权与保留期

**维度**: 端到端追溯链

- 谁写审计报告？保留多久？

建议：
- automated checker → checker 脚本生成
- manual checker → 评审 Agent 按模板填写
- 保留期 = 任务目录生命周期（由 `task-readme-lifecycle` 管理）

### P2-5: 输出格式缺少 CI/CD 机器可读性

**维度**: Checker 可执行性

- 审计报告是自定义 YAML，无 schema version、无 exit code 规范

建议：
- 增加 `audit_schema_version` 字段
- 定义 checker exit codes：0=pass, 1=professional-fail, 2=contract-block
- 未来可添加 SARIF/JUnit 导出器

### P2-6: 多语言支持

**维度**: Checker 可执行性

- 多个 checker 隐含 JS/TS 假设

建议：
- 在 checker 索引中增加 `languages` 字段
- 为 Python/Go/Rust 定义扩展规则（后续迭代）

---

## 发现汇总表

| 编号 | 维度 | 严重度 | 修复类别 | 修复文件 |
|------|------|--------|----------|----------|
| P0-1 | 追溯链闭环 | critical | P0 | execution-traceability, document-depth, stage4, stage5 |
| P0-2 | 评审体系 | critical | P0 | execution-traceability, stage6, lego-assembly-workflow |
| P0-3 | AI 可执行性 | critical | P0 | execution-traceability |
| P0-4 | AI 可执行性 | critical | P0 | execution-traceability |
| P1-1 | Checker | major | P1 | execution-traceability §5 |
| P1-2 | 评审体系 | major | P1 | execution-traceability §7, checklists/index |
| P1-3 | 契约重叠 | major | P1 | execution-traceability §4.5 |
| P1-4 | 契约重复 | major | P1 | lego-assembly-workflow §4.6.5 |
| P1-5 | 契约不一致 | major | P1 | lego-assembly-workflow §4.7 |
| P1-6 | 契约冲突 | major | P1 | execution-traceability §9 |
| P1-7 | Checker | major | P1 | execution-traceability §5.5/5.6 |
| P1-8 | AI 可执行性 | major | P1 | execution-traceability header |

---

## 建议修复顺序

1. **第一批（P0，约 30 分钟）**: P0-3（加 §14 定义）、P0-4（加自检清单）、P1-8（加 review-gates 依赖）、P1-4（消除模板重复）
2. **第二批（P0+P1，约 45 分钟）**: P0-1（矩阵创建者/时机）、P0-2（阻断范围）、P1-3（verdict 映射）、P1-5（拼装序列对齐）、P1-6（异常边界引用）
3. **第三批（P1，约 30 分钟）**: P1-1（checker 算法细化）、P1-2（收据格式）、P1-7（manual checker 步骤）
4. **第四批（P2，后续迭代）**: P2-1 到 P2-6，可在下次规范升级时统一处理
