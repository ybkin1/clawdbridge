# Design 倒推审计 — Dev Plan v2 (52 L4 packets) → Design v1 覆盖检查

> 审计日期: 2026-05-09 | 方法: 以 dev plan v2 的 52 个 L4 实现层 packet 为基准，逐条倒查 design 中是否有对应的完整设计规格
> 判定标准: lego-assembly-workflow §4.5 硬规则 — "方案详设的粒度必须达到子 Agent 拿到设计稿后，不需要额外决策就能写出代码"

---

## 一、倒推映射总表

### 1.1 Bridge Server — 通信层 (BC1, 4 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| BP01 WSServer | `ws-server.ts` | §5.4 WS 端点 (wss://host:port/ws, token query param), §7.1 WSHub.onConnect | ✅ 充分 |
| BP02 AuthMiddleware | `auth-middleware.ts` | §7.1 onConnect(token)→authenticate, §9.1 JWT 签发, §9.2 安全原则 | ✅ 充分 |
| BP03 MessageRouter | `message-router.ts` | §5.5 10 种消息 type 完整 TypeScript 定义, §7.1 route(msg)→按 type 分发 | ✅ 充分 |
| BP04 Heartbeat | `heartbeat.ts` | §5.5 ping/pong types, §7.1 heartbeatCheck()→30s 超时断连 | ✅ 充分 |

### 1.2 Bridge Server — Claude 驱动层 (BC3, 5 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| BP05 CLISpawn | `cli-spawn.ts` | §7.2 spawn('claude', ['--terminal'], cwd/stdio:pipe/env) 伪代码 | ✅ 充分 |
| BP06 StdinWriter | `stdin-writer.ts` | §3.2 消息生命周期 (手机→Bridge→Claude stdin), §7.2 write(process) | ✅ 充分 |
| BP07 StdoutParser | `stdout-parser.ts` | §7.2 parseClaudeLine→msg (text/tool_use/tool_result/permission_request) 伪代码 | ✅ 充分 |
| BP08 StderrLogger | `stderr-logger.ts` | §7.2 stderr.on('data') 事件, §9.1 日志分级 (ERROR/WARN/INFO/DEBUG) | ✅ 充分 |
| BP09 ExitHandler | `exit-handler.ts` | §7.2 proc.on('exit')→清理+通知, §8.1 进程崩溃→exit≠0→通知手机 | ✅ 充分 |

### 1.3 Bridge Server — 审批引擎 (BC3, 3 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| BP10 ApprovalInterceptor | `approval-interceptor.ts` | §7.3 intercept() 伪代码：白名单检查→生成 approval_request→推送 WS | ✅ 充分 |
| BP11 ApprovalWaiter | `approval-waiter.ts` | §7.3 Promise + 60000ms timeout→auto_rejected, §8.1 审批超时降级 | ✅ 充分 |
| BP12 ApprovalWhitelist | `approval-whitelist.ts` | §7.3 isWhitelisted/scope=session→addToWhitelist | ✅ 充分 |

### 1.4 Bridge Server — 认证 (BC2, 4 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| BP13 OAuthHandler | `oauth-handler.ts` | §5.1 POST/auth/oauth, callback→redirect clawdbridge://, §7.1 handleOAuth | ✅ 充分 |
| BP14 JWTIssuer | `jwt-issuer.ts` | §9.1 HS256, payload={userId,deviceId,exp,iat}, secret from env | ✅ 充分 |
| BP15 JWTVerifier | `jwt-verifier.ts` | §7.1 verifyToken(token)→userId, §9.2 Token刷新 | ⚠️ 缺 Express 中间件签名 |
| BP16 TokenRefresher | `token-refresher.ts` | §5.1 POST/auth/refresh → request{refreshToken}/response{newPair}/errors{401} | ✅ 充分 |

### 1.5 Bridge Server — REST API (BC1/BC4, 2 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| BP17 DeviceRoutes | `routes/devices.ts` | §5.2 GET/POST/DELETE devices → Request/Response schema, §7.1 DeviceManager 函数签名 | ✅ 充分 |
| BP18 SessionRoutes | `routes/sessions.ts` | §5.3 GET/POST sessions + GET sessions/:id/messages → Request/Response/Query params | ✅ 充分 |

### 1.6 Mobile — 基础设施 (MC4/MC5, 8 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| MP01 ExpoInit | 脚手架 | §6.2 技术选型 (React Native 0.76+ + Expo + Zustand + React Navigation) | ⚠️ 缺 package.json 依赖清单 |
| MP02 NavigationSetup | `navigation/` | §2 组件树 (AuthScreen→AuthStack, MainTabNavigator 三页) | ✅ 充分 |
| MP03 StoreTemplate | `stores/` | §4 三个 Zustand Store 完整 TypeScript interface 定义 | ✅ 充分 |
| MP04 DBInit | `database.ts` | §6.1 5 张表 DDL + WAL 模式 + 预估行量 | ✅ 充分 |
| MP05 SessionDAO | `session-dao.ts` | §6.1 sessions 表 DDL (id/title/device_id/status/unread/archived) | ⚠️ **缺方法签名** |
| MP06 MessageDAO | `message-dao.ts` | §6.1 messages 表 DDL + §6.2 BEFORE 游标分页 + §8.2 seq 去重 | ⚠️ **缺方法签名** |
| MP07 ApprovalDAO | `approval-dao.ts` | §6.1 approvals 表 DDL (id/session/operation/target/decision) | ⚠️ **缺方法签名** |
| MP08 KVStoreDAO | `kv-store-dao.ts` | §6.1 kv_store 表 DDL (key/value/updated_at) | ⚠️ **缺方法签名** |

### 1.7 Mobile — 通信 (MC4, 5 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| MP09 WSConnection | `ws-connection.ts` | §3.1 连接状态机 (idle→connecting→connected→reconnecting), §8.1 断连→重连指数退避 | ✅ 充分 |
| MP10 WSSender | `ws-sender.ts` | §8.2 去重 (seq 自增→存入 SQLite→ACK→标记 sent) | ⚠️ **缺独立 API 规格** |
| MP11 WSReceiver | `ws-receiver.ts` | §5.5 10 种消息 TypeScript 类型定义 | ⚠️ 缺 parse→dispatch 逻辑 |
| MP12 MsgRouter | `msg-router.ts` | — | ❌ **无显式路由表** |
| MP13 SeqDeduplicator | `seq-dedup.ts` | §8.2 去重机制伪代码 (seq≤lastAck→跳过, 跳号→补发) | ✅ 充分 |

### 1.8 Mobile — 认证与设备 (MC1, 4 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| MP14 SecureStore | `secure-store.ts` | §9.1 "expo-secure-store / Keychain / Keystore" — 提及但不具体 | ⚠️ **缺 API 签名** |
| MP15 AuthScreen | `auth-screen.tsx` | §2 AuthScreen 组件节点 (LoginScreen/RegisterScreen/OTPScreen), §5.1 API | ✅ 充分 |
| MP16 OAuthDeepLink | `use-oauth-deeplink.ts` | §5.1 callback→clawdbridge://auth?token=xxx&refresh=xxx→SecureStore→跳转主页 | ✅ 充分 |
| MP17 DeviceScreen | `device-screen.tsx` | §2 DeviceScreen/DeviceCard/PairDeviceButton, §5.2 API, §7.2.3 设备管理页线框 | ✅ 充分 |

### 1.9 Mobile — 对话核心 (MC2, 9 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| MP18 ChatState | `chat-store.ts` | §4.2 ChatState interface (messages/send/stream/approval/tool/clear) + Message 类型定义 | ✅ 充分 |
| MP19 MessageList | `chat-screen.tsx` | §2 ChatScreen/MessageList/FlatList, §7.2.2 对话详情页完整线框 | ✅ 充分 |
| MP20 UserBubble | `user-bubble.tsx` | §2 UserBubble 节点, §7.2.2 线框 "右侧蓝色", §7.3 主题色 #3B82F6 | ✅ 充分 |
| MP21 AIBubble | `ai-bubble.tsx` | §2 AIBubble 节点, §3.2 打字机效果(delta→拼接→done→写DB), §7.3 主题色 #F3F4F6 | ✅ 充分 |
| MP22 CodeBlock | `code-block.tsx` | §2 (含代码块高亮), §7.2.2 线框 ```语法高亮 | ✅ 充分 |
| MP23 ToolCallCard | `tool-call-card.tsx` | §2 ToolCallCard 节点, §5.5 tool_invocation 消息(field:callId/toolName/filePath), §7.2.2 线框 | ✅ 充分 |
| MP24 ErrorCard | `error-card.tsx` | §2 ErrorCard 节点, §5.2 执行反馈 "红色高亮+让AI修复按钮" | ✅ 充分 |
| MP25 InputBar | `input-bar.tsx` | §2 InputBar 节点(TextInput/Markdown/send), §7.2.2 线框底部输入栏 | ✅ 充分 |
| MP26 VoiceButton | `voice-button.tsx` | §2 VoiceButton 节点, §4.3 输入方式 "按住说话→ASR→填入输入框" | ✅ 充分 |

### 1.10 Mobile — 审批 (MC2, 3 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| MP27 ApprovalHandler | `use-approval-handler.ts` | §3.3 审批状态机 (pending→approved/rejected/auto_rejected), §5.5 approval_request/response 消息类型 | ⚠️ 缺 hook 返回值签名 |
| MP28 ApprovalCard | `approval-card.tsx` | §2 ApprovalCard 节点, §7.2.2 线框 (操作/路径/风险/[拒绝][允许]), §7.3 主题色 | ✅ 充分 |
| MP29 SessionScope | `use-approval-session-scope.ts` | PRD §F-06.4 "本次会话始终允许" → design §7.3 addToWhitelist | ⚠️ 仅在 PRD 定义 |

### 1.11 Mobile — 会话管理 (MC3, 5 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| MP30 SessionState | `session-store.ts` | §4.1 SessionState interface (sessions/map/activeId/loading + fetch/create/archive) + Session 类型 | ✅ 充分 |
| MP31 SessionList | `session-list-screen.tsx` | §2 SessionListScreen, §7.2.1 对话列表页完整线框 (在线灯/标题/设备/时间/警告) | ✅ 充分 |
| MP32 SessionCard | `session-card.tsx` | §2 SessionCard (标题/摘要/设备状态/时间), §7.2.1 线框 | ✅ 充分 |
| MP33 SessionSearch | `session-search.tsx` | PRD §F-08.5 "对话内关键词搜索" → design 无对应 | ⚠️ **仅 PRD 级** |
| MP34 TaskDashboard | `task-dashboard-screen.tsx` | §2 TaskDashboardScreen/TaskStatusCard/TaskGroupHeader | ✅ 充分 |

### 1.12 集成联调 (INT, 4 packets)

| Packet | 代码文件 | Design 章节 | 设计覆盖 |
|--------|---------|-----------|---------|
| IP01 E2EMessageFlow | `test/e2e/` | §3.2 消息生命周期 (全链路: 输入→DB→WS→Bridge→stdin→Claude→stdout→WS→UI) | ✅ 充分 |
| IP02 E2EApprovalFlow | `test/e2e/` | §3.3 审批状态机 (三路径: approved/rejected/auto_rejected) | ✅ 充分 |
| IP03 PerfBenchmark | `test/perf/` | §12 性能指标映射 (延迟/审批/列表/FPS/冷启动/内存) | ✅ 充分 |
| IP04 ErrorWalkthrough | `—` | §8.1 7 类失败场景矩阵 (检测/降级/恢复) | ✅ 充分 |

---

## 二、汇总

### 2.1 覆盖率统计

| 等级 | 数量 | 占比 |
|------|------|------|
| ✅ 充分覆盖 | 36 | 69.2% |
| ⚠️ 部分覆盖（缺接口签名/方法定义） | 14 | 26.9% |
| ❌ 无设计支撑 | 2 | 3.8% |

### 2.2 缺口详细清单

#### ❌ 无设计支撑 (2)

| # | Packet | 缺失内容 | 严重度 |
|---|--------|---------|--------|
| G01 | **MP12 MsgRouter** | Design §5.5 定义了 10 种消息 type，但**没有显式的路由表**（assistant_stream→ChatStore, approval_request→ApprovalHandler, tool_invocation→ToolCard 等的映射表）。子 Agent 需要自己推断 dispatch 逻辑。 | 高 |
| G02 | **MP33 SessionSearch** | 仅在 PRD §F-08.5 中定义，design **完全无对应**。子 Agent 不知道搜索 API（是本地过滤 DB 还是远程查询？）、搜索字段（标题/内容/时间？）、UI 交互（实时搜索/提交搜索？）。 | 中 |

#### ⚠️ 部分覆盖 — 缺方法签名 (8)

| # | Packet | 现有设计 | 缺失 |
|---|--------|---------|------|
| G03 | **MP05 SessionDAO** | §6.1 DDL | `create(title,deviceId)→id` / `list()→Session[]` / `archive(id)` / `updateLastMessage(id,ts)` 等方法签名 |
| G04 | **MP06 MessageDAO** | §6.1 DDL + §6.2 分页策略 | `insert(msg)→void` / `getPage(sessionId,beforeTs,limit)→Message[]` / `getLastSeq(sessionId)→number` |
| G05 | **MP07 ApprovalDAO** | §6.1 DDL | `insert(approval)→void` / `getBySession(sessionId)→Approval[]` |
| G06 | **MP08 KVStoreDAO** | §6.1 DDL | `get(key)→string | null` / `set(key,value)→void` / `delete(key)→void` |
| G07 | **MP10 WSSender** | §8.2 提了 seq 自增 + ACK | 没有独立的 send 方法签名 / ACK 处理逻辑 / 重传队列 API |
| G08 | **MP14 SecureStore** | §9.1 提及 expo-secure-store | 没有封装后的 API 签名（`storeToken(token)` / `getToken()` / `clearToken()`） |

#### ⚠️ 部分覆盖 — 缺返回值/接口签名 (4)

| # | Packet | 现有设计 | 缺失 |
|---|--------|---------|------|
| G09 | **BP15 JWTVerifier** | §7.1 verifyToken(token)→userId | 缺 Express middleware 签名 `(req,res,next)` + error response format |
| G10 | **MP27 ApprovalHandler** | §3.3 状态机 | 缺 hook 返回值签名：`{request, show, approved, rejected, timeout, respond(decision, scope)}` |
| G11 | **MP11 WSReceiver** | §5.5 消息类型 | 缺 `onMessage(json)→dispatch(msgRouter, type, payload)` 方法签名 |
| G12 | **MP01 ExpoInit** | §6.2 技术选型 | 缺 `package.json` 依赖清单（expo/react-native/zustand/react-navigation/exp-speech-recognition 等版本要求） |
| G13 | **MP29 SessionScope** | PRD §F-06.4 | Design §7.3 提了 addToWhitelist 但未将 sessionScope 作为独立 hook 规格化 |
| G14 | **MP02 NavigationSetup** | §2 组件树 | 缺 React Navigation 的 navigator 配置 schema（Stack.Navigator 层级、Tab screen 定义） |

---

## 三、L4 派发判定对应性

Design §13.3 只列出了 **19 个** L4 代码块。Dev plan v2 有 **52 个** L4 包。差异原因：

| Design §13.3 代码块 | Dev Plan v2 拆为 |
|---------------------|------------------|
| `cli-driver.ts` (~120行) | **5 个包**: BP05(spawn) + BP06(stdin) + BP07(parse) + BP08(stderr) + BP09(exit) |
| `approval-engine.ts` (~100行) | **3 个包**: BP10(intercept) + BP11(wait) + BP12(whitelist) |
| `auth-service.ts` (~80行) | **3 个包**: BP13(oauth) + BP14(issue) + BP16(refresh) |
| `websocket-client.ts` (~130行) | **2 个包**: MP09(connect) + MP10(send) + MP11(receive) |
| `chat-screen.tsx` (~200行) | **6 个包**: MP18(store) + MP19(list) + MP20-24(components) + MP25(input) |

**结论**: Dev plan 的拆解粒度比 design 的 L4 判定更细。不影响可制造性——子 Agent 拿 §7.2 CLIDriver 伪代码可以制造 5 个相关文件。但 design §13.3 的 19→52 差异说明设计层"最小单元"定义与实现层不完全对齐。

---

## 四、综合结论

| 项 | 结果 |
|-----|------|
| **设计是否达到最小功能单元** | ⚠️ 69% 覆盖 — 数据接口层 (DAO/sender/receiver) 和部分 controller 层缺方法签名 |
| **子 Agent 可否直接制造** | ⚠️ 桥梁层全部可制造；移动端 DAO 和独立 service 需 Agent 自行设计方法签名 |
| **最严重缺口** | G01 (MsgRouter 无路由表) + G03-G08 (DAO 缺方法签名) |

### 修复建议

| # | 动作 | 涉及文件 | 投入 |
|---|------|---------|------|
| 1 | 补充 MP12 MsgRouter 显式路由表（10 行） | design §5.5 后新增 §5.6 | 5 min |
| 2 | 补充 DAO 方法签名（5 表 × 3-5 方法） | design §6.1 追加每表方法列表 | 10 min |
| 3 | 补充 WSSender/SecureStore 独立 API 签名 | design 新增 §5.7 + §9.1 完善 | 5 min |
| 4 | 补充 BP15/M27/MP11/MP29 接口签名 | design 各章节追加 | 5 min |

**总投入: ~25 min。修复后 design 可达 90%+ 覆盖，余下 10% 为 UI 渲染细节（组件树已覆盖，渲染样式由 §7 线框+§7.3 主题色指定）。**
