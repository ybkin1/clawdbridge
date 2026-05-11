# 计划评审检查单 (Plan Review Checklist)

> 适用范围: Phase 3 开发计划（WBS + 风险登记册）
> 执行角色: /pmo（项目经理）
> 关联契约: lifecycle-contract.md §4.4、review-gates-contract.md §2

---

## Phase 3 开发计划评审

### Contract Gate（规范合规）
- [ ] [Critical] 开发计划格式是否符合 `templates/04-dev-plan-template.md` 模板要求？
- [ ] [Major] 风险登记册格式是否规范，状态字段是否完整（开放/缓解/关闭）？
- [ ] [Minor] 文档元信息（版本、日期、作者）是否填写完整？

### Professional Gate（专业质量）
- [ ] [Critical] 任务分解是否足够细（每个任务工期不超过 3 天）？
- [ ] [Critical] 依赖关系是否明确，是否存在循环依赖？
- [ ] [Major] 每个里程碑是否有可验证的交付物和验收标准？
- [ ] [Major] 是否识别了 Top3 风险并有明确的缓解措施和责任人？
- [ ] [Major] 计划是否预留了 20% 缓冲时间？
- [ ] [Minor] 关键路径上的任务是否有明确的负责人和时间约束？
- [ ] [Minor] 资源需求（人力、环境、第三方服务）是否评估充分？
- [ ] [Minor] 沟通计划（每日站会、周会）是否清晰可执行？

### Value Gate（价值判断）
- [ ] [Major] 开发计划是否完整覆盖了 Phase 2 架构设计中的所有模块？
- [ ] [Minor] 计划是否可跟踪、可演示，下一位执行者能否直接按此推进？

---

## 三、评审通过标准

| 等级 | 标准 | 后续动作 |
|------|------|---------|
| **通过** | 检查单全部勾选，无 Critical 问题，且关键路径明确 | 进入下一阶段 |
| **有条件通过** | 检查单全部勾选，有 Major 问题但已制定修复计划 | 进入下一阶段，Major 问题必须在下一里程碑前修复 |
| **不通过** | 有未解决的 Critical 问题，或检查单未全部勾选 | 打回修改，重新评审 |

---

*本文档由 lifecycle-contract.md 和 review-gates-contract.md 驱动。修改检查单项需经过评审闭环。*

> Last updated: 2026-04-27 | Version: v1.0
