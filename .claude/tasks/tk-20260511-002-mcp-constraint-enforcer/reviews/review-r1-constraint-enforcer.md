# Review Report — constraint-enforcer MCP Server (Round 1)

**评审类型**: Complex 代码评审（首轮全维并行审计）
**评审 Agent**: code-reviewer + contract-reviewer（2 Agent 并行，blind independent）
**日期**: 2026-05-12
**统一裁决**: Conditional Pass

---

## 发现汇总（去重后 17 项）

| # | 优先级 | 文件 | 行号/章节 | 问题 | 来源 |
|---|--------|------|-----------|------|------|
| 1 | **P0** | `enforcer.js` | 172-185 | `runBashChecker` 未校验 `scriptPath`，存在命令注入风险 | Code |
| 2 | **P0** | `enforcer.js` | 314-378 | `validateWritePermission` 的 `filePath` 未做目录遍历校验 | Code |
| 3 | **P1** | `enforcer.js` | 84-166 | `checkPhaseReadiness` 仅实现 4/8 个机械条件 | Contract |
| 4 | **P1** | `enforcer.js` | 384-478 | `generateEvidenceLock` 格式不符合 section 4.5 | Contract |
| 5 | **P1** | `hooks/*.ps1` / `*.sh` | 75, 107 | `checker-reminder` 脚本缺失时 hook 直接放行 | Contract |
| 6 | **P1** | `enforcer.js` | 122-126 | gate 失败检测基于文本匹配，误报率高 | Code |
| 7 | **P1** | `enforcer.js` | 172-185 | `runBashChecker` 未设置 timeout | Code |
| 8 | **P1** | `enforcer.js` | 484-551 | `requestPhaseTransition` 非原子写入 state 文件 | Code |
| 9 | **P1** | `enforcer.js` | 42-56 | `findActiveTask` 同步 IO 可能阻塞事件循环 | Code |
| 10 | **P1** | `test.js` | 全局 | 测试仅覆盖成功路径，边界/负面测试缺失 | Contract |
| 11 | **P2** | `enforcer.js` | 452-454 | `artifact_files` 逻辑错误（条件恒为 false） | Code + Contract |
| 12 | **P2** | `enforcer.js` | 172-185 | checker 状态解析不符合 section 10.1 | Contract |
| 13 | **P2** | `enforcer.js` | 32-39 | `loadYaml` 吞掉所有异常 | Code |
| 14 | **P2** | `enforcer.js` | 354-362 | `validateWritePermission` newContent 正则易被绕过 | Code + Contract |
| 15 | **P2** | `test.js` | 16 | 硬编码 `/tmp`，Windows 不兼容 | Code + Contract |
| 16 | **P2** | `index.js` | 32-68 | 错误信息可能泄露内部路径 | Code |
| 17 | **P2** | `enforcer.js` | 557-586 | `getCheckerCatalog` 不验证最小 catalog 覆盖 | Contract |

---

## 裁决

**verdict**: `conditional_pass`

**理由**:
1. P0 安全缺陷必须修复：命令注入和路径遍历可绕过整个约束机制。
2. P1 规范合规缺口严重：`checkPhaseReadiness` 缺失 4 个机械条件（特别是 Auditor verdict）；Evidence Lock 格式偏离 section 4.5。
3. P1 运行时可靠性问题：hook 的 checker-reminder 缺失导致阻断失效；runBashChecker 无 timeout 可能挂死 Server。
4. 正面因素：架构设计正确（MCP + Hook 双层协作），工具定义与规范映射准确，`manual_pending` 处理符合 section 12.2。

---

## 修复优先级

### P0（阻塞级）
- [ ] enforcer.js:172 — `runBashChecker` 校验 `checkerId` 白名单 + `scriptPath` 前缀校验
- [ ] enforcer.js:314 — `validateWritePermission` 使用 `path.resolve` + `path.relative` 校验 `filePath` 范围

### P1（高优，修复后重新评审）
- [ ] enforcer.js:84 — 补充 section 4.2 缺失的 4 个机械条件
- [ ] enforcer.js:384 — 按 section 4.5 schema 重构 `generateEvidenceLock`
- [ ] hooks:75/107 — 增加 `checker-reminder` 脚本存在性检查
- [ ] enforcer.js:122 — gate 失败检测改为结构化遍历
- [ ] enforcer.js:172 — `runBashChecker` 增加 timeout（60s）
- [ ] enforcer.js:484 — `requestPhaseTransition` 原子写入
- [ ] test.js — 补充 >=6 个边界/负面测试用例

### P2（中优）
- [ ] enforcer.js:452 — 修复 `artifact_files` 逻辑
- [ ] enforcer.js:172 — 按 section 10.1 精确解析 checker 状态
- [ ] enforcer.js:32 — `loadYaml` 区分异常类型
- [ ] test.js:16 — 使用 `os.tmpdir()` 替代硬编码 `/tmp`
