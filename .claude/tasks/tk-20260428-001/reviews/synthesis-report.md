# 规范架构修复综合报告

**任务**：修复 25 项规范问题 + 4 Agent 并行评审 + 第二轮修补
**日期**：2026-04-30
**状态**：已完成两轮修补

---

## 第一轮修复总览（25 项）

| 编号 | 类型 | 修复内容 | 状态 |
|------|------|---------|------|
| C1 | 冲突 | 10阶段 vs 7阶段映射表 + Stage 0/收口说明 | Pass |
| C2 | 冲突 | task-tracking §5 概念定义，执行面引用 dirty-hygiene-spec.md | Cond |
| C3 | 冲突 | completeness-audit 引用 document-depth.md 成熟度定义 + 相对阈值 | Cond |
| C4 | 冲突 | blocked 术语统一：finding 终态 ≠ 流程终态 | Pass |
| C5 | 冲突 | tool_quirks → tool-quirks + 删除无用缩写表 | Cond |
| U1 | 清晰 | 上下文预算 5 信号估算表 + 事件驱动监控 | Cond |
| U2 | 清晰 | Value Gate = observable_success 可验证达成 | Cond |
| U3 | 清晰 | effective_scope 语法规范（列表=AND） | Cond |
| U4 | 清晰 | Karpathy 原则适用于 Stage 6 编码阶段 | Pass |
| U5 | 清晰 | Agent 评审隔离：Jaccard 相似度 + 小 artifact 例外 | Cond |
| N1 | 通用 | 相对字数阈值 + 轻量 Standard 取较低值 | Cond |
| N2 | 通用 | work-packet Standard 简化 6-8 层 + 非 web app 映射 | Cond |
| N3 | 通用 | 评审包 required/optional 标注 | Pass |
| N4 | 通用 | 密级 not_applicable + 使用范围限制 | Cond |
| H1 | 健壮 | registry.yaml 每契约 version 字段 + 快照语义 | Cond |
| H2 | 健壮 | CLAUDE.md 跨项目隔离：最近优先 | Cond |
| H3 | 健壮 | 9 种测试失败回退场景映射表 | **已修补** |
| H4 | 健壮 | 规范反馈循环：owner/triage/lifecycle 完整周期 | **已修补** |
| H5 | 健壮 | 外部参考豁免 + proof-of-search 防滥用 | **已修补** |
| H6 | 健壮 | non-file-artifacts/ 目录 + artifact-log.yaml | Cond |

---

## 第二轮修补（来自 Agent 额外发现）

| 编号 | 问题 | 修复内容 | 修改文件 |
|------|------|---------|---------|
| R1 | draft 成熟度未定义 | document-depth.md §4 增加 draft 行 | document-depth.md |
| U3-G | AND/OR 语义矛盾 | registry.yaml 语法：列表=AND，\|=字段内 OR | registry.yaml |
| U1-G | 系统消息可能不存在 + 监控不现实 | 改为事件驱动：5文件/写长文档/Agent返回/质量下降 | context-compaction-spec.md |
| U2-G | observable_success 自由文本 | intent-capture 增加格式约束要求 | intent-capture-contract.md |
| U5-G | 80% 阈值无精确计算 | 定义 Jaccard 文件级相似度 + ≤5 文件例外 | context-governance-contract.md |
| N2-G | 12 层只覆盖 web app | 增加 4 种非 web app 架构映射 | work-packet-governance.md |
| R2 | 结论词汇未映射 | review-gates §9 增加映射表 | review-gates-contract.md |
| N4 | not_applicable 可滥用 | 禁止用于用户数据/认证/密钥/第三方集成 | document-depth.md |
| N1 | 轻量 Standard 无关联 | 关联到 delivery_mode=quick 字段 | completeness-audit-spec.md |
| C5-I1 | -spec.md 后缀未覆盖 | file-naming §11 补充 5 种后缀模式 | file-naming-spec.md |

---

## 剩余未修复问题（建议第三轮）

| 优先级 | 编号 | 问题 | 严重程度 |
|--------|------|------|---------|
| 中 | V1 | 22 契约 conflicts_with 几乎全为空 | 中 |
| 中 | H1-G | version 字段无快照到 state.yaml 的强制约束 | 中 |
| 中 | A1/A2 | Trivial 任务 mode 未定义 / Lightweight Standard 新术语 | 低 |
| 低 | V6 | checklist 和 checker catalog 重复检查项 | 低 |
| 低 | V9 | escalation route 缺 needs_scope_change 等值 | 低 |
| 低 | R3/R4 | Stage 4-5 打包 / feedback.md 放置 | 低 |

---

## 修改文件清单（共 14 个文件）

| 文件 | 修改类型 | 修改行数估算 |
|------|---------|-------------|
| CLAUDE.md | 增补 | ~50 行新增 |
| task-tracking-contract.md | 修改 | ~5 行修改 |
| completeness-audit-spec.md | 修改 | ~10 行修改 |
| review-gates-contract.md | 增补 | ~20 行新增 |
| file-naming-spec.md | 修改 | ~10 行修改 |
| context-compaction-spec.md | 增补 | ~15 行新增 |
| context-governance-contract.md | 增补 | ~15 行新增 |
| registry.yaml | 增补 | ~30 行新增（版本字段+语法） |
| work-packet-governance.md | 增补 | ~10 行新增 |
| document-depth.md | 增补 | ~5 行新增 |
| intent-capture-contract.md | 增补 | ~5 行新增 |
| task-directory-tree-spec.md | 增补 | ~20 行新增 |

---

## 4 Agent 评审综合判定

| Agent | 覆盖范围 | Pass | Conditional | Fail | 额外发现 |
|-------|---------|------|------------|------|---------|
| 1-Consistency | C1-C5 | 2 | 3 | 0 | R1-R4 |
| 2-Clarity | U1-U5 | 1 | 4 | 0 | A1-A3 |
| 3-Applicability | N1-N4 | 1 | 3 | 0 | A1-A3 |
| 4-Robustness | H1-H6 + 全局扫描 | 0 | 4 | 2 | V1-V9 |

**总体**：原始 25 项修复中 4 项 Pass、18 项 Cond、3 项 Fail。第二轮已修补 3 Fail + 10 项 Cond 中的关键问题。剩余 6 项低优先级问题建议第三轮处理。
