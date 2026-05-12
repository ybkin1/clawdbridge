# tk-20260511-002 — MCP 约束执行器

## 任务摘要

构建基于 MCP（Model Context Protocol）的约束执行器服务器，通过 6 个工具强制规范架构合规，解决 "Agent 不严格遵循规范" 的核心问题。

## 核心产出

| 文件 | 说明 |
|------|------|
| `enforcer.js` | MCP Server 核心：6 工具实现、8 项机械条件检查、证据锁生成、Bash Checker 跨平台执行 |
| `tools.js` | 工具定义与 JSON-RPC 2.0 路由 |
| `test.js` | 24 项断言，覆盖率核心路径，全部通过（Round 3 曾扩展至 30 断言并在远程 `claude_aly` 验证通过） |
| `package.json` | ESM 模块配置 + 依赖 |

## 关键设计

- **Mechanical Enforcement Chain**: Intent → Route → Phase → Mandatory Checkers → Evidence → Gate → Transition
- **Evidence Lock**: `evidence-lock-<phase>.yaml` 按 §4.5 schema，含 `evidence_lock` 顶层键
- **8 Mechanical Conditions** (§4.2.1): phase_status=passed, gate all passed, artifact exists & size>0, no blocker, dirty-hygiene passed, updated_at freshness, mandatory checkers passed/excepted, auditor_verdict=audited
- **Bash Checker Wrapper Protocol §10.1**: exitCode≠0→blocked, exitCode=0+FAILED→failed, exitCode=0+PASSED→passed
- **PreToolUse Hook**: 敏感文件操作精确拦截（evidence locks、checker results、receipts）

## 安全修复记录

| 轮次 | 问题 | 修复 |
|------|------|------|
| Round 1 | 基础实现 | 初始 24 断言 |
| Round 2 | 路径遍历（runBashChecker/validateWritePermission）、命令注入 | `path.resolve` + `startsWith` 校验、扩展名白名单（`.sh`/`.ps1`） |
| Round 3 | `generateEvidenceLock` 在 allPassed 检查时拒绝、dangling-reference-check 被拦截 | 测试前置条件设置 checker 状态为 passed；validateWritePermission 增加 `newContent` 必填校验 |

## 评审历史

- **Round 1**: review-r1-constraint-enforcer.md — 基础功能评审
- **Round 2**: 对话内评审 — 安全性强化（2-Agent 并行）
- **Round 3**: 对话内评审 — 边界条件与机械合规（2-Agent 并行）
- **Round 4**: 6 维度独立评审（4-Agent 并行 + Fan-In 综合）— 安全/平台/性能/可靠/可行/可维护

## Round 4 关键修复

| 维度 | 修复 |
|------|------|
| 安全 | Hook fail-closed；validateWritePermission realpathSync + 无任务阻断 |
| 可靠 | 启动配置校验；原子写入 + 回滚；未知 check_type 硬失败 |
| 性能 | 目录级批量加载；checker 预索引；并发上限 3 |
| 可行 | 原子性拆包检查器；JSON Schema；CI 工作流 |

## 状态

- **最终状态**: `passed`
- **测试**: 36/36 断言通过（本地）；历史上 30/30 断言通过（远程服务器 `claude_aly`）
- **归档日期**: 2026-05-13
