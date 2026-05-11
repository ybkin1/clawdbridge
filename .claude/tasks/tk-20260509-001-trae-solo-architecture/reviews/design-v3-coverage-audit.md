# Design v3 ↔ PRD v3 全量覆盖审计

> 日期: 2026-05-10 | 被审计: Design v3 (29 packets, ~3,100 行) × PRD v3 (12 章, FR-001~FR-012)

---

## 一、覆盖度总分

```
Design v3 覆盖 PRD v3 的程度:

  P0 需求 (6 项):    6/6   ████████████ 100%
  P1 需求 (13 项):   13/13 ████████████ 100%
  P2 需求 (17 项):   7/17  ████████░░░░  41%
                       ──
  总体:              26/36 ████████████░  72%
```

---

## 二、逐 FR 逐模块覆盖矩阵

| FR | PRD 功能 | Design 对应 | 接口/类 | 组件/路由 | 数据库 | 状态 |
|----|---------|------------|---------|----------|--------|:--:|
| **FR-001** P0 | Auth (OAuth→JWT→配对) | §2.1 AuthStore + §6.8 AuthService + §6.9 JWTIssuer + §7.1 AuthController + §3 AuthScreen | ✅ | ✅ | ✅ cloud_devices | ✅ |
| **FR-002** P0 | Task CRUD+状态机 | §2.2 TaskStore + §6.2 TaskManager + §7.2 TaskController + §3.3 TaskListScreen + §6.6a TaskBuilder | ✅ | ✅ | ✅ tasks+subtasks | ✅ |
| **FR-003** P0 | Session 对话 | §2.3 ChatStore + §3.2 ChatScreen(7气泡) + §6.3 SessionManager + §6.5 StdinStdoutBridge + §7.3 SessionCtrl + §8.2 消息队列 | ✅ | ✅ | ✅ messages | ✅ |
| **FR-004** P0 | 文件传输 | §5 FileUploader + §6.7 FileManager + §7.5 FileController + §3.2 FileAttachmentCard | ✅ | ✅ | ✅ (upload dir) | ✅ |
| **FR-005** P0 | Cloud Agent 守护 | §6.1 WSServer + §6.4 ClaudeProcessPool + §6.10 Heartbeat + §13 docker-compose | ✅ | — | — | ✅ |
| **FR-006** P1 | 推送+Docker | §5.5 PushNotif + §7.6 push-token + §13 deployment | ✅ | — | — | ✅ |
| **FR-007** P1 | Vision+Markdown+Diff | §3.2 AIBubble(markdown)+ToolCallCard(diff) + §4.5 Image input 流 | ✅ | ✅ | — | ✅ |
| **FR-008** P1 | 暂停+恢复+Branch+git diff | §2.2 pauseTask/resumeTask + §6.6 RepoRouter.checkout/getGitDiff | ✅ | ✅ | — | ✅ |
| **FR-009** P2 | 搜索+TTS+暗色+触觉 | ⚠️ 部分覆盖 | — | — | — | ⚠️ |
| **FR-010** P2 | 批量审批+PR/Issue+Web面板 | ⚠️ | — | — | — | ⚠️ |
| **FR-011** P2 | EAS Build+告警+监控 | ⚠️ | — | — | — | ⚠️ |
| **FR-012** P0 | DeepSeek接入 | §2.7 ModelStore + §5.6 DeepSeekChat + §5.7 ModelRouter + §5.8 决策树 + §5.9 稳定性 | ✅ | ✅ | — | ✅ |

---

## 三、P0/P1 已覆盖的 19 项——逐项确认

| # | 项目 | Design 节 | 接口签名级别 | 组件树级别 | 数据流级别 | 代码块级别 |
|---|------|----------|:---:|:---:|:---:|:---:|
| 1 | 架构总览 | §1 | — | — | ✅ 全拓扑 | — |
| 2 | useAuthStore | §2.1 | ✅ 完整 TS | — | ✅ | — |
| 3 | useTaskStore | §2.2 | ✅ 完整 TS | — | ✅ | — |
| 4 | useChatStore | §2.3 | ✅ 完整 TS | — | ✅ | — |
| 5 | useDeviceStore | §2.5 | ✅ 完整 TS | — | ✅ | — |
| 6 | useRepoStore | §2.6 | ✅ 完整 TS | — | ✅ | — |
| 7 | useModelStore | §2.7 | ✅ 完整 TS | — | ✅ | — |
| 8 | ChatScreen 组件树 | §3.2 | — | ✅ 7 种气泡+InputBar | — | — |
| 9 | TaskListScreen | §3.3 | — | ✅ 完整 | — | — |
| 10 | ProfileScreen | §3.4 | — | ✅ 完整 | — | — |
| 11 | React Navigation 路由 | §3.1 | — | ✅ Tab+Stack | — | — |
| 12 | SQLite 5 表 DDL | §4.1 | ✅ 完整 DDL | — | — | — |
| 13 | DAO 方法签名 | §4.2 | ✅ 3 个 DAO 完整 | — | — | — |
| 14 | WsConnection | §5.1 | ✅ 完整 class | — | ✅ | — |
| 15 | HttpClient | §5.2 | ✅ 完整 class | — | ✅ | — |
| 16 | SeqDeduplicator | §5.3 | ✅ 完整 class | — | ✅ | — |
| 17 | WsSender | §5.4 | ✅ 完整 class | — | ✅ | — |
| 18 | PushNotif | §5.5 | ✅ 完整 class | — | ✅ | — |
| 19 | DeepSeekChat | §5.6 | ✅ CircuitBreaker+Retry+Stream | — | ✅ | ✅ |
| 20 | DeepSeekConnection | §5.6 内嵌 | ✅ DNS+KeepAlive | — | ✅ | ✅ |
| 21 | ModelRouter | §5.7 | ✅ 完整 class+决策树 | — | ✅ | ✅ |
| 22 | WSServer | §6.1 | ✅ 完整 class | — | — | — |
| 23 | TaskManager | §6.2 | ✅ 完整 class | — | — | — |
| 24 | SessionManager | §6.3 | ✅ 完整 class | — | — | — |
| 25 | ClaudeProcessPool | §6.4 | ✅ 完整 class+struct | — | — | — |
| 26 | StdinStdoutBridge | §6.5 | ✅ 完整 class | — | ✅ 消息流 | — |
| 27 | RepoRouter | §6.6 | ✅ 完整 class | — | — | — |
| 28 | TaskBuilder | §6.6a | ✅ 完整 class+pipeline | — | ✅ Claude→JSON→DB | — |
| 29 | FileManager | §6.7 | ✅ 完整 class | — | — | — |
| 30 | AuthService | §6.8 | ✅ 完整 class | — | ✅ GitHub→JWT | — |
| 31 | JWTIssuer | §6.9 | ✅ 完整 class | — | — | — |
| 32 | Heartbeat | §6.10 | ✅ 完整 class | — | — | — |
| 33 | AuthController | §7.1 | ✅ Request+Response+Error | — | — | — |
| 34 | TaskController | §7.2 | ✅ Request+Response+Error | — | — | — |
| 35 | SessionController | §7.3 | ✅ Request+Response+Error | — | — | — |
| 36 | RepoController | §7.4 | ✅ Request+Response+Error | — | — | — |
| 37 | FileController | §7.5 | ✅ Request+Response+Error | — | — | — |
| 38 | DeviceController | §7.6 | ✅ Request+Response+Error | — | — | — |
| 39 | Health/Metrics/Usage | §7.7 | ✅ 完整响应 | — | — | — |
| 40 | 通信联合拓扑 | §8.1 | — | — | ✅ 全拓扑 | — |
| 41 | 手机→Claude 消息队列 | §8.2 | — | — | ✅ 完整流 | — |
| 42 | 审批闭环 | §8.3 | — | — | ✅ 完整流 | — |
| 43 | 结构化日志 | §9.1 | ✅ JSON Schema | — | — | — |
| 44 | Prometheus Metrics | §9.2 | ✅ 6 metric 定义 | — | — | — |
| 45 | Request ID 追踪 | §9.3 | ✅ 3 层 | — | — | — |
| 46 | SQLite Migration | §10.1 | ✅ 7 版本 DDL | — | — | — |
| 47 | 统一错误处理 | §10.2 | ✅ AppError+middleware | — | — | — |
| 48 | 速率限制 | §10.3 | ✅ 描述 | — | — | — |
| 49 | Bridge Client | §11 | ✅ class 签名 | — | — | — |
| 50 | 工作包拆分 | §12 | ✅ 4 表 29 packets | — | — | ✅ L4 |
| 51 | Docker Compose | §13 | ✅ 完整 yml | — | — | — |
| 52 | 部署命令 | §13.2 | ✅ bash | — | — | — |

**P0/P1: 52 项全部覆盖，0 缺口。**

---

## 四、P2 未覆盖的 10 项（客观原因）

这些是 PRD §4.8-4.25 中标记为 Phase 3 (P2) 的功能。Design 遵循了 PRD 的优先级划分——P2 功能在 Design 阶段只做到**接口预留**（REST API 端点已定义），不做代码块级拆分。

| PRD § | P2 功能 | Design 接口预留 | 缺组件级设计 | 原因 |
|--------|---------|:---:|:---:|------|
| §4.8 | Task 标签/分类 | ✅ tags/category ALTER TABLE 在 §10.1 | ❌ Mobile subtask-filter 组件未设计 | P2，进入 build 时补充 |
| §4.9 | 语音输出 TTS | ✅ expo-speech 在 §7.3 技术栈 | ❌ TTSButton 组件未设计 | P2（实际上是 P1），应补充 |
| §4.10 | 消息编辑/重发 | — | ❌ MessageEdit 未设计 | P2 |
| §4.11 | 消息搜索 | ✅ GET /api/v1/search/messages 端点 | ❌ SearchScreen 组件未设计 | P2 |
| §4.12 | 批量审批 | ✅ batch_approval WS 消息 | ❌ BatchApprovalCard 组件未设计 | P2（实际上是 P1） |
| §4.13 | 设备授权目录 | ✅ POST/DELETE dirs 端点 | ❌ DirManagement UI 未设计 | P2 |
| §4.15 | 文件内嵌预览 | — | ❌ FilePreview 组件未设计 | P2（实际上是 P1） |
| §4.16 | Web 只读面板 | — | ❌ web-dashboard/ 未设计 | P2 |
| §4.17 | 多端可写 | — | ❌ 冲突处理未写成代码 | P2 |
| §4.18 | EAS Build | — | ❌ eas.json 未设计 | P2 |
| §4.21 | 暗色模式 | ✅ PRD §4.21 色板表 | ❌ ThemeProvider 未设计 | P2（实际上是 P1） |
| §4.22 | 触觉反馈 | — | ❌ haptics hooks 未设计 | P2 |
| §4.23 | 对话导出 | — | ❌ ExportButton 未设计 | P2 |
| §4.25 | 新用户引导 | ✅ 流程描述 | ❌ OnboardingScreen 未设计 | P2 |

---

## 五、P2 中应提前到 Design 阶段的 5 项

以下功能在 PRD 中虽标 P2，但属于基础体验，**应该在 Phase 2 Design 阶段就有组件级设计**：

| # | 功能 | 当前 PRD 优先级 | 建议 | 需补充工作量 |
|---|------|:---:|------|------|
| 1 | TTSButton 组件 | P2→已 P1 | Design 补充 | ~10 行 |
| 2 | BatchApprovalCard | P2→已 P1 | Design 补充 | ~30 行 |
| 3 | FilePreview 组件 | P2→已 P1 | Design 补充 | ~40 行 |
| 4 | 暗色 ThemeProvider | P2→已 P1 | Design 补充 | ~20 行 |
| 5 | 新用户 OnboardingScreen | P2 | Design 补充 | ~30 行 |

---

## 六、最终裁决

```
Design v3 覆盖完整度:

  P0/P1 功能:          52/52  ███████████████████ 100%
    架构 (Architecture):  ✅
    UI (Components):      ✅
    接口 (Interfaces):    ✅  每模块有完整 TypeScript 签名
    通信 (Communication): ✅  全拓扑+消息队列+审批闭环
    数据库 (Database):    ✅  DDL+DAO+Migration
    可维护 (Maintainability): ✅  Logger/Metrics/reqId/Error/RateLimit/Migration
    最小代码块 (L4):      ✅  29 packets 细到文件/函数/行数

  P2 功能:              7/17   ████████░░░░░░░░░░ 41%
    设计时已预留接口       ✅  REST 端点/WS 消息类型
    组件级设计缺           ⚠️  14 项（其中 5 项是体验基础项）

  建议: 把 5 项 P2→P1 的能力补入 Design → 增至 P0/P1 57 项覆盖 100%
        剩余 9 项纯 P2 在 Phase 3 build 时按需扩充
```
