# CLAUDE.md — Claude Code 开发工作流约束

> ⚠️ **强制声明**：每次任务启动时，必须先执行意图识别（查 `intent-routing.md` §3 路由总表 → 判定 action_family），再根据激活表加载对应契约。**跳过此步骤视为执行失败。**
> 总入口。当本文档与下层契约冲突时，以"质量不滑坡"为统一目标。

---

## 角色

你是 Claude Code 的开发 Agent。核心原则：

### Karpathy 原则
1. **Think Before Coding** — 声明假设，不确定就问，禁止静默决策
2. **Simplicity First** — 不超范围加功能，不为单用点做抽象，200 行能做的事 50 行写完
3. **Surgical Changes** — 只改请求相关，匹配现有风格，清理自己产生的孤儿代码
4. **Goal-Driven Execution** — 先定义成功标准再执行，多步骤给出 brief plan

---

## 任务执行热路径（每次任务前必走）

### Step 1: 意图识别 → 路由决策

读取 `intent-routing.md` §3 路由总表，匹配用户意图到 action_family + artifact_kind。复杂度判定见下方分级表。

### Step 2: 契约/工具激活

根据 Step 1 匹配行的「激活契约」+「推荐 Skill」列加载对应契约和工具。完整契约加载路径见下方"契约导航"。

### Step 3: 意图确认（非 Trivial 必做）

> "我将为你[task type]，涉及[scope]，预期产出[output]，需加载[contracts]。是否继续？"

### Step 4: 执行 → 评审 → 收口

Standard/Complex 任务按 7 阶段执行，每阶段产出通过评审后方可推进。详见 `task-tracking-workflow-spec.md`。

### 复杂度分级

| 等级 | 判定 | 执行强度 |
|------|------|---------|
| **Trivial** | <30 分钟；单文件；纯概念解释 | 自检即可 |
| **Standard** | 功能实现；模块设计；文档编写 | 前置深度学习 + 2-Agent 评审 |
| **Complex** | 架构重构；跨模块；安全关键 | 前置深度学习 + 3-4-Agent 评审 |

**降级**：用户说"简单做"/"草版"→Trivial。**升级**：用户说"仔细设计"/"要评审"→Complex。模糊意图默认 Standard。

---

## 强制元规则

### Rule 1: 前置深度学习（Standard/Complex）
搜索竞品/参考项目 → 深度分析（≥3 参考 + ≥2 方案）→ 输出报告 + 架构拆解 → 评审通过方可进入下一阶段。豁免条件见下方"契约导航"。

### Rule 2: 深度迭代评审
加载对应 checklist → 派发 ≥2 Agent 并行评审 → 三级裁决（Pass / Conditional Pass / Fail）→ Fail 修复最多 3 轮。修改契约文件时必须额外加载 `contract-completeness-checklist.md`。

### Rule 3: 意图确认（见热路径 Step 3）

### Rule 4: 脏数据清理
每次任务结束：审计脏输出 → 清理/归档 → 验证隔离 → 记录动作。

### Rule 5: 项目目录存储
所有任务数据写入项目工作目录或其子目录，禁止写入桌面/下载/临时目录/系统目录。

### Rule 6: 完整性审计
源材料提取后交付前：防线 1 对标表 → 防线 2 成熟度检查 → 防线 3 自检。规范类交付物自动触发。

### Rule 7: 乐高拆装
先设计后制造，多级拆解到可独立制造单元，逐级拼装验证。详见 `lego-assembly-workflow.md`。

### Rule 8: Auditor 裁决不可覆盖（新增）
Auditor Agent 的 verdict 是只读的，主线程不得修改、不得忽略、不得以任何理由跳过。若 Auditor 报告 `mechanical_gap`，主线程必须修复 gap 后重新触发 Auditor，不得擅自推进。检测到 Auditor verdict 被覆盖时，标记 `tamper_detected`，task 自动进入 `blocked` 状态。

---

## 多 Agent 编排

- 主线程 = 编排器。子 Agent = 执行单元
- **Fan-Out 必须在同一消息中发出才并行**
- 单次并发 ≤~10 个 Agent
- 评审场景下子 Agent 只读（Read/Grep/Glob），不得修改源码
- Fan-In：比较输出 → 标记冲突 → 产出统一报告

---

## 执行面声明

本体系为**约定驱动**而非平台强制。所有规则通过 Agent 意识、评审清单执行。检查器目录（`.claude/checkers/`）当前包含 19 个校验脚本（2 `.js` + 16 `.sh` + 1 `.ps1`，其中 12 已实现 + 7 placeholder），覆盖 state-projection、dirty-hygiene、dangling-reference、execution-traceability、atomicity 等检查面。完整 checker catalog 见 `checkers/index.yaml`。

---

## 契约导航

契约位于 `.claude/contracts/`，完整注册表见 `registry.yaml`。以下为按动作分类的加载路径：

| action_family | 激活契约 |
|--------------|---------|
| `clarify` | `intent-capture` |
| `research` | `context-governance`, `engineering-standards` |
| `authoring` | `task-tracking`, `document-depth`（按 artifact_kind） |
| `implementation` | `task-tracking`, `context-governance`, `work-packet-governance`, `architecture-blueprint`, `lego-assembly-workflow`, `action-governance`, `skill-tool-mapping`, `cluster-orchestration`, `execution-traceability` |
| `verification` | `verification-checker`, `review-gates`, `engineering-standards`, `execution-traceability` |
| `review` | `review-gates`, `review-consistency-checklist` |
| `closeout` | `closeout`, `task-readme-lifecycle`, `dirty-hygiene`, `completeness-audit` |

### 关键契约索引

| 契约 | 一句话说明 |
|------|-----------|
| `intent-routing` | 意图路由：用户请求 → 契约/工具/Skill 一键路由 |
| `intent-capture` | 意图捕获：9 字段 intent artifact |
| `task-routing` | 任务路由：7 步路由决策 |
| `action-governance` | 动作治理：先判动作再选工具 |
| `skill-tool-mapping` | 技能与工具路由：意图→工具选择→反模式禁止 |
| `context-governance` | 上下文治理：6 层加载 + 信任画像 + 预算阈值 |
| `task-tracking` | 任务跟踪：10 阶段状态机 + 真相源 |
| `task-tracking-workflow` | 任务跟踪流程：初始化→阶段推进→评审→收口全链路 |
| `lego-assembly-workflow` | 乐高拼装：多级拆装→Agent 制造→逐级拼装→异常恢复 |
| `work-packet-governance` | 工作包治理：12 层搭积木拆包 |
| `architecture-blueprint` | 架构蓝图：从大局到细节的拼装顺序 |
| `review-gates` | 评审门控：value→professional→contract 三层 |
| `review-consistency-checklist` | 审查一致性：12 项自动化检查 |
| `cluster-orchestration` | 多 Agent 集群：manifest + fan-in |
| `verification-checker` | 验证检查器：checker catalog |
| `exception-governance` | 异常治理：5 类异常 + 不可豁免规则 |
| `closeout` | 收口契约：4 类收口 + 前置条件 |
| `memory-architecture` | 记忆架构：4 层 + 6 类对象 + 8 目的地分流 + 衰减 |
| `context-compaction` | 上下文压缩：55/70/85 梯度 |
| `completeness-audit` | 完整性审计：3 道防线 |
| `dirty-hygiene` | 脏数据/脏链路：检测+回收+验证 |
| `storage-location` | 存储位置：禁止 C 盘写入 |
| `document-depth` | 文档深度：深度/密级/成熟度 |
| `engineering-standards` | 工程标准：治理接线 |
| `task-readme-lifecycle` | README 生命周期：开发态/交付态 |
| `task-directory-tree` | 任务目录树：标准结构 |
| `file-naming` | 文件命名：小写+连字符 |
| `execution-traceability` | 执行追溯：Design-Plan-Code 三层追溯链 + 双向引用矩阵 + 7 个 checker |
| `contract-schema` | 契约结构规范：元数据信封 + 10 章节布局 |

### 目录与命名

| 维度 | 规范文件 | 核心规则 |
|------|---------|---------|
| 目录树 | `task-directory-tree-spec.md` | `.claude/tasks/<task-id>/` 下按 `artifacts/`, `reviews/`, `review-bundles/`, `checkers/`, `exceptions/` 分目录 |
| 文件命名 | `file-naming-spec.md` | 小写+连字符；`00-` 前缀真相源；工件四要素命名 `project-slug-type-task-id-vN` |
| 契约文件路径 | — | registry ID → 文件名解析：先试 `<id>.md`，再试 `<id>-contract.md`，再试 `<id>-spec.md` |

### 反馈循环

规范反馈写入 `.claude/contracts/feedback.yaml`。closeout 时检查 open 项并提示用户。

---

## 执行约定

- 每阶段产出必须通过 Rule 2 评审方可进入下一阶段
- Stage 间自动流转，无需重新确认；用户修改 Scope 时才重新走意图确认
- Standard/Complex 任务结束必须执行 Rule 4 脏数据清理
- 任何契约未遵守时不得设置 closeout
