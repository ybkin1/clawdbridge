# 功能完整度审计：Trae Solo ↔ ClawdBridge Cloud Agent v2 (PRD v3)

> 审计日期: 2026-05-10 | 被审计文件: `PRD v3` + `对比文档 v1`
> 目的: 逐模块列出 Trae Solo 有而 ClawdBridge 缺失的功能，标注风险等级和补救建议

---

## 一、功能完整度矩阵（55 个功能点 × 两类产品）

### 图例
```
✅ = 已设计且明确         ⚠️ = 部分覆盖或推断
❌ = 缺失/未设计          ◐ = 仅 Phase 3 计划中
— = 不适用（产品定位差异）
```

---

## 二、逐模块功能对照

### 模块 A：认证与账户（6 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| A1 | 手机号/邮箱注册 | ✅ | — | 不需要——GitHub 即身份 | 无需 |
| A2 | OAuth 登录 | ✅ 火山 | ✅ GitHub | 持平 | — |
| A3 | 多设备登录 | ✅ | ✅ 同一 GitHub user | 持平 | — |
| A4 | Token 管理 | 推断 ✅ | ✅ JWT 15min+7d | 持平 | — |
| A5 | **离线 Token 缓存** | ✅ 推断 | ❌ `secure-store.ts` 是内存变量 | App 重启 token 丢失 | **P0**：对接 expo-secure-store |
| A6 | **Token 自动刷新** | 未知 | ✅ `POST /api/auth/refresh` | 完成 | — |

### 模块 B：Task 管理（5 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| B1 | 创建 Task | ✅ | ✅ Phase 2 | 持平 | — |
| B2 | Task 列表 / 排序 | ✅ | ✅ | 持平 | — |
| B3 | **Task 内子任务拆解** | ✅ Builder 自动拆 | ❌ 无 Builder | Claude 自己决定顺序，用户不可见拆解过程 | **P1**：Phase 2 Task 内允许用户手动创建 sub-session |
| B4 | **Task 暂停/继续** | ✅ paused 状态 | ❌ 只有 pending→in_progress→done | 长任务无法暂停 | **P1**：加 paused 状态 + Claude SIGSTOP/CONT |
| B5 | **Task 标签/分类** | 推断有 | ❌ 无 | 多 Task 时无组织方式 | **P2**：加 tag/category 字段 |

### 模块 C：会话/对话交互（12 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| C1 | 文本对话 | ✅ | ✅ | 持平 | — |
| C2 | 流式响应 (streaming) | ✅ | ✅ assistant_stream | 持平 | — |
| C3 | 代码渲染/高亮 | ✅ | ✅ prism-react-renderer | 持平 | — |
| C4 | **Markdown 渲染** | ✅ | ⚠️ 仅代码高亮提到 | 缺表格/列表/blockquote 渲染 | **P1**：react-native-markdown-display |
| C5 | **图片输入（非文件上传）** | ✅ | ❌ Phase 2 计划 | Claude 不能直接看图片 | **P0**：纳入 Phase 2，Claude API 支持 vision |
| C6 | **语音输出 (TTS)** | ✅ 内建 TTS | ❌ 无 | Claude 响应不能语音朗读 | **P2**：expo-speech |
| C7 | **代码 diff 预览** | 推断有 | ❌ 无 | Claude 改了什么，手机端看不到 diff | **P1**：ToolCallCard 加 diff snippet |
| C8 | **消息引用/回复** | 推断有 | ⚠️ payload.replyTo 字段存在但无 UI | 无法在聊天中引用消息 | 无需 |
| C9 | **消息编辑/重发** | 未知 | ❌ 无 | 消息发错了无法撤回或修改 | **P2** |
| C10 | **Markdown 快捷输入** | ✅ | ✅ PRD §7.3 | 持平 | — |
| C11 | **消息搜索** | 推断有 | ❌ 无 | 历史消息无法全文搜索 | **P2** |
| C12 | **多会话同时进行** | ✅ Task 分配不同设备 | ⚠️ 多个 Session 并行（同云） | 可以但不方便 | 无需 |

### 模块 D：审批（5 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| D1 | 审批触发 | ✅ 推断 | ✅ Claude native hook | 持平 | — |
| D2 | 审批卡片 UI | 推断 ✅ | ✅ ApprovalCard | 持平 | — |
| D3 | once/session 白名单 | 未知 | ✅ | 更好 | — |
| D4 | 超时自动拒绝 | 未知 | ✅ 60s | 更好 | — |
| D5 | **批量审批** | 推断有 | ❌ 一次一个 | 多审批时体验差 | **P2**：审批队列批量操作 |

### 模块 E：设备管理（3 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| E1 | 设备在线/离线 | ✅ | ✅ | 持平 | — |
| E2 | **设备授权目录管理** | 推断有 | ❌ 未设计 | 手机端看不到桌面的授权目录 | **P2** |
| E3 | **多桌面同时在线** | 推断有 | ⚠️ 设计支持但未明确 | | 无需 |

### 模块 F：仓库管理（4 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| F1 | 添加/删除仓库 | —（非同类概念） | ✅ | 完成 | — |
| F2 | **GitHub PR/Issue 浏览** | ✅ | ❌ 无 | 手机无法看 PR | **P2**：只读 GitHub Issues/PRs API |
| F3 | **Git diff 一览** | 推断有 | ❌ 无 | Claude 改了哪里不知道 | **P1**：Session 结束自动 git diff → 推送手机 |
| F4 | **Branch 选择** | 推断有 | ❌ 只有 default branch | 无法在 feature 分支上工作 | **P1**：Task 创建时选 branch |

### 模块 G：文件传输（4 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| G1 | 上传 | 推断有 | ✅ | 持平 | — |
| G2 | 下载 | 推断有 | ✅ | 持平 | — |
| G3 | **文件预览（内嵌）** | 推断有 | ❌ 无 | 图片/PDF 需下载后打开 | **P2**：expo-image + react-native-pdf |
| G4 | 仓库文件树 | 未知 | ✅ | 持平 | — |

### 模块 H：多端/同步（5 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| H1 | 手机端可用 | ✅ | ✅ | 持平 | — |
| H2 | 桌面端可用 | ✅（必须） | ✅（可选） | 持平 | — |
| H3 | **Web 端可用** | ✅ | ❌ 无 | Trae 三端，我们两端口 | **P2**：Web 只读监控面板 |
| H4 | **多端同时可写** | ✅ 三端 | ❌ 手机单端写 | Web/桌面不能同时操作 | **P2** |
| H5 | **State Sync 全量同步** | ✅ 四层 | ⚠️ 三层 + SQLite | 缺代码文件层同步 | 不需要（Claude 操作本地文件） |

### 模块 I：实时通知（3 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| I1 | 审批 WebSocket 通知 | ✅ | ✅ | 持平 | — |
| I2 | **后台推送通知 (FCM/APNs)** | 推断 ✅ | ❌ ◐ Phase 3 | App 在后台收不到审批 | **P1**：Phase 2 加入 |
| I3 | **Task 完成通知** | 推断有 | ❌ 无 | Task 跑完了不知道 | **P2** |

### 模块 J：运维/部署（4 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| J1 | 零运维 | ✅ 厂商托管 | ❌ 用户自建 | 需要懂 ECS 运维 | **P1**：docker-compose 一键部署 |
| J2 | **App 分发** | ✅ 应用商店 | ⚠️ Expo Go 开发版 | 非技术用户不会装 | **P2**：eas build 出独立 APK/IPA |
| J3 | **自动更新** | ✅ 应用商店 | ⚠️ Expo OTA | 代码热更可行，原生模块需 App Store | 无需 |
| J4 | **Cloud Agent 监控面板** | 推断有 | ❌ 无 | 云 Agent 出了问题不知道 | **P2**：/health 端点 + 手机端状态卡片 |

### 模块 K：安全（3 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| K1 | API Key 管理 | ✅ 火山 | ✅ .env | 持平 | — |
| K2 | **API 用量/费用监控** | 推断有 | ❌ 无 | Anthropic 花费不可见 | **P2**：/api/usage 端点展示本月费用 |
| K3 | **异常检测 + 告警** | 推断有 | ❌ 无 | Claude 进程崩溃只记录不告警 | **P2** |

### 模块 L：用户体验细节（7 点）

| # | 功能 | Trae Solo | ClawdBridge | 差距 | 补救 |
|---|------|-----------|-------------|------|------|
| L1 | 暗色模式 | 推断有 | ❌ 无 | | **P2** |
| L2 | 触觉反馈 | 推断有 | ❌ 无 | | **P2** |
| L3 | **剪贴板快捷复制** | 推断有 | ❌ 无 | 代码块不能一键复制 | **P1**：长按代码块 → 复制 |
| L4 | **对话导出** | 未知 | ❌ 无 | 对话记录无法导出 | **P2** |
| L5 | **App 图标角标** | 推断有 | ❌ 无 | 有未读消息看不出 | **P2** |
| L6 | **启动动画/Splash** | 推断有 | ⚠️ PRD §7.3 splash 颜色无动画 | | 无需 |
| L7 | **引导提示 (Onboarding)** | 推断有 | ❌ 无 | 新用户不知道功能在哪 | **P2** |

---

## 三、汇总

### 3.1 缺失功能按严重度分类

#### 🔴 P0 — PRD v3 必须补（否则 Phase 2 无法上线）

| # | 功能 | 当前状态 | 工作量 |
|---|------|---------|--------|
| A5 | Token 持久化 (expo-secure-store) | `secure-store.ts` 是内存变量 | ~10 行 |
| C5 | 图片输入支持 | 未设计 | ~80 行 Cloud Agent + ~40 行 Mobile |

#### 🟡 P1 — 应在 Phase 2 内包含

| # | 功能 | 工作量 |
|---|------|--------|
| B3 | Task 内手动创建 sub-session | ~50 行 |
| B4 | Task 暂停/继续 (SIGSTOP/CONT) | ~30 行 Cloud Agent |
| C4 | Markdown 完整渲染 | react-native-markdown-display 引入 |
| C7 | 代码 diff 预览卡片 | ~40 行 Mobile |
| F3 | Session 结束自动 git diff | ~20 行 Cloud Agent |
| F4 | Branch 选择 | ~30 行 + repo registry 扩展 |
| I2 | 后台推送通知 | expo-notifications 集成 + Cloud Agent FCM |
| J1 | Docker Compose 一键部署 | docker-compose.yml |
| L3 | 代码块长按复制 | ~20 行 Mobile |

#### 🟢 P2 — Phase 3

| # | 功能 |
|---|------|
| B5 | Task 标签/分类 |
| C6 | TTS 语音输出 |
| C9 | 消息编辑/重发 |
| C11 | 消息搜索 |
| D5 | 批量审批 |
| E2 | 设备授权目录管理 |
| F2 | GitHub PR/Issue 浏览 |
| G3 | 文件内嵌预览 |
| H3 | Web 只读监控面板 |
| H4 | 多端可写 |
| I3 | Task 完成推送通知 |
| J2 | 独立 APK/IPA (eas build) |
| J4 | Cloud Agent 监控面板 |
| K2 | API 费用监控 |
| K3 | 异常告警 |
| L1 | 暗色模式 |
| L2 | 触觉反馈 |
| L4 | 对话导出 |
| L5 | 角标未读数 |
| L7 | 新用户引导 |

---

## 四、不可补的差距（客观限制）

| 差距 | 原因 |
|------|------|
| 零运维 | 字节有 10 万+ 服务器，我们永远无法做到"零运维"——只能降到"一键部署" |
| 原生 ASR 质量 | 豆包 ASR 是字节内部模型，我们只能用系统级 expo-speech-recognition |
| 双 Agent Builder | Claude Sonnet 4 自身已达到不需要外部 Builder 的程度，不是差距 |

---

## 五、最终裁决

```
                  Trae Solo                ClawdBridge Cloud Agent v2 (PRD v3)
                  ─────────                ──────────────────────────────────
覆盖功能点:        ~40/55 (73%)             ~30/55 (55%)
                   (推断约数)               (PRD 明确设计)

PRD v3 需补 P0:     2 项                   (A5 Token持久化, C5 图片输入)
PRD v3 需补 P1:     9 项                   (Task子任务/暂停, Markdown渲染, diff,
                                           branch选择, 推送, 一键部署, 复制代码)
PRD v3 P2 (远期):   14 项                  (暗色模式/TTS/搜索/Web端/监控...)

不可补差距:         3 项                   (零运维/ASR质量/双Agent)
```

**一句话**: PRD v3 已经覆盖了 Trar Solo 约 55% 的已公开功能点，加上 Phase 2 的 P0/P1 补全可达 75%。剩余的 P2 项多为体验优化，不影响核心编程 Agent 能力上线。**ClawdBridge 在 AI 引擎（Claude）、数据主权（用户自管）、审批安全性（手动白名单）、消息可靠性（seq 去重）四项硬指标上全面优于 Trae Solo。**

---

## 六、PRD v3 更新建议

1. **新增模块 H：实时通知**（含推送 + 角标 + Task 完成通知）
2. **§4.1 模块全景**：新增模块 H + 模块 I（开发者体验）
3. **§7.3 技术栈**：补充 react-native-markdown-display, expo-notifications, expo-speech
4. **§10 性能指标**：补充 P1 推送延迟目标
5. **§4.4 文件**：补充文件内嵌预览
6. **B3/B4**：Task 状态机增加 `paused` 状态 + sub-session 手动创建
7. **F4**：仓库注册表增加 `branches` 字段
