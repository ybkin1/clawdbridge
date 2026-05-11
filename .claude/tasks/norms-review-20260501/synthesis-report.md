# 规范架构 4-Agent 联合评审综合报告

**Date**: 2026-05-01
**方法**: 4 个独立评审 Agent 并行评审 → 冲突标记 → 统一综合

---

## 1. 评审 Agent 分工

| Agent | 评审维度 | Critical | High | Medium | Low |
|-------|---------|----------|------|--------|-----|
| #1 架构完整性 | 契约依赖链、约束力、规范漏洞、CLAUDE.md 索引、intent-routing 评估 | 3 | 9 | 6 | 3 |
| #2 工具引用审计 | 工具引用正确性、Skill 注册、MCP 映射、路由表一致性、反模式 | 1 | 4 | 3 | 2 |
| #3 目录/命名规范 | 目录结构、文件命名、契约内部一致性、交叉引用、checklist | 2 | 6 | 7 | 2 |
| #4 评审集群编排 | 评审触发、多 Agent 判定、评审 Agent 类型、收口链路、可执行性 | 3 | 3 | 3 | 0 |

**去重后总计**: 9 Critical / 22 High / 19 Medium / 7 Low

---

## 2. Critical 问题（9 项，去重合并）

| # | 问题 | 来源 | 涉及文件 |
|---|------|------|---------|
| C1 | **循环依赖**: architecture-blueprint ↔ lego-assembly-workflow | Agent #1, #3 | registry.yaml:116 |
| C2 | **contract-schema.md 自违反**: 自身缺少 trigger 字段 | Agent #1 | contract-schema.md front matter |
| C3 | **全部 verification_checks 为 0 可执行**: 约束力 100% 依赖 Agent 自觉 | Agent #1, #3 | CLAUDE.md, verification-checker.md |
| C4 | **中文非法文件名**: gap-analysis-round3 下 2 个中文命名文件 | Agent #3 | tasks/gap-analysis-round3/* |
| C5 | **Markdown 表格断裂**: intent-capture-contract.md observable_success 行溢出 | Agent #3 | intent-capture-contract.md:48-49 |
| C6 | **cluster-orchestration 完全缺失 review 场景**: multi_agent 触发条件不包含 review | Agent #4 | cluster-orchestration.md §6.1, §6.3 |
| C7 | **多评审 Agent verdict 聚合规则缺失**: 2-4 个 Agent 各自 verdict 后如何聚合无定义 | Agent #4 | review-gates-contract.md §11, CLAUDE.md Rule 2 |
| C8 | **Review Receipt Schema 不支持多 Agent**: reviewer_id 单数字段、无 reviewers 数组 | Agent #4 | review-gates-contract.md §12 |
| C9 | **任务 ID 格式全部违规**: 3 个任务目录均不符合 tk-YYYYMMDD-NNN 规范 | Agent #3 | tasks/ 目录命名 |

---

## 3. High 问题（22 项，去重合并，Top 10 列出）

| # | 问题 | 来源 |
|---|------|------|
| H1 | work-packet-governance front matter required_contracts 与 registry.yaml depends_on 不同步 | Agent #1 |
| H2 | storage-location (active 契约) 未在 CLAUDE.md 契约导航表中注册 | Agent #1, #3 |
| H3 | Trivial 豁免过宽，可被利用规避所有规范 | Agent #1 |
| H4 | intent-routing 路由表场景不足（缺少任务管理/环境配置/规范改进） | Agent #1 |
| H5 | 外部 Skill 不可验证，无安装检查机制和 fallback 路径 | Agent #1 |
| H6 | Plan capability ID 在 Agent 表和 Skill 表不一致 | Agent #2 |
| H7 | value_gate capability 未定义在能力目录中 | Agent #2 |
| H8 | general-purpose / statusline-setup Agent 无 Skill 注册和路由路径 | Agent #2 |
| H9 | 规范定义了不存在的 references/ 目录 | Agent #3 |
| H10 | 3 个任务目录均缺少规范要求的核心子目录 | Agent #3 |

---

## 4. 实际可执行性分析（以"帮我评审这个设计文档"为例）

| 步骤 | 预期行为 | 能否执行 | 断点 |
|------|---------|---------|------|
| a) 识别 review action_family | intent-routing.md §3.6 匹配 | **可以** | 无 |
| b) 加载 review 相关契约 | CLAUDE.md 契约导航表 | **可以** | 无 |
| c) 判定 Standard vs Complex | CLAUDE.md 复杂度表 | **模糊** | H-2: review 专用升级词表缺失 |
| d) 派发 ≥2 独立评审 Agent | CLAUDE.md Rule 2 要求 | **可能断开** | C6: cluster-orchestration 无 review 触发条件 |
| e) 收集评审结果并聚合 | review-gates verdict 映射 | **可能断开** | C7: 多 Agent verdict 聚合规则缺失 |
| f) 写入评审 receipt | review-gates §12 schema | **不完整** | C8: receipt schema 不支持多 Agent |

**结论**: 链路在步骤 (c)-(f) 存在断开风险。核心根因是 review 场景在 cluster-orchestration 契约中被遗漏，导致多 Agent 评审的"发动机"缺失。

---

## 5. 约束力闭环评估

| 维度 | 声明的 checks | 可自动执行 | 约束力评分 |
|------|--------------|-----------|-----------|
| 工具路由 | 4 | 0 | 0% |
| 评审门控 | 5 | 0 | 0% |
| 脏数据卫生 | 8 | 0 | 0% |
| 上下文压缩 | 7 | 0 | 0% |
| 审查一致性 | 9 | 0 | 0% |
| **合计** | **~40** | **0** | **0%** |

当前体系为 **advisory（建议级）** 而非 **enforcement（强制级）**。所有规则通过 Agent 意识和评审清单执行，无自动化拦截。

---

## 6. 修复优先级建议

### Wave 3A（立即修复，阻断日常使用）
1. **C1**: 打破 architecture-blueprint ↔ lego-assembly-workflow 循环依赖
2. **C2**: contract-schema.md 补充 trigger 字段
3. **C6**: cluster-orchestration 增加 review 场景 multi_agent 触发条件
4. **C7**: review-gates 增加 verdict 聚合规则
5. **C8**: Review Receipt Schema 扩展为多 Agent 版本

### Wave 3B（短期修复，1-2 周内）
6. **C4/C5/C9**: 清理脏数据（中文文件名、表格断裂、任务 ID 格式）
7. **H1**: 同步 work-packet-governance front matter
8. **H2**: CLAUDE.md 补充 storage-location 索引
9. **H6-H8**: 修复工具引用不一致
10. **C3**: 实现 3 个最高频 checker 为可执行脚本

### Wave 3C（中期优化）
11. **H3-H5**: 规范漏洞修补（Trivial 豁免负面清单、路由场景扩展、Skill fallback）
12. **H9-H10**: 创建缺失的目录结构
13. 其余 Medium/Low 问题
