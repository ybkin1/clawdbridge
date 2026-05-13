# Round 2 Deep Review — Fan-In Synthesis Report

> 评审轮次: Round 2 (Deep Detailed Review)
> 评审日期: 2026-05-13
> 评审范围: MCP constraint-enforcer L1-L8 全栈
> 评审维度: 需求功能 / 规范激活流程 / 约束能力资源 / Agent 集群
> 评审 Agent: 4 Lane 并行 → 主线程 Fan-In 综合

---

## 1. 综合裁决 (Overall Verdict)

**Conditional Pass — 需修复后复评**

当前 MCP constraint-enforcer 在**单线程任务治理**层面（状态机、checker 运行、证据锁、写入权限）已达到可用状态，57 项测试全部通过。但在**多 Agent 集群编排**层面（Fan-In/Fan-Out、Sub-Orchestrator、Prompt 约束技术 enforcement）存在结构性缺失，在**安全防护**层面（Bash 工具绕过、角色传递断裂）存在可绕过的严重漏洞。

**按维度评分**:

| 维度 | 评分 | 说明 |
|------|------|------|
| 需求功能完整性 | 7/10 | 核心 MCP 工具已实现，原子性规则 2 项语义错误 |
| 规范激活链路 | 6/10 | L2→L3 通畅，L1→L2 解析脆弱，L7→L3 角色断裂 |
| 约束有效性 | 5/10 | Hard blocker 常规路径有效，Bash 可绕过全部约束 |
| 资源消耗可控性 | 7/10 | 单机场景可控，大文件 hash 和并发 checker 有优化空间 |
| Agent 集群可运行度 | 3.5/10 | Plan 阶段可用，Fan-Out/Fan-In/Synthesize 完全缺失 |

---

## 2. 去重合并后的关键发现 (Consolidated Findings)

### 🔴 P0 — 阻断级（4 项）

#### P0-1: Fan-In / Fan-Out 工作流完全未实现
- **来源**: Lane-4 Finding-1
- **影响**: `cluster-orchestration.md` §8 要求的 5 步工作流（Plan→Fan-Out→Wait→Fan-In→Synthesize）中，后 4 步完全缺失。`agentOrchestrator` 只写了一个静态 plan 文件，没有任何 Agent spawn、结果回收、冲突裁决、统一输出的能力。
- **风险**: "多 Agent 并行"停留在纸面规范，实际执行时主线程需要自己实现全部编排逻辑，规范与执行严重脱节。
- **修复方向**: 
  - 短期：在 MCP 中显式声明 `agent_orchestrator` 仅负责验证与计划，Fan-Out/Fan-In 由主线程完成，补充文档。
  - 长期：新增 `fan_out_agents` 和 `fan_in_synthesize` MCP 工具，或集成 Agent SDK 实现自动 spawn。

#### P0-2: Bash 工具可完全绕过写入权限控制
- **来源**: Lane-3 Finding-1
- **影响**: Hook 只拦截 `Write`/`Edit`，不拦截 `Bash`。Worker 可通过 `bash echo > 00-task-state.yaml` 直接修改任何文件，所有 L3-L7 约束全部失效。
- **风险**: 这是**架构级假设缺陷**——当前约束体系假设 Agent 只能通过 MCP 工具操作文件。
- **修复方向**:
  - Hook 增加 Bash 命令解析，检测重定向操作符并验证目标路径。
  - 增加 `dirty-hygiene-closure-check` 的覆盖范围，检测非 Write/Edit 途径产生的文件修改（通过 mtime/audit 日志）。
  - 长期：Worker 沙箱化（chroot/容器）。

#### P0-3: `loadRegistryYaml` 的 markdown block 提取逻辑脆弱
- **来源**: Lane-1 Finding-4 / Lane-2 Finding-1
- **影响**: `registry.yaml` 本身已是标准 YAML，但代码先尝试从 markdown code block 提取，该正则永远匹配失败，依赖 fallback。若未来文件格式变化，fallback 也可能失败，导致契约激活链完全断裂。
- **风险**: L1→L2 链路在入口处即处于"勉强工作"状态。
- **修复方向**: 直接 `yaml.load(content)`，移除 markdown block 提取逻辑。

#### P0-4: `checkPhaseReadiness` fast-path 跳过所有 soft blocker 评估
- **来源**: Lane-3 Finding-2（关联 Lane-1 Finding-5）
- **影响**: 当 `phaseStatus !== "passed"` 时，`checkPhaseReadiness` 立即返回，不评估任何条件。即使存在 `blocker_level: soft` 的条件，其 warnings 也被完全静默。`closeout_not_already_allowed` 在当前实现中永远不会被报告。
- **风险**: soft blocker 的设计意图（警告但不阻断）退化为"完全忽略"。
- **修复方向**: 在 `checkPhaseReadiness` 返回中增加 `warnings` 数组，收集所有失败的 soft blocker，即使 fast-path 也应评估 soft 条件。

---

### 🟠 P1 — 严重级（8 项）

#### P1-1: Hook 不传递 `role`，角色权限矩阵部分失效
- **来源**: Lane-2 Finding-4
- **影响**: `validateWritePermission` 的 role-based 检查（orchestrator/worker/reviewer）永远不会被 Hook 触发。Worker 通过 Write/Edit 工具写入 `board.yaml` 等非敏感文件时，Hook 无法阻止。
- **修复方向**: Hook 从环境变量或调用上下文中读取 Agent 角色，并传递给 `validateWritePermission`。

#### P1-2: `gate_results_all_passed` 在无 gate 时自动通过
- **来源**: Lane-1 Finding-2
- **影响**: 当 state 中没有任何 `gate_` 前缀字段时，该条件返回 passed。这意味着 phase 理论上应有 gates 但未记录结果时，readiness 会错误通过。
- **修复方向**: 从 `phase-state-machine.yaml` 读取当前 phase 的 expected gates，验证 state 中是否每个 gate 都有对应结果。

#### P1-3: `agentOrchestrator` 的 `multi_packet_parallel` 不分配 `sub_orchestrator`
- **来源**: Lane-1 Finding-3 / Lane-4 Finding-5
- **影响**: 所有 packet 都分配 `worker` 角色，L5 Sub-Orchestrator 层完全缺失，失去层级解压能力。
- **修复方向**: 当 packet 数量 >3 或存在自然分组时，自动创建 `sub_orchestrator` 角色。

#### P1-4: `validatePacketAtomicity` 的 `file_lines` 检查语义错误
- **来源**: Lane-4 Finding-2
- **影响**: 检查的是 `packet.max_lines` 字段值，而非 `code_refs` 指向文件的实际行数。一个指向 100 行文件的 packet 只要没有 `max_lines` 字段就能通过验证。
- **修复方向**: `file_lines` 应读取 `code_refs` 路径，统计文件实际行数。

#### P1-5: `validatePacketAtomicity` 的 `single_sentence` 忽略 `must_contain_verbs`
- **来源**: Lane-4 Finding-3
- **影响**: 验收标准可以是 "This is good." 这种无意义单句，完全不可验证。
- **修复方向**: 在 `single_sentence` 分支中增加 `must_contain_verbs` 检测。

#### P1-6: `l4_name_precision` regex 过于严格，拒绝合法独立函数名
- **来源**: Lane-4 Finding-4
- **影响**: 正则强制要求 `Class.method` 格式，拒绝 `validatePacket` 等合法独立函数名。
- **修复方向**: 放宽为 `'^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$'`。

#### P1-7: `effective_scope` 的 `"all "` 前缀解析过于宽松
- **来源**: Lane-2 Finding-2
- **影响**: `str.startsWith("all ")` 将 `all Standard/Complex tasks` 等表达式全部视为 universal match，后缀限定词被完全忽略。
- **修复方向**: 限制 `all` 仅允许单独使用，或解析后缀并验证 domain 匹配。

#### P1-8: `context_budget` 字段名在 registry 和 MCP 之间不一致
- **来源**: Lane-2 Finding-3
- **影响**: registry 使用 `context_budget`，MCP 使用 `context_budget_percent`，导致 `context-compaction` 契约永远不会被自动激活。
- **修复方向**: 统一字段名，或在 `getActiveContractSet` 中同时映射两个字段名。

---

### 🟡 P2 — 改进级（8 项）

| ID | 来源 | 问题 | 修复方向 |
|----|------|------|---------|
| P2-1 | Lane-1 Finding-6 / Lane-4 Finding-7 | checkpoint restore 产生重复 checker 文件 | 恢复时先清空 checkers 目录或使用固定命名覆盖 |
| P2-2 | Lane-1 Finding-7 | `runBashChecker` 字符串匹配覆盖 exit code | 优先信任 exit code，字符串匹配仅作补充 |
| P2-3 | Lane-3 Finding-5 | `hashDir` 大文件全量读取造成 I/O 峰值 | 大文件只 hash 前 N 字节 + size + mtime |
| P2-4 | Lane-4 Finding-8 | Prompt 模板约束无技术 enforcement | Hook 拦截 AskUserQuestion/Agent spawn；增加后置审计 checker |
| P2-5 | Lane-2 Finding-8 | `startupValidationErrors` 被计算但未被消费 | 工具调用前检查并返回错误 |
| P2-6 | Lane-2 Finding-5 | `ALL_CONFIG_NAMES` 缺少 `agent-orchestration-rules` | 加入列表 |
| P2-7 | Lane-3 Finding-7 | Checker 覆盖率缺口：registry 15 个 refs，checkers/ 只有 10 个 | 补全缺失 checker 或标记为 planned |
| P2-8 | Lane-2 Finding-7 | Hook fallback 过于激进，MCP 不可用时阻断所有 Write/Edit | 增加紧急绕过机制（环境变量/审计日志） |

---

## 3. 冲突与分歧项 (Conflicts & Divergences)

### 冲突-1: `agentOrchestrator` 的角色分配
- **Lane-1 观点**: `multi_packet_parallel` 应分配 `sub_orchestrator` 角色，否则违反 cluster-orchestration。
- **Lane-4 观点**: 当前实现全部使用 `worker`，这是 L5 层的结构性缺失。
- **裁决**: 一致同意当前实现不足。修复优先级 P1-3。

### 冲突-2: Hook fallback 策略
- **Lane-3 观点**: fallback 阻断所有 Write/Edit 是安全但可能造成死锁，应增加绕过机制（P2-8）。
- **Lane-2 观点**: fallback 是 fail-closed 的正确实现，紧急绕过降低安全性。
- **裁决**: 维持 fail-closed 主策略，但增加显式审计日志和紧急绕过开关（需双因素确认，如环境变量 + 日志告警）。

### 冲突-3: `runBashChecker` 状态映射
- **Lane-1 观点**: exit code 应优先于字符串匹配（P2-2）。
- **Lane-4 无直接评论**
- **裁决**: 采纳 Lane-1 建议。exit code 0 → passed（默认），exit code ≠ 0 → failed/blocked，字符串匹配仅用于覆盖 exit code 不可靠的遗留脚本。

---

## 4. 跨层链路健康度 (Cross-Layer Health)

```
L1 Spec (contracts/*.md)
    ↓ 提取/编译
L2 Config (config/*.yaml, registry.yaml)
    ↓ [⚠️ 脆弱] loadRegistryYaml 依赖 fallback (P0-3)
    ↓ [⚠️ 偏差] effective_scope "all " 前缀误匹配 (P1-7)
L3 MCP (enforcer.js)
    ↓ [✅ 基本健康] 工具调用链路清晰
L4 Orchestrator-Prime (主线程/agentOrchestrator)
    ↓ [❌ 断裂] 无 Sub-Orchestrator 分配 (P1-3)
    ↓ [❌ 断裂] 无 Fan-Out / Fan-In / Synthesize (P0-1)
L5 Sub-Orchestrator
    ↓ [❌ 不存在]
L6 Worker
    ↓ [⚠️ 假设缺陷] Bash 工具绕过全部约束 (P0-2)
    ↓ [⚠️ 未验证] 原子性规则 2 项语义错误 (P1-4, P1-5)
L7 Hook (pre-tool-use)
    ↓ [⚠️ 断裂] 不传递 role (P1-1)
    ↓ [✅ 健康] config-driven thin hook 架构正确
L8 Checker (checkers/*.sh)
    ↓ [⚠️ 缺口] 5 个 checker 缺失实现 (P2-7)
```

---

## 5. 修复优先级与行动计划

### Phase 1: 安全与链路修复（必须）
1. **P0-2** Hook 增加 Bash 重定向检测
2. **P0-3** 移除 `loadRegistryYaml` 的 markdown block 提取逻辑
3. **P1-1** Hook 传递 role 参数
4. **P1-7** 修复 `effective_scope` "all " 前缀解析

### Phase 2: 功能正确性修复（必须）
5. **P0-4** `checkPhaseReadiness` 增加 `warnings` 数组收集 soft blocker
6. **P1-2** `gate_results_all_passed` 验证 expected gates 存在性
7. **P1-4** `file_lines` 检查 `code_refs` 实际文件行数
8. **P1-5** `single_sentence` 增加 `must_contain_verbs` 检测
9. **P1-6** 放宽 `l4_name_precision` regex
10. **P1-8** 统一 `context_budget` 字段名

### Phase 3: 架构补齐（重要）
11. **P0-1** 补充 Fan-In/Fan-Out 文档说明（短期）或实现 MCP 工具（长期）
12. **P1-3** 引入 `sub_orchestrator` 角色分配逻辑
13. **P2-4** Prompt 约束的技术 enforcement（Hook 拦截 + 审计 checker）
14. **P2-7** 补全缺失的 checker 脚本

### Phase 4: 优化与打磨（建议）
15. **P2-1** checkpoint restore 避免重复文件
16. **P2-2** `runBashChecker` exit code 优先
17. **P2-3** `hashDir` 大文件优化
18. **P2-5** `startupValidationErrors` 消费
19. **P2-6** `ALL_CONFIG_NAMES` 补全
20. **P2-8** Hook fallback 紧急绕过开关

---

## 6. 复评标准

复评通过条件（全部满足）：
- [ ] P0 级发现全部修复或提供等效缓解方案
- [ ] P1 级发现修复率 ≥ 80%（至少 7/8）
- [ ] `test.js` 新增测试覆盖 P0/P1 修复点，总测试数 ≥ 65，全部通过
- [ ] Fan-In/Fan-Out 实现方案文档化（即使不实现代码，也需明确责任边界）
- [ ] Bash 绕过漏洞至少有一种技术缓解措施（Hook 解析或 dirty-hygiene 检测）

---

*本报告由主线程 Orchestrator-Prime 综合 4 个 Reviewer Agent 的独立评审产出，经去重、冲突裁决后形成统一结论。*
