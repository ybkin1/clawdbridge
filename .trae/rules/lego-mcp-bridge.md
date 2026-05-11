# LEGO × MCP Bridge — 乐高拆装自动多 Agent 引擎

> 桥接文件：将 lego-assembly-workflow 的 5 级拆解模型映射到 Agent Orchestrator MCP。
> 生效条件：Standard/Complex 任务进入对应阶段时，Agent 自动判定并调用 MCP 工具。

---

## 何时自动启用多 Agent（Agent 必须遵守）

以下场景 **必须** 调用 Agent Orchestrator MCP（`parallel_review` / `orchestrate_review` / `parallel_research`），不允许单 Agent 串行执行。

| 乐高阶段 | 触发条件 | 调用哪个 MCP 工具 | Agent 数 | 调用时机 |
|---------|---------|------------------|---------|---------|
| **Stage 1: 深度学习** | 需要 ≥3 个调研维度 | `parallel_research` | 3-5 | 调研开始时 |
| **Stage 2: 架构拆解** | 架构涉及 ≥3 个模块 | `orchestrate_review` (type=architecture) | 3-4 | 架构拆解完成时 |
| **Stage 3: PRD** | 需要完整性 + 正确性双重评审 | `parallel_review` (dimensions: completeness, correctness) | 2 | PRD 初稿完成时 |
| **Stage 4: 方案详设** | 设计涉及安全/性能多维度 | `parallel_review` (dimensions: security, architecture, performance) | 3 | 设计文档完成时 |
| **Stage 5: 开发计划** | 拆分出 ≥5 个独立 work packet | 先人工拆分，再 `parallel_review` 验证 | 2 | 计划完成时 |
| **Stage 6: 编码** | 修改 ≥3 个文件且无强依赖 | 🔜 `parallel_implement` (待开发) | N | — |
| **Stage 7: 测试** | 需要 security + correctness 双验证 | `parallel_review` | 2 | 代码完成时 |

---

## 乐高 L0-L4 与 MCP 工具映射

```
乐高层级               →   MCP 工具               →   实际执行
────────────────────────────────────────────────────────────────
L0 成品级（产品评审）    →   orchestrate_review      →   3-4 Agent 并行架构/完整/性能评审
L1 模块级（模块设计评审）  →   parallel_review          →   2 Agent security + architecture
L2 组件级（接口评审）    →   parallel_review          →   2 Agent correctness + completeness
L3 单元级（单元评审）    →   🔜 单 Agent 快速检查     →   串行（粒度太小，不需要并行）
L4 代码块级（代码评审）   →   parallel_review          →   2-4 Agent 并行安全/正确/性能/风格
```

---

## Agent 自动判定流程

```
当 Trae Agent 执行 Standard/Complex 任务时：

Step 1: 检查当前任务阶段
  ├─ Stage 1 (调研) 且调研维度 ≥3  → 调用 parallel_research，并行启动
  ├─ Stage 2-5 (设计/计划完成)     → 调用 parallel_review/orchestrate_review
  └─ 其他                          → 单 Agent 执行

Step 2: 确认 MCP Server 是否可用
  → 调用 agent_status MCP 工具检测
  → 可用 → 继续
  → 不可用 → 降级为 guard-rail 自检

Step 3: 构建评审 prompt
  → 从 .claude/contracts/ 加载对应 checklist
  → 注入检查维度 prompt（已在 orchestrator.js 中预定义）

Step 4: 调用 MCP 工具
  → 等待全部 Agent 返回
  → 读取 synthesis-report.md
  → 向用户汇报结论

Step 5: 根据结论推进
  → Pass → 下一阶段
  → Conditional Pass → 修复 Major 问题
  → Fail → 3 轮修复循环
```

---

## 你现在可以说的自然语言（自动触发示例）

以下命令会 **自动** 触发 MCP 多 Agent 引擎：

```
"帮我评审 C:\path\to\design.md 的架构方案"
  → Agent 自动检测: Stage 4 → 涉及架构 → 调用 parallel_review(architecture+completeness)
  → 后台启动 2 个 Claude CLI Agent 并行评审
  → 生成综合报告
  → 向用户汇报

"调研一下微服务 vs 单体架构的优劣"
  → Agent 自动检测: Stage 1 → 涉及多条调研线 → 调用 parallel_research(competitive+technical+risks)
  → 后台启动 3 个 Agent 并行调研
  → 生成研究报告

"做乐高拆解，设计一个新功能模块"
  → Agent 自动检测: Complex + cross-module → 调用 orchestrate_review(type=design)
  → 生成 manifest.yaml → fan-out 3 Agent → fan-in → synthesis-report + receipt
```

---

## 当前限制（需要后续扩展）

| 能力 | 状态 | 说明 |
|------|:--:|------|
| 多 Agent 并行评审 | ✅ | `parallel_review` / `orchestrate_review` |
| 多 Agent 并行调研 | ✅ | `parallel_research` |
| 多 Agent 并行编码 | 🔜 | 需要 `parallel_implement` MCP 工具——每个 Agent 写不同文件 |
| 多 Agent 递归拆解（子 Agent 再派发）| ❌ | 规范要求 Fan-Out 由主线程统一调度，不支持嵌套 |
| agent_status 监控 | ✅ | 实时查看运行中的 Agent |
