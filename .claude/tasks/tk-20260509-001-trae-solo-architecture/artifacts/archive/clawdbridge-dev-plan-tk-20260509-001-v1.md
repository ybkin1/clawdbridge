# Plan：ClawdBridge Mobile — 开发计划

> 版本: v1.0 | 2026-05-09 | 阶段: Stage 5 (Plan)
> document_class: execution_plan | depth_profile: detailed | maturity_target: draft | confidentiality: project_confidential
> 基于: [design](clawdbridge-design-tk-20260509-001-v1.md) | [agent-assignment-matrix](clawdbridge-agent-assignment-matrix-tk-20260509-001-v1.yaml) | [lego-decomp-tree](clawdbridge-lego-decomposition-tree-tk-20260509-001-v1.yaml)

---

## 1. 里程碑

```
M0 ──── M1 ──── M2 ──── M3 ──── M4
Week1    Week2    Week3    Week4-5  Week5-6

M0: 项目启动           (Day 0)
M1: Bridge Server 就绪  (Week 2 末)  — 审批 + 消息 + 认证可用
M2: Mobile App 就绪     (Week 4 末)  — 对话 + 审批 + 会话列表
M3: 端到端集成完成      (Week 5 末)  — 消息全链路
M4: MVP 交付            (Week 6 末)  — 审批闭环 + 内测
```

## 2. Sprint 计划

### Sprint 1: Bridge Server 核心 (Week 1-2)

| Packet | 模块 | Agent | 工时 | 验证 |
|--------|------|-------|------|------|
| P6 | Mobile: Expo 脚手架 | Agent-C | 2h | `npx expo start` |
| P1 | Bridge: WSHub + 握手 | Agent-A | 4h | `test/ws-hub.test.ts` |
| P4 | Bridge: AuthService + JWT | Agent-A | 3h | `test/auth-service.test.ts` |
| P2 | Bridge: CLIDriver | Agent-A | 6h | `test/cli-driver.test.ts` |
| P3 | Bridge: ApprovalEngine | Agent-A | 4h | `test/approval-engine.test.ts` |
| P5 | Bridge: REST API | Agent-B | 4h | `test/routes.test.ts` |

**Sprint 1 合计: 23h，3 Agent (A/B/C)**

```
依赖链:
  P6 ────────────────────────────────→ (M2 阶段使用)
  P1 ─→ P4 ─→ P5
  │   ─→ P2 (6h, 关键路径)
  │   ─→ P3
```

**关键路径**: P1 → P2 (10h, CLIDriver spawn/parse/exh 最复杂)

**退出条件 (M1)**:
- [ ] WSHub 10 种消息类型正确路由
- [ ] CLIDriver spawn + stdout 解析 + exit 清理
- [ ] ApprovalEngine 拦截→等待→注入 闭环
- [ ] AuthService JWT 签发/验证/刷新
- [ ] REST API 5 端点全通过

### Sprint 2: Mobile 核心 (Week 3-4)

| Packet | 模块 | Agent | 工时 | 验证 |
|--------|------|-------|------|------|
| P7 | Mobile: WebSocketClient + MessageRouter | Agent-C | 6h | `test/websocket-client.test.ts` |
| P12 | Mobile: SQLite 持久化 | Agent-C | 4h | `test/db.test.ts` |
| P10 | Mobile: ApprovalCard + 交互 | Agent-D | 4h | `test/approval-card.test.tsx` |
| P9 | Mobile: ChatScreen + ChatStore | Agent-D | 8h | `test/chat-screen.test.tsx` |
| P8 | Mobile: AuthScreen + DeviceScreen | Agent-C | 4h | `test/auth-screen.test.tsx` |
| P11 | Mobile: SessionList + TaskDashboard | Agent-D | 4h | `test/session-list-screen.test.tsx` |

**Sprint 2 合计: 30h，2 Agent (C/D)**

```
依赖链:
  P7 ─→ P9  (8h, 关键路径)
  │  ─→ P10 (4h)
  │  ─→ P11 (4h)
  P12 ─→ P11
  P6 ─→ P8, P7, P12
```

**关键路径**: P6 → P7 → P9 (16h, ChatScreen 最复杂的 UI 组件)

**退出条件 (M2)**:
- [ ] ChatScreen FlatList 1000 条 FPS ≥ 55
- [ ] ApprovalCard 接收/显示/操作闭环
- [ ] SessionList 时间降序 + 搜索 + 在线/离线标识
- [ ] SQLite 5 表 CRUD + WAL

### Sprint 3: 端到端集成 + 内测 (Week 5-6)

| Packet | 模块 | Agent | 工时 | 验证 |
|--------|------|-------|------|------|
| P13 | 联调: 端到端消息流 | 全体 | 4h | `test/e2e/full-flow.test.ts` |
| P14 | 联调: 审批闭环 | 全体 | 3h | `test/e2e/approval-flow.test.ts` |
| — | 性能调优 | 主线程 | 4h | 延迟 < 300ms, 审批 < 2s |
| — | 错误处理 + 边界 case | 主线程 | 3h | 异常路径矩阵 walkthrough |
| — | 内测修复 | 全体 | 6h | 崩溃率 < 0.5% |

**Sprint 3 合计: 20h**

**退出条件 (M4)**:
- [ ] 手机发送 "创建 hello.ts" → Desktop 文件产生
- [ ] 审批 允许/拒绝/超时 三路径全通过
- [ ] WebSocket 断连 → 重连 → session_sync 恢复
- [ ] 消息延迟 < 300ms（局域网）
- [ ] 审批闭环 < 2s
- [ ] App 崩溃率 < 0.5%

---

## 3. Agent 分配策略

### 3.1 Agent 分工

| Agent | 职责 | Span |
|-------|------|------|
| **Agent-A** | Bridge Server 全栈（WSHub + CLIDriver + ApprovalEngine + AuthService） | Sprint 1 |
| **Agent-B** | Bridge REST API + 集成 | Sprint 1 + Sprint 3 |
| **Agent-C** | Mobile 基础设施 + 持久化 + 通信 + 认证 | Sprint 1-2 |
| **Agent-D** | Mobile UI 核心（ChatScreen + ApprovalCard + SessionList） | Sprint 2 |

### 3.2 L4 派发执行计划

按 design §13.3 判定结果：

| L4 代码块 | 行数估算 | 派发方式 | Sprint | 负责 |
|----------|---------|---------|--------|------|
| `ws-hub.ts` | ~150 | 子 Agent | S1 | Agent-A |
| `message-router.ts` | ~80 | 子 Agent | S1 | Agent-A |
| `cli-driver.ts` | ~120 | 子 Agent（安全） | S1 | Agent-A |
| `claude-parser.ts` | ~60 | 主线程 | S1 | Agent-A |
| `approval-engine.ts` | ~100 | 子 Agent（安全） | S1 | Agent-A |
| `auth-service.ts` | ~80 | 子 Agent（安全） | S1 | Agent-A |
| `auth-middleware.ts` | ~40 | 主线程 | S1 | Agent-B |
| `routes/devices.ts` | ~50 | 主线程 | S1 | Agent-B |
| `routes/sessions.ts` | ~50 | 主线程 | S1 | Agent-B |
| `websocket-client.ts` | ~130 | 子 Agent | S2 | Agent-C |
| `message-router.ts` (mobile) | ~70 | 主线程 | S2 | Agent-C |
| `chat-screen.tsx` | ~200 | 子 Agent | S2 | Agent-D |
| `message-bubble.tsx` | ~80 | 主线程 | S2 | Agent-D |
| `tool-call-card.tsx` | ~60 | 主线程 | S2 | Agent-D |
| `approval-card.tsx` | ~100 | 子 Agent | S2 | Agent-D |
| `session-list-screen.tsx` | ~80 | 主线程 | S2 | Agent-D |
| `database.ts` | ~50 | 主线程 | S2 | Agent-C |
| `session-dao.ts` | ~40 | 主线程 | S2 | Agent-C |
| `message-dao.ts` | ~60 | 主线程 | S2 | Agent-C |

---

## 4. 依赖关系图

```
Sprint 1 (Week 1-2)             Sprint 2 (Week 3-4)         Sprint 3 (Week 5-6)
────────────────────            ────────────────────        ────────────────────

P6 ─────────────────────────────────────────────────────┐
                                                        │
P1 ─┬─→ P2 (CLIDriver)                                 │
    ├─→ P3 (ApprovalEngine) ────────────────────────────────┐
    └─→ P4 (AuthService) ─→ P5 (REST API)                 │  │
                                       │                   │  │
                                       │                   │  │
                                   ┌───┘                   │  │
                                   ↓                       ↓  │
                              P7 (WSClient) ←── P6 ──→ P12 (DB) 
                                   │                       │  │
                              ┌────┼────┐              ┌───┘  │
                              ↓    ↓    ↓              ↓      │
                             P9  P10  P11             P11     │
                             (Chat)(Appr)(List)               │
                              │    │                          │
                              └────┼──────────────────────────┘
                                   ↓              ↓
                          P13 (消息E2E)    P14 (审批E2E)
```

---

## 5. 风险注册

### 5.1 技术风险

| ID | 风险 | 概率 | 影响 | 缓解 | 负责人 | 触发信号 |
|----|------|------|------|------|--------|---------|
| R1 | Claude Code stdin/stdout 协议不标准 | 中 | 高 | S1 Day1 先用 `claude --terminal` 手动验证输出格式；Parser 层抽象 | Agent-A | parseClaudeLine 产生 > 10% 未知行 |
| R2 | WebSocket 在 React Native 移动端不稳定 | 高 | 中 | 设计已包含重连 + 去重 (seq) + 指数退避；S2 用 Jest mock 先验证 | Agent-C | connect 失败率 > 20% |
| R3 | FlatList 长对话渲染性能瓶颈 | 中 | 中 | 虚拟列表 + 仅渲染视口 + 消息分页 50 条；S2 压测 5000 条 | Agent-D | FPS < 50 |
| R4 | Bridge Server 并发 Claude 进程内存爆 | 低 | 高 | 单进程 200MB 估算，MVP 单用户；Phase 2 加进程池限制 | Agent-A | 内存 > 1GB |
| R5 | Expo 构建链与原生模块冲突 | 低 | 中 | 全部使用 expo-* 生态包，不引入原生依赖 | Agent-C | `npx expo start` 报 native 错误 |

### 5.2 进度风险

| ID | 风险 | 缓解 |
|----|------|------|
| R6 | Agent-A 任务重（S1 全部 Bridge + 6h CLIDriver） | 关键路径 P2 提前开始；P4/P5 并行给 Agent-B |
| R7 | Sprint 2 依赖 Sprint 1 全部完成 | P6 预加载到 Sprint 1（无依赖）；P12 可与 P7 并行 |
| R8 | 集成联调阶段发现 Sprint 1/2 接口不一致 | Design §5 已定义完整 API 契约；联调前先单测 |

---

## 6. 质量控制

### 6.1 评审门控

| 时间点 | Gate | 检查内容 |
|--------|------|---------|
| Sprint 1 结束 | professional | Bridge Server 全模块单测通过 + Lint + 覆盖率 ≥ 80% |
| Sprint 2 结束 | professional | Mobile 全组件单测通过 + Lint + tsc --noEmit |
| Sprint 3 结束 | professional + contract | E2E 通过 + 性能达标 + Checker 全绿 |

### 6.2 拼装验证时间线

```
Sprint 1 末:
  L4→L3: Bridge 单元拼装验证 → jest test/unit/
  L3→L2: Bridge 组件拼装验证 → jest test/integration/

Sprint 2 末:
  L4→L3: Mobile 单元拼装验证 → jest test/unit/
  L3→L2: Mobile 组件拼装验证 → jest test/integration/

Sprint 3 Week 5:
  L2→L1: 模块拼装验证 → jest test/module/ + 手动 App 走查
  L1→L0: 端到端验证 → jest test/e2e/ + 真实链路

Sprint 3 Week 6:
  L0: 成品验收 → 性能指标 + 崩溃率 + 真机测试
```

### 6.3 性能基线

| 指标 | 基线 | 测量方法 |
|------|------|---------|
| 消息延迟 | < 300ms | WSS RTT |
| 审批闭环 | < 2s | 从拦截到注入 |
| 会话列表 | < 1s | 100 会话 load time |
| ChatScreen FPS | ≥ 55 | 1000 条消息滚动 |
| 冷启动 | < 3s | Expo 生产构建 |
| 内存 | < 150MB | 活动对话状态 |

---

## 7. Agent 异常恢复执行规则

基于 lego-assembly-workflow §4.6.4，在 Sprint 执行中：

| 异常 | 本计划触发条件 | 恢复动作 |
|------|-------------|---------|
| Agent 挂死 | 超过 timeout_minutes × 2 未返回 | 终止 → 重新派发（附 spec + 失败分析）→ 写入 exceptions/ |
| 产出不足 | Fan-In 时 acceptance 未满足 | 标记 incomplete → 补全（附缺失清单） |
| 质量不合格 | 评审 Fail | 修复 → 复评（最多 3 轮）→ 3 轮仍未过 → blocked → 报告用户 |
| 依赖未就绪 | 依赖 packet 未完成 | 放入等待队列 → 依赖完成后重新派发 |
| 多 Agent 冲突 | 多个产出修改同一文件 | 主线程裁决 → 记录 resolution → 重新派发冲突方 |
| 同类问题 3 轮 | same_class_streak ≥ 3 | 重新分配 Agent + 上下文复盘 → marked blocked |

---

## 8. 每日站会检查点

| 日 | Sprint 1 检查 | Sprint 2 检查 | Sprint 3 检查 |
|----|-------------|-------------|-------------|
| Day 1 | P6 脚手架完成；P1 握手完成 | P7 connect 成功 | P13 消息流首通 |
| Day 2 | P1 消息路由完成；P4 auth 完成 | P12 DB 建表 + P10 卡片渲染 | P14 审批闭环首通 |
| Day 3 | P2 spawn 成功 | P9 MessageList 渲染 | 性能调优开始 |
| Day 4 | P2 parse 完成；P3 拦截完成 | P9 流式打字机效果 | 错误矩阵 walkthrough |
| Day 5 | P3 超时完成；P5 API 完成 | P9 完成 + P8 认证 | 内测修复 |
| Day 6 | Sprint 1 Gate 评审 | P11 完成 + Sprint 2 Gate 评审 | MVP 验收 |

---

## 9. 交付物清单

| 文件 | 类型 | 存放位置 |
|------|------|---------|
| `bridge-server/` 完整源码 | 代码 | `clawd-on-desk/bridge-server/` |
| `mobile/` 完整源码 | 代码 | 项目根 `mobile/` |
| Bridge 单测/集成测/E2E | 测试 | `bridge-server/test/` |
| Mobile 单测/集成测/E2E | 测试 | `mobile/test/` |
| README（部署运行指南） | 文档 | `mobile/README.md` |
| 环境配置模板 | 配置 | `.env.example` |
