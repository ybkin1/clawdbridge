# Claude Code 规范架构全面检查报告

> 任务：tk-20260509-001 | 日期：2026-05-09 | 范围：`.claude/` 完整规范体系

---

## 1. 架构总览

当前规范架构采用**契约驱动 + 阶段门控 + 多 Agent 编排**的三层治理模型。

```
用户请求
  │
  ├─ 意图路由 (intent-routing) ──→ action_family + artifact_kind
  │
  ├─ 任务路由 (task-routing) ─────→ 7 步路由决策
  │
  ├─ 动作治理 (action-governance) ─→ 契约/工具/检查器激活
  │
  ├─ 上下文治理 (context-governance) → 6 层加载 + 预算压缩
  │
  ├─ 任务跟踪 (task-tracking) ────→ 10 阶段状态机
  │
  ├─ 执行编排 (cluster-orchestration) → Fan-Out / Fan-In
  │
  ├─ 乐高拼装 (lego-assembly) ────→ L0-L4 多级拆装
  │
  ├─ 评审门控 (review-gates) ─────→ value → professional → contract
  │
  ├─ 完整性审计 (completeness-audit) → 3 道防线
  │
  └─ 收口归档 (closeout) ─────────→ 4 类收口 + 脏数据清理
```

**文件规模**：
- 契约文件：27 个（含 2 个 references）
- 检查器脚本：3 个（bash）
- 评审清单：8 个
- 记忆文件：9 个
- 历史任务：4 个（tk-20260428 至 tk-20260501）

---

## 2. 契约体系（27 个契约）

### 2.1 Meta / 元规范层（1 个）

| 契约 | 状态 | 作用 |
|------|------|------|
| `contract-schema` | active | 统一元数据信封（13 字段）+ 10 章节布局 + Checker/Narrative 分离 |

### 2.2 Core / 核心路由层（6 个）

| 契约 | 状态 | 一句话说明 |
|------|------|-----------|
| `intent-capture` | active | 9 字段意图 artifact |
| `intent-routing` | active | 用户请求 → action_family → 契约/工具/Skill 一键路由 |
| `task-routing` | active | 7 步路由决策（归属/模式/工作流/编排/评审/升级） |
| `action-governance` | active | 先判动作再选工具，7 个 action_family + 11 个 artifact_kind |
| `skill-tool-mapping` | active | 工具路由决策树（5 步）+ 反模式禁止 |
| `context-governance` | active | 6 层上下文加载 + 55/70/85 预算阈值 + 子 Agent 隔离 |

### 2.3 Build / 构建执行层（3 个）

| 契约 | 状态 | 一句话说明 |
|------|------|-----------|
| `lego-assembly-workflow` | active | L0-L4 多级拆装 → Agent 制造 → 逐级拼装 → 异常恢复 |
| `work-packet-governance` | active | 12 层搭积木拆包（Standard 可简化至 6-8 层） |
| `architecture-blueprint` | active | 从大局到细节的拼装顺序 |

### 2.4 Review / 评审层（3 个）

| 契约 | 状态 | 一句话说明 |
|------|------|-----------|
| `review-gates` | active | value → professional → contract 三层门控 |
| `review-consistency-checklist` | active | 12 项自动化一致性检查 |
| `scenario-traceability` | active (v3) | 场景追溯评审：需求→场景→代码→测试 |

### 2.5 Governance / 治理层（7 个）

| 契约 | 状态 | 一句话说明 |
|------|------|-----------|
| `memory-architecture` | active | 4 层记忆 + 6 类对象 + 晋升链 + 衰减 |
| `verification-checker` | active | 11 个 checker catalog + 结果形状 |
| `exception-governance` | active | 5 类异常 + 不可豁免规则 |
| `closeout` | active | 4 类收口 + 前置条件 |
| `task-readme-lifecycle` | active | 开发态/交付态 |
| `task-directory-tree` | active | 标准目录结构 |
| `file-naming` | active | 小写+连字符；00-前缀真相源 |

### 2.6 Quality / 质量层（5 个）

| 契约 | 状态 | 一句话说明 |
|------|------|-----------|
| `document-depth` | provisional | 深度/密级/成熟度 |
| `engineering-standards` | provisional | 治理接线（repo-specific 参考） |
| `cluster-orchestration` | provisional | 多 Agent 集群：manifest + fan-in |
| `completeness-audit` | active | 3 道防线（对标+成熟度+Self-Audit） |
| `dirty-hygiene` | active | Write-or-Fail-or-Explicit + 脏链路状态机 |

### 2.7 Workflow / 工作流层（3 个）

| 契约 | 状态 | 一句话说明 |
|------|------|-----------|
| `task-tracking-workflow` | active | 初始化→phase 推进→评审循环→closeout 全链路 |
| `context-compaction` | active | 55/70/85 三级梯度 + 保留/压缩/丢弃策略 |
| `storage-location` | active (v2) | 禁止桌面/下载/临时目录/系统目录写入 |

---

## 3. 执行热路径（每次任务必走）

```
Step 1: 意图识别 → 查 intent-routing §3 路由总表 → 判定 action_family
Step 2: 契约激活 → 按 action_family 加载对应契约
Step 3: 意图确认 → "我将为你[ task type ]，涉及[ scope ]，预期产出[ output ]，需加载[ contracts ]。是否继续？"
Step 4: 7 步路由决策 → task-routing（归属/模式/工作流/编排/评审/升级）
Step 5: 动作治理 → action-governance（action_family + artifact_kind → route_profile）
Step 6: 工具路由 → skill-tool-mapping（5 步决策树 + 安装态检查）
Step 7: 上下文加载 → context-governance（6 层顺序 + 契约切片）
Step 8: 状态初始化 → task-tracking（00-task-state.yaml + 10 阶段状态机）
Step 9: 执行 → 按 lego-assembly / work-packet-governance 拆包执行
Step 10: 评审 → review-gates 三层门控（≥2 Agent 并行）
Step 11: 收口 → closeout + dirty-hygiene + completeness-audit
```

---

## 4. 评审体系

### 4.1 三层门控

| 层级 | 问题 | 检查面 | 证据 |
|------|------|--------|------|
| Value Gate | 产出是否满足用户真实诉求？ | 目标用户、关键场景、成功动作、失败触发点 | `05-value-evidence.yaml` |
| Professional Gate | 工程上是否合理？ | 架构、模块交互、接口、数据流、边界条件、可维护性 | 评审报告 + 场景追溯矩阵 |
| Contract Gate | 是否遵守所有契约？ | 状态一致性、拆包合规、上下文加载正确、12 项检查 | checker 结果 + manual evidence |

### 4.2 评审模式

- **Standard 任务**：2 个独立 Agent（不同维度）
- **Complex 任务**：3-4 个独立 Agent（安全/性能/正确性/架构）
- **Trivial 任务**：主线程自检

### 4.3 3 轮升级机制

| 轮次 | 触发条件 | 结论 | 决策者 |
|------|---------|------|--------|
| 1 | request_changes | 作者修复 | 作者 |
| 2 | 同类问题再现 | method_issue | 主线程 |
| 3 | 仍 blocked | blocked → 报告用户 | 用户 |

---

## 5. 质量防线

### 5.1 完整性审计（3 道防线）

| 防线 | 规则 | 触发条件 |
|------|------|---------|
| 防线 1：完整性对标 | 源材料条目 → 交付物逐项确认 ✅/⚠️/❌ | 从源材料提取/适配内容后交付前 |
| 防线 2：成熟度检查 | 契约≥3000字、学习报告≥2000字、架构≥1500字、PRD≥3000字 | 交付文档类产出前 |
| 防线 3：Self-Audit | 9 项自检清单（完整性/成熟度/执行质量） | 交付给用户前 |

### 5.2 脏数据/脏链路卫生

**硬规则**：Write-or-Fail-or-Explicit（三选一）

| 状态 | 含义 | 门禁 |
|------|------|------|
| clean | 无脏数据 | 正常推进 |
| dirty_detected | 检测到但未回收 | 不得推进 phase/gate |
| recovering | 正在回收 | 不得推进 phase/gate |
| blocked | 回收失败 | 必须报告用户 |

**检测触发**：phase 切换前、gate 变更时、handoff 前、closeout 前、compaction 时、新会话恢复时。

---

## 6. 检查器（Checker）清单

### 6.1 已实现的自动化检查器（3 个 bash 脚本）

| 检查器 | 模式 | 触发时机 | 失败后果 |
|--------|------|---------|---------|
| `dangling-reference-check` | automated | 所有 markdown/yaml 交付物 | professional gate failed |
| `dirty-hygiene-closure-check` | automated | task directory + 所有写操作 | professional/contract gate |
| `state-projection-alignment-check` | automated | 00-task-state.yaml vs 派生文件 | contract gate failed |

### 6.2 概念定义中的检查器（8 个，0 可执行脚本）

| 检查器 | 模式 | gate_binding |
|--------|------|-------------|
| `route-output-closure-check` | automated | contract |
| `review-consistency-check` | hybrid | contract |
| `dirty-chain-prevention-check` | automated | professional, contract |
| `stale-projection-cleanup-check` | automated | contract |
| `subagent-orchestration-check` | hybrid | professional |
| `context-budget-delegation-check` | automated | professional |
| `compaction-trigger-closure-check` | automated | contract |
| `architecture-decomposition-check` | manual | professional |

**现状**：verification-checker.md 中定义了 11 个 checker，但仅有 3 个有 bash 实现，其余 8 个为概念形状，依赖人工验证。

---

## 7. 评审清单（Checklists）

| 清单 | 用途 | 触发阶段 |
|------|------|---------|
| `stage1-learning-review` | 学习报告评审 | Stage 1 深度学习 |
| `stage2-architecture-review` | 架构拆解评审 | Stage 2 架构拆解 |
| `stage3-prd-review` | PRD 评审 | Stage 3 PRD |
| `stage4-5-plan-review` | 方案详设+开发计划评审 | Stage 4-5 |
| `stage6-code-review` | 代码评审 | Stage 6 编码 |
| `stage7-test-review` | 测试评审 | Stage 7 测试 |
| `user-value-checklist` | 用户价值验证 | Value Gate |
| `contract-completeness-checklist` | 规范完整性检查 | 修改契约时 |

---

## 8. 记忆架构（4 层 + 6 类对象）

```
.claude/memory/
├── MEMORY.md              ← 索引（自动加载，≤200行）
├── user/
│   ├── role.md            ← 角色/职责
│   └── ...
├── project/
│   ├── goals.md           ← 目标/里程碑
│   ├── decisions.md       ← ADR/重大决策
│   └── incidents.md       ← 事故/教训
├── agent/
│   ├── pitfalls.md        ← 反复踩坑
│   ├── tool_quirks.md     ← 工具怪癖
│   └── reflections.md     ← 验证过的反思
└── session/
    └── recent.md          ← 近期会话摘要
```

**晋升链**：raw_observation → session_capture → candidate → validated → durable

**衰减规则**：90 天未使用 → stale；180 天 → archived；3+ 次引用 → high_confidence

---

## 9. 关键发现与状态总结

### 9.1 架构完整度

| 维度 | 评估 |
|------|------|
| 契约覆盖率 | 高（27 个契约覆盖意图→执行→评审→收口全链路） |
| 检查器执行度 | 低（11 个 checker 仅 3 个有脚本实现，8 个为概念） |
| 清单可用性 | 高（8 个 checklist 全部就绪） |
| 记忆沉淀 | 中（4 层结构完备，但内容较空，feedback.yaml 为空数组） |
| 历史任务 | 4 个任务有完整产物（2026-04-28 至 2026-05-01） |

### 9.2 活跃 vs Provisional 契约

- **active**：24 个
- **provisional**：3 个（document-depth、engineering-standards、cluster-orchestration）

### 9.3 待改进点

1. **检查器缺口**：8 个 checker 仅有概念定义，无自动化脚本。这是当前最大的执行面缺口。
2. **Provisional 契约待转正**：document-depth、engineering-standards、cluster-orchestration 仍处 provisional 状态。
3. **反馈循环为空**：`.claude/contracts/feedback.yaml` 为空数组，尚无规范反馈沉淀。
4. **记忆内容稀疏**：agent/pitfalls.md、agent/reflections.md 等文件内容较少。

---

## 10. 完整性对标

| 源材料条目 | 是否已适配 | 适配位置 |
|-----------|----------|---------|
| CLAUDE.md 规范体系总览 | ✅ 已适配 | §1 架构总览 |
| registry.yaml 契约注册表 | ✅ 已适配 | §2 契约体系 |
| intent-routing §3 路由总表 | ✅ 已适配 | §3 执行热路径 Step 1 |
| task-routing 7 步路由 | ✅ 已适配 | §3 执行热路径 Step 4 |
| action-governance 动作模型 | ✅ 已适配 | §2.2 + §3 Step 5 |
| review-gates 三层门控 | ✅ 已适配 | §4 评审体系 |
| verification-checker 检查器目录 | ✅ 已适配 | §6 检查器清单 |
| completeness-audit 三道防线 | ✅ 已适配 | §5.1 |
| dirty-hygiene 状态机 | ✅ 已适配 | §5.2 |
| memory-architecture 4层结构 | ✅ 已适配 | §8 记忆架构 |
| checklists 8个清单 | ✅ 已适配 | §7 评审清单 |
| feedback.yaml 反馈状态 | ✅ 已适配 | §9.3 待改进点 |

---

## 附录：契约加载速查表

| action_family | 激活契约 |
|--------------|---------|
| clarify | intent-capture |
| research | context-governance, engineering-standards |
| authoring | task-tracking, document-depth |
| implementation | task-tracking, context-governance, work-packet-governance, architecture-blueprint, lego-assembly-workflow, skill-tool-mapping, cluster-orchestration |
| verification | verification-checker, review-gates, engineering-standards |
| review | review-gates, review-consistency-checklist |
| closeout | closeout, task-readme-lifecycle, dirty-hygiene, completeness-audit |
