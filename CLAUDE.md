# CLAUDE.md — yb 项目开发规范入口

> 生效机制：Trae 启动自动注入 → 链式引用 `.claude/CLAUDE.md` → 按 action_family 加载契约。
> 版本: 3.1 | 来源: ybkin1/claude-code-rule v2.0（八层分离模型） | 更新: 2026-05-13
> 约束引擎: constraint-enforcer (10工具，已部署，Trae Agent 手动模拟) | 规则文件: 7个 .trae/rules/*.md | Agent定义: 9个 .claude/agents/*.md

---

## 规范加载热路径

```
Claude Code 启动
  ↓
读取本文件 → 链式引用 .claude/CLAUDE.md（规范内核）
  ↓
每次任务：意图识别（intent-routing §3）→ 契约激活 → 意图确认 → 执行 → 评审 → 收口
```

**完整规范体系**（八层分离模型 v2.0）见 `.claude/` 目录：
- `.claude/CLAUDE.md` — 规范内核入口（Karpathy 原则 + 8 元规则 + 契约导航）
- `.claude/contracts/` — 34 个契约定义（`registry.yaml` 为注册表）
- `.claude/config/` — L2 配置层（6 个 YAML + 4 个 JSON Schema）
- `.claude/agents/` — 9 个 Agent 角色定义（`.claude/agents/*.md`）
- `.claude/checklists/` — 20 个 Stage 评审检查清单
- `.claude/checkers/` — 19 个校验脚本（`.js` + `.sh` + `.ps1`）
- `.claude/hooks/` — 10 个 Hook 拦截脚本（`.ps1` + `.sh` + `.py`）
- `.claude/mcp-servers/` — L3 MCP 约束执行器（constraint-enforcer）
- `.claude/memory/` — 4 层记忆架构
- `.claude/settings.json` — Claude Code 运行时配置（Hook + MCP 注册）

### MCP 多 Agent 引擎

本项目的 Agent Orchestrator MCP Server 提供 4 个工具，桥接 Claude CLI v2.1.138 实现多 Agent 并行：

| MCP 工具 | 触发条件 | Agent 数 |
|---------|---------|---------|
| `parallel_review` | Complex / 安全代码 / ≥3文件 / 用户说"评审" | 2-6 |
| `orchestrate_review` | 深度评审 / architecture\|design\|contract 类型 | 2-4 |
| `parallel_research` | 调研维度 ≥3 | 2-5 |
| `agent_status` | 查看运行中 Agent | — |

详细自动触发规则见 `.trae/rules/spec-compliance.md` Layer 3。
完整乐高 × MCP 映射见 `.trae/rules/lego-mcp-bridge.md`。

---

## 任务初始化（强制）

**Standard/Complex 任务执行前必须:**

1. 读取 `.claude/tasks/INDEX.md` 检查是否已有对应任务
2. 如无，创建 `.claude/tasks/tk-YYYYMMDD-NNN-<slug>/` 目录，含:
   - `00-task-state.yaml`（从 `.claude/templates/00-task-state.yaml` 复制）
   - `00-user-intent.md`
   - `README.md`
   - `board.yaml`
   - `artifacts/` 目录
3. 更新 `INDEX.md`
4. Trivial 任务（<30 分钟，单文件）可跳过

---

## 当前项目结构

| 组件 | 路径 | 说明 |
|------|------|------|
| clawd-on-desk | `clawd-on-desk-main/` | Claude Code 桌面监控面板 |
| claude-code-rule | `C:\Users\Administrator\Documents\claude-code-rule\` | 规范架构参考仓库（SSH 克隆） |

---

## 复杂度分级

| 等级 | 判定 | 执行强度 |
|------|------|---------|
| **Trivial** | <30 分钟；单文件；纯概念解释 | 自检即可 |
| **Standard** | 功能实现；模块设计；文档编写 | 前置深度学习 + 2-Agent 评审 |
| **Complex** | 架构重构；跨模块；安全关键 | 前置深度学习 + 3-4-Agent 评审 |

---

## 7 条强制元规则（摘要，详见 `.claude/CLAUDE.md`）

1. **前置深度学习** — Standard/Complex 任务先搜索 ≥3 参考 + ≥2 方案
2. **深度迭代评审** — 加载 checklist → ≥2 Agent 并行 → 三级裁决，Fail 最多 3 轮
3. **意图确认** — 非 Trivial 任务必须先向用户确认意图
4. **脏数据清理** — 每次任务结束审计/清理/归档
5. **项目目录存储** — 所有任务数据写项目工作目录，禁止桌面/下载/临时目录/系统目录
6. **完整性审计** — 源材料 → 三道防线对标
7. **乐高拆装** — 先设计后制造，多级拆解到可独立单元

---

## Agent 集群（9 个角色定义，见 `.claude/agents/`）

| Agent | 专长 | 触发场景 |
|-------|------|---------|
| researcher | 信息检索、来源验证、多维度调研 | 深度调研、竞品分析 |
| code-agent | 全栈开发、算法实现 | 功能开发、代码重构 |
| code-reviewer | 安全/正确性/性能评审 | 代码审查 |
| designer-agent | UI/UX 设计 | 界面设计、原型制作 |
| architect-reviewer | 架构评审、模块分解 | 架构设计评审 |
| writer-agent | 技术/商务写作 | 报告、文档 |
| auditor | 机械合规审计、阶段门控验证 | 阶段推进前审计 |
| prd-reviewer | PRD 完整性/一致性评审 | 产品需求评审 |
| test-reviewer | 测试计划/覆盖率评审 | 测试策略评审 |

---

## Skill 集群

| Skill | 触发 | 功能 |
|-------|------|------|
| /deep-research | 自动/手动 | 多维度深度研究 |
| /report-writing | 手动 | 结构化报告撰写 |
| /webapp | 手动 | Web 应用开发 |
| /vibecoding | 手动 | 快速原型开发 |
| /batch-download | 手动 | 批量资源下载 |

---

## Git 约定

- **Commit**: `type(scope): subject`，type∈{feat,fix,docs,refactor,test,chore}
- **分支**: `feature/<模块>-<功能>` 或 `hotfix/<问题id>`
- **禁止**: 在 CLAUDE.md 中存储 SSH 密钥、Token、密码等敏感信息

---

## 注意事项

- `.claude/settings.json` 保留 clawd-on-desk 的 Hook 配置，不可覆盖
- 规范反馈写入 `.claude/contracts/feedback.yaml`
- 本文件为项目级入口，跨项目共享的规范内核在 `.claude/CLAUDE.md` 中维护
