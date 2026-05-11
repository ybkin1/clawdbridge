---
contract_id: "skill-tool-mapping"
title: "技能与工具路由契约"
owner: "claude-code"
scope: "意图识别→工具选择→安装态检查→调用决策→反模式禁止的全链路工具路由"
trigger: "action-governance 完成 action_family + artifact_kind 判定后，进入工具路由决策"
required_inputs: ["action_family", "artifact_kind", "execution_orchestration_route"]
required_contracts: ["task-routing"]
required_skills: []
verification_checks: ["tool-selection-intent-aligned", "no-bash-when-dedicated-tool", "no-gratuitous-agent-spawn", "required-tool-available-or-fallback"]
exceptions: ["tooling_exception", "missing-shared-interface"]
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 技能与工具路由契约（Skill & Tool Mapping Contract）

## 1. 目的

定义 Claude Code 环境下，根据当前任务意图自动选择最合适的工具、Skill、MCP 服务器的全链路路由机制。
解决"知道在做什么，但不知道该用什么工具做"的问题。

## 2. 适用范围

本契约在所有 Standard/Complex 任务的每个 work packet 中生效。
Trivial 任务可跳过正式工具路由，但仍需遵守反模式禁令（§9）。

## 3. 核心原则

1. **先判动作，再选工具** — 工具选择是 action_family + artifact_kind 的函数，不是凭直觉
2. **专用工具优先** — 有专用工具时不用通用工具（有 Grep 不用 `grep` Bash，有 Read 不用 `cat`）
3. **意图索引激活** — 不是所有工具在所有任务中加载，根据当前动作切片激活
4. **不可用走异常或 fallback** — 工具不可用时，要么找等价替代（fallback），要么记录异常（exception）

## 4. 规则与决策模型

### 4.1 工具路由决策树（5 步）

每个 work packet 在 action_family 判定后，按以下顺序选择工具：

```
Step 1: 当前 action_family 是什么？
  → clarify     → 转到 Step 2（交互类工具）
  → research    → 转到 Step 2（搜索/读取类工具）
  → authoring   → 转到 Step 2（写入/编排类工具）
  → implementation → 转到 Step 2（代码类工具）
  → verification   → 转到 Step 2（验证类工具）
  → review         → 转到 Step 2（评审类工具）
  → closeout       → 转到 Step 2（清理/归档类工具）

Step 2: 需要什么能力？（从能力目录选择）

Step 3: 哪个工具提供该能力？（从工具注册表选择）

Step 4: 工具是否可用？（安装态检查）
  → 可用 → 调用
  → 不可用 → 是否有等价替代？
    → 有 → fallback 替代
    → 无 → 记录 tooling_exception

Step 5: 调用后验证输出是否满足当前动作目标
  → 满足 → 继续
  → 不满足 → 尝试下一个候选工具
```

### 4.2 能力目录

| 能力 ID | 含义 | 典型场景 |
|---------|------|---------|
| `file_read` | 读取文件内容 | 查看代码、文档、配置 |
| `file_search` | 按模式搜索文件 | 找文件名、目录结构 |
| `content_search` | 按内容搜索文件 | 找函数、变量、关键词 |
| `file_write` | 写入/创建文件 | 产出文档、代码 |
| `file_edit` | 编辑现有文件 | 修改代码、文档 |
| `code_execution` | 执行系统命令 | 安装依赖、运行测试、git 操作 |
| `web_search` | 互联网搜索 | 调研、查找参考、验证事实 |
| `web_fetch` | 获取网页内容 | 读取文档、API 响应 |
| `code_review` | 代码审查 | 安全、性能、正确性评审 |
| `architecture_review` | 架构审查 | 模块拆分、技术选型 |
| `semantic_search` | 语义搜索代码 | 按意图搜索功能，不仅是关键词 |
| `impact_analysis` | 变更影响分析 | 改了某文件，哪些函数/流程受影响 |
| `multi_agent_orchestration` | 多 Agent 并行编排 | 复杂任务拆分、分发、综合 |
| `knowledge_graph` | 代码知识图谱操作 | 构建/查询/遍历代码结构图 |
| `interactive_query` | 向用户提问 | 意图确认、方案选择 |
| `notebook_edit` | 编辑 Jupyter notebook | 数据分析任务 |
| `value_gate` | 用户价值门控验证 | PRD 需求场景覆盖、关键动作验证 |
| `security` | 安全漏洞扫描 | 注入/XSS/权限/数据泄露 |
| `test_review` | 测试计划/用例评审 | 覆盖率、测试类型、可执行性 |

### 4.3 工具注册表

#### 4.3.1 内置工具（Direct Tools）

| 工具 | 能力 ID | action_family 触发 | 反模式 |
|------|---------|-------------------|--------|
| `Read` | `file_read` | all | 用 `cat`/`head`/`tail` Bash 替代 |
| `Grep` | `content_search` | research, review, implementation | 用 `grep`/`rg` Bash 替代 |
| `Glob` | `file_search` | research, implementation | 用 `find` Bash 替代 |
| `Edit` | `file_edit` | implementation, authoring | 用 `sed`/`awk` Bash 替代 |
| `Write` | `file_write` | authoring, implementation | 用 `echo >`/`cat <<EOF` Bash 替代 |
| `Bash` | `code_execution` | implementation, verification | 有专用工具时仍用 Bash |
| `WebSearch` | `web_search` | research | 不知道用哪个工具时凭直觉 |
| `WebFetch` | `web_fetch` | research | 用 `curl` Bash 替代 |
| `TodoWrite` | 内部管理 | all | 复杂任务不用 todo list |
| `AskUserQuestion` | `interactive_query` | clarify | 不确认就默认选 |

#### 4.3.2 Agent Tool（子 Agent）

| Agent 类型 | 能力 ID | action_family 触发 | 派发条件 |
|-----------|---------|-------------------|---------|
| `Explore` | `content_search` + `file_search` | research | 需要 3+ 次 Glob/Grep 探索 |
| `general-purpose` | 多能力组合 | all | 50+ tool calls 预期 |
| `researcher` | `web_search` + `web_fetch` + `file_read` | research | 需要 web 搜索 + 代码调研 |
| `architect-reviewer` | `architecture_review` + `impact_analysis` | review | 架构/模块/技术选型评审 |
| `code-reviewer` | `code_review` + `security` | review | 代码安全/正确性/性能评审 |
| `test-reviewer` | `verification` | verify | 测试计划/用例评审 |
| `prd-reviewer` | `review` + `value_gate` | review | PRD 完整性/一致性评审 |
| `Plan` | `architecture_review` + `multi_agent_orchestration` | research, design | 实现方案设计 |
| `claude-code-guide` | `file_read` + `web_search` | clarify, research | Claude Code 功能/API 问题 |
| `statusline-setup` | `file_edit` | implementation | 状态行配置调整 |

#### 4.3.3 MCP 服务器

| MCP Server | 能力 ID | action_family 触发 | 安装状态 |
|-----------|---------|-------------------|---------|
| `code-review-graph` | `knowledge_graph` + `impact_analysis` + `semantic_search` + `code_review` + `architecture_review` | review, research, implementation | installed (active) |

**code-review-graph MCP 工具映射**：

| MCP Tool | 能力 ID | 触发场景 |
|----------|---------|---------|
| `build_or_update_graph_tool` | `knowledge_graph` | 代码变更后更新知识图谱 |
| `get_minimal_context_tool` | `knowledge_graph` | 代码评审前获取上下文 |
| `get_review_context_tool` | `code_review` + `impact_analysis` | 代码评审时获取影响范围 |
| `detect_changes_tool` | `impact_analysis` | 变更影响分析 |
| `query_graph_tool` | `semantic_search` | 查询调用关系/继承/导入 |
| `semantic_search_nodes_tool` | `semantic_search` | 语义搜索代码实体 |
| `get_affected_flows_tool` | `impact_analysis` | 查找受影响的执行流程 |
| `get_architecture_overview_tool` | `architecture_review` | 生成架构概览 |
| `get_suggested_questions_tool` | `review` | 自动生成评审问题 |
| `get_bridge_nodes_tool` | `architecture_review` | 找架构瓶颈节点 |
| `get_hub_nodes_tool` | `architecture_review` | 找高连接度热点 |
| `get_surprising_connections_tool` | `code_review` | 发现意外耦合 |
| `list_communities_tool` | `architecture_review` | 列出代码社区 |
| `list_flows_tool` | `impact_analysis` | 列出执行流程 |
| `refactor_tool` | `file_edit` | 重构预览 |
| `find_large_functions_tool` | `code_review` | 找超大函数/类 |

#### 4.3.4 Skills（用户可调用技能）

| Skill | 能力 ID | action_family 触发 | 触发条件 |
|-------|---------|-------------------|---------|
| `architect-reviewer` | `architecture_review` | review | 需要架构评审时 |
| `code-reviewer` | `code_review` | review | 需要代码评审时 |
| `researcher` | `web_search` + `content_search` | research | 需要深度调研时 |
| `prd-reviewer` | `review` + `value_gate` | review | 需要 PRD 评审时 |
| `test-reviewer` | `test_review` | verify | 需要测试评审时 |
| `Plan` | `architecture_review` + `multi_agent_orchestration` | research, design | 需要设计方案时 |
| `claude-code-guide` | `interactive_query` | clarify | 询问 Claude Code 功能时 |
| `Explore` | `content_search` + `file_search` | research | 需要快速探索代码库时 |
| `statusline-setup` | `file_edit` | implementation | 配置状态行时 |

#### 4.3.4b 外部 Skills（需安装）

| Skill | 能力 ID | action_family 触发 | 触发条件 |
|-------|---------|-------------------|---------|
| `superpowers` | `enhanced_reasoning` | research, review | 需要深度调研/多视角评审/复杂推理 | `enhanced_reasoning` 不可用时 → 主线程手动多视角分析 |
| `frontend-design` | `ui_prototyping` | implementation + design-spec | 需要 UI 设计/原型/样式 | `ui_prototyping` 不可用时 → 主线程直接编写 HTML/CSS |
| `anything-notebooklm` | `presentation_generation` | authoring + prd | 需要 PPT/演示/知识摘要生成 | `presentation_generation` 不可用时 → 主线程生成 Markdown 大纲 |

**规则**：外部 Skill 不可用时，按 §4.6 等价替代目录 fallback 到内置能力，不阻断任务执行。安装态检查（§4.7）须包含外部 Skill 的可用性验证。

### 4.4 action_family → 工具选择矩阵

| action_family | 首选工具 | 辅助工具 | 评审工具 |
|--------------|---------|---------|---------|
| `clarify` | `AskUserQuestion` | `Read`（查现有文档） | N/A |
| `research` | `WebSearch`, `WebFetch`, `Read`, `Grep`, `Glob` | `Explore` Agent, `researcher` Agent, `code-review-graph` MCP | `superpowers`（深度调研） |
| `authoring` | `Write`, `Edit`, `Read` | `TodoWrite` | `anything-notebooklm`（PPT/演示） |
| `implementation` | `Edit`, `Write`, `Read`, `Bash` | `code-review-graph` MCP（查调用关系） | `frontend-design`（UI/前端） |
| `verification` | `Bash`（运行测试）, `Read` | `test-reviewer` Agent | `test-reviewer` Agent |
| `review` | `Read`, `Grep`, `Glob` | `code-review-graph` MCP, `Explore` Agent | `superpowers`（增强评审）, 2-4 个独立评审 Agent |
| `closeout` | `Read`, `Bash`（git 操作）, `Edit` | `TodoWrite`（清理跟踪） | N/A |

### 4.5 artifact_kind → 工具偏好

| artifact_kind | 高优工具 | 低优工具（通常不需要） |
|--------------|---------|----------------------|
| `intent` | `AskUserQuestion`, `Write` | `Bash`, `WebSearch` |
| `prd` | `WebSearch`, `Write`, `Read` | `Bash`, `code-review-graph` |
| `design-spec` | `Read`, `Grep`, `Write`, `code-review-graph` | `WebSearch`（除非调研新技术） |
| `contract` | `Read`, `Write`, `Edit` | `Bash`, `WebSearch` |
| `code` | `Read`, `Edit`, `Write`, `Bash` | `WebSearch`（除非查 API） |
| `test-plan` | `Read`, `Grep`, `Write` | `Bash`（运行阶段除外） |
| `review-report` | `Read`, `Grep`, `code-review-graph` | `Write`（只写报告不写代码） |

### 4.6 工具等价替代目录

| 首选工具 | 不可用时的 fallback | 备注 |
|---------|-------------------|------|
| `Grep` | `Bash: grep -r` | 功能等价，但失去权限优化 |
| `Read` | `Bash: cat` | 功能等价，但失去行号格式 |
| `Glob` | `Bash: find -name` | 功能等价，但更慢 |
| `Edit` | `Bash: sed -i` | 功能等价，但更高风险 |
| `WebSearch` | `WebFetch`（已知 URL 时） | 搜索→直连 |
| `Agent (Explore)` | 主线程直接 Grep/Glob | 失去并行性，但功能等价 |
| `Agent (researcher)` | 主线程 WebSearch + Read | 失去并行性，但功能等价 |
| `code-review-graph MCP` | 主线程 Grep/Glob 手动分析 | 失去知识图谱加速，但功能等价 |

### 4.7 安装态检查

任务初始化时（Step 0）：
1. 主线程列出当前可用的内置工具（始终可用）
2. 主线程列出当前加载的 Skills（系统提示中声明的可用技能）
3. 主线程列出当前在线的 MCP 服务器
4. 将可用工具清单写入 `route-projection.yaml` 的 `available_tools` 字段
5. 如果 required_skills 中有不可用项，走 §7 的异常或 fallback 流程

## 5. 输出与投影

本契约产出的正式文件：
- `route-projection.yaml` 的 `tool_routing` 字段 — 工具路由决策记录
- `route-projection.yaml` 的 `available_tools` 字段 — 安装态快照
- `tasks/<task-id>/exceptions/tooling_exception.yaml` — 工具不可用时的异常记录

## 6. 边界

### 6.1 与其他契约的边界

- 与 action-governance：本契约消费 action_family + artifact_kind，不定义它们（由 action-governance 定义）
- 与 task-routing：本契约在 7 步任务路由之后执行，不重复归属/模式判定
- 与 cluster-orchestration：本契约定义"用什么工具"，cluster-orchestration 定义"怎么编排多个 Agent"
- 与 exception-governance：工具不可用时走 tooling_exception 或 fallback

### 6.2 不覆盖的范围

本契约不定义：
- 工具的内部实现细节（由 Claude Code 运行时定义）
- 工具的权限策略（由用户设置决定）
- 第三方插件的开发规范（由插件作者定义）

## 7. 异常边界

以下场景允许偏离本契约：
- 工具不可用且有等价替代 → fallback（不需要异常记录）
- 用户明确指定使用某工具 → 按用户指令执行
- Trivial 任务 → 跳过正式工具路由

以下场景**永远不允许**偏离：
- 有专用工具时故意用 Bash（反模式，见 §9）
- 因工具不可用而跳过必需的 verification 或 review → 必须走异常
- 不检查工具是否可用就直接调用 → 必须走异常或 fallback

## 8. 验证要求

以下 verification checks 必须在每个 work packet 中通过：

| checker_id | 检查内容 | 失败后果 |
|-----------|---------|---------|
| `tool-selection-intent-aligned` | 选择的工具是否与 action_family 匹配 | professional gate failed |
| `no-bash-when-dedicated-tool` | 有专用工具时是否用了 Bash | professional gate failed |
| `no-gratuitous-agent-spawn` | 是否无必要地派发了 Agent | professional gate failed |
| `required-tool-available-or-fallback` | 需要的工具是否可用或有 fallback | contract gate failed |

## 9. 反模式禁止

以下行为默认视为工具路由失败：

1. **Bash 滥用**：用 `grep`/`cat`/`find`/`sed`/`awk` Bash 命令替代 Read/Grep/Glob/Edit
2. **无目的 Agent 派发**：为 ≤5 次工具调用即可完成的任务拉子 Agent
3. **跳过意图确认**：不确认用户意图就默认选择方案
4. **工具不可用不记录**：需要的工具不可用时，既不用 fallback 也不记录异常，静默跳过
5. **并行伪装**：声称并行但实际上串行派发 Agent（跨多条消息）
6. **工具选择无依据**：选择工具时不说明为什么选这个而不是另一个（当存在多个候选时）
7. **Skill 忽略**：有匹配的用户可调用 Skill 但从未尝试调用（用户参考 `/skill-name` 格式）

## 10. 迁移策略

从"凭直觉选工具"到意图驱动工具路由的过渡：

1. **第一阶段**：建立工具注册表和等价替代目录（本契约 §4.3 + §4.6）
2. **第二阶段**：action_family → 工具选择矩阵生效（本契约 §4.4）
3. **第三阶段**：安装态检查集成到任务初始化（本契约 §4.7）
4. **第四阶段**：反模式检测自动化（checker 自动检测 Bash 滥用、无目的 Agent 派发）

## 11. 非目标

本契约不追求：
- 工具数量无限增长 — 工具选择是收敛的，不是发散的
- 100% 自动化 — 部分场景仍需主线程判断（如"这个任务值得拉 Agent 吗"）
- 替代用户决策 — 用户可以随时覆盖工具选择
- 管理第三方插件生命周期 — 安装/卸载由用户控制
