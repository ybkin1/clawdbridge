---
contract_id: "storage-location"
title: "存储位置契约"
owner: "claude-code"
scope: "任务数据写入项目工作目录，禁止散落系统关键位置"
trigger: "所有产生文件输出的任务"
required_inputs: []
required_contracts: ["task-directory-tree", "file-naming"]
required_skills: []
verification_checks: ["project-dir-only", "no-system-pollution", "violation-handling"]
exceptions: ["claude-runtime-files"]
supersedes: []
version: 2
last_reviewed_at: "2026-05-09"
changelog: "v2: 因当前环境仅C盘可用，移除硬编码D盘限制，改为通用项目工作目录约束。允许C盘目录，禁止桌面/下载/临时目录污染。"
---

# 存储位置契约（Storage Location Contract）

> 所有任务数据必须写入项目工作目录或其子目录。
> 这是硬规则，不因任务类型、紧急程度或用户指令而豁免。

## 1. 目的

防止任务数据（中间文件、产出物、临时文件、Agent 输出）散落到系统各处，导致：
1. 任务数据不可版本控制，不可发现
2. 多任务之间数据互相污染
3. 交付物丢失或无法追溯

## 2. 核心规则

### 2.1 允许写入的位置

| 位置 | 用途 |
|------|------|
| **项目工作目录**及其子目录（默认：`C:\Users\Administrator\Documents\trae_projects\yb\`） | 所有任务数据的主写入目标 |
| `.claude/contracts/` | 契约文件 |
| `.claude/tasks/<task-id>/` | 任务运行时数据 |
| `.claude/memory/` | 持久化记忆 |
| `.claude/project/` | 项目级配置和清单 |
| `.trae/memory/` | Trae 记忆归档 |

### 2.2 禁止写入的位置

| 位置 | 原因 |
|------|------|
| 桌面（`Desktop/`） | 非项目数据，散落污染 |
| 默认下载目录（`Downloads/`） | 临时性质，易丢失且无版本控制 |
| 系统临时目录（`%TEMP%`, `%APPDATA%/Local/Temp`） | 不可持久化，下次会话可能被清除 |
| Windows 系统目录（`C:\Windows\`, `C:\Program Files\` 等） | 系统文件，不可干预 |
| 其他项目的目录 | 跨项目污染 |

### 2.3 项目工作目录确认

```bash
# 当前项目工作目录（由 Trae IDE 打开的工作区决定）
CWD = C:\Users\Administrator\Documents\trae_projects\yb\
```

所有文件写入必须在此目录或其子目录下。

### 2.4 例外（不由本契约约束）

- Claude Code / Trae 自身的运行时文件（session 日志、遥测数据）由 IDE 管理
- 用户明确要求的特定外部路径（需在意图确认中显式授权并记录到任务状态）
- 插件/扩展的安装和缓存目录（由 IDE 的扩展系统管理）

## 3. 执行规则

### 3.1 Write 前检查

每次通过 `Write`、`Edit`、`Bash redirect (>)` 创建或修改文件前，必须确认：
1. 目标路径在项目工作目录或其子目录下
2. 不在禁止写入位置（桌面/下载/临时目录/系统目录）
3. 如果是创建新目录，父目录已存在

### 3.2 子 Agent 约束

通过子 Agent 工具派发的任务，必须在其 prompt 中包含：
> "所有文件写入必须在项目工作目录 C:\Users\Administrator\Documents\trae_projects\yb\ 下，禁止写入桌面/下载/临时目录/系统目录。"

### 3.3 路径规范化

- Windows 路径使用反斜杠
- 相对路径相对于当前工作目录解析
- 使用绝对路径进行写入前校验

## 4. 违规处理

| 违规类型 | 处理 |
|---------|------|
| 意外写入禁止位置 | 立即删除，重新写入到项目工作目录 |
| 子 Agent 写入禁止位置 | 主线程检测后标记为 Fail，要求重写 |
| 连续 2 次违规 | 报告用户，记录到 feedback.yaml |

## 5. 与其他契约的关系

| 契约 | 关系 |
|------|------|
| task-directory-tree-spec | 定义目录结构，本契约定义目录位置约束 |
| file-naming-spec | 定义文件名格式，本契约定义文件存放位置 |
| dirty-hygiene-spec | 脏数据清理时，禁止将临时文件写入禁止位置 |
| closeout-contract | 收口时检查是否有文件写入禁止位置 |

## 6. 验证要求

- closeout 前置条件：确认无文件写入到禁止位置
- 评审 Agent 在 contract gate 检查时，验证 artifact 路径是否在允许的位置
- 主线程在任务初始化时，校验所有输出路径

## 7. 环境适配说明

本契约为 v2 版本，已适配当前仅 C 盘环境。若未来启用 D 盘，只需将 §2.1 中的项目工作目录改为 D 盘对应路径即可，无需修改规则逻辑。
