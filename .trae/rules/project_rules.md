# Trae 项目规则 — claude-code-rule v2.0 适配桥接

> v3.1 | 2026-05-13 | 八层分离模型对齐：Spec → Config → MCP → Orchestrator → Sub-Orch → Worker → Hook → Checker

---

## Agent 行为准则（注入每轮对话，必须遵守）

1. **意图声明**：每次回复第一条显式声明 `[action_family=XXX, complexity=YYY, stage=ZZZ]`
2. **TodoWrite 跟踪**：≥3 步任务必须创建 TodoWrite 分解
3. **乐高拆解**：≥2 模块/组件 → L0→L3 拆解；≥3 独立维度 → **Task 子 Agent 串行等效评审**（Trae 无 MCP 并行能力）
4. **评审闭环**：Complex / 安全代码 / ≥3文件 / 用户说"评审" → **Task 加载 `.claude/agents/` 角色定义** 执行多维度评审
5. **交付自检**：报告完成前执行 guard-rail.md 10 项自检，逐条 ✅/❌ 输出
6. **脏数据清理**：任务结束执行 post-task-cleanup.md 4 步清理
7. **存储位置**：所有 Write 在项目工作目录下
8. **反幻觉**：不编造路径/API/引用，不确定说"需验证"
9. **文件路径优先**：传路径不传全量内容
10. **Markdown 优先**：UTF-8，中文文档用中文

---

## 规范加载机制

```
Layer 0: Trae 设置项
  AI.rules.importClaudeMd = true
  ↓
Layer 1: 项目根规则（每轮对话自动注入到上下文）
  CLAUDE.md → 链式引用 .claude/CLAUDE.md
  .trae/rules/spec-compliance.md   ← 五层对齐检查表（最高优先级）
  .trae/rules/project_rules.md     ← 本文件
  .trae/rules/lego-mcp-bridge.md   ← 乐高 × MCP 桥接
  .trae/rules/guard-rail.md        ← 交付前自检
  .trae/rules/execution-quality.md ← 执行质量标准
  .trae/rules/post-task-cleanup.md ← 脏数据清理
  ↓
Layer 2: 契约体系（按 action_family 按需读取）
  .claude/contracts/    (34 个契约)
  .claude/config/       (L2 配置层: 6 YAML + 4 Schema)
  .claude/agents/       (9 个 Agent 角色定义: .claude/agents/*.md)
  .claude/checklists/   (20 个检查清单)
  .claude/checkers/     (19 个校验脚本)
```

---

## MCP 多 Agent 引擎（已部署，Trae 手动等价执行）

### 已部署的 MCP Server

| MCP Server | 状态 | Trae 等价执行 |
|-----------|------|-------------|
| `constraint-enforcer` (10工具) | ✅ 文件就绪，node_modules 已安装 | **手动读取 L2 YAML 配置等效自检** |
| `agent-orchestrator` (4工具) | ✅ 文件就绪 | **Task 串行等效，详见 `lego-mcp-bridge.md`** |

| MCP 工具 | 触发条件 | Trae 等价执行 |
|---------|---------|-------------|
| `parallel_review` | Complex / 安全代码 / ≥3文件 | Task 串行多维度评审 |
| `orchestrate_review` | 深度评审 / architecture\|design\|contract | Task: auditor 串行 |
| `parallel_research` | 调研维度 ≥3 | WebSearch + Task: researcher |
| `agent_status` | 查看运行中 Agent | TodoWrite 状态跟踪 |

**⚠ 平台限制**: Trae Agent 无 MCP 客户端能力，以上 MCP Server 无法直接调用。Agent 通过手动等效方式（直接读写 L2 YAML 配置、Task 串行子 Agent、guard-rail 自检）实现等价约束。

**约束执行 = Agent 读到 spec-compliance.md 中的规则后自觉执行手动等效检查，不需要用户每次提醒。**

---

## 意图路由 Agent 须自觉执行

每次收到用户请求后，Agent 必须在第一条回复中自行判定：

```
[action_family=XXX, artifact_kind=YYY, complexity=ZZZ, stage=WWW]

判定依据:
- action_family: 用户关键词匹配 intent-routing.md §3
- artifact_kind: code/design-spec/prd/contract/review-report/...
- complexity: Trivial(<30min,单文件) / Standard / Complex(架构/安全/跨模块)
- stage: clarify→research→architecture-decomposition→spec→design→plan→build→verify→acceptance
```

**不能判为 Trivial 的场景**: 含"设计"/"架构"/"评审"/"系统性"/"深入"关键词、涉及安全代码、跨模块改动。

---

## Trae vs Claude Code 能力映射

| 维度 | Claude Code | Trae IDE（当前—v2.0适配） |
|------|------------|---------------------------|
| 意图路由 | intent-routing.md §3 总表 | **Agent 自觉匹配 + 显式声明** |
| 复杂度判定 | 三级 + 负面清单 | **Agent 自觉判定** |
| 7 阶段工作流 | task-tracking 状态机 | **Agent 自觉推进 + TodoWrite 跟踪** |
| 乐高拆解 | L0→L4 递归 | **Agent 自觉 + ≥3 维度→MCP 自动** |
| 多 Agent 评审 | ≥2 Agent 并行 | 🔄 **Task 串行模拟 + 手动 Fan-In** |
| 评审门控 | 三层 + 3 轮升级 | **Agent 自检 + guard-rail 清单** |
| 机械条件验证 | MCP constraint-enforcer 自动 | 🔄 **手动读取 L2 YAML 配置自检** |
| 写入权限控制 | MCP + PreToolUse Hook 拦截 | 🔄 **Write 前手动检查权限矩阵** |
| Agent 角色定义 | .claude/agents/ 9 个 | ✅ **已合入，Task 工具可加载** |
| Hook 自动化 | 5 Hook 类型 | ❌ 无 Hook → guard-rail 自检替代 |
| Checker 脚本 | MCP 自动触发 19 个 | ❌ 手动执行等效检查 |
| 记忆架构 | 4 层文件记忆 | `.claude/memory/` 文本记录 |

---

## 当前环境配置

| 配置项 | 值 |
|--------|-----|
| 工作目录 | `C:\Users\Administrator\Documents\trae_projects\yb\` |
| 规范版本 | claude-code-rule v2.0（八层分离模型） |
| 规范内核 | `.claude/` (34 契约 + 20 清单 + 19 checker + 4 层记忆) |
| Agent 角色 | `.claude/agents/` (9 个) |
| MCP Server | `constraint-enforcer` (10 工具，配置驱动) + `agent-orchestrator` (4 工具) |
| Claude CLI | `C:\Users\Administrator\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe` |
| 规则文件 | 7 个 `.trae/rules/*.md`（每轮对话自动注入） |
| 命令白名单 | 24 条（Git/Node.js/PowerShell 常用命令） |
