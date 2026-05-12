# Review Round 2 — MCP Constraint Enforcer

## 评审配置
- **评审类型**: security + mechanical compliance
- **Agent 数**: 2（code-reviewer + security-reviewer）
- **触发时间**: 2026-05-12

## 发现项

### [FIXED] 1. 路径遍历 — runBashChecker
**严重程度**: Critical
**位置**: `enforcer.js:runBashChecker`
**问题**: `scriptPath` 未校验，可传入 `../../../etc/passwd` 等恶意路径。
**修复**: 增加 `path.resolve` + `startsWith(resolvedRoot + path.sep)` 校验，以及扩展名白名单（`.sh`/`.ps1`）。

### [FIXED] 2. 路径遍历 — validateWritePermission
**严重程度**: Critical
**位置**: `enforcer.js:validateWritePermission`
**问题**: `filePath` 未校验相对路径逃逸。
**修复**: 增加 `path.resolve` + `path.relative` + `startsWith("..")` 守卫。

### [FIXED] 3. 命令注入 — runBashChecker shell 选择
**严重程度**: High
**问题**: 未限制可执行脚本类型。
**修复**: 仅允许 `.sh`（bash）和 `.ps1`（powershell）扩展名。

## 裁决

**Verdict**: Conditional Pass → Pass（after fixes）
**条件**: 以上 3 项安全漏洞必须在合并前修复。
**修复验证**: 30/30 断言通过。

## 评审人
- code-reviewer Agent
- security-reviewer Agent
