# ClawdBridge Cloud Agent — 架构修订评估

> 评估日期: 2026-05-10 | 输入: 用户四点新需求
> 输出: 修订版架构 + 可行性结论 + 与旧方案对比

---

## 0. 扫描结论

### 0.1 现有代码库中的相关资产

| 资产 | 路径 | 对云 Agent 的价值 |
|------|------|------------------|
| **Agent 注册表** | `clawd-on-desk-main/agents/registry.js` | ✅ 已有 10 个 AI CLI 后端的管理框架，可直接扩展 `cloud-claude` 类型 |
| **Claude Code Agent** | `clawd-on-desk-main/agents/claude-code.js` | ✅ 原生 HTTP Hook，`httpHook: true`，`subagent: true`——这是云上 Agent 的协议标准 |
| **Trae IDE Agent** | `clawd-on-desk-main/agents/trae-ide.js` | ❌ **不可用于云服务器**——UIA 是 Windows 独有 API，`processNames.mac/linux: []` 均为空。Trae CLI **不存在**于代码库中 |
| **Bridge Server CLI 驱动** | `bridge-server/src/cli-spawn.ts` | ✅ 已验证可以 spawn Claude Code 子进程 + stdin/stdout 接管——直接复用 |
| **Bridge Server 路由** | `bridge-server/src/message-router.ts` | ⚠️ 需改为**多仓库路由**（当前只按 type 路由，不按 workDir/repo 路由） |
| **进程守护** | 无 | ❌ 无 PM2/systemd 配置——需新建 |

### 0.2 Trae CLI 评估

```
Trae CLI 不存在于当前代码库中。
Trae IDE 的集成方式 (UIA 模拟点击) 仅适用于 Windows 桌面 → 完全无法在 Linux 云服务器上运行。

✅ 结论: 不需要安装 Trae CLI。Claude Code CLI 已有原生 HTTP Hook (httpHook: true, subagent: true)，
  这是云服务器上最好的方案——不需要 UIA hack。
```

---

## 一、架构重构：从"中继"到"云 Agent 为主体"

### 1.1 旧架构 vs 新架构

```
旧架构 (Relay Server v1):
  手机 ──WSS──→ Cloud Relay ──WSS──→ Desktop Bridge ──stdin/stdout──→ Claude
                     ↑
               只做消息转发
               桌面离线 = 全部停

新架构 (Cloud Agent v2):
  手机 ──WSS──→ Cloud Agent (始终在线) ──stdin/stdout──→ Claude Code CLI (云)
                     │
                     ├── GitHub (代码同步)
                     ├── SQLite (全量会话缓存)
                     └── Desktop Bridge (可选·辅助执行)
```

**核心变化：云服务器从"消息中转站"升级为"主执行引擎"。** 桌面从必需品变为可选辅助。

### 1.2 可行性结论

| 用户需求 | 可行性 | 理由 |
|---------|--------|------|
| ① 云+GitHub 为主，云上 Claude CLI 直接执行 | ✅ **完全可行** | 已验证 `claude -p` 可用；PM2 守护即可 24/7；GitHub 做代码同步 |
| ② 全量云端缓存 | ✅ **完全可行** | 云服务器 24/7 → SQLite 可全量持久化 |
| ③ Cloud Agent 始终在线 | ✅ **完全可行** | PM2 + systemd 守护 Claude 子进程；心跳 30s；崩溃自动重拉 |
| ④ 代码存云，遵守 Claude Code 规范 | ✅ **完全可行** | Claude Code 的项目目录即 workDir；GitHub 自动同步 |
| Trae CLI | ❌ **不需要** | Trae IDE 是 Windows UIA 方案——不可用于 Linux。Claude Code 原生 HTTP Hook 是其 10 个 Agent 中最完善的 |

---

## 二、Cloud Agent 设计

### 2.1 Agent 进程模型

```
PM2 (进程守护, 永远在线)
  │
  ├── cloud-agent.js (主进程, Node.js, 1 个实例)
  │     ├── WebSocket Server (手机端入口, WSS:443)
  │     ├── Session Manager (一对多: 1 Agent 管 N 个 Claude 子进程)
  │     ├── Repo Router (根据任务路由到不同 workDir)
  │     └── State Store (全量会话缓存 → SQLite)
  │
  ├── Claude Code #1 (子进程, workDir: /repos/project-a)
  │     ├── session: proj-a-ses-001
  │     └── 状态: running
  │
  ├── Claude Code #2 (子进程, workDir: /repos/project-b)
  │     ├── session: proj-b-ses-001
  │     └── 状态: idle
  │
  └── Claude Code #3 (子进程, workDir: /repos/project-c)
        ├── session: proj-c-ses-001
        └── 状态: idle
```

### 2.2 多仓库路由

```
手机消息: { sessionId: "proj-a-ses-001", content: "帮我修 login bug" }
                    │
        Cloud Agent Session Manager
                    │
        lookupSession("proj-a-ses-001")
          → workDir: "/repos/project-a"
          → branch: "main"
          → claudePid: 28341
                    │
        stdin.write(proc_28341, content + "\n")
                    │
        proc_28341 stdout → Cloud Agent → WebSocket → 手机
```

每个 session 在创建时绑定一个 workDir（对应一个 GitHub 仓库）。手机可以**同时运行多个 session**，分别在不同仓库中由不同的 Claude 子进程执行。

### 2.3 Agent 始终在线机制

```javascript
// PM2 ecosystem.config.js 管理生命周期
const MAX_CRASH_PER_HOUR = 5;
let crashCount = 0;

class CloudAgentDaemon {
  start(): void {
    // PM2 守护: 崩溃自动重启 (max 5/hr)
    this.wsServer.listen(443);
    this.heartbeat.start();  // 30s 对手机端心跳
    this.restoreSessions();  // 从 SQLite 恢复上次未完成的会话
  }

  onClaudeCrash(sessionId: string, code: number): void {
    crashCount++;
    if (crashCount > MAX_CRASH_PER_HOUR) {
      // 通知手机 "Claude 不稳定，暂停 5 分钟"
      this.notifyPhone(sessionId, { type: 'error', code: 'AGENT_UNSTABLE' });
      return;
    }
    // 自动重新 spawn Claude，注入最近 50 条对话上下文
    this.respawnClaude(sessionId);
  }

  respawnClaude(sessionId: string): void {
    const session = this.getSession(sessionId);
    const context = this.messageStore.getRecent(sessionId, 50);
    // Claude Code 天然支持从上下文恢复
    const proc = this.cliSpawn.spawn(session.workDir);
    proc.stdin.write(context.map(m => `${m.role}: ${m.content}`).join('\n'));
    proc.stdin.write('You were interrupted. Continue from where you left off.\n');
    this.bindProcess(sessionId, proc);
  }
}
```

---

## 三、全量云缓存设计

### 3.1 存储分层

| 存储层 | 技术 | 容量 | TTL | 内容 |
|--------|------|------|-----|------|
| **热** | 内存 (进程内 Map) | 最近 200 条消息/session | — | 实时对话流 |
| **温** | SQLite (本地文件) | 全量消息/history | 永久 | 所有对话历史 + 审批记录 |
| **冷** | GitHub | 代码产物 | 永久 | 每个任务的代码变更（git push） |
| **状态** | SQLite | session 元数据 | 永久 | workDir, branch, claudePid, status |

### 3.2 为什么可以用 SQLite 而不用 Redis

```
旧方案 (Relay v1): Redis → 因为中继是无状态的，消息必须暂存在外部存储
新方案 (Cloud Agent v2): SQLite → 因为 Cloud Agent 本身就是有状态的服务，PM2 保证它不挂
  
SQLite 优势:
  - 零运维（不需要额外部署 Redis）
  - 全量持久化（不像 Redis 有 1h TTL）
  - WAL 模式崩溃自动恢复
  - 5 张表 DDL 已在 bridge-server 中完整定义 → 直接复用
```

---

## 四、代码存储方案

### 4.1 Claude Code 原生项目结构

```
/repos/                              ← 云服务器上的根目录
  ├── project-a/                     ← GitHub 仓库 clone
  │     ├── .git/
  │     ├── CLAUDE.md                ← Claude Code 项目配置
  │     ├── src/
  │     └── ...
  │
  ├── project-b/
  │     ├── .git/
  │     ├── CLAUDE.md
  │     └── ...
  │
  └── project-c/
        └── ...
```

**Claude Code 的项目目录本身就是最好的"代码存储方案"**——不需要额外的对象存储或文件服务。Cloud Agent 只需要：
1. 收到手机创建任务的消息 → 指定 workDir（或自动从 GitHub clone）
2. Claude Code 子进程在 workDir 中执行所有 Edit/Bash/Read 工具调用
3. 执行完成后 git add && git commit && git push

### 4.2 多仓库并行

```typescript
// Cloud Agent 的任务 → 仓库路由表
const repoRegistry = {
  'main-project': {
    workDir: '/repos/main-project',
    gitRemote: 'git@github.com:user/main-project.git',
    branch: 'main',
  },
  'api-service': {
    workDir: '/repos/api-service',
    gitRemote: 'git@github.com:user/api-service.git',
    branch: 'develop',
  },
};
```

手机端创建新会话时选择仓库 → Cloud Agent 自动绑定 workDir → Claude Code 子进程在对应仓库中执行。

---

## 五、两套方案对比

| 维度 | Relay v1（中继） | Cloud Agent v2（云为主） |
|------|-----------------|------------------------|
| **执行主体** | 桌面 Claude（必须在线） | 云 Claude（始终在线） + 桌面可选 |
| **代码位置** | 仅桌面本地 | 云 + GitHub + 桌面同步 |
| **离线支持** | 需桌面在线 | 始终可用（云 24/7） |
| **会话缓存** | Redis 临时（1h TTL） | SQLite 永久（全量历史） |
| **并发任务** | 桌面上限（1 台机器） | 云多核并行（多 Claude 进程） |
| **部署复杂度** | 云 .env JWT + Redis + Relay | 云 PM2 + SQLite + 系统 Claude |
| **新增代码** | ~430 行 Relay | ~500 行 Cloud Agent |
| **复用现有代码** | 9 个 bridge 文件 | CLISpawn + JWTIssuer + MessageRouter + Agent Registry |
| **对用户价值** | 桌面必须开机 | **手机随时可用，桌面可以为辅** |

---

## 六、可行性结论

```
                 Cloud Agent v2 可行性
                 ════════════════════
  ① 云+GitHub + 云上 Claude 执行    ✅ 已验证 claude -p, 有原生 HTTP Hook
  ② 全量云缓存 (SQLite)             ✅ 5 表 DDL 已实现，WAL 模式
  ③ Agent 始终在线 (PM2 + 心跳)     ✅ PM2 配置 + 崩溃自动重拉
  ④ 代码存云 + Claude 规范          ✅ /repos/{name} 标准目录结构
  ⑤ Trae CLI                        ❌ 不需要——Claude Code 更完善

  总判断: ✅ 全部可行，且优于原 Relay 方案
  新增代码: ~500 行 (Cloud Agent Daemon + Repo Router + PM2 config)
  可复用: CLISpawn + JWTIssuer + MessageRouter + 5 张 SQLite 表
  建议: 取代原 relay-server 方案，直接以此为准进入编码
```

是否按 Cloud Agent v2 方案开始编码？