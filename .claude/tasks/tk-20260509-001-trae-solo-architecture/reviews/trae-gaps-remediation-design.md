# Design Addendum：Trae 领先项补全方案

> 日期: 2026-05-10 | 目的: 将 Trae Solo 的 Task Builder / 本地 AI 能力 / 文件预览 & 批量审批三大领先项整合进 ClawdBridge Cloud Agent v2
> 将补入: PRD v3 + Design v3

---

## 一、Task Builder 自动拆解（新模块·P0）

### 1.1 原理

不需要像 Trae Solo 那样建一个独立的 "Builder Agent"。Claude 本身就具备理解需求并拆解任务的能力。实现方式：

```
用户: "给 App 加暗色模式"
  → Cloud Agent TaskBuilder.plan(taskTitle, repo)
    → 启动一个独立的 Claude 子进程（planner session），注入 system prompt:

    "You are a task planner. Given the user's request, break it down into 3-8
     sequential subtasks. Each subtask should be one concrete action that Claude
     can execute independently. Return ONLY valid JSON:
     { subtasks: [{ title: string, description: string, order: number }] }"

    ← Claude 返回:
     { subtasks: [
       { title: "分析现有主题系统", description: "检查项目中现有的颜色/主题变量和 CSS 文件", order: 1 },
       { title: "添加暗色 CSS 变量", description: "在 :root 中定义 --dark-* 变量", order: 2 },
       { title: "修改组件引用", description: "将所有硬编码颜色替换为 CSS 变量", order: 3 },
       { title: "添加切换开关", description: "在设置页添加暗色模式 toggle", order: 4 },
       { title: "测试", description: "手动验证所有页面在暗色模式下正常显示", order: 5 }
     ]}

  → TaskManager.createSubtasks(taskId, subtasks)
  → 手机端 Task 详情页展示结构化子任务列表
  → 用户点击任一子任务 → 创建 Session → Claude 在对应 workDir 中逐个执行
```

### 1.2 Cloud Agent 新增模块

```typescript
// cloud-agent/src/task-builder.ts
class TaskBuilder {
  private processPool: ClaudeProcessPool;
  private db: Database;

  async plan(taskId: string, userRequest: string, repo: string): Promise<Subtask[]> {
    // 1. 启动 plannar Claude（轻量，max-budget 0.03）
    const plannerProc = this.processPool.spawn(repoDir, `planner-${taskId}`);

    // 2. 注入 system prompt + 用户需求
    const prompt = `You are a task planner. Given: "${userRequest}",
      break it down into 3-8 sequential subtasks. Return ONLY valid JSON:
      { subtasks: [{ title: string, description: string, order: number }] }`;

    plannerProc.write(prompt);

    // 3. 收集 Claude JSON 响应
    const output = await this.collectOutput(plannerProc);

    // 4. 解析并写入 SQLite
    const parsed = JSON.parse(output);
    for (const st of parsed.subtasks) {
      this.db.exec(
        'INSERT INTO subtasks (id, task_id, title, description, sort_order, status) VALUES (?,?,?,?,?,?)',
        [uuid(), taskId, st.title, st.description, st.order, 'pending']
      );
    }

    // 5. 清理 planner 进程
    this.processPool.kill(`planner-${taskId}`);

    return parsed.subtasks;
  }
}
```

```sql
-- 新增子任务表
CREATE TABLE subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/in_progress/completed/failed
  session_id TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

### 1.3 Mobile 新增 UI

```
TaskDetailScreen (现有) → 扩展:
  ┌─────────────────────────────────┐
  │  Task: 给 App 加暗色模式         │
  │  Repo: main-project  ● in_progress│
  │  ─────────────────────────────  │
  │                                 │
  │  子任务:                         │
  │  ☐ 1. 分析现有主题系统           │
  │  ☑ 2. 添加暗色 CSS 变量  ✅      │
  │  ● 3. 修改组件引用 (进行中)      │
  │  ☐ 4. 添加切换开关               │
  │  ☐ 5. 测试                      │
  │                                 │
  │  [创建新子任务] [自动拆解]        │
  └─────────────────────────────────┘
```

### 1.4 代码量

| 模块 | 预估 |
|------|------|
| `task-builder.ts` (Cloud Agent) | ~80 行 |
| `subtasks` 表 DDL + DAO | ~30 行 |
| `TaskDetailScreen` 子任务 UI | ~60 行 |
| **合计** | **~170 行** |

---

## 二、本地 AI 能力评估与设计

### 2.1 能力矩阵：哪些能做、哪些不能做

| Trae 能力 | Trae 实现 | ClawdBridge 可行方案 | 是否纳入 |
|----------|---------|---------------------|---------|
| **语音输入 ASR** | 豆包自研 ASR 引擎 | expo-speech-recognition（系统级，已设计） | ✅ 已存在 |
| **语音输出 TTS** | 豆包自研 TTS | expo-speech (P2 → **P1**) | ✅ 提前到 P1 |
| **图片 OCR / 视觉分析** | 推断端侧 OCR 模型 | **Claude Vision 更强**：拍照上传 → Claude 理解上下文+读文字 | ✅ 已设计 §4.5.1 |
| **输入联想/补全** | 推断云端 NLP | ❌ 不必要——编程场景下用户输入的是自然语言指令，不需要代码补全 | ❌ 不纳入 |
| **本地 NLP (消息摘要)** | 推断端侧小模型 | ❌ 手机端推 NLP 模型会显著增大 App 体积和耗电 | ❌ 不纳入 |
| **端侧推理 (离线 AI)** | 推断端侧小模型 | ❌ P2 纯聊天降级模式已覆盖此需求 | ❌ 已有降级方案 |

**结论：不做本地模型加载。** 利用 Claude Vision 做图片分析（比本地 OCR 更智能），利用系统级 ASR/TTS 做语音，利用 Phase 3 纯聊天降级做离线。不需要在手机端跑任何 AI 模型。

### 2.2 语音输出 TTS 提前（P2 → P1）

```typescript
// mobile/src/components/tts-button.tsx (新增)
function TTSButton({ text }: { text: string }) {
  const play = () => Speech.speak(text, { language: detectLanguage(text) });
  return <IconButton icon="volume-up" onPress={play} />;
}
```

位于 AIBubble 右下角，Claude 流式响应末尾自动出现。点击播报全文。

### 2.3 Claude Vision 增强（已有，补充优化）

```
现有设计 §4.5.1: 拍照 → 压缩 → 上传 → Claude stdin 注入路径
增强:
  - 拍照时自动检测是否为错误界面（红色/报错关键词） → 自动附加 "This appears to be an error screen. Analyze the error."
  - 支持从聊天中长按任意图片 → "让 Claude 分析这张图"
  - 图片上传前 3s 预览确认（避免拍错）
```

---

## 三、文件预览 + 批量审批（P2 → P1）

### 3.1 文件内嵌预览（原 §4.15 P2 → P1）

所有组件移到 Phase 2。依赖：

```json
// package.json 新增
"expo-image": "~2.0",
"react-native-pdf": "^6.7",
```

预览组件：

```typescript
// mobile/src/components/file-preview.tsx (新增)
function FilePreview({ fileId, mimeType }: { fileId: string; mimeType: string }) {
  const uri = `${cloudAgentUrl}/api/v1/files/${fileId}`;

  if (mimeType.startsWith('image/')) {
    return <ImageViewer source={{ uri }} enableZoom />;  // expo-image
  }
  if (mimeType === 'application/pdf') {
    return <PdfViewer source={{ uri }} />;  // react-native-pdf
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return <CodeViewer uri={uri} />;  // 复用 prism-react-renderer
  }
  // Office: WebView → Google Docs Viewer
  return <WebView source={{ uri: `https://docs.google.com/viewer?url=${encodeURIComponent(uri)}` }} />;
}
```

### 3.2 批量审批（原 §4.12 P2 → P1）

复用现有设计，提前到 Phase 2。依赖：
- `useChatStore.pendingApprovals` 数组已有
- `batch_approval` WS 消息类型已有
- 只需新增 `BatchApprovalCard` 组件（~50 行）

### 3.3 暗色模式（原 §4.21 P2 → P1）

React Native Appearance API 0 行代码即可支持——已设计暗色色板，只需在 `ThemeProvider` 中切换。P2 的进度跟不上用户预期，提前到 P1。

---

## 四、PRD v3 需要更新的内容

### 4.1 Phase 优先级调整

| 功能 | 旧优先级 | 新优先级 | 原因 |
|------|---------|---------|------|
| Task Builder 自动拆解 | 未设计 | **P0** | Trae 核心优势，Claude 天然能做 |
| 语音输出 TTS | P2 | **P1** | Trae 有而我们没有，体验差距大 |
| 文件内嵌预览 | P2 | **P1** | 基础体验，不应拖到 Phase 3 |
| 批量审批 | P2 | **P1** | 审批是核心功能，批处理是自然延伸 |
| 暗色模式 | P2 | **P1** | 0 代码成本（Appearance API），放 P2 不合理 |

### 4.2 Phase 2 新增模块

| 模块 | 代码量 | 优先级 |
|------|--------|--------|
| Task Builder（Claude 自动拆解） | ~80 行 Cloud + ~60 行 Mobile | P0 |
| 语音输出 TTS（expo-speech） | ~20 行 Mobile | P1 |
| 文件内嵌预览（expo-image + react-native-pdf） | ~80 行 Mobile | P1 |
| 批量审批 UI 组件 | ~50 行 Mobile | P1 |
| 暗色模式（Appearance API） | ~30 行 Mobile | P1 |

增额：~320 行。Phase 2 总代码量从 ~1,200 行 → **~1,520 行**。

### 4.3 Design v3 新增文件

```
cloud-agent/src/task-builder.ts       (~80 行)
mobile/src/components/subtask-list.tsx (~60 行)
mobile/src/components/tts-button.tsx   (~20 行)
mobile/src/components/file-preview.tsx (~80 行)
mobile/src/components/batch-approval.tsx (~50 行)
mobile/src/theme/colors.ts             (~30 行)
```
