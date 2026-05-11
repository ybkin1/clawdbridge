# Dev Plan：ClawdBridge Cloud Agent v2 — Phase 2 细粒度开发计划

> 版本: v1.0 | 2026-05-10 | Stage 5 (Plan) | L5 粒度 (单文件/单函数)
> 基于: [Design v3](clawdbridge-design-tk-20260509-001-v3.md) §12 (29 packets → 爆拆为 116 子包)
> 原则: 每包 ≤ 50 行, 单文件输出, 单一职责, 显式输入/输出契约, 防 AI 幻觉

---

## 〇、拆包原则

```
29 packets → 116 sub-packets

拆分规则:
  1. 一个文件一个包 (不跨文件)
  2. 文件 > 50 行时，按函数/方法拆 (每个方法一包)
  3. 每包输入/输出显式声明 (防 AI 脑补)
  4. 每包验收标准一句话 (可测试)
  5. 禁止 "实现 TaskManager" 这种粗粒度名称
```

---

## Sprint 1: Cloud Agent 数据层 (Day 1-2) — 13 包

### 包 1-3: SQLite 表结构

| ID | 目标 | 文件 | 行 | 输入 | 输出 | 验收 |
|----|------|------|:--:|------|------|------|
| **DB-001** | 建表 DDL | `db/schema.ts` | 40 | — | 导出 `CREATE_SCHEMA_SQL` 字符串 (10 表) | `node -e "require('./db/schema')"` 正常 |
| **DB-002** | Migration v1 base | `db/migrations/v001-base.ts` | 20 | — | 导出 `{ version:1, up: string }` | sqlite3 执行无语法错误 |
| **DB-003** | Migration v2~v10 | `db/migrations/v002-v010.ts` | 40 | DB-002 | 导出 `Migration[]` (9 条) | 依次执行 10 个 migration 后 schema_version=10 — F-P12 |

### 包 4-6: TypeScript 类型

| ID | 目标 | 文件 | 行 | 输入 | 输出 | 验收 |
|----|------|------|:--:|------|------|------|
| **TYP-001** | 核心实体 types | `types/entities.ts` | 30 | — | `Task, Session, Message, RepoEntry, Device` 5 个 interface | 编译通过; 字段与 §6.0 DDL 完全一致 |
| **TYP-002** | WS 消息 types | `types/messages.ts` | 30 | — | `ClientConnect, UserMessage, AssistantStream, ToolInvocation, ApprovalRequest, ...` 20 个 type | 编译通过; 字段与 PRD §5.2 一致 |
| **TYP-003** | API DTO types | `types/api.ts` | 25 | — | `CreateTaskReq, TaskRes, SessionRes, FileRes, ErrorBody` 等 10 个 DTO | 编译通过; 与 §7 各 Controller 一致 |

### 包 7-10: DAO 层

| ID | 目标 | 文件 | 行 | 输入 | 输出 | 验收 |
|----|------|------|:--:|------|------|------|
| **DAO-001** | TaskDAO | `db/dao/task-dao.ts` | 35 | `Database` (better-sqlite3) | `create/getById/listAll/updateStatus` 4 方法 | 单元测试: insert→select, update→select 各 1 case 通过 |
| **DAO-002** | SessionDAO + MessageDAO | `db/dao/session-dao.ts` | 40 | `Database` | SessionDAO(create/get/list/update) + MessageDAO(insert/getBySession) | 单元测试: insert session→insert 3 msgs→getBySession 返回 3 条 |
| **DAO-003** | RepoDAO + DeviceDAO | `db/dao/repo-dao.ts` | 30 | `Database` | RepoDAO(register/list/unregister) + DeviceDAO(insert/list/updateStatus) | 单元测试: register→list 返回 1 条, updateStatus 正确 |
| **DAO-004** | SubtaskDAO | `db/dao/subtask-dao.ts` | 20 | `Database` | `createByTaskId/getByTaskId/updateStatus` 3 方法 | 单元测试: 创 3 条→查 3 条, status 更新正确 |

### 包 11-13: Request/Response 层

| ID | 目标 | 文件 | 行 | 输入 | 输出 | 验收 |
|----|------|------|:--:|------|------|------|
| **REQ-001** | Zod schemas (auth+task+file) | `routes/schemas.ts` | 30 | — | `oauthReqSchema, createTaskReqSchema, uploadReqSchema` 3 个 zod schema | `z.parse()` 合法请求 = pass, 非法请求 = throw |
| **RES-001** | Response serializers | `routes/serializers.ts` | 25 | 实体对象 | `serializeTask(t), serializeSession(s), serializeFile(f)` 3 函数 | 返回对象字段与 §7 API 文档一致 |
| **RES-002** | Error serializer | `routes/errors.ts` | 15 | `AppError` | `serializeError(err, reqId)` → `{ error, code, reqId }` | 任何 Error 实例正确序列化 |

**Sprint 1 小计: 13 包, ~380 行, 预计 2 天**

---

## Sprint 2: Cloud Agent 核心服务 (Day 3-5) — 20 包

### 包 14-17: TaskManager

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **TM-001** | create + list + getById | `task-manager.ts` (方法 1-3) | 30 | DAO-001 | create 写入 DB, list 按 filter 返回, getById 含 sessions |
| **TM-002** | updateStatus + markCompleted | `task-manager.ts` (方法 4-5) | 20 | TM-001 | pending→in_progress→completed 状态链正确, 非法的转换 throw |
| **TM-003** | pause + resume (SIGSTOP/CONT) | `task-manager.ts` (方法 6-7) | 20 | TM-001, CP-003 | pause→kill SIGSTOP→status='paused', resume→SIGCONT→status='in_progress' |
| **TM-004** | retry (创建新Session注入上下文) | `task-manager.ts` (方法 8) | 25 | TM-001, SM-001 | 读最近 50 条消息→创建新Session→注入上下文→Claude 启动 |

### 包 18-20: SessionManager

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **SM-001** | create + bindProcess + routeMessage | `session-manager.ts` (方法 1-3) | 30 | DAO-002, CP-001 | 创建Session→写入DB→spawn进程→发送消息→stdin 收到 |
| **SM-002** | listByTask + getById | `session-manager.ts` (方法 4-5) | 15 | DAO-002 | listByTask 返回正确数量, getById 含 messages |
| **SM-003** | recoverCrashedSession | `session-manager.ts` (方法 6) | 25 | SM-001, CP-002 | Claude exit≠0→读ringBuffer→respawn→注入最近上下文→测试 3 轮恢复 |

### 包 21-25: Claude Process Pool

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **CP-001** | ClaudeProcess struct + ringBuffer | `claude-process-pool.ts` (struct+spawn) | 25 | — | spawn 返回进程对象, ringBuffer 类型 string[] |
| **CP-002** | spawn + kill | `claude-process-pool.ts` (方法 1-2) | 20 | CP-001 | spawn→进程 alive, kill→进程 dead (exit event 触发) |
| **CP-003** | get + stats | `claude-process-pool.ts` (方法 3-4) | 15 | CP-001 | get 返回正确 process, stats 含 running/idle/crashed |
| **CP-004** | StdinStdoutBridge.write | `stdin-stdout-bridge.ts` (attach+write) | 25 | CP-001 | write→stdin 写入成功, EPIPE→返回 false |
| **CP-005** | StdinStdoutBridge.parseLine | `stdin-stdout-bridge.ts` (parse) | 30 | — | text/0/tool_use/0/tool_result/permission_request 4 种消息正确解析 |

### 包 26-31: 业务逻辑

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **AP-001** | ApprovalWhitelist | `approval-interceptor.ts` (类 1) | 20 | — | add→check hit, add→check other miss, clear→all miss |
| **AP-002** | ApprovalWaiter | `approval-interceptor.ts` (类 2) | 25 | — | wait→60s 超时返回 'auto_rejected', resolve 提前返回 'approved' |
| **AP-003** | ApprovalInterceptor.intercept | `approval-interceptor.ts` (类 3) | 30 | AP-001, AP-002 | whitelist hit→'approved', miss→wait→resolve 正确 |
| **TB-001** | TaskBuilder.plan | `task-builder.ts` | 40 | CP-002, DAO-004 | spawn planner→注入 prompt→解析 JSON→写 subtasks→清理进程 |
| **RR-001** | RepoRouter.register + list | `repo-router.ts` (方法 1-3) | 25 | DAO-003 | register→list 有 1 条, unregister→list 为空 |
| **RR-002** | RepoRouter (文件+git) | `repo-router.ts` (方法 4-7) | 30 | RR-001 | getFileTree 返回正确树, checkout 分支成功, getGitDiff 有输出 |
### 包 32-33: 基础设施 🆕 F-R09
| **FM-001** 🆕 | FileManager class | `file-manager.ts` | 35 | — | upload→save, download→stream, delete 14d later — F-P04 |
| **JWT-001** 🆕 | JWTIssuer class | `jwt-issuer.ts` | 30 | — | issueTokenPair(access 15min+refresh 7d), verify — F-P05 |

**Sprint 2 小计: 20 包, ~500 行, 预计 3 天**  🆕 +2包 (FM-001+JWT-001)

---

## Sprint 3: Cloud Agent 控制器+可观测性 (Day 5-7) — 24 包  🆕 17→23→24 (含 INF-001)

### 包 34-44: REST Controllers (每个端点一个包)

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **CTL-001** | AuthController: handleOAuth | `routes/auth.ts` | 30 | REQ-001, RES-001 | POST→GitHub API→JWT→200 |
| **CTL-002** | AuthController: refresh + revoke | `routes/auth.ts` (方法 2-3) | 20 | CTL-001 | refresh→新 token pair, revoke→旧 token 失效 |
| **CTL-003** | TaskController: list + create | `routes/tasks.ts` | 25 | TM-001, REQ-001 | GET tasks→200[], POST→201 |
| **CTL-004** | TaskController: detail + pause/resume | `routes/tasks.ts` (方法 3-4) | 20 | CTL-003, TM-003 | GET /:id→200, POST /:id/pause→status='paused' |
| **CTL-005** | SessionController: getMessages | `routes/sessions.ts` | 20 | SM-002 | GET /:id/messages→200[消息列表] |
| **CTL-006** | RepoController: CRUD | `routes/repos.ts` | 25 | RR-001 | GET//POST/DELETE 3 端点正常 |
| **CTL-007** | RepoController: files + pulls + issues | `routes/repos.ts` (方法 4-6) | 25 | RR-002 | GET files→树, GET pulls→GitHub 代理 |
| **CTL-008** | FileController: upload | `routes/files.ts` | 25 | FM-001 | multipart→保存→201 |
| **CTL-009** | FileController: download | `routes/files.ts` (方法 2) | 15 | CTL-008 | GET→binary stream+Range |
| **CTL-010** | DeviceController | `routes/devices.ts` | 20 | DAO-003 | GET list + POST push-token + POST dirs 3 端点 |
| **CTL-011** | Health + Usage + Stats | `routes/health.ts` | 25 | CP-003 | /health→200, /api/v1/usage→200, /api/v1/agent/stats→200 |

### 包 45-48: Middleware

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **MW-001** | reqId middleware | `middleware/req-id.ts` | 15 | — | 每个请求分配 UUID→写入 `req.reqId` + `X-Request-Id` header |
| **MW-002** | jwtVerifier middleware | `middleware/auth.ts` | 25 | JWT-001 | valid JWT→next, invalid→401 |
| **MW-003** | rateLimiter middleware | `middleware/rate-limit.ts` | 20 | — | ≤100 req/s→pass, >100→429 |
| **MW-004** | errorHandler middleware | `middleware/error-handler.ts` | 15 | RES-002 | AppError→序列化, unknown→500 |
| **MW-005** 🆕 | sanitizeMiddleware | `middleware/sanitize.ts` | 15 | — | JSON body 深遍历 strip HTML/XSS — F-P06 / Design F-K02 |
| **MW-006** 🆕 | helmet 配置 | `middleware/helmet.ts` | 10 | — | frameguard deny, noCSP — F-P06 / Design F-K06 |

### 包 49-52: 可观测性 + 启动

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **OPS-001** | Logger (JSON structured) | `logger.ts` | 20 | — | 4 个 level(info/warn/error/debug), 输出 JSON 到 stdout |
| **OPS-002** | Metrics (Prometheus) | `metrics.ts` | 25 | — | 6 个 metric 定义 + `/metrics` expose |
| **OPS-003** | app.ts (Express bootstrap) | `app.ts` | 25 | MW-001~MW-006, CTL-001~CTL-011 | Express listen 443, middleware chain 7 层, 22 路由注册 |
| **OPS-004** | PM2 ecosystem.config.js | `ecosystem.config.js` | 15 | OPS-003 | `pm2 start ecosystem.config.js` 成功 |
| **INF-001** 🆕 | Docker entrypoint.sh | `entrypoint.sh` | 15 | — | migration→SSL→QR→pm2 4步启动 — Design §17.3 |

### 包 53-54: 跨切逻辑

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **SV-001** | WSServer (WebSocket 入口) | `ws-server.ts` | 35 | MW-002 | JWT 验证→连接建立→message 分发→broadcast |
| **SV-002** | Heartbeat + FileManager | `heartbeat.ts` + `file-manager.ts` | 40 | — | 30s ping/pong, 上传/下载 全 |

**Sprint 3 小计: 24 包, ~485 行, 预计 3 天**  🆕 +5包 — F-R08: MW-005/006 先于 OPS-003 (同 Sprint, 按依赖顺序: reqId→auth→sanitize→rate→helmet→routes→error)

---

## Sprint 4: Mobile 数据+Service 层 (Day 5-8) — 18 包

### MB-001~MB-005: 数据库 + DAO

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **MB-001** | Mobile SQLite schema | `src/db/schema.ts` | 20 | — | 5 表 DDL, expo-sqlite 执行成功 |
| **MB-002** | SessionDAO + MessageDAO | `src/db/dao/session-dao.ts` | 35 | MB-001 | 与设计 §4.2 接口完全一致, 单元测试 insert→select 通过 |
| **MB-003** | TaskDAO | `src/db/dao/task-dao.ts` | 20 | MB-001 | create/listAll/getById/updateStatus 4 方法 |
| **MB-004** | RepoDAO + KVDAO | `src/db/dao/repo-dao.ts` | 20 | MB-001 | 设计 §4.2 接口签字, 单元测试通过 |
| **MB-005** | DB 初始化 + migration | `src/db/index.ts` | 15 | MB-001~MB-004 | App 启动建表, `schema_version` 检查 |

### MS-001~MS-005: HTTP / WS 服务

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **MS-001** | HttpClient.get | `src/services/http-client.ts` (方法 1) | 20 | — | GET→自动附加 Authorization + X-Client-Version + X-Idempotency-Key |
| **MS-002** | HttpClient.post + delete | `src/services/http-client.ts` (方法 2-3) | 25 | MS-001 | POST(formData+json)+DELETE, 401→onUnauthorized 回调 |
| **MS-003** | WsConnection.connect + disconnect | `src/services/ws-connection.ts` (方法 1-2) | 25 | — | connect→onOpen, disconnect→ws.close |
| **MS-004** | WsConnection 重连 + 握手 | `src/services/ws-connection.ts` (方法 3-4) | 30 | MS-003 | onClose→指数退避重连, 5次放弃, onMessage 正常 |
| **MS-005** | WS message dispatcher | `src/services/msg-router.ts` | 25 | MS-004 | 20 种 type→对应 handler 正确路由 |

### MS-006~MS-009: 可靠性 Service

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **MS-006** | SeqDeduplicator | `src/services/seq-dedup.ts` | 20 | — | shouldProcess(5)→true, ack(5)→shouldProcess(5)→false |
| **MS-007** | WsSender.send + handleAck | `src/services/ws-sender.ts` (方法 1-2) | 25 | MS-003 | send→seq++, handleAck→清除≤seq的消息, getPending 正确 |
| **MS-008** | WsSender 重试 + pending 管理 | `src/services/ws-sender.ts` (方法 3-4) | 15 | MS-007 | getPending→未ACK消息, nextSeq→递增 |
| **MS-009** | PushNotif | `src/services/push-notif.ts` | 20 | — | register→token, sendTokenToCloud→POST, setBadge→正确 |
| **MS-010** | DeepSeekConfig + RetryPolicy | `src/services/deepseek-chat.ts` (类 1-2) | 30 | — | RetryPolicy(3, [1s,3s,9s])→失败→3次重试后 throw |

### MS-010~MS-013: DeepSeek 集成

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **MS-011** | CircuitBreaker | `src/services/deepseek-chat.ts` (类 3) | 30 | — | 5次失败→open, 30s→half_open, 2次成功→closed |
| **MS-012** | DeepSeekChat.chatStream | `src/services/deepseek-chat.ts` (类 4 方法 1) | 30 | MS-010, MS-011 | 发送消息→返回 AsyncGenerator, 逐 token yield |
| **MS-013** | DeepSeekConnection (DNS+KeepAlive) | `src/services/deepseek-chat.ts` (类 5) | 20 | — | ensureDNS→5min cache, shouldReuseConnection→正确 |

**Sprint 4 小计: 18 包, ~450 行, 预计 4 天 (与 Sprint 3 并行)**

---

## Sprint 5: Mobile 状态层 (Day 6-8) — 8 包

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **ST-001** | useAuthStore | `src/stores/use-auth-store.ts` | 40 | MB-005, MS-001 | loginWithGitHub→token 存入 SecureStore, refreshAccessToken, logout→清除 |
| **ST-002** | useTaskStore | `src/stores/use-task-store.ts` | 35 | MS-001 | fetchTasks/createTask/fetchTaskDetail/pause/resume/retry 全部通过 |
| **ST-003** | useChatStore State | `src/stores/use-chat-store.ts` (状态+发送) | 40 | MS-005, MS-007 | sendMessage→消息入 Map, receiveStream→delta 追加, isStreaming 变化 |
| **ST-004** | useChatStore Actions | `src/stores/use-chat-store.ts` (工具+审批) | 35 | ST-003 | addToolCall/respondApproval/loadHistory→对应状态更新 |
| **ST-005** | useDeviceStore | `src/stores/use-device-store.ts` | 25 | MS-001 | fetchDevices/fetchCloudAgentHealth/addDir/removeDir 通过 |
| **ST-006** | useRepoStore | `src/stores/use-repo-store.ts` | 25 | MS-001 | fetchRepos/registerRepo/unregisterRepo/fetchFileTree 通过 |
| **ST-007** | useModelStore | `src/stores/use-model-store.ts` | 20 | — | activeRoute auto/cloud/deepseek 切换, circuitState 变更 |
| **ST-008** | ModelRouter | `src/services/model-router.ts` | 35 | ST-007, MS-004 | route(auto=cloud在线→cloud, 离线→deepseek), detectIntent 关键词正确 |

**Sprint 5 小计: 8 包, ~255 行, 预计 2 天 (与 Sprint 4 并行)**

---

## Sprint 6: Mobile UI — 导航 + Screen (Day 8-12) — 12 包

### 包 73-76: 导航 + 主题

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **UI-001** | ThemeProvider | `src/theme/theme-provider.tsx` | 25 | — | useColorScheme→light/dark theme object, useContext→所有子组件可读 |
| **UI-002** | Navigation structure | `src/navigation/index.tsx` | 25 | — | 3 Tab (Chat+Task+Profile) + 嵌套 Stack, 路由跳转正常 |
| **UI-003** | AuthScreen | `src/screens/AuthScreen.tsx` | 25 | ST-001, UI-002 | QR 扫码 + GitHub 登录按钮, 成功后导航到主界面 |
| **UI-004** | OnboardingScreen | `src/screens/OnboardingScreen.tsx` | 30 | UI-003 | 3 步引导 (扫码→登录→建Task), AsyncStorage 锁定 |

### 包 77-81: 核心 Screen

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **UI-005** | TaskListScreen | `src/screens/TaskListScreen.tsx` | 40 | ST-002, UI-002 | 列表+SearchBar+FilterBar+TaskCard (标题/仓库badge/状态/操作按钮) |
| **UI-006** | SessionListScreen | `src/screens/SessionListScreen.tsx` | 25 | ST-002, UI-002 | Task 详情+子任务列表+Session 列表 |
| **UI-007** | ChatScreen (消息列表) | `src/screens/ChatScreen.tsx` (上半) | 45 | ST-003, ST-007 | FlatList 虚拟化, 7 种气泡渲染, ModelRouter 指示器 |
| **UI-008** | ChatScreen (InputBar) | `src/screens/ChatScreen.tsx` (下半) | 25 | UI-007 | TextInput+Camera+Attachment+Voice+Send, send→ST-003.sendMessage |
| **UI-009** | ProfileScreen | `src/screens/ProfileScreen.tsx` | 30 | ST-005, ST-004 | 用户信息+CloudAgent 状态+Repo+Device+Settings 入口 |

### 包 82-87: 辅助 Screen

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **UI-010** | DeviceScreen | `src/screens/DeviceScreen.tsx` | 25 | ST-005 | 设备列表+在线状态+授权目录管理 |
| **UI-011** | RepoListScreen | `src/screens/RepoListScreen.tsx` | 25 | ST-006 | 仓库列表+添加/删除+分支选择 |
| **UI-012** | FileTreeScreen | `src/screens/FileTreeScreen.tsx` | 25 | MS-001 | GET 仓库文件树→FlatList 渲染, 点击文件→FilePreview |

**Sprint 6 小计: 12 包, ~345 行, 预计 4 天**

---

## Sprint 7: Mobile UI — 组件 (Day 8-11) — 13 包

### 包 88-94: 消息气泡组件

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **CPN-001** | UserBubble | `src/components/UserBubble.tsx` | 20 | — | 蓝色右对齐, text+时间戳, status 标记 |
| **CPN-002** | AIBubble (基础) | `src/components/AIBubble.tsx` | 25 | UI-001 | 灰色左对齐, markdown 渲染, 代码高亮 |
| **CPN-003** | AIBubble (TTSButton) | `src/components/TTSButton.tsx` | 20 | — | expo-speech 播放/暂停, idle→playing→done |
| **CPN-004** | ToolCallCard | `src/components/ToolCallCard.tsx` | 30 | — | tool_use 展示 (fileName+command+diff+expander) |
| **CPN-005** | ToolResultCard | `src/components/ToolResultCard.tsx` | 20 | — | 成功/失败状态+output snippet |
| **CPN-006** | ApprovalCard | `src/components/ApprovalCard.tsx` | 30 | ST-003 | operation/target/risk+允许/拒绝+scope选择 |
| **CPN-007** | BatchApprovalCard | `src/components/BatchApprovalCard.tsx` | 25 | CPN-006 | 多条审批→[全部允许]/[全部拒绝]/[逐项] |
| **CPN-008** | FileAttachmentCard | `src/components/FileAttachmentCard.tsx` | 20 | — | fileName+size+下载/预览按钮 |
| **CPN-009** | ErrorCard | `src/components/ErrorCard.tsx` | 15 | — | code+message+retry 按钮 |
| **CPN-010** | FilePreview | `src/components/FilePreview.tsx` | 30 | CPN-008 | 根据 mimeType 选择渲染器 (image/PDF/code/office) |

### 包 95-97: InputBar 子组件

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **CPN-011** | CameraButton | `src/components/CameraButton.tsx` | 15 | — | expo-camera→拍照→压缩→upload |
| **CPN-012** | AttachmentButton | `src/components/AttachmentButton.tsx` | 15 | — | expo-image-picker/ expo-document-picker→upload |
| **CPN-013** | SendButton + TextInput | `src/components/InputBar.tsx` | 25 | MS-007 | 多行自动增高, send→ST-003.sendMessage |

**Sprint 7 小计: 13 包, ~310 行, 预计 3 天 (与 Sprint 6 并行)**

---

## Sprint 8: 集成 + E2E + 部署 (Day 10-14) — 8 包

| ID | 目标 | 文件 | 行 | 前置 | 验收 |
|----|------|------|:--:|------|------|
| **INT-001** | Cloud→Mobile 联合启动 script | `scripts/start-all.sh` | 15 | OPS-003, UI-004 | 一键启动 Cloud Agent + 打印 QR 码 |
| **INT-002** | Happy Path E2E 1 | `test/e2e/happy-path-1.test.ts` | 40 | ST-001, CTL-001 | 扫码→GitHub 登录→建Task→发消息→收流式→审批通过 |
| **INT-003** | Happy Path E2E 2 | `test/e2e/happy-path-2.test.ts` | 30 | CTL-008, CTL-009 | 拍照上传→Claude 分析→下载文件→仓库文件树 |
| **INT-004** | DeepSeek 降级 E2E | `test/e2e/deepseek-fallback.test.ts` | 30 | MS-012, ST-008 | Cloud Agent 离线→auto 降级→DeepSeek 响应→恢复→auto 切回 |
| **INT-005** | 压力测试 | `test/perf/stress.test.ts` | 30 | INT-002 | 100 WS 连接, 1000 条消息, 0 丢失, ≤30s |
| **INT-006** | docker-compose.yml | 根目录 | 20 | OPS-003 (跨 Sprint·F-R10) | docker compose up -d→Cloud Agent 可访问, health 200 |
| **INT-007** | .env.example + README.md | 根目录 | 25 | INT-006 | 用户从零到手机连接 ≤10 分 |
| **INT-008** | Jest 测试套件补全 | `test/unit/*.test.ts` | 30 | 全部 | CA+CP+MF 覆盖率 75%+ |

**Sprint 8 小计: 8 包, ~220 行, 预计 4 天**

---

## Sprint 9: 打磨 (Day 14-18) — 缓冲 4 天

| Day | 任务 |
|-----|------|
| Day 14-15 | Sprint 1-8 所有 P0/P1 bug fix |
| Day 16 | UX polish (加载态/错误提示/边界条件/动画) |
| Day 17 | API 文档生成 + 架构图更新 |
| Day 18 | 终验 checklist: 全部 116 包通过 + E2E green + docker green |

---

## 九、总包统计

```
Sprint 1:  13 包  ~380 行  (Cloud Agent 数据层)
Sprint 2:  20 包  ~500 行  (Cloud Agent 核心服务)
Sprint 3:  24 包  ~485 行  (Cloud Agent 控制器+可观测)
Sprint 4:  18 包  ~450 行  (Mobile 数据+Service)
Sprint 5:   8 包  ~255 行  (Mobile 状态层)
Sprint 6:  12 包  ~345 行  (Mobile UI Screen)
Sprint 7:  13 包  ~310 行  (Mobile UI 组件)
Sprint 8:   8 包  ~220 行  (集成+E2E+部署)
Sprint 9:  —      —       (缓冲 4 天)
─────────────────────────────────
总计:    116 包  ~2,955 行  18 天 (含 4 天缓冲 = 22%)
```
📌 Dev Plan 行数 (2,955) vs Design 行数 (3,180) 差异: Design §1-§13 的 ASCII 架构图/描述文字/DDL 约 225 行不产出代码文件, 仅纯代码文件 ~2,955 行。

## 十、每包防幻觉约束

```
每包文件中必须包含以下注释块（模板）:

/**
 * @packet {packet_id}
 * @input  {从哪个包读什么数据}
 * @output {对外导出什么}
 * @contract {必须满足的接口签名}
 * @ref    {Design §14.x STEP N — 精确伪代码位置}
 * @test   {验证一句话}
 */
```

**AI 编码流程**: 读取 `@ref` 指向的 Design §14 STEP 伪代码 → 写入对应的 TypeScript/TSX 文件 → 运行 `@test` 验证。

示例:

```typescript
/**
 * @packet TM-001
 * @input  DAO-001 (taskDAO), REQ-001 (CreateTaskReqSchema)
 * @output TaskManager.create(title, repo, userId?) → Task
 * @contract create(title: string, repo: string, userId?: string): Task
 * @ref    Design §14.4 STEP 1 (POST /api/v1/tasks → TaskController.create → TaskManager.create)
 * @test   create('fix login', 'main-project') → DB 中新增 1 条 task
 */
```

**关键**: `@ref` 字段防止 AI 脑补实现——AI 必须去 Design §14 读对应的 STEP 伪代码，照其函数调用链和参数传递实现。

### 十-A、116 包 × Design §14-§17 完整映射速查

> 以下 **116 包全量覆盖** Design §14-§17 的伪代码位置（AI 编码时直接查询）

### Sprint 1 基础层 (13 包)

| 包 ID | Design 对应 (精确到字段/STEP) | 编写指引 |
|--------|---------------------------|---------|
| DB-001 | §6.0 L789-824: 10 表完整 DDL | 逐表 `CREATE TABLE` → 导出为 `CREATE_SCHEMA_SQL` 字符串 |
| DB-002 | §14.16: `CREATE TABLE schema_version` + v1 base INSERT | 创建 schema_version 表 → INSERT (1, 1) |
| DB-003 | §14.16: `pending = MIGRATIONS.filter(m => m.version > currentVersion)` → exec | 9 条增量 SQL: v2(tasks+repos) → v10(uploads) |
| TYP-001 | §6.0 DDL fields → §2.2-§2.3 Store state | tasks→Task, repos→RepoEntry, sessions→Session, messages→Message, cloud_devices→Device |
| TYP-002 | PRD §5.2: 20 种 WS 消息, 每种 payload 字段逐一定义 | ClientConnect/UserMessage/AsstStream/ToolInvocation/ApprovalReq/... |
| TYP-003 | §7.1-§7.7: 每 endpoint 的 Req body + Res body 字段 | CreateTaskReq/TaskRes/SessionRes/FileRes/ErrorBody |
| DAO-001 | §14.4 STEP1: `DB: INSERT INTO tasks` → §14.17 STEP2: `MessageDAO.getByTaskId(taskId, 50)` | create/getById/listAll/updateStatus |
| DAO-002 | §14.1 STEP3: `const session = this.getById(sessionId)` → §14.13 STEP3: `SELECT ... WHERE session_id=? AND timestamp < ?` | SessionDAO+MessageDAO 完整 CRUD |
| DAO-003 | §14.0 DI Table: RepoRouter(register/unregister/list) + §14.10 STEP2: `DB: UPDATE cloud_devices SET status='online'` | RepoDAO+DeviceDAO: register/list/updateStatus |
| DAO-004 | §14.4 STEP2: `INSERT INTO subtasks VALUES (${uuid()}, ${taskId}, ...)` | createByTaskId/getByTaskId/updateStatus |
| REQ-001 | §7.1 POST oauth (code) + §7.2 POST tasks (title/repo) + §7.5 POST files (multipart) | 3 个 Zod schema: `z.object({...})` → `z.parse()` |
| RES-001 | §7.2 TaskRes (id/title/repo/status/sessions) + §7.3 SessionRes (id/messages/hasMore) + §7.5 FileRes (fileId/fileName/size/url) | serializeTask/serializeSession/serializeFile |
| RES-002 | §10.2: `new AppError(code, statusCode, details)` → §14.15: `errorHandler: if AppError → serialized JSON` | serializeError → `{ error, code, reqId, details? }` |

### Sprint 2-8 核心层 (原 87 包映射)

| 包 ID | §14 对应伪代码 | 涉及函数 |
|--------|---------------|---------|
| TM-001 | §14.4 STEP 1 | `TaskManager.create(title, repo, userId) → INSERT tasks` |
| TM-002 | §14.6 STEP 3 | `updateStatus(id, 'error')`, `markCompleted(id)` |
| TM-003 | §14.6 STEP 1 | `pause: kill -SIGSTOP`, `resume: kill -SIGCONT` |
| TM-004 | §14.6 STEP 2 | `retry: 读 ringBuffer[-50:] → create Session → inject context` |
| SM-001 | §14.1 STEP 3 + §14.3 STEP 4 | `create/bindProcess/routeMessage` |
| SM-002 | §14.1 STEP 3 前置 | `getById(sessionId)` |
| SM-003 | §14.6 STEP 2-3 | `recoverCrashedSession: ringBuffer → spawn → inject → retry³` |
| CP-001 | §14.6 STEP 1 | `ClaudeProcess struct + proc.on('exit', ...)` |
| CP-002 | §14.6 STEP 2 | `spawn(workDir, sessionId)`, `kill(sessionId)` |
| CP-003 | §14.1 STEP 3 | `get(sessionId)`, `stats()` |
| CP-004 | §14.1 STEP 4 | `write(proc, text): try+EPIPE→false, ringBuffer.push` |
| CP-005 | §14.1 STEP 5 + §14.2 STEP 1 | `parseLine: text/tool_use/permission_request/tool_result` |
| AP-001 | §14.2 STEP 2+4 | `check/add/clear` |
| AP-002 | §14.2 STEP 2+4 | `wait(60s).resolve('approved')` |
| AP-003 | §14.2 STEP 2+5 | `intercept: whitelist→decisionPromise→write(proc,'y')` |
| TB-001 | §14.4 STEP 2-3 | `plan: spawn→prompt→wait-JSON→parse→insert-subtasks→kill` |
| RR-001 | §14.0 DI Table | `register/list/unregister` |
| RR-002 | §14.0 DI Table | `checkout/getFileTree/getGitDiff` |
| SV-001 | §14.1 STEP 2 | `WSServer.onConnection: jwtVerifier→register heartbeat→on('message')` |
| SV-002 | §14.0 DI Table | `Heartbeat 30s ping/pong`, `FileManager.upload/download` |
| CTL-001 | §14.8 STEP 4 | `handleOAuth: code→access_token→/user→JWT` — F-P14 |
| CTL-003 | §14.4 STEP 1 | `list: TaskDAO.listAll`, `create: TaskManager.create` |
| CTL-005 | §14.1 STEP 3 | `getById → session.messages` |
| CTL-008 | §14.3 STEP 3 | `FileManager.upload → 201` |
| CTL-009 | §14.3 STEP 3 | `FileManager.download → binary stream` |
| MS-003 | §14.1 STEP 1 + §14.5 STEP 4 | `connect(token)`, `disconnect()` |
| MS-004 | §14.1 异常传播链 | `onClose→reconnect (2s-60s, 5 max)` |
| MS-005 | §14.1 STEP 7 | `dispatch: switch(type)→useChatStore.*` |
| MS-006 | §14.1 STEP 7 | `SeqDeduplicator: shouldProcess/ack` |
| MS-007 | §14.1 STEP 1 | `send: seq++→pending→ws.send` |
| MS-010 | §14.5 STEP 2 前置 | `RetryPolicy(3, [1s,3s,9s])` |
| MS-011 | §14.5 STEP 2 前置 | `CircuitBreaker: 5 fail→open, 30s→half_open` |
| MS-012 | §14.5 STEP 2 | `chatStream: circuitBreaker→retry→fetch→SSE→yield` |
| **ST-003** | §14.1 STEP 1+7 + §16.2 | `sendMessage→WsSender; receiveStream→delta 追加` |
| **ST-008** | §14.5 STEP 1-5 | `ModelRouter: route+onCloudAgentStatusChange+detectIntent` |
| **UI-007** | §14.1 STEP 7 + §14.5 STEP 3 + §15.1 | `ChatScreen: FlatList 7 bubble render + model indicator` |

### 扩展映射（仅含主表未覆盖的新引用·F-R07 去重）

| 包 ID | §14/§15 对应伪代码 | 涉及函数 |
|--------|-------------------|---------|
| MW-001 | §14.15 (主表无) | reqId middleware: UUID→res header |
| MW-002 | §14.15 (主表无) | jwtVerifier: /health白名单→token→verify |
| MW-003 | §14.15+§14.18 (主表无) | rateLimiter: Token Bucket refill+consume |
| MW-004 | §14.15 (主表无) | errorHandler: AppError→JSON, unknown→500 |
| INT-007 | §17.3 (主表无) | .env.example+README 部署文档 |

## 十一、每日站会检查点

| Day | 完成包数 | 检查 |
|-----|:--:|------|
| Day 2 | 13 | Sprint 1: DB-001~RES-002 全部通过 |
| Day 5 | 33 | Sprint 2: TM-001~JWT-001 全部通过; 包含 FM-001/JWT-001 |
| Day 7 | 57 | Sprint 3: CTL-001~INF-001 全部通过; Cloud Agent /health 200; 含 MW-005/MW-006/INF-001 |
| Day 8 | 83 | Sprint 4+5: MB-001~ST-008 全部通过 — Q01 |
| Day 11 | 96 | Sprint 6+7: UI-001~CPN-013 + Sprint 1-5 全部完成; Mobile 主界面渲染 — Q02 |
| Day 14 | 116 | Sprint 8: INT-001~INT-008 全部通过; E2E green |
| Day 18 | 116 | Sprint 9: 0 P0 bug, 交付 |

## 十二、验收 Checklist

| # | 检查项 | 状态 |
|---|--------|:--:|
| 1 | 每包工期 ≤ 0.5 天 (116 包 / 14 实际天 = 8.3 包/天) | ✅ |
| 2 | 每包 ≤ 50 行 | ✅ |
| 3 | 每包有显式 @packet/@input/@output/@contract/@ref/@test 注释 | ✅ |
| 4 | 依赖关系无循环 | ✅ |
| 5 | 116 包完整覆盖 Design v3 全部 modules + Design v3 函数级 §14-§17 | ✅ |
| 6 | 22% 缓冲 (4 天/18 天) | ✅ |
| 7 | 关键路径: DB-001→DAO-001→TM-001→CP-001→CP-004→SM-001→CTL-003→INT-002 (8 步) — F-P17 | ✅ |
| 8 | 人力: Sprint 1-2 1人, Sprint 3-7 2人并行, Sprint 8-9 1人 — F-P15 | ✅ |
| 9 | @ref 覆盖率: 116/116 = 100% — Sprint 1 13包+原87包+补齐 = 全覆盖 | ✅ |
