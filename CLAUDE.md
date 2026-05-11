# CLAUDE.md — yb 项目开发规范入口

> 生效机制：Claude Code / Trae 启动自动读取 → 链式引用 `.claude/CLAUDE.md` → 按 action_family 加载契约。
> 版本: 3.0 | 来源: ybkin1/claude-code-rule | 部署日期: 2026-05-09
> MCP: agent-orchestrator (4工具, 2-6 Agent 并行) | 规则文件: 7个 .trae/rules/*.md

---

## 规范加载热路径

```
Claude Code 启动
  ↓
读取本文件 → 链式引用 .claude/CLAUDE.md（规范内核）
  ↓
每次任务：意图识别（intent-routing §3）→ 契约激活 → 意图确认 → 执行 → 评审 → 收口
```

**完整规范体系**见 `.claude/` 目录：
- `.claude/CLAUDE.md` — 规范内核入口（Karpathy 原则 + 7 元规则 + 契约导航）
- `.claude/contracts/` — 27 个契约定义（`registry.yaml` 为注册表）
- `.claude/checklists/` — 8 个 Stage 评审检查清单
- `.claude/checkers/` — 3 个 Shell 校验脚本
- `.claude/memory/` — 4 层记忆架构
- `.claude/project/checklists/` — 项目级检查清单

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

## Agent 集群

| Agent | 专长 | 触发场景 |
|-------|------|---------|
| researcher | 信息检索、来源验证 | 深度调研 |
| code-agent | 全栈开发、算法实现 | 功能开发 |
| code-reviewer | 质量审查、一致性检查 | 代码/文档审查 |
| designer-agent | UI/UX 设计 | 界面设计 |
| architect-reviewer | 架构评审 | 模块分解 |
| writer-agent | 技术/商务写作 | 报告文档 |

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
