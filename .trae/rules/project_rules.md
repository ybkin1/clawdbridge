# Trae 项目规则 — claude-code-rule 适配桥接

> v3.0 | 2026-05-09 | 五层全部对齐：意图路由 → 7阶段工作流 → 评审闭环(MCP自动) → 质量防线 → 知识沉淀

---

## Agent 行为准则（注入每轮对话，必须遵守）

1. **意图声明**：每次回复第一条显式声明 `[action_family=XXX, complexity=YYY, stage=ZZZ]`
2. **TodoWrite 跟踪**：≥3 步任务必须创建 TodoWrite 分解
3. **乐高拆解**：≥2 模块/组件 → L0→L3 拆解；≥3 独立维度 → **自动调用** MCP 并行 Agent
4. **评审闭环**：Complex / 安全代码 / ≥3文件 / 用户说"评审" → **自动调用** `parallel_review` MCP
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
  .claude/contracts/    (29 个契约)
  .claude/checklists/   (9 个检查清单)
```

---

## MCP 多 Agent 引擎（自动触发）

### 已部署的 MCP Server: `agent-orchestrator`

| MCP 工具 | 触发条件 | Agent 数 |
|---------|---------|---------|
| `parallel_review` | Complex / 安全代码 / ≥3文件 / 用户说"评审" | 2-6 |
| `orchestrate_review` | 深度评审 / 正式评审 / architecture|design|contract 类型 | 2-4 |
| `parallel_research` | 调研维度 ≥3 / 用户说"调研/对比/分析" | 2-5 |
| `agent_status` | 查看运行中 Agent | — |

**自动触发 = Agent 读到 spec-compliance.md 中的规则后自觉调用，不需要用户每次手动说"请用 MCP"。**

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

| 维度 | Claude Code | Trae IDE（当前） |
|------|------------|-----------------|
| 意图路由 | intent-routing.md §3 总表 | **Agent 自觉匹配 + 显式声明** |
| 复杂度判定 | 三级 + 负面清单 | **Agent 自觉判定** |
| 7 阶段工作流 | task-tracking 状态机 | **Agent 自觉推进 + TodoWrite 跟踪** |
| 乐高拆解 | L0→L4 递归 | **Agent 自觉 + ≥3 维度→MCP 自动** |
| 多 Agent 评审 | ≥2 Agent 并行 | ✅ **MCP parallel_review 自动触发** |
| 评审门控 | 三层 + 3 轮升级 | **Agent 自检 + MCP 可选的 2-Agent** |
| Hook 自动化 | 5 个 Python Hook | ❌ 无 Hook → 命令白名单替代 |
| Checker 脚本 | 3 个 Shell 脚本 | ❌ 无 → guard-rail 自检替代 |
| 记忆架构 | 4 层文件记忆 | `.trae/memory/` 文本记录 |

---

## 当前环境配置

| 配置项 | 值 |
|--------|-----|
| 工作目录 | `C:\Users\Administrator\Documents\trae_projects\yb\` |
| 规范内核 | `.claude/` (29 契约 + 9 清单 + 3 checker + 4 层记忆) |
| MCP Server | `agent-orchestrator` (4 个工具，桥接 Claude CLI v2.1.138) |
| Claude CLI | `C:\Users\Administrator\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe` |
| 规则文件 | 7 个 `.trae/rules/*.md`（每轮对话自动注入） |
| 命令白名单 | 24 条（Git/Node.js/PowerShell 常用命令） |
