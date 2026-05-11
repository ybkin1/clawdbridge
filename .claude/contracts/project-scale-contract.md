# 项目规模识别契约 (Project Scale Recognition Contract)

> 版本: v1.0
> 状态: draft-ready
> 归属: L3 专项契约
> 依赖: runtime-execution-spec.md (L1)
> 设计原则: 规模识别基于**可观测的仓库特征**，而非用户输入关键词；规模与任务复杂度正交

---

## 1. 设计目标

解决「小型脚本项目被迫加载完整 L0-L6 架构」与「大型项目缺少结构化约束」之间的矛盾。

**核心规则**：
- **规模决定可用契约集合**（哪些模板、检查单、参考资料可被加载）
- **复杂度决定执行强度**（评审 Agent 数量、是否产出 ADR）
- 两者**互不覆盖**：Complex 任务在 Small 项目中仍触发完整评审，仅可用模板减少

---

## 2. 规模定义（基于可观测特征）

### 2.1 判定维度

项目规模由以下**可自动探测**的维度决定，禁止依赖用户输入关键词：

| 维度 | 探测方法 | Small 阈值 | Medium 阈值 | Large 阈值 |
|------|---------|-----------|------------|-----------|
| **源码文件数** | 根目录下非隐藏、非依赖目录的文件总数（平台无关的文件遍历） | < 15 | 15-100 | > 100 |
| **包管理器/构建系统** | 根目录是否存在单一构建配置文件（`package.json` / `Cargo.toml` / `go.mod` / `pyproject.toml` / `Makefile` 等） | 无 | 有（单一） | 有（多模块/Monorepo） |
| **测试基础设施** | 是否存在 `test/` / `tests/` / `__tests__/` 目录或 `*.test.*` 文件 | 无 | 有 | 有 + 覆盖率配置 |
| **CI/CD 配置** | `.github/workflows/` 下文件数 或 `.gitlab-ci.yml` 存在性 | 无 | 1-2 个 workflow | ≥3 个 workflow |
| **模块边界** | 根目录下是否存在 workspaces 配置（如 `package.json#workspaces`、`pnpm-workspace.yaml`、`nx.json`）或子目录中存在多个独立的包管理器配置文件 | 无 | 无 | 有 |

### 2.2 判定算法（确定性）

```
Step 1: 探测仓库根目录特征（根级 + 二级目录，maxdepth=2；排除 node_modules/.git/dist 等依赖/生成目录）
        - 使用平台无关的文件系统 API（Node.js fs.readdir / glob，禁止依赖 Unix shell 命令如 find/wc）
        - 若未安装 git 或权限不足，跳过 git 相关探测，继续其他维度

Step 2: 计分（5个独立维度分别计分；符合 Large 阈值得2分，Medium 得1分，Small 得0分）
        注意："包管理器"与"模块边界"为关联但不重复维度
        - 单一 package.json = 包管理器 Medium（1分），模块边界 Small（0分）
        - package.json + workspaces 配置 = 包管理器 Large（2分），模块边界 Large（2分）
        - 这是预期行为，monorepo 理应获得高分

Step 3: 判定规则：
    IF 总分 <= 1 AND 文件数 < 15 AND 无包管理器:
        Scale = Small
    ELSE IF 总分 <= 4 AND 模块边界 == Small:
        Scale = Medium
    ELSE:
        Scale = Large

Step 4: 若探测失败（非 git 仓库、权限不足、解析异常、超时）:
    - Scale = Medium（fallback）
    - 向用户发出警告："项目规模探测失败，已默认设为 Medium。若此为大型项目/Monorepo，当前可能缺少 repo-profile、command-catalog、engineering-standards 等上下文。请回复 'Large' 或 'Monorepo' 升级，或确认继续以 Medium 执行。"
    - 在 task-state 中记录 source: fallback, reason: [具体原因]
    - **限制**：fallback 状态下，禁止自动加载 L4-L6 契约；用户显式确认规模后方可解锁
```

**性能约束**：判定算法应在 **3 秒内**完成（覆盖冷启动、Windows 杀毒扫描、网络文件系统等 worst-case）。超时则触发 fallback。

**实现前验证要求**：实现方必须在 Windows/Linux/macOS 三种平台上，对 S/M/L 三种规模的典型仓库进行 benchmark，确认平均耗时 <3s 后方可标记本契约实现完成。

**损坏/异常处理**：若 `project-scale.yaml` 缓存文件损坏或无法解析：
- 视为探测失败，触发 fallback 到 Medium
- 删除损坏的缓存文件
- 记录 audit-log: `[timestamp] SCALE_CACHE_CORRUPT: fallback=Medium`

### 2.3 用户显式覆盖

用户可通过以下方式覆盖自动判定：

| 用户指令 | 覆盖效果 | 记录要求 |
|---------|---------|---------|
| "这是小项目" / "小脚本而已" | Scale = Small（本次会话有效） | 记录到 task-state |
| "正式项目" / "生产级" | Scale = Medium（若当前为 Small）或保持 Large | 记录到 task-state |
| "Monorepo" / "多包项目" | Scale = Large | 记录到 task-state |
| "按 Medium 执行" | Scale = Medium | 记录到 task-state |

**覆盖规则**：
- 用户覆盖**只能上调或平级**，不能下调（防止 "这是小项目" 绕过安全评审）
- 若用户尝试下调（如自动判定 Medium 时说 "这是小项目"）：
  - 系统必须拒绝："当前项目已判定为 Medium，无法下调为 Small。如需调整，请说明具体理由。"
  - 维持当前规模不变
  - 记录 audit-log: `[timestamp] SCALE_OVERRIDE_REJECTED: attempted=Small, current=Medium, reason="用户尝试下调"`
- 覆盖后，任务状态必须记录 `source: user` 和 `override_reason: [用户原话]`

---

## 3. 规模与契约加载映射

### 3.1 各规模激活的契约集合

| 层级 | Small | Medium | Large |
|------|-------|--------|-------|
| **L0 硬门禁** | CLAUDE.md + AGENTS.md | 同 Small | 同 Small |
| **L1 运行时** | runtime-execution-spec.md（简化路径） | runtime-execution-spec.md（完整路径） | runtime-execution-spec.md（完整路径） |
| **L2 状态追踪** | 最小化（仅 intent + state） | 标准（intent + state + verification_plan） | 完整（+ route 记录 + ADR 引用） |
| **L3 专项契约** | 不加载（Trivial/Standard 直接执行） | lifecycle-contract.md + review-gates-contract.md | + engineering-standards-contract.md |
| **L4 参考资料** | 不加载 | repo-profile.md（简化） | repo-profile.md（完整）+ command-catalog.md |
| **L5 产出模板** | 仅 00-user-intent.md | PRD / 设计 / 计划 / 测试模板（Standard 版） | + 分层模板（L1/L2/L3 文档深度）+ 全量检查单 |
| **L6 交付归档** | 无归档要求（产出物直接写入项目目录） | 标准归档（reports/ + docs/） | 完整归档 + 永久保留策略 |

### 3.2 关键差异说明

**Small 项目的特殊规则**：
1. **跳过 L3 专项契约**：不加载 lifecycle-contract、review-gates-contract、engineering-standards-contract
2. **简化 L1 运行时**：
   - 意图解析保留，规范预告显示："将加载的规范：L0 硬门禁 + L1 运行时。Small 项目跳过以下契约：lifecycle-contract（阶段管理）、review-gates-contract（评审门禁）、engineering-standards-contract（代码规范）、repo-profile（项目档案）、command-catalog（命令目录）、全量模板与检查单。如需手动加载，请说 '加载XX契约'。"
   - 复杂度判定保留，Trivial 阈值全局统一（≤5 次工具调用），不因规模放宽
   - 评审闭环保留，但最大 Agent 数 = 2（无论复杂度）
3. **无 L5/L6 负担**：不强制使用 PRD/设计模板，产出物可为 Markdown 片段而非正式文档
4. **清理策略简化**：无需 task-state 归档，只需删除临时文件

**Medium 项目的标准规则**：
- 与当前 architecture-spec 定义的默认行为一致
- 加载 lifecycle + review-gates，按复杂度执行评审闭环

**Large 项目的增强规则**：
- 强制加载 engineering-standards-contract（识别 linter/formatter/typecheck）
- 强制使用完整 repo-profile + command-catalog
- Complex 任务强制产出 ADR（Architecture Decision Record）
- 所有产出物必须进入 L6 归档流程

---

## 4. 规模与复杂度的正交矩阵

**核心原则**：规模不改变复杂度判定结果，只改变**可用工具/模板/契约集合**和**最大 Agent 数上限**。

| 项目规模 | 任务复杂度 | 深度学习 | 评审 Agent 数 | 加载契约 | 产出模板 | 特殊要求 |
|---------|-----------|---------|--------------|---------|---------|---------|
| **Small** | Trivial | 豁免 | 0（主线程） | L0+L1 | 无 | 无 |
| **Small** | Standard | 简化（1 维度） | 1-2 | L0+L1 | 无 | 无 |
| **Small** | Complex | 完整（≥3 维度） | **2**（上限） | L0+L1 | 基础模板 | 无 ADR |
| **Medium** | Trivial | 豁免 | 0 | L0-L3 | 按需 | 无 |
| **Medium** | Standard | 简化 | 1-2 | L0-L3 | 标准模板 | 无 |
| **Medium** | Complex | 完整 | 3-4 | L0-L3 | 标准模板 | 无 |
| **Large** | Trivial | 豁免 | 0 | L0-L6 | 按需 | 无 |
| **Large** | Standard | 简化 | 1-2 | L0-L6 | 完整模板 | 无 |
| **Large** | Complex | 完整 | 3-4 | L0-L6 | 分层模板 | **强制 ADR** |

**安全硬门禁（优先于正交矩阵）**：
若任务涉及安全相关代码（认证、授权、输入过滤、路径校验、加密），**复杂度强制 ≥ Standard**，永不豁免。此规则在复杂度判定阶段（ComplexityJudge）优先执行，不受规模影响。

**重要**：
- Small + Complex 仍触发完整深度学习（元规范1不可豁免）
- Small 与 Medium/Large 在评审强度上的**核心差异**是 Agent 数上限（Complex 时 2 vs 4）；此外 Small 项目还跳过 L3 契约加载、无强制模板、无归档要求

---

## 5. Runtime 集成点

### 5.1 在运行时状态机中的位置

项目规模识别**不是独立层**，而是嵌入 L1 Runtime Spec 的 `IntentParse` 阶段：

```
[Idle] --(接收用户需求)--> [IntentParse: 意图解析 + 项目规模探测]
   |
   +--(首次会话 or 项目根目录变更)--> 执行规模探测算法
   |
   +--(已有 scale 缓存且目录未变)--> 读取缓存
   |
   v
[IntentConfirm: 意图确认 + 规模告知]
   |
   v
[ComplexityJudge: 任务复杂度分级]
   |
   v
[LoadSpec: 加载规范与角色（规模决定可用集合）]
```

### 5.2 规模缓存规则

```
缓存文件（会话级）: .claude/project/state/project-scale.yaml
用途: 跨任务快速复用，避免每次重复探测
内容:
  scale: Small | Medium | Large
  detected_at: ISO 时间戳
  source: auto | user | fallback
  repo_root: 绝对路径
  checksum: 根目录下关键标记文件的有序路径列表 + 各文件 mtime 的 hash（SHA-256）
        标记文件包括: package.json, Cargo.toml, go.mod, pyproject.toml, Makefile,
        .github/workflows/, pnpm-workspace.yaml, nx.json, 以及任何覆盖率配置文件
        注意: 普通源码文件编辑不触发 checksum 变化，只有结构级文件变更才触发

失效条件:
  1. 仓库根目录变更（cwd 切换到不同项目）
  2. 文件列表 checksum 变化（新增/删除包管理器、测试目录等）
  3. 用户显式覆盖
  4. 缓存超过 7 天
  5. 每次启动 Complex 任务前，主线程重新验证 checksum（防 mid-session 项目增长）

task-state 中的 project_scale 块（任务级快照）:
  - 每个任务创建时，从 project-scale.yaml 缓存复制 scale 值到 00-task-state.yaml
  - 用途: 审计追溯，确保任务记录包含当时的规模判定
  - 与缓存的关系: 缓存是 source of truth；task-state 是只读快照
```

### 5.3 意图确认模板更新

在标准意图确认模板中增加规模告知行：

```
我已理解你的需求：
- 任务类型：[调研/PRD/设计/编码/测试/发布/评审]
- 预期产出：[具体交付物]
- 项目规模：[Small / Medium / Large]（探测依据：文件数=X，包管理器=Y，测试infra=Z）
- 将加载的规范：[根据规模动态列出]
- 预估复杂度：[Trivial / Standard / Complex]
- 将使用的工具：[Read/Edit/Bash/Agent 等]

是否继续？
```

---

## 6. 与现有机制的差异说明

| 机制 | 现有任务复杂度分级（Trivial/Standard/Complex） | 项目规模识别 |
|------|------------------------------|-------------|
| **作用维度** | 单任务的执行路径 | 项目的全局契约可用集合 |
| **触发时机** | 每任务的复杂度判定后 | 会话首次交互时（缓存） |
| **是否影响复杂度** | 否 | **否**（正交） |
| **是否影响评审强度** | 是（轻量=简化评审） | 仅影响 Small 的 Agent 数上限（Complex 时 2 vs 4） |
| **是否新增文件** | 无 | project-scale-contract.md + project-scale.yaml |

**不重复**：现有 "轻量/标准/完整" 是 Runtime 内部的任务级路径分支；项目规模是项目级的契约加载策略。两者共存：规模决定「有哪些工具可用」，复杂度决定「这条路径走多深」。

---

## 7. 边界与约束

### 7.1 禁止行为

1. **禁止在规模探测中使用用户输入关键词**：只能读取文件系统状态，不能解析用户自然语言
2. **禁止规模覆盖安全规则**：Small 项目不能跳过安全评审，用户不能将 Large 降级为 Small
3. **禁止规模改变任务复杂度判定**："这是 Large 项目" 不会让一个单行修改变成 Complex
4. **禁止在未探测时假设规模**：首次会话必须先探测，不能默认 Medium

### 7.2 异常处理

| 异常情况 | 处理规则 |
|---------|---------|
| 非 git 仓库、权限不足 | fallback 到 Medium，记录 `source: fallback` |
| 探测超时（>3s） | 终止探测，fallback 到 Medium |
| 用户覆盖与自动判定冲突 | 以用户覆盖为准（但受上调-only 约束） |
| 规模探测结果与已知项目类型明显矛盾 | 向用户提示："检测到 Small，但这是否为大型框架的示例目录？" |

---

*本文档为项目规模识别契约。修改规模判定阈值或映射规则需经过评审闭环。*

> Last updated: 2026-04-27 | Version: v1.0
