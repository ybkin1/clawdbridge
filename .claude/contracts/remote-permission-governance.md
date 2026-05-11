---
contract_id: "remote-permission-governance"
title: "远程权限治理契约"
owner: "claude-code"
scope: "云端 Claude Code 的自动权限审批分层策略、高危操作拦截、人工确权的触发条件"
trigger: "远程执行体（云端 Claude Code）启动时自动加载"
required_inputs: ["settings.json", "dangerous-operations-catalog"]
version: 1
last_reviewed_at: "2026-05-11"
---

# 远程权限治理契约（Remote Permission Governance Contract）

## 1. 目的

解决「双层代理架构」中的权限审批瓶颈：本地 Agent（编排器）需要指挥远程执行体（云端 Claude Code）完成开发任务，但远程执行体的每一次工具调用都需要权限确认。

本契约定义：
- **什么操作可以自动批准**（由本地 Agent 代审）
- **什么操作必须人工确认**（转给用户）
- **什么操作必须自动拒绝**（无论谁申请）
- **权限配置的部署、审计、回滚机制**

## 2. 三层权限模型

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: 绝对安全层（Auto-Allow）                            │
│  ─────────────────────────────                              │
│  只读操作 + 常规开发命令 → 本地 Agent 自动审批               │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: 开发常规层（Auto-Allow with Scope）                 │
│  ─────────────────────────────────────                      │
│  文件编辑 + 构建测试 + Git 常规操作 → 本地 Agent 自动审批    │
│  但限制在项目目录内                                          │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: 高危操作层（Human-Required）                        │
│  ──────────────────────────────────                         │
│  破坏性命令 + 系统级操作 + 网络外发 → 必须人工确认           │
├─────────────────────────────────────────────────────────────┤
│  黑名单层（Auto-Deny）                                       │
│  ───────────────────                                        │
│  无论谁申请都直接拒绝的操作                                  │
└─────────────────────────────────────────────────────────────┘
```

## 3. Tier 1: 绝对安全层（Auto-Allow）

### 3.1 只读工具（全部自动批准）

| 工具 | 说明 |
|------|------|
| `Read` | 读取任何文件 |
| `Glob` | 文件搜索 |
| `Grep` | 内容搜索 |
| `TaskOutput` | 读取任务输出 |
| `WebFetch` | 网页抓取 |
| `WebSearch` | 网络搜索 |

### 3.2 安全的 Shell 命令（前缀匹配）

```
Bash(ls *)
Bash(cat *)
Bash(head *)
Bash(tail *)
Bash(find *)
Bash(grep *)
Bash(wc *)
Bash(stat *)
Bash(file *)
Bash(echo *)
Bash(pwd)
Bash(date)
Bash(which *)
Bash(whoami)
Bash(uname *)
Bash(ps *)
Bash(top *)
Bash(htop *)
Bash(df *)
Bash(du *)
```

### 3.3 Git 查看操作

```
Bash(git status *)
Bash(git log *)
Bash(git diff *)
Bash(git show *)
Bash(git branch *)
Bash(git remote *)
Bash(git config --get *)
Bash(git stash list)
```

### 3.4 包管理查看

```
Bash(npm list *)
Bash(npm config get *)
Bash(pip list *)
Bash(pip show *)
Bash(python --version)
Bash(node --version)
Bash(tsc --version)
```

## 4. Tier 2: 开发常规层（Auto-Allow with Scope）

### 4.1 文件编辑工具

| 工具 | 范围限制 | 说明 |
|------|---------|------|
| `Edit` | 项目目录内 | 编辑代码文件 |
| `Write` | 项目目录内 | 创建/覆盖文件 |
| `NotebookEdit` | 项目目录内 | 编辑 Jupyter Notebook |

> **范围限制实现**：通过 `permissions.deny` 阻止对系统路径的 Edit/Write。

### 4.2 Git 常规操作

```
Bash(git add *)
Bash(git commit *)
Bash(git checkout *)
Bash(git switch *)
Bash(git merge *)
Bash(git pull *)
Bash(git fetch *)
Bash(git push)
Bash(git push origin *)
Bash(git tag *)
Bash(git cherry-pick *)
Bash(git revert *)
Bash(git reset HEAD)
Bash(git reset --soft *)
Bash(git restore *)
Bash(git clean -fd)
```

> **注意**：`git push --force` 和 `git reset --hard` 在 Tier 3 中拒绝。

### 4.3 包管理安装

```
Bash(npm install *)
Bash(npm ci)
Bash(npm ci *)
Bash(npm run *)
Bash(npm test)
Bash(npm build)
Bash(npm publish *)
Bash(pip install *)
Bash(pip install -r *)
Bash(pip uninstall *)
Bash(python -m pip install *)
Bash(python -m pytest *)
```

### 4.4 构建与测试

```
Bash(tsc *)
Bash(tsc --noEmit)
Bash(eslint *)
Bash(prettier *)
Bash(vitest *)
Bash(jest *)
Bash(pytest *)
Bash(black *)
Bash(flake8 *)
Bash(mypy *)
Bash(make)
Bash(make test)
Bash(make build)
Bash(cargo *)
Bash(go test *)
Bash(go build *)
```

### 4.5 文件操作（非破坏性）

```
Bash(mkdir *)
Bash(mkdir -p *)
Bash(cp *)
Bash(cp -r *)
Bash(mv *)
Bash(touch *)
Bash(ln -s *)
Bash(chmod +x *)
Bash(tar *)
Bash(zip *)
Bash(unzip *)
```

### 4.6 文件删除（单文件/空目录）

```
Bash(rm *)
Bash(rm -f *)
Bash(rmdir *)
Bash(rm -i *)
```

> **注意**：`rm -r`, `rm -rf` 在 Tier 3 中拒绝。

### 4.7 开发服务器

```
Bash(node *)
Bash(npm start)
Bash(npm run dev)
Bash(npm run serve)
Bash(python -m http.server *)
Bash(uvicorn *)
```

### 4.8 SSH 与 SCP（限制到已知主机）

```
Bash(ssh *)
Bash(scp *)
Bash(rsync *)
```

## 5. Tier 3: 高危操作层（Human-Required）

以下操作**必须人工确认**，本地 Agent 无权代审：

### 5.1 文件系统破坏

```
Bash(rm -r *)
Bash(rm -rf *)
Bash(rm -rf /)
Bash(rm -rf ~)
Bash(rm -rf /*)
Bash(dd *)
Bash(mkfs *)
Bash(fdisk *)
```

### 5.2 Git 危险操作

```
Bash(git push --force *)
Bash(git push -f *)
Bash(git reset --hard *)
Bash(git rebase -i *)
Bash(git filter-branch *)
Bash(git reflog expire *)
```

### 5.3 系统级命令

```
Bash(sudo *)
Bash(su *)
Bash(chown *)
Bash(chmod -R *)
Bash(chmod 777 *)
Bash(systemctl *)
Bash(service *)
Bash(apt *)
Bash(apt-get *)
Bash(yum *)
Bash(dnf *)
Bash(dpkg *)
Bash(snap *)
Bash(flatpak *)
Bash(pacman *)
Bash(docker *)
Bash(docker-compose *)
Bash(kubectl *)
Bash(helm *)
```

### 5.4 网络外发（可能泄露数据）

```
Bash(curl *)
Bash(wget *)
Bash(nc *)
Bash(netcat *)
Bash(telnet *)
Bash(ftp *)
Bash(sftp *)
Bash(scp *:*)
```

> **例外**：`curl` / `wget` 到 localhost 或内网地址可以在白名单中单独配置。

### 5.5 用户与权限管理

```
Bash(useradd *)
Bash(usermod *)
Bash(userdel *)
Bash(groupadd *)
Bash(groupmod *)
Bash(groupdel *)
Bash(passwd *)
Bash(chsh *)
Bash(chage *)
Bash(visudo)
```

### 5.6 数据库危险操作

```
Bash(mysql -e "DROP*")
Bash(psql -c "DROP*")
Bash(mongo --eval "db.dropDatabase*")
Bash(redis-cli FLUSHALL)
Bash(redis-cli FLUSHDB)
```

### 5.7 其他高危

```
Bash(shutdown *)
Bash(reboot)
Bash(halt)
Bash(poweroff)
Bash(init *)
Bash(kill -9 *)
Bash(pkill -9 *)
Bash(killall -9 *)
```

## 6. 黑名单层（Auto-Deny）

以下操作**无论谁申请都自动拒绝**：

```
Bash(rm -rf /)
Bash(rm -rf /*)
Bash(rm -rf ~)
Bash(rm -rf ~/.*)
Bash(dd if=/dev/zero of=/dev/sda)
Bash(dd if=/dev/random of=/dev/sda)
Bash(mkfs.ext4 /dev/sda)
Bash(mkfs.ext4 /dev/nvme0n1)
Bash(>: *)
Bash(> /etc/passwd)
Bash(> /etc/shadow)
```

## 7. 权限配置文件部署

### 7.1 配置文件位置

- **用户级**：`~/.claude/settings.json`
- **项目级**：`<project>/.claude/settings.json`
- **项目本地级**：`<project>/.claude/settings.local.json`

**优先级**：项目本地级 > 项目级 > 用户级

### 7.2 部署流程

```
1. 备份现有配置
   cp ~/.claude/settings.json ~/.claude/settings.json.backup-$(date +%Y%m%d-%H%M%S)

2. 验证新配置 JSON 语法
   python3 -m json.tool new-settings.json > /dev/null

3. 写入配置
   cp new-settings.json ~/.claude/settings.json

4. 测试验证
   claude --version
   ccs diagnostics

5. 回滚能力
   mv ~/.claude/settings.json.backup-* ~/.claude/settings.json
```

### 7.3 配置审计

每次修改权限配置后，必须产出审计记录：

```yaml
audit_id: "perm-audit-20260511-001"
timestamp: "2026-05-11T12:00:00Z"
actor: "local-agent"
action: "deploy-permission-config"
target: "claude_aly:/root/.claude/settings.json"
change_summary: "新增 Tier 2 开发常规层权限，启用自动审批"
tier1_count: 45
tier2_count: 38
tier3_count: 52
blacklist_count: 12
verification_status: "passed"
```

## 8. 人工确权的触发机制

### 8.1 触发条件

当远程执行体遇到 Tier 3 操作时：

1. **暂停执行**：远程 Claude Code 等待权限确认
2. **本地 Agent 检测**：本地 Agent 通过 SSH 会话检测到权限弹窗
3. **决策路由**：
   - 如果操作在 Tier 3 中 → 转给用户确认
   - 如果操作在 Tier 1/2 中但权限未命中 → 本地 Agent 检查是否属于边界情况
   - 如果操作在黑名单中 → 本地 Agent 直接拒绝

### 8.2 用户确认模板

```
[权限申请] 远程执行体请求执行高危操作

主机: claude_aly
用户: root
命令: git push --force origin main
风险等级: 高
可能影响: 覆盖远程分支历史，可能导致数据丢失

[自动分析]
- 当前分支: main
- 远程分支: origin/main
- 是否领先远程: 是 (+3 commits)
- 是否落后远程: 否
- 建议: 可以使用 git push --force-with-lease 替代

请选择：
[1] 批准本次操作
[2] 拒绝本次操作
[3] 使用更安全的替代方案（force-with-lease）
[4] 先让我看看 diff
```

### 8.3 异步确权模式

```
远程执行体暂停 → 本地 Agent 发送通知给用户
    ↓
用户回复 → 本地 Agent relay 到远程
    ↓
远程执行体继续 or 终止
```

## 9. 安全兜底策略

### 9.1 默认拒绝原则

不在 `permissions.allow` 中的操作，默认需要权限确认。

### 9.2 最小权限原则

权限配置遵循最小必要原则：
- 只允许完成当前任务必需的操作
- 任务完成后应审计并回收临时权限

### 9.3 权限漂移检测

本地 Agent 定期运行审计：

```bash
# 检查权限配置是否被意外修改
diff ~/.claude/settings.json.backup-* ~/.claude/settings.json

# 检查是否有未授权的高危操作历史
grep -E "rm -rf|git push --force|chmod 777" ~/.claude/sessions/*/transcript.json 2>/dev/null
```

## 10. 例外与豁免

### 10.1 允许例外的情况

| 场景 | 处理方式 | 记录要求 |
|------|---------|---------|
| 初始化新服务器 | 临时放宽 Tier 3 | 记录到 `exceptions/` |
| 紧急修复生产问题 | 用户明确授权后可执行 | 记录到 `exceptions/` + 事后审计 |
| 安装系统级依赖 | 拆分为独立任务，用户单独授权 | 记录到 `exceptions/` |

### 10.2 例外审批流程

```
本地 Agent 识别到例外需求
    ↓
生成例外申请（含理由、范围、时限）
    ↓
用户审批
    ↓
临时写入 permissions.allow（带注释标记）
    ↓
执行操作
    ↓
操作完成后移除临时权限
    ↓
产出例外报告
```

## 11. 验证清单

部署权限治理后，必须验证以下场景：

- [ ] `ls -la` → 无需确认
- [ ] `cat README.md` → 无需确认
- [ ] `git status` → 无需确认
- [ ] `Edit index.ts` → 无需确认
- [ ] `npm install` → 无需确认
- [ ] `rm file.txt` → 无需确认
- [ ] `rm -rf node_modules` → **需要确认**
- [ ] `git push --force` → **需要确认**
- [ ] `sudo apt update` → **需要确认**
- [ ] `curl https://evil.com` → **需要确认**
- [ ] `rm -rf /` → **自动拒绝**
