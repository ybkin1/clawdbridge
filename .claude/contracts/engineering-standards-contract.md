# 工程规范契约 (Engineering Standards Contract)

> 版本: v1.0
> 状态: draft-ready
> 归属: L3 专项契约
> 依赖: runtime-execution-spec.md (L1), AGENTS.md (L0)
> 设计原则: 只收纳尚无 owner 的规则；已有 owner 的规则只引用不重述

---

## 1. 设计目标

定义代码规范资料的发现、引用和验证规则，确保每个任务都能识别并遵守 repo 的 formatter / linter / typecheck source of truth。

**核心原则**：
- **不重复已有 owner 的规则**：AGENTS.md 已持有的编码标准，本契约只引用
- **分层持有**：禁止事项清单按层级归属，不收纳其他契约已覆盖的项
- **Source of Truth 优先**：任务执行前必须先识别 repo 的 formatter/linter/typecheck 配置

---

## 2. Source of Truth 识别规则

### 2.1 识别流程

每个涉及编码的任务启动前，主线程必须执行：

```
Step 1: 扫描项目根目录，检测以下配置文件（按优先级排序）：
        - formatter: .prettierrc / .prettierrc.json / prettier.config.js
        - linter: .eslintrc.json / .eslintrc.js / eslint.config.mjs
        - typecheck: tsconfig.json / tsconfig.*.json
        - test runner: vitest.config.ts / jest.config.js / playwright.config.ts

Step 2: 若检测到配置 → 记录到 task-state: "formatter=prettier, linter=eslint, typecheck=tsc"
        若未检测到 → 记录 "source_of_truth: missing"，触发警告

Step 3: 将检测到的配置路径附加到子Agent Prompt：
        "本项目使用 [eslint + prettier + tsc] 作为代码规范 source of truth，
         配置文件路径：[.eslintrc.json, .prettierrc, tsconfig.json]
         你必须遵守这些配置，不得引入冲突规则。"
```

### 2.2 变更检测

若任务修改了以下文件，必须触发规范重新验证：
- `.eslintrc*` / `eslint.config.*`
- `.prettierrc*` / `prettier.config.*`
- `tsconfig*.json`
- `package.json` 中的 `eslintConfig` / `prettier` 字段

---

## 3. 禁止事项清单

以下规则由本契约持有（无其他 owner）：

| # | 禁止项 | 触发场景 | 违反后果 | 检测方式 |
|---|--------|---------|---------|---------|
| E1 | 引入与现有 linter 规则冲突的新规则 | 修改 .eslintrc / 添加依赖 | 阻塞 PR | CI lint 失败 |
| E2 | 在 typecheck 未通过的代码上提交 | 提交前未运行 `npm run typecheck` | 阻塞 PR | CI typecheck 失败 |
| E3 | 修改 formatter 配置却不全量格式化 | 修改 .prettierrc 后未执行 `npm run format` | 代码风格不一致 | CI format check 失败 |
| E4 | 绕过审计日志的脱敏规则 | 在日志中打印 token/password | 安全漏洞 | Contract Gate 检查 |
| E5 | 引入未经验证的新框架/库 | 添加 package.json 依赖 | 技术债务 | 需 ADR 记录 |

**以下规则由其他契约持有，本契约只引用**：
- 禁止 `any` → `AGENTS.md` §2.1
- 显式函数返回类型 → `AGENTS.md` §2.1
- 异步错误捕获 → `AGENTS.md` §2.3
- 输入过滤模式 → `DESIGN-Security-Infra-Coding-v1.0.md` §2
- 路径安全 5 步检查 → `DESIGN-Security-Infra-Coding-v1.0.md` §3

---

## 4. 验证命令与 CI 映射

| 验证项 | 本地命令 | CI 等效 | 失败处理 |
|--------|---------|---------|---------|
| Lint | `npm run lint` | `npm run lint` | 阻塞合并 |
| Format Check | `npm run format:check` | `npm run format:check` | 阻塞合并 |
| Type Check | `npm run typecheck` | `npm run typecheck` | 阻塞合并 |
| Unit Test | `npm run test:unit` | `npm run test:unit -- --coverage` | 覆盖率 <80% 阻塞合并 |
| Build | `npm run build` | `npm run build` | 阻塞合并 |
| Audit | `npm audit` | `npm audit` | High/Critical 阻塞合并 |

**注意**：具体命令可能因 repo 而异。本契约只定义验证项矩阵，实际命令由 `command-catalog.md` 持有。

---

## 5. 与相关契约的边界声明

| 契约 | 边界 | 说明 |
|------|------|------|
| `AGENTS.md` | AGENTS.md 持有编码标准（TypeScript 规则、错误处理模式、日志规范） | 本契约引用，不重述 |
| `lifecycle-contract.md` | lifecycle 持有 Phase 4 编码实现的检查单 | 本契约提供检查单中"代码规范"项的技术细节 |
| `review-gates-contract.md` | review-gates 的 Professional Gate 包含"代码质量"维度 | 本契约提供该维度的具体判定标准 |
| `repo-profile.md` | repo-profile 持有项目结构表和技术栈表 | 本契约引用其技术栈信息，不重复定义目录结构 |
| `command-catalog.md` | command-catalog 持有具体命令 | 本契约只定义"验证什么"，不定义"怎么跑" |

---

*本文档为工程规范契约。修改禁止事项清单或 source of truth 识别规则需经过评审闭环。*

> Last updated: 2026-04-27 | Version: v1.0
