# PRD：ClawdBridge Mobile — Cloud Agent v2 产品需求文档

> 版本: v3.0 | 2026-05-10 | 阶段: 重新定稿
> document_class: product_requirements | depth_profile: comprehensive | maturity_target: draft
> 变更: v2→v3 = 架构从 Bridge 桌面为主 → Cloud Agent 云为主 + Task 层级 + 多仓库路由 + 全量 SQLite 缓存
> 基于: [Design v3](clawdbridge-design-tk-20260509-001-v3.md), [Cloud Agent v2 评估](../reviews/cloud-agent-v2-assessment.md), [Trae Solo 全维对比](../reviews/trae-vs-clawdbridge-comprehensive-comparison.md)
> 📌 **全文注**: 本文档中的 "Claude Code CLI" / "Claude" 统一指 "Claude Code Agent 框架 + Kimi kimi2.6 后端模型"

---

## 1. 产品定位

### 1.1 一句话

**ClawdBridge Mobile** 是一款手机端 AI 编程助手 App，通过云服务器上始终在线的 Claude Code Agent，让用户在手机上以对话方式完成代码编写、项目管理和多仓库开发任务。

### 1.2 与 Trae Solo 的差异化定位

| 维度 | Trae Solo | ClawdBridge Mobile |
|------|-----------|-------------------|
| **AI 引擎** | 豆包/DeepSeek | Claude Code CLI |
| **执行环境** | 字节云端（不可见） | 用户自建 ECS（完全可控） |
| **数据主权** | 厂商托管 | 用户自己云服务器 + GitHub |
| **支持多仓库** | Task 分配到不同设备 | Session 绑定不同 workDir + 多 Claude 进程并行 |
| **审批机制** | 云端自动（推断） | 手机手动 once/session 白名单 |
| **离线策略** | 云端始终接管 | Cloud Agent 云上始终在线 + SQLite 全量缓存 |
| **部署难度** | 应用商店安装 | 1 台 ECS + 1 条命令 |

### 1.3 用户画像

| 角色 | 场景 | 核心需求 |
|------|------|---------|
| 独立开发者 | 在路上有灵感，想立即改代码 | 手机发指令 → 云上 Claude 直接执行 → 看结果 |
| 技术 Leader | 手机上 Code Review + 发小任务 | 查看多仓库进度，给 Claude 下指令 |
| 学生/学习者 | 在手机上问 Claude 代码问题 | 对话式学习 + Claude 自动写代码+解释 |
| **运维者** 🆕 | 部署 Cloud Agent 到 ECS，监控运行状态，排查故障 | 一键部署、健康检查、日志查看、费用监控 |

### 1.4 需求 ID 索引（🆕 FIN-010）

| ID | 优先级 | 功能 |
|----|--------|------|
| FR-001 | P0 | GitHub OAuth 登录 → JWT 签发 → 设备自动配对 |
| FR-002 | P0 | Task 创建/列表/状态跟踪 (pending→in_progress→completed→failed→paused) |
| FR-003 | P0 | Session 对话 (文本/Markdown/流式响应/工具调用卡片/审批卡片) |
| FR-004 | P0 | 文件上传下载 (500MB/15+类型/HTTP Multipart/仓库文件树) |
| FR-005 | P0 | Cloud Agent 守护 (PM2/始终在线/崩溃自动恢复) |
| FR-006 | P1 | 推送通知 (FCM/APNs) + Docker Compose 一键部署 |
| FR-007 | P1 | 图片输入 Claude Vision + Markdown 全渲染 + 代码 diff 预览 |
| FR-008 | P1 | Task 暂停/恢复 + Branch 选择 + git diff 摘要 |
| FR-009 | P2 | 消息搜索 (FTS5) + 语音 TTS + 暗色模式 + 触觉反馈 |
| FR-010 | P2 | 批量审批 + GitHub PR/Issue 浏览 + Web 只读面板 |
| FR-011 | P2 | 独立 App 分发 (EAS Build) + 异常告警 + 监控面板 |
| FR-012 🆕 | P0 | DeepSeek API 接入 (CircuitBreaker+Retry+DNS 预解析+ModelRouter 智能路由) |

---

## 2. 核心概念

### 2.1 三层抽象：Task → Session → Claude 进程

```
Task（用户视角·业务需求）
  │  "给 App 加暗色模式"
  │
  ├── Session #1（Claude 执行单元·分析现有主题）
  │     └── Claude 进程 (workDir: /repos/app, state: completed)
  │
  ├── Session #2（Claude 执行单元·修改 CSS 变量）
  │     └── Claude 进程 (workDir: /repos/app, state: completed)
  │
  └── Session #3（Claude 执行单元·测试）
        └── Claude 进程 (workDir: /repos/app, state: running)
```

| 概念 | 定义 | 生命周期 | 用户可见 | 持久化 |
|------|------|---------|---------|--------|
| **Task** | 用户业务需求的闭环单元 | 跨天/跨周 | ✅ 手机端 Task 列表 | SQLite |
| **Session** | 一次 Claude 对话上下文 | 数分钟～数小时 | ✅ Task 内的子项 | SQLite（全量消息） |
| **Claude 进程** | 云上的 `claude` 子进程实例 | 随 Session 创建/结束 | ❌ 系统级 | 不持久化 |

### 2.2 Task 状态机

```
pending ──→ in_progress ──→ completed
                │    │           │
                │    └──→ paused ──→ in_progress（用户恢复）
                │
                └──→ failed ──→ pending（用户重试）
```

| 操作 | 手机端 UI | Cloud Agent 操作 |
|------|---------|-----------------|
| 暂停 Task | Task 详情页点击"暂停" | `kill -SIGSTOP <claude-pid>` → status = 'paused' |
| 恢复 Task | 点击"继续" | `kill -SIGCONT <claude-pid>` → status = 'in_progress' |

### 2.3 Session 状态机

```
idle ──→ running ──→ completed
  │         │
  │         ├──→ waiting_approval ──→ running（审批通过）
  │         │                    └──→ idle（审批拒绝）
  │         │                    └──→ error（审批超时 60s·auto_rejected）
  │         │
  │         ├──→ error ──→ idle（用户手动重试）
  │         │        └──→ idle（3 次重试失败·永久失败，通知用户 + 日志）
  │         │
  │         └──→ paused ──→ running（SIGCONT）
  │
  └──（复用现有 Design §3.3 的审批状态机）
```

**降级规则**：
- `error` 状态自动重试 3 次 → 每次注入最近 50 条对话作为上下文
- 3 次均失败 → 永久 `error`，通知手机 + 写结构化错误日志
- `waiting_approval` 超时 (60s) → `auto_rejected` 写回 Session 消息流

### 2.4 与 Claude Code 任务跟踪的分层关系

```
ClawdBridge Task（用户视角·"加暗色模式"）
  │
  ├── Claude Code Task #1 (Agent 视角·tk-xxx-001)
  │     内: clarify→research→spec→design→plan→build→verify
  │     用户不直接接触，Agent 自己管理
  │
  └── Claude Code TodoWrite（会话内·"修改 theme.ts"）
        仅在单个 Session 内有效，Agent 的轻量 checklist
```

用户只看到 ClawdBridge 的 Task 和 Session。Claude Code 自身的 10 阶段状态机 + TodoWrite 是 Agent 内部工具，对用户透明。

---

## 3. 架构总览

### 3.1 Cloud Agent v2 架构

```
                    ┌────────────────────────────────────────────┐
                    │           Cloud Agent (用户 ECS)             │
                    │                                            │
  ┌──────────┐      │  ┌──────────────────────────────────────┐ │
  │ 手机 App  │◄─WSS─┼──┤ PM2 Daemon (永不死)                  │ │
  │          │      │  │                                      │ │
  │ Task 列表 │      │  │  ┌────────────────────────────────┐ │ │
  │ Session  │      │  │  │ cloud-agent.js (Node.js)        │ │ │
  │ Chat UI  │      │  │  │  ├─ WebSocket Server (WSS:443)  │ │ │
  │ 审批卡片  │      │  │  │  ├─ Task Manager               │ │ │
  │ SQLite   │      │  │  │  ├─ Session Manager             │ │ │
  └──────────┘      │  │  │  ├─ Repo Router                │ │ │
                    │  │  │  └─ State Store (SQLite)        │ │ │
        (可选)      │  │  └────────────┬───────────────────┘ │ │
  ┌──────────┐      │  │               │                      │ │
  │ 桌面 Bridge│◄─WSS─┼──┤  ┌────────────┴───────────────────┐ │ │
  │ (辅助执行) │      │  │  │ Claude Code CLI 子进程池        │ │ │
  └──────────┘      │  │  │  ├─ #1 workDir:/repos/project-a │ │ │
                    │  │  │  ├─ #2 workDir:/repos/project-b │ │ │
                    │  │  │  └─ #3 workDir:/repos/project-c │ │ │
                    │  │  └──────────────────────────────────┘ │ │
                    │  └──────────────────────────────────────┘ │
                    └────────────────────────────────────────────┘
```

> **Claude 子进程可靠性** (FIN-006): 每个 Claude 子进程配备 **stdin ring-buffer**（环形缓冲区，最近 1MB），crash 后从 buffer 自动恢复最近上下文注入新进程。WAL 模式保证 Session Manager 状态不丢失。

### 3.2 三阶段执行路径

```
路径 A：云执行（默认·始终可用）
  手机 → Cloud Agent → Claude Code (云) → 读文件/写代码/Git → 结果回手机

路径 B：桌面辅助执行（可选·桌面在线时）
  手机 → Cloud Agent → Desktop Bridge → Claude Code (桌面) → 本地文件执行 → 结果回手机

路径 C：手机纯聊天降级（Phase 3·云/桌面均不可用时）
  手机 → Kimi/MiniMax API → 纯文本对话
```

### 3.3 仓库路由

```typescript
// Cloud Agent 的仓库注册表 (v3 补全：增加 branches)
const repoRegistry = {
  'main-project': { workDir: '/repos/main-project', gitRemote: '...', branches: ['main', 'develop', 'feat/*'] },
  'api-service':  { workDir: '/repos/api-service',  gitRemote: '...', branches: ['develop', 'release/*'] },
  'docs-site':    { workDir: '/repos/docs-site',    gitRemote: '...', branches: ['main'] },
};
```

手机端创建 Task 时选择仓库 + 选择 branch → Cloud Agent 绑定 workDir + `git checkout <branch>` → Claude 子进程在对应分支上执行。Task 结束时自动 `git diff` → 推送 diff 摘要到手机。

---

## 4. 功能设计

### 4.1 模块全景

```
ClawdBridge Mobile App
├─ 模块 A：认证与账户
│   ├─ GitHub OAuth 登录
│   ├─ JWT Token 管理
│   └─ Cloud Agent 连接配置
│
├─ 模块 B：Task 管理（🆕 v3 新增）
│   ├─ 创建 Task（选仓库 + 描述需求）
│   ├─ Task 列表（按时间排序/状态筛选）
│   ├─ Task 进度跟踪
│   └─ Task 重试/归档
│
├─ 模块 C：会话（Session）交互
│   ├─ 对话气泡（用户/AI/工具调用/错误/审批/文件附件）
│   ├─ 流式响应（打字机效果）
│   ├─ 代码块语法高亮 + 长按复制
│   ├─ Markdown 完整渲染（表格/列表/blockquote/代码块）
│   ├─ 工具调用卡片 + 代码 diff 预览
│   └─ 图片输入（📷 拍照 → Claude vision 分析）
│
├─ 模块 D：审批
│   ├─ 审批卡片（操作类型/目标/风险）
│   ├─ 允许/拒绝（once / session scope）
│   ├─ 60s 超时 → auto_rejected
│   └─ 白名单管理
│
├─ 模块 E：设备管理
│   ├─ 桌面 Bridge 在线/离线
│   ├─ 云 Agent 状态
│   └─ 设备配对
│
└─ 模块 F：仓库管理（🆕 v3 新增）
    ├─ 已注册仓库列表
    ├─ 仓库添加/删除
    └─ 默认仓库设置

└─ 模块 G：文件传输（🆕 v3 新增）
    ├─ 手机拍照/相册上传到云
    ├─ 云上文件/产物下载到手机
    ├─ 对话中文件附件展示
    └─ 仓库文件树浏览

└─ 模块 H：实时通知（🆕 v3 补全）
    ├─ 后台推送通知（FCM / APNs）
    ├─ App 图标角标（未读审批/未读消息）
    └─ Task 完成通知

└─ 模块 I：开发者体验（🆕 v3 补全）
    ├─ Docker Compose 一键部署
    ├─ Cloud Agent 健康检查（/health 端点）
    ├─ API 用量/费用监控
    └─ 暗色模式

└─ 模块 J：增强体验（P2）
    ├─ Task 标签/分类 + 消息搜索（FTS5）
    ├─ 语音输出 TTS + 触觉反馈
    ├─ 消息编辑/重发/删除
    ├─ 批量审批 + 设备授权目录管理
    ├─ GitHub PR/Issue 浏览
    ├─ 文件内嵌预览（图片/PDF/Office）
    ├─ Web 只读监控面板 + 多端可写
    ├─ 独立 App 分发 (EAS Build + OTA)
    ├─ Cloud Agent 监控面板 + 异常告警
    ├─ 对话导出 + App 角标 + 新用户引导
    └─ 暗色模式（跟随系统）
```

### 4.2 Task 管理详细

| 操作 | 手机端 UI | Cloud Agent 操作 |
|------|---------|-----------------|
| 创建 Task | 输入标题 + 选仓库 → 确认 | `taskManager.create(title, repo)` → 写入 SQLite |
| 查看 Task 列表 | Task 列表页（按时间降序） | `SELECT * FROM tasks ORDER BY created_at DESC` |
| 进入 Task | 点击 → 展开 Sessions 列表 | 加载该 Task 下的所有 Session |
| 新建 Session | Task 内点击"继续" | `sessionManager.create(taskId, workDir)` → spawn Claude |
| Task 完成 | Claude 判断任务达成 → 自动标记 | `taskManager.markCompleted(taskId)` |
| Task 重试 | 用户点击"重试" | `taskManager.retry(taskId)` → 创建新 Session 并注入上下文 |

### 4.3 仓库管理详细

手机端创建 Task 时显示的仓库列表，来自 Cloud Agent 的 `repoRegistry`：

```
手机端 UI:
  ┌─────────────────────────────────┐
  │  创建 Task                       │
  │                                 │
  │  标题: [给 App 加暗色模式    ]    │
  │                                 │
  │  仓库: [main-project     ▾]     │
  │        ├─ main-project          │
  │        ├─ api-service            │
  │        └─ docs-site              │
  │                                 │
  │  [创建 Task]                     │
  └─────────────────────────────────┘
```

### 4.4 文件传输详细（🆕 v3 新增）

#### 4.4.1 上传（手机 → 云）

| 操作 | 手机端 UI | Cloud Agent 操作 |
|------|---------|-----------------|
| 拍照上传 | InputBar 右侧 📷 按钮 → 拍照 → 压缩 → 上传 | `POST /api/files/upload` → 存到 `/uploads/{taskId}/` → 通知 Claude 有新文件 |
| 相册选取 | 📎 附件按钮 → 图片/文件选择器 | 同上，支持 `image/*` + `application/pdf` + `text/*` |
| 拖拽文件（P2） | 文件管理器分享到 ClawdBridge | 同上 |

上传后，Cloud Agent 将文件路径注入 Claude 的当前上下文：
```
Claude stdin: "The user has uploaded a screenshot at /uploads/task-001/screenshot.png. Analyze it."
```

#### 4.4.2 下载（云 → 手机）

| 操作 | 触发时机 | 手机端 UI |
|------|---------|---------|
| Claude 生成文件 | Claude 调用了 Edit/Bash 工具生成了产物 | 对话中出现 📎 附件卡片，点击下载 |
| 手动下载仓库文件 | 用户在文件树中选中某文件 | `GET /api/repos/:repo/files?path=src/index.ts` → 显示/保存 |
| Claude 产出报告 | Claude markdown→PDF 了 | 附件卡片 + 一键保存到手机 |

#### 4.4.3 文件消息类型

聊天窗口中新增一种消息气泡——**文件附件卡片**：

```
┌─────────────────────────────────────┐
│ 📄 screenshot.png        (2.1 MB)   │
│ ─────────────────────────────────── │
│ [下载] [预览]                        │
└─────────────────────────────────────┘
```

#### 4.4.4 仓库文件树浏览

```
手机端 UI:
  ┌─────────────────────────────────┐
  │  /repos/main-project             │
  │  ├── 📁 src/                      │
  │  │   ├── 📁 components/           │
  │  │   ├── 📄 index.ts    (4.2KB)  │
  │  │   └── 📄 utils.ts    (1.8KB)  │
  │  ├── 📄 package.json    (0.6KB)  │
  │  └── 📄 CLAUDE.md       (2.1KB)  │
  │                                   │
  │  [点击文件 → 预览/下载]             │
  └─────────────────────────────────┘
```

#### 4.4.5 传输规格

| 参数 | 值 | 理由 |
|------|----|------|
| **最大单文件** | **500MB** | 覆盖截图(2-8MB)+日志(10-50MB)+压缩包(50-200MB)+大文档/视频+办公文件全套 |
| **图片自动压缩** | 手机端压缩到 ≤ 2560px 宽 | expo-image-manipulator；超过此分辨率按比例缩放 |
| **允许类型** | `image/png, image/jpeg, image/webp, image/gif, image/bmp, image/svg+xml, image/tiff, application/pdf, text/plain, text/markdown, text/csv, application/json, application/xml, application/zip, application/gzip, application/x-tar, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document` | **图片**: png/jpeg/webp/gif/bmp/svg/tiff; **文档**: md/txt/csv/json/xml; **办公**: ppt/pptx/xls/xlsx/doc/docx; **压缩**: zip/gz/tgz |
| **禁止类型** | `.exe, .sh, .bat, .cmd, .dll, .so, .dylib, .ps1` | 安全：拒绝所有可执行/脚本文件 |
| **每日限额** | 2GB / 用户 / 天 | 4 个 500MB 文件或 200 个 10MB 文件 |
| **存储位置** | `/uploads/{taskId}/` | 按 Task 隔离，Task 完成后 14 天自动清理 |
| **传输方式** | **HTTP Multipart** | 独立 HTTP 通道，不占用 WebSocket。进度回调、断点续传、express + multer 单行代码 |
| **下载** | `GET /api/files/:fileId` → binary stream + `Content-Disposition` + `Range` header 支持断点续传 | expo-file-system.downloadAsync |

> **为什么不走 WebSocket**: 大文件会阻塞同一连接上的对话消息；Claude 最终也是通过文件路径操作，不是接收二进制帧；HTTP Multipart 有原生进度回调和断点续传支持。

### 4.5 会话交互增强（🆕 v3 补全）

#### 4.5.1 图片输入（Claude Vision）

手机端拍照或选取图片 → 自动压缩 → 上传 → Cloud Agent 注入 Claude 上下文：

```
Claude stdin: "The user has shared an image: /uploads/task-001/photo.png. Describe what you see or act based on it."
```

Claude Sonnet 4 原生支持 vision，可以直接分析图片内容——报错截图、UI 设计稿、架构图均可。

| 操作 | 手机端 | Cloud Agent |
|------|--------|-------------|
| 📷 拍照 | InputBar 相机按钮 → expo-camera → 压缩 | 同上 |
| 🖼 相册 | 附件按钮 → expo-image-picker | 同上 |
| 自动压缩 | ≤ 2560px 宽, JPEG quality 0.85 | — |

#### 4.5.2 Markdown 完整渲染

```typescript
// Mobile: react-native-markdown-display
// 支持: **粗体**, *斜体*, `行内代码`, ```代码块```, 表格, 列表, blockquote, 链接
```

所有 Claude 回复在手机端以 Markdown 渲染，非纯文本。代码块支持按语言语法高亮。

#### 4.5.3 代码 Diff 预览

Claude 的 tool_use → edit_file 返回 diff 后，手机端在 ToolCallCard 中展示：

```
┌─────────────────────────────────────┐
│ 🔧 edit_file: src/index.ts          │
│ ─────────────────────────────────── │
│ - const OLD = 1;                    │
│ + const NEW = 2;                    │
│                                     │
│ [展开] [复制]                        │
└─────────────────────────────────────┘
```

#### 4.5.4 代码块长按复制

代码块长按 → 弹出 "复制" 按钮 → 一键复制到系统剪贴板 (`expo-clipboard`)。

### 4.6 实时通知（🆕 v3 补全）

| 通知类型 | 触发时机 | 渠道 |
|---------|---------|------|
| 审批请求 | Claude 触发 PermissionRequest | FCM/APNs 推送 + App 内角标 |
| Task 完成 | Claude 判断任务达成 → 退出 | FCM/APNs 推送 |
| Session 错误 | Claude 进程崩溃 (exit ≠ 0) | App 内角标 |

**技术实现**:
- 手机端: `expo-notifications` 注册 FCM/APNs token
- Cloud Agent: `POST /api/devices/:id/push-token` 注册 → 消息触发时调 Firebase Admin SDK / APNs HTTP/2

### 4.7 开发者体验（🆕 v3 补全）

#### 4.7.1 Docker Compose 一键部署

```yaml
# docker-compose.yml
services:
  cloud-agent:
    image: clawdbridge/cloud-agent:latest
    ports: ["443:443"]
    volumes:
      - ./repos:/repos
      - ./data:/data
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
```

```bash
# 用户只需:
docker compose up -d
```

#### 4.7.2 健康检查 + 费用监控

| 端点 | 说明 |
|------|------|
| `GET /health` | Cloud Agent 健康状态（PM2 status + Claude 进程数 + SQLite OK） |
| `GET /api/usage` | 本月 Anthropic API 费用统计（从 Claude CLI stdout 解析） |

### 4.8 Task 标签与分类（P2）

```sql
ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';   -- JSON array: ["bugfix","frontend"]
ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT '';  -- "feature"/"bugfix"/"refactor"/"docs"/"devops"
```

手机端 Task 列表按 category 筛选、按 tags 搜索。任务仪表板按仓库分组后二级按 category 分组。

### 4.9 语音输出 TTS（P2）

Claude 流式响应完成后 → 一键播放 TTS：

| 操作 | 实现 |
|------|------|
| 播放 | `expo-speech` → 系统 TTS 引擎朗读 |
| 语言 | Claude 响应语言自动检测 (zh-CN / en-US) |
| 控制 | 播放/暂停/停止按钮 |

### 4.10 消息编辑与重发（P2）

| 操作 | 实现 |
|------|------|
| 编辑 | 长按已发送消息 → "编辑" → 修改文本 → 重新发送（保留原消息标记为 `edited`） |
| 重发 | 发送失败的消息 → 点击重试图标 → 重新入队 |
| 删除 | 长按 → "删除" → 本地软删除（SQLite `deleted=1`） |

### 4.11 消息搜索（P2）

```
手机端 UI:
  ┌─────────────────────────────────┐
  │  🔍 [搜索消息...           ]     │
  │  ─────────────────────────────  │
  │  Task: fix-login                 │
  │  ... "I found the bug in" ...    │
  │                                 │
  │  Task: refactor-api              │
  │  ... "let me refactor" ...       │
  └─────────────────────────────────┘
```

Cloud Agent 搜索端点：`GET /api/search/messages?q=<query>&limit=20` → SQLite FTS5 全文索引。

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(content, content_rowid='rowid');
```

### 4.12 批量审批（P2）

多个审批请求同时等待时 → 手机端显示批量审批卡片：

```
┌─────────────────────────────────────┐
│  ⚠ 3 个审批待处理                     │
│  ─────────────────────────────────  │
│  ✅ edit_file: src/auth.ts (medium) │
│  ✅ bash: npm test (low)            │
│  ❌ bash: rm -rf /tmp/build (high)  │
│                                     │
│  [全部允许] [全部拒绝] [逐项审批]       │
└─────────────────────────────────────┘
```

### 4.13 设备授权目录管理（P2）

手机端查看/修改桌面的授权目录（`authorizedDirs`）：

| 操作 | 实现 |
|------|------|
| 查看 | DeviceScreen → 设备详情 → 显示当前授权目录 |
| 添加 | + 按钮 → 输入路径 → `POST /api/devices/:id/dirs` |
| 删除 | 左滑 → 删除 → `DELETE /api/devices/:id/dirs/:path` |

### 4.14 GitHub PR/Issue 浏览（P2）

手机端以只读方式浏览仓库的 Pull Requests 和 Issues：

```
手机端 UI:
  ┌─────────────────────────────────┐
  │  main-project                    │
  │  ─────────────────────────────  │
  │  🔀 PR #42: Fix login bug       │
  │     opened 2h ago by alice       │
  │                                 │
  │  🐛 Issue #38: Dark mode broken │
  │     opened 1d ago                │
  │                                 │
  │  [点击查看详情]                   │
  └─────────────────────────────────┘
```

Cloud Agent 代理 GitHub API：`GET /api/repos/:repo/pulls`、`GET /api/repos/:repo/issues`。

### 4.15 文件内嵌预览（P2）

文件上传/下载后 → App 内直接预览，不需要打开第三方 App：

| 文件类型 | 预览方式 |
|---------|---------|
| 图片 (png/jpeg/webp/gif) | `expo-image` 全屏预览 + 双指缩放 |
| PDF | `react-native-pdf` 内嵌渲染 |
| Markdown/文本 | `react-native-markdown-display` |
| 代码文件 | `prism-react-renderer` 语法高亮 |
| Office (docx/xlsx/pptx) | WebView → Google Docs Viewer / Office Online |

### 4.16 Web 只读监控面板（P2）

```
Web 端 (只读):
  浏览器打开 → Cloud Agent → 实时显示:
    ├─ 当前活跃的 Task 列表 (进度条)
    ├─ Claude 实时输出（跟随 assistant_stream）
    ├─ 审批历史
    └─ 代码 diff 流

技术栈: React + Vite → 同仓库 `web-dashboard/`
部署: Cloud Agent 同一端口 serve 静态文件
```

### 4.17 多端可写（P2）

Web 端放开只读限制 → 手机 + Web + 桌面均可操作：

```
冲突处理:
  - 消息级乐观锁：以 seq 序号为准，后发覆盖先发
  - 审批级互斥：同一 requestId 只在首个设备弹窗，其余设备显示 "已处理"
  - Session 级串行：同一 Session 同时在多端输入 → Cloud Agent 队列串行处理
```

### 4.18 独立 App 分发（P2）

```bash
# Expo EAS Build: 编译独立 APK (Android) + IPA (iOS)
eas build --platform all --profile production

# OTA 热更新: JS bundle 不经过 App Store 审核直接推送
eas update --branch production --message "Bug fix"
```

| 渠道 | 方式 |
|------|------|
| Android | APK 直接下载 + Google Play (可选) |
| iOS | TestFlight → App Store |
| 更新 | OTA 热更新 (JS 层) + App Store 审核 (原生模块) |

### 4.19 Cloud Agent 监控面板（P2）

手机端 "我的" Tab → Cloud Agent 状态卡片：

```
┌─────────────────────────────────────┐
│  ☁️ Cloud Agent                     │
│  ─────────────────────────────────  │
│  状态:     ● 在线 (PM2)              │
│  Claude:   3 进程 (2 idle / 1 run)  │
│  SQLite:   ● OK                     │
│  内存:     124MB / 512MB             │
│  本月费用:  $3.47 (Anthropic API)    │
│                                     │
│  [查看日志] [重启 Agent]             │
└─────────────────────────────────────┘
```

数据来源：`GET /health` + `GET /api/agent/stats`。

### 4.20 可观测性设计（P0·FIN-002）

#### 4.20.1 结构化日志格式

Cloud Agent 所有日志输出使用统一 JSON 格式：

```json
{
  "ts": "2026-05-10T08:00:00.000Z",
  "level": "info|warn|error|debug",
  "reqId": "req-uuid",
  "sessionId": "ses-xxx",
  "userId": "github-123456",
  "msg": "Claude进程#2 crash, 正在恢复",
  "ctx": { "claudePid": 28341, "exitCode": 1, "retryCount": 2 }
}
```

#### 4.20.2 Request ID 追踪

每个来自手机的请求（WebSocket 消息 / HTTP 请求）由 Cloud Agent 生成 `reqId` (UUID v4)，全链路透传。reqId 出现在：
- 日志的 `reqId` 字段
- API 响应的 `X-Request-Id` header
- Claude stdin 注入的上下文前缀: `[reqId=xxx]`

#### 4.20.3 Health 端点详细字段

```
GET /health → {
  status: "healthy|degraded|down",
  uptime: 86400,
  pm2: { status: "online", restartCount: 0 },
  claudeProcesses: { total: 3, running: 2, idle: 1, crashed: 0 },
  sqlite: { status: "ok|corrupted", walSize: 1024000 },
  memory: { heapUsedMB: 124, heapTotalMB: 512, rssMB: 380 },
  disk: { freeGB: 8.5, totalGB: 20 },
  anthropic: { status: "ok", lastError: null }
}
```

#### 4.20.4 Metrics（Prometheus 兼容）

| metric | 类型 | 说明 |
|--------|------|------|
| `clawd_ws_connections` | Gauge | 当前 WebSocket 连接数 |
| `clawd_claude_processes` | Gauge | Claude 子进程数 (running/idle/crashed) |
| `clawd_messages_total` | Counter | 消息总数 (by type) |
| `clawd_api_errors_total` | Counter | API 错误数 (by endpoint + status) |
| `clawd_approval_latency_seconds` | Histogram | 审批延迟分布 |
| `clawd_anthropic_cost_usd` | Counter | Anthropic API 累计费用 |

#### 4.20.5 异常检测与告警（P2）

Cloud Agent 主动检测异常 → 推送通知 + 手机端告警：

| 异常 | 检测 | 推送 |
|------|------|------|
| Claude 进程频繁崩溃 (≥3/小时) | PM2 restart count | "Claude 不稳定，已暂停 5 分钟" |
| SQLite 损坏 | WAL 校验失败 | "数据库需要重建" |
| 磁盘空间 < 1GB | `df -h` | "磁盘空间不足" |
| Anthropic API 429/5xx | Claude stderr 解析 | "API 暂时不可用" |
| 内存 > 80% | `process.memoryUsage()` | "内存使用偏高" |

### 4.21 暗色模式（P2）

```typescript
// React Native Appearance API
import { useColorScheme } from 'react-native';

// 跟随系统设置自动切换
const scheme = useColorScheme(); // 'light' | 'dark'
```

| 元素 | 亮色 | 暗色 |
|------|------|------|
| 背景 | `#F9FAFB` | `#111827` |
| 卡片 | `#FFF` | `#1F2937` |
| 用户气泡 | `#3B82F6` | `#2563EB` |
| AI 气泡 | `#F3F4F6` | `#374151` |
| 文字 | `#111827` | `#F9FAFB` |
| 主色 | `#D97706` | `#F59E0B` |

### 4.22 触觉反馈（P2）

```typescript
import * as Haptics from 'expo-haptics';

// 轻触：消息发送成功
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// 重触：审批请求到达
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

// 成功：Task 完成
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
```

### 4.23 对话导出（P2）

| 格式 | 触发 |
|------|------|
| Markdown | Session 详情页 → 右上角 → "导出为 .md" |
| JSON | 同上 → "导出为 .json"（含完整 metadata） |
| 分享 | 导出后调系统分享面板 (`expo-sharing`) |

### 4.24 App 图标角标（P2）

```typescript
import * as Notifications from 'expo-notifications';

// 未读消息数 + 待审批数 → 更新角标
await Notifications.setBadgeCountAsync(unreadMessages + pendingApprovals);
```

### 4.25 新用户引导（P2）

首次启动 App 后 → 3 步引导页：

```
Step 1: "扫码连接 Cloud Agent"   → QR Scanner
Step 2: "登录 GitHub 完成配对"   → Sign in with GitHub
Step 3: "创建第一个 Task"         → 输入标题 + 选仓库
```

引导完成后 → `AsyncStorage.setItem('onboarding_done', 'true')` → 下次跳过。

---

## 5. 通信协议

### 5.1 整体通信拓扑

```
手机 ──WSS──→ Cloud Agent ──stdin/stdout──→ Claude Code CLI
                    │
                    ├── WSS ──→ Desktop Bridge（可选）
                    │
                    ├── GitHub API（git push/pull）
                    │
                    └── SQLite（本地文件 I/O）
```

### 5.2 WebSocket 消息类型（20 种）

```
12 Bridge 消息 + 4 relay 消息 + 2 文件消息 + 2 P2 增强消息 = 20 种
```

```typescript
// ── 手机 → Cloud Agent ──
type ClientConnect     = { type: 'client_connect';    payload: { deviceId, deviceName, appVersion } };
type UserMessage       = { type: 'user_message';      payload: { content, contentType, replyTo? } };
type ApprovalResponse  = { type: 'approval_response'; payload: { requestId, decision, scope } };
type Ping              = { type: 'ping' };

// ── Cloud Agent → 手机 ──
type SessionSync       = { type: 'session_sync';      payload: { sessions, pendingApprovals, serverTime } };
type AssistantStream   = { type: 'assistant_stream';  payload: { delta, done, messageId } };
type ToolInvocation    = { type: 'tool_invocation';   payload: { callId, toolName, toolInput, filePath?, command? } };
type ToolResult        = { type: 'tool_result';       payload: { callId, success, output?, error? } };
type ApprovalRequest   = { type: 'approval_request';  payload: { requestId, operation, target, risk, details? } };
type SessionState      = { type: 'session_state';     payload: { status, message? } };
type BridgeError       = { type: 'error';             payload: { code, message, recoverable } };
type Pong              = { type: 'pong'; serverTime: number };

// ── Cloud Agent 特有（v3 新增：4 relay + 1 task + 2 file + 2 P2） ──
type DesktopOnline     = { type: 'relay:desktop_online';   payload: { sessionId, deviceId } };
type CloudFallback     = { type: 'relay:cloud_fallback';   payload: { sessionId, reason } };
type Handback          = { type: 'relay:handback';         payload: { sessionId } };
type TaskUpdate        = { type: 'task_update';            payload: { taskId, status, sessionsCount } };

// 🆕 v3 文件传输
type FileAttachmentCard = { type: 'file_card';             payload: { fileId, fileName, fileSize, mimeType, action: 'uploaded'|'generated', repo? } };
type FileSync           = { type: 'file_sync';             payload: { repo, tree: FileTreeNode[] } };

// P2 增强消息
type BatchApprovalCard   = { type: 'batch_approval';        payload: { requests: ApprovalRequest[] } };
type MessageEdit         = { type: 'message_edit';          payload: { messageId, newContent } };
```

### 5.3 REST API 端点

> **版本前缀**: 所有 API 路径统一以 `/api/v1/` 为前缀。
> **Client/Server 兼容性**: 手机 App 发送 `X-Client-Version` header。Cloud Agent 检查版本兼容矩阵：主版本号不匹配 → 返回 `426 Upgrade Required`；次版本号偏差 → 返回 `X-Deprecation-Warning` header 但继续处理。

| 方法 | 路径 | 说明 | 幂等键 |
|------|------|------|--------|
| POST | `/api/v1/auth/oauth` | GitHub OAuth → JWT | `X-Idempotency-Key` |
| POST | `/api/v1/auth/refresh` | Token 刷新 | — |
| GET | `/api/v1/tasks` | Task 列表 | — |
| POST | `/api/v1/tasks` | 创建 Task | `X-Idempotency-Key` |
| GET | `/api/v1/tasks/:id` | Task 详情（含 Session 列表） | — |
| GET | `/api/v1/sessions/:id/messages` | Session 消息历史 | — |
| GET | `/api/v1/repos` | 已注册仓库列表 | — |
| POST | `/api/v1/repos` | 注册新仓库 | `X-Idempotency-Key` |
| DELETE | `/api/v1/repos/:name` | 删除仓库注册 | — |
| POST | `/api/v1/files/upload` | 上传文件（multipart/form-data） | `X-Idempotency-Key` |
| GET | `/api/v1/files/:fileId` | 下载文件 | — |
| GET | `/api/v1/repos/:repo/files` | 仓库文件树 / 文件内容 (?path=...) | — |
| WS | `/ws` | 实时通信端点 | — |
| POST | `/api/v1/devices/:id/push-token` | 注册推送通知 token (FCM/APNs) | — |
| GET | `/health` | Cloud Agent 健康检查 | — |
| GET | `/api/v1/usage` | 本月 API 费用统计 | — |
| GET | `/api/v1/search/messages` | 全量消息搜索 (FTS5, ?q=&limit=) | — |
| POST | `/api/v1/devices/:id/dirs` | 添加设备授权目录 | — |
| DELETE | `/api/v1/devices/:id/dirs/:path` | 删除设备授权目录 | — |
| GET | `/api/v1/repos/:repo/pulls` | GitHub PR 列表（代理） | — |
| GET | `/api/v1/repos/:repo/issues` | GitHub Issue 列表（代理） | — |
| GET | `/api/v1/agent/stats` | Cloud Agent 监控面板数据（进程/内存/费用） | — |

#### 5.3.1 幂等键设计 (FIN-005)

写操作（POST upload/create/repo）必须带 `X-Idempotency-Key: <uuid>` header。重复请求用同一 key → 返回第一次请求的结果 (HTTP 200 + 原 body)，不创建重复数据。幂等键有效期 24h。

#### 5.3.2 请求/响应 Schema 示例 (FIN-004)

```typescript
// POST /api/v1/auth/oauth
// Request:  Content-Type: application/json
{ provider: "github", code: "gh_xxx" }
// Response: 200 OK  Content-Type: application/json
{ token: "eyJ...", refreshToken: "eyJ...", user: { id, login, avatar_url }, deviceId: "uuid" }
// Error:    401 Unauthorized  { error: "invalid_token", code: "AUTH_001" }
// Error:    400 Bad Request   { error: "missing_code", code: "AUTH_002" }

// POST /api/v1/tasks
// Request:  { title: "修复登录bug", repo: "main-project" }
// Response: 201 Created  { task: { id, title, repo, status: "pending", createdAt } }

// POST /api/v1/files/upload
// Request:  multipart/form-data; file=<binary>
// Response: 201 Created  { fileId, fileName, fileSize, url }
// Error:    413 Payload Too Large  { error: "file_too_large", maxMB: 500 }
// Error:    415 Unsupported Media Type  { error: "unsupported_type", allowedTypes: [...] }
```

#### 5.3.3 统一 Error Body 格式

所有错误响应统一格式：

```json
{
  "error": "human readable message",
  "code": "ERROR_CODE",
  "reqId": "req-uuid",
  "details": {}
}
```

HTTP Status Code 范围：
- 2xx: 成功
- 400: 客户端错误（参数/认证/权限/文件大小/类型）
- 413/415: 文件上传特定错误
- 426: 客户端版本过期，需升级
- 429: 速率限制
- 5xx: Cloud Agent 内部错误
---

## 6. 数据持久化

### 6.1 三层存储

| 层 | 位置 | 技术 | 内容 | TTL |
|----|------|------|------|-----|
| **手机端** | App 本地 | SQLite + SecureStore | 离线缓存 + JWT Token | 永久 |
| **云上** | Cloud Agent | SQLite | 全量消息 + Task 元数据 | 永久 |
| **代码** | /repos/ + GitHub | Git | 项目文件 | 永久 |

### 6.2 云上 SQLite 表结构

复用 Design v2 的 5 张表 + v3 新增 2 张表：

```sql
-- 复用表（Design v2 §6.1）
CREATE TABLE sessions (...);    -- 不变
CREATE TABLE messages (...);    -- 不变
CREATE TABLE approvals (...);   -- 不变
CREATE TABLE devices (...);     -- 不变
CREATE TABLE kv_store (...);    -- 不变

-- 🆕 v3 新增
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  repo TEXT NOT NULL,           -- workDir = /repos/{repo}
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/in_progress/completed/failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE repos (
  name TEXT PRIMARY KEY,
  work_dir TEXT NOT NULL,
  git_remote TEXT NOT NULL,
  branches TEXT NOT NULL DEFAULT '["main"]',  -- JSON array: ["main","develop"]
  registered_at INTEGER NOT NULL
);

-- P2 增强
CREATE TABLE messages_fts (...)  -- FTS5 全文索引
ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;  -- 软删除
ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT '';
```

### 6.3 离线策略

```
手机离线:
  → SQLite 本地缓存最后 50 条消息/session
  → 前台时自动重连（指数退避 2s→5s→15s→30s→60s）
  → 重连后 session_sync 全量同步

云端离线: 不可能（PM2 守护 + systemd + 云服务器 99.9% SLA）
桌面离线: Cloud Agent 自动接管——云上 Claude 继续工作，桌面重连后交还

**消息保留策略** (FIN-009):
  → 单 Session 消息上限 100,000 条（约 200MB）
  → 超过上限: 最早消息自动归档 → `/data/archive/{sessionId}-{year}-{month}.json.gz`
  → 归档周期: 每 12 个月滚动一次
  → 已归档消息: 手机端可通过 `GET /api/v1/sessions/:id/messages?archive=2026-05` 下载
  → 手机端离线上限: 最近 200 条 / session
```

---

## 7. UI 设计

### 7.1 导航结构（参考 Trae Solo）

```
App
├─ Tab 1: 对话 (Chat)
│   └─ TaskListScreen
│       └─ TaskCard → 点击进入 → SessionListScreen
│           └─ SessionCard → 点击进入 → ChatScreen
│               ├─ MessageList (FlatList 虚拟化)
│               │   ├─ UserBubble (蓝色/右侧)
│               │   ├─ AIBubble (灰色/左侧)
│               │   ├─ ToolCallCard (文件编辑/Shell)
│               │   ├─ ApprovalCard (允许/拒绝)
│               │   └─ ErrorCard
│               └─ InputBar (文本 + 🎤 语音)
│
├─ Tab 2: 任务 (Task)
│   └─ TaskDashboardScreen
│       ├─ TaskStatusCard (pending→in_progress→completed)
│       └─ RepoGroupHeader (按仓库分组)
│
└─ Tab 3: 我的 (Profile)
    ├─ 账户信息
    ├─ 仓库管理 (已注册仓库 + 添加/删除)
    ├─ 设备管理 (云 Agent 状态 + 桌面在线/离线)
    └─ 设置
```

### 7.2 主题色

| 元素 | 颜色 |
|------|------|
| 主色（Claude 橙） | `#D97706` |
| 用户气泡 | `#3B82F6`（蓝） |
| AI 气泡 | `#F3F4F6`（灰） |
| 错误 | `#EF4444`（红） |
| 成功/在线 | `#10B981`（绿） |
| 审批警告 | `#FEF3C7`（黄） |

### 7.3 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Expo + React Native 0.76 |
| 状态管理 | Zustand |
| 导航 | React Navigation 7 (Tab + Stack) |
| 本地存储 | expo-sqlite + expo-secure-store |
| 语音输入 | expo-speech-recognition |
| 代码高亮 | prism-react-renderer |
| 网络状态 | @react-native-community/netinfo (FIN-011) |
| Markdown 渲染 | react-native-markdown-display |
| 推送通知 | expo-notifications + Firebase Cloud Messaging |
| 暗色模式 | React Native Appearance API |
| 剪贴板 | expo-clipboard |
| 相机 | expo-camera |
| 部署 | Docker Compose |
| 语音输出 | expo-speech |
| 触觉反馈 | expo-haptics |
| 分享 | expo-sharing |
| 引入 | expo-image, react-native-pdf |
| App 构建 | EAS Build + EAS Update |
```
---

## 8. 账号体系与设备配对（🆕 v3 新增）

### 8.1 核心体验目标：登录即完成

```
Trae Solo:   打开 App → 登录 Trae 账号 → 完成。所有设备自动互通。
ClawdBridge:  打开 App → Sign in with GitHub → 完成。所有设备自动配对互通。
              （首次使用需扫码一次连接 Cloud Agent，之后永久记住）
```

**与 Trae Solo 完全一致的用户体验：登录 = 完成。** 不需要手动配对、不需要输入配对码、不需要配置网络。唯一的"配置"：
- 首次使用：摄像头扫一次 Cloud Agent 部署时显示的 QR 码（1 秒），App 记住 Cloud Agent URL 永久
- 之后每次：点 "Sign in with GitHub" → 浏览器授权 → 自动回到 App → 完成

### 8.2 五个核心规则

```
规则 1: 身份 = GitHub
  - GitHub OAuth 2.0 真实认证（调用 GitHub API）
  - github_user_id 是全局唯一标识

规则 2: 登录 = 配对
  - 手机 GitHub 登录 → Cloud Agent 自动分配 device_id → 签发 JWT
  - 桌面 GitHub 登录 → 同上
  - Cloud Agent 检测同一 github_user_id 下的不同设备 → 立即自动配对
  - 用户完全不需要做任何配对操作——登录即完成

规则 3: Workspace = Cloud Agent URL
  - 用户自建 Cloud Agent → 部署时终端打印 URL + ASCII QR 码
  - 手机首次打开 App → 扫码 → URL 存入本地（之后再也不需要）
  - 同一 Cloud Agent URL + 同一 GitHub user = 同一 workspace
  - 不同 Cloud Agent URL = 不同 workspace = 完全隔离

规则 4: JWT 设备隔离
  - 每设备独立 device_id（首次登录时 Cloud Agent 分配）
  - JWT payload: { github_user_id, github_login, device_id, iat, exp }
  - 消息路由验证: device_id 必须匹配

规则 5: 零配置
  - 不需要输入服务器地址（扫码一次永久记住）
  - 不需要手动配对（GitHub 身份自动触发）
  - 不需要配置网络（WSS 自动连接）
  - 不需要创建 ClawdBridge 账号（GitHub 即身份）
```

### 8.3 完整流程（手机端·用户视角）

```
首次使用（仅一次）:
  0. Cloud Agent 部署完毕 → 终端打印:
     ┌──────────────────────────────────────────┐
     │  Cloud Agent 运行中                        │
     │  URL:  wss://clawd.your-domain.com        │
     │                                            │
     │  ██▀▀▀▀▀▀▀▀████▀▀▀▀▀▀▀▀██                │
     │  ██  ▄▄▄▄▄  ██  ▄▄▄▄▄  ██  ← 扫码连接     │
     │  ██  █   █  ██  █   █  ██                │
     │  ...                                      │
     └──────────────────────────────────────────┘
  1. 手机打开 App → 摄像头扫码 → App 记住 URL (永久)
  2. 点击 "Sign in with GitHub"
  3. 浏览器跳转 GitHub → 点 "Authorize"
  4. 自动回到 App → 完成！所有设备已自动配对。

之后每次:
  1. 打开 App → "Sign in with GitHub"
  2. 浏览器授权（如果未过期则自动跳过）
  3. 完成！

> **新用户引导** (FIN-012): 首次登录成功后，Cloud Agent 自动创建一个示例 Task "Hello ClawdBridge"，并自动开始第一个 Session。手机端引导页展示该 Task，而不是空白列表。
```

### 8.4 OAuth 技术流程（Cloud Agent 侧）

```typescript
// POST /api/auth/oauth { provider, code }
async function handleOAuth(provider: string, code: string) {
  // 1. 用 code 换 GitHub access_token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: JSON.stringify({ client_id, client_secret, code }),
  });
  const { access_token } = await tokenRes.json();

  // 2. 获取 GitHub 用户信息
  const userRes = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${access_token}` },
  });
  const githubUser = await userRes.json();  // { id: 123456, login: "alice", ... }

  // 3. 分配 device_id
  const deviceId = crypto.randomUUID();

  // 4. 写入设备表
  await db.exec(
    'INSERT INTO cloud_devices (id, name, platform, user_id, github_login, status, paired_at) VALUES (?,?,?,?,?,?,?)',
    [deviceId, `${platform}-${Date.now()}`, platform, githubUser.id, githubUser.login, 'online', Date.now()]
  );

  // 5. 签发 JWT
  const jwt = jwtIssuer.issueTokenPair({ github_user_id: githubUser.id, github_login: githubUser.login, device_id: deviceId });

  // 6. 返回
  return { token: jwt.accessToken, refreshToken: jwt.refreshToken, user: githubUser, deviceId };
}
```

### 8.5 桌面端登录（完全相同的流程）

```
桌面端 bridge-client.js 启动:
  → 打开浏览器 → GitHub OAuth（同手机）
  → 收到 callback code
  → POST /api/auth/oauth → 获得 JWT
  → 存 token 到本地 keychain
  → 建立 WSS 出站连接到 Cloud Agent
  → Cloud Agent 检测: 同一 github_user_id + 新 device_id → 自动配对
  → 推送 { type: 'relay:desktop_online' } 给所有同 workspace 的手机
```

### 8.6 数据库表（设备管理）

```sql
-- 云上设备管理表（v3 新增）
CREATE TABLE cloud_devices (
  id TEXT PRIMARY KEY,                  -- device_id (UUID)
  name TEXT NOT NULL,                   -- "iPhone 15" / "My Desktop"
  platform TEXT NOT NULL,               -- "ios" / "android" / "windows" / "linux"
  user_id TEXT NOT NULL,                -- github_user_id
  github_login TEXT NOT NULL,           -- GitHub 用户名
  status TEXT NOT NULL DEFAULT 'offline', -- online / offline
  last_heartbeat INTEGER,               -- 最后心跳时间戳
  last_ip TEXT,                         -- 最后连接 IP
  push_token TEXT,                      -- FCM/APNs 推送 token
  paired_at INTEGER NOT NULL,           -- 首次连接时间
  UNIQUE(user_id, id)                   -- 同一用户下 device_id 唯一
);
```

### 8.7 与 Trae Solo 的账号模型对比

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| **账号注册** | Trae 手机号/邮箱 | GitHub（零额外注册） |
| **登录体验** | 打开 App → 登录 Trae 账号 | 打开 App → Sign in with GitHub → 完成 |
| **首次配置** | 无（厂商托管） | 扫码一次永久记住（1 秒） |
| **设备配对** | 同一账号自动配对 | 同一 GitHub user + 同一 Cloud Agent URL = 登录即自动配对 |
| **Workspace** | Trae 云端分配 | Cloud Agent URL 即 workspace |
| **多 workspace** | 不支持 | 天然支持（多个 ECS → 多个 workspace） |
| **厂商锁定** | 是（字节生态） | 否（GitHub + 自建） |
| **数据可达性** | 字节员工可能接触 | 只有用户自己能接触 |

### 8.8 安全设计

| # | 措施 | 实现 |
|---|------|------|
| 1 | 传输加密 | WSS (TLS 1.3) + Let's Encrypt |
| 2 | 身份认证 | GitHub OAuth 2.0 真实实现 + Code→Token→User 完整流程 |
| 3 | JWT 签名 | HS256（自签 HMAC-SHA256），secret 来自环境变量 |
| 4 | Token 时效 | access: 15min, refresh: 7d |
| 5 | 设备隔离 | 每设备独立 UUID，JWT payload 含 device_id，消息路由验证 |
| 6 | Token 存储 | expo-secure-store（iOS Keychain / Android Keystore），不入 SQLite |
| 7 | API Key 隔离 | 仅存 Cloud Agent `.env`，不传手机，不入 SQLite |
| 8 | 代码安全 | 代码在用户自建 ECS，GitHub 同步由用户控制 |
| 9 | 消息限速 | 每 session 每秒 ≤ 50 条 |
| 10 | 审批 | 手机手动允许/拒绝，once/session 白名单 |
| 11 | 文件安全 | 禁止可执行文件上传；按 Task 隔离存储；7 天自动清理 |
| 12 | Token 吊销 (FIN-014) | `POST /api/v1/auth/revoke` → 标记 refreshToken 失效；所有设备需重新登录 |
| 13 | 审计日志 (FIN-014) | Cloud Agent 记录所有关键事件 (登录/配对/审批/文件上传) → JSON 日志 → 14 天滚动 |

| 事件 | 审计字段 |
|------|---------|
| `auth.login` | userId, deviceId, ip, userAgent |
| `auth.token_refresh` | userId, deviceId, oldTokenExp |
| `device.pair` | userId, newDeviceId, githubLogin |
| `approval.decide` | sessionId, requestId, decision, scope |
| `file.upload` | userId, fileId, fileName, fileSize, mimeType |
| `file.download` | userId, fileId, ip |

---

## 9. 实施路线图

### Phase 1：MVP（局域网 + 桌面为主）— ✅ 已完成

| 模块 | 状态 |
|------|------|
| Bridge Server（桌面） | ✅ 13 文件 + 113 tests |
| Mobile App（手机） | ✅ 23 文件 + 22 tests |
| 局域网 WebSocket 直连 | ✅ |
| Claude Code CLI 驱动 | ✅ 真实 claude.exe 验证通过 |
| E2E 集成测试 | ✅ 24/24（含压力/性能/真实 Claude） |

### Phase 2：Cloud Agent v2（本次新增）

> 🆕 补全: Trae 领先项——Task Builder 拆解 / 语音 TTS / 文件预览 / 批量审批 / 暗色模式 全部提前到 P0/P1

| 模块 | 代码量 | 优先级 |
|------|--------|--------|
| Cloud Agent Daemon（PM2 + WebSocket Server） | ~200 行 | P0 |
| Task Manager（Task CRUD + 状态机） | ~100 行 | P0 |
| **Task Builder（Claude 自动拆解子任务）** 🆕 | ~80 行 Cloud + ~60 行 Mobile | **P0** |
| Repo Router（多仓库绑定 + 路由） | ~80 行 | P0 |
| Multi-Claude Process Pool（进程池管理） | ~100 行 | P0 |
| 手机端 Task 列表页 + 仓库选择 | ~150 行 | P0 |
| 手机端 Task 详情 + 子任务 UI 🆕 | 含在 Task Builder 中 | P0 |
| 手机端 → Cloud Agent 连接切换 | ~50 行 | P0 |
| File Manager（上传/下载端点 + 文件树 API） | ~80 行 | P0 |
| Image Input（拍照 → 压缩 → Claude Vision） | ~40 行 Mobile + ~30 行 Cloud | P0 |
| Token 持久化 (expo-secure-store 对接) | ~10 行 | P0 |
| Docker Compose 一键部署 | — | P1 |
| Push Notifications（FCM/APNs + expo-notifications） | ~80 行 Cloud + ~40 行 Mobile | P1 |
| **语音输出 TTS（expo-speech）** 🆕 | ~20 行 Mobile | **P1** |
| Markdown 渲染 + 代码 diff 预览 + 剪贴板复制 | ~60 行 Mobile | P1 |
| Task 暂停/恢复 (SIGSTOP/CONT) + sub-session | ~50 行 Cloud | P1 |
| Branch 选择 + git diff 摘要 | ~40 行 Cloud + ~30 行 Mobile | P1 |
| **文件内嵌预览（expo-image + react-native-pdf）** 🆕 | ~80 行 Mobile | **P1** |
| **批量审批 UI** 🆕 | ~50 行 Mobile | **P1** |
| **暗色模式（Appearance API）** 🆕 | ~30 行 Mobile | **P1** |
| **DeepSeek API 接入（CircuitBreaker+Retry+DNS 预解析）** 🆕 | ~150 行 Mobile | **P0** |
| **ModelRouter（智能路由: auto/cloud/deepseek）** 🆕 | ~80 行 Mobile | **P0** |
| **P1 补齐组件（TTS+BatchApproval+FilePreview+Theme+Onboarding）** 🆕 | ~120 行 Mobile | **P1** |
| 手机端 FileAttachmentCard 组件 + 文件选择器 | ~60 行 | P1 |
| 手机端 RepoFileTree 组件 | ~80 行 | P1 |

**预估新增代码量**：~1,870 行（Cloud Agent ~830 行 + Mobile ~1,040 行 + docker-compose.yml）

### Phase 3：增强

| 模块 | 优先级 |
|------|--------|
| Web 只读监控面板 | P2 |
| 多端可写 (手机+Web+桌面) | P2 |
| 触觉反馈 + 新用户引导 | P2 |
| 消息搜索 (FTS5) + 对话导出 | P2 |
| 消息编辑/重发/删除 | P2 |
| 设备授权目录管理 | P2 |
| GitHub PR/Issue 浏览 | P2 |
| Cloud Agent 异常告警 | P2 |
| Cloud Agent 监控面板 | P2 |
| App 图标角标 | P2 |
| Task 标签/分类 | P2 |
| 独立 APK/IPA (EAS Build + OTA) | P2 |
| 一键部署脚本 | P1 |

---

## 10. 性能指标

| 指标 | Phase 1 实测 | Phase 2 目标 |
|------|------------|------------|
| 消息延迟 | WS RTT < 500ms（同机） | < 300ms（局域网）/ < 1s（互联网） |
| 审批闭环 | < 50ms（内存 Promise） | < 2s（端到端） |
| 对话列表 | SQLite < 5ms | 不变 |
| 内存（云 Agent） | — | < 200MB（含 3 个 Claude 子进程池） |
| 冷启动 | — | PM2 守护 → 0（始终在线） |
| 并发 Session | — | 3~5 Claude 进程（2 核 4G ECS） |

### 10.1 压测方法 (FIN-013)

| 测试 | 方法 | 通过条件 |
|------|------|---------|
| WS 并发 | `test/perf/stress.test.ts` 100 连接 | 100/100 成功, 0 error, ≤ 30s |
| 消息吞吐 | MessageRouter 1000 条消息 | 0 丢失, ≤ 500ms |
| Claude 子进程稳定性 | 3 轮连续 spawn→响应 | 3/3 exitCode=0 |
| 内存泄漏 | `--expose-gc` + 1000 次 request 后 GC → heapUsed 差异 < 50MB | 无泄漏 |
| 磁盘 I/O | SQLite INSERT 10000 条 → SELECT | ≤ 5s |

**Claude 子进程 CPU 限制**: Linux cgroups `CPUQuota=200%` (2 核) per Claude process。内存限制: `MemoryMax=512M` per process。

---

## 11. 附录：与 Trae Solo 的关键差异重申

| 维度 | Trae Solo | ClawdBridge Cloud Agent v2 |
|------|-----------|---------------------------|
| AI 引擎 | 豆包/DeepSeek | Claude Code CLI |
| 数据主权 | 字节托管 | 用户自管 ECS |
| 账号体系 | 注册 Trae 账号 | GitHub OAuth（零注册）→ 登录即配对 |
| 首次配置 | 无 | 扫码一次（1 秒），永久记住 |
| Agent 架构 | 双智能体（Builder+Coder） | 单 Agent（Claude 全能） |
| 文件传输 | 未公开 | 500MB 单文件，15+ 类型，HTTP Multipart |
| 图片输入 | 支持 | 📷 拍照 → Claude Vision 分析 |
| Diff 预览 | 推断有 | ToolCallCard diff + 代码复制 |
| Markdown 渲染 | 推断有 | 完整（表格/列表/blockquote/代码高亮） |
| 语音输入 | 内建 ASR | expo-speech-recognition |
| 语音输出 | 内建 TTS | expo-speech（P2） |
| 推送通知 | 推断有 | FCM/APNs + App 角标 |
| 消息搜索 | 推断有 | FTS5 全文索引（P2） |
| 多端可写 | ✅ 三端 | 手机为主 + Web 可选（P2） |
| 文件内嵌预览 | 推断有 | 图片/PDF/Office（P2） |
| GitHub 集成 | GitHub 自动推送 | PR/Issue 浏览 + git diff 摘要 |
| 审批 | 云端自动 | 手机手动 once/session + 批处理 + 60s 超时 |
| 暗色模式 | 推断有 | 跟随系统（P2） |
| Task 模型 | Task→分配设备 | Task→Session→Claude 进程（paused+tag+category） |
| 多仓库 | Task 分配到不同设备 | Session 绑定 workDir + 多 branch 并行 |
| 监控面板 | 推断有 | Cloud Agent 健康 + API 费用 + 异常告警（P2） |
| 独立 App | ✅ 应用商店 | EAS Build APK/IPA + OTA 热更新（P2） |
| 部署 | 零运维 | docker compose up -d |

---

## 12. Out of Scope / Non-Goals（🆕 FIN-001）

以下功能 **明确不在** ClawdBridge Mobile 的设计范围内：

| # | 不做的事项 | 原因 |
|---|----------|------|
| 1 | **内置 AI 模型运行在手机端** | 手机端不加载任何 LLM。AI 推理始终在 Cloud Agent 上的 Claude Code CLI 中执行 |
| 2 | **替换 Claude Code 为其他 AI 引擎** | ClawdBridge 的核心价值是 Claude Code。如需豆包/DeepSeek，可使用 clawd-on-desk-main 的 Agent Registry 接入，但此为不同产品 |
| 3 | **支持 iOS/Android 之外的平台** | 鸿蒙/Web 非本次 MVP/Phase 2 目标。Web 只读面板在 Phase 3 考虑 |
| 4 | **离线 AI 推理** | 无网络时 App 可使用缓存对话历史，但无法发起新的 AI 请求（Phase 3 纯聊天降级除外） |
| 5 | **多用户协作 (Team/Multi-tenant)** | 一个 Cloud Agent = 一个 GitHub user 的 workspace。不支持多用户共享同一 workspace |
| 6 | **内置 CI/CD 流水线** | Cloud Agent 不自动触发 build/deploy。需用户通过 Claude 自行执行 |
| 7 | **Trae IDE / Cursor 等 GUI IDE 集成** | ClawdBridge Mobile 是手机端 App。GUI IDE 集成属于 clawd-on-desk-main 桌面项目 |
| 8 | **加密货币支付 / API Key 代付** | 用户自行管理 Anthropic API Key。Cloud Agent 不做计费平台 |
| 9 | **端到端文件加密 (E2EE)** | 传输层使用 WSS TLS 1.3。内容层不做客户端加密——用户需信任自己的 ECS |
| 10 | **SaaS 多租户托管** | 不提供 clawdbridge.cloud 公有托管。每个用户自己部署自己的 Cloud Agent |
