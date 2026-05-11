---
contract_id: "dirty-hygiene"
title: "脏数据/脏链路卫生规范"
owner: "claude-code"
scope: "Write-or-Fail-or-Explicit硬规则、脏数据分类、检测触发、状态机、回收动作和Checker设计"
trigger: "每次写操作后、phase切换前、gate结论变更时、handoff前、closeout前、compaction时、新会话恢复时"
required_inputs: ["task-tracking状态", "context-compaction压缩记录"]
required_contracts: ["task-tracking", "context-compaction"]
required_skills: []
verification_checks: ["write-or-fail-or-explicit", "dirty-data-classification", "detection-trigger-timing", "state-machine-transitions", "recovery-action-list", "dirty-chain-prevention-checker", "dirty-hygiene-closure-checker", "dangling-reference-checker", "stale-projection-checker"]
exceptions: []
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 脏数据/脏链路卫生规范（Dirty Hygiene Specification）

## 1. 问题定义

任务执行过程中会不断产生中间产物：搜索结果的草稿、被否决的方案、失败的工具调用输出、过时的 state 值、旧的评审轮次、压缩后的旧上下文、孤儿文件。

如果不加以识别和清理，这些产物会成为：
- **脏数据**：与当前真相不一致但仍存在的状态
- **脏链路**：state → review → provenance → handoff 之间的断裂/错指/旧引用

后果：新会话恢复时读到过期结论、评审基于旧轮次、gate 基于不完整的证据链、closeout 留下未声明失效的入口。

## 2. 硬规则：Write-or-Fail-or-Explicit

**任何写操作必须满足以下三选一，不允许中间态：**

| 选项 | 要求 |
|------|------|
| **完整落盘** | 数据写入 + 链路回写到 task truth（state/board/checkpoint 中的对应字段更新） |
| **显式失败** | 写成 `failed` / `blocked` / `unavailable` / `stale`，并给出失败原因 |
| **显式恢复入口** | 写成 `recovering`，给出 recovery action 和完成条件 |

**禁止**：
- 写到一半就停止（半写入）
- 写了新值但未更新引用链路
- 留了临时文件但不说明用途和状态
- 把失败的尝试留着不标记，下次可能被误用

## 3. 脏数据完整分类

### 3.1 状态类脏数据

| 类型 | 示例 |
|------|------|
| 不一致状态 | board.yaml 说 work_item 在 in_progress，实际已完成 |
| 孤儿数据 | 评审报告中引用了已删除的 artifact |
| 半写入 | state 写了 phase=build，但 artifacts/ 里没有 build 产出 |
| 重复冲突 | 两个 checkpoint 文件，内容不同但都未标记哪个是当前 |
| 伪状态 | 文件名为 review-report 但内容为空，状态却写 passed |
| 过期未标注 | 旧轮次的 state 值未标记 stale，与当前轮次冲突 |

### 3.2 链路类脏数据

| 类型 | 示例 |
|------|------|
| 悬空引用 | state 中 last_review_report 指向的文件不存在 |
| 断裂链路 | review report 中声明 checker passed，但 checkers/ 中没有结果文件 |
| 错指 | README 的 Read First 指向已删除的文件 |
| 旧轮次残留 | review-bundles/rb-build-002 已通过，但 rb-build-001 仍被 state 引用为 active |
| phase 不同步 | state 写了 phase=verify，但 review-bundles 仍停留在 build 阶段 |
| evidence 未同步 | gate 写了 passed，但 review provenance 中没有对应的 receipt |

### 3.3 目录/文件类脏数据

| 类型 | 示例 |
|------|------|
| 孤儿文件 | artifacts/ 中有 draft-prd.md 但 state 中未引用 |
| 失败 bundle | review-bundles/rb-design-003 失败了但未清理或标记 |
| 临时文件 | 诊断输出、override 文件、generic 路径下的结果 |
| 过期 projection | 旧版本的 route-projection.yaml 未被 superseded 标记 |
| 未声明失效的入口 | closeout 后 task-root 的 README 仍指向开发态入口 |

## 4. 检测触发规则

以下时机**必须**执行脏数据/脏链路检测：

| 触发点 | 检测范围 |
|--------|---------|
| Phase 切换前 | 检查当前 phase 的产出是否完整、引用是否闭合 |
| Gate 结论变更时 | 检查 evidence/provenance 是否与结论一致 |
| Handoff 前 | 检查 state → review → provenance 链路是否完整 |
| Closeout 前 | 全面检测（所有类别） |
| Compaction 时 | 检查被压缩的内容是否仍有活跃引用 |
| 新会话恢复时 | 检查 state 与 artifact 实际状态是否一致 |
| 评审 Agent 派发前 | 检查 review bundle 的输入文件是否最新且完整 |

## 5. Dirty Hygiene 状态机

```
clean ──[检测到脏数据/链路]──→ dirty_detected
                                  │
                           ┌──────┼──────┐
                           v      v      v
                    recovering  blocked  stale(标记)
                         │
                    [回收完成]
                         │
                         v
                      clean
```

### 5.1 各状态含义

| 状态 | 含义 | 门禁规则 |
|------|------|---------|
| `clean` | 无脏数据/脏链路 | 正常推进 |
| `dirty_detected` | 检测到但未开始回收 | 不得推进 phase/gate |
| `recovering` | 正在回收 | 不得推进 phase/gate |
| `blocked` | 回收失败或不可回收 | 必须报告用户 |
| `stale`(标记) | 已显式标记失效 | 不再参与主链路，可保留但不引用 |

### 5.2 状态转换规则

| 当前状态 | 动作 | 新状态 |
|---------|------|--------|
| clean | 检测到脏数据 | dirty_detected |
| dirty_detected | 开始回收动作 | recovering |
| dirty_detected | 回收不可行 | blocked |
| recovering | 回收完成 + 证据回写 | clean |
| recovering | 回收失败 | blocked |
| blocked | 用户决策 + 手动清理 | clean 或 stale |
| 任意 | 显式标记为历史/失效 | stale(标记) |

## 6. 回收动作清单

检测到脏数据/脏链路时，必须按以下顺序执行回收：

### Step 1: 识别

- 列出所有脏数据/脏链路项
- 分类：状态类 / 链路类 / 目录类
- 标注每项的影响范围

### Step 2: 分类处理

| 脏类型 | 回收动作 |
|--------|---------|
| 状态不一致 | 更新 authoritative truth source，标记旧值为 stale |
| 孤儿数据 | 删除或移入 artifacts/archive/ 并标记用途 |
| 半写入 | 完成写入或显式标记 failed |
| 重复冲突 | 选择一个作为 canonical，其余标记 superseded |
| 悬空引用 | 更新引用或删除引用 |
| 断裂链路 | 补全链路证据或标记 gate failed |
| 旧轮次残留 | 标记旧轮次为 historical，更新 state 引用 |
| phase 不同步 | 回退 phase 或补全缺失证据 |
| 孤儿文件 | 删除（如果未被 state 引用） |
| 失败 bundle | 标记 failed 或删除 |

### Step 3: 证据回写

- 把回收结果写入 state 或 checkpoint
- 更新 dirty_hygiene_status
- 如果有 deleted/superseded 文件，记录删除清单

### Step 4: 验证

- 确认 no dangling references
- 确认 state 与 artifact 实际状态一致
- 确认无孤儿文件残留

## 7. Checker 设计

### 7.1 dirty-chain-prevention-check

**触发时机**：implementation/code-change 路径的每次写操作后

**检查面**：
- [ ] 本次写操作是否完整落盘？
- [ ] 是否有链路回写到 task truth？
- [ ] 是否有半写入残留？
- [ ] 是否有未标记状态的临时文件？

### 7.2 dirty-hygiene-closure-check

**触发时机**：closeout/release-ready/ready claim 前

**检查面**：
- [ ] 所有 review-bundles 中只有最新轮次被 state 引用？
- [ ] 无悬空引用（state 指向的文件都存在）？
- [ ] 无断裂链路（checker results / manual verification / exception ledger 一致）？
- [ ] temp artifact 已清理或标记？
- [ ] 旧 projection 已 superseded 或删除？
- [ ] artifacts/ 无孤儿文件？

### 7.3 dangling-reference-check

**触发时机**：state 更新后、handoff 前

**检查面**：
- [ ] state 中所有 *_ref 字段指向的文件都存在？
- [ ] 文件内容是否与引用意图匹配（不是同名不同内容）？
- [ ] 引用是否指向最新版本（不是旧轮次）？

### 7.4 stale-projection-cleanup-check

**触发时机**：phase 切换后、compaction 后

**检查面**：
- [ ] 旧版本的 projection 文件是否已 superseded 标记或删除？
- [ ] generic/override/temp 路径下的结果是否已清理或标记？
- [ ] 是否有文件在 state 中未被引用但仍存在于活跃目录？

## 8. 与现有规范的关系

| 现有规范 | 与本规范的关系 |
|---------|--------------|
| task-tracking-contract §5 | 本规范是其**执行面展开**，提供检测触发、状态机、回收步骤 |
| review-consistency-checklist §6 | 本规范提供 checklist 中各检查项的**具体执行规则** |
| verification-checker | 本规范定义 4 个 dirty 相关 checker 的**检查面** |
| closeout-contract | 本规范定义 closeout 中"脏数据/链路已清理"的**判定标准** |
| context-compaction-spec | 本规范定义压缩后对**被压缩内容的引用处理**规则 |
| task-directory-tree-spec | 本规范定义目录清理时的**分类处理规则** |
| CLAUDE.md Rule 4 | 本规范是 Rule 4 的**完整展开** |

## 9. 违反处理

| 违反类型 | 处理 |
|---------|------|
| 写了数据但未回写链路 | 立即补全或标记 failed |
| 留下未标记的临时文件 | 删除或归档并标记 |
| dirty_detected 状态仍推进 gate | 回退 gate 结论 |
| 回收失败未报告用户 | blocked，强制升级 |
| closeout 后发现脏数据 | 撤销 closeout，重新进入 recovering |
| 连续 2 次 dirty hygiene 问题 | 强制进入 dirty-audit 子流程（独立 Agent 全量审计） |
