# Trae Solo ↔ ClawdBridge Cloud Agent v2 — 全维度架构对比

> 日期: 2026-05-10 | 对照: [Cloud Agent v2 评估](reviews/cloud-agent-v2-assessment.md), [Trae Solo 深度学习报告](README.md), [PRD v2](artifacts/clawdbridge-prd-tk-20260509-001-v2.md)
> 目的: 从架构、功能、通信、接口、安全、部署等 12 个维度逐一对比，找出可借鉴的设计与不可复制的差异

---

## 一、总体架构对比

### 1.1 Trae Solo

```
┌─────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  手机/PWA │◄────►│     字节火山引擎云端    │◄────►│   SOLO Desktop       │
│          │ WSS  │                      │ WSS  │   (桌面 Agent)        │
│  对话界面 │      │  ┌─────────────────┐  │      │                      │
│  任务管理 │      │  │ AI Agent 层      │  │      │  ┌────────────────┐ │
│  审批控制 │      │  │ Builder + Coder │  │      │  │ 文件系统操作    │ │
│          │      │  └────────┬────────┘  │      │  │ 终端/Shell     │ │
│          │      │           │            │      │  │ Git 同步       │ │
│          │      │  ┌────────┴────────┐  │      │  └────────────────┘ │
│          │      │  │ State Sync      │  │      └──────────────────────┘
│          │      │  │ (四层全量)       │  │
│          │      │  └────────┬────────┘  │
│          │      │           │            │
│          │      │  ┌────────┴────────┐  │
│          │      │  │ GitHub 代码同步  │  │
│          │      │  └─────────────────┘  │
└─────────┘      └──────────────────────┘
```

**核心理念**: 云端 AI Agent 是**唯一执行引擎**。手机是纯 UI 遥控器，桌面端的 SOLO Desktop 是云端 Agent 的一个"手臂"（执行云端下发的文件/Shell 操作）。

**AI 架构**: 双智能体分工——**SOLO Builder** 负责任务理解与拆解，**SOLO Coder** 负责代码生成与执行。

### 1.2 ClawdBridge Cloud Agent v2

```
┌──────────┐      ┌───────────────────────┐      ┌───────────────────────┐
│  手机 App │◄────►│    Cloud Agent        │◄────►│  Desktop Bridge       │
│ (Expo RN)│ WSS  │   (用户自建 ECS)       │ WSS  │  (可选·主动出站)       │
│          │      │                        │      │                       │
│  ChatScreen│    │  ┌──────────────────┐  │      │  ┌─────────────────┐  │
│  Zustand  │      │  │ Claude Code CLI  │  │      │  │ Claude Code CLI │  │
│  SQLite   │      │  │ (云主执行引擎)    │  │      │  │ (桌面辅助引擎)   │  │
│          │      │  │ /repos/project-a  │  │      │  │ C:\projects\... │  │
│          │      │  │ /repos/project-b  │  │      │  └─────────────────┘  │
│          │      │  └────────┬─────────┘  │      └───────────────────────┘
│          │      │           │             │
│          │      │  ┌────────┴─────────┐  │
│          │      │  │ Session Manager  │  │
│          │      │  │ Repo Router      │  │
│          │      │  │ SQLite (全量缓存) │  │
│          │      │  │ Agent Daemon     │  │
│          │      │  └──────────────────┘  │
└──────────┘      └───────────────────────┘
```

**核心理念**: Claude Code CLI 是**唯一执行引擎**，云上是主执行环境，桌面端是可选的辅助执行环境。手机是完整的客户端（含离线缓存 + 会话管理）。

**AI 架构**: 单智能体——**Claude Code CLI** 本身就是完整的 AI 编程 Agent，不需要 Builder/Coder 分工（Anthropic 已在 Claude 模型层面解决）。

### 1.3 关键差异

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 | 差异原因 |
|------|-----------|---------------------------|---------|
| **执行引擎位置** | 火山云端（强依赖） | 用户自建 ECS（用户可控） | 字节封闭生态 vs 用户自有云 |
| **AI 引擎** | 豆包/DeepSeek | Claude Code CLI | 不同厂商，不同能力边界 |
| **Agent 分层** | 双智能体（Builder+Coder） | 单 Agent（Claude 全能） | Claude 已内置多 Agent 协作 |
| **桌面端角色** | 云端的手臂（必须安装） | 可选辅助执行环境 | Trae 桌面做文件操作，Bridge 做文件操作+备胎推理 |
| **代码所有权** | GitHub 同步（云端决定） | 用户云服务器 `/repos/` + GitHub | 去中心化 vs 中心化 |

---

## 二、功能设计对比

### 2.1 会话/任务模型

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **核心抽象** | **Task**（任务 = 完整需求→交付闭环） | **Session**（会话 = 一个 Claude 进程） |
| **任务分解** | Builder 拆解 → Coder 逐子任务执行 | Claude 自己决定执行顺序 |
| **并行能力** | 多个 Task 分配到不同设备并行 | 多个 Session → 多 Claude 进程并行（同一台云） |
| **状态模型** | task.status: queued→running→completed/failed/paused | session.state: idle→running→waiting_approval→error |
| **任务可见性** | 手机端可查看所有任务（含已完成的） | 手机端可查看所有会话（含已归档的） |
| **断点续作** | 四层 State Sync 保证 | seq 去重 + SQLite 全量历史 → Claude 从上下文继续 |

**借鉴**: Trae Solo 的 Task 抽象在复杂项目管理上更优——一个 Task 可以包含多个子任务。ClawdBridge 当前是 1 Session = 1 Claude 进程，缺少 Task 层级的组织。

**改进建议**: Phase 2 增加 Task 层级——Task 包含多个 Session，用户可以创建 "修复登录模块" 的 Task，Cloud Agent 自动拆分为多个 Session。

### 2.2 审批机制

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **审批触发方式** | 云端 Agent 内部权限检查（推断） | Claude Code 原生的 permission_request hook |
| **审批内容** | 未知（推断操作类型+目标） | operation / target / risk 三级信息 |
| **审批粒度** | 未知 | once（本次） / session（整段会话始终允许） |
| **超时处理** | 未知 | 60s → auto_rejected → 通知手机 |
| **白名单** | 未知（推断云端层） | ApprovalWhitelist Map（内存级，会话结束清空） |
| **审批 UI** | Trae App 内弹窗 | ApprovalCard 组件（操作/路径/风险+拒绝/允许按钮） |

**借鉴**: Trae Solo 的审批机制没有在公开材料中充分描述。ClawdBridge 的审批是目前最清晰的设计。

### 2.3 语音/多模态输入

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **语音输入** | 内建 ASR/TTS | expo-speech-recognition（系统级 ASR） |
| **图片输入** | 支持（未公开详情） | 不支持（Phase 2 计划） |
| **Markdown 输入** | 支持 | 支持（InputBar 组件含 Markdown 快捷插入） |

**借鉴**: Trae Solo 的 ASR 是字节生态内建（豆包语音模型），质量可能更高。ClawdBridge 依赖系统级 ASR，质量受限于手机系统。

### 2.4 代码/文件同步

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **主要同步方式** | GitHub 自动推送 | GitHub（Claude 自动 git push） |
| **同步触发** | 每个 Task 完成时 | 每个 Session 中 Claude 自行决定何时 commit/push |
| **云端存储** | 火山引擎存储（代码+日志） | 用户自建 ECS 本地磁盘 `/repos/` |
| **多端同步** | 三端（Web+桌面+手机） | 手机端只读（通过 Cloud Agent 转发），桌面端可写 |
| **安全性** | 厂商托管 | 用户自管——代码不离开用户控制的服务器 |

**借鉴**: Trae Solo 的多端同时可写是更强的能力——手机端发起的任务，Web 端可以实时看到进度。ClawdBridge 目前手机端是单端操作，未来可以加 Web 端做只读监控。

### 2.5 离线支持

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **手机离线** | 推断离线缓存（本地数据库） | SQLite 本地缓存 + 前台自动重连 + session_sync 全量恢复 |
| **桌面离线** | 云端 Agent 自动接管 | Cloud Agent 始终在线，桌面离线不影响 |
| **云端离线** | 不可能（字节 99.9% SLA） | 不可能（用户自建 ECS 99.9%） |
| **消息可靠性** | 四层 State Sync | seq 去重 + ACK + 补发 |

---

## 三、通信协议对比

### 3.1 核心通信路径

```
Trae Solo:
  手机 ──WSS──→ 火山云 (Agent+Sync) ──WSS──→ 桌面 (SOLO Desktop)
  
  方向: 手机→云→桌面→云→手机
  
  角色: 手机=遥控器, 云=大脑+存储, 桌面=手臂

ClawdBridge Cloud Agent v2:
  手机 ──WSS──→ Cloud Agent (ECS) ──WSS──→ Desktop Bridge (可选)
  
  方向: 手机→云→手机（桌面可选）
  
  角色: 手机=遥控器+本地缓存, 云=大脑+存储+执行, 桌面=可选辅助执行
```

### 3.2 WebSocket 消息协议

| 维度 | Trae Solo（推断自逆向） | ClawdBridge Cloud Agent v2 |
|------|----------------------|---------------------------|
| **协议** | JSON over WSS | JSON over WSS |
| **消息类型数** | ~4（task_create, task_update, state_sync, ping） | **13**（10 Bridge + 3 Relay 新增） |
| **消息信封** | {type, timestamp, clientId, sessionId, payload} | {id, type, sessionId, timestamp, seq, payload} |
| **去重机制** | 未公开 | **seq 自增 + ACK**（Bridge 确认已处理） |
| **流式输出** | SSE 或 WebSocket chunk（推断） | assistant_stream 逐 token |
| **心跳** | ping/pong（推断） | 30s ping/pong，超时断连 |

### 3.3 REST API 端点

| 端点 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| 认证 | 火山引擎 OAuth 2.0（推断） | GitHub OAuth 2.0 + 自建 JWT HS256 |
| Token 刷新 | 未知 | `POST /api/auth/refresh` → 新 pair |
| 设备管理 | 未知 | `GET/POST/DELETE /api/devices` |
| 会话管理 | 未知 | `GET/POST /api/sessions` + `GET /api/sessions/:id/messages` |
| 审批 | 推断走 WebSocket | WebSocket approval_request/response（不走 REST） |

**借鉴**: Trae Solo 的 API 没有公开文档。ClawdBridge 的 5 个 REST 端点已完整定义并实现。

### 3.4 Cloud Agent 新增的中继消息类型

```typescript
// Cloud Agent 特有的 3 种协议层消息（不经过 Claude）
type RelayDesktopOnline = { type: 'relay:desktop_online'; sessionId; deviceId };
type RelayCloudFallback = { type: 'relay:cloud_fallback'; sessionId; reason };
type RelayHandback = { type: 'relay:handback'; sessionId };
```

这些消息 Trae Solo **不需要**——因为 Trae 的桌面端始终是"手臂"，不存在云上接管→交还的场景。Cloud Agent v2 需要这三条是因为桌面端是**可选**的——云端在主执行，桌面随时可以加入或退出。

---

## 四、接口设计对比

### 4.1 手机→云接口

| 接口 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| 创建任务 | `POST /task`（推断） | WebSocket `create_session` |
| 发送消息 | WebSocket `user_message` | WebSocket `user_message`（完全相同） |
| 审批响应 | WebSocket（推断） | WebSocket `approval_response` + {decision, scope} |
| 查询任务列表 | `GET /tasks`（推断） | `GET /api/sessions` |
| 查询消息历史 | 推断走 WebSocket sync | `GET /api/sessions/:id/messages?before=ts` |

### 4.2 云→AI 执行接口

| 接口 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **AI 引擎调用** | 火山 API（豆包/DeepSeek） | Claude Code CLI 子进程 `stdin/stdout` |
| **调用方式** | HTTP API（推断） | `child_process.spawn` + 管道 |
| **上下文管理** | 云端 State Sync（推断） | stdin 注入前 50 条对话 + "Continue from where you left off" |
| **工具调用** | 豆包 Tool Use（推断） | Claude 原生 tool_use |
| **费用** | 火山币 | Anthropic API 按量付费 |

### 4.3 云→桌面接口

| 接口 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **连接方向** | 云端主动连桌面？(推断) | **桌面主动出站**连接云（不要公网 IP） |
| **桌面执行指令** | 云端分发 Task（推断） | 桌面连接后自动同步当前 session 列表 |
| **桌面文件操作** | SOLO Desktop 执行文件/Shell | Claude Code CLI 在桌面本地执行 |
| **桌面离线** | 云端自动接管（始终这样） | Cloud Agent 云上 Claude 接管 → 桌面重连后交还 |

---

## 五、数据持久化对比

### 5.1 存储架构

| 层 | Trae Solo | ClawdBridge Cloud Agent v2 |
|----|-----------|---------------------------|
| **手机端** | 推断有本地存储（React Native？） | SQLite 5 表 + WAL 模式 |
| **云端** | 火山云存储（全量 State Sync） | Cloud Agent SQLite（全量持久化） |
| **桌面端** | GitHub 同步 | Claude Code 直接操作本地文件 |
| **代码** | GitHub 自动推送 | GitHub + 云服务器本地 `/repos/` |

### 5.2 缓存策略

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **热数据** | 推断云端内存 | 进程内 Map（最近 200 条） |
| **温数据** | 云端 State Sync | SQLite（全量永久） |
| **冷数据** | GitHub | GitHub |
| **消息去重** | 四层同步推断有去重 | `<sessionId>-<seq>` 序列号 + ACK |
| **离线队列** | 未知 | seq 补发机制 |

---

## 六、安全设计对比

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **传输加密** | WSS + TLS（推断） | WSS + Let's Encrypt TLS 1.3 |
| **身份认证** | 火山引擎 OAuth（推断） | GitHub OAuth 2.0 + 自建 JWT HS256 |
| **Token 时效** | 未知 | access: 15min, refresh: 7d |
| **代码安全** | GitHub 权限控制 | 用户自管 ECS + GitHub |
| **数据隐私** | 字节云存储（代码+日志） | 用户自建云——数据完全自主 |
| **端到端加密** | 未知 | 中继不解密消息内容 |
| **API Key** | 火山 API Key | Anthropic API Key 仅存 Environment Variable |

**关键差异**: Trae Solo 的数据安全依赖于字节跳动的安全体系。ClawdBridge 的数据安全依赖于**用户自己对云服务器的管理**——这对个人开发者更可控，但需要用户有一定的运维能力。

---

## 七、部署方案对比

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **手机** | Trae App（应用商店下载） | Expo Go 开发版 → 后续 eas build 独立 APK/IPA |
| **云端** | 字节跳动托管（用户不可见） | 用户自建 ECS/Fly.io |
| **桌面** | SOLO Desktop 安装包 | Claude Code CLI（npm install）+ Bridge Client |
| **运维责任** | 字节 | 用户（PM2 + systemd + nginx） |
| **费用** | 火山币 + 订阅 | ECS ~$5/月 + Anthropic API |
| **最低服务器** | 不需要用户管 | 1 核 512MB ECS |

---

## 八、优势矩阵总结

### 8.1 Trae Solo 的优势（ClawdBridge 可借鉴）

| # | Trae Solo 优势 | ClawdBridge 现状 | 可借鉴程度 |
|---|---------------|-----------------|-----------|
| 1 | **Task 层级抽象**（任务包含多子任务） | Session 单层 | ⭐⭐⭐ 高——Phase 2 加 Task 层 |
| 2 | **双智能体分工**（Builder 规划 + Coder 执行） | Claude 全能（不分工） | ⭐ 低——Claude 内建分工 |
| 3 | **四层全量 State Sync** | 三层 + SQLite | ⭐⭐ 中——可加代码服务器同步层 |
| 4 | **多端同时可写**（Web+桌面+手机） | 手机端单端操作 | ⭐⭐ 中——可加 Web 监控端 |
| 5 | **原生 ASR/TTS** | 系统级 expo-speech-recognition | ⭐ 低——字节生态独有 |
| 6 | **零运维**（字节托管） | 需自建 ECS | ⭐⭐ 中——可加一键部署脚本 |
| 7 | **三端同步**（Web+桌面+手机） | 手机为主 | ⭐⭐ 中——Phase 2 可加 Web 端 |

### 8.2 ClawdBridge 的优势（Trae Solo 不具备）

| # | ClawdBridge 优势 | 原因 |
|---|-----------------|------|
| 1 | **Claude Code 执行** | 推理质量公认最强，代码生成优于豆包/DeepSeek |
| 2 | **去中心化** | 代码不离开用户控制的服务器，无厂商锁定 |
| 3 | **审批白名单** | once/session 二级粒度 + 60s 超时，Trae Solo 无等效机制 |
| 4 | **seq 去重 + ACK** | 消息可靠性优于 Trae Solo 的未知实现 |
| 5 | **10 种 WebSocket 消息类型** | 完整 TypeScript 定义，可解析可扩展 |
| 6 | **CLI 驱动架构** | 任何支持 stdin/stdout 的 CLI 都可以接入，不只是 Claude |
| 7 | **Agent 注册表** | 已有 10 个 AI CLI 后端的集成框架（clawd-on-desk-main/agents/） |

### 8.3 不可复制的差异（客观限制）

| 差异 | 原因 | 影响 |
|------|------|------|
| Trae Solo 的零运维 | 字节有 10 万+ 台服务器的云基础设施 | ClawdBridge 需要用户自建 ECS——Phase 2 可加一键部署降低门槛 |
| Trae Solo 的原生 ASR | 豆包 ASR 是字节内部模型 | ClawdBridge 依赖系统级 ASR——质量略低但不是核心路径 |
| Trae Solo 的双智能体 | 字节的自研 Agent 架构 | Claude 不需要——Claude Sonnet 4 本身就是超强 Agent |
| Claude 审批开销 | Trae 字节云端可自动审批 | ClawdBridge 用户手动审批——更安全但更慢 |

---

## 九、最终结论

```
                    Trae Solo                    ClawdBridge Cloud Agent v2
                    ─────────                    ──────────────────────────
架构复杂度:         ⭐⭐⭐⭐ 高（双Agent+四层Sync） ⭐⭐⭐ 中（单Agent+三层+Redis/SQLite）
AI 引擎:           豆包/DeepSeek                  Claude Code CLI
数据主权:          字节托管                      用户自管 ECS
手机离线:          推断支持                       SQLite + 自动重连 + seq 补发 ✅
桌面离线:          云端始终接管                   云上 Claude 接管 + 桌面重连后交还 ✅
多仓库并行:         Task 分配到不同设备            Session 绑定 workDir + 多 Claude 进程 ✅
安全审批:          云端自动审批(推断)             手机手动审批 once/session + 白名单 ✅
部署难度:          应用商店安装                    需自建 1 台 ECS ($5/月)
```

**一句话**: ClawdBridge Cloud Agent v2 在 AI 引擎（Claude）、数据主权（用户自管）、审批安全性（手动手动白名单）上优于 Trae Solo；在 Task 层级抽象、原生 ASR、零运维体验上落后于 Trae Solo。两者在架构模式上殊途同归——都采用了"云端 Agent + WebSocket + 状态同步"的三层架构——差异主要在 AI 引擎选择和数据处理主权上。
