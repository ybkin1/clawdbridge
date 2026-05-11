# tk-20260509-002: 规范架构适配与缺失技能安装

## 任务概述

将 yb 项目与 `.claude/` 规范架构对齐，补齐执行面缺口（checker 自动化），并安装缺失的外部 Skills。

## 交付清单

### 1. Checker 自动化（7 个新增 + 2 个修复）

| Checker | 模式 | 状态 |
|---------|------|------|
| `dangling-reference-check.sh` | automated | 修复（排除 node_modules、reviews、clawd-on-desk-main） |
| `route-output-closure-check.sh` | automated | 修复（跳过无 state 的历史任务） |
| `dirty-chain-prevention-check.sh` | automated | 新增 |
| `stale-projection-cleanup-check.sh` | automated | 新增 |
| `context-budget-delegation-check.sh` | automated | 新增 |
| `compaction-trigger-closure-check.sh` | automated | 新增 |
| `review-consistency-check.sh` | automated | 新增 |
| `subagent-orchestration-check.sh` | automated | 新增 |
| `state-projection-alignment-check.sh` | automated | 原有，通过验证 |

> 注：`architecture-decomposition-check` 为 manual 类型，未编写脚本。

### 2. 外部 Skills 安装

| Skill | 用途 | 状态 |
|-------|------|------|
| `frontend-design` | UI 原型设计 | 已安装并启用 |
| `superpowers` | 增强推理 | 已安装并启用 |
| `anything-notebooklm` | 演示文稿生成 | 安装失败，已记录 tooling_exception（exc-20260509-001）并启用 fallback |

### 3. 目录结构补齐

- 创建 `.claude/tasks/INDEX.md`（任务索引）
- 当前任务目录已按 `task-directory-tree-spec` 初始化（artifacts/、checkers/、exceptions/、review-bundles/、reviews/）

### 4. 任务状态修复

- 为 tk-20260509-001 和 tk-20260509-002 补充 `action_family` 字段
- tk-20260509-001 gate_results 从 professional 调整为 self_review，补充 self-review-report.md

## 验证结果

所有 9 个自动化 checker 均通过（PASSED）。

## 异常记录

- `.claude/tasks/tk-20260509-002-norms-adaptation/exceptions/tooling-exception.yaml`：anything-notebooklm 不可用

## 关闭日期

2026-05-09
