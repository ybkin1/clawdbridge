# L4-L6 Agent 集群编排层落地实现方案

> 任务: tk-20260513-003 | 版本: v1.0 | 状态: design phase

---

## 1. 设计约束与前提

### 1.1 平台能力边界

Claude Code 的 Agent 工具原生提供 `Agent` spawn 能力，但**不支持**：
- 系统 prompt 注入（无法给子 Agent 预置角色定义）
- 工具白名单（无法禁止子 Agent 调用 Agent/AskUserQuestion 等）
- 上下文硬截断（子 Agent 仍继承完整对话历史）

因此 L4-L6 **不能**实现为完全独立的进程级沙箱，而是采用 **"MCP 辅助决策 + Prompt 模板约束 + Hook 兜底"** 的混合方案。

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| 主线程仍是 orchestrator | L4 的职责由主线程承担，MCP 只提供决策辅助和状态管理 |
| Manifest 冻结先于执行 | `agent_orchestrator` 验证 manifest 合规后才允许 spawn |
| 状态持久化到文件系统 | Agent 状态不存内存，而是写入 `agents/<agent_id>.yaml`，供主线程和 MCP 共同读取 |
| Fail-closed | 任何状态不一致时，默认阻断新的 Agent spawn |

---

## 2. 总体架构

```
主线程 (L4 Orchestrator-Prime)
  │
  ├─ 调用 MCP: agent_orchestrator(manifest)
  │     → 验证 manifest 合规性（atomicity-rules.yaml）
  │     → 预分配 agent_id[]
  │     → 写入 agents/orchestrator-plan.yaml
  │     → 返回 { allowed, agent_ids, execution_plan }
  │
  ├─ 根据 execution_plan spawn Sub-Orchestrator (L5)
  │     → 注入 Sub-Orchestrator prompt 模板
  │     → Sub-Orchestrator 产出 atomic-packet-manifest.yaml
  │     → 调用 MCP: agent_status(agent_id, status="completed")
  │
  ├─ 审阅 atomic-packet-manifest → 调用 MCP: agent_orchestrator(atomic_manifest)
  │     → 验证原子 packet 合规性
  │     → 预分配 Worker agent_id[]
  │
  ├─ spawn Worker Agents (L6)
  │     → 注入 Worker prompt 模板 + 截断上下文（只传必要文件）
  │     → Worker 执行 Write/Edit → 触发 L7 Hook → MCP validate_write_permission
  │     → 调用 MCP: agent_status(agent_id, status="completed|failed")
  │
  ├─ Fan-In: 收集所有 Worker 产出
  │     → 合并 → 冲突裁决 → 统一报告
  │
  └─ 调用 MCP: checkpoint_sync(taskDir)
        → 保存当前完整上下文状态
        → 生成 checkpoint-<timestamp>.yaml
```

---

## 3. MCP 工具设计

### 3.1 agent_orchestrator

**功能**：验证 work packet manifest 的合规性，生成执行计划，预分配 agent_id。

**输入**：
```json
{
  "taskDir": ".claude/tasks/tk-20260513-003",
  "manifest": {
    "manifest_id": "mf-design-auth",
    "orchestration_decision": "multi_packet_parallel",
    "packets": [
      {
        "packet_id": "pkt-auth-login",
        "objective": "Implement JWT login handler",
        "max_lines": 50,
        "dependencies": []
      }
    ]
  }
}
```

**逻辑**：
1. 加载 `atomicity-rules.yaml` 验证每个 packet
2. 检查 `orchestration_decision` 是否符合 `cluster-orchestration.md` 的允许值
3. 预分配 `agent_id`（格式：`ag-<role>-<packet_id>-<timestamp>`）
4. 写入 `agents/orchestrator-plan.yaml`
5. 返回执行计划

**输出**：
```json
{
  "allowed": true,
  "agent_ids": ["ag-sub-orchestrator-mf-design-auth-20260513T0050"],
  "execution_plan": {
    "phase": "spawn_sub_orchestrator",
    "packets": [...]
  },
  "validation_report": "All 3 packets passed atomicity check"
}
```

### 3.2 agent_status

**功能**：Agent 生命周期状态管理。

**输入**：
```json
{
  "taskDir": ".claude/tasks/tk-20260513-003",
  "agent_id": "ag-worker-pkt-auth-login-20260513T0055",
  "operation": "register",   // register | update | query | list
  "status": "running",       // pending | running | completed | failed | timeout
  "progress": "50%",
  "output_ref": "artifacts/pkt-auth-login.ts"
}
```

**状态文件格式**（`agents/ag-worker-pkt-auth-login-20260513T0055.yaml`）：
```yaml
agent_id: "ag-worker-pkt-auth-login-20260513T0055"
role: "worker"
parent_packet_id: "pkt-auth-login"
task_id: "tk-20260513-003"
status: "running"
started_at: "2026-05-13T00:55:00Z"
progress: "50%"
output_ref: "artifacts/pkt-auth-login.ts"
error_log: ""
```

### 3.3 checkpoint_sync

**功能**：保存/恢复任务上下文检查点。

**输入**：
```json
{
  "taskDir": ".claude/tasks/tk-20260513-003",
  "operation": "save",       // save | load | list
  "checkpoint_id": "cp-before-fan-in"
}
```

**保存内容**：
- `00-task-state.yaml` 完整副本
- `board.yaml` 副本
- 所有 `agents/*.yaml` 状态快照
- `checkers/*.yaml` 结果快照

**输出**：
```json
{
  "success": true,
  "checkpoint_id": "cp-before-fan-in-20260513T0100",
  "checkpoint_file": "checkpoints/cp-before-fan-in-20260513T0100.yaml",
  "saved_at": "2026-05-13T01:00:00Z"
}
```

---

## 4. Prompt 模板设计

### 4.1 Sub-Orchestrator Prompt 模板

```markdown
# 角色：Sub-Orchestrator

你是 Sub-Orchestrator，负责将**一个**粗粒度 work packet 细分为原子 packets。

## 你的职责（只做）
- 分析父 packet 的 objective 和 scope
- 拆分为 ≤50 行代码/≤15词描述/≤5参数的原子 packets
- 为每个原子 packet 指定 target_file、acceptance_criteria、input_params
- 输出 atomic-packet-manifest.yaml

## 你的禁止（不做）
- **不得**修改 task state（00-task-state.yaml）
- **不得**spawn 其他 Sub-Orchestrator
- **不得**直接编写具体函数实现代码
- **不得**调用 Write/Edit 修改任何源文件

## 输出格式
必须严格输出以下 YAML 结构，前后不加解释：

```yaml
parent_packet_id: "..."
atomic_packets:
  - id: "pkt-xxx"
    description: "..."
    input_params: [...]
    max_lines: 50
    target_file: "src/..."
    acceptance_criteria: [...]
```

## 上下文约束
- 你只能看到父 packet 的完整内容
- 你看不到项目全局状态、其他 packet 的细节
- 你的生命周期：创建 → 分解 → 提交 manifest → 立即结束
```

### 4.2 Worker Prompt 模板

```markdown
# 角色：Worker

你是 Worker，负责实现**一个**原子任务（1 函数 / 1 文件 / ≤50 行代码）。

## 你的职责（只做）
- 读取必要的上下文文件（≤3K tokens）
- 实现指定的原子任务
- 在代码文件头部添加 `@packet <packet_id>` 注释
- 通过 Hook 拦截的 Write/Edit 提交产出

## 你的禁止（不做）
- **不得**进行意图识别或需求分析
- **不得**spawn 其他 Agent
- **不得**修改 task state（00-task-state.yaml）
- **不得**访问与本任务无关的文件
- **不得**编写超过 50 行的代码块（除非声明 oversized_justified）

## 工具限制
- ✅ 允许：Read, Edit, Write, Bash（经 Hook 拦截）
- ❌ 禁止：Agent（spawn）, AskUserQuestion

## 上下文约束
- 你只能看到本 packet 的相关文件内容
- 若需要更多上下文，必须停止并请求 Orchestrator-Prime 提供
- 你的产出将被自动纳入证据锁和 checker 审计
```

---

## 5. 上下文隔离机制

由于 Claude Code 不支持硬截断子 Agent 的上下文，采用**软隔离**：

| 层级 | 隔离手段 | 效果 |
|------|---------|------|
| L5 Sub-Orchestrator | Prompt 中明确禁止访问全局状态；只传入父 packet 内容 | 依赖 Agent 自觉遵守 |
| L6 Worker | Prompt 中明确工具限制；主线程 spawn 时只传入必要文件路径 | 依赖 Agent 自觉遵守 |
| L7 Hook | **机械拦截**：Worker 的 Write/Edit 必须经 Hook → MCP validate_write_permission | 即使 Worker 想越权，也会被阻断 |
| L8 Checker | `atomicity-check` 验证产出是否符合 atomicity-rules | 事后审计 |

---

## 6. 实现文件清单

| # | 文件 | 说明 |
|---|------|------|
| 1 | `enforcer.js` | 新增 `agentOrchestrator`, `agentStatus`, `checkpointSync` 函数 |
| 2 | `tools.js` | 注册 3 个新工具的 JSON-RPC 路由 |
| 3 | `test.js` | 新增 15+ 断言覆盖新工具 |
| 4 | `.claude/templates/sub-orchestrator-prompt.md` | Sub-Orchestrator prompt 模板 |
| 5 | `.claude/templates/worker-prompt.md` | Worker prompt 模板 |
| 6 | `.claude/config/agent-orchestration-rules.yaml` | Agent 编排规则配置 |

---

## 7. 测试计划

| 测试场景 | 预期结果 |
|---------|---------|
| agent_orchestrator 验证合规 manifest | allowed=true, 返回 agent_ids |
| agent_orchestrator 验证违规 manifest（max_lines > 50） | allowed=false, 返回 violations[] |
| agent_status register → update → query | 状态文件正确读写 |
| checkpoint_sync save → load | 检查点完整保存和恢复 |
| Sub-Orchestrator prompt 注入后分解 packet | 产出符合 atomicity-rules.yaml |
| Worker 尝试越权写入 state 文件 | Hook 阻断，MCP 返回 allowed=false |

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Claude Code 不支持系统 prompt 注入 | 将 prompt 作为用户消息的第一条注入；依赖 Agent 自觉遵守 |
| 子 Agent 仍能 spawn 其他 Agent | 在 prompt 中明确禁止；Hook 不拦截 Agent spawn，但可通过 `agent_status` 审计发现 |
| 上下文无法真正截断到 ≤3K | 采用"只传必要文件路径"策略，让 Agent 自行 Read；主线程不预读文件内容 |
| 多 Agent 并发导致文件冲突 | `agent_orchestrator` 为每个 packet 分配独立的 `write_scope`；冲突时由主线程裁决 |
