---
contract_id: "file-naming"
title: "文件命名规范"
owner: "claude-code"
scope: "规范架构中所有文件的命名规则，确保可预测、可排序、可检索"
trigger: "任何文件创建、重命名或引用时"
required_inputs: []
required_contracts: []
required_skills: []
verification_checks: ["global-naming-convention", "three-part-artifact-format", "project-slug-present", "iteration-version-present", "task-id-format", "truth-source-00-prefix", "artifact-naming", "review-bundle-format", "checker-result-naming", "exception-ledger-naming", "memory-file-naming", "contract-file-naming", "checklist-naming"]
exceptions: ["legacy-underscore-files", "legacy-fixed-artifact-names"]
supersedes: []
version: 3
last_reviewed_at: "2026-05-09"
---

# 文件命名规范（File Naming Specification）

## 1. 目的

定义 Claude Code 规范架构中所有文件的命名规则，确保可预测、可排序、可检索。

## 2. 全局命名规则

### 2.1 通用规则

- 全部使用小写字母
- 单词之间用连字符 `-` 分隔
- 不使用空格、下划线（除非是 legacy 文件）
- 使用有意义的描述性名称
- 文件扩展名：`.md`（文档）、`.yaml`（结构化数据）、`.yml`（仅外部工具要求时）

### 2.2 核心命名格式（四要素）

工件类文件的统一格式：

```
<project-slug>-<file-type>-<task-id>-v<iteration>.<ext>
```

| 要素 | 含义 | 示例值 |
|------|------|--------|
| `project-slug` | 项目简称，全小写连字符 | `clawdbridge`、`yb`、`harness` |
| `file-type` | 文件类型，见 §5 类型表 | `prd`、`design`、`dev-plan` |
| `task-id` | 任务标识，格式见 §3 | `tk-20260509-003` |
| `iteration` | 迭代版本号，从 1 开始递增 | `v1`、`v2`、`v3` |

> **project-slug 来源**：取项目目录名或约定的项目简称，全小写连字符，保持跨任务一致。

完整示例：`harness-prd-tk-20260509-003-v1.md`、`yb-architecture-breakdown-tk-20260509-003-v2.md`

### 2.3 免四要素的场景

以下文件**不适用**三要素格式，保持固定名或自身命名规则：

| 类别 | 示例 | 原因 |
|------|------|------|
| 真相源文件（§4） | `00-user-intent.md`、`board.yaml`、`README.md` | 任务级固定名，非项目工件 |
| 评审包（§6） | `rb-build-001/` | 自身有 `attempt-N` 版本机制 |
| 评审结果（§7） | `agent-safety-report.md` | bundle-id 已含版本 |
| 契约文件（§11） | `file-naming-spec.md` | 跨项目规范文件 |
| 记忆文件（§10） | `decisions.md`、`pitfalls.md` | 跨会话固定名 |
| Checker/异常记录（§8/§9） | `checker-results.yaml`、`exception-ledger.yaml` | 单实例文件 |

### 2.4 禁止

- 中文文件名
- 驼峰命名
- 时间戳后缀（除非是日志/快照类文件）
- 工件文件省略 project-slug、task-id 或 iteration 字段

### 2.5 违反处理

| 场景 | 处理动作 | 执行时机 |
|------|---------|---------|
| 新建文件违反命名规则 | 拦截创建，提示正确格式 | 文件创建时 |
| 已存在的不合规命名 | 任务收口时重命名或移入 `archive/` | closeout 阶段 |
| 工件缺少 project-slug/task-id/iteration | 视为评审硬失败项，阻断阶段推进 | review 阶段 |
| 版本号跳跃或重复 | Checker 标记为 failed，要求修正 | verification 阶段 |

## 3. 任务 ID 命名

格式：`tk-YYYYMMDD-NNN`

- `YYYYMMDD`：创建日期
- `NNN`：当日序号（从 001 开始）

示例：`tk-20260430-001`、`tk-20260430-002`

## 4. 真相源文件命名

| 文件 | 规则 | 示例 |
|------|------|------|
| 意图文件 | `00-user-intent.md` | 固定名 |
| 状态文件 | `00-task-state.yaml` | 固定名 |
| 看板 | `board.yaml` | 固定名 |
| README | `README.md` | 固定名 |

**规则**：`00-` 前缀表示这是真相源文件，必须存在于每个任务根目录。

## 5. 工件文件命名（artifacts/）

### 5.1 命名格式

```
artifacts/<project-slug>-<file-type>-<task-id>-v<iteration>.<ext>
```

- `project-slug`：项目简称（§2.2），例如 `harness`
- `file-type`：文件类型（见下表）
- `task-id`：任务标识（§3），例如 `tk-20260509-003`
- `iteration`：从 1 开始递增，每次实质性修订时 `+1`
- `ext`：`.md`、`.yaml`

完整路径示例：
```
artifacts/harness-learning-report-tk-20260509-003-v1.md
artifacts/harness-prd-tk-20260509-003-v2.md
artifacts/harness-design-tk-20260509-003-v1.md
```

### 5.2 文件类型表

| 类型 | file-type | 说明 |
|------|-----------|------|
| 路由投影 | `route-projection` | `.yaml` |
| 委派计划 | `delegation-plan` | `.yaml` |
| Fan-in 报告 | `fan-in-report` | `.md` |
| 检查点 | `checkpoint` | `.md` |
| 压缩记录 | `compaction-receipt` | `.yaml` |
| 学习报告 | `learning-report` | `.md` |
| 架构拆解 | `architecture-breakdown` | `.md` |
| PRD | `prd` | `.md` |
| 详细设计 | `design` | `.md` |
| 开发计划 | `dev-plan` | `.md` |
| 测试报告 | `test-report` | `.md` |

### 5.3 迭代规则

- **首次创建**：`v1`
- **小幅修订**（错别字/格式）：原地覆盖，不增版本
- **实质修订**（新增章节/需求变更/架构调整）：副本另存 `v<N+1>`，旧版移入 `artifacts/archive/`
- **否决重写**：保留被否决版本于 `archive/`，新建 `v<N+1>` 继续

### 5.4 存档

`artifacts/archive/` 下的文件命名与 active 一致，仅位置不同：
```
artifacts/archive/harness-prd-tk-20260509-003-v1.md
artifacts/archive/harness-prd-tk-20260509-003-v2.md
```


## 6. 评审包命名（review-bundles/）

格式：`rb-<phase>-<attempt-N>/`

| 组件 | 含义 |
|------|------|
| `rb-` | review-bundle 前缀 |
| `<phase>` | 当前 phase 名称 |
| `attempt-N` | 第 N 次评审尝试 |

示例：`rb-spec-001/`、`rb-build-001/`、`rb-build-002/`

### 6.1 Bundle 内文件命名

固定为：
- `README.md`
- `00-user-intent.md`
- `01-truth-sources.md`
- `02-review-rubric.yaml`
- `03-hard-fail-rules.yaml`
- `04-scope-boundary.md`
- `05-value-evidence.yaml`

**规则**：`00-05` 数字前缀表示评审包的标准文件顺序，固定不可变。

## 7. 评审结果命名（reviews/）

格式：`reviews/<bundle-id>/<agent-type>-report.md`

| agent-type | 含义 |
|-----------|------|
| `agent-safety` | 安全维度评审 |
| `agent-performance` | 性能维度评审 |
| `agent-correctness` | 正确性维度评审 |
| `agent-architecture` | 架构维度评审 |
| `agent-completeness` | 完整性维度评审 |
| `synthesis-report` | 综合评审结论 |
| `receipt` | 评审收据（.yaml） |

示例：`reviews/rb-build-001/agent-safety-report.md`

## 8. Checker 结果命名

固定为：`checkers/checker-results.yaml`

内部结构按 checker_id 区分：
```yaml
checkers:
  - checker_id: dirty-chain-prevention-check
    status: passed
    ...
  - checker_id: review-consistency-check
    status: passed
    ...
```

## 9. 异常记录命名

固定为：`exceptions/exception-ledger.yaml`

## 10. 记忆文件命名

| 文件 | 固定名 |
|------|--------|
| 记忆索引 | `MEMORY.md` |
| 用户角色 | `role.md` |
| 项目目标 | `goals.md` |
| 决策记录 | `decisions.md` |
| 事故记录 | `incidents.md` |
| 踩坑记录 | `pitfalls.md` |
| 工具怪癖 | `tool-quirks.md` |
| 经验反思 | `reflections.md` |
| 近期会话 | `recent.md` |

## 11. 契约文件命名

格式：`<contract-name>-contract.md` 或简化名称

缩写规则：
- 完整名称（如 `task-tracking-contract.md`）用于核心契约
- 简化名称（如 `architecture-blueprint.md`）用于派生契约
- `-spec.md` 后缀（如 `completeness-audit-spec.md`）用于规范/规格文件
- `-checklist.md` 后缀（如 `review-consistency-checklist.md`）用于评审清单
- `-workflow-spec.md` 后缀（如 `task-tracking-workflow-spec.md`）用于流程规格
- `-tree-spec.md` 后缀（如 `task-directory-tree-spec.md`）用于结构规格

**当前契约清单**：
| 契约类型 | 文件名 |
|---------|--------|
| 意图捕获 | `intent-capture-contract.md` |
| 任务路由 | `task-routing-contract.md` |
| 动作治理 | `action-governance-contract.md` |
| 上下文治理 | `context-governance-contract.md` |
| 任务跟踪 | `task-tracking-contract.md` |
| 工作包治理 | `work-packet-governance.md` |
| 架构蓝图 | `architecture-blueprint.md` |
| 评审门控 | `review-gates-contract.md` |
| 审查一致性 | `review-consistency-checklist.md` |
| 记忆架构 | `memory-architecture.md` |
| 验证检查器 | `verification-checker.md` |
| 异常治理 | `exception-governance.md` |
| 收口契约 | `closeout-contract.md` |
| README 生命周期 | `task-readme-lifecycle.md` |
| 文档深度 | `document-depth.md` |
| 工程标准 | `engineering-standards.md` |
| 多 Agent 集群 | `cluster-orchestration.md` |
| 任务跟踪流程 | `task-tracking-workflow-spec.md` |
| 任务目录树 | `task-directory-tree-spec.md` |
| 文件命名 | `file-naming-spec.md` |

## 12. 评审清单命名

格式：`stage<N>-<stage-name>-review.md`

示例：`stage1-learning-review.md`、`stage6-code-review.md`

## 13. 上下文压缩相关固定名

| 类型 | 固定名 |
|------|--------|
| 压缩记录 | `compaction-receipt.yaml` |
| 检查点 | `checkpoint.md` |
