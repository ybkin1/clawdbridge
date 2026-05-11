---
contract_id: "document-depth"
title: "文档深度契约"
owner: "claude-code"
scope: "文档深度等级、成熟度要求和密级声明，防止文档过薄却宣称成熟"
trigger: "authoring动作产出PRD/设计稿/契约文档时，必须声明depth_profile和maturity_target"
required_inputs: ["review-gates评审结论"]
required_contracts: ["review-gates"]
required_skills: []
verification_checks: ["document-classification", "depth-profile-match", "maturity-target-declared", "confidentiality-level-declared", "review-explicit-answers"]
exceptions: []
supersedes: []
version: 1
last_reviewed_at: "2026-04-30"
---

# 文档深度契约（Document Depth & Confidentiality Contract）

## 1. 目的

把"文档该写多细、当前成熟到什么程度"从作者自由发挥提升为可执行的硬规则，防止文档过薄却宣称成熟。

## 2. 文档分类

| document_class | 含义 |
|---------------|------|
| `learning_packet` | 单一研究包 |
| `learning_synthesis` | 主题级综合学习报告 |
| `feature_brief` | 特性简报 |
| `theme_prd` | 主题级/根级 PRD |
| `package_prd` | 单功能包 PRD |
| `confidential_design` | 详细设计/内部蓝图 |
| `execution_plan` | 开发/实现/测试计划 |
| `machine_control` | 状态文件/manifest/handoff |
| `review_artifact` | 评审报告/provenance |

## 3. 深度等级

| depth_profile | 含义 |
|--------------|------|
| `summary` | 面向简报/索引/总览 |
| `detailed` | 信息充分展开，可支撑下游实现 |
| `whitepaper_like` | 系统性论述，可独立被外部读者理解 |
| `implementation_blueprint` | 接近工程蓝图，可直接支撑开发 |

### 3.1 默认深度要求

| 文档类型 | 默认深度 |
|---------|---------|
| learning_packet | detailed |
| learning_synthesis | whitepaper_like |
| theme_prd | whitepaper_like |
| package_prd | detailed |
| confidential_design | implementation_blueprint |
| feature_brief | detailed |
| execution_plan | detailed |
| machine_control | summary |

### 3.2 implementation_blueprint 深度检查清单

`confidential_design` 文档声明 `depth_profile=implementation_blueprint` 时，必须满足以下全部检查项：

| # | 检查项 | 最低要求 |
|---|--------|---------|
| 1 | §14 函数级调用链 | 存在 §14 章节，包含 ≥1 条完整流程的 STEP1→STEPM 伪代码 |
| 2 | §14.0 依赖注入总表 | 所有跨模块调用的模块都有 DI 条目 |
| 3 | §14.7 异常传播边界图 | 覆盖所有模块的主要异常出口 |
| 4 | 状态变更追踪 | 每条主流程末尾有状态变更追踪块 |
| 5 | §15 函数复用矩阵 | 所有被 ≥2 个模块调用的函数都有复用条目 |
| 6 | §16 接口复用声明 | 所有跨模块接口都有消费者声明 |
| 7 | §17 通信协议设计 | 每种消息类型都有字段/序列化/超时/重试/降级定义 |
| 8 | §18 合入计划 | 每个单元有评审人/合入条件/目标分支/回滚策略 |
| 9 | 伪代码粒度 | 达到 if/try/for/await 级别，不是只有函数签名 |
| 10 | 双向引用就绪 | Dev Plan packet manifest 草稿已产出，≥80% 函数级包已有 `@ref` 指向 §14 STEP；双向引用矩阵作为 Stage 5 正式产出，不在 Stage 4 强制要求 |

## 4. 成熟度要求

| maturity_target | 含义 |
|----------------|------|
| `draft` | 骨架/大纲，正文未充分展开，不得用于下游消费 |
| `contract-ready` | 字段/结构/下游挂接闭合，可用于下游消费 |
| `authoring-ready` | 可作为下游作者阶段权威，但正文不一定充分 |
| `publish-ready` | 内容充分展开，适合正式发布 |
| `implementation-ready` | 对实现的直接消费足够，AI Agent 可直接编码 |

### 4.1 硬规则

- `contract` gate 通过 ≠ `publish-ready`
- `authoring-ready` 不能包装成"已经是成熟成稿"
- `theme_prd` 只有最小合同字段 ≠ 成熟
- `learning_synthesis` 只有检索清单和结论 ≠ 成熟
- `confidential_design` 只有模块标题 ≠ 成熟

### 4.2 implementation-ready 判定标准

`confidential_design` 达到 `implementation-ready` 必须同时满足：

1. §3.2 `implementation_blueprint` 深度检查清单 10 项全部通过
2. §14 函数级调用链覆盖率 ≥ 架构拆解中 L4 代码块数量的 95%
3. Dev Plan 双向引用矩阵已产出或通过预检
4. 每个 §14 STEP 包含：输入参数、返回值、至少 1 条异常路径、状态变更说明
5. 不存在 "TBD"/"TODO"/"后续补充" 等占位符

**未达 implementation-ready 的 confidential_design 不得进入 build phase。**

## 5. 评审必须回答

对 learning / PRD / design 的评审必须显式回答：
1. 当前通过的是哪一层成熟度
2. 展开度是否达到该文档类型的默认 depth_profile
3. 若未达到，缺口在结构/案例/接口/配置/数据/异常路径还是验收矩阵

## 6. 密级

每份文档必须声明 `confidentiality_level`：
- `public`: 可对外
- `internal`: 仅内部
- `project_confidential`: 项目级，不得对外（PRD 和详细设计默认此级）
- `not_applicable`: 纯内部工具/个人项目，密级区分无实际意义时使用。等同于 `internal`。禁止用于涉及用户数据、认证、密钥、第三方集成的文档。
