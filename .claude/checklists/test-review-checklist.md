# 测试评审检查单 (Test Review Checklist)

> 适用范围: Phase 5 测试验证（测试方案 + 测试用例 + 测试报告）
> 执行角色: /pmo + /pm（联合），QA（如有）
> 关联契约: lifecycle-contract.md §4.6、review-gates-contract.md §2

---

## Phase 5 测试评审

### Contract Gate（规范合规）
- [ ] [Critical] 测试方案格式是否符合 `templates/05-test-plan-template.md` 模板要求？
- [ ] [Critical] 测试用例是否基于 IEEE 829 / ISO 29119 标准设计？
- [ ] [Major] 测试报告是否给出了明确的 Go/No-Go 结论？
- [ ] [Minor] 文档元信息（版本、日期、作者、测试环境）是否填写完整？

### Professional Gate（专业质量）
- [ ] [Critical] 测试用例是否覆盖了所有 P0 功能的验收标准？
- [ ] [Critical] 单元测试覆盖率是否达到或超过 80%（核心模块）？
- [ ] [Critical] E2E 测试是否覆盖了核心用户流程（US-1 ~ US-N）？
- [ ] [Major] 是否进行了真机测试（iOS + 鸿蒙）？
- [ ] [Major] 严重缺陷（Blocker / Critical）是否已全部修复？
- [ ] [Major] 主要缺陷（Major）数量是否不超过 2 个且有修复计划？
- [ ] [Minor] 测试用例是否可独立执行，预期结果是否明确、可验证？
- [ ] [Minor] 是否覆盖了正常路径、异常路径、边界条件？

### Value Gate（价值判断）
- [ ] [Critical] 测试结果是否证明产品满足 PRD 中的验收标准？
- [ ] [Major] 已知未修复缺陷的影响是否在测试报告中明确评估？
- [ ] [Minor] 发布建议（Go / No-Go）是否有充分的数据支撑？

---

## 三、评审通过标准

| 等级 | 标准 | 后续动作 |
|------|------|---------|
| **通过** | 检查单全部勾选，严重缺陷 = 0，测试报告结论为 "Go" | 进入发布阶段 |
| **有条件通过** | 检查单全部勾选，有 Major 问题但已制定修复计划 | 有条件发布，Major 问题必须在下一版本前修复 |
| **不通过** | 有未解决的 Critical 问题，或检查单未全部勾选，或测试报告结论为 "No-Go" | 打回修改，重新测试评审 |

---

*本文档由 lifecycle-contract.md 和 review-gates-contract.md 驱动。修改检查单项需经过评审闭环。*

> Last updated: 2026-04-27 | Version: v1.0
