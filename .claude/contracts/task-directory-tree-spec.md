---
contract_id: "task-directory-tree"
title: "任务目录树规范"
owner: "claude-code"
scope: "任务的标准目录结构，确保每个任务的文件组织可预测、可恢复、可审计"
trigger: "任务初始化时创建目录结构，closeout时执行清理"
required_inputs: ["task-tracking状态"]
required_contracts: ["task-tracking"]
required_skills: []
verification_checks: ["global-directory-structure", "truth-vs-derived-classification", "directory-creation-timing", "closeout-cleanup-rules", "trivial-task-simplified-structure"]
exceptions: []
supersedes: []
version: 2
last_reviewed_at: "2026-05-09"
---

# 任务目录树规范（Task Directory Tree Specification）

## 1. 目的

定义 Claude Code 任务的标准目录结构，确保每个任务的文件组织可预测、可恢复、可审计。

## 2. 全局目录结构

```
.claude/
├── CLAUDE.md                              ← 总纲（项目根目录）
├── contracts/                             ← 契约目录
│   ├── registry.yaml                      ← 契约注册表
│   ├── intent-capture-contract.md
│   ├── task-routing-contract.md
│   ├── action-governance-contract.md
│   ├── context-governance-contract.md
│   ├── task-tracking-contract.md
│   ├── task-tracking-workflow-spec.md     ← 任务跟踪流程
│   ├── work-packet-governance.md
│   ├── architecture-blueprint.md
│   ├── review-gates-contract.md
│   ├── review-consistency-checklist.md
│   ├── memory-architecture.md
│   ├── verification-checker.md
│   ├── exception-governance.md
│   ├── closeout-contract.md
│   ├── task-readme-lifecycle.md
│   ├── document-depth.md
│   ├── engineering-standards.md
│   ├── cluster-orchestration.md
│   └── references/                        ← 工程标准参考
│       ├── repo-profile.md                ← 项目结构参考
│       └── command-catalog.md             ← 命令候选目录
│
├── project/
│   └── checklists/                        ← 评审清单
│       ├── stage1-learning-review.md
│       ├── stage2-architecture-review.md
│       ├── stage3-prd-review.md
│       ├── stage4-5-plan-review.md
│       ├── stage6-code-review.md
│       └── stage7-test-review.md
│
├── memory/                                ← 记忆存储
│   ├── MEMORY.md                          ← 记忆索引
│   ├── user/
│   │   └── role.md
│   ├── project/
│   │   ├── goals.md
│   │   ├── decisions.md
│   │   └── incidents.md
│   ├── agent/
│   │   ├── pitfalls.md
│   │   ├── tool_quirks.md
│   │   └── reflections.md
│   └── session/
│       └── recent.md
│
├── templates/                             ← 模板
│   └── 00-task-state.yaml
│
└── tasks/                                 ← 任务运行时目录
    └── <task-id>/
        ├── 00-user-intent.md              ← [主真相源] 意图捕获
        ├── 00-task-state.yaml             ← [主真相源] 机器可读状态
        ├── README.md                      ← [派生投影] 人类入口
        ├── board.yaml                     ← [派生投影] 工作项看板
        ├── artifacts/                     ← 任务产物
        │   ├── <project-slug>-route-projection-<task-id>-v1.yaml   ← 路由决策结果
        │   ├── <project-slug>-delegation-plan-<task-id>-v1.yaml    ← 委派计划
        │   ├── <project-slug>-fan-in-report-<task-id>-v1.md        ← Fan-in 综合报告
        │   ├── <project-slug>-checkpoint-<task-id>-v1.md           ← 恢复检查点
        │   ├── <project-slug>-compaction-receipt-<task-id>-v1.yaml ← 压缩记录
        │   ├── <project-slug>-learning-report-<task-id>-v1.md      ← 学习分析报告（Stage 1）
        │   ├── <project-slug>-architecture-breakdown-<task-id>-v1.md ← 架构拆解（Stage 2）
        │   ├── <project-slug>-prd-<task-id>-v1.md                  ← PRD（Stage 3）
        │   ├── <project-slug>-design-<task-id>-v1.md               ← 详细设计（Stage 4）
        │   ├── <project-slug>-dev-plan-<task-id>-v1.md             ← 开发计划（Stage 5）
        │   └── <project-slug>-test-report-<task-id>-v1.md          ← 测试报告（Stage 7）
        │
        ├── review-bundles/                ← 评审包目录
        │   └── <bundle-id>/
        │       ├── README.md              ← Bundle 描述
        │       ├── 00-user-intent.md      ← 意图来源
        │       ├── 01-truth-sources.md    ← 真相源清单
        │       ├── 02-review-rubric.yaml  ← 评审量表
        │       ├── 03-hard-fail-rules.yaml← 硬失败规则
        │       ├── 04-scope-boundary.md   ← 评审范围边界
        │       └── 05-value-evidence.yaml ← 价值证据（可选）
        │
        ├── reviews/                       ← 评审结果
        │   └── <bundle-id>/
        │       ├── agent-<id>-report.md   ← 评审 Agent 报告
        │       ├── synthesis-report.md    ← 综合评审结论
        │       └── receipt.yaml           ← 评审收据
        │
        ├── checkers/                      ← Checker 结果
        │   └── checker-results.yaml       ← Checker 运行结果
        │
        ├── exceptions/                    ← 异常记录
        │   └── exception-ledger.yaml      ← 异常台账
        │
        └── non-file-artifacts/            ← 非文件类产出（可选）
            └── artifact-log.yaml          ← 记录数据库迁移/环境变量等非文件产出
```

### 非文件类产出

部分任务产出不是文件（数据库迁移、UI 截图、环境变量配置、第三方服务设置等），必须记录到 `non-file-artifacts/artifact-log.yaml`：

```yaml
artifacts:
  - kind: database_migration
    description: "users 表新增 email_verified 字段"
    verification: "运行 psql -c '\d users' 确认字段存在"
    recorded_at: "2026-04-30T14:00:00Z"
  - kind: env_config
    description: "新增 AUTH_SECRET 环境变量"
    verification: "检查 .env 文件中是否存在且非空"
    recorded_at: "2026-04-30T14:00:00Z"
```

## 3. 目录规则

### 3.1 真相源 vs 派生投影

| 目录/文件 | 类型 | 是否可覆盖主状态 |
|----------|------|----------------|
| `00-user-intent.md` | 主真相源 | 否（用户确认后锁定） |
| `00-task-state.yaml` | 主真相源 | 否（仅主线程可更新） |
| `README.md` | 派生投影 | 否 |
| `board.yaml` | 派生投影 | 否 |
| `artifacts/` | 任务产出 | 否 |
| `review-bundles/` | 评审控制面 | 否 |
| `reviews/` | 评审结果 | 否 |
| `checkers/` | 验证结果 | 否 |
| `exceptions/` | 异常记录 | 否 |

### 3.2 目录创建时机

| 目录 | 创建时机 |
|------|---------|
| `tasks/<task-id>/` | 任务初始化时 |
| `artifacts/` | 任务初始化时 |
| `review-bundles/` | 首次进入评审阶段时 |
| `reviews/` | 首次评审结果产出时 |
| `checkers/` | 首次运行 checker 时 |
| `exceptions/` | 首次记录异常时 |

### 3.3 目录清理规则

任务收口时：
- 保留：`00-user-intent.md`、`00-task-state.yaml`、`README.md`、最后一轮 `reviews/`、`checkers/`、`exceptions/`
- 删除：被否决的评审轮次、临时/诊断/override 文件、过期 checkpoint
- 归档：`artifacts/` 中所有最终产出

### 3.4 违反处理

| 场景 | 处理动作 | 执行时机 |
|------|---------|---------|
| 任务目录结构缺失 | 视为初始化失败，禁止进入下一阶段 | 任务初始化时 |
| 真相源文件缺失 | 拒绝提交评审，要求补齐 | review 阶段 |
| 收口时未按规则清理 | closeout 契约强制拦截，要求重新执行清理 | closeout 阶段 |
| 派生投影覆盖真相源 | 自动回滚，标记异常到 `exceptions/` | 任何写入时 |

## 4. Trivial 任务简化结构

Trivial 任务不创建完整目录树，仅使用：

```
.claude/
└── tasks/
    └── tk-YYYYMMDD-NNN/
        ├── 00-user-intent.md      ← 一句话意图
        └── 00-task-state.yaml     ← 最小状态
```
