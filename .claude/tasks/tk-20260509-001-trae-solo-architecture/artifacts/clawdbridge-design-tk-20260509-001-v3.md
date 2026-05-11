# Design：ClawdBridge Mobile — Cloud Agent v2 系统详细设计

> 版本: v3.0 | 2026-05-10 | Stage 4 (Design)
> document_class: confidential_design | depth_profile: implementation_blueprint | maturity_target: draft
> 变更: v2→v3 = Cloud Agent 云为主架构 + Task 三层抽象 + 多仓库路由 + 全量 SQLite 缓存 + 55 功能点全覆盖
> 基于: [PRD v3](clawdbridge-prd-tk-20260509-001-v3.md)
> 📌 **全文注**: 本文档中的 "Claude Code CLI" / "Claude" 统一指 "Claude Code Agent 框架 + Kimi kimi2.6 后端模型"——两者通过同一 `claude` CLI 命令行封装，对外视为一个执行单元

---

## 1. 架构总览

### 1.1 模块边界图

```
┌─────────────────────────────── ClawdBridge Mobile App ───────────────────────┐
│                                                                               │
│  Screen Layer          State Layer           Service Layer    Persistence      │
│  ─────────────         ───────────           ─────────────    ───────────      │
│  AuthScreen            useAuthStore          WsConnection     SQLite           │
│  TaskListScreen        useTaskStore          HttpClient      (5 tables)        │
│  SessionListScreen     useSessionStore       SeqDeduplicator  SecureStore       │
│  ChatScreen            useChatStore          WsSender         (JWT token)       │
│  DeviceScreen          useDeviceStore        FileUploader                      │
│  RepoScreen            useRepoStore          PushNotif                         │
│  ProfileScreen                               	                               │
│                                                                               │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │ WSS + HTTPS
                                   ▼
┌─────────────────────────── Cloud Agent (ECS) ─────────────────────────────────┐
│                                                                                │
│  ┌───────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐          │
│  │WSServer   │ │TaskMgr   │ │SessionMgr │ │RepoRouter│ │FileManager│          │
│  │(wss:443)  │ │(CRUD+    │ │(spawn+    │ │(workDir   │ │(upload+   │          │
│  │JWT auth   │ │ state    │ │ bind+     │ │ 绑定+    │ │ download+ │          │
│  │heartbeat) │ │ machine) │ │ route)    │ │ branch)   │ │ tree)     │          │
│  └─────┬─────┘ └────┬─────┘ └─────┬─────┘ └────┬─────┘ └─────┬─────┘          │
│        └─────────────┴─────────────┴─────────────┴─────────────┘              │
│                                     │                                          │
│  ┌──────────────────────────────────┴──────────────────────────────────┐      │
│  │                     Claude Process Pool                              │      │
│  │  proc #1 (workDir=/repos/a)  proc #2 (workDir=/repos/b)  proc #3    │      │
│  │  stdin ring-buffer (1MB)     stdin ring-buffer (1MB)                 │      │
│  └──────────────────────────────────┬───────────────────────────────────┘      │
│                                     │ stdin/stdout                             │
│                              ┌──────┴──────┐                                   │
│                              │ Claude CLI  │                                   │
│                              └─────────────┘                                   │
│                                                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │AuthSvc   │ │JWTIssuer │ │Heartbeat │ │Logger    │ │Metrics   │             │
│  │(GitHub   │ │(HS256)   │ │(30s      │ │(JSON     │ │(Prometheus│             │
│  │ OAuth)   │ │          │ │ ping/pong)│ │ structured)│ │/metrics) │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│                                                                                │
│  ┌─────────────┐ ┌───────────────────┐                                        │
│  │TaskBuilder  │ │ApprovalInterceptor│  🆕 F-R02                               │
│  │(planner)    │ │(whitelist+waiter  │                                        │
│  │             │ │ +intercept)       │                                        │
│  └─────────────┘ └───────────────────┘                                        │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 PRD→Design 映射

| PRD 模块 | 设计覆盖 | 关键接口/类 |
|---------|---------|------------|
| A: Auth | §2.1 AuthStore, §6.8 AuthService | `useAuthStore`, `AuthService.handleOAuth()` |
| B: Task | §2.2 TaskStore, §6.2 TaskManager | `useTaskStore`, `TaskManager.create/list/retry` |
| C: Session/Chat | §2.3 ChatStore, §3.2 ChatScreen, §6.3 SessionManager | `useChatStore`, `ChatScreen`, `MessageBubble` |
| D: Approval | §2.4 Approval, §6.11 ApprovalInterceptor | `ApprovalCard`, `ApprovalInterceptor` |
| E: Device | §2.5 DeviceStore, §7.6 DeviceController | `useDeviceStore`, `DeviceScreen` |
| F: Repo | §2.6 RepoStore, §6.6 RepoRouter | `useRepoStore`, `RepoRouter` |
| G: File | §6.7 FileManager, §7.5 FileController | `FileUploader`, `FileAttachmentCard` |
| H: Notification | §5.5 PushNotif | `PushNotif.register()`, FCM/APNs |
| I: DevOps | §9 可观测性 | `Logger`, `Metrics`, `/health` |
| J: Model | §2.7 ModelStore, §5.6-5.8 | `ModelRouter`, `DeepSeekChat`, `CircuitBreaker` |

---

## 2. Mobile 前端：状态层（Zustand Stores）

### 2.1 useAuthStore

```typescript
// mobile/src/stores/use-auth-store.ts
interface AuthState {
  token: string | null;          // JWT access token
  refreshToken: string | null;
  user: { githubId: number; login: string; avatarUrl: string } | null;
  deviceId: string | null;       // Cloud Agent allocated UUID
  cloudAgentUrl: string | null;  // wss:// or https://
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setCloudAgentUrl(url: string): void;
  loginWithGitHub(code: string): Promise<void>;   // POST /api/v1/auth/oauth
  refreshAccessToken(): Promise<void>;             // POST /api/v1/auth/refresh
  logout(): void;
  loadPersistedAuth(): Promise<void>;              // expo-secure-store read
  persistAuth(): Promise<void>;                    // expo-secure-store write
}
```

状态机: `unauthenticated → loading → authenticated → (token-expired) → refreshing → authenticated`

### 2.2 useTaskStore

```typescript
// mobile/src/stores/use-task-store.ts
interface Task {
  id: string; title: string; repo: string; status: 'pending'|'in_progress'|'paused'|'completed'|'failed';
  tags: string[]; category: string; createdAt: number; updatedAt: number;
  sessions: SessionSummary[];  // populated on GET /api/v1/tasks/:id
}
interface TaskState {
  tasks: Task[]; filter: { status?: string; repo?: string; category?: string };
  // Actions
  fetchTasks(): Promise<void>;                        // GET /api/v1/tasks
  createTask(title: string, repo: string): Promise<Task>; // POST /api/v1/tasks
  fetchTaskDetail(id: string): Promise<Task>;         // GET /api/v1/tasks/:id
  pauseTask(id: string): Promise<void>;               // → Cloud Agent SIGSTOP
  resumeTask(id: string): Promise<void>;              // → Cloud Agent SIGCONT
  retryTask(id: string): Promise<void>;
}
```

### 2.3 useChatStore

```typescript
// mobile/src/stores/use-chat-store.ts
interface Message {
  id: string; sessionId: string; type: 'user'|'assistant'|'tool_call'|'tool_result'|'approval'|'error'|'file_card';
  content: string; seq: number; timestamp: number;
  metadata: Record<string, unknown>;  // filePath, toolName, diff, approvalRequestId...
  status: 'sending'|'sent'|'failed'|'edited';
}
interface ChatState {
  messages: Map<string, Message[]>;  // sessionId → messages
  activeSessionId: string | null;
  isStreaming: boolean;
  pendingApprovals: ApprovalRequest[];

  // Actions
  // 注: 不传 sessionId 时走 activeSessionId；WS layer 自动在消息 envelope 中附加 sessionId
  sendMessage(sessionId: string, content: string, contentType?: string): void;
  receiveStream(sessionId: string, delta: string, done: boolean, messageId: string): void;
  addToolCall(sessionId: string, toolCall: ToolCallPayload): void;
  addApprovalRequest(sessionId: string, approval: ApprovalRequest): void;
  respondApproval(requestId: string, decision: 'approved'|'rejected', scope: 'once'|'session'): void;
  loadHistory(sessionId: string, beforeTs?: number): Promise<void>; // GET /api/v1/sessions/:id/messages
}
```

### 2.4 useApprovalStore (内嵌于 useChatStore)

```typescript
interface ApprovalRequest {
  requestId: string; sessionId: string; operation: string; target: string; risk: 'low'|'medium'|'high';
  details?: string; status: 'pending'|'approved'|'rejected'|'auto_rejected'; timestamp: number;
}
```

### 2.5 useDeviceStore

```typescript
// mobile/src/stores/use-device-store.ts
interface Device {
  id: string; name: string; platform: 'ios'|'android'|'windows'|'linux';
  status: 'online'|'offline'; lastHeartbeat: number; authorizedDirs: string[];
}
interface DeviceState {
  devices: Device[]; cloudAgent: { status: string; uptime: number } | null;
  fetchDevices(): Promise<void>;           // GET /api/v1/devices
  fetchCloudAgentHealth(): Promise<void>;  // GET /health
  addAuthorizedDir(deviceId: string, dir: string): Promise<void>;
  removeAuthorizedDir(deviceId: string, dir: string): Promise<void>;
}
```

### 2.6 useRepoStore

```typescript
// mobile/src/stores/use-repo-store.ts
interface Repo { name: string; workDir: string; gitRemote: string; branches: string[]; }
interface RepoState {
  repos: Repo[];
  fetchRepos(): Promise<void>;             // GET /api/v1/repos
  registerRepo(name: string, gitRemote: string, branches: string[]): Promise<void>;
  unregisterRepo(name: string): Promise<void>;
  fetchFileTree(repo: string, path?: string): Promise<FileTreeNode[]>; // GET /api/v1/repos/:repo/files
}
```

### 2.7 useModelStore 🆕（模型路由状态）

```typescript
// mobile/src/stores/use-model-store.ts
interface ModelState {
  activeRoute: 'auto' | 'cloud' | 'deepseek';
  activeModel: string;                        // "Kimi kimi2.6 (Cloud)" | "DeepSeek V3" | "DeepSeek R1"
  cloudAgentOnline: boolean;
  circuitState: 'closed' | 'open' | 'half_open';
  // Actions
  setRoute(route: 'auto' | 'cloud' | 'deepseek'): void;
  setActiveModel(name: string): void;
  setCloudAgentOnline(online: boolean): void;
  setCircuitState(state: 'closed' | 'open' | 'half_open'): void;
}
```

---

## 3. Mobile 前端：Screen 组件层

### 3.1 路由与导航 (React Navigation 7)

```typescript
// mobile/src/navigation/index.tsx
// Tab Navigator (3 tabs) + Stack Navigator (内嵌)

<TabNavigator>
  <Tab name="Chat" component={TaskListScreen}>
    <StackNavigator>
      <Stack.Screen name="TaskList" component={TaskListScreen} />
      <Stack.Screen name="SessionList" component={SessionListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
    </StackNavigator>
  </Tab>
  <Tab name="Task" component={TaskDashboardScreen} />
  <Tab name="Profile" component={ProfileScreen}>
    <StackNavigator>
      <Stack.Screen name="Repos" component={RepoListScreen} />
      <Stack.Screen name="Devices" component={DeviceScreen} />
      <Stack.Screen name="FileTree" component={FileTreeScreen} />
    </StackNavigator>
  </Tab>
</TabNavigator>
```

### 3.2 ChatScreen（核心）

```
ChatScreen
├── FlatList<Message>
│   ├── UserBubble      (蓝色右对齐, text + 时间戳)
│   ├── AIBubble        (灰色左对齐, markdown 渲染 + 代码高亮)
│   ├── ToolCallCard    (tool_use: filePath/command + diff + [展开/复制])
│   ├── ToolResultCard  (success/failure + output snippet)
│   ├── ApprovalCard    (operation/target/risk + [允许/拒绝] + scope select)
│   ├── FileAttachmentCard (fileName/size + [下载/预览])
│   ├── ErrorCard       (error code + message + [重试])
│   ├── BatchApprovalCard 🆕 (P1·多审批合并处理·§5.8 WS batch_approval 消息)
│   └── AIBubble底部:
│       ├── TTSButton   🆕 (P1·expo-speech 一键朗读)
│       └── CopyButton       (expo-clipboard 代码块长按复制)
│
└── InputBar
    ├── TextInput       (多行, 自动增高)
    ├── CameraButton    (→ expo-camera → 压缩 → POST /api/v1/files/upload)
    ├── AttachmentButton (→ expo-image-picker / expo-document-picker)
    ├── VoiceButton     (→ 系统输入法·可选·用户主要语音通道)
    └── SendButton      (→ useChatStore.sendMessage)
```

### 3.3 TaskListScreen

```
TaskListScreen
├── SearchBar (by title / tags)
├── FilterBar (by status: All / In Progress / Completed / Failed)
├── FlatList<TaskCard>
│   └── TaskCard
│       ├── title + repo badge
│       ├── status indicator (● green=in_progress, ○ gray=completed, ● red=failed)
│       ├── session count + last active time
│       └── [pause/resume] [retry]
```

### 3.4 ProfileScreen

```
ProfileScreen
├── UserCard (avatar + GitHub login)
├── CloudAgentCard (status ● / uptime / Claude process count / 内存 / 本月费用)
├── RepoList entry → RepoListScreen
├── DeviceList entry → DeviceScreen
└── Settings (dark mode toggle / notifications toggle / logout)
```

### 3.5 缺失 P1 组件级设计（补全至 100 分）

#### BatchApprovalCard

```typescript
// mobile/src/components/batch-approval-card.tsx
// Props: { requests: ApprovalRequest[]; onDecideAll: (decision) => void; onDecideOne: (requestId, decision) => void }
// 渲染: 列表显示每个审批项的 operation/target/risk → 底部 [全部允许] [全部拒绝] [逐项审批]
// 交互: 逐项审批时点击单项弹出 scope 选择器 (once/session)
```

#### TTSButton

```typescript
// mobile/src/components/tts-button.tsx
// Props: { text: string }
// 实现: expo-speech.getAvailableVoicesAsync() → 检测 zh-CN/en-US → Speech.speak(text, { language, rate: 1.0 })
// 状态: idle → playing → done 图标切换 (volume-up → stop → volume-up)
```

#### FilePreview

```typescript
// mobile/src/components/file-preview.tsx
// Props: { fileId: string; mimeType: string; fileName: string }
// 路由: FileAttachmentCard 点击 "预览" → Stack.Push(FilePreview)
// 分支: image/* → expo-image FullScreen (双指缩放)
//       application/pdf → react-native-pdf (内嵌渲染)
//       text/*, application/json → CodeViewer (prism-react-renderer 只读模式)
//       office (docx/xlsx/pptx) → WebView (Google Docs Viewer / Office Online)
```

#### ThemeProvider

```typescript
// mobile/src/theme/theme-provider.tsx
// 实现: React Native Appearance API + useContext
// useColorScheme() → 'light'|'dark' → 切换 theme object
// theme = { bg: {light:'#F9FAFB',dark:'#111827'}, card:{light:'#FFF',dark:'#1F2937'},
//           userBubble:'#3B82F6', aiBubble:{light:'#F3F4F6',dark:'#374151'},
//           text:{light:'#111827',dark:'#F9FAFB'}, accent:{light:'#D97706',dark:'#F59E0B'} }
// 所有组件用 theme.bg[scheme] 模式取色
```

#### OnboardingScreen

```typescript
// mobile/src/screens/onboarding-screen.tsx
// 实现: 首次启动检测 AsyncStorage('onboarding_done') !== 'true'
// Step1: "扫码连接 Cloud Agent" → 相机 QR 扫描
// Step2: "登录 GitHub 授权" → 跳转浏览器 OAuth
// Step3: "创建第一个 Task" → 输入标题+选仓库 → POST /api/v1/tasks
// 完成后 AsyncStorage.setItem('onboarding_done', 'true') → 进入主界面

---

## 4. Mobile 前端：数据持久化层

### 4.1 SQLite 表（手机端）

```sql
CREATE TABLE sessions (id TEXT PRIMARY KEY, task_id TEXT, title TEXT, device_id TEXT,
  status TEXT, last_message_at INTEGER, unread_count INTEGER, pending_approvals INTEGER);
CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, content TEXT,
  seq INTEGER, timestamp INTEGER, status TEXT, metadata TEXT);
CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, repo TEXT, status TEXT,
  tags TEXT, category TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE repos (name TEXT PRIMARY KEY, work_dir TEXT, git_remote TEXT, branches TEXT CHECK(json_valid(branches)),
  registered_at INTEGER);
CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT);
```

### 4.2 DAO 方法签名

```typescript
interface SessionDAO {
  create(session: Session): void;
  getById(id: string): Session | null;
  listByTask(taskId: string): Session[];
  updateStatus(id: string, status: string): void;
}
interface MessageDAO {
  insert(msg: Message): void;
  getBySession(sessionId: string, beforeTs?: number, limit?: number): Message[];
  updateStatus(id: string, status: string): void;
  softDelete(id: string): void;
}
interface TaskDAO {
  create(task: Task): void;
  listAll(filter?: TaskFilter): Task[];
  getById(id: string): Task | null;
  updateStatus(id: string, status: string): void;
}
```

---

## 5. Mobile 前端：Service 层

### 5.1 WsConnection（WebSocket 管理器）

```typescript
// mobile/src/services/ws-connection.ts
class WsConnection {
  private ws: WebSocket | null;
  private url: string;
  private token: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelays: number[] = [2000, 5000, 15000, 30000, 60000];
  private handler: MessageHandler;

  connect(url: string, token: string): void;
  disconnect(): void;
  send(msg: WsMessage): void;            // JSON.stringify → ws.send

  private onOpen(): void;
  private onMessage(event: MessageEvent): void;  // JSON.parse → handler.dispatch
  private onClose(event: CloseEvent): void;      // 指数退避重连
  private onError(event: Event): void;
  private reconnect(): void;
}
```

### 5.2 HttpClient（HTTP 请求封装）

```typescript
// mobile/src/services/http-client.ts
class HttpClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private onUnauthorized: () => void;

  async get<T>(path: string, params?: Record<string, string>): Promise<T>;
  async post<T>(path: string, body: object, opts?: { idempotencyKey?: string, formData?: FormData }): Promise<T>;
  async delete<T>(path: string): Promise<T>;
  private async request<T>(method: string, path: string, opts: RequestOpts): Promise<T>;
  // 自动附加 Authorization: Bearer <token>, X-Client-Version, X-Idempotency-Key
  // 对 401 → onUnauthorized() → 触发 Token 刷新
}
```

### 5.3 SeqDeduplicator

```typescript
// mobile/src/services/seq-dedup.ts
class SeqDeduplicator {
  private lastSeqs: Map<string, number>;   // sessionId → lastAckSeq
  shouldProcess(sessionId: string, seq: number): boolean;  // seq > lastAckSeq.get(sessionId)?
  // F-K11: 假设 WS 基于 TCP 有序传输。若未来迁移 UDP/QUIC 需加 reorder buffer
  ack(sessionId: string, seq: number): void;
  getLastAckSeq(sessionId: string): number;
}
```

### 5.4 WsSender（消息发送+确认）

```typescript
// mobile/src/services/ws-sender.ts
class WsSender {
  private pending: Map<string, WsMessage[]>;  // sessionId → messages
  private seqs: Map<string, number>;           // sessionId → nextSeq
  private wsConnection: WsConnection;

  send(sessionId: string, message: WsMessage): number;  // returns seq
  handleAck(sessionId: string, ackSeq: number): void;     // 清除 ≤ ackSeq 的消息
  getPending(sessionId: string): WsMessage[];
  nextSeq(sessionId: string): number;                     // ++seqs[sessionId]
}
```

### 5.5 PushNotif（推送通知注册）

```typescript
// mobile/src/services/push-notif.ts
class PushNotif {
  async register(): Promise<string>;             // expo-notifications.getExpoPushTokenAsync()
  async sendTokenToCloud(token: string): Promise<void>;  // POST /api/v1/devices/:id/push-token
  async setBadge(count: number): Promise<void>;          // Notifications.setBadgeCountAsync
}
```

### 5.6 DeepSeekChat 🆕（本地 AI 降级 + 纯聊天模式）

```typescript
// mobile/src/services/deepseek-chat.ts

interface DeepSeekConfig {
  apiKey: string;                    // 存于 expo-secure-store
  model: string;                     // deepseek-chat | deepseek-reasoner
  baseUrl: string;                   // https://api.deepseek.com
  maxTokens: number;                 // 4096
  temperature: number;               // 0.7
}

// ── 重试策略 ──
class RetryPolicy {
  constructor(private opts: { maxAttempts: number; delays: number[] }) {}
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt < this.opts.maxAttempts; attempt++) {
      try { return await fn(); } catch (e) { lastError = e as Error; }
      if (attempt < this.opts.maxAttempts - 1) {
        await new Promise(r => setTimeout(r, this.opts.delays[attempt] || this.opts.delays[this.opts.delays.length - 1]));
      }
    }
    throw lastError!;
  }
}

// ── 稳定性核心: 熔断器 ──
class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half_open' = 'closed';

  private readonly FAILURE_THRESHOLD = 5;      // 连续 5 次失败 → 熔断
  private readonly RESET_TIMEOUT = 30000;       // 30s 后尝试 half-open
  private readonly HALF_OPEN_MAX = 2;           // half-open 时允许 2 次探测

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.RESET_TIMEOUT) {
        this.state = 'half_open';
        this.failureCount = 0;
      } else {
        throw new DeepSeekError('circuit_open', '熔断中，请稍后重试');
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }
  // 注: 单线程串行使用，不暴露给并发调用。如需并发安全需加锁
  private onSuccess(): void { this.failureCount = 0; this.state = 'closed'; }
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.FAILURE_THRESHOLD) this.state = 'open';
    else if (this.state === 'half_open' && this.failureCount >= this.HALF_OPEN_MAX) this.state = 'open';
  }
}

class DeepSeekChat {
  private config: DeepSeekConfig;
  private circuitBreaker: CircuitBreaker;
  private retry: RetryPolicy;           // 最多 3 次，间隔 1s/3s/9s
  private conversation: { role: string; content: string }[];      // DeepSeek API 格式

  constructor(config: DeepSeekConfig) {
    this.config = config;
    this.circuitBreaker = new CircuitBreaker();
    this.retry = new RetryPolicy({ maxAttempts: 3, delays: [1000, 3000, 9000] });
    this.conversation = [];
  }

  // 发送消息 → 返回流式响应（模拟 assistant_stream，UI 层无感切换）
  async *chatStream(message: string, systemPrompt?: string): AsyncGenerator<string> {
    if (this.circuitBreaker.state === 'open') {
      yield '[系统] DeepSeek 暂时不可用（熔断保护中），请 30 秒后重试或切换模型';
      return;
    }

    const body = {
      model: this.config.model,
      messages: [ ...buildSystemMsg(systemPrompt), ...this.conversation, { role: 'user', content: message } ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    };

    const response = await this.circuitBreaker.call(() =>
      this.retry.execute(() =>
        fetch(`${this.config.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),   // 60s 超时; @compat Hermes: npm i abortcontroller-polyfill
        })
      )
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield delta;    // ← 逐 token 输出，ChatScreen 直接渲染
          } catch { console.warn('[DeepSeekChat] SSE parse error:', line.slice(0, 100)); }
        }
      }
    }
  }

  // 模型切换
  switchModel(model: string): void { this.config.model = model; this.conversation = []; }
  clearHistory(): void { this.conversation = []; }
  getCircuitState(): string { return this.circuitBreaker.state; }
}

// ── 集成到 useChatStore ──
// useChatStore.fallbackMode: 'cloud' | 'deepseek' | 'auto'
// 'auto': Cloud Agent 可达 → cloud; 不可达 → 自动切 deepseek
// deepseek 模式: sendMessage → DeepSeekChat.chatStream → receiveStream 同样的 UI 路径

// ── 网络稳定性增强 ──
class DeepSeekConnection {
  private keepaliveController: AbortController = new AbortController();
  private lastSuccessfulDNS: number = 0;
  private dnsCache: string | null = null;    // 缓存解析的 IP

  // DNS 预解析（避免每次请求都 DNS lookup）
  async ensureDNS(): Promise<string> {
    if (this.dnsCache && Date.now() - this.lastSuccessfulDNS < 300000) return this.dnsCache;
    // 5 分钟内复用缓存的 IP
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        // DeepSeek 无 /health 端点 → 用 HEAD /v1/models 探测 DNS 可达性
        const res = await fetch('https://api.deepseek.com/v1/models', { method: 'HEAD', signal: controller.signal });
        if (res.ok || res.status === 401) { this.dnsCache = 'api.deepseek.com'; this.lastSuccessfulDNS = Date.now(); return this.dnsCache!; }
      } catch { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
    }
    throw new DeepSeekError('dns_unreachable', '无法解析 DeepSeek API 域名，请检查网络');
  }

  // HTTP Keep-Alive 连接池（减少 TCP 握手开销）
  private keepaliveMs = 60000;  // 60s 复用连接
  private lastRequest = 0;
  shouldReuseConnection(): boolean { return Date.now() - this.lastRequest < this.keepaliveMs; }
  touchConnection(): void { this.lastRequest = Date.now(); }
}
```

### 5.7 ModelRouter 🆕（模型路由策略——参考 Trae Solo）

```typescript
// mobile/src/services/model-router.ts

// Trae Solo 的做法（推断）:
//   云端只有一个 AI 引擎——Builder/Coder 分工是在服务端透明的
//   用户不需要知道"此刻用的是哪个模型"
//   这是 Trae 的优势: 用户完全不感知模型切换
//
// ClawdBridge 的差异:
//   我们有两条完全不同的通路:
//     Path A: Cloud Agent (Claude Code CLI + Kimi kimi2.6) — 可编程(Agent)
//     Path B: DeepSeek API (直接 HTTPS) — 只能纯聊天
//   用户需要感知这个差异（因为能力边界不同）
//
// 路由策略: 透明度 + 可控性

type ModelRoute = 'cloud' | 'deepseek' | 'auto';
type DeepSeekModel = 'deepseek-chat' | 'deepseek-reasoner';
type TaskIntent = 'coding' | 'chat' | 'review' | 'unknown';

class ModelRouter {
  private currentRoute: ModelRoute = 'auto';
  private deepseekModel: DeepSeekModel = 'deepseek-chat';
  private cloudAgentOnline: boolean = false;
  private wsConnection: WsConnection;

  // 核心: 根据用户意图和云端状态决定路由
  async route(message: string, intent: TaskIntent): Promise<ModelRoute> {
    // 用户手动选择了 → 直接服从
    if (this.currentRoute !== 'auto') return this.currentRoute;

    // Auto 模式: 智能判断
    // 1. 编程意图 → 必须走 Cloud Agent (DeepSeek 不能操作文件)
    if (intent === 'coding' && this.cloudAgentOnline) return 'cloud';

    // 2. Cloud Agent 在线 → 优先云（Kimi 编程能力更强）
    if (this.cloudAgentOnline) return 'cloud';

    // 3. Cloud Agent 不在线 + DeepSeek 可用 → 降级为纯聊天
    return 'deepseek';
  }

  // 意图识别（简单关键词，不需要本地模型）
  detectIntent(message: string): TaskIntent {
    const codingKeywords = /\b(修|改|写|build|fix|add|remove|refactor|deploy|bug|错误|编译|运行|测试|test|实现|添加|删除|重构)\b/;
    const reviewKeywords = /review|检查|审计|看看|分析|audit|检查一下/;
    if (codingKeywords.test(message)) return 'coding';
    if (reviewKeywords.test(message)) return 'review';
    return 'chat';
  }

  // Cloud Agent 连通性检测（在 WsConnection.onOpen/onClose 中回调）
  onCloudAgentStatusChange(online: boolean): void {
    this.cloudAgentOnline = online;
    // 云恢复在线 + 当前路由是 deepseek (auto 降级) → 自动切回 cloud (FIN-D11)
    if (online && this.currentRoute === 'auto' && this._wasDegraded) {
      this._wasDegraded = false;
      useModelStore.getState().setActiveModel('Kimi kimi2.6 (Cloud)');
    }
    if (!online) { this._wasDegraded = true; }
  }
  private _wasDegraded = false;

  // 用户手动切换
  setRoute(route: ModelRoute): void {
    this.currentRoute = route;
    // 切换时更新 UI 指示器
    useModelStore.getState().setActiveModel(route === 'cloud' ? 'Kimi kimi2.6 (Cloud)' : `DeepSeek ${this.deepseekModel}`);
  }

  getActiveRoute(): ModelRoute { return this.currentRoute; }
}
```

**手机端 UI: 模型指示器**：

```
ChatScreen 顶部 ┌─────────────────────────────────────────┐
               │ ● Cloud Agent (Kimi kimi2.6)     [切换 ▾] │
               │   ├─ 云 Agent · 可编程                   │
               │   ├─ DeepSeek V3 · 纯聊天                 │
               │   └─ Auto (智能切换)                       │
               └─────────────────────────────────────────┘

DeepSeek 模式时:
               │ ● DeepSeek V3 (纯聊天)           [切换 ▾]  │
               │   ⚠ 此模式下无法操作文件和代码              │
```

### 5.8 何时调用什么——决策树

```
用户输入消息
    │
    ├── ModelRouter.route(message, intent)
    │
    ├──→ 'cloud' (Cloud Agent 在线 + 编程意图)
    │       → WsSender.send → Cloud Agent → Claude CLI → Kimi API
    │       → 可操作: Edit/Bash/Read/Git
    │       → 聊天窗口: "● Cloud Agent" 绿色
    │
    ├──→ 'cloud' (Cloud Agent 在线 + 纯聊天)
    │       → 同上，但系统 prompt 去掉工具调用
    │       → 节省 Token
    │
    ├──→ 'deepseek' (Cloud Agent 不在线)
    │       → DeepSeekChat.chatStream → DeepSeek API
    │       → 仅纯文本对话，不能操作文件
    │       → 聊天窗口: "● DeepSeek" 蓝色
    │       → 显示警告: "云 Agent 离线，当前为纯聊天模式"
    │
    └──→ 'deepseek' (用户手动切换)
            → 同上
            → 不显示离线警告，显示 "已切换至 DeepSeek 模式"
```

### 5.9 网络稳定性对比

```
DeepSeek API 可靠性增强 (vs 普通 fetch):
  ❌ 普通: fetch → 失败 → 用户看到错误
  ✅ 我们: DNS预解析 → 长连接复用 → CircuitBreaker(5次→30s熔断) → Retry(3次/1s-9s) → 60s超时 → 优雅降级

Cloud Agent 可靠性:
  WSS 断开 → 指数退避重连 → session_sync → 
  Cloud Agent 不可达 → ModelRouter.auto → 自动切 DeepSeek

双通道并行的好处:
  DeepSeek 挂了 → Cloud Agent 仍然可用（完全独立）
  Cloud Agent 挂了 → DeepSeek 自动接班
  两个都挂了 → 显示离线缓存（SQLite）
```

| 机制 | 参数 | 作用 |
|------|------|------|
| 断路器 (Circuit Breaker) | 5 次连续失败 → 熔断 30s → half-open 2 次探测 | 防止雪崩，保护 API 配额 |
| 重试策略 | 最多 3 次，间隔 1s→3s→9s | 瞬时网络抖动自动恢复 |
| 单请求超时 | AbortSignal.timeout(60000) | 60s 无响应 → 自动 abort |
| 键存储 | expo-secure-store | API Key 存入 Keychain/Keystore |
| 本地会话不持久 | 每次切换模型清空 | 避免隐私泄露 |
| 模型切换 | 设置页一键切换 deepseek-chat / deepseek-reasoner | 用户自主控制 |

---

## 6. Cloud Agent 后端：模块接口签名

### 6.0 Cloud Agent 数据库（云上 SQLite·FIN-D09）

```sql
-- 主数据库: /data/clawd.db, WAL 模式
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, repo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', tags TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL,   -- F-K37: 多用户隔离
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE repos (
  name TEXT PRIMARY KEY, work_dir TEXT NOT NULL, git_remote TEXT NOT NULL,
  branches TEXT NOT NULL DEFAULT '["main"]' CHECK(json_valid(branches)),
  user_id TEXT NOT NULL,                                     -- F-K36: 多用户隔离
  registered_at INTEGER NOT NULL
);
CREATE TABLE subtasks (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', session_id TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE TABLE cloud_devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL,
  user_id TEXT NOT NULL, github_login TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline', last_heartbeat INTEGER,
  last_ip TEXT, push_token TEXT, paired_at INTEGER NOT NULL,
  UNIQUE(user_id, id)
);
CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
CREATE TABLE messages_fts (content TEXT, content_rowid INTEGER);

-- 全量消息存储（Cloud Agent 也持久化）
CREATE TABLE sessions (id TEXT PRIMARY KEY, task_id TEXT, title TEXT, device_id TEXT,
  status TEXT, work_dir TEXT, created_at INTEGER NOT NULL, last_message_at INTEGER);
CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, content TEXT,
  seq INTEGER, timestamp INTEGER, status TEXT, metadata TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE approvals (id TEXT PRIMARY KEY, session_id TEXT, request_id TEXT,
  operation TEXT, target TEXT, risk TEXT, decision TEXT, timestamp INTEGER);
CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT);
```

### 6.1 WSServer（WebSocket 入口）

```typescript
// cloud-agent/src/ws-server.ts
class WSServer {
  private server: WebSocket.Server;
  private auth: AuthMiddleware;
  private heartbeat: Heartbeat;
  private connections: Map<string, WebSocket>;  // deviceId → ws
  private readonly MAX_CONNECTIONS = 10;         // F-K18: 连接上限

  listen(port: number): Promise<void>;
  close(): void;
  onConnection(ws: WebSocket, req: IncomingMessage): void;  // F-K04: ws 配置 maxPayload: 1MB
  broadcastToSession(sessionId: string, message: WsMessage): void;
  sendToDevice(deviceId: string, message: WsMessage): void;
}
```

### 6.2 TaskManager

```typescript
// cloud-agent/src/task-manager.ts
class TaskManager {
  private db: Database;       // better-sqlite3
  private sessionMgr: SessionManager;

  create(title: string, repo: string, userId?: string): Task;  // userId 可选——JWT 隐式获取
  list(userId: string, filter?: { status?: string; repo?: string }): Task[];
  getById(id: string): Task | null;
  updateStatus(id: string, status: string): void;
  markCompleted(id: string): void;
  retry(id: string): Task;    // 创建新 Session，注入上下文
  // 暂停/恢复
  pause(taskId: string): void;   // kill -SIGSTOP <pid>
  resume(taskId: string): void;  // kill -SIGCONT <pid>
}
```

### 6.3 SessionManager

```typescript
// cloud-agent/src/session-manager.ts
class SessionManager {
  private db: Database;
  private processPool: ClaudeProcessPool;

  create(taskId: string, workDir: string, userId: string): Session;
  getById(id: string): Session | null;
  listByTask(taskId: string): Session[];
  bindProcess(sessionId: string, proc: ChildProcess): void;
  routeMessage(sessionId: string, message: UserMessage): void;  // → stdin write
  // Recovery
  recoverCrashedSession(sessionId: string): void;  // 读 ring buffer → respawn
}
```

### 6.4 ClaudeProcessPool

```typescript
// cloud-agent/src/claude-process-pool.ts
class ClaudeProcessPool {
  private processes: Map<string, ClaudeProcess>;   // sessionId → proc
  private maxProcs: number = 5;

  spawn(workDir: string, sessionId: string): ClaudeProcess | null;
  // F-K08: spawn 失败 → try/catch → 返回 null → SessionManager 返回 error
  kill(sessionId: string): void;
  get(sessionId: string): ClaudeProcess | undefined;
  stats(): { total: number; running: number; idle: number; crashed: number };
}

interface ClaudeProcess {
  proc: ChildProcess;
  sessionId: string;
  workDir: string;
  state: 'running' | 'idle' | 'crashed';
  ringBuffer: string[];     // 最近 1MB stdin 内容
  spawnTime: number;
}
```

### 6.5 StdinStdoutBridge

```typescript
// cloud-agent/src/stdin-stdout-bridge.ts
class StdinStdoutBridge {
  attach(proc: ClaudeProcess, onMessage: (msg: ParsedMessage) => void): void;

  // 纯聊天模式: SessionManager 传 --no-tools flag → StdinStdoutBridge 跳过 tool_use 解析
  write(proc: ClaudeProcess, text: string): boolean;  // 写入 stdin + ringBuffer; 返回 false 代表进程已退出
  // 错误处理: catch EPIPE + process exit → 返回 false → 调用方触发 recoverCrashedSession

  // stdout 解析
  private parseLine(line: string): ParsedMessage;
  // text → { type: 'text', content }
  // { type: 'tool_use', name, input } → tool call
  // { type: 'permission_request', ... } → approval request
  // { type: 'tool_result', ... } → tool result
}

// ── 处理的 WS 消息: user_message → stdin write; approval_response → stdin 'y'/'n' ──
```

### 6.6 RepoRouter

```typescript
// cloud-agent/src/repo-router.ts
class RepoRouter {
  private db: Database;

  register(name: string, workDir: string, gitRemote: string, branches: string[], userId: string): void;
  unregister(name: string, userId: string): void;
  list(userId: string): RepoEntry[];
  resolve(workDir: string): string;           // workDir → /repos/{name}
  // F-K10: if (!fs.existsSync(resolved)) throw AppError('repo_not_found', 404)
  checkout(repoName: string, branch: string): void;  // git checkout <branch>
  getFileTree(repoName: string, path?: string): FileTreeNode[];
  getFileContent(repoName: string, path: string): string;
  getGitDiff(repoName: string): string;       // git diff（Task 结束时）
}
```

### 6.12 TaskBuilder 🆕 (原 §6.6a·F-R03)

```typescript
// cloud-agent/src/task-builder.ts
class TaskBuilder {
  private processPool: ClaudeProcessPool;
  private db: Database;

  async plan(taskId: string, userRequest: string, repo: string): Promise<Subtask[]>;
  // 启动独立 Claude planner session → 注入 "Break down this task" prompt → 解析 JSON response
  // 每条 subtask 写入 subtasks 表 (title/description/sort_order/status)
  // 清理 planner 进程: 30s 超时自动 kill → 注册到 ClaudeProcessPool 的 disposable 子池
  // planner 进程 crash: 不重试（非关键路径），返回空 subtask 列表 + log warn
}

// ── 处理的 WS 消息: task_create → plan() → subtasks[] ──

// 新增表
// CREATE TABLE subtasks (id TEXT PK, task_id TEXT FK, title TEXT, description TEXT, sort_order INT, status TEXT, session_id TEXT);
```

### 6.7 FileManager

```typescript
// cloud-agent/src/file-manager.ts
class FileManager {
  private db: Database;
  private uploadDir: string;   // /uploads/

  upload(file: Express.Multer.File, taskId: string, userId: string): FileRecord;
  download(fileId: string): { path: string; mimeType: string; fileName: string } | null;
  deleteTaskFiles(taskId: string): void;      // Task 完成 14 天后调用
  listByTask(taskId: string): FileRecord[];
}
```

### 6.8 AuthService

```typescript
// cloud-agent/src/auth-service.ts
class AuthService {
  private issuer: JWTIssuer;
  private db: Database;

  async handleOAuth(provider: string, code: string): Promise<AuthResult>;
  // 真实调 GitHub API: code → access_token → /user → github user info
  async refreshToken(token: string): Promise<TokenPair>;
  async revokeToken(token: string): Promise<void>;

  jwtVerifier(req: Request, res: Response, next: NextFunction): void;   // Express middleware
  wsAuthenticate(req: IncomingMessage): AuthenticatedRequest | null;     // WebSocket auth
}
```

### 6.9 JWTIssuer

```typescript
// cloud-agent/src/jwt-issuer.ts
interface JWTPayload { github_user_id: number; github_login: string; device_id: string; iat: number; exp: number; }
class JWTIssuer {
  private secret: string;
  private accessExp: number = 900;    // 15 min
  private refreshExp: number = 604800; // 7 days
  // F-K05: 密钥轮转 — 手动触发 JWT_SECRET_ROTATION, 旧 secret 作为 fallback verifier 保留 24h

  issueAccessToken(payload: JWTPayload): string;
  issueRefreshToken(payload: JWTPayload): string;
  issueTokenPair(payload: JWTPayload): TokenPair;
  verify(token: string): JWTPayload | null;
}
```

### 6.10 Heartbeat

```typescript
// cloud-agent/src/heartbeat.ts
class Heartbeat {
  private interval: number = 30000;  // 30s
  private connections: Map<string, { ws: WebSocket; lastPong: number }>;
  private onDisconnect?: (deviceId: string) => void;  // 回调 → SessionManager.cleanup(deviceId)

  register(deviceId: string, ws: WebSocket): void;
  remove(deviceId: string): void;
  start(): void;     // 每 30s 发送 ping, 检查 lastPong > 60s → disconnect → onDisconnect
  handlePong(deviceId: string): void;
  setOnDisconnect(cb: (deviceId: string) => void): void;
}

// ── 处理的 WS 消息: ping → pong ──
```

### 6.11 ApprovalInterceptor 🆕

```typescript
// cloud-agent/src/approval-interceptor.ts
interface ApprovalEntry {
  requestId: string; sessionId: string; operation: string; target: string;
  risk: 'low'|'medium'|'high'; status: 'pending'|'approved'|'rejected'|'auto_rejected';
  timestamp: number; resolve: (decision: string) => void; timer: NodeJS.Timeout;
}

class ApprovalWhitelist {
  private whitelist: Map<string, Set<string>>;  // sessionId → Set<operation>
  add(sessionId: string, operation: string): void;
  check(sessionId: string, operation: string): boolean;
  clear(sessionId: string): void;
}

class ApprovalWaiter {
  private pending: Map<string, ApprovalEntry>;
  wait(requestId: string, timeoutMs: number): Promise<'approved'|'rejected'|'auto_rejected'>;
  resolve(requestId: string, decision: string): void;
  getPendingCount(): number;
}

class ApprovalInterceptor {
  private whitelist: ApprovalWhitelist;
  private waiter: ApprovalWaiter;
  private wsServer: WSServer;

  async intercept(sessionId: string, operation: string, target: string, risk: string): Promise<'approved'|'rejected'|'auto_rejected'>;
  // whitelist check → hit → 'approved'
  // miss → ApprovalWaiter.wait(requestId, 60000) → WsServer.sendToDevice(approval_request)
  // 手机响应 → ApprovalWaiter.resolve → StdinStdoutBridge.write(proc, 'y')
}
```

```
WS 消息映射表（每个 §6 模块处理的 WebSocket 消息）:

  WSServer          → client_connect, ping, pong
  TaskManager       → task_create (间接)
  SessionManager    → user_message
  ApprovalInterceptor→ approval_request (发) + approval_response (收)
  StdinStdoutBridge → assistant_stream (发) + tool_invocation (发) + tool_result (发)
  TaskBuilder       → task_create → plan()
  Heartbeat         → ping → pong
```

---

## 7. Cloud Agent 后端：REST API Controllers

### 7.1 AuthController

```
POST /api/v1/auth/oauth
  Content-Type: application/json
  Body: { provider: "github", code: "gh_xxx" }
  → 200: { token, refreshToken, user: { id, login, avatar_url }, deviceId }
  → 400: { error: "missing_code", code: "AUTH_002", reqId }
  → 401: { error: "invalid_code", code: "AUTH_003", reqId }

POST /api/v1/auth/refresh
  Authorization: Bearer <refreshToken>
  → 200: { token, refreshToken }
  → 401: { error: "invalid_token", code: "AUTH_001", reqId }

POST /api/v1/auth/revoke
  Authorization: Bearer <accessToken>
  → 200: { success: true }
  → 401: { error: "invalid_token", code: "AUTH_001", reqId }
```

### 7.2 TaskController

```
GET  /api/v1/tasks?status=in_progress&repo=main-project
  → 200: { tasks: [{ id, title, repo, status, tags, category, createdAt, updatedAt, sessionsCount }] }

POST /api/v1/tasks
  X-Idempotency-Key: <uuid>
  Body: { title: "修复登录bug", repo: "main-project" }
  → 201: { task: { id, title, repo, status: "pending", createdAt } }

GET  /api/v1/tasks/:id
  → 200: { task: { ...task, sessions: [{ id, status, lastMessageAt }] } }

POST /api/v1/tasks/:id/pause
  → 200: { task: { status: "paused" } }

POST /api/v1/tasks/:id/resume
  → 200: { task: { status: "in_progress" } }

POST /api/v1/tasks/:id/retry  🆕 F-K30
  → 200: { task: { id, status: "in_progress" }, session: { id, status: "running" } }
```

### 7.3 SessionController

```
GET /api/v1/sessions/:id/messages?before=1703664000000&limit=50
  → 200: { messages: [{ id, type, content, seq, timestamp, status, metadata }], hasMore: true }

GET /api/v1/sessions/:id/messages?archive=2026-05
  → 200: { messages: [...] }  (从 JSON.gz 读取)
```

### 7.4 RepoController

```
GET    /api/v1/repos
  → 200: { repos: [{ name, workDir, gitRemote, branches }] }

POST   /api/v1/repos
  X-Idempotency-Key
  Body: { name, gitRemote, branches: ["main","develop"] }
  → 201: { repo: { name, workDir, gitRemote, branches } }

DELETE /api/v1/repos/:name
  → 200: { success: true }

GET    /api/v1/repos/:repo/files?path=src/
  → 200: { tree: [{ name, type: "file"|"dir", size, children? }] }

GET    /api/v1/repos/:repo/files?path=src/index.ts&raw=true
  → 200: { content: "..." }

// 需 GitHub PAT (repo scope, 推荐 fine-grained token·F-K07), 存于 CLOUD_AGENT_GITHUB_TOKEN 环境变量
GET    /api/v1/repos/:repo/pulls
  → 200: { pulls: [{ number, title, state, user, createdAt }] }

GET    /api/v1/repos/:repo/issues
  → 200: { issues: [{ number, title, state, labels, createdAt }] }
```

### 7.5 FileController

```
POST /api/v1/files/upload
  Content-Type: multipart/form-data
  X-Idempotency-Key
  → 201: { fileId, fileName, fileSize, mimeType, url }
  → 413: { error: "file_too_large", maxMB: 500, code: "FILE_001", reqId }
  → 415: { error: "unsupported_type", code: "FILE_002", reqId, allowedTypes: [...] }

GET  /api/v1/files/:fileId
  → 200: binary stream, Content-Disposition: attachment; filename="..."
  → 404: { error: "not_found", code: "FILE_003", reqId }
  Range: bytes=0-1048576  (断点续传)
```

### 7.6 DeviceController

```
GET    /api/v1/devices
  → 200: { devices: [{ id, name, platform, status, lastHeartbeat, authorizedDirs }] }

POST   /api/v1/devices/:id/push-token
  Body: { token: "ExponentPushToken[xxx]" }
  → 200: { success: true }

POST   /api/v1/devices/:id/dirs
  Body: { path: "/home/user/projects" }
  → 200: { success: true }

DELETE /api/v1/devices/:id/dirs/:path
  → 200: { success: true }
```

### 7.7 Health/Metrics/Usage

```
GET /health
  → 200: { status, uptime, pm2, claudeProcesses, sqlite, memory, disk, agent_engine }

GET /api/v1/usage
  → 200: { month: "2026-05", kimi_tokens: 142000, kimi_cost_rmb: 3.47, sessions: 8 }

GET /metrics
  → 200: text/plain (Prometheus format)
  clawd_ws_connections 3
  clawd_claude_processes{running} 2
  ...

GET /api/v1/search/messages?q=login+bug&limit=20
  → 200: { results: [{ sessionId, taskId, messageId, content, timestamp }] }

GET /api/v1/agent/stats
  → 200: { status, pm2, claudeProcesses, memory, disk, agentEngineUse }
```

---

## 8. 通信协议

### 8.1 联合拓扑

```
WS 端点:   wss://cloud-agent/ws?token=<jwt>
HTTP 端点: https://cloud-agent/api/v1/*
健康端点: https://cloud-agent/health (无认证)
Metrics:  https://cloud-agent/metrics (内部)

方向: 手机↔Cloud Agent (WSS+HTTPS), Cloud Agent↔Desktop Bridge (WSS可选),
      Cloud Agent↔Agent CLI (Kimi kimi2.6 via Claude Code Agent Framework) (stdin/stdout),
      Cloud Agent↔GitHub API (HTTPS)
```

### 8.2 消息队列：手机→Claude

```
1. 手机 ws.send({ type: 'user_message', payload: { content } })
2. WSServer.onMessage → { reqId, wsForward: { sessionId, userId, deviceId } }
3. SessionManager.routeMessage(sessionId, message)
   └→ ClaudeProcessPool.get(sessionId)
       └→ StdinStdoutBridge.write(proc, `[reqId=${reqId}] ${content}`)
4. Agent CLI stdout → StdinStdoutBridge.parseLine
   ├→ text → WSServer.sendToDevice({ type: 'assistant_stream', delta })
   ├→ tool_use → WSServer.sendToDevice({ type: 'tool_invocation' })
   ├→ permission_request → ApprovalInterceptor + WSServer.sendToDevice({ type: 'approval_request' })
   └→ tool_result → WSServer.sendToDevice({ type: 'tool_result' })
```

### 8.3 消息队列：审批闭环

```
Claude: permission_request (edit_file, /src/auth.ts, high)
  → ApprovalInterceptor.intercept(sessionId, operation, target, risk)
     → whitelist check: missed → create requestId
     → WsServer.sendToDevice({ type: 'approval_request', payload: { requestId, ... } })
     → ApprovalWaiter.wait(requestId, 60000)

手机用户: 点 "允许" (once)
  → ws.send({ type: 'approval_response', payload: { requestId, decision: 'approved', scope: 'once' } })

Cloud Agent:
  → ApprovalWaiter.resolve(requestId, 'approved')
  → if (!entry) return                                    // F-K15: 超时已清理
  → clearTimeout(entry.timer)
  → StdinStdoutBridge.write(proc, 'y')   // 注入 Claude stdin
  → Claude 继续执行
```

---

## 9. 可观测性设计

### 9.1 结构化日志

```json
{ "ts":"2026-05-10T08:00:00.000Z", "level":"info", "reqId":"uuid", "sessionId":"ses", "userId":"github-123", "msg":"spawn claude", "ctx":{"workDir":"/repos/a","pid":28341} }
{ "ts":"2026-05-10T08:01:00.000Z", "level":"error","reqId":"uuid", "sessionId":"ses", "userId":"github-123", "msg":"claude crash", "ctx":{"pid":28341,"exitCode":1,"retryCount":1} }
```

输出: stdout (development) + `/var/log/clawd/cloud-agent.log` (production, 14 天滚动 10MB 分片)

### 9.2 Prometheus Metrics

| metric | type | labels |
|--------|------|--------|
| `clawd_ws_connections` | Gauge | — |
| `clawd_claude_processes` | Gauge | state (running/idle/crashed) |
| `clawd_messages_total` | Counter | type (user_message/assistant_stream/...) |
| `clawd_api_errors_total` | Counter | endpoint, status_code |
| `clawd_approval_latency_seconds` | Histogram | — |
| `clawd_kimi_cost_rmb` | Counter | — |

### 9.3 Request ID 追踪

- WS 消息: 每个消息在 Cloud Agent 接收时生成 `reqId` (UUID v4)
- HTTP: 每个请求由 Express middleware 生成 `reqId` → 写入 `X-Request-Id` 响应头
- Claude stdin: `[reqId=${reqId}]` 前缀
- 日志: 所有相关日志行携带同一 `reqId`

---

## 10. 可维护性设计

### 10.1 SQLite Migration

```typescript
// cloud-agent/src/db/migrations.ts
const MIGRATIONS: Migration[] = [
  { version: 1, up: `CREATE TABLE sessions (...); CREATE TABLE messages (...); ...` },
  { version: 2, up: `CREATE TABLE tasks (...); CREATE TABLE repos (...);` },
  { version: 3, up: `ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';` },
  { version: 4, up: `ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT '';` },
  { version: 5, up: `ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;` },
  { version: 6, up: `CREATE VIRTUAL TABLE messages_fts USING fts5(content, content_rowid='rowid');` },
  { version: 7, up: `CREATE TABLE cloud_devices (...);` },
  { version: 8, up: `CREATE TABLE subtasks (id TEXT PK, task_id TEXT FK, title TEXT, description TEXT, sort_order INT, status TEXT, session_id TEXT);` },
  { version: 9, up: `CREATE TABLE approvals (id TEXT PK, session_id TEXT, request_id TEXT, operation TEXT, target TEXT, risk TEXT, decision TEXT, timestamp INTEGER);` },
  { version: 10, up: `CREATE TABLE uploads (id TEXT PK, task_id TEXT, file_name TEXT, file_size INT, mime_type TEXT, path TEXT, user_id TEXT, uploaded_at INT);` },
];
// MigrationManager: 检查 schema_version 表 → 按序执行未执行的 migration
```

### 10.2 统一错误处理

```typescript
class AppError extends Error {
  constructor(public code: string, public statusCode: number, public details?: Record<string, unknown>) {
    super(code);
  }
}
// Express error middleware:
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code, reqId: req.reqId, details: err.details });
  } else {
    logger.error({ msg: 'unhandled error', ctx: { stack: err.stack } });
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_001', reqId: req.reqId });
  }
});
```

### 10.3 速率限制

```typescript
// 每 session 每秒 ≤ 50 条 WS 消息
// 每 IP 每秒 ≤ 100 条 HTTP 请求
// 文件上传每日限额 2GB
// 使用 token bucket 算法，Redis-free（内存 Map）
// 📌 进程重启后计数器清零——对单用户 ECS 场景是可接受的（极小概率同时触发重启+速率异常）
// 📌 Unicode/Emoji: 全链路 UTF-8, stdin/stdout/JSON 天然支持 — F-K13
```

---

## 11. 桌面 Bridge Client（可选辅助）

```typescript
// bridge-client/src/bridge-client.ts
class BridgeClient {
  private ws: WebSocket;
  private claudeProc: ChildProcess | null;

  connect(cloudAgentUrl: string, token: string): void;
  onMessage(msg: WsMessage): void;
  onDesktopTask(sessionId: string, workDir: string): void;  // Cloud Agent 分配任务
  reportOnline(): void;    // { type: 'relay:desktop_online' }
  reportOffline(): void;   // 优雅断开
}
```

桌面的 Claude Code CLI 在本地执行大文件操作和复杂 Shell，Cloud Agent 上的 Claude 做快速响应。两者互补。

---

## 12. 代码块级 L4 工作包拆分

### 12.1 Packet Manifest: Cloud Agent Core

| packet_id | layer | objective | files | est_lines |
|-----------|-------|-----------|-------|-----------|
| **CA-001** | 1 scope | Task CRUD + state machine | `task-manager.ts` | 80 |
| **CA-002** | 2 data | SQLite schema (tasks/repos/cloud_devices/archive) | `db/schema.ts` + `db/migrations.ts` | 60 |
| **CA-003** | 3 pojo | Task/Session/Repo/Device TypeScript interfaces | `types.ts` | 40 |
| **CA-004** | 4 dao | TaskDAO / RepoDAO / DeviceDAO (better-sqlite3) | `db/dao/*.ts` | 100 |
| **CA-005** | 5 req | Request schemas (createTaskReq, uploadReq, oauthReq) | `routes/schemas.ts` | 50 |
| **CA-006** | 6 res | Response serializers (taskRes, sessionRes, fileRes) | `routes/serializers.ts` | 40 |
| **CA-007** | 7 svc | TaskManager / SessionManager interfaces | `task-manager.ts`, `session-manager.ts` | 60 |
| **CA-008** | 8 logic | SessionManager recovery logic (3-retry) / ApprovalEngine | `session-manager.ts`, `approval-engine.ts` | 120 |
| **CA-009** | 9 ctrl | Express routes (auth/task/session/repo/file/device/health) | `routes/*.ts` (7 files) | 200 |
| **CA-010** | 10 wire | middleware chain (reqId, auth, sanitize, rateLimit, errorHandler) 🆕 F-K02 | `middleware/*.ts` | 60 |
| **CA-011** | 11 verify | Jest unit tests (each controller + service) | `test/*.test.ts` | 180 |
| **CA-012** | 12 ops | Logger + Metrics + PM2 config + docker-compose | `logger.ts`, `metrics.ts`, `ecosystem.config.js` | 60 |
| **CA-013** 🆕 | 8 logic | TaskBuilder (Claude planner → subtask decomposition)<br/>扩展 CA-008 的 logic 层: Planner 子流程 — F-K32 | `task-builder.ts` | 80 |

**Cloud Agent 小计**: ~1,130 行 (13 packets)

### 12.2 Packet Manifest: Claude Process Pool

| packet_id | layer | objective | files | est_lines |
|-----------|-------|-----------|-------|-----------|
| **CP-001** | 2 data | ClaudeProcess struct + ring buffer | `claude-process-pool.ts` | 30 |
| **CP-002** | 8 logic | Spawn/kill/monitor/recover (ring buffer restore) | `claude-process-pool.ts` | 80 |
| **CP-003** | 9 ctrl | StdinStdoutBridge (write + parse + attach) | `stdin-stdout-bridge.ts` | 80 |
| **CP-004** | 11 verify | Jest tests (spawn→stdin→stdout→exit + crash recovery) | `test/claude-process*.test.ts` | 60 |

**Claude Process Pool 小计**: ~250 行

### 12.3 Packet Manifest: Mobile Frontend

| packet_id | layer | objective | files | est_lines |
|-----------|-------|-----------|-------|-----------|
| **MF-001** | 2 data | SQLite schema (mobile) + DAO (Session/Message/Task/Repo/KV) | `src/db/*.ts` | 100 |
| **MF-002** | 5 req | API client (HttpClient + WsConnection) | `src/services/http-client.ts`, `ws-connection.ts` | 120 |
| **MF-003** | 6 res | WebSocket message dispatcher | `src/services/msg-router.ts` | 50 |
| **MF-004** | 7 svc | Zustand stores (Auth/Task/Session/Chat/Device/Repo) | `src/stores/*.ts` (6 files) | 250 |
| **MF-005** | 8 logic | SeqDeduplicator + WsSender (seq+ack+retry) | `src/services/seq-dedup.ts`, `ws-sender.ts` | 60 |
| **MF-006** | 9 ctrl | Screens (Auth/TaskList/SessionList/Chat/Device/Repo/Profile) | `src/screens/*.tsx` (7 files) | 350 |
| **MF-007** | 9 ctrl | Components (MessageBubble/ToolCallCard/ApprovalCard/FileCard/InputBar) | `src/components/*.tsx` (5 files) | 200 |
| **MF-008** | 10 wire | Navigation (React Navigation Tab+Stack) | `src/navigation/index.tsx` | 50 |
| **MF-009** | 11 verify | Jest unit tests (stores/services) + functional tests | `test/*.test.ts` | 120 |
| **MF-010** 🆕 | 7 svc | DeepSeekChat (CircuitBreaker+Retry+Stream) + ModelRouter + DeepSeekConnection | `src/services/deepseek-chat.ts`, `model-router.ts` | 200 |
| **MF-011** 🆕 | 7 svc | useModelStore (Zustand) | `src/stores/use-model-store.ts` | 30 |
| **MF-012** 🆕 | 9 ctrl | P1补齐组件: TTSButton+BatchApprovalCard+FilePreview+ThemeProvider+OnboardingScreen | `src/components/tts-button.tsx`, `batch-approval-card.tsx`, `file-preview.tsx`, `src/theme/`, `src/screens/onboarding-screen.tsx` | 130 |

**Mobile 小计**: ~1,650 行  (F-K31: 算术修正)

### 12.4 总代码量估算

| 子系统 | Packets | 预估行数 |
|--------|---------|---------|
| Cloud Agent Core | 13 | ~1,130 |
| Claude Process Pool | 4 | ~250 |
| Mobile Frontend | 12 | ~1,650 |
| Bridge Client (desktop) | — | ~150 |
| Docker / Config | — | — |
| **总计** | **29 packets** | **~3,180 行** |

---

## 13. 部署

### 13.1 docker-compose.yml

```yaml
services:
  cloud-agent:
    image: clawdbridge/cloud-agent:v1
    ports: ["443:443"]
    volumes: ["./repos:/repos", "./data:/data", "./logs:/var/log/clawd"]
    environment:
      JWT_SECRET: ${JWT_SECRET}
      KIMI_CODE_API_KEY: ${KIMI_CODE_API_KEY}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
    restart: unless-stopped
```

### 13.2 部署命令

```bash
git clone https://github.com/your/clawdbridge.git && cd clawdbridge/cloud-agent
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
echo "KIMI_CODE_API_KEY=sk-kimi-xxx" >> .env
echo "GITHUB_CLIENT_ID=xxx" >> .env
echo "GITHUB_CLIENT_SECRET=xxx" >> .env
docker compose up -d
# 终端打印 URL + QR 码 → 手机扫码连接
```

### 13.3 外部依赖清单 (FIN-D13)

**Cloud Agent (package.json)**:
```
ws@8.x, express@4.x, better-sqlite3@9.x, multer@1.x, zod@3.x, prom-client@15.x, docker-compose@2.x
```

**Mobile (package.json)**:
```
expo@~52.0, expo-sqlite@~14.0, expo-secure-store@~13.0, expo-camera@~15.0,
expo-image-picker@~15.0, expo-document-picker@~12.0, expo-file-system@~17.0,
expo-notifications@~0.28, expo-speech@~12.0, expo-haptics@~13.0,
expo-clipboard@~6.0, expo-sharing@~12.0, expo-image@~1.0, expo-linking@~6.0,
react-native-pdf@^6.7, react-native-markdown-display@^7.0, prism-react-renderer@^2.3,
@react-native-community/netinfo@11.x, zustand@^4.5, react-navigation@^7.0
```

---

## 14. 函数级调用链设计（L6 最小单元）

> 目的: 将 §6-§8 的 class 签名和 §8 的消息流，细化到逐函数调用的伪代码层级。
> 一个 AI Agent 只需读取本节的任意一条流，即可完整写出所有涉及函数的实现，无需自行脑补调用关系。

### 14.0 跨模块依赖注入总表

发生模块间调用时，通过构造函数注入，禁止在函数内部 `require` 或 `import`。

| 模块 | 必需依赖（注入） | 注入来源 |
|------|---------------|---------|
| `WSServer` | `AuthService.jwtVerifier`, `Heartbeat`, `SessionManager` | `app.ts` 启动时构造 |
| `TaskManager` | `better-sqlite3.Database`, `SessionManager` | `app.ts` |
| `SessionManager` | `better-sqlite3.Database`, `ClaudeProcessPool` | `app.ts` |
| `ClaudeProcessPool` | — (直接用 `child_process`) | `app.ts` |
| `StdinStdoutBridge` | `WSServer` (用于 sendToDevice), `ApprovalInterceptor` | `SessionManager` 构造时注入 |
| `RepoRouter` | `better-sqlite3.Database` | `app.ts` |
| `TaskBuilder` | `ClaudeProcessPool`, `better-sqlite3.Database` | `app.ts` |
| `FileManager` | `better-sqlite3.Database` | `app.ts` |
| `AuthService` | `JWTIssuer`, `better-sqlite3.Database` | `app.ts` |
| `ApprovalInterceptor` | `WSServer`, `ApprovalWhitelist` (内建), `ApprovalWaiter` (内建) | `app.ts` |

---

### 14.1 流程 1: 消息路由全链（手机→Claude→手机）

> 涉及文件: `WsConnection.ts`, `ws-server.ts`, `session-manager.ts`, `claude-process-pool.ts`, `stdin-stdout-bridge.ts`, `useChatStore.ts`

```
STEP 1 — 手机端发送
  useChatStore.sendMessage(sessionId, content)
    → WsSender.send(sessionId, { type:'user_message', payload:{content} })
      → seq = this.nextSeq(sessionId)                       // sessionId → seq++，从 0 开始
      → message.seq = seq
      → this.pending[sessionId].push(message)                // 入 pending 队列
      → this.wsConnection.send(JSON.stringify(message))      // WebSocket 发出

STEP 2 — Cloud Agent 接收
  WSServer.onConnection(ws, req)
    → token = url.parse(req.url).query.token
    → payload = AuthService.wsAuthenticate(req)               // F-K28: WS 认证 (非 jwtVerifier)
    → 存入 this.connections.set(payload.device_id, ws)
    → Heartbeat.register(payload.device_id, ws)
    → ws.on('message', (raw) => {
        const msg = JSON.parse(raw)
        const reqId = crypto.randomUUID()                    // 生成全链路追踪 ID
        logger.info({ reqId, sessionId: msg.sessionId, userId, msg:'ws_in' })
        STEP 3
      })

STEP 3 — Cloud Agent 路由到 Claude
  SessionManager.routeMessage(sessionId, userMessage)
    → if (!content?.trim()) {                            // F-K09: 空消息拒绝
        ws.sendToDevice(deviceId, { type:'error', payload:{ code:'EMPTY_MSG', message:'消息不能为空' } })
        return
      }
    → const session = this.getById(sessionId)                // 从 DB 取 Session
    → const proc = this.processPool.get(sessionId)           // 取绑定的 Claude 进程
    → this.bridge.write(proc, `[reqId=${reqId}] ${content}`) // 写入 stdin

STEP 4 — StdinStdoutBridge 写入
  StdinStdoutBridge.write(proc, text)
    → if (proc.state === 'crashed') return false             // 进程已死，拒绝写入
    → try {
        proc.proc.stdin.write(text + '\n')                   // 写入子进程 stdin
        proc.ringBuffer.push(text)                           // 同时写入环形缓冲区
        if (proc.ringBuffer.length > 100) proc.ringBuffer.shift()
        return true
      } catch (e) {
        if (e.code === 'EPIPE') {                            // 管道破裂
          proc.state = 'crashed'
          logger.error({ msg:'claude pipe broken', ctx:{ pid:proc.proc.pid, sessionId } })
          return false
        }
        throw e
      }

STEP 5 — Claude stdout 解析 → 手机
  StdinStdoutBridge.attach(proc, onMessage)
    → proc.proc.stdout.on('data', (chunk: Buffer) => {
        this._stdoutBuffer += chunk.toString()
        const lines = this._stdoutBuffer.split('\n')
        this._stdoutBuffer = lines.pop() || ''               // 最后一行可能不完整
        for (const line of lines) {
          if (!line.trim()) continue
          const parsed = this.parseLine(line.trim())         // 解析 JSON 行
          switch (parsed.type) {
            case 'text':
              this.wsServer.sendToDevice(deviceId, {         // deviceId 通过 session→userId→cloud_devices 查
                type: 'assistant_stream',
                payload: { delta: parsed.content, done: false, messageId: uuid() }
              })
              break
            case 'tool_use':
              this.wsServer.sendToDevice(deviceId, {
                type: 'tool_invocation',
                payload: { callId: uuid(), toolName: parsed.name, toolInput: parsed.input,
                           filePath: parsed.input?.file_path, command: parsed.input?.command }
              })
              break
            case 'permission_request':
              STEP 6 — 进入 §14.2 审批闭环
              break
            case 'tool_result':
              this.wsServer.sendToDevice(deviceId, {
                type: 'tool_result',
                payload: { callId: parsed.callId, success: parsed.success,
                           output: parsed.output?.slice(0, 2000), error: parsed.error }
              })
              break
          }
        }
      })

STEP 7 — 手机端接收流式响应
  WsConnection.onMessage(event)
    → const msg = JSON.parse(event.data)
    → SeqDeduplicator.shouldProcess(msg.sessionId, msg.seq)  // seq 去重
      → 如果 seq ≤ lastAckSeq → 丢弃（重复消息）
    → MessageHandler.dispatch(msg)
      → switch(msg.type):
          case 'assistant_stream':
            useChatStore.receiveStream(msg.sessionId, msg.payload.delta, msg.payload.done, msg.payload.messageId)
            → 从 messages Map 中取出该 sessionId 的消息数组
            → 如果 done = false: 最后一个 assistant 消息的 content += delta（追加）
            → 如果 done = true:  标记 isStreaming = false
            SeqDeduplicator.ack(msg.sessionId, msg.seq)      // 确认处理完毕
          case 'tool_invocation':
            useChatStore.addToolCall(msg.sessionId, msg.payload)
            → messages[msg.sessionId].push({ type:'tool_call', ... })
          case 'approval_request':
            useChatStore.addApprovalRequest(msg.sessionId, msg.payload)
            → pendingApprovals.push(msg.payload)
```

**状态变更追踪**:
```
Session 状态: idle → running (SessionManager.create 时)
消息表写入:   DB (Cloud Agent messages) + SQLite (Mobile messages) 双写
用户可见:     打字机效果逐字显示 (assistant_stream delta 追加渲染)
```

**异常传播链**:
```
stdin EPIPE → StdinStdoutBridge.write 返回 false
  → SessionManager.recoverCrashedSession(sessionId)          // 见 §14.6
WebSocket 断开 → WsConnection.onClose
  → 指数退避重连 (2s→5s→15s→30s→60s, max 5 次)
  → 重连成功 → 发送 client_connect → Cloud Agent session_sync → 补发未 ACK 消息
```

---

### 14.2 流程 2: 审批闭环（Claude → 手机 → Cloud Agent → Claude）

```
STEP 1 — Claude 发起审批
  StdinStdoutBridge.parseLine → type === 'permission_request'
    → 从 parsed 提取 { operation, target, risk }

STEP 2 — ApprovalInterceptor 拦截
  ApprovalInterceptor.intercept(sessionId, operation, target, risk)
    → whitelist.check(sessionId, operation)
       if (hit) return 'approved'                            // 白名单瞬间通过

    → const requestId = crypto.randomUUID()
    → const entry: ApprovalEntry = {
        requestId, sessionId, operation, target, risk,
        status: 'pending', timestamp: Date.now()
      }

    → 创建 Promise + 60s 超时:
      const decisionPromise = new Promise((resolve, reject) => {
        entry.resolve = resolve
        entry.timer = setTimeout(() => {
          entry.status = 'auto_rejected'
          Waiter.resolve(requestId, 'auto_rejected')
        }, 60000)
      })
      Waiter.pending.set(requestId, entry)

    → WsServer.sendToDevice(deviceId, {
        type: 'approval_request',
        payload: { requestId, operation, target, risk, sessionId }
      })

    → return await decisionPromise                           // 阻塞 Claude stdin 直到手机响应或超时

STEP 3 — 手机端渲染 + 用户决策
  useChatStore.addApprovalRequest(sessionId, approval)
    → pendingApprovals.push(approval)
    → ChatScreen 渲染 ApprovalCard (operation/target/risk + [允许][拒绝] + scope 选择)

  用户点击 "允许" (once):
    → useChatStore.respondApproval(requestId, 'approved', 'once')
    → ws.send({ type: 'approval_response', payload: { requestId, decision:'approved', scope:'once' } })

STEP 4 — Cloud Agent 处理手机响应
  WSServer.onMessage → type === 'approval_response'
    → if (scope === 'session') {
        ApprovalWhitelist.add(sessionId, operation)          // 记住整段会话
      }
    → ApprovalWaiter.resolve(requestId, decision)
      → const entry = this.pending.get(requestId)
      → clearTimeout(entry.timer)                            // 取消 60s 超时
      → entry.status = 'approved'
      → entry.resolve('approved')                            // ← Promise resolved!

STEP 5 — Claude stdin 注入
  ApprovalInterceptor.intercept 的 return 在 STEP 2 被阻塞，
  decisionPromise 现在 resolved → 函数返回 'approved'
    → StdinStdoutBridge.write(proc, 'y')                     // 注入 'y' 到 Claude stdin
    → Claude 继续执行

STEP 6 — 审计日志
  logger.info({ msg:'approval_decide', ctx: {
    sessionId, requestId, operation, target, risk, decision, scope, userId, deviceId
  }})
  → DB: INSERT INTO approvals (id, session_id, request_id, operation, target, risk, decision, timestamp)
```

**异常传播链**:
```
60s 无手机响应 → ApprovalWaiter 超时 → entry.resolve('auto_rejected')
  → StdinStdoutBridge.write(proc, 'n')
  → Claude 收到 'n' → 此操作被拒绝，继续执行下一步
  → WsServer.sendToDevice({ type:'approval_request', payload:{ status:'auto_rejected' } })

手机端 WS 断开 → 审批请求在 Cloud Agent 内存中保持 60s
  → 超时后 auto_rejected
  → 如果手机重连 → session_sync 同步 pendingApprovals 状态
```

---

### 14.3 流程 3: 文件上传（手机 → Cloud Agent → Claude 上下文注入）

```
STEP 1 — 手机端拍照/选文件
  CameraButton.onPress / AttachmentButton.onPress
    → expo-camera.takePictureAsync() / expo-image-picker.launchImageLibraryAsync()
    → 压缩 (expo-image-manipulator, ≤2560px, JPEG quality 0.85)
    → 本地预览 3s（ImageBubble 显示缩略图）

STEP 2 — 手机端上传
  FileUploader.upload(fileUri, taskId)
    → const formData = new FormData()
    → formData.append('file', { uri: fileUri, name: fileName, type: mimeType })
    → HttpClient.post('/api/v1/files/upload', formData, {
        idempotencyKey: uuid(),
        onProgress: (sent, total) => {
          useChatStore.updateUploadProgress(taskId, sent / total)
        }
      })
    → response → { fileId, fileName, fileSize, url }
    → ws.send({ type: 'user_message', payload: {
        content: `Uploaded: /uploads/${taskId}/${fileName}`,
        contentType: 'file_attachment',
        metadata: { fileId, fileName, fileSize, mimeType }
      }})

STEP 3 — Cloud Agent 接收文件
  FileManager.upload(file, taskId, userId)
    → const uploadPath = `/uploads/${taskId}/`
    → fs.mkdirSync(uploadPath, { recursive: true })
    → const sanitized = path.basename(file.originalname)   // F-K01: 防路径穿越
    → const destPath = path.join(uploadPath, sanitized)
    → fs.writeFileSync(destPath, file.buffer)
    → DB: INSERT INTO uploads (id, task_id, file_name, file_size, mime_type, path, user_id, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)                  // F-K03: 参数化绑定
    → return { fileId, fileName: sanitized, fileSize, mimeType, url }

STEP 4 — Claude 上下文注入
  SessionManager.routeMessage(sessionId, message)
    → 检测 contentType === 'file_attachment'
    → StdinStdoutBridge.write(proc, `[file:${fileId}] The user uploaded ${fileName} (${fileSize} bytes, ${mimeType}).
       The file is at /uploads/${taskId}/${fileName}. Analyze it if needed.`)
```

**依赖注入链**:
```
FileUploader ← HttpClient ← useAuthStore (token)
FileManager  ← better-sqlite3.Database ← app.ts
```

---

### 14.4 流程 4: Task 拆解（TaskBuilder.plan）

```
STEP 1 — 触发
  用户创建 Task → POST /api/v1/tasks → TaskController.create
    → TaskManager.create(title, repo, userId)
      → DB: INSERT INTO tasks → 返回 taskId
    → 如果 title 包含完整需求句子 (> 10 个单词):
      → 异步 TaskBuilder.plan(taskId, title, repo)
      → 返回 201 { task, status:'pending' }
      （plan 异步执行，不阻塞 HTTP 响应）

STEP 2 — TaskBuilder.plan 执行
  TaskBuilder.plan(taskId, userRequest, repo)
    → const plannerProc = this.processPool.spawn(workDir, `planner-${taskId}`)
    → 将 plannerProc 注册到 disposableSubPool (用于超时清理)

    → const systemPrompt = `You are a task planner. Given: "${userRequest}",
       break it down into 3-8 sequential subtasks. Return ONLY valid JSON:
       { "subtasks": [{ "title": "...", "description": "...", "order": 1 }] }`

    → this.bridge.write(plannerProc, systemPrompt)

    → 等待 Claude 输出（收集 JSON）:
      const output = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('planner_timeout')), 30000)
        let buffer = ''
        this.bridge.attach(plannerProc, (msg) => {
          buffer += msg.content
          if (buffer.includes('}')) {                        // 简易 JSON 结束检测
            clearTimeout(timer)
            resolve(buffer)
          }
        })
      })

    → const parsed = JSON.parse(output)                     // 解析 Claude 返回的 JSON
    → for (const st of parsed.subtasks) {
        DB: INSERT INTO subtasks (id, task_id, title, description, sort_order, status)
          VALUES (${uuid()}, ${taskId}, ${st.title}, ${st.description}, ${st.order}, 'pending')
      }

    → this.processPool.kill(`planner-${taskId}`)            // 清理 planner 进程

STEP 3 — 异常处理
  catch (e) {
    if (e.message === 'planner_timeout') {
      this.processPool.kill(`planner-${taskId}`)
      logger.warn({ msg:'planner timeout', ctx:{ taskId } })
    } else {
      logger.error({ msg:'planner failed', ctx:{ taskId, error: e.message } })
    }
    return []                                                // 返回空列表，不阻塞 Task 创建
  }

STEP 4 — 推送通知
  WsServer.sendToDevice(deviceId, {
    type: 'task_update',
    payload: { taskId, status: 'planning_done', subtasksCount: parsed.subtasks.length }
  })
```

**状态变更追踪**:
```
Task 状态:  pending（plan 完成前保持 pending）
Subtask:    pending × N（DB 写入）
WS 通知:    task_update → UI 刷新子任务列表
```

---

### 14.5 流程 5: DeepSeek 降级 + 恢复

```
STEP 1 — 检测 Cloud Agent 离线
  WsConnection.onClose
    → ModelRouter.onCloudAgentStatusChange(false)
      → this.cloudAgentOnline = false
      → this._wasDegraded = true
      → useModelStore.setCloudAgentOnline(false)
      → UI 指示器: "● DeepSeek V3 (纯聊天)" 蓝色

STEP 2 — 用户发送下一条消息时路由到 DeepSeek
  ChatScreen → useChatStore.sendMessage(sessionId, content)
    → ModelRouter.route(content, intent)
      → this.cloudAgentOnline === false && this.currentRoute === 'auto'
        → return 'deepseek'                                  // 自动降级

    → if (route === 'deepseek') {
        DeepSeekChat.chatStream(content)                     // 见 §5.6
          → circuitBreaker.call(...)
          → retry.execute(...)
          → fetch('https://api.deepseek.com/v1/chat/completions', ...)
          → 逐 token yield
        → useChatStore.receiveStream(sessionId, delta, done, messageId)
          手机端以相同的 ChatScreen 渲染流式响应（用户无感切换）
      }

STEP 3 — 用户看到降级提示
  ChatScreen 模型指示器旁边显示一行文字:
  "⚠ 云 Agent 离线 · 当前为 DeepSeek 纯聊天模式 · 无法操作文件"
  （仅在 auto 降级时显示，用户手动选择 DeepSeek 时不显示）

STEP 4 — Cloud Agent 恢复在线
  WsConnection.onOpen (重连成功)
    → ModelRouter.onCloudAgentStatusChange(true)
      → this.cloudAgentOnline = true
      → if (this._wasDegraded && this.currentRoute === 'auto') {
            自动切回 route = 'cloud'
            useModelStore.setActiveModel('Kimi kimi2.6 (Cloud)')
            UI 指示器恢复: "● Cloud Agent" 绿色
          }
      → this._wasDegraded = false

STEP 5 — 切回后首条消息路由
  useChatStore.sendMessage 再次调用 ModelRouter.route
    → cloudAgentOnline === true && intent === 'coding'
    → return 'cloud'
    → WsSender.send → 照常走 §14.1 的消息路由全链
```

**状态变更追踪**:
```
ModelRouter.cloudAgentOnline: true → false → true
ModelRouter._wasDegraded:     false → true → false
useModelStore.activeModel:    "Kimi kimi2.6 (Cloud)" ↔ "DeepSeek V3"
UI 指示器颜色:                 绿色 ↔ 蓝色
```

---

### 14.6 流程 6: Claude 进程 Crash 恢复

```
STEP 1 — 检测 Crash
  Claude 子进程退出:
    proc.proc.on('exit', (code, signal) => {
      if (code !== 0) {                                     // 非正常退出
        proc.state = 'crashed'
        logger.error({ msg:'claude crash', ctx:{ pid:proc.proc.pid, exitCode:code, signal, sessionId:proc.sessionId } })
        STEP 2
      }
    })

STEP 2 — SessionManager 恢复
  SessionManager.recoverCrashedSession(sessionId)
    → const proc = this.processPool.get(sessionId)
    → const ringBuffer = proc.ringBuffer                     // 读环形缓冲区（最近 100 条 stdin 行）
    → this.processPool.kill(sessionId)                       // 杀旧进程

    → const newProc = this.processPool.spawn(workDir, sessionId)  // 重生进程
    → this.bindProcess(sessionId, newProc)

    → 注入恢复上下文:
      for (const line of ringBuffer.slice(-50)) {            // 注入最近 50 条上下文
        this.bridge.write(newProc, line)
      }
      this.bridge.write(newProc, 'The system has recovered from a crash. Please continue from where you left off.')

    → const lastMessage = ringBuffer[ringBuffer.length - 1]
    → WsServer.sendToDevice(deviceId, {
        type: 'session_state',
        payload: { sessionId, status: 'recovered', lastContext: lastMessage?.slice(0, 100) }
      })

STEP 3 — 永久失败降级
  第 3 次 recoverCrashedSession 失败后:
    → Session 状态: running → error (永久)
    → WsServer.sendToDevice(deviceId, {
        type: 'error',
        payload: { code: 'RECOVERY_003', message: 'Claude 进程连续 3 次恢复失败，请手动重试 Task', recoverable: false }
      })
    → logger.error({ msg:'permanent recovery failure', ctx:{ sessionId, attempts:3 } })
```

**状态变更追踪**:
```
ClaudeProcess.state:  running → crashed (exit event)
Session 恢复:          Session 不改变状态（recoverCrashedSession 保持 running）
3 次失败后:            Session → error（永久）
手机通知:               session_state(recovered) / error(RECOVERY_003)
```

---

### 14.7 统一异常传播边界

```
                      ┌─────────────┐
                      │  Mobile App │
                      └──────┬──────┘
                             │ WS/HTTP 异常
                      ┌──────┴──────────────────────┐
                      │  Cloud Agent                 │
                      │                              │
                      │  Express error middleware:     │
                      │    sanitizeMiddleware →         │
                      │    AppError → serialized JSON   │
                      │    unknown   → 500 + reqId    │
                      │                              │
                      │  WS 消息处理:                 │
                      │    try { handler(msg) }       │
                      │    catch → sendToDevice(error) │
                      │                              │
                      │  Claude 进程:                  │
                      │    exit code ≠ 0 → recover    │
                      │    3 次恢复失败 → 永久 error   │
                      │    EPIPE → write 返回 false   │
                      └──────────────────────────────┘

异常从内到外的转换:
  Claude crash (exit≠0) → recoverCrashedSession → 3 retry → permanent error → WS error 消息
  Express throw (AppError) → error middleware → 统一 JSON → 手机 HttpClient catch
  WS handler throw (any) → WSServer try/catch → error 消息 → 手机 WsConnection → useChatStore
  DeepSeek fetch fail → CircuitBreaker → RetryPolicy → 3 retry → throw → try/catch → yield '[系统] 不可用'
```

---

### 14.8 流程 7: OAuth 登录全链（手机 → GitHub → JWT → WS 连接）

```
STEP 1 — 手机端扫码 + 发起 OAuth
  AuthScreen → 扫码 → setCloudAgentUrl(wss://cloud.your-domain.com)
    → expo-linking.openAuthSessionAsync(
        'https://github.com/login/oauth/authorize?client_id=xxx&redirect_uri=clawdbridge://callback'
      )
    → 用户在浏览器中点 "Authorize"
    → GitHub redirect → clawdbridge://callback?code=gh_xxx
    → expo-linking.addEventListener('url', (event) => {
        const code = new URL(event.url).searchParams.get('code')
        STEP 2
      })

STEP 2 — 手机端换 Token
  useAuthStore.loginWithGitHub(code)
    → const res = await HttpClient.post('/api/v1/auth/oauth', { provider:'github', code })
    → 200 → { token, refreshToken, user, deviceId }
    → persistAuth(token, refreshToken, user, deviceId)        // expo-secure-store write
    → isAuthenticated = true
    → STEP 3

STEP 3 — 建立 WebSocket 连接
  WsConnection.connect(cloudAgentUrl, token)
    → this.ws = new WebSocket(`wss://cloud-agent/ws?token=${token}`)
    → onOpen → 发送 { type:'client_connect', payload:{ deviceId, deviceName, appVersion } }
    → Cloud Agent 返回 { type:'session_sync', payload: sessions[] }
    → useSessionStore.set(sessions)

STEP 4 — Cloud Agent 侧处理 OAuth
  AuthService.handleOAuth(provider, code)
    → fetch('https://github.com/login/oauth/access_token', { client_id, client_secret, code })
    → 返回 access_token
    → fetch('https://api.github.com/user', { Authorization:'Bearer '+access_token })
    → 返回 { id, login, avatar_url }
    → const deviceId = crypto.randomUUID()
    → DB: INSERT INTO cloud_devices (id, name, platform, user_id, github_login, status, paired_at)
    → const jwt = jwtIssuer.issueTokenPair({ github_user_id:id, github_login:login, device_id })
    → 返回 { token, refreshToken, user, deviceId }

STEP 5 — 登录失败处理
  如果 GitHub OAuth 返回 error:
    → 400 { error:'missing_code', code:'AUTH_002' }
    手机端: 显示 "授权失败，请重试" + 重新打开 GitHub 授权页
  如果 device_id 冲突 (已存在):
    → UNIQUE(user_id, id) 约束 → SQLITE_CONSTRAINT
    → 返回已有设备的 JWT（允许同一手机重新登录）
```

---

### 14.9 流程 8: Token 刷新 + 401 自动重试

```
STEP 1 — 401 拦截
  HttpClient.request(method, path, opts)
    → headers['Authorization'] = `Bearer ${getToken()}`
    → const response = await fetch(baseUrl + path, { ...opts, headers })
    → if (response.status === 401) {
        这个 Token 已经过期了
        STEP 2
      }

STEP 2 — 刷新 Token
  useAuthStore.refreshAccessToken()
    → const res = await HttpClient._rawPost('/api/v1/auth/refresh', {}, {
        headers: { Authorization: `Bearer ${refreshToken}` }  // 用 refresh token
      })
    → 200 → { token, refreshToken: newRefresh }
    → persistAuth(token, newRefresh)                          // 更新存储
    → this.token = token
    → STEP 3

STEP 3 — 重试原请求
  → 用新 token 重试原请求 (method + path + body + opts)
  → 如果重试也 401 (refresh token 也过期了):
       useAuthStore.logout()
       → 跳转 AuthScreen

STEP 4 — Cloud Agent 侧刷新
  AuthService.refreshToken(token)
    → JWTIssuer.verify(token)                                // 验证旧 refreshToken
    → 检查 payload.exp 是否过期
    → 过期 → 401 { error:'invalid_token', code:'AUTH_001' }
    → 未过期 → issueTokenPair(payload) → 200 { token, refreshToken }
```

---

### 14.10 流程 9: 设备配对 + WebSocket 握手

```
STEP 1 — Cloud Agent WS 连接建立
  WSServer.ws.on('connection', (ws, req) => {
    → const url = new URL(req.url, 'https://placeholder')
    → const token = url.searchParams.get('token')            // ?token=eyJ...
    → const payload = AuthService.wsAuthenticate(token)       // JWT 验证

    → if (!payload) {
        ws.close(4001, 'Unauthorized')                       // 关闭连接
        return
      }

    → 验证通过后的关键数据:
      const { github_user_id, github_login, device_id, iat, exp } = payload
      → 写入内存: this.connections.set(device_id, { ws, userId, login, connectedAt })
      → Heartbeat.register(device_id, ws)
      → logger.info({ msg:'device_connected', ctx:{ device_id, userId } })

    STEP 2
  })

STEP 2 — 设备在线通知
  Heartbeat.register → 设备状态 online
    → DB: UPDATE cloud_devices SET status='online', last_heartbeat=now, last_ip=req.ip
    → 广播给同 workspace 的其它设备:
      for (const [dId, conn] of this.connections) {
        if (dId !== device_id && conn.userId === userId) {
          ws.send({ type:'relay:desktop_online', payload:{ deviceId, deviceName } })
        }
      }

STEP 3 — WebSocket 消息分流
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw)
    const reqId = crypto.randomUUID()

    switch (msg.type) {
      case 'client_connect':
        → SessionManager.listByUser(userId)
        → ws.send({ type:'session_sync', payload:{ sessions, serverTime } })
        break

      case 'user_message':
        @ri_flow → §14.1 STEP 3 (消息路由全链)
        break

      case 'approval_response':
        @ri_flow → §14.2 STEP 4 (审批闭环)
        break

      case 'ping':
        ws.send({ type:'pong', serverTime: Date.now() })
        break
    }
  })
```
  
  > **双设备并发写保护** (F-K14): SessionManager 维护 per-session `messageQueue: string[]`。`routeMessage()` 将消息入队，串行处理队列中的消息 → StdinStdoutBridge.write。确保手机+桌面同时发消息时 stdin 不交错。
  
  ### 14.11 流程 10: Session 创建全链（Task 创建 → Claude 启动）

```
STEP 1 — 手机端创建 Task
  TaskListScreen → 点击 "新建 Task"
    → 输入 title + 选 repo
    → useTaskStore.createTask(title, repo)
      → HttpClient.post('/api/v1/tasks', { title, repo }, { idempotencyKey: uuid() })

STEP 2 — Cloud Agent 创建 Task
  TaskManager.create(title, repo, userId)
    → const id = crypto.randomUUID()
    → DB: INSERT INTO tasks (id, title, repo, status='pending', tags='[]', category='', created_at, updated_at)
    → 异步继续 TaskBuilder.plan(taskId, title, repo)          // @ri_flow §14.4
    → return { id, title, repo, status:'pending', createdAt }

STEP 3 — Task 创建后自动创建第一个 Session
  TaskController.create 的 201 响应中:
    → 手机端收到 task.id
    → 自动 createSession(taskId)

  SessionManager.create(taskId, workDir, userId)
    → const id = crypto.randomUUID()
    → DB: INSERT INTO sessions (id, task_id, title, device_id, status='running', work_dir, created_at)
    → const proc = ClaudeProcessPool.spawn(workDir, id)       // 启动 Claude 子进程
    → StdinStdoutBridge.attach(proc, onMessage)               // 绑定 stdout 监听

    → 注入初始 system prompt:
      this.bridge.write(proc, `Task: ${task.title}
        Working directory: ${workDir}
        Ready to help. What would you like me to do?`)

    → WsServer.sendToDevice(deviceId, {
        type: 'task_update',
        payload: { taskId, status: 'in_progress', sessionsCount: 1 }
      })

STEP 4 — 手机端收到新 Session
  ws.on('task_update') → useTaskStore.fetchTaskDetail(taskId)
    → 在 SessionListScreen 中追加一条新 Session 项
    → 用户可点击进入 ChatScreen
```

---

### 14.12 流程 11: 文件下载 + 断点续传

```
STEP 1 — 手机端点击下载
  FileAttachmentCard → 点击 "下载"
    → const fileUri = FileSystem.documentDirectory + fileName
    → const downloadResumable = FileSystem.createDownloadResumable(
        `${cloudAgentUrl}/api/v1/files/${fileId}`,
        fileUri,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
          useChatStore.updateDownloadProgress(messageId, progress)  // 更新 UI 进度条
        }
      )
    → const result = await downloadResumable.downloadAsync()
    → 200 → 文件存入本地
    → 显示 "已下载" 按钮 → 点击 "打开" → FilePreview

STEP 2 — Cloud Agent 侧处理下载
  FileController.download
    → FileManager.download(fileId)
      → DB: SELECT path, mime_type, file_name FROM uploads WHERE id=?
      → fs.statSync(path) → 获取文件大小
      → res.setHeader('Content-Type', mimeType)
      → res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      → res.setHeader('Content-Length', fileSize)
      → res.setHeader('Accept-Ranges', 'bytes')

    → 如果有 Range header:
        const range = req.headers.range                  // bytes=0-1048576
        const [start, end] = parseRange(range, fileSize)
        res.status(206)
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        fs.createReadStream(path, { start, end }).pipe(res)
      else:
        res.status(200)
        fs.createReadStream(path).pipe(res)

STEP 3 — 断点续传
  手机端下载失败（WiFi 切换）
    → FileSystem.downloadAsync 可传入 resumeFrom 参数
    → 重试时: FileSystem.createDownloadResumable(url, fileUri, {}, callback)
      内部存储已下载的 bytes
      重试时继续从上次断开的位置下载
```

---

### 14.13 流程 12: 消息历史分页加载

```
STEP 1 — 进入 ChatScreen
  ChatScreen → useEffect
    → useChatStore.loadHistory(sessionId)
      → const res = await HttpClient.get(`/api/v1/sessions/${sessionId}/messages`, {
          params: { limit: '50' }
        })
      → 200 → { messages: Message[], hasMore: true }

    → const existing = this.messages.get(sessionId) || []
    → this.messages.set(sessionId, [...res.messages, ...existing])  // 历史消息放前面

STEP 2 — 下滑加载更多
  FlatList.onEndReached
    → if (!hasMore) return
    → const oldest = this.messages.get(sessionId)[0]                // 最旧的消息
    → useChatStore.loadHistory(sessionId, oldest.timestamp)
      → GET /api/v1/sessions/:id/messages?before=<ts>&limit=50
      → 200 → { messages: (可能空), hasMore: false }
    → 追加到数组头部
    → FlatList 保持当前滚动位置 (maintainVisibleContentPosition)

STEP 3 — Cloud Agent 侧分页查询
  SessionManager.getMessages(sessionId, beforeTs, limit)
    → if (beforeTs) {
        DB: SELECT * FROM messages WHERE session_id=? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?
      } else {
        DB: SELECT * FROM messages WHERE session_id=? ORDER BY timestamp DESC LIMIT ?
      }
    → const hasMore = messages.length === limit
    → return { messages: messages.reverse(), hasMore }
```

---

### 14.14 流程 13: WebSocket 重连 + session_sync

```
STEP 1 — WS 断开检测
  WsConnection.onClose(event)
    → this.ws = null
    → ModelRouter.onCloudAgentStatusChange(false)          // 通知路由器
    → if (reconnectAttempts < maxReconnectAttempts) {
        const delay = reconnectDelays[reconnectAttempts]
        this.reconnectTimer = setTimeout(() => this.reconnect(), delay)
        reconnectAttempts++
      } else {
        // 5 次重连失败 → 放弃
        useAuthStore.logout()
        useModelStore.setActiveModel('DeepSeek V3 (离线)')
      }

STEP 2 — 重连成功后同步
  WsConnection.onOpen
    → reconnectAttempts = 0
    → ModelRouter.onCloudAgentStatusChange(true)           // 通知路由器恢复

    → 发送 client_connect 消息（含 seq 信息）:
      ws.send({
        type: 'client_connect',
        payload: {
          deviceId, deviceName, appVersion,
          lastAckSeqs: SeqDeduplicator.getAllLastAcks()    // { sessionId → lastAckSeq }
        }
      })

STEP 3 — Cloud Agent 响应 session_sync
  WSServer.onMessage → type === 'client_connect'
    → const sessions = SessionManager.listByUser(userId)
    → const pending = ApprovalWaiter.getPendingForDevice(deviceId)
    → const missedMessages = MessageDAO.getByUserAfterSeq(userId, lastAckSeqs)
    → ws.send({
        type: 'session_sync',
        payload: { sessions, pendingApprovals: pending, missedMessages, serverTime }
      })

STEP 4 — 手机端处理 session_sync
  useChatStore → 逐条处理 missedMessages:
    for (const msg of missedMessages) {
      if (SeqDeduplicator.shouldProcess(msg.sessionId, msg.seq)) {
        useChatStore.receiveStream(msg.sessionId, msg.content, true, msg.id)
        SeqDeduplicator.ack(msg.sessionId, msg.seq)
      }
    }
  → pendingApprovals → useChatStore.pendingApprovals 追加
```

---

### 14.15 流程 14: HTTP Middleware 链（请求管道）

```
Express app.ts 启动时的 middleware 链:

app.use(reqIdMiddleware)             // ① reqId (所有请求第一个)
app.use('/api/v1', jsonParser)       // ② body parser
app.use('/api/v1', helmet({           // 🆕 F-K06: Express 安全 header
  contentSecurityPolicy: false,       // WSS 不需要 CSP
  frameguard: { action: 'deny' }      // 防点击劫持
}))
app.use('/api/v1', sanitizeMiddleware) // ③ F-K02: JSON body 深遍历 strip HTML/XSS, key 白名单
app.use('/api/v1', jwtVerifier)       // ④ JWT 验证
app.use('/api/v1', rateLimiter)       // ⑤ 速率限制
app.use('/api/v1', routes)            // ⑥ 路由处理
app.use(errorHandler)                 // ⑦ 错误处理

单个请求的完整流:

reqId middleware (req, res, next)
  → req['reqId'] = crypto.randomUUID()
  → res.setHeader('X-Request-Id', req.reqId)
  → next()

jwtVerifier middleware (req, res, next)
  → const url = req.url
  → if (url.startsWith('/health') || url.startsWith('/metrics')) {
      req['isPublic'] = true
      return next()                                        // 无需认证
    }
  → const token = req.headers.authorization?.split(' ')[1]
  → if (!token) return res.status(401).json({ error:'missing_token', code:'AUTH_004', reqId })
  → const payload = JWTIssuer.verify(token)
  → if (!payload) return res.status(401).json({ error:'invalid_token', code:'AUTH_001', reqId })
  → req['userId'] = payload.github_user_id
  → req['deviceId'] = payload.device_id
  → next()

rateLimiter middleware (req, res, next)
  → const key = req.ip
  → const bucket = this.buckets.get(key) || { tokens: 100, lastRefill: Date.now() }
  → refill(bucket)                                         // 按时间补充 token
  → if (bucket.tokens < 1) {
      res.status(429).json({ error:'rate_limited', code:'RATE_001', reqId })
      return
    }
  → bucket.tokens--
  → next()

errorHandler middleware (err, req, res, next)
  → if (err instanceof AppError) {
      res.status(err.statusCode).json({ error:err.message, code:err.code, reqId:req.reqId, details:err.details })
    } else {
      res.status(500).json({ error:'Internal server error', code:'INTERNAL_001', reqId:req.reqId })
      logger.error({ msg:'unhandled', ctx:{ stack:err.stack, reqId:req.reqId } })
    }
```

---

### 14.16 流程 15: 数据库 Migration 执行

```
DB 初始化 (app.ts 启动时):
  const db = new Database('/data/clawd.db')
  db.pragma('journal_mode = WAL')                           // WAL 模式, 读不阻塞写

  MigrationManager.run(db, MIGRATIONS)
    → db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`)
    → const currentVersion = db.prepare('SELECT MAX(version) FROM schema_version').get().version || 0
    → const pending = MIGRATIONS.filter(m => m.version > currentVersion)
    → for (const m of pending.sort((a,b) => a.version - b.version)) {
        db.exec('BEGIN')
        try {
          db.exec(m.up)                                     // 执行 migration SQL
          db.prepare('INSERT INTO schema_version VALUES (?)').run(m.version)
          db.exec('COMMIT')
          logger.info({ msg:'migration_applied', ctx:{ version:m.version } })
        } catch (e) {
          db.exec('ROLLBACK')
          logger.error({ msg:'migration_failed', ctx:{ version:m.version, error:e.message } })
          throw e
        }
      }
    → logger.info({ msg:'migration_complete', ctx:{ from:currentVersion, to:pending.length?pending[pending.length-1].version:currentVersion } })
```

---

### 14.17 流程 16: Task 重试全链

```
STEP 1 — 手机端触发重试
  TaskDetailScreen → 点击 "重试"
    → useTaskStore.retryTask(taskId)
      → HttpClient.post(`/api/v1/tasks/${taskId}/retry`)

STEP 2 — Cloud Agent 创建新 Session + 注入上下文
  TaskManager.retry(taskId)
    → const task = this.getById(taskId)
    → 读该 Task 下最近 50 条消息作为上下文:
      const recentMessages = MessageDAO.getByTaskId(taskId, 50)
    → 构造上下文 text:
      const context = recentMessages
        .filter(m => m.type === 'user' || m.type === 'assistant')
        .map(m => `${m.type==='user'?'User':'Claude'}: ${m.content}`)
        .join('\n')

    → const session = this.sessionMgr.create(taskId, workDir, userId)
    → const proc = this.processPool.get(session.id)

    → 注入上下文 + 重试指令:
      this.sessionMgr.bridge.write(proc, `Previous conversation:\n${context}\n\nPlease continue the task. What was incomplete?`)

STEP 3 — 通知手机
  → WsServer.sendToDevice(deviceId, {
      type: 'task_update',
      payload: { taskId, status: 'in_progress', sessionsCount: task.sessions.length }
    })
  → 手机端 SessionListScreen 追加新 Session 项
```

---

### 14.18 流程 17: 速率限制 Token Bucket 实现

```
RateLimiter 类实现:

class TokenBucket {
  private buckets: Map<string, { tokens: number; lastRefill: number }>
  private rate: number        // tokens per second
  private capacity: number    // 最大 token 数

  constructor(rate: number, capacity: number) { ... }   // 100 req/s, 100 容量

  refill(key: string): void {
    const bucket = this.buckets.get(key) || { tokens: capacity, lastRefill: Date.now() }
    const now = Date.now()
    const elapsed = (now - bucket.lastRefill) / 1000      // 秒
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * rate)   // 线性补充
    bucket.lastRefill = now
    this.buckets.set(key, bucket)
  }

  consume(key: string): boolean {
    this.refill(key)
    const bucket = this.buckets.get(key)!
    if (bucket.tokens < 1) return false                   // 没 token 了
    bucket.tokens -= 1
    return true
  }
}

使用时在 rateLimiter middleware 中:
  const ip = req.ip || req.connection.remoteAddress
  if (!this.bucket.consume(ip)) {
    return res.status(429).json({ error:'rate_limited', code:'RATE_001', reqId: req.reqId })
  }
  next()
```

---

### 14.19 流程 18: 手机 App 冷启动

```
App.tsx → useEffect (run once):

  STEP 1 — 恢复持久化状态
    → useAuthStore.loadPersistedAuth()
      → SecureStore.getItemAsync('jwt_token') → token
      → SecureStore.getItemAsync('refresh_token') → refreshToken
      → SecureStore.getItemAsync('cloud_agent_url') → cloudAgentUrl
      → SecureStore.getItemAsync('user') → user

    → 如果 token 存在且未过期:
        isAuthenticated = true
        继续 STEP 2

    → 如果 token 不存在:
        显示 AuthScreen (QR 扫码 + GitHub 登录)

  STEP 2 — 尝试连接 Cloud Agent
    → WsConnection.connect(cloudAgentUrl, token)
      → 成功 → onOpen:
          → ModelRouter.cloudAgentOnline = true
          → 发送 client_connect
          → 收到 session_sync → 加载最新的 Sessions
          → 导航到 TaskListScreen

      → 失败 → onClose (首次连接失败):
          → ModelRouter.cloudAgentOnline = false
          → 显示离线提示: "正在连接 Cloud Agent... (1/5)"
          → 指数退避 2s → 重试
          → 5 次失败后:
              显示 "Cloud Agent 不可达。可浏览离线缓存或切换 DeepSeek 模式。"

  STEP 3 — 加载离线缓存
    → 无论 WS 连不连上，都读 SQLite 离线数据:
      → useTaskStore: DB SELECT tasks ORDER BY updated_at DESC
      → useChatStore: DB SELECT messages FOR EACH session (最近 50 条)
    → 这些数据显示在屏幕上，即使 WS 没连上也可见

  STEP 4 — ModelRouter 初始化
    → 如果 cloudAgentOnline = false:
        → 设置 activeModel = "DeepSeek V3 (离线)"
        → useModelStore.setRoute('deepseek')
    → 如果 cloudAgentOnline = true:
        → 设置 activeModel = "Kimi kimi2.6 (Cloud)"
        → useModelStore.setRoute('auto')
```

---

## 15. UI 组件渲染逻辑（缺口 B）

### 15.1 ChatScreen FlatList 渲染 + 性能

```typescript
// ChatScreen.tsx 核心渲染逻辑

<FlatList
  data={messagesForActiveSession}
  renderItem={({ item: message }) => {
    switch (message.type) {
      case 'user':           return <UserBubble message={message} />
      case 'assistant':      return <AIBubble message={message} />
      case 'tool_call':      return <ToolCallCard toolCall={getToolPayload(message)} />
      case 'tool_result':    return <ToolResultCard result={getToolResultPayload(message)} />
      case 'approval':       return <ApprovalCard approval={getApprovalPayload(message)} />
      case 'error':          return <ErrorCard error={getErrorPayload(message)} />
      case 'file_card':      return <FileAttachmentCard file={getFilePayload(message)} />
      default:               return null
    }
  }}
  keyExtractor={(item) => item.id}
  // 性能关键参数:
  inverted={true}                                    // 聊天列表从底部开始（最新消息在最下）
  initialNumToRender={20}                            // 首次渲染 20 条
  maxToRenderPerBatch={10}                           // 每次批量渲染 10 条
  windowSize={5}                                     // 视口外缓冲 5 个屏幕高度
  removeClippedSubviews={true}                       // 移除不可见的 native view
  maintainVisibleContentPosition={{                  // 加载历史消息时不跳位置
    minIndexForVisible: 0,
    autoscrollToTopThreshold: 10
  }}
  onEndReached={loadMoreHistory}                     // 下滑加载历史
  onEndReachedThreshold={0.2}
  ListHeaderComponent={                              // 列表顶部: 模型指示器
    <ModelIndicator route={activeRoute} model={activeModel} />
  }
/>
```

---

### 15.2 TaskListScreen SearchBar + 过滤

```
SearchBar:
  <TextInput
    placeholder="搜索 Task..."
    onChangeText={(text) => {
      debounce(300, () => {                            // 300ms 防抖
        useTaskStore.setFilter({ search: text })
      })
    }}
  />

useTaskStore 内部过滤逻辑 (selector):
  const filteredTasks = useTaskStore(state => {
    let tasks = state.tasks
    if (state.filter.status && state.filter.status !== 'All') {
      tasks = tasks.filter(t => t.status === state.filter.status)
    }
    if (state.filter.repo) {
      tasks = tasks.filter(t => t.repo === state.filter.repo)
    }
    if (state.filter.search) {
      const q = state.filter.search.toLowerCase()
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      )
    }
    return tasks
  })
```

---

### 15.3 ApprovalCard 交互

```typescript
// ApprovalCard.tsx 交互逻辑
function ApprovalCard({ approval, onDecision }: Props) {
  const { requestId, operation, target, risk, status } = approval
  const [selectedScope, setSelectedScope] = useState<'once'|'session'>('once')

  // 已处理的不显示操作按钮
  if (status !== 'pending') {
    return <View>
      <Text>{operation} on {target}</Text>
      <Text color={status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'orange'}>
        {status === 'approved' ? '已允许' : status === 'rejected' ? '已拒绝' : '已超时'}
      </Text>
    </View>
  }

  return (
    <Card style={{ backgroundColor: risk === 'high' ? '#FEF3C7' : '#F9FAFB' }}>
      <Text bold>{operation}</Text>
      <Text>目标: {target}</Text>
      <Text>风险: {risk}</Text>
      <View horizontal>
        <Switch value={selectedScope === 'session'} onChange={() =>
          setSelectedScope(s => s === 'once' ? 'session' : 'once')
        } />
        <Text>{selectedScope === 'once' ? '仅本次' : '整个会话'}</Text>
      </View>
      <View horizontal>
        <Button title="允许" onPress={() => onDecision(requestId, 'approved', selectedScope)} />
        <Button title="拒绝" onPress={() => onDecision(requestId, 'rejected', selectedScope)} />
      </View>
    </Card>
  )
}

// onDecision → useChatStore.respondApproval(requestId, decision, scope)
//   → ws.send({ type:'approval_response', payload:{ requestId, decision, scope } })
```

---

### 15.4 FileAttachmentCard 交互

```typescript
// FileAttachmentCard.tsx 完整交互
function FileAttachmentCard({ file }: Props) {
  const [downloadState, setDownloadState] = useState<'idle'|'downloading'|'done'|'error'>('idle')
  const [progress, setProgress] = useState(0)

  const handleDownload = async () => {
    setDownloadState('downloading')
    try {
      const uri = `${cloudAgentUrl}/api/v1/files/${file.fileId}`
      const localUri = FileSystem.documentDirectory + file.fileName
      const resumable = FileSystem.createDownloadResumable(uri, localUri, {
        headers: { Authorization: `Bearer ${token}` }
      }, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        setProgress(totalBytesWritten / totalBytesExpectedToWrite)
      })
      await resumable.downloadAsync()
      setDownloadState('done')
    } catch {
      setDownloadState('error')
    }
  }

  const handlePreview = () => {
    navigation.push('FilePreview', { fileId: file.fileId, mimeType: file.mimeType, fileName: file.fileName })
  }

  return (
    <Card>
      <Text>{file.fileName} ({formatBytes(file.fileSize)})</Text>
      {downloadState === 'downloading' && <ProgressBar progress={progress} />}
      {downloadState === 'error' && <Text red>下载失败</Text>}
      {downloadState === 'idle' && <Button title="下载" onPress={handleDownload} />}
      <Button title="预览" onPress={handlePreview} />
    </Card>
  )
}
```

---

### 15.5 InputBar 动态高度 + 上传

```typescript
// InputBar.tsx 交互逻辑
function InputBar() {
  const [text, setText] = useState('')
  const [inputHeight, setInputHeight] = useState(44)       // 默认一行高度
  const [uploading, setUploading] = useState(false)
  const maxHeight = 120                                    // 最多 5 行

  const handleContentSizeChange = (width: number, height: number) => {
    setInputHeight(Math.min(height, maxHeight))
  }

  const handleCamera = async () => {
    const photo = await takePictureAsync({ quality: 0.85, maxWidth: 2560 })
    setUploading(true)
    try {
      const result = await FileUploader.upload(photo.uri, activeTaskId)
      sendMessage(`[Image uploaded: ${result.fileName}]`, 'file_attachment', result)
    } finally {
      setUploading(false)
    }
  }

  const handleSend = () => {
    if (!text.trim()) return
    useChatStore.getState().sendMessage(activeSessionId, text.trim())
    setText('')
  }

  return (
    <View>
      {uploading && <ProgressBar indeterminate />}
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        onContentSizeChange={(e) => handleContentSizeChange(e.nativeEvent.contentSize.width, e.nativeEvent.contentSize.height)}
        style={{ height: inputHeight, maxHeight }}
      />
      <Button icon="camera" onPress={handleCamera} />
      <Button icon="attach" onPress={handleAttachment} />
      <Button icon="send" onPress={handleSend} disabled={!text.trim()} />
    </View>
  )
}
```

---

### 15.6 FilePreview 渲染分派

```typescript
// FilePreview/index.tsx
function FilePreview({ route }: { route: { params: { fileId, mimeType, fileName } } }) {
  const { fileId, mimeType, fileName } = route.params
  const uri = `${cloudAgentUrl}/api/v1/files/${fileId}`

  if (mimeType.startsWith('image/')) {
    return <ImageViewer uri={uri} />
  }
  if (mimeType === 'application/pdf') {
    return <PdfViewer uri={uri} />
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return <CodeViewer uri={uri} language={getLanguage(mimeType)} />
  }
  // Office: Google Docs Viewer
  if (mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('powerpoint')) {
    const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(uri)}&embedded=true`
    return <WebView source={{ uri: googleViewerUrl }} />
  }
  // 不支持的格式 → 提示用外部 App 打开
  return <UnsupportedPreview fileName={fileName} onOpenInExternalApp={() => Sharing.shareAsync(uri)} />
}
```

---

### 15.7 BatchApprovalCard 交互

```typescript
// BatchApprovalCard.tsx
function BatchApprovalCard({ requests, onDecideAll, onDecideOne }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (requests.length === 0) return null

  return (
    <Card>
      <Text bold>⚠ {requests.length} 个审批待处理</Text>
      <View horizontal>
        <Button title="全部允许" color="green" onPress={() => onDecideAll('approved')} />
        <Button title="全部拒绝" color="red" onPress={() => onDecideAll('rejected')} />
        <Button title="逐项审批" onPress={() => setExpanded(!expanded)} />
      </View>

      {expanded && requests.map(req =>
        <View key={req.requestId}>
          <Text>{req.operation} → {req.target} (风险: {req.risk})</Text>
          <View horizontal>
            <Button small title="允许" onPress={() => onDecideOne(req.requestId, 'approved')} />
            <Button small title="拒绝" onPress={() => onDecideOne(req.requestId, 'rejected')} />
          </View>
        </View>
      )}
    </Card>
  )
}
```

---

### 15.8 TTSButton 渲染 (F-R01·FIND-J04)

```typescript
// TTSButton.tsx — idle→playing→done 三态
function TTSButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle'|'playing'|'done'>('idle')
  const handlePress = async () => {
    if (state === 'playing') { Speech.stop(); setState('idle'); return }
    setState('playing')
    const voices = await Speech.getAvailableVoicesAsync()
    const voice = voices.find(v => v.language.startsWith('zh')) || voices[0]
    Speech.speak(text, { language: voice?.language || 'zh-CN', rate: 1.0,
      onDone: () => setState('done'), onStopped: () => setState('idle') })
  }
  return <Button icon={state==='playing'?'stop':'volume-up'} onPress={handlePress} />
}
```

### 15.9 ThemeProvider hook (F-R01·FIND-J04)

```typescript
// src/theme/theme-provider.tsx
const ThemeContext = createContext<Theme>(lightTheme)
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const theme = useMemo(() => scheme === 'dark' ? darkTheme : lightTheme, [scheme])
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)
```

---

## 16. Zustand Store 内部实现（缺口 C）

### 16.1 useAuthStore.loginWithGitHub 完整实现

```typescript
// use-auth-store.ts 核心 action
loginWithGitHub: async (code: string) => {
  set({ isLoading: true })
  try {
    const res = await HttpClient.post('/api/v1/auth/oauth', { provider: 'github', code })
    const { token, refreshToken, user, deviceId } = res

    await SecureStore.setItemAsync('jwt_token', token)
    await SecureStore.setItemAsync('refresh_token', refreshToken)
    await SecureStore.setItemAsync('cloud_agent_url', get().cloudAgentUrl!)
    await SecureStore.setItemAsync('user', JSON.stringify(user))

    set({ token, refreshToken, user, deviceId, isAuthenticated: true, isLoading: false })

    // 登录成功后自动连接 WebSocket
    WsConnection.get().connect(get().cloudAgentUrl!, token)
  } catch (e) {
    set({ isLoading: false })
    throw e
  }
}
```

---

### 16.2 useChatStore.receiveStream 完整实现

```typescript
// use-chat-store.ts 流式接收
receiveStream: (sessionId: string, delta: string, done: boolean, messageId: string) => {
  set(state => {
    const messages = new Map(state.messages)
    const list = [...(messages.get(sessionId) || [])]
    const lastIdx = list.length - 1

    // 如果最后一条消息是正在流式接收的 assistant 消息 → 追加 delta
    if (lastIdx >= 0 && list[lastIdx].type === 'assistant' && list[lastIdx].status === 'streaming') {
      list[lastIdx] = {
        ...list[lastIdx],
        content: list[lastIdx].content + delta,
        status: done ? 'sent' : 'streaming'          // done 时标记完成
      }
    } else if (!done) {
      // 新起一条正在流式接收的消息
      list.push({
        id: messageId, sessionId, type: 'assistant',
        content: delta, seq: state.nextSeq, timestamp: Date.now(),
        status: 'streaming', metadata: {}
      })
    }

    messages.set(sessionId, list)
    return { messages, isStreaming: !done }
  })
}
```

---

### 16.3 useTaskStore.retry 完整实现

```typescript
// use-task-store.ts 重试 Task
retryTask: async (id: string) => {
  await HttpClient.post(`/api/v1/tasks/${id}/retry`)

  set(state => {
    const tasks = state.tasks.map(t =>
      t.id === id ? { ...t, status: 'in_progress' as const } : t
    )
    return { tasks }
  })

  // 重试后刷新 Task 详情（获取新增的 Session）
  get().fetchTaskDetail(id)
}
```

---

### 16.4 useDeviceStore.fetchCloudAgentHealth 完整实现

```typescript
// use-device-store.ts 拉取 Cloud Agent 健康状态
fetchCloudAgentHealth: async () => {
  try {
    const res = await HttpClient.get('/health')
    set({
      cloudAgent: {
        status: res.status,          // "healthy" | "degraded" | "down"
        uptime: res.uptime,          // 秒
        pm2Status: res.pm2.status,
        claudeTotal: res.claudeProcesses.total,
        claudeRunning: res.claudeProcesses.running,
        claudeCrashed: res.claudeProcesses.crashed,
        memoryMB: res.memory.rssMB,
        diskFreeGB: res.disk.freeGB,
        agentEngine: res.agent_engine.status
      }
    })
  } catch (e) {
    // Cloud Agent 不通时不报错，只是状态未知
    set({ cloudAgent: null })
  }
}
```

---

## 17. 基础设施流程（缺口 D）

### 17.1 PM2 生态系统配置

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'clawd-cloud-agent',
    script: 'app.ts',                                    // TypeScript 入口
    interpreter: 'ts-node',                              // 或编译后的 dist/app.js
    instances: 1,                                        // 单实例 (用户 ECS 单核)
    exec_mode: 'fork',
    autorestart: true,                                   // 崩溃自动重启
    max_restarts: 10,                                    // 1 小时内最多重启 10 次
    restart_delay: 5000,                                 // 5 秒后再重启
    watch: false,                                        // 不监听文件变更
    env: {
      NODE_ENV: 'production',
      PORT: '443'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/clawd/pm2-error.log',
    out_file: '/var/log/clawd/pm2-out.log',
    merge_logs: true
  }]
}
```

---

### 17.2 Logger 文件轮转

```typescript
// logger.ts
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.json(),                         // JSON 结构化
  transports: [
    // 生产: 按天滚动, 保留 14 天, 单个文件最大 10MB
    new DailyRotateFile({
      filename: '/var/log/clawd/cloud-agent-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        winston.format.json()
      )
    }),
    // 开发: 输出到 console
    ...(process.env.NODE_ENV === 'development' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json({ space: 2 })
        )
      })
    ] : [])
  ]
})

export { logger }
```

---

### 17.3 Docker ENTRYPOINT 启动脚本

```bash
#!/bin/sh
# entrypoint.sh — Docker 容器启动脚本

set -e
echo "[clawd] Starting Cloud Agent..."

# 1. 跑数据库 migration
echo "[clawd] Running database migrations..."
node dist/db/migrate.js

# 2. 生成 Let's Encrypt SSL 证书（如果不存在）
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  echo "[clawd] Generating SSL certificate for $DOMAIN..."
  certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
fi

# 3. 打印 QR 码（手机扫码连接）
echo ""
echo "========================================"
echo "  Cloud Agent 已启动"
echo "  URL: wss://$DOMAIN/ws"
echo ""
node dist/scripts/print-qr.js "wss://$DOMAIN/ws"
echo "========================================"
echo ""

# 4. 启动 PM2
exec pm2-runtime ecosystem.config.js
```

### 17.4 缺失 PRD 功能补充 (F-K38/F-K39/F-K40 + 环境声明)

#### 触觉反馈 (F-K38)

```typescript
// expo-haptics — P2 增强体验, 无独立流, hook 级实现
// 触发点:
//   Task 完成 → Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
//   审批到达 → Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
//   消息发送成功 → Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
```

#### 对话导出 (F-K39)

```typescript
// ExportButton → useChatStore.getMessages(sessionId) → 
//   MD: messages.map(m => `## ${m.type}\n${m.content}`).join('\n\n')
//   JSON: JSON.stringify(messages, null, 2)
// → expo-sharing.shareAsync(fileUri)
```

#### Web 只读面板 (F-K40)

```
P2 阶段仅 API 预留端点 (GET /api/v1/agent/stats), 
组件渲染见 Phase 3 Dev Plan → 独立 web-dashboard/ 子项目
```

#### 环境声明补充 (F-K25/F-K26/F-K27/F-K22)

```
F-K25: SQLite ≥ 3.37.0 要求 (json_valid() CHECK 约束)
       Debian 12 / Ubuntu 22.04 → sqlite3 3.40+

F-K26: ECS 最小规格 — 2 vCPU, 2GB RAM, 20GB SSD

F-K27: Docker base image → node:20-slim, 
       容器内 `claude` CLI 路径 → /usr/local/bin/claude

F-K22: 内存预算 — Node.js heap 200MB + Claude proc×5 @ 512MB = <3GB total,
       docker-compose deploy.resources.limits.memory: 4G

F-K16: 重连期间补发消息与新到达消息不会碰撞 —
       SeqDeduplicator 按 sessionId+seq 去重, 
       补发消息 seq 范围在 lastAckSeq 以内, 新消息 seq > lastAckSeq

F-K17: Node.js 单线程 + better-sqlite3 同步 API →
       同一进程内无 SQLite 并发写冲突
```

#### 架构图 + 节号修正 (F-K34/F-K35)

```
F-K34: §6.6a TaskBuilder → §6.12 TaskBuilder (标准编号)

F-K35: §1.1 Cloud Agent 架构图底部增补:
  ┌─────────────┐ ┌──────────────┐
  │TaskBuilder  │ │ApprvlIntercptr│
  │(planner)    │ │(whitelist+    │
  │             │ │ waiter+       │
  │             │ │ intercept)    │
  └─────────────┘ └──────────────┘
```

