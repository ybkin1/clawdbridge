# Dev Plan 合规审计 — work-packet-governance + lego-assembly-workflow

> 审计日期: 2026-05-09 | 被审计文件: `clawdbridge-dev-plan-tk-20260509-001-v1.md`
> 对照规范: [work-packet-governance.md](file:///C:/Users/Administrator/Documents/trae_projects/yb/.claude/contracts/work-packet-governance.md) | [lego-assembly-workflow.md](file:///C:/Users/Administrator/Documents/trae_projects/yb/.claude/contracts/lego-assembly-workflow.md)

---

## 核心问题

当前 dev plan 将 **模块级单元（P1-P14）作为 work packet**。规范要求 work packet 必须按**实现层**拆包，而非按模块。

```
当前:  P1 = "WSHub + 握手" (4h, 一个大包)
规范:  WSHub 应拆为 → socket监听包 + 鉴权中间件包 + 消息路由包
```

---

## 一、work-packet-governance 逐层对照

### 1.1 拆包粒度 — ❌ FAILED

**规范 §2**：Standard 任务 6-8 层拆包。当前 packet 定义的是"模块"，不是"层"。

以 P9 "ChatScreen + ChatStore (8h)" 为例，按规范应至少拆为：

| 层 | 规范要求 | 本计划 | 状态 |
|----|---------|--------|------|
| 1. 需求边界 | feature scope | ❌ 未拆 | **缺失** |
| 2. 数据结构 | Message/ChatState TypeScript 类型 | ❌ 含在 P9 内 | **未独立** |
| 5. 请求契约 | WebSocket message 发送接口 | ❌ 含在 P7 | **未独立** |
| 6. 响应契约 | assistant_stream 消费接口 | ❌ 含在 P7 | **未独立** |
| 9. 控制器入口 | ChatScreen 组件 | ❌ 含在 P9 | **未独立** |
| 11. 验证回归 | jest 测试 | ✅ P9 包含验证命令 | 部分 |
| 3/4/7/8/10/12 | PO/DAO/Service/Logic/Wiring/Operability | — | N/A（纯前端） |

**对比表：当前粒度 vs 规范要求**

| 当前 Packet | 当前粒度 | 规范应拆至 | 差异 |
|------------|---------|-----------|------|
| P1 "WSHub + 握手" | L3 单元 | socket-server → auth-middleware → msg-router → heartbeat | 1 包应拆 4 |
| P2 "CLIDriver" | L3 单元 | spawn → stdin-writer → stdout-parser → stderr-logger → exit-handler | 1 包应拆 5 |
| P9 "ChatScreen + ChatStore" | L2 组件 | MessageType → ChatState → UserBubble → AIBubble → CodeBlock → ToolCard → ErrorCard → ChatScreen → InputBar | 1 包应拆 9 |
| P10 "ApprovalCard + 交互" | L2 组件 | ApprovalRequest type → ApprovalCard UI → AllowButton → RejectButton → useApprovalHandler | 1 包应拆 5 |

### 1.2 禁止的粗粒度包名 — ⚠️ WARNING

规范 §3 明确禁止 "联调"、"整体测试" 等粗粒度名。本计划未违反（所有 P1-P14 有具体名称），但 **"性能调优"、"内测修复"、"错误处理+边界 case"** 在 Sprint 3 中属于无结构化边界的任务，未拆为可验证的独立 packet。

### 1.3 Work Packet 最小字段 — ❌ FAILED

规范 §6 要求每个 packet 必须含 9 个字段。当前缺失：

| 字段 | 当前状态 | agent-assignment-matrix.yaml |
|------|---------|------------------------------|
| `packet_kind` | ❌ 全部缺失 | ❌ |
| `architecture_node_ref` | ❌ 全部缺失 | ❌ |
| `packet_id` / `objective` / 其余 | ✅ | ✅ |

### 1.4 构建前制品 — ⚠️ WARNING

规范 §9 强制 6 项 mandatory 制品：

| # | 制品 | 是否存在 | 位置 |
|---|------|---------|------|
| 1 | 需求边界文档 | ✅ | PRD v2 |
| 2 | 数据结构定义 | ✅ | Design §6.1 SQLite DDL + §4 Zustand Store |
| 3 | 接口契约 | ✅ | Design §5.1-5.5 API 规格 + WebSocket 消息协议 |
| 4 | 服务接口定义 | ✅ | Design §7.1-7.3 Bridge 模块函数签名 |
| 5 | 架构蓝图引用 | ✅ | Design §1 架构对齐 |
| 6 | Work Packet Manifest | ⚠️ agent-assignment-matrix 存在但缺 packet_kind/arch_ref | matrix.yaml |
| 7 | 评审量表 | ✅ | stage4-5-plan-review.md |
| 8 | 业务逻辑清单 | ❌ 每个 packet 的业务规则列表未显式列出 | **缺失** |
| 9-12 | recommended 制品 | ⚠️ 未记录原因 | — |

---

## 二、lego-assembly-workflow 对照

### 2.1 L4 最小单元判定 — ⚠️ 部分符合

规范 §4.1：拆解深度以"可独立制造"为停止条件。当前：

| 项 | 状态 |
|----|------|
| design §13.3 L4 派发判定 ✓（19 个 L4 代码块） | ✅ |
| dev plan §3.2 引用了 L4 判定表 | ✅ |
| **但 Sprint 计划 (dev plan §2) 仍以 L2/L3 为单位排期** | ⚠️ |
| L4 派发没有映射到具体的 Sprint Day | ❌ |

**矛盾点**：design 已经拆到了 19 个 L4 代码块，但 dev plan 的 Sprint 计划表仍然以 P1-P14 (L2/L3) 为行粒度。这意味着真正执行时，Agent 拿到的 packet 是 "P9 = 8h 做一个 ChatScreen"，而不是 "制造 message-bubble.tsx (80行, L4)"，这与规范 §4.5 "子 Agent 可直接制造" 的要求脱节。

### 2.2 Agent 分配矩阵 — ✅

14 个 packet，每个含 10 字段 (lego_level/objective/timeout/read_scope/write_scope/acceptance/verification/rollback)，符合 §4.6.2。

### 2.3 拼装链验证 — ✅

dev plan §6.2 定义了 L4→L0 每级验证，符合 §4.7。

### 2.4 异常恢复 — ✅

dev plan §7 覆盖 6 场景，符合 §4.6.4。

---

## 三、综合判定

| 检查面 | 规范 | 结果 |
|--------|------|------|
| 12 层拆包 (Standard→6-8层) | work-packet §2 | ❌ 模块级包，非实现层包 |
| 拆包粒度（L4 最小单元） | lego §4.1 | ⚠️ design 有 L4 判定，计划表未落地 |
| 禁止粗粒度包名 | work-packet §3 | ⚠️ Sprint 3 有未结构化项 |
| Packet 最小字段 | work-packet §6 | ❌ 缺 packet_kind + architecture_node_ref |
| 构建前制品 | work-packet §9 | ⚠️ 缺业务逻辑清单 |
| Agent 矩阵 | lego §4.6.2 | ✅ |
| 拼装验证 | lego §4.7 | ✅ |
| 异常恢复 | lego §4.6.4 | ✅ |

## 四、结论

```
核心问题: dev plan 的 work packet 粒度是"模块级"(P1-P14)，而非 work-packet-governance 要求的"实现层级"。
         虽然 design §13.3 已做 L4 派发判定（19 个代码块），但 Sprint 计划未将 L4 作为排期粒度。
```

| 项 | 结果 |
|-----|------|
| **乐高最小开发单元** | ⚠️ 设计层达标 (L4)，执行计划层未落地 |
| **work-packet-governance** | ❌ 未通过 — 3 项严重违规 |
| **是否可进入 build** | ⚠️ 修复后可推进 |

---

## 五、修复方案

### 必须修复（不可跳过）

| # | 动作 | 规范 |
|---|------|------|
| 1 | **将 P1-P14 拆为按实现层的 work packet**。例如 P9 拆为 `message-types` / `chat-state` / `user-bubble` / `ai-bubble` / `code-block` / `tool-card` / `error-card` / `chat-screen` / `input-bar` / `chat-verification`，每个标注 `packet_kind` | work-packet §2 + §6 |
| 2 | **每个 packet 新增 `packet_kind` + `architecture_node_ref` 字段** | work-packet §6 |
| 3 | **Sprint 计划表改为按 L4 行粒度排期**，每个 day 列出具体代码块文件名 | lego §4.1 |
| 4 | **输出业务逻辑清单**（每个模块的规则/输入/输出/异常路径） | work-packet §9 |

### 建议修复

| # | 动作 |
|---|------|
| 5 | Sprint 3 中 "性能调优/内测修复/错误处理" 拆为可验收的小 packet |
