# Design：ClawdBridge Mobile — 系统详细设计

> 版本: v1.0 | 2026-05-09 | 阶段: Stage 4 (Design)
> document_class: confidential_design | depth_profile: implementation_blueprint | maturity_target: draft | confidentiality: project_confidential
> 基于: [clawdbridge-prd-tk-20260509-001-v2.md](./clawdbridge-prd-tk-20260509-001-v2.md)

---

## 1. 架构对齐

### 1.1 从 PRD 到 Design 的映射

| PRD 模块 (§6.1) | 本设计覆盖 | 关键接口 |
|----|----|----|
| Chat UI (对话气泡) | §3 移动端组件树 | `ChatScreen`, `MessageBubble`, `ApprovalCard` |
| 任务管理 (列表) | §3.2 会话列表 | `SessionListScreen`, `SessionStore` |
| 设备/设置 | §3.3 设备管理 | `DeviceScreen`, `DeviceStore` |
| State Manager (Zustand) | §4 状态机设计 | `useChatStore`, `useSessionStore`, `useDeviceStore` |
| 通信层 (WebSocket/HTTP/SQLite) | §5 协议 + §6 持久化 | `WebSocketClient`, `HttpClient`, `Database` |
| Bridge Server | §7 Bridge Server | `WSServer`, `SessionManager`, `ApprovalEngine`, `CLIDriver` |
| Claude Code CLI 驱动层 | §8 CLI 驱动 | `ClaudeProcess`, `StdinStdoutBridge` |

### 1.2 模块边界

```
┌────────────────── ClawdBridge Mobile ──────────────────┐
│                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │   Auth   │  │  Device  │  │  Session │               │
│  │  Module  │  │  Module  │  │  Module  │               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       │              │              │                     │
│  ┌────┴──────────────┴──────────────┴──────┐              │
│  │           MessageRouter                 │              │
│  │  (type → handler 分发, 重连, 去重)       │              │
│  └────────────────────┬───────────────────┘              │
│                       │                                   │
│  ┌────────────────────┴───────────────────┐              │
│  │          Persistence Layer             │              │
│  │  SQLite (离线缓存) + SecureStore (密钥) │              │
│  └────────────────────────────────────────┘              │
└──────────────────────────┬──────────────────────────────┘
                           │ WSS/HTTPS
┌──────────────────────────┴──────────────────────────────┐
│                    Bridge Server                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Auth     │ │ Device   │ │ Session  │ │ Approval │   │
│  │ Service  │ │ Manager  │ │ Manager  │ │ Engine   │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       └─────────────┴────────────┴────────────┘         │
│                         │                                 │
│  ┌──────────────────────┴──────────────────────┐        │
│  │            CLI Driver                        │        │
│  │  ClaudeProcess (spawn/监控/重启)              │        │
│  │  StdinOutBridge (stdin → CC, CC stdout → WS) │        │
│  └──────────────────────┬──────────────────────┘        │
└──────────────────────────┼──────────────────────────────┘
                           │ stdin/stdout
                    ┌──────┴──────┐
                    │ Claude Code │
                    │    CLI      │
                    └─────────────┘
```

---

## 2. 移动端组件树

```
App
├─ AuthScreen
│   ├─ LoginScreen (手机号/GitHub OAuth)
│   ├─ RegisterScreen
│   └─ OTPScreen
│
├─ MainTabNavigator
│   ├─ ChatTab
│   │   └─ SessionListScreen
│   │       ├─ SessionCard (标题/摘要/设备状态/时间)
│   │       └─ CreateSessionButton
│   │           └─ DevicePickerModal
│   │
│   ├─ TaskTab
│   │   └─ TaskDashboardScreen
│   │       ├─ TaskStatusCard (运行中/已完成)
│   │       └─ TaskGroupHeader (按项目分组)
│   │
│   └─ ProfileTab
│       ├─ UserInfoCard
│       ├─ DeviceScreen
│       │   ├─ DeviceCard (名称/系统/在线/授权目录)
│       │   └─ PairDeviceButton
│       └─ SettingsScreen
│
└─ ChatScreen (核心)
    ├─ MessageList (FlatList 虚拟化)
    │   ├─ UserBubble
    │   ├─ AIBubble (含代码块高亮)
    │   ├─ ToolCallCard (文件编辑/Shell/网络)
    │   ├─ ApprovalCard (允许/拒绝/会话始终)
    │   └─ ErrorCard (带"让AI修复"按钮)
    │
    ├─ InputBar
    │   ├─ TextInput (Markdown 快捷)
    │   ├─ VoiceButton (按住说话)
    │   └─ AttachmentButton (图片)
    │
    └─ ConnectionStatusBar (在线/离线/重连中)
```

---

## 3. 数据流与状态机

### 3.1 WebSocket 连接状态机

```
                    ┌─────────┐
          App 启动 →│  idle   │
                    └────┬────┘
                         │ connect()
                         ▼
                    ┌─────────┐
              ┌────→│connecting│────→ 失败 ──→ ┌─────────┐
              │     └────┬────┘               │ reconnecting│
              │          │ 成功               └─────┬─────┘
              │          ▼                         │ 间隔递增
              │     ┌─────────┐    断开            │ 2s→5s→15s→30s→60s
              └─────│connected │───────────────────┘
                    └────┬────┘
                         │
                    ┌────┴────┐
                    │ 各状态子图│
                    ├──────────┤
                    │ auth   │ → client_connect → 鉴权通过/失败
                    │ sync   │ → session_sync → 全量同步完成
                    │ live   │ → 实时消息收发
                    └─────────┘
```

### 3.2 消息生命周期

```
[用户输入]
    │
    ▼
生成 user_message { id, sessionId, content }
    │
    ├─ 1. 存入 SQLite (pending 状态)
    ├─ 2. 推送到 UI (乐观更新)
    └─ 3. 通过 WebSocket 发送到 Bridge
            │
            ▼ (Bridge)
    注入 Claude Code stdin
            │
            ▼ (Claude Code)
    stdout 逐 Token 产出
            │
            ▼ (Bridge)
    assistant_stream 消息
            │
            ▼ (手机)
    ├─ 1. 增量更新 UI (打字机效果)
    ├─ 2. 结束标记 → 写入 SQLite (sent 状态)
    └─ 3. 若含 error → 生成 ErrorCard
```

### 3.3 审批状态机

```
                        ┌──────────────┐
    Claude Code 请求──→ │ pending       │
                        │ (等待手机响应)  │
                        └──────┬───────┘
                               │
                    ┌──────────┼──────────┐
                    ▼                     ▼
              ┌──────────┐          ┌──────────┐
              │ approved │          │ rejected │
              └────┬─────┘          └────┬─────┘
                   │                     │
                   ▼                     ▼
            Claude Code 继续      Claude Code 中止
            (注入 "y" 到 stdin)   (注入 "n" 到 stdin)

    超时路径: pending 超过 60s → auto_rejected → 通知手机 "审批超时"
```

---

## 4. Zustand Store 设计

### 4.1 SessionStore

```typescript
interface SessionState {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  isLoading: boolean;

  // Actions
  fetchSessions: () => Promise<void>;
  createSession: (deviceId: string, title?: string) => Promise<Session>;
  archiveSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
}

interface Session {
  id: string;          // uuid
  title: string;       // 自动摘要前三轮
  deviceId: string;
  deviceName: string;
  deviceStatus: 'online' | 'offline';
  lastMessageAt: number; // timestamp
  unreadCount: number;
  pendingApprovals: number;
  messages: Message[];   // 分页加载
}
```

### 4.2 ChatStore (核心)

```typescript
interface ChatState {
  messages: Message[];
  inputValue: string;
  isStreaming: boolean;
  pendingApprovals: ApprovalRequest[];

  // Actions
  sendMessage: (content: string) => void;
  receiveStream: (delta: string) => void;
  handleApproval: (requestId: string, decision: 'approved' | 'rejected') => void;
  markToolResult: (toolCallId: string, result: ToolResult) => void;
  clearInput: () => void;
}

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'approval' | 'error' | 'system';
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed';
  metadata: {
    toolCallId?: string;
    approvalId?: string;
    codeLanguage?: string;
    filePath?: string;
  };
}
```

### 4.3 DeviceStore

```typescript
interface DeviceState {
  devices: Device[];
  isLoading: boolean;

  fetchDevices: () => Promise<void>;
  pairDevice: (deviceId: string) => Promise<void>;
  unpairDevice: (deviceId: string) => Promise<void>;
}

interface Device {
  id: string;
  name: string;
  platform: 'windows' | 'macos' | 'linux';
  status: 'online' | 'offline';
  ip: string;
  port: number;
  authorizedDirs: string[];
  lastHeartbeat: number;
}
```

---

## 5. API 接口详细定义

### 5.1 认证

```
POST /api/auth/login
  Request:  { phone: string, code: string } 或 { provider: "github", code: string }
  Response: { token: string (JWT), refreshToken: string, user: { id, name, avatar } }
  Errors:   400 (验证码错误), 401 (OAuth失败), 429 (频率限制)

POST /api/auth/refresh
  Request:  { refreshToken: string }
  Response: { token: string, refreshToken: string }
  Errors:   401 (refreshToken 过期)

POST /api/auth/oauth
  Request:  { provider: "github", redirectUri: string }
  Response: { authUrl: string } — 移动端打开浏览器到此 URL
  Callback: GET /api/auth/oauth/callback?code=xxx&state=xxx
            → 重定向到 app schema: clawdbridge://auth?token=xxx&refresh=xxx
```

### 5.2 设备

```
GET /api/devices
  Headers:  Authorization: Bearer <token>
  Response: { devices: [{ id, name, platform, status, authorizedDirs }] }

POST /api/devices/pair
  Body:     { deviceId: string }
  Response: { success: true, device: { ... } }

DELETE /api/devices/:id
  Response: { success: true }
```

### 5.3 会话

```
GET /api/sessions
  Query:    ?limit=50&offset=0
  Response: { sessions: [{ id, title, deviceId, lastMessageAt, unreadCount }], total }

POST /api/sessions
  Body:     { deviceId: string, title?: string, workDir?: string }
  Response: { session: { id, title, deviceId, createdAt } }

GET /api/sessions/:id/messages
  Query:    ?before=<timestamp>&limit=50
  Response: { messages: Message[], hasMore: boolean }
```

### 5.4 WebSocket 端点

```
连接: wss://<bridge-host>:<port>/ws?token=<jwt>&device_id=<id>

消息格式（统一信封）:
{
  "id": "uuid",
  "type": "<MessageType>",
  "sessionId": "uuid",
  "timestamp": 1703664000000,
  "seq": 1,            // 自增序号，断线重连时去重
  "payload": { ... }
}
```

### 5.5 WebSocket 消息类型完整规格

```typescript
// ── 手机 → Bridge ──

// 连接握手
type ClientConnect = {
  type: 'client_connect';
  payload: {
    deviceId: string;
    deviceName: string;
    appVersion: string;
  };
};

// 用户消息
type UserMessage = {
  type: 'user_message';
  sessionId: string;
  payload: {
    content: string;
    contentType: 'text' | 'voice' | 'image';
    replyTo?: string; // 回复某条消息
  };
};

// 审批决定
type ApprovalResponse = {
  type: 'approval_response';
  sessionId: string;
  payload: {
    requestId: string;
    decision: 'approved' | 'rejected';
    scope: 'once' | 'session'; // 本次 / 本会话始终
  };
};

// 心跳
type Ping = { type: 'ping' };

// ── Bridge → 手机 ──

// 会话同步（连接成功后首条）
type SessionSync = {
  type: 'session_sync';
  payload: {
    sessions: Session[];
    pendingApprovals: ApprovalRequest[];
    serverTime: number;
  };
};

// AI 流式响应
type AssistantStream = {
  type: 'assistant_stream';
  sessionId: string;
  payload: {
    delta: string;    // 单次 token
    done: boolean;    // 是否为最后一个 token
    messageId: string;
  };
};

// 工具调用
type ToolInvocation = {
  type: 'tool_invocation';
  sessionId: string;
  payload: {
    callId: string;
    toolName: string;        // edit_file / shell / web_search
    toolInput: Record<string, unknown>;
    filePath?: string;
    command?: string;
  };
};

// 工具结果
type ToolResult = {
  type: 'tool_result';
  sessionId: string;
  payload: {
    callId: string;
    success: boolean;
    output?: string;
    error?: string;
  };
};

// 审批请求
type ApprovalRequest = {
  type: 'approval_request';
  sessionId: string;
  payload: {
    requestId: string;
    operation: string;       // write_file / execute_shell / delete_file
    target: string;           // 文件路径或命令
    risk: 'low' | 'medium' | 'high';
    details?: string;        // 额外说明
  };
};

// 会话状态变更
type SessionState = {
  type: 'session_state';
  sessionId: string;
  payload: {
    status: 'idle' | 'running' | 'waiting_approval' | 'error';
    message?: string;
  };
};

// 错误
type BridgeError = {
  type: 'error';
  sessionId?: string;
  payload: {
    code: string;            // PROCESS_CRASH / AUTH_EXPIRED / WS_TIMEOUT
    message: string;
    recoverable: boolean;
  };
};

// 心跳
type Pong = { type: 'pong'; serverTime: number };
```

---

## 6. 持久化层 (SQLite)

### 6.1 表结构

```sql
-- 会话表
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',  -- idle/running/error
  last_message_at INTEGER NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  pending_approvals INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0    -- 0 活跃 / 1 已归档
);

CREATE INDEX idx_sessions_last_message ON sessions(last_message_at DESC);
CREATE INDEX idx_sessions_device ON sessions(device_id);

-- 消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,        -- user/assistant/tool_call/approval/error/system
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  seq INTEGER NOT NULL,      -- WebSocket seq，断线去重
  status TEXT NOT NULL DEFAULT 'sent',  -- sending/sent/failed
  metadata TEXT,             -- JSON
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_messages_session ON messages(session_id, timestamp);
CREATE INDEX idx_messages_seq ON messages(session_id, seq);

-- 审批历史表
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  target TEXT NOT NULL,
  risk TEXT NOT NULL,
  decision TEXT,             -- approved/rejected/auto_rejected
  decided_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- 设备表
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  ip TEXT,
  port INTEGER,
  authorized_dirs TEXT,      -- JSON array
  last_heartbeat INTEGER,
  paired_at INTEGER NOT NULL
);

-- 键值存储 (Token/配置)
CREATE TABLE kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 6.2 数据量预估与分页

| 表 | 预估行数 | 策略 |
|----|----|----|
| sessions | < 500 | 全量缓存 + 内存索引 |
| messages | 每会话 < 10k | 分页 50 条/次 + BEFORE 游标 |
| approvals | < 10k | 按会话分页 |
| devices | < 10 | 全量 |

---

## 7. Bridge Server 设计

### 7.1 模块职责

```
BridgeServer (Express + ws)
│
├─ AuthService
│   ├─ handleLogin(phone/code) → JWT
│   ├─ handleOAuth(provider, code) → JWT
│   ├─ verifyToken(token) → userId
│   └─ refreshToken(refresh) → new pair
│
├─ DeviceManager
│   ├─ register(pairingCode) → device record
│   ├─ listOnline() → Device[]
│   ├─ heartbeat(deviceId) → update timestamp
│   └─ unpair(deviceId) → remove
│
├─ SessionManager
│   ├─ create(deviceId, workDir) → session
│   ├─ list(filter) → Session[]
│   ├─ getMessages(sessionId, cursor) → { messages, hasMore }
│   └─ archive(sessionId) → soft delete
│
├─ WSHub (WebSocket 路由)
│   ├─ onConnect(ws, token) → authenticate + register
│   ├─ route(msg) → 按 type 分发处理器
│   ├─ broadcastToSession(sessionId, msg) → 推给所有连接
│   └─ heartbeatCheck() → 30s 超时断连
│
├─ ApprovalEngine
│   ├─ intercept(request) → 生成 approval_request
│   ├─ waitDecision(requestId, timeoutMs=60000) → Promise<decision>
│   ├─ onResponse(response) → resolve decision Promise
│   └─ history(sessionId) → Approval[]
│
└─ CLIDriver
    ├─ spawn(workDir, env) → ClaudeProcess
    ├─ write(process, input) → stdin.write
    ├─ onStdout(process, handler) → parse + stream
    ├─ onStderr(process, handler) → log + error
    ├─ onExit(process, handler) → cleanup + 通知
    └─ kill(process) → SIGTERM → SIGKILL (3s timeout)
```

### 7.2 CLIDriver 关键实现

```typescript
// 伪代码 — 各模块核心逻辑示意

class CLIDriver {
  private processes: Map<string, ChildProcess> = new Map();

  spawn(sessionId: string, workDir: string): ChildProcess {
    const proc = spawn('claude', ['--terminal'], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ANTHROPIC_API_KEY: this.apiKey }
    });

    // stdout → 逐行解析 → 转为 assistant_stream
    proc.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const msg = this.parseClaudeLine(line);
        // msg 可能为: text / tool_use / tool_result / permission_request
        if (msg) this.routeToWSHub(sessionId, msg);
      }
    });

    // stderr → 日志 + 优先传给错误处理器
    proc.stderr.on('data', (chunk) => { /* log + error */ });

    // exit → 清理进程表 + 通知手机
    proc.on('exit', (code) => {
      this.processes.delete(sessionId);
      this.wsHub.broadcastError(sessionId, `Process exited with code ${code}`);
    });

    return proc;
  }
}
```

### 7.3 审批引擎: 拦截 → 等待 → 注入

```typescript
class ApprovalEngine {
  private pending: Map<string, {
    resolve: (d: 'approved'|'rejected') => void;
    timer: NodeJS.Timeout;
  }> = new Map();

  // Bridge 拦截到 Claude Code 的 permission_request 时调用
  async intercept(request: ApprovalRequest): Promise<'approved'|'rejected'> {
    // 1. 白名单检查
    if (this.isWhitelisted(request.operation, request.target)) {
      return 'approved';
    }

    // 2. 发送 approval_request 到手机
    this.wsHub.send(request.sessionId, { type: 'approval_request', payload: request });

    // 3. 等待手机响应 (最多 60s)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve('auto_rejected'), 60000);
      this.pending.set(request.requestId, { resolve, timer });
    });
  }

  // 手机端审批决定到达
  onResponse(response: ApprovalResponse) {
    const pending = this.pending.get(response.payload.requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    pending.resolve(response.payload.decision);
    this.pending.delete(response.payload.requestId);

    // 若选择 "本会话始终"，加入白名单
    if (response.payload.decision === 'approved' && response.payload.scope === 'session') {
      this.addToWhitelist(response.sessionId, /* operation */);
    }
  }
}
```

---

## 8. 异常路径设计

### 8.1 失败路径矩阵

| 场景 | 检测 | 降级 | 恢复 |
|------|------|------|------|
| WebSocket 断连 | 30s 无 pong | 本地缓存模式 + 重连指数退避 | session_sync 全量同步 |
| Claude Code 进程崩溃 | exit code ≠ 0 | 通知手机 "进程异常" + 保留对话历史 | 手机说 "继续" → 重新 spawn + 恢复上下文 |
| 手机消息发送失败 | WebSocket send 异常 | 消息标记 failed + 本地重试队列 | 重连后按 seq 补发 |
| Bridge Server 重启 | 手机检测到连接断开 | 全部会话标记 offline | 重连后 session_sync 全量恢复 |
| Token 过期 | HTTP 401 | 自动 refresh → 重试原请求 | refresh 也失败 → 提示重新登录 |
| 审批超时 | 60s 无响应 | auto_rejected + 通知 | 手机端重发指令触发新审批 |
| SQLite 损坏 | Error on open | WAL 恢复 | 恢复失败 → 清空 + session_sync 重建 |

### 8.2 去重机制

```
消息 ID: <sessionId>-<seq>

手机端:
  发送消息时自增 seq → 存入 SQLite (status=sending)
  Bridge ACK (seq received) → 标记 sent
  重连后比对 last_ack_seq → 补发 [last_ack_seq+1 ... current]

Bridge 端:
  收到消息 → 检查 seq <= last_seen_seq → 跳过（已处理）
  正常处理 → 更新 last_seen_seq
  推送给其他连接的手机（多设备场景）
```

### 8.3 上下文恢复流程

```
1. 手机重新打开会话
   ├─ 从 SQLite 加载最后 50 条消息
   └─ 显示历史消息 + 输入框

2. 若 Bridge 在线且该会话仍有活跃进程
   ├─ 发送 resume_session 消息
   ├─ Bridge 吐出当前进程最近 stdout 缓存
   └─ 手机缝合历史 → 进入实时流模式

3. 若进程已退出
   ├─ 显示 "进程已结束，是否重新启动？"
   └─ 用户点击 → 新建 session → spawn 新进程
```

---

## 9. 日志、审计与监控

### 9.1 日志分级

| Level | 内容 | 保留 |
|-------|------|------|
| ERROR | 崩溃/连接异常/审批超时 | 30 天 |
| WARN | 重连/降级/权限拒绝 | 7 天 |
| INFO | 消息收发/会话创建/设备配对 | 3 天 |
| DEBUG | 心跳/Token 刷新 | 开发环境 |

### 9.2 审计事件

| 事件 | 字段 |
|------|------|
| `session.created` | sessionId, deviceId, workDir |
| `message.sent` | messageId, type, contentLen |
| `approval.decided` | requestId, decision, latencyMs |
| `device.paired` | deviceId, method |
| `token.refreshed` | oldExp, newExp |
| `process.crashed` | sessionId, exitCode, uptimeSecs |

### 9.3 监控指标

```
Bridge Server 内部暴露 /health 端点:
{
  "status": "ok",
  "uptime": 3600,
  "wsConnections": 2,
  "sessions": 5,
  "activeProcesses": 1,
  "pendingApprovals": 0,
  "memoryUsageMB": 45,
  "lastHeartbeat": "2026-05-09T19:30:00Z"
}
```

---

## 10. 部署拓扑

### 10.1 MVP 局域网模式

```
┌──────────┐          Wi-Fi LAN          ┌──────────┐
│  手机     │ ←──── WSS:4338 ────→       │ 桌面 PC  │
│ (Expo RN)│                             │(Bridge)  │
└──────────┘                             └────┬─────┘
                                              │ spawn
                                         ┌────┴─────┐
                                         │Claude Code│
                                         └──────────┘
```

桌面端启动:
```bash
cd ~/clawd-on-desk
node bridge-server.js --port 4338 --ssl-cert cert.pem --ssl-key key.pem
```

手机端连接：扫描二维码（含 `wss://192.168.1.x:4338` 和配对 token）

### 10.2 Phase 2 互联网模式

```
手机 ←── WSS ───→ 中继服务器 (Fly.io/Cloudflare Tunnel) ←── WSS ──→ Bridge
```

---

## 11. 安全加固清单

| # | 措施 | 实现 |
|---|------|------|
| 1 | WSS 传输加密 | 自签证书 (MVP) / Let's Encrypt (Phase 2) |
| 2 | JWT 签名 | HS256，secret 来自 Bridge Server 环境变量 |
| 3 | API Key 隔离 | 仅存 Bridge Server `.env`，不入 SQLite，不传手机 |
| 4 | 目录沙箱 | Bridge 启动时声明 `ALLOWED_DIRS`，超出拒绝 |
| 5 | 消息大小限制 | WebSocket 单帧 ≤ 1MB，拒绝超限 |
| 6 | 频率限制 | 每会话每分钟 ≤ 30 条消息 |
| 7 | 生物识别 (Phase 2) | expo-local-authentication |

---

## 12. 性能指标映射

| PRD 指标 | 设计保障 |
|---------|---------|
| 消息延迟 < 300ms | WebSocket 直连（无中间层），JSON 序列化 < 1ms |
| 审批闭环 < 2s | ApprovalEngine 内存 Map + Promise 无 DB 查询 |
| 对话列表 < 1s | SQLite 索引 + LIMIT 50 + FlatList 虚拟化 |
| 冷启动 < 3s | Expo 原生启动 + 异步加载 SQLite + 后台 WebSocket |
| 内存 < 150MB | 消息分页加载，仅缓存最近 200 条 + FlatList 视口回收 |

---

## 13. 乐高拆装 — 实现单元拆解

### 13.1 L4→L0 拆解树

```
L0 (成品): ClawdBridge Mobile + Bridge Server
│
├─ L1 (模块): [MB] Mobile App
│   ├─ L2 (组件): [MC1] 认证与设备管理
│   │   ├─ L3 (单元): [MU1a] AuthScreen → P8
│   │   ├─ L3 (单元): [MU1b] DeviceScreen + 配对 → P8
│   │   └─ L3 (单元): [MU1c] Token 管理 (SecureStore) → P8
│   ├─ L2 (组件): [MC2] 对话交互
│   │   ├─ L3 (单元): [MU2a] ChatScreen + MessageList → P9
│   │   ├─ L3 (单元): [MU2b] ApprovalCard + 交互 → P10
│   │   └─ L3 (单元): [MU2c] InputBar (文本+语音) → P9
│   ├─ L2 (组件): [MC3] 会话与任务管理
│   │   ├─ L3 (单元): [MU3a] SessionList → P11
│   │   └─ L3 (单元): [MU3b] TaskDashboard → P11
│   ├─ L2 (组件): [MC4] 通信基础设施
│   │   ├─ L3 (单元): [MU4a] WebSocketClient → P7
│   │   ├─ L3 (单元): [MU4b] MessageRouter → P7
│   │   └─ L3 (单元): [MU4c] HttpClient → P7
│   └─ L2 (组件): [MC5] 持久化
│       └─ L3 (单元): [MU5a] SQLite DB + DAO → P12
│
├─ L1 (模块): [BS] Bridge Server
│   ├─ L2 (组件): [BC1] 通信层
│   │   ├─ L3 (单元): [BU1a] WSHub (WebSocket 路由) → P1
│   │   └─ L3 (单元): [BU1b] REST API (device/session) → P5
│   ├─ L2 (组件): [BC2] 认证
│   │   └─ L3 (单元): [BU2a] AuthService + JWT → P4
│   ├─ L2 (组件): [BC3] Claude 驱动
│   │   ├─ L3 (单元): [BU3a] CLIDriver (spawn/stdin/stdout) → P2
│   │   └─ L3 (单元): [BU3b] ApprovalEngine → P3
│   └─ L2 (组件): [BC4] 设备管理
│       └─ L3 (单元): [BU4a] DeviceManager → P5
│
└─ L1 (模块): [INT] 集成联调
    ├─ L2 (组件): [IC1] 端到端消息流 → P13
    └─ L2 (组件): [IC2] 审批闭环 → P14
```

### 13.2 Agent 分配矩阵

```yaml
packets:
  - packet_id: "P1"
    lego_level: L3
    objective: "实现 Bridge Server WebSocket Hub：连接握手认证、消息 type 路由分发、心跳保活、多会话 broadcast"
    timeout_minutes: 60
    read_scope:
      - "§5.4 WebSocket 端点"
      - "§5.5 消息类型完整规格"
      - "§7.1 WSHub 模块职责"
      - "§3.1 WebSocket 连接状态机"
    write_scope:
      - "bridge-server/src/ws-hub.ts"
      - "bridge-server/src/message-router.ts"
    dependencies: []
    acceptance:
      - "WebSocket 连接握手成功，返回 session_sync"
      - "10 种消息类型正确路由到 handler"
      - "30s 心跳 pong 超时断开"
    verification:
      - "node bridge-server/test/ws-hub.test.ts"
      - "wscat -c wss://localhost:4338/ws 发 ping → 收 pong"
    rollback: "git revert <commit>"

  - packet_id: "P2"
    lego_level: L3
    objective: "实现 CLIDriver：spawn Claude Code 子进程，接管 stdin/stdout/stderr，stdout 逐行解析后转为 assistant_stream，进程 exit 后清理并通知"
    timeout_minutes: 90
    read_scope:
      - "§7.2 CLIDriver 关键实现伪代码"
      - "§3.2 消息生命周期"
      - "§8.1 进程崩溃恢复"
    write_scope:
      - "bridge-server/src/cli-driver.ts"
      - "bridge-server/src/claude-parser.ts"
    dependencies: ["P1"]
    acceptance:
      - "spawn('claude', ['--terminal']) 成功返回 ChildProcess"
      - "stdout 逐行解析为 JSON 消息并路由至 WSHub"
      - "进程 exit code ≠ 0 → 广播 BridgeError"
      - "kill() 先 SIGTERM 后 SIGKILL (3s)"
    verification:
      - "node bridge-server/test/cli-driver.test.ts (mock Claude stdin/stdout)"
    rollback: "git revert <commit>"

  - packet_id: "P3"
    lego_level: L3
    objective: "实现 ApprovalEngine：拦截 permission_request → 生成 approval_request 推送手机 → 60s 内等待手机决定 → 注入决定回 Claude Code；支持白名单（会话范围内始终允许）"
    timeout_minutes: 60
    read_scope:
      - "§7.3 ApprovalEngine 伪代码"
      - "§6.3.2 审批流转"
      - "§3.3 审批状态机"
      - "§8.1 审批超时降级"
    write_scope:
      - "bridge-server/src/approval-engine.ts"
    dependencies: ["P1"]
    acceptance:
      - "intercept() 生成 approval_request 消息"
      - "手机响应 approved → resolve Promise"
      - "60s 无响应 → auto_rejected"
      - "白名单命中 → 跳过等待，直接 approved"
    verification:
      - "node bridge-server/test/approval-engine.test.ts"
      - "模拟手机延迟 < 60s / > 60s 两场景"
    rollback: "git revert <commit>"

  - packet_id: "P4"
    lego_level: L3
    objective: "实现 AuthService：GitHub OAuth 2.0 登录 / JWT 签发 (HS256, secret 来自 env) / Token 验证中间件 / Token 刷新"
    timeout_minutes: 45
    read_scope:
      - "§5.1 认证 API 规格"
      - "§9.1 认证架构"
      - "§9.2 安全原则"
    write_scope:
      - "bridge-server/src/auth-service.ts"
      - "bridge-server/src/auth-middleware.ts"
    dependencies: ["P1"]
    acceptance:
      - "POST /api/auth/oauth → 返回 JWT + refreshToken"
      - "GET /api/devices 无 token → 401"
      - "POST /api/auth/refresh → 返回新 token pair"
    verification:
      - "node bridge-server/test/auth-service.test.ts"
      - "curl -X POST /api/auth/oauth -d '{\"provider\":\"github\",\"code\":\"test\"}' → 200 + JWT"
    rollback: "git revert <commit>"

  - packet_id: "P5"
    lego_level: L3
    objective: "实现 Bridge Server REST API：GET/POST/DELETE /api/devices + GET/POST /api/sessions + GET /api/sessions/:id/messages；所有端点带 JWT 中间件"
    timeout_minutes: 60
    read_scope:
      - "§5.2 设备 API"
      - "§5.3 会话 API"
      - "§8.1 Token 过期处理"
    write_scope:
      - "bridge-server/src/routes/devices.ts"
      - "bridge-server/src/routes/sessions.ts"
    dependencies: ["P1", "P4"]
    acceptance:
      - "GET /api/devices → 返回已配对设备列表"
      - "POST /api/devices/pair → 创建配对记录"
      - "GET /api/sessions → 返回按时间降序的会话列表"
      - "GET /api/sessions/:id/messages?before=<ts> → 分页返回"
    verification:
      - "node bridge-server/test/routes.test.ts"
    rollback: "git revert <commit>"

  - packet_id: "P6"
    lego_level: L3
    objective: "创建 React Native 项目脚手架：Expo + TypeScript + Zustand + React Navigation (Tab) + react-native-websocket；定义路由结构 (AuthStack / MainTab)"
    timeout_minutes: 30
    read_scope:
      - "§2 移动端组件树"
      - "§4 Zustand Store 设计"
      - "§6.2 技术选型"
    write_scope:
      - "mobile/App.tsx"
      - "mobile/src/navigation/"
      - "mobile/src/stores/"
      - "mobile/package.json"
      - "mobile/tsconfig.json"
    dependencies: []
    acceptance:
      - "npx expo start 启动成功"
      - "Tab 导航三页 (对话/任务/我的) 可切换"
      - "Zustand store 创建可用"
    verification:
      - "cd mobile && npx expo start"
    rollback: "git revert <commit>"

  - packet_id: "P7"
    lego_level: L3
    objective: "实现 WebSocketClient 和 MessageRouter：基于 §5.4-5.5 消息协议，封装连接/重连/消息发送/消息接收/seq 去重；MessageRouter 按 type 分发到对应 handler"
    timeout_minutes: 90
    read_scope:
      - "§5.4 WebSocket 端点"
      - "§5.5 消息类型完整规格"
      - "§3.1 连接状态机"
      - "§8.2 去重机制"
    write_scope:
      - "mobile/src/services/websocket-client.ts"
      - "mobile/src/services/message-router.ts"
    dependencies: ["P6"]
    acceptance:
      - "connect(url, token) → 握手成功"
      - "send(msg) → Bridge 收到 (log 验证)"
      - "接收 assistant_stream → 逐 token 写入 ChatStore"
      - "断线自动重连 + session_sync 恢复"
      - "seq 去重：重复 seq 跳过"
    verification:
      - "npx jest mobile/test/websocket-client.test.ts"
      - "手动：启动 Bridge + App → 发消息 → 收到流式响应"
    rollback: "git revert <commit>"

  - packet_id: "P8"
    lego_level: L2
    objective: "实现 AuthScreen（登录/注册/OAuth）+ DeviceScreen（设备列表/配对/解绑）；Auth 成功后存储 JWT 到 SecureStore"
    timeout_minutes: 60
    read_scope:
      - "§2 组件树 (AuthScreen, DeviceScreen)"
      - "§4.3 DeviceStore"
      - "§5.1 认证 API"
      - "§5.2 设备 API"
    write_scope:
      - "mobile/src/screens/auth-screen.tsx"
      - "mobile/src/screens/device-screen.tsx"
      - "mobile/src/stores/device-store.ts"
    dependencies: ["P6", "P4"]
    acceptance:
      - "GitHub OAuth 登录 → 存储 JWT → 跳转主页"
      - "设备列表显示配对设备含在线/离线状态"
      - "一键配对 → 设备列表新增"
      - "解除配对 → 设备列表移除"
    verification:
      - "npx jest mobile/test/auth-screen.test.tsx"
      - "手动：点击登录 → OAuth 跳转 → 返回 App → 主页"
    rollback: "git revert <commit>"

  - packet_id: "P9"
    lego_level: L2
    objective: "实现 ChatScreen：MessageList (FlatList 虚拟化，支持 5 种消息类型渲染) + InputBar (文本/Markdown/语音按钮)；流式响应打字机效果；§4.2 ChatStore 完整实现"
    timeout_minutes: 120
    read_scope:
      - "§2 组件树 (ChatScreen 核心)"
      - "§4.2 ChatStore 接口"
      - "§7.2 对话详情页线框"
      - "§3.2 消息生命周期"
    write_scope:
      - "mobile/src/screens/chat-screen.tsx"
      - "mobile/src/components/message-bubble.tsx"
      - "mobile/src/components/tool-call-card.tsx"
      - "mobile/src/components/error-card.tsx"
      - "mobile/src/stores/chat-store.ts"
    dependencies: ["P7"]
    acceptance:
      - "发送文本消息 → 乐观更新 UI → 收到 assistant_stream 打字机效果"
      - "代码块语法高亮 (prism-react-renderer)"
      - "工具调用卡片展示文件名/操作类型/状态"
      - "ErrorCard 含「让 AI 修复」按钮"
      - "FlatList 1000 条消息滚动不卡 (FPS ≥ 55)"
    verification:
      - "npx jest mobile/test/chat-screen.test.tsx"
      - "手动：发消息 → 看流式响应 → 查看工具调用卡片"
    rollback: "git revert <commit>"

  - packet_id: "P10"
    lego_level: L2
    objective: "实现 ApprovalCard 组件 + 审批交互：接收 approval_request 消息 → 弹出卡片 (操作类型/目标路径/风险) → 允许 (绿色) / 拒绝 (红色) / 会话始终允许 → 发送 approval_response"
    timeout_minutes: 60
    read_scope:
      - "§3.3 审批状态机"
      - "§5.5 ApprovalRequest / ApprovalResponse 消息类型"
      - "§7.2 对话详情页线框 (审批卡片 UI)"
    write_scope:
      - "mobile/src/components/approval-card.tsx"
      - "mobile/src/hooks/use-approval-handler.ts"
    dependencies: ["P7", "P3"]
    acceptance:
      - "收到 approval_request → 弹出卡片 + 振动反馈"
      - "点击允许 → 发 approval_response (decision=approved)"
      - "点击拒绝 → 发 approval_response (decision=rejected)"
      - "勾选「会话始终」→ scope=session"
      - "审批超时 (60s 无操作) → 卡片自动消失 + 显示超时提示"
    verification:
      - "npx jest mobile/test/approval-card.test.tsx"
      - "手动：Bridge 触发审批 → 手机弹出卡片 → 点允许 → Bridge log 确认"
    rollback: "git revert <commit>"

  - packet_id: "P11"
    lego_level: L2
    objective: "实现 SessionListScreen + TaskDashboardScreen：会话列表 (按时间降序/搜索/在线标识/未读角标) + 任务仪表盘 (按项目分组/状态卡片)；§4.1 SessionStore 完整实现"
    timeout_minutes: 60
    read_scope:
      - "§2 组件树 (SessionListScreen, TaskDashboardScreen)"
      - "§4.1 SessionStore"
      - "§7.2 对话列表页线框"
    write_scope:
      - "mobile/src/screens/session-list-screen.tsx"
      - "mobile/src/screens/task-dashboard-screen.tsx"
      - "mobile/src/stores/session-store.ts"
    dependencies: ["P7", "P12"]
    acceptance:
      - "会话列表按 last_message_at DESC 排列"
      - "在线设备 ● 绿色 / 离线 ○ 灰色"
      - "待审批会话显示 ⚠ + 未读数量"
      - "搜索关键词过滤"
    verification:
      - "npx jest mobile/test/session-list-screen.test.tsx"
    rollback: "git revert <commit>"

  - packet_id: "P12"
    lego_level: L2
    objective: "实现 SQLite 持久化层：5 张表 + DAO (CRUD)。消息写入 / 分页读取 / seq 去重 / WAL 模式"
    timeout_minutes: 60
    read_scope:
      - "§6.1 表结构 DDL"
      - "§6.2 数据量预估与分页策略"
      - "§8.1 SQLite 损坏恢复"
    write_scope:
      - "mobile/src/db/database.ts"
      - "mobile/src/db/session-dao.ts"
      - "mobile/src/db/message-dao.ts"
    dependencies: ["P6"]
    acceptance:
      - "5 张表创建成功"
      - "消息写入 → 查询返回正确"
      - "messages 分页 50 条/次，BEFORE 游标"
      - "WAL 模式启用"
    verification:
      - "npx jest mobile/test/db.test.ts"
    rollback: "git revert <commit>"

  - packet_id: "P13"
    lego_level: L1
    objective: "端到端集成测试：手机发消息 → Bridge 接收 → Claude Code 执行 → 响应流回手机。覆盖消息全生命周期：发送/流回/完成/工具调用/错误"
    timeout_minutes: 60
    read_scope:
      - "§3.2 消息生命周期"
      - "§8.1 失败路径矩阵"
    write_scope:
      - "bridge-server/test/e2e/"
      - "mobile/test/e2e/"
    dependencies: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12"]
    acceptance:
      - "手机发送 '创建一个 hello.ts' → Bridge spawn Claude → 文件产生"
      - "Claude 代码块在手机正确高亮"
      - "网络断开 → 重连 → session_sync → UI 恢复"
    verification:
      - "bridge-server/test/e2e/full-flow.test.ts"
      - "手动：手机 App + Bridge + 真实 Claude Code"
    rollback: "git revert <commit>"

  - packet_id: "P14"
    lego_level: L1
    objective: "审批闭环端到端测试：Bridge 拦截 permission_request → 手机弹审批卡片 → 点允许 → Claude 继续执行 / 点拒绝 → Claude 中止 / 超时 → auto_rejected"
    timeout_minutes: 45
    read_scope:
      - "§3.3 审批状态机"
      - "§7.3 ApprovalEngine"
      - "§8.1 审批超时"
    write_scope:
      - "bridge-server/test/e2e/approval-flow.test.ts"
    dependencies: ["P3", "P10"]
    acceptance:
      - "允许 → Claude stdout 继续输出"
      - "拒绝 → Claude 子进程收到 'n'"
      - "超时 60s → auto_rejected → 手机收到通知"
      - "会话始终允许 → 后续同操作不再弹审批"
    verification:
      - "mock Claude 子进程输出 permission_request → 验证全链路"
      - "手动：触发审批 → 手机操作 → 检查结果"
    rollback: "git revert <commit>"
```

### 13.3 L4 派发判定

对每个 packet 中 L4 级代码块（具体文件）应用 §4.6.5 判定：

| L4 代码块 | 预估行数 | 工具调用 | 安全敏感 | 强依赖 | 判定 |
|----------|---------|---------|---------|-------|------|
| `ws-hub.ts` | ~150 | ≥5 | 否 | P5 REST API | **子 Agent** |
| `message-router.ts` | ~80 | ≥3 | 否 | 否 | **子 Agent** |
| `cli-driver.ts` | ~120 | ≥4 | 是 (env API Key) | P1 WSHub | **子 Agent（安全）** |
| `claude-parser.ts` | ~60 | ≥3 | 否 | cli-driver | 主线程 |
| `approval-engine.ts` | ~100 | ≥3 | 是 (权限决策) | P1 WSHub | **子 Agent（安全）** |
| `auth-service.ts` | ~80 | ≥3 | 是 (JWT 签发) | 否 | **子 Agent（安全）** |
| `auth-middleware.ts` | ~40 | ≤3 | 是 (Token 验证) | auth-service | 主线程 |
| `routes/devices.ts` | ~50 | ≤3 | 否 | P1,P4 | 主线程 |
| `routes/sessions.ts` | ~50 | ≤3 | 否 | P1,P4 | 主线程 |
| `websocket-client.ts` | ~130 | ≥5 | 否 | 否 | **子 Agent** |
| `message-router.ts` (mobile) | ~70 | ≥3 | 否 | websocket-client | 主线程 |
| `chat-screen.tsx` | ~200 | ≥6 | 否 | P7,P12 | **子 Agent** |
| `message-bubble.tsx` | ~80 | ≤3 | 否 | chat-screen | 主线程 |
| `tool-call-card.tsx` | ~60 | ≤3 | 否 | chat-screen | 主线程 |
| `approval-card.tsx` | ~100 | ≥3 | 否 | P7 | **子 Agent** |
| `session-list-screen.tsx` | ~80 | ≤3 | 否 | P7,P12 | 主线程 |
| `database.ts` | ~50 | ≤3 | 否 | 否 | 主线程 |
| `session-dao.ts` | ~40 | ≤3 | 否 | database.ts | 主线程 |
| `message-dao.ts` | ~60 | ≤3 | 否 | database.ts | 主线程 |

**统计**：19 个 L4 代码块中，8 个派发子 Agent（含 3 个安全敏感），11 个主线程直接 Write/Edit。

### 13.4 拼装链与验证 (L4 → L0)

```
L4 (代码块):
  子 Agent 制造 8 个 + 主线程制造 11 个
  验证: lint (ESLint) + TypeScript 编译 (tsc --noEmit) + 单文件单元测试
  ✓ 全部通过后 ↑

L3 (单元):
  MU1a-U5a 单元拼装 → 类/服务完整可用
  验证: 单元测试 (jest --testPathPattern "test/unit/")
  关键指标: 覆盖率 ≥ 80% (安全模块 ≥ 90%)
  ✓ 全部通过后 ↑

L2 (组件):
  MC1-MC5 + BC1-BC4 组件拼装 → 可交互功能
  验证: 集成测试 (jest --testPathPattern "test/integration/")
  手动: 组件独立渲染 + 交互检查 (Expo dev client)
  ✓ 全部通过后 ↑

L1 (模块):
  MB + BS 模块拼装 → 完整 App + Server
  验证: 模块测试 (jest --testPathPattern "test/module/")
  手动: App 完整功能走查 + Server API 全端点
  ✓ 全部通过后 ↑

L0 (成品):
  MB + BS + Claude Code 端到端
  验证: E2E 测试 (test/e2e/)
  手动: 手机 App → Bridge → Claude Code 真实链路
  指标: 消息延迟 < 300ms / 审批闭环 < 2s / 消息丢失率 < 0.1%
  ✓ 全部通过后 → closeout
```

### 13.5 Agent 异常恢复

| 异常 | 检测 | 恢复动作 |
|------|------|---------|
| Agent 挂死 | 超过 timeout_minutes × 2 | 终止 → 重新派发（附原始 spec + 失败分析） → 记录 exception |
| Agent 产出不足 | Fan-In 发现 acceptance 未满足 | 标记 incomplete → 重新派发补全（附缺失项清单） |
| Agent 产出质量不合格 | 评审 Fail | 标记 failed → 修复 → 复评（最多 3 轮） |
| Agent 依赖未就绪 | 依赖 packet 未完成 | 放入等待队列 → 依赖完成后重新派发 |
| 多 Agent 输出冲突 | 多个产出修改同一文件 | 标记冲突 → 主线程手动裁决 → 记录 resolution |
| Agent 崩溃 | Agent tool 返回错误或 session 断开 | 记录崩溃点 → 重新派发（附原始 spec + 已完成 work product） |
| 主线程上下文过期 | compaction 后无法恢复拼装链 | 从 checkpoint 恢复 → 重建拼装链 → 验证已拼装层级 |
| 同类问题 3 轮未解决 | same_class_streak ≥ 3 | 重新分配 Agent + 上下文复盘 → 标记 blocked 报告用户 |
