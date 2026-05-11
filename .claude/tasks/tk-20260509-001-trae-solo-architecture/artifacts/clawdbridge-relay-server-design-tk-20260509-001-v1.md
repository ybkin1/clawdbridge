# Design：ClawdBridge Cloud Relay Server — 中继服务器方案详设

> 版本: v1.0 | 2026-05-10 | 阶段: Phase 2 Design
> document_class: confidential_design | depth_profile: implementation_blueprint | maturity_target: draft
> 基于: [ClawdBridge Design v2](clawdbridge-design-tk-20260509-001-v2.md) §10.2, [Trae Solo 架构分析 README](../README.md)

---

## 0. 前置：现有代码扫描结论

### 0.1 已存在的代码

扫描 `yb/clawd-on-desk-main/bridge-server/src/` 目录：

| 文件 | 行 | 用途 | 中继复用 |
|------|----|------|---------|
| `ws-server.ts` | ~90 | WebSocket 服务器 | ⚠️ 需改造为双端 pub/sub 模式 |
| `message-router.ts` | ~70 | type→handler 路由 | ⚠️ 需改为 pub/sub dispatch |
| `auth-middleware.ts` | ~40 | JWT 鉴权 | ✅ **直接复用** |
| `auth-service.ts` | ~55 | OAuth + JWT 签发/刷新 | ✅ **直接复用** |
| `jwt-issuer.ts` | ~85 | HS256 签名/验证 | ✅ **直接复用** |
| `heartbeat.ts` | ~45 | 30s ping/pong | ✅ **直接复用**（双端独立心跳） |
| `cli-spawn.ts` | ~35 | spawn Claude Code 子进程 | ✅ **复用**（云上备胎 Claude） |
| `stdout-parser.ts` | ~50 | Claude stdout→消息对象 | ✅ **复用** |
| `exit-handler.ts` | ~45 | 进程 exit 清理 | ✅ **复用** |
| `stderr-logger.ts` | ~55 | stderr→日志 | ✅ **复用** |
| `routes.ts` | ~80 | REST API 端点 | ⚠️ 中继不需要 HTTP API |
| `approval-engine.ts` | ~125 | 审批拦截 | ⚠️ 中继**不拦截审批**，只透传 |
| `stdin-writer.ts` | ~10 | stdin 写入 | ✅ **复用** |

### 0.2 结论

- **可直接集成（不改）**：6 个文件（auth-middleware, auth-service, jwt-issuer, heartbeat, exit-handler, stderr-logger, stdin-writer）
- **需改造（改部分）**：3 个文件（ws-server → 双端连接模式, message-router → pub/sub, cli-spawn → 云上备胎模式）
- **中继不需要**：2 个文件（routes.ts 的 REST API, approval-engine）
- **需新建**：3 个模块（session-pairing, redis-queue, cloud-fallback）

---

## 1. 架构总览

```
    手机 (5G/4G)                云服务器 (ECS/Fly.io)                 桌面 (NAT 后)
    ──────────                  ─────────────────────                 ──────────────
    ┌──────────────┐       ┌───────────────────────────┐       ┌──────────────────┐
    │ ClawdBridge  │       │      Relay Server          │       │  Bridge Client   │
    │ Mobile App   │       │                             │       │  (主动出站)       │
    │              │  WSS  │  ┌───────────────────────┐ │  WSS  │                  │
    │ WS Client ◄──┼───────┼──► ws-server (双端)       │◄┼───────┼── WS Client      │
    │ (phone-id)   │       │  │ ├─ phone connections   │ │       │  (desktop-id)    │
    │              │       │  │ └─ desktop connections │ │       │                  │
    │ Zustand      │       │  └──────────┬────────────┘ │       │  ┌──────────────┐│
    │ SQLite       │       │             │               │       │  │ Claude Code  ││
    └──────────────┘       │  ┌──────────┴────────────┐ │       │  │ CLI (主)     ││
                           │  │    Session Pairing    │ │       │  └──────────────┘│
                           │  │  session_id → {phone, │ │       └──────────────────┘
                           │  │  desktop} binding     │ │
                           │  └──────────┬────────────┘ │       ┌──────────────────┐
                           │             │               │       │  Cloud Claude    │
                           │  ┌──────────┴────────────┐ │       │  (备胎·桌面离线时)│
                           │  │    Message Pub/Sub    │ │ spawn │                  │
                           │  │  per-session queue    │◄┼───────┤  cli-spawn.ts    │
                           │  └──────────┬────────────┘ │       └──────────────────┘
                           │             │               │
                           │  ┌──────────┴────────────┐ │
                           │  │    Redis              │ │
                           │  │  - message cache      │ │
                           │  │  - session state      │ │
                           │  │  - pending queue      │ │
                           │  └───────────────────────┘ │
                           └───────────────────────────┘
```

### 1.1 与 Trae Solo 架构的对比

| 维度 | Trae Solo | ClawdBridge Relay | 我们的优势 / 差异原因 |
|------|-----------|-------------------|---------------------|
| **中继部署** | 字节火山引擎（强依赖云） | 自建 ECS/Fly.io（用户可控） | 不绑定厂商，用户可自建中继 |
| **桌面出站** | SOLO Desktop 主动连云 | Bridge Client 主动出站 | 相同模式，都不需要公网 IP |
| **AI 执行端** | 云端 Agent（不经过桌面） | 桌面 Claude CLI（保留本地执行） | Claude Code 本地跑，代码不离开用户电脑 |
| **会话抽象** | Task（云端分配到设备） | Session（直接对 Claude 进程） | 更轻量，无需任务调度器 |
| **审批机制** | 云端可能自动审批 | 中继不拦截审批，推手机决策 | 用户对自己电脑的权限拥有完全控制 |
| **代码同步** | GitHub 自动推送 | 不涉及（Claude 直接操作本地文件） | 免去 Git 集成复杂度 |
| **缓存策略** | 四层 State Sync | 三层 + Redis + SQLite | 见 §4 |

---

## 2. 模块设计

### 2.1 RelayServer（WebSocket 双端连接管理）

```typescript
// relay-server/src/relay-server.ts
class RelayServer {
  private phones: Map<string, WebSocket> = new Map();     // device_id -> ws
  private desktops: Map<string, WebSocket> = new Map();   // device_id -> ws
  private sessions: Map<string, SessionBinding> = new Map(); // session_id -> {phone, desktop}

  // 手机端连接
  onPhoneConnect(ws: WebSocket, deviceId: string, sessionId: string): void {
    this.phones.set(deviceId, ws);
    const binding = this.getOrCreateSession(sessionId);
    binding.phone = deviceId;
    // 如果桌面已在线，通知手机端
    if (binding.desktop && this.desktops.has(binding.desktop)) {
      ws.send(JSON.stringify({ type: 'desktop_online', sessionId }));
    }
  }

  // 桌面端连接（主动出站连接中继）
  onDesktopConnect(ws: WebSocket, deviceId: string, sessionId: string): void {
    this.desktops.set(deviceId, ws);
    const binding = this.getOrCreateSession(sessionId);
    binding.desktop = deviceId;
    // 通知所有该 session 的手机
    this.notifyPhones(sessionId, { type: 'desktop_online', deviceId });
  }
}
```

### 2.2 SessionPairing（会话绑定）

```typescript
// relay-server/src/session-pairing.ts
interface SessionBinding {
  sessionId: string;
  phone: string | null;      // device_id of phone
  desktop: string | null;    // device_id of desktop
  createdAt: number;
  lastMessageAt: number;
}

class SessionPairing {
  private bindings: Map<string, SessionBinding> = new Map();

  pair(sessionId: string, role: 'phone' | 'desktop', deviceId: string): void {
    const binding = this.bindings.get(sessionId) || { sessionId, phone: null, desktop: null, createdAt: Date.now(), lastMessageAt: Date.now() };
    binding[role] = deviceId;
    binding.lastMessageAt = Date.now();
    this.bindings.set(sessionId, binding);
  }

  getPeer(sessionId: string, role: 'phone' | 'desktop'): string | null {
    const binding = this.bindings.get(sessionId);
    if (!binding) return null;
    return role === 'phone' ? binding.desktop : binding.phone;
  }
}
```

### 2.3 MessagePubSub（消息发布/订阅）

```typescript
// relay-server/src/message-pubsub.ts
// 核心职责：把消息从消息源转发到消息目标
// 中继不做消息解析，只做透明转发

class MessagePubSub {
  private redis: IRedis;
  private relayServer: RelayServer;

  // 手机 → 桌面
  async forwardToDesktop(sessionId: string, message: object): Promise<void> {
    const peer = this.relayServer.getDesktop(sessionId);
    if (peer) {
      // 桌面在线：直接转发
      peer.send(JSON.stringify(message));
    } else {
      // 桌面离线：缓存到 Redis + 触发云上备胎 Claude
      await this.redis.lpush(`queue:${sessionId}:to-desktop`, JSON.stringify(message));
      this.checkFallbackToCloud(sessionId, message);
    }
  }

  // 桌面 → 手机
  async forwardToPhone(sessionId: string, message: object): Promise<void> {
    const peer = this.relayServer.getPhone(sessionId);
    if (peer) {
      peer.send(JSON.stringify(message));
    } else {
      await this.redis.lpush(`queue:${sessionId}:to-phone`, JSON.stringify(message));
    }
  }

  // 广播给 session 的所有客户端
  async broadcast(sessionId: string, message: object): Promise<void> {
    await Promise.all([
      this.forwardToDesktop(sessionId, message),
      this.forwardToPhone(sessionId, message),
    ]);
  }
}
```

### 2.4 CloudFallback（云上备胎 Claude）

```typescript
// relay-server/src/cloud-fallback.ts
class CloudFallback {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  takeover(sessionId: string, workDir: string, lastMessages: Message[]): void {
    const cli = new CLISpawn(process.env.ANTHROPIC_API_KEY, 0.50);
    const proc = cli.spawn(workDir);

    // 注入上下文（补最后 20 条消息作为对话历史）
    const context = lastMessages.slice(-20).map(m => `${m.role}: ${m.content}`).join('\n');
    proc.stdin?.write(context + '\n');
    proc.stdin?.write('Continue the conversation naturally.\n');

    this.activeProcesses.set(sessionId, proc);

    proc.stdout?.on('data', (chunk: Buffer) => {
      // 流式输出通过中继推给手机
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        this.relayServer.forwardToPhone(sessionId, { type: 'assistant_stream', delta: line });
      }
    });

    proc.on('exit', (code) => {
      this.activeProcesses.delete(sessionId);
      if (code !== 0) {
        this.relayServer.forwardToPhone(sessionId, {
          type: 'error', code: 'CLOUD_CLAUDE_CRASH', message: `Cloud Claude exited with ${code}`
        });
      }
    });
  }

  handBack(sessionId: string): void {
    // 桌面重连后，停止云上备胎，把最新的对话上下文传回桌面
    const proc = this.activeProcesses.get(sessionId);
    if (proc) {
      proc.kill('SIGTERM');
      this.activeProcesses.delete(sessionId);
    }
  }
}
```

---

## 3. Redis 缓存策略设计

### 3.1 Redis 数据结构

```
# 会话状态
SET session:{sessionId}:state   JSON {phone, desktop, status, createdAt}

# 消息队列（离线缓存）
LPUSH queue:{sessionId}:to-phone    JSON message  ← 桌面→手机
LPUSH queue:{sessionId}:to-desktop  JSON message  ← 手机→桌面

# 消息队列长度限制（防止 OOM）
EXPIRE queue:{sessionId}:to-phone    3600  (1h TTL)
EXPIRE queue:{sessionId}:to-desktop  3600

# 最近 50 条消息（用于云上备胎 Claude 的上下文注入）
LTRIM queue:{sessionId}:recent 0 49

# 桌面心跳
SET heartbeat:desktop:{deviceId}    timestamp  EX 90  (90s TTL)
```

### 3.2 与 Trae Solo 缓存对比

| 维度 | Trae Solo（推断） | ClawdBridge Relay |
|------|-------------------|-------------------|
| **离线缓存** | 云端 State Sync（四层全量同步） | Redis 临时队列（1h TTL，轻量） |
| **消息去重** | 未公开 | 基于 seq，Bridge 端已实现 |
| **会话恢复** | 云端全量同步 → 所有端 | 桌面重连 → Redis 队列消费 → 手机端拉取最新 |
| **上下文持久化** | GitHub 自动推送代码 | 不持久化代码；对话上下文 Redis 临时存 |
| **云上备胎** | 云端 Agent 始终可用 | 桌面离线 30s → 云上 spawn Claude 接管 |

**结论：可以，但不是一模一样的。** Trae Solo 的全量 State Sync 依赖字节的云端存储，ClawdBridge 用更轻量的 Redis 临时缓存 + 桌面端始终掌握代码所有权。两者的目标是相同的（任何端任何时间都能恢复上下文），但 ClawdBridge 更轻量、更去中心化。

---

## 4. 通信协议（沿用消息类型，透传）

中继服务器**不解析**业务消息内容，只基于 `sessionId` 做透明的 pub/sub 转发。复用已有的 10 种 WebSocket 消息类型（来自 [Design v2 §5.5](clawdbridge-design-tk-20260509-001-v2.md)）。

```
手机                 Relay                桌面
  │── user_message ──→│── user_message ──→│
  │                    │                    │── spawn Claude ──→
  │                    │                    │◄── stdout stream ──
  │◄── assistant_stream ──│◄── assistant_stream ──│
  │                    │                    │
  │                    │── heartbeat ──────→│ (30s 双向)
  │◄── heartbeat ──────│                    │
```

**中继新增的消息类型（仅协议层，不过业务）**：

```typescript
// Relay → Phone: 桌面在线/离线通知
type DesktopOnline = {
  type: 'relay:desktop_online';
  sessionId: string;
  deviceId: string;
};

// Relay → Phone: 已切换到云上备胎 Claude
type CloudFallbackActive = {
  type: 'relay:cloud_fallback';
  sessionId: string;
  reason: 'desktop_offline' | 'desktop_timeout';
};

// Relay → Phone: 桌面已重连，云上备胎已交还
type CloudFallbackHandback = {
  type: 'relay:handback';
  sessionId: string;
};
```

---

## 5. 部署方案

### 5.1 服务器要求

| 资源 | 最低 | 推荐 |
|------|------|------|
| CPU | 1 核 | 2 核 |
| 内存 | 512MB | 1GB |
| 磁盘 | 5GB | 10GB |
| 带宽 | 1Mbps | 5Mbps |
| 系统 | Ubuntu 22.04 LTS | — |
| 费用 | ~$5/月（阿里云 ECS / Fly.io 免费额度） | — |

### 5.2 部署命令

```bash
# 1. 云服务器初始设置
ssh root@your-server-ip
apt update && apt install -y nodejs npm redis-server
systemctl start redis-server

# 2. 拉取代码
cd /opt
git clone https://github.com/your/clawdbridge.git
cd clawdbridge/relay-server
npm install

# 3. 环境变量
cat > .env << EOF
PORT=443
JWT_SECRET=$(openssl rand -hex 32)
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-xxx
FE_DOMAIN=https://clawdbridge.app
EOF

# 4. SSL 证书（Let's Encrypt）
apt install -y certbot
certbot certonly --standalone -d relay.your-domain.com

# 5. 启动
node relay-server.js \
  --port 443 \
  --ssl-cert /etc/letsencrypt/live/relay.your-domain.com/fullchain.pem \
  --ssl-key /etc/letsencrypt/live/relay.your-domain.com/privkey.pem
```

### 5.3 桌面端配置

桌面 Bridge Client 的启动命令（替代原局域网 `bridge-server.js`）：

```bash
# 桌面端 —— 作为客户端主动出站连接云端中继
node bridge-client.js \
  --relay-url wss://relay.your-domain.com \
  --device-id $(hostname) \
  --session-id $(uuidgen)
```

不需要公网 IP，不需要路由器端口映射，桌面主动作为 WebSocket 客户端出站连接中继。

---

## 6. 文件清单

### 6.1 新增文件（relay-server）

| 文件 | 行数估计 | 职责 |
|------|---------|------|
| `relay-server/src/relay-server.ts` | ~150 | 双端 WebSocket 管理 + 连接/断开事件 |
| `relay-server/src/session-pairing.ts` | ~60 | session_id → {phone, desktop} 绑定 |
| `relay-server/src/message-pubsub.ts` | ~100 | 消息透传 + Redis 缓存 |
| `relay-server/src/cloud-fallback.ts` | ~80 | 桌面离线 → 云上 spawn Claude 接管 |
| `relay-server/src/redis.ts` | ~40 | Redis 连接管理 + lpush/brpop/lrange |
| `relay-server/package.json` | — | ws, ioredis, jsonwebtoken |
| `relay-server/.env.example` | — | 环境变量模板 |

**新增 ~430 行代码**。

### 6.2 从 bridge-server 复用（直接引用）

| 原文件 | 方式 | 用于 relay-server |
|--------|------|------------------|
| `jwt-issuer.ts` | 复制 | 手机端/桌面端 JWT 签发 |
| `auth-middleware.ts` | 复制 | WS 连接时 JWT 鉴权 |
| `heartbeat.ts` | 复制 | 双端独立 heartbeat |
| `cli-spawn.ts` | 复制 | 云上备胎 spawn Claude |
| `stdout-parser.ts` | 复制 | 云上 Claude stdout 解析 |
| `exit-handler.ts` | 复制 | 云上 Claude exit 清理 |
| `stderr-logger.ts` | 复制 | 云上 Claude stderr 日志 |
| `stdin-writer.ts` | 复制 | 云上 Claude stdin 注入 |

### 6.3 从 bridge-server 改造

| 原文件 | 改造 | 改后的用途 |
|--------|------|-----------|
| `ws-server.ts` | 改造成双端模式（phone + desktop 两个 client 池） | relay 的连接管理 |
| `message-router.ts` | 改造成 pub/sub dispatch（不做 handler 注册，只做方向路由） | relay 的消息转发 |

### 6.4 清理清单（不需要的文件）

桥服务器中的以下两个模块**不进入 relay-server**：
- `routes.ts`（REST API）— 中继不需要 HTTP API，全走 WebSocket
- `approval-engine.ts` — 中继不解密消息，审批决策由桌面 Bridge Server 处理

---

## 7. 与 Trae Solo 的全面借鉴对照

| 借鉴点 | Trae Solo 做法 | ClawdBridge 采纳 | 差异原因 |
|--------|---------------|-----------------|---------|
| **架构：云中继** | 字节火山引擎云端 | 用户自建 ECS | 保持去中心化 |
| **功能：双智能体** | Builder + Coder 分工 | Claude Code 全能 | Claude 不需要双层 Agent |
| **布局：三 Tab 导航** | 对话/任务/我的 | ✅ 完全采纳 | 已在 ClawdBridge 实现 |
| **布局：气泡式对话** | 用户蓝色右侧/AI 灰色左侧 | ✅ 完全采纳 | 已在 ChatScreen 实现 |
| **通信：WebSocket 协议** | JSON over WSS | ✅ 完全采纳 | 已在 §5.5 定义 |
| **通信：消息信封格式** | {type, payload, sessionId} | ✅ 采纳并扩展 | 扩展了 10 种消息类型 |
| **通信：seq 去重** | 未公开 | 自研 | 基于 `<sessionId>-<seq>` |
| **缓存：四层 State Sync** | 任务/代码/文件/设备 | 三层 + Redis | 去掉代码同步（Claude 本地操作） |
| **缓存：SQLite 离线** | 推断有本地存储 | ✅ 采纳 | 5 表 + DAO + WAL |
| **缓存：Redis 中继** | 云端全量同步 | Redis 临时队列 | 更轻量 |
| **UI：审批卡片** | Trae Solo 可能没有 | 自研 | Claude 需要审批，Trae 不需要 |
| **UI：工具调用卡片** | 参考 Trae 的结果展示 | ✅ 采纳 | 展示 tool_use 状态 |
| **UI：语音输入** | 内建 ASR/TTS | ✅ 采纳 | expo-speech-recognition |
| **UI：主题色** | Trae Solo 品牌色 | 自定 Claude 橙 #D97706 | 品牌差异 |

---

## 8. 安全性

| 层 | 措施 |
|----|------|
| 传输 | WSS（TLS 1.3）+ Let's Encrypt 证书 |
| 认证 | JWT HS256，15min access + 7d refresh |
| 内容 | 中继不解密消息，只做透明 pub/sub 转发 |
| 缓存 | Redis 设置 1h TTL，不持久化敏感数据 |
| 速率 | 每个 session 每秒 ≤ 50 条消息 |
| 预算 | 云上备胎 Claude 硬上限 $0.50/次 |
