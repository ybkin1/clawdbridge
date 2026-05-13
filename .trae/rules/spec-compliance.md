# Spec Compliance — Claude Code 规范架构 Trae 完整对齐

> 目标：让 Trae Agent 的行为约束与 Claude Code 规范架构的五层模型保持最大一致。
> 每层都有「Claude Code 在做什么」→「Trae Agent 必须怎么做」的精确对应。

---

## Layer 1: 意图路由层

| Claude Code 规范 | Trae 必须执行 |
|-----------------|-------------|
| 意图识别 §3 路由总表 | 每次非 Trivial 任务：识别 `action_family`（clarify/research/authoring/implementation/verification/review/closeout）+ `artifact_kind`，**在回复中显式声明** |
| 7 族 × 多匹配行 | 每条用户请求按关键词匹配 `intent-routing.md` §3 的对应行 |
| 兜底匹配 §5.2 | 关键词不匹配时，按"技术动词→implementation / 疑问词→clarify / 调研→research"规则兜底 |
| 冲突解决 §5 | 多意图组合按依赖顺序：clarify → research → authoring → implementation → verification → review → closeout |
| Trivial 豁免负面清单 §5.1 | 含「设计」「架构」「评审」「系统性」关键词 → 不得判 Trivial |

**执行时检查**: Agent 必须在第一条回复中显式声明 `[action_family=XXX, artifact_kind=YYY, complexity=ZZZ]`

---

## Layer 2: 工作流执行层（7 阶段 + LEGO）

| Claude Code 规范 | Trae 必须执行 |
|-----------------|-------------|
| 7 阶段流水线 | 按 clarify→research→architecture-decomposition→spec→design→plan→build→verify→acceptance→release-ready 顺序执行 |
| Stage-Gate | 每阶段产出必须通过"自检"方可推进（见 guard-rail.md） |
| 乐高 L0→L4 拆解 | 涉及 ≥2 个模块/组件时，必须做 L0→L3 的架构拆解（可在回复中输出，不必落盘） |
| 乐高 Agent 集群 | **触发条件**: 任务可拆为 ≥3 个独立维度 → **手动启用 Task 子 Agent 串行执行**等效评审（Trae 无 MCP 并行能力） |
| 上下文治理 T0-T4 | Agent 自觉维护优先级：T0(系统规则) > T1(用户意图) > T2(契约) > T3(摘要) > T4(搜索结果) |
| 上下文压缩 55/70/85 | 当上下文增长到明显冗长时，优先传递文件路径，不重复粘贴大段内容 |
| 机械条件验证 | **手动读取**`.claude/config/mechanical-conditions.yaml` 检查 10 项条件。`constraint-enforcer` MCP 已部署，待 Trae 支持 MCP 客户端后启用自动触发 |

**执行时检查**: Agent 在任务开始时声明当前阶段，阶段推进时标记 `[Stage N → N+1]`。阶段推进前必须手动读取 `mechanical-conditions.yaml` 逐条件自检确认无机械缺口。

---

## Layer 3: 评审闭环层

| Claude Code 规范 | Trae 必须执行 |
|-----------------|-------------|
| 评审门控三层 | **必须**按 value → professional → contract 三层顺序自检（见 guard-rail.md 自检清单） |
| ≥2 Agent 并行评审 | **手动启用 Task 子 Agent 串行模拟**多维度评审（Trae 无 MCP 并行能力）。参考 `.claude/agents/` 角色定义加载专业 prompt |
| 三级裁决 Pass/Conditional Pass/Fail | 评审结论必须使用标准词汇 |
| 3 轮升级 | 同类问题连续 2 轮未解决 → 标记 method_issue → 报告用户 |
| 零发现规则 | Pass 结论必须说明「检查了哪些方面 + 排除了哪些失败假设」 |
| Review Receipt | Agent 手动生成 `receipt.yaml` 记录评审结论（待 Trae 支持 MCP 后由 `orchestrate_review` 自动生成） |

**触发规则（Trae 手动等价执行）**:
```
当以下任一条件满足时，Agent 必须执行多维度评审（Task 串行或手动分步）：
  - 任务复杂度 = Complex
  - 用户说"评审"/"review"/"审一下"
  - 修改涉及安全相关代码（认证/授权/加密/输入过滤）
  - 修改涉及 ≥3 个文件

当以下条件满足时，Agent 必须执行深度多 Agent 评审：
  - 用户说"深度评审"/"正式评审"/"完整评审"
  - 评审类型为 architecture / design / contract

⚠ 平台限制: Trae Agent 无 MCP 客户端能力，以上通过 Task 工具 + 手动 Fan-In 实现。
若 Trae 未来支持 MCP 客户端，自动切换为 parallel_review / orchestrate_review MCP 工具。
```

---

## Layer 4: 质量防线层

| Claude Code 规范 | Trae 必须执行 |
|-----------------|-------------|
| 完整性审计 3 防线 | **必须**在交付前执行 guard-rail.md 的 10 项自检 |
| Write-or-Fail-or-Explicit | 写文件必须完整落盘 + 链路回写；失败必须标记状态；不写一半 |
| 脏数据清理 | **必须**在任务结束时执行 post-task-cleanup.md 的 4 步清理 |
| 存储位置约束 | **必须**确认所有 Write 操作落在项目工作目录内 |
| 反幻觉锚定 | **禁止**编造路径、虚构 API、虚假引用、"看起来合理当事实" |

---

## Layer 5: 知识沉淀层

| Claude Code 规范 | Trae 必须执行 |
|-----------------|-------------|
| 4 层记忆 | 关键决策写入 `.claude/memory/project-decisions.md`；踩坑写入 `.claude/memory/pitfalls.md`；偏好写入 `.claude/memory/user-preferences.md` |
| 晋升链 | 被 2+ 次验证的反思 → 升级为 validated；被 5+ 次验证的 → 升级为 durable |
| 衰减机制 | 90 天未引用 → stale；180 天 → archived |

---

## 评审/自检速查表（Trae 手动等价执行）

| 用户意图 | 执行方式 | 参考文件 |
|---------|---------|---------|
| "评审/审一下/检查 XX" | Task 串行多维度评审 或 手动分步自检 | `.claude/agents/code-reviewer.md` |
| "深度评审/正式评审/完整评审" | Task 串行 3-4 维度 + 手动 Fan-In | `.claude/agents/auditor.md` |
| "调研/对比/搜一下/分析 XX" | WebSearch + Task 串行多角度 | `.claude/agents/researcher.md` |
| 复杂编码任务且 ≥3 文件 | guard-rail.md 10 项自检 + Task 安全/正确性评审 | `guard-rail.md` |

> ⚠ 上表为 Trae 平台**手动等价执行**方式。理想状态（MCP 客户端可用时）：`parallel_review` (2-6 Agent)、`orchestrate_review` (2-4 Agent)、`parallel_research` (2-5 Agent)。

---

## 文件优先级（Agent 读取顺序）

```
① CLAUDE.md                          ← 项目入口（Trae 自动注入）
② .trae/rules/project_rules.md       ← 桥接层总纲（Trae 自动注入）
③ .trae/rules/spec-compliance.md     ← 本文件 — 五层对齐检查表
④ .claude/CLAUDE.md                  ← 规范内核（按需读取）
⑤ .claude/contracts/                 ← 具体契约（按 action_family 读取）
⑥ .trae/rules/execution-quality.md   ← 执行质量标准
⑦ .trae/rules/guard-rail.md          ← 交付前自检
⑧ .trae/rules/lego-mcp-bridge.md     ← 乐高 × MCP 桥接
⑨ .trae/rules/post-task-cleanup.md  ← 脏数据清理
```
