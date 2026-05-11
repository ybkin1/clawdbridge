---
contract_id: "memory-architecture"
title: "记忆架构契约"
owner: "claude-code"
scope: "4层记忆结构、6类记忆对象、晋升链和衰减机制"
trigger: "跨会话知识沉淀、用户反馈记忆、踩坑教训记录、项目重大决策变更"
required_inputs: []
required_contracts: []
required_skills: []
verification_checks: ["4-layer-structure", "promotion-chain", "decay-policy", "memory-vs-truth-boundary"]
exceptions: []
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 记忆架构契约（Memory Architecture Contract）

## 1. 目的

定义 Claude Code 的记忆存储结构、晋升链和衰减机制，确保跨会话知识有效沉淀，同时防止过时/错误记忆误导后续任务。

## 2. 4 层记忆结构

```
.claude/memory/
├── MEMORY.md              ← 记忆索引（自动加载，≤200行）
├── user/                  ← 用户模型
│   ├── role.md            ← 角色/职责
│   ├── preferences.md     ← 偏好/工作风格
│   └── knowledge.md       ← 知识水平/技术栈
├── project/               ← 项目记忆
│   ├── goals.md           ← 目标/里程碑/时间线
│   ├── decisions.md       ← ADR/重大决策
│   └── incidents.md       ← 事故/教训
├── agent/                 ← Agent 经验
│   ├── pitfalls.md        ← 反复踩坑
│   ├── tool_quirks.md     ← 工具怪癖
│   └── reflections.md     ← 验证过的反思
└── session/               ← 会话级
    └── recent.md          ← 近期会话摘要（可过期）
```

### 2.1 各层含义

| 层 | 内容 | 更新频率 |
|----|------|---------|
| `user` | 用户角色、偏好、知识水平 | 低（用户变了才改） |
| `project` | 项目目标、决策、事故 | 中（每次任务可能更新） |
| `agent` | 工具经验、踩坑教训、反思 | 高（每次任务可能沉淀） |
| `session` | 近期会话摘要 | 高（每次会话更新，定期过期） |

## 3. 6 类记忆对象

| 类型 | 含义 | 存储位置 |
|------|------|---------|
| `durable_preference` | 持久偏好（如响应风格） | `user/preferences.md` |
| `durable_fact` | 持久事实（如基础设施信息） | `user/knowledge.md` 或 `project/` |
| `recurring_pitfall` | 反复踩坑 | `agent/pitfalls.md` |
| `candidate_reflection` | 待验证的反思 | `agent/reflections.md`（未验证区） |
| `validated_reflection` | 已验证的反思 | `agent/reflections.md`（已验证区） |
| `rejected_alternative` | 被否决的方案及原因 | `project/decisions.md` |

## 4. 晋升链

记忆从原始观察到持久知识的演进路径：

```
raw_observation（聊天/任务中的观察）
  → session_capture（会话结束时捕获到 session/）
    → candidate（标记为 candidate_reflection）
      → validated（被后续任务验证，升级为 validated_reflection）
        → durable（被多次验证，晋升到 agent/project/user）
```

### 4.1 各阶段规则

- **raw_observation → session_capture**：会话结束时自动捕获关键观察
- **session_capture → candidate**：用户确认或多次出现后标记为候选
- **candidate → validated**：被 2+ 次独立任务验证
- **validated → durable**：被 5+ 次独立任务验证且从未被推翻

## 5. 衰减机制

每条记忆包含：
- `last_verified_at`: 最后验证时间
- `usage_count`: 被引用次数
- `decay_policy`: 衰减策略

### 5.1 衰减规则

| 条件 | 动作 |
|------|------|
| 90 天未使用 | 标记为 `stale`，从 MEMORY.md 索引移除但仍保留文件 |
| 180 天未使用 | 标记为 `archived`，移入 `agent/archived/` |
| 被后续任务推翻 | 标记为 `invalidated`，记录推翻原因，移入 `agent/rejected/` |
| 被 3+ 次任务引用 | 升级为 `high_confidence`，不可自动衰减 |

### 5.2 衰减触发机制

衰减不依赖自动 cron，而是由任务启动时的 **memory validation** 步骤触发：

1. 新会话启动时，主线程读取 `MEMORY.md` 索引
2. 对每条记忆，检查其 `last_verified_at` 字段
3. 若 `last_verified_at` 距今 > 90 天：标记 `stale`，从索引中降权（移至索引末尾并加 `(stale)` 标注）
4. 若 `last_verified_at` 距今 > 180 天：将该记忆文件移入 `agent/archived/`，从索引中移除该行
5. 每次 closeout 时，主线程扫描本次引用过的记忆，更新 `usage_count` 和 `last_verified_at`

**规则**：衰减是渐进式的，不会在单次会话中自动删除大量记忆。每次会话最多处理 3 条衰减条目，避免大规模变动。

## 6. 记忆写入规则

### 6.1 什么写入记忆

- 用户明确说"记住这个"
- 用户纠正了 Agent 行为（反馈记忆）
- 发现了反复出现的坑（踩坑记忆）
- 项目重大决策/里程碑变更
- 基础设施/环境信息变更

### 6.2 什么不写入记忆

- 代码模式/架构/文件路径（从代码库直接读取）
- Git 历史/变更记录（用 git log/blame）
- 调试方案（修复已在代码中）
- CLAUDE.md 已有的规范
- 一次性任务的临时状态

## 7. 记忆分流规则（8 目的地）

当任务/会话中产生可沉淀信息时，按以下规则判定去向：

| # | 信息类型 | 目的地 | 不进入记忆的情况 |
|---|---------|--------|----------------|
| 1 | 用户偏好/工作风格/角色变更 | `user/preferences.md` | 一次性偏好 |
| 2 | 用户个人信息（知识水平、技术栈） | `user/knowledge.md` | 可从对话推断的临时信息 |
| 3 | 项目目标/里程碑/时间线变更 | `project/goals.md` | 已在项目文档中体现 |
| 4 | 架构决策/技术选型/ADR | `project/decisions.md` | 可逆的小决定 |
| 5 | 事故/教训/生产问题 | `project/incidents.md` | 已修复且不太可能再遇到的单次 bug |
| 6 | 反复出现的坑/模式级教训 | `agent/pitfalls.md` | 一次性踩坑 |
| 7 | 工具怪癖/平台特定行为 | `agent/tool_quirks.md` | 标准文档已覆盖的行为 |
| 8 | 反思/改进建议/流程优化 | `agent/reflections.md` | 未经验证的主观推测 |

**分流判定流程**：
1. 这个信息跨任务后是否还有价值？→ 否 → 不写入记忆
2. 这个信息是用户相关、项目相关、还是 Agent 经验？→ 选择目标层
3. 这个信息是事实、教训、还是决策？→ 选择具体文件
4. 这个信息是否已在 CLAUDE.md、契约文件、或代码中体现？→ 是 → 不写入记忆（避免重复）

### 7.1 Frozen Snapshot（会话冻结快照）

会话结束前，主线程必须执行一次 memory scan：
1. 扫描本次会话中产生的可沉淀信息
2. 按本节分流规则判定去向
3. 写入对应记忆文件，更新 MEMORY.md 索引
4. 对于 candidate_reflection，标记为未验证

**会话边界**：memory 是上一会话的结束态，不是下一会话的初始假设。新会话开始时，Agent 必须验证记忆是否仍然有效。

### 7.2 非记忆沉淀路径

以下信息明确不走记忆架构，有独立的沉淀路径：

| 信息类型 | 沉淀路径 |
|---------|---------|
| 代码模式/架构/文件路径 | 代码库本身（Read/Grep/Glob） |
| Git 历史/变更记录 | `git log` / `git blame` |
| 调试方案/修复 | 代码中的修复（代码即文档） |
| CLAUDE.md 规范 | CLAUDE.md 和契约文件 |
| 任务临时状态 | 任务目录树（`.claude/tasks/<task-id>/`） |

## 8. 记忆与任务真相的边界

- 记忆是跨任务经验，不是当前任务事实
- 任务真相（00-task-state.yaml）不能被记忆直接覆盖
- 记忆可作为参考输入，但当前任务的权威来源仍然是 intent + state + contracts
- 当记忆与当前任务事实冲突时，以当前事实为准，并记录冲突
