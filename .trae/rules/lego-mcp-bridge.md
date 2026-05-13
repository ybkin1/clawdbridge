# LEGO × Trae Bridge — 乐高拆装多 Agent 等价执行手册

> 桥接文件：将 lego-assembly-workflow 的 5 级拆解模型映射到 Trae 可执行的评审方式。
> 生效条件：Standard/Complex 任务进入对应阶段时，Agent 手动等价执行（Trae 无 MCP 客户端能力）。
> 理想态：MCP 可用时切换到 `parallel_review` / `orchestrate_review` / `parallel_research` 自动并行。

---

## 何时启用多 Agent（Agent 必须遵守）

以下场景 **必须** 启用 Task 子 Agent 串行等效评审，不允许仅依赖自身单一视角。

| 乐高阶段 | 触发条件 | Trae 执行方式 | 参考 Agent | 调用时机 |
|---------|---------|-------------|-----------|---------|
| **Stage 1: 深度学习** | 需要 ≥3 个调研维度 | Task 串行多角度调研 + 手动综合 | researcher | 调研开始时 |
| **Stage 2: 架构拆解** | 架构涉及 ≥3 个模块 | Task: architect-reviewer 评审 | architect-reviewer | 架构拆解完成时 |
| **Stage 3: PRD** | 需完整性 + 正确性双重评审 | Task: prd-reviewer 串行 | prd-reviewer | PRD 初稿完成时 |
| **Stage 4: 方案详设** | 设计涉及安全/性能多维度 | Task: architect-reviewer + code-reviewer 串行 | `.claude/agents/` | 设计文档完成时 |
| **Stage 5: 开发计划** | 拆分出 ≥5 个独立 work packet | 先人工拆分，再 Task 验证 | code-reviewer | 计划完成时 |
| **Stage 6: 编码** | 修改 ≥3 个文件且无强依赖 | Task: code-reviewer 安全+正确性 | code-reviewer | 编码完成后 |
| **Stage 7: 测试** | 需 security + correctness 双验证 | Task: test-reviewer + code-reviewer 串行 | test-reviewer | 代码完成时 |

---

## 乐高 L0-L4 与 Trae 等价执行

```
乐高层级               →   理想（MCP）            →   Trae 等价执行
────────────────────────────────────────────────────────────────
L0 成品级（产品评审）    →   orchestrate_review      →   Task: auditor + architect-reviewer 串行
L1 模块级（模块设计评审）  →   parallel_review          →   Task: architect-reviewer 评审
L2 组件级（接口评审）    →   parallel_review          →   手动对照 checklist 自检
L3 单元级（单元评审）    →   单 Agent 快速检查        →   guard-rail 自检
L4 代码块级（代码评审）   →   parallel_review          →   Task: code-reviewer 安全/正确/性能
```

---

## Agent 判定流程（Trae 版）

```
当 Trae Agent 执行 Standard/Complex 任务时：

Step 1: 检查当前任务阶段
  ├─ Stage 1 (调研) 且维度 ≥3 → Task: researcher 串行多角度
  ├─ Stage 2-5 (设计/计划)     → Task: architect-reviewer / prd-reviewer
  ├─ Stage 6 (编码)            → Task: code-reviewer
  ├─ Stage 7 (测试)            → Task: test-reviewer
  └─ 其他                      → 单 Agent 执行 + guard-rail 自检

Step 2: 加载 Agent prompt
  → 从 .claude/agents/<agent-name>.md 读取角色定义
  → 注入到 Task 工具的 prompt 参数

Step 3: 执行评审
  → Task 串行启动子 Agent（Trae 限制：无法 Fan-Out 并行）
  → 逐个等待返回
  → 手动 Fan-In：比较输出 → 冲突裁决 → 综合报告

Step 4: 判定结论
  → Pass → 下一阶段
  → Conditional Pass → 修复 Major 问题
  → Fail → 3 轮修复循环
```

---

## 执行示例（Trae 版）

```
"帮我评审 C:\path\to\design.md 的架构方案"
  → Agent 自动检测: Stage 4 → 涉及架构
  → Task: 加载 .claude/agents/architect-reviewer.md prompt
  → 执行 architecture 评审
  → 输出 findings 到用户

"调研一下微服务 vs 单体架构的优劣"
  → Agent 自动检测: Stage 1 → 多条调研线
  → WebSearch 并行搜索 → 手动综合
  → Task: 加载 .claude/agents/researcher.md prompt
  → 生成对比研究报告
```

---

## 能力矩阵（Trae 当前状态）

| 能力 | Trae 状态 | 说明 |
|------|:--:|------|
| Task 串行评审 | ✅ | `.claude/agents/` 9 个角色 prompt 可加载 |
| guard-rail 自检 | ✅ | 手动对照 checklist 逐项检查 |
| 多 Agent 真正并行 | ❌ | Task 工具不支持同一消息 Fan-Out |
| parallel_review MCP | ❌ | Trae Agent 无 MCP 客户端能力 |
| parallel_research MCP | ❌ | 同上 |
| orchestrator_review MCP | ❌ | 同上 |
| parallel_implement | ❌ | 规范定义的未来能力 |
| 多 Agent 递归拆解 | ❌ | 规范要求 Fan-Out 由主线程统一调度 |
