# Plan：ClawdBridge Mobile — 开发计划（L4 实现层粒度）

> 版本: v2.0 | 2026-05-09 | 阶段: Stage 5 (Plan)
> document_class: execution_plan | depth_profile: detailed | maturity_target: draft | confidentiality: project_confidential
> 变更: v1→v2 按 work-packet-governance 12 层规范将 14 个模块包拆为 52 个实现层 L4 packet
> 基于: [design v2](clawdbridge-design-tk-20260509-001-v2.md) | [lego-decomp-tree](clawdbridge-lego-decomposition-tree-tk-20260509-001-v1.yaml)

---

## 1. 里程碑

```
M0 ──── M1 ──── M2 ──── M3 ──── M4
Week1    Week2    Week3    Week4-5  Week5-6

M0: 项目启动        (Day 0)
M1: Bridge 可用     (Week 2 末)
M2: Mobile 可用     (Week 4 末)
M3: 集成完成        (Week 5 末)
M4: MVP 交付        (Week 6 末)
```

---

## 2. Work Packet 清单（52 个 L4 实现层）

### 2.1 Bridge Server — 通信层 (BC1)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| BP01 | controller | WSServer: 创建 WebSocket 服务器，listen 端口 | `bridge-server/src/ws-server.ts` | ~60 | 1.5h | — |
| BP02 | wiring | AuthMiddleware: WebSocket 连接时 JWT 鉴权，拒绝无效 token | `bridge-server/src/auth-middleware.ts` | ~40 | 1h | BP01, BP14 |
| BP03 | controller | MessageRouter: type→handler 分发，10 种消息类型 | `bridge-server/src/message-router.ts` | ~80 | 2h | BP01 |
| BP04 | operability | Heartbeat: 30s ping/pong，超时断开 + 清理会话 | `bridge-server/src/heartbeat.ts` | ~30 | 0.5h | BP01 |

### 2.2 Bridge Server — Claude 驱动层 (BC3)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| BP05 | wiring | CLISpawn: spawn('claude', ['--terminal'])，设置 cwd/env | `bridge-server/src/cli-spawn.ts` | ~50 | 1h | BP01 |
| BP06 | controller | StdinWriter: 将手机消息写入 Claude stdin | `bridge-server/src/stdin-writer.ts` | ~30 | 0.5h | BP05 |
| BP07 | logic-1 | StdoutParser: 逐行解析 Claude stdout → JSON 消息对象 | `bridge-server/src/stdout-parser.ts` | ~60 | 1.5h | BP05 |
| BP08 | operability | StderrLogger: stderr 写入日志 + 错误事件触发 | `bridge-server/src/stderr-logger.ts` | ~20 | 0.5h | BP05 |
| BP09 | operability | ExitHandler: exit code≠0 → 通知手机 + 清理进程表 | `bridge-server/src/exit-handler.ts` | ~30 | 0.5h | BP05 |

### 2.3 Bridge Server — 审批引擎 (BC3)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| BP10 | logic-1 | ApprovalInterceptor: 拦截 permission_request → 检查白名单 → 生成 approval_request 推送 | `bridge-server/src/approval-interceptor.ts` | ~40 | 1h | BP01 |
| BP11 | logic-2 | ApprovalWaiter: Promise + 60s timeout，等待手机决定 | `bridge-server/src/approval-waiter.ts` | ~30 | 1h | BP10 |
| BP12 | logic-3 | ApprovalWhitelist: 会话级"始终允许"缓存 Map | `bridge-server/src/approval-whitelist.ts` | ~30 | 0.5h | BP10 |

### 2.4 Bridge Server — 认证 (BC2)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| BP13 | controller | OAuthHandler: GitHub OAuth 2.0 登录流程（/auth/oauth + callback） | `bridge-server/src/oauth-handler.ts` | ~50 | 1.5h | BP01 |
| BP14 | service | JWTIssuer: HS256 签发 access_token + refresh_token | `bridge-server/src/jwt-issuer.ts` | ~30 | 0.5h | — |
| BP15 | wiring | JWTVerifier: Express 中间件，验证 Authorization header | `bridge-server/src/jwt-verifier.ts` | ~20 | 0.5h | BP14 |
| BP16 | service | TokenRefresher: /auth/refresh 端点 + 旧 token 失效 | `bridge-server/src/token-refresher.ts` | ~20 | 0.5h | BP14 |

### 2.5 Bridge Server — REST API (BC1) + 设备管理 (BC4)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| BP17 | controller | DeviceRoutes: GET/POST/DELETE /api/devices | `bridge-server/src/routes/devices.ts` | ~50 | 1.5h | BP01, BP15 |
| BP18 | controller | SessionRoutes: GET/POST /api/sessions + GET /messages | `bridge-server/src/routes/sessions.ts` | ~50 | 1.5h | BP01, BP15 |

### 2.6 Mobile — 基础设施 (MC4 + MC5)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| MP01 | wiring | ExpoInit: npx create-expo-app + TypeScript + 目录结构 | `mobile/` 脚手架 | — | 1.5h | — |
| MP02 | wiring | NavigationSetup: React Navigation Tab (对话/任务/我的) + AuthStack | `mobile/src/navigation/` | ~40 | 1h | MP01 |
| MP03 | wiring | StoreTemplate: Zustand store 基础模板 | `mobile/src/stores/` | ~20 | 0.5h | MP01 |
| MP04 | wiring | DBInit: SQLite 打开 + 5 张表 CREATE + WAL 模式 | `mobile/src/db/database.ts` | ~50 | 1.5h | MP01 |
| MP05 | dao | SessionDAO: sessions 表 CRUD (create/read/update/archive) | `mobile/src/db/session-dao.ts` | ~40 | 1h | MP04 |
| MP06 | dao | MessageDAO: messages 表 CRUD + seq 去重 + 分页 | `mobile/src/db/message-dao.ts` | ~60 | 1.5h | MP04 |
| MP07 | dao | ApprovalDAO: approvals 表写入/查询 | `mobile/src/db/approval-dao.ts` | ~30 | 0.5h | MP04 |
| MP08 | dao | KVStoreDAO: kv_store 表 read/write（Token 持久化） | `mobile/src/db/kv-store-dao.ts` | ~20 | 0.5h | MP04 |

### 2.7 Mobile — 通信 (MC4)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| MP09 | controller | WSConnection: connect + 握手 (client_connect) + 指数退避重连 | `mobile/src/services/ws-connection.ts` | ~60 | 1.5h | MP01 |
| MP10 | controller | WSSender: send 消息 + local seq 自增 + ACK 处理 | `mobile/src/services/ws-sender.ts` | ~30 | 0.5h | MP09 |
| MP11 | logic-1 | WSReceiver: 接收消息 → JSON.parse → 按 type 路由 | `mobile/src/services/ws-receiver.ts` | ~40 | 1h | MP09 |
| MP12 | logic-2 | MsgRouter: assistant_stream → ChatStore / approval_request → ApprovalHandler / tool_invocation → ToolCard | `mobile/src/services/msg-router.ts` | ~70 | 2h | MP11 |
| MP13 | logic-3 | SeqDeduplicator: 比对 last_ack_seq → 去重 → 补发队列 | `mobile/src/services/seq-dedup.ts` | ~30 | 1h | MP10, MP11 |

### 2.8 Mobile — 认证与设备 (MC1)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| MP14 | controller | SecureStore: expo-secure-store 封装（存/取/删 JWT） | `mobile/src/services/secure-store.ts` | ~30 | 0.5h | MP01 |
| MP15 | controller | AuthScreen: 登录/注册 UI + GitHub OAuth 按钮 | `mobile/src/screens/auth-screen.tsx` | ~60 | 1.5h | MP01 |
| MP16 | controller | OAuthDeepLink: clawdbridge://auth?token= 深链处理 | `mobile/src/hooks/use-oauth-deeplink.ts` | ~30 | 1h | MP15 |
| MP17 | controller | DeviceScreen: 设备列表 UI + 在线/离线状态 + 配对/解绑 | `mobile/src/screens/device-screen.tsx` | ~80 | 2h | MP01 |

### 2.9 Mobile — 对话核心 (MC2)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| MP18 | service | ChatState: Zustand ChatStore (messages/send/stream/approval) | `mobile/src/stores/chat-store.ts` | ~80 | 2h | MP03 |
| MP19 | controller | MessageList: FlatList 虚拟化 + 5 种消息类型渲染分发 | `mobile/src/screens/chat-screen.tsx` | ~80 | 2h | MP18 |
| MP20 | controller | UserBubble: 用户消息气泡组件（右对齐/蓝色） | `mobile/src/components/user-bubble.tsx` | ~30 | 0.5h | MP19 |
| MP21 | controller | AIBubble: AI 消息气泡组件（左对齐/灰色/打字机） | `mobile/src/components/ai-bubble.tsx` | ~50 | 1h | MP19 |
| MP22 | controller | CodeBlock: 代码块语法高亮 (prism-react-renderer) | `mobile/src/components/code-block.tsx` | ~40 | 1h | MP19 |
| MP23 | controller | ToolCallCard: 工具调用卡片 (文件名/操作类型/状态) | `mobile/src/components/tool-call-card.tsx` | ~60 | 1h | MP19 |
| MP24 | controller | ErrorCard: 错误卡片 + "让 AI 修复" 按钮 | `mobile/src/components/error-card.tsx` | ~40 | 0.5h | MP19 |
| MP25 | controller | InputBar: 文本输入 + Markdown 快捷 + 发送按钮 | `mobile/src/components/input-bar.tsx` | ~60 | 1.5h | MP18 |
| MP26 | controller | VoiceButton: 按住说话 → expo-speech-recognition → 填入输入框 | `mobile/src/components/voice-button.tsx` | ~40 | 1h | MP25 |

### 2.10 Mobile — 审批 (MC2)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| MP27 | service | ApprovalHandler: useApprovalHandler hook（状态+发送/超时） | `mobile/src/hooks/use-approval-handler.ts` | ~40 | 1h | MP18 |
| MP28 | controller | ApprovalCard: 审批卡片 UI（操作/目标/风险/按钮） | `mobile/src/components/approval-card.tsx` | ~60 | 1.5h | MP27 |
| MP29 | controller | ApprovalAllow: 允许按钮（绿色）+ 发送 approved | 在 MP28 内 | ~20 | — | MP28 |
| MP30 | controller | ApprovalReject: 拒绝按钮（红色）+ 发送 rejected | 在 MP28 内 | ~20 | — | MP28 |
| MP31 | logic-1 | ApprovalSessionScope: "本会话始终允许" → 勾选 → scope=session | `mobile/src/hooks/use-approval-session-scope.ts` | ~20 | 0.5h | MP27 |

### 2.11 Mobile — 会话管理 (MC3)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| MP32 | service | SessionState: Zustand SessionStore（列表/搜索/未读/在线状态） | `mobile/src/stores/session-store.ts` | ~60 | 1.5h | MP03 |
| MP33 | controller | SessionList: 会话列表 UI（时间降序/在线灯/未读角标） | `mobile/src/screens/session-list-screen.tsx` | ~60 | 1.5h | MP32 |
| MP34 | controller | SessionCard: 单会话卡片（标题/摘要/设备/时间） | `mobile/src/components/session-card.tsx` | ~40 | 1h | MP33 |
| MP35 | controller | SessionSearch: 关键词搜索 + 过滤 | `mobile/src/components/session-search.tsx` | ~20 | 0.5h | MP32 |
| MP36 | controller | TaskDashboard: 任务仪表盘（按项目分组/状态卡片） | `mobile/src/screens/task-dashboard-screen.tsx` | ~50 | 1.5h | MP32 |

### 2.12 集成联调 (INT)

| ID | packet_kind | 任务 | 文件 | 行数 | 工时 | 依赖 |
|----|------------|------|------|------|------|------|
| IP01 | verification | E2EMessageFlow: 发消息→spawn→响应流回 完整链路 | `bridge-server/test/e2e/full-flow.test.ts` | ~80 | 2h | BP01-18, MP01-36 |
| IP02 | verification | E2EApprovalFlow: 允许/拒绝/超时 三路径 | `bridge-server/test/e2e/approval-flow.test.ts` | ~60 | 1.5h | BP10-12, MP27-31 |
| IP03 | verification | PerfBenchmark: 消息延迟/审批闭环/1000 条 FPS 测量 | `mobile/test/perf/` | ~40 | 1.5h | IP01 |
| IP04 | verification | ErrorWalkthrough: 8 类异常场景 walkthrough | — | — | 2h | IP01, IP02 |

---

## 3. Sprint 计划（L4 粒度）

### Sprint 1: Bridge Server (Week 1-2, 27h)

| Day | Packet | 任务 | 工时 | Check |
|-----|--------|------|------|-------|
| D1 | BP01 | WSServer 创建 | 1.5h | listen port OK |
| D1 | BP14 | JWTIssuer | 0.5h | sign/verify 通过 |
| D1 | BP02 | AuthMiddleware | 1h | 无效 token → 401 |
| D1 | BP03 | MessageRouter | 2h | 10 种 type 路由正确 |
| D2 | BP04 | Heartbeat | 0.5h | 30s 无 pong → 断开 |
| D2 | BP05 | CLISpawn | 1h | spawn('claude') 返回 pid |
| D2 | BP06 | StdinWriter | 0.5h | 写入 stdin → Claude 处理 |
| D2 | BP07 | StdoutParser | 1.5h | 逐行 → JSON 消息对象 |
| D3 | BP08 | StderrLogger | 0.5h | stderr → 日志文件 |
| D3 | BP09 | ExitHandler | 0.5h | exit≠0 → send error |
| D3 | BP10 | ApprovalInterceptor | 1h | intercept → push WS |
| D4 | BP11 | ApprovalWaiter | 1h | 手机响应 → resolve |
| D4 | BP12 | ApprovalWhitelist | 0.5h | session-scope skip |
| D4 | BP13 | OAuthHandler | 1.5h | /auth/oauth → JWT |
| D4 | BP15 | JWTVerifier | 0.5h | 中间件无 token → 401 |
| D5 | BP16 | TokenRefresher | 0.5h | /auth/refresh 200 |
| D5 | BP17 | DeviceRoutes | 1.5h | CRUD device pass |
| D5 | BP18 | SessionRoutes | 1.5h | CRUD + pagination pass |
| D5 | MP01 | ExpoInit | 1.5h | `npx expo start` OK |
| D5 | MP02 | NavigationSetup | 1h | Tabs 切换 OK |
| D6 | MP03 | StoreTemplate | 0.5h | Zustand create OK |
| D6 | MP04 | DBInit | 1.5h | 5 tables + WAL |
| D6 | MP05 | SessionDAO | 1h | CRUD test pass |
| D6 | MP06 | MessageDAO | 1.5h | seq dedup + page pass |
| D6 | MP07 | ApprovalDAO | 0.5h | write/read OK |
| D6 | MP14 | SecureStore | 0.5h | store/read/delete OK |
| D6 | **Sprint 1 Gate** | professional check | — | 覆盖率 ≥ 80% |

### Sprint 2: Mobile UI (Week 3-4, 26h)

| Day | Packet | 任务 | 工时 | Check |
|-----|--------|------|------|-------|
| D1 | MP08 | KVStoreDAO | 0.5h | Token CRUD OK |
| D1 | MP09 | WSConnection | 1.5h | connect + reconnect |
| D1 | MP10 | WSSender | 0.5h | send + seq OK |
| D1 | MP11 | WSReceiver | 1h | receive + parse OK |
| D2 | MP12 | MsgRouter | 2h | stream→store 正确 |
| D2 | MP13 | SeqDeduplicator | 1h | 重复 seq 跳过 |
| D2 | MP18 | ChatState | 2h | send/stream/approval 全链路 |
| D3 | MP19 | MessageList | 2h | FlatList render OK |
| D3 | MP20 | UserBubble | 0.5h | 右对齐蓝色 render |
| D3 | MP21 | AIBubble | 1h | 打字机效果 render |
| D4 | MP22 | CodeBlock | 1h | 语法高亮正确 |
| D4 | MP23 | ToolCallCard | 1h | 文件名/状态 render |
| D4 | MP24 | ErrorCard | 0.5h | "让 AI 修复" 按钮可点 |
| D4 | MP25 | InputBar | 1.5h | 文本+Markdown+发送 |
| D5 | MP26 | VoiceButton | 1h | 按住→识别→填入 |
| D5 | MP27 | ApprovalHandler | 1h | hook 状态流转 OK |
| D5 | MP28-31 | ApprovalCard 全家 | 2h | 允许/拒绝/scope 全路径 |
| D6 | MP32 | SessionState | 1.5h | Store 数据正确 |
| D6 | MP33 | SessionList | 1.5h | 时间降序+在线标识 |
| D6 | MP34 | SessionCard | 1h | 摘要+时间 render |
| D6 | MP35 | SessionSearch | 0.5h | 过滤正确 |
| D6 | MP36 | TaskDashboard | 1.5h | 分组+状态卡片 |
| D6 | MP15 | AuthScreen | 1.5h | OAuth 登录完整流 |
| D6 | MP16 | OAuthDeepLink | 1h | 深链 → token → 跳转 |
| D6 | MP17 | DeviceScreen | 2h | 列表+配对+解绑 |
| D6 | **Sprint 2 Gate** | professional check | — | FlatList FPS≥55 |

### Sprint 3: 集成 + 交付 (Week 5-6, 14h)

| Day | Packet | 任务 | 工时 | Check |
|-----|--------|------|------|-------|
| D1 | IP01 | E2E 消息流 | 2h | 首通 |
| D1 | IP02 | E2E 审批流 | 1.5h | 三路径全通 |
| D2 | IP02 (续) | 审批边界 case | 1h | 超时/断连/白名单 |
| D2 | IP03 | 性能基准 | 1.5h | delay<300ms/FPS≥55 |
| D3 | IP04 | 错误矩阵 walkthrough | 2h | 8 场景全覆盖 |
| D4 | — | Bug 修复 | 3h | 崩溃率<0.5% |
| D5 | — | 真机测试 | 3h | 审批 + 消息 + 断连 |
| D6 | **Sprint 3 Gate** | professional+contract | — | Checker 全绿 |

---

## 4. 依赖关系（关键路径）

```
BP01(WSServer) ──→ BP03(MsgRouter) ──→ BP05(CLISpawn) ──→ BP07(StdoutParser)
                │                                               │
                └──→ BP10(ApprIntcpt) ──→ BP11(ApprWaiter)      │
                │                                               │
                └──→ BP14(JWTIssue) ──→ BP13(OAuth)            │
                                     ──→ BP15(JWTVerify)       │
                                                               ↓
MP01(Expo) ←──────────────────────────────────── Bridge Ready ─┘
  ├──→ MP04(DB) ──→ MP05-08(DAOs)
  ├──→ MP09(WSConn) ──→ MP10-13(WS全家)
  └──→ MP18(ChatStore) ──→ MP19-26(Chat UI全家)
                         └──→ MP27-31(Approval全家)
       MP32(SessionStore) ──→ MP33-36(Session UI全家)
                                                               ↓
                                                        IP01-04(集成)
```

关键路径: **BP01→BP05→BP07→MP01→MP09→MP18→MP19 (18h)**

---

## 5. 风险注册

| ID | 风险 | 概率 | 影响 | 缓解 | 触发信号 |
|----|------|------|------|------|---------|
| R1 | Claude stdout 协议非标 | 中 | 高 | BP07 先手动验证输出格式 | parse 未知行 > 10% |
| R2 | RN WebSocket 不稳 | 高 | 中 | MP09 重连+指数退避 | connect 失败率 > 20% |
| R3 | FlatList 长对话性能 | 中 | 中 | MP19 虚拟列表+分页50条 | FPS < 50 |
| R4 | Bridge 多进程内存 | 低 | 高 | MVP 单用户，Phase2 限流 | 内存 > 1GB |
| R5 | Expo 原生冲突 | 低 | 中 | 全部 expo-* 包 | `expo start` 报 native 错 |

---

## 6. 质量控制

### 6.1 拼装验证时间线

```
Sprint 1 末 (Bridge):
  L4→L3: unit test (BP01-18)             → jest test/unit/
  L3→L2: integration test (WS+auth+CLI)   → jest test/integration/

Sprint 2 末 (Mobile):
  L4→L3: unit test (MP01-36)             → jest test/unit/
  L3→L2: integration test (Chat+Approval) → jest test/integration/

Sprint 3 W5:
  L2→L1: module test (Bridge+Mobile)       → jest test/module/
  L1→L0: e2e test (IP01-02)               → jest test/e2e/

Sprint 3 W6:
  L0: acceptance (IP03-04)                 → perf + error matrix
```

### 6.2 性能基线

| 指标 | 目标 | 测量 |
|------|------|------|
| 消息延迟 | < 300ms | WSS RTT |
| 审批闭环 | < 2s | intercept → inject |
| FlatList FPS | ≥ 55 | 1000 条滚动 |
| 内存 | < 150MB | 活动对话状态 |

---

## 7. Agent 异常恢复

| 异常 | 触发 | 恢复 |
|------|------|------|
| 挂死 | > timeout×2 | 重派(spec+分析)→写 exceptions |
| 产出不足 | acceptance 未满 | 补全(附缺失清单) |
| 质量不合格 | 评审 Fail | 修复→复评(3轮)→blocked |
| 依赖未就绪 | dep packet 未完成 | 等待队列→就绪后重派 |
| 多输出冲突 | 同文件被多 Agent 改 | 主线程裁决→重派 |

---

## 8. 每日检查点

| Day | Sprint 1 | Sprint 2 | Sprint 3 |
|-----|---------|---------|---------|
| D1 | WS+Auth 就绪 | WS Client 就绪 | E2E 消息首通 |
| D2 | CLI spawn 成功 | ChatStore 就绪 | E2E 审批首通 |
| D3 | Parse 完成 | MessageList 渲染 | 性能达标 |
| D4 | 审批引擎完成 | Chat UI 完成 | 错误矩阵完成 |
| D5 | API+Expo 完成 | Session UI 完成 | Bug 修复 |
| D6 | Gate 评审 | Gate 评审 | MVP 验收 |

---

## 9. 交付物

| 代码 | 测试 | 文档 |
|------|------|------|
| `bridge-server/src/` (~18 文件) | `bridge-server/test/` | `mobile/README.md` |
| `mobile/src/` (~36 文件) | `mobile/test/` | `.env.example` |

---

## 10. 业务逻辑清单

### Bridge Server

| 模块 | 规则 | 输入 | 输出 | 异常路径 |
|------|------|------|------|---------|
| AuthMiddleware | token 有效→放行；无效→401；过期→提示刷新 | JWT + secret | userId or 401 | secret 不匹配→500 |
| StdoutParser | 每行尝试 JSON.parse；成功→msg 对象；失败→丢弃+log | 文本行 | msg 对象 or null | JSON 截断→缓存拼接 |
| ApprovalInterceptor | 白名单命中→直接 approved；未命中→生成 request 推送手机 | permission_request | approved or approval_request | 白名单查询失败→走推送路径 |
| ApprovalWaiter | 60s 内收到手机响应→返回决定；60s→auto_rejected | requestId | approved/rejected | Promise 内存泄漏→cleanup timer |
| JWTIssuer | HS256 签名；payload={userId,deviceId,exp,iat} | userId+deviceId | token pair | — |
| TokenRefresher | refreshToken 有效→新 pair；无效→401 | refreshToken | new pair or 401 | — |

### Mobile

| 模块 | 规则 | 输入 | 输出 | 异常路径 |
|------|------|------|------|---------|
| WSConnection | URL 有效→connect；失败→指数退避(5次) | url+token | connected or offline | 5 次后停止→提示用户 |
| SeqDeduplicator | seq≤lastAck→跳过；seq>lastAck→处理 | seq | process/skip | 跳号→等待补发 |
| ChatState.send | 输入→存 SQLite→WS send→乐观更新 UI | content | UI update + DB write | WS 断开→标记 failed |
| ChatState.receiveStream | delta→拼接到最后一条 AI 消息；done→写入 DB | delta+done | UI 打字机效果 | — |
| ApprovalHandler | 收到 request→弹卡片+振动；点允许→发 approved；点拒绝→发 rejected | request | response | 超时 60s→卡片消失 |
| SessionList | 按 lastMessageAt DESC 排序；在线→●绿；离线→○灰；待审批→⚠+数量 | sessions[] | render list | — |
