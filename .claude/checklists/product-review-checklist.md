# 产品评审检查单 (Product Review Checklist)

> 适用范围: Phase 0 初期调研与学习分析、Phase 1 产品定义（PRD）
> 执行角色: /pm（产品经理）主导，/tech-lead 辅助
> 关联契约: lifecycle-contract.md §4.1-4.2、review-gates-contract.md §2

---

## 一、Phase 0 调研评审（学习分析报告 + 竞品分析报告）

### Contract Gate（规范合规）
- [ ] [Critical] 信息来源清单是否完整，所有引用是否有可追溯的 URL 或文献？
- [ ] [Major] 报告格式是否符合 `templates/01-research-report-template.md` 模板要求？
- [ ] [Minor] 文档元信息（版本、日期、作者）是否填写完整？

### Professional Gate（专业质量）
- [ ] [Critical] 是否调研了至少 3 个竞品，覆盖技术实现、用户评价、已知缺陷？
- [ ] [Critical] 是否覆盖了目标技术栈的最新最佳实践（如 node-pty Windows 兼容性、鸿蒙 PWA 支持）？
- [ ] [Major] 竞品功能矩阵是否结构化，差异化机会是否明确？
- [ ] [Major] 是否识别了至少 2 个已知技术陷阱并标注来源？
- [ ] [Minor] 调研范围（关键词、信息来源、时间）是否清晰声明？

### Value Gate（价值判断）
- [ ] [Critical] 是否明确了对本项目的启示和待验证项？
- [ ] [Major] 是否发现至少 1 个此前未知的重大风险或机会？
- [ ] [Minor] 调研结论是否可直接用于 Phase 1 PRD 编写，无需二次脑补？

---

## 二、Phase 1 PRD 评审（产品需求文档）

### Contract Gate（规范合规）
- [ ] [Critical] 需求是否可追溯（每条需求是否有唯一 ID，如 US-1、FR-001）？
- [ ] [Major] PRD 格式是否符合对应模式模板（L1/L2/L3）？
- [ ] [Major] 目标设备矩阵是否明确包含 iOS + 鸿蒙 + 至少 1 款 Android？
- [ ] [Minor] 术语表是否完整，对外术语是否与公开文档一致？

### Professional Gate（专业质量）
- [ ] [Critical] 每个用户故事是否有明确的验收标准（可测试、可验证）？
- [ ] [Critical] P0 功能是否覆盖了核心价值主张，且数量不超过 5 个（MVP 原则）？
- [ ] [Major] 非功能需求（NFR）是否完整：性能、兼容性、安全、可访问性？
- [ ] [Major] 是否定义了明确不做清单（Out of Scope），防止范围蔓延？
- [ ] [Major] 是否识别了关键假设和风险，并制定了应对思路？
- [ ] [Minor] 功能优先级划分（P0/P1/P2）是否合理，是否有 ROI 评估依据？

### Value Gate（价值判断）
- [ ] [Critical] 目标用户画像是否与 Phase 0 调研结论和原始 intent 一致？
- [ ] [Critical] 关键使用场景是否覆盖了真实主路径（用户旅程地图是否完整）？
- [ ] [Major] 用户关键动作是否被当前方案支撑（无遗漏核心触点）？
- [ ] [Major] 用户失败触发点是否已处理（异常流程、错误状态）？
- [ ] [Minor] 下一位真实使用者（开发/测试/运营）是否能不改、不补、不脑补地直接使用本 PRD？

---

## 三、评审通过标准

| 等级 | 标准 | 后续动作 |
|------|------|---------|
| **通过** | 检查单全部勾选，无 Critical 问题 | 进入下一阶段 |
| **有条件通过** | 检查单全部勾选，有 Major 问题但已制定修复计划 | 进入下一阶段，Major 问题必须在下一里程碑前修复 |
| **不通过** | 有未解决的 Critical 问题，或检查单未全部勾选 | 打回修改，重新评审 |

---

*本文档由 lifecycle-contract.md 和 review-gates-contract.md 驱动。修改检查单项需经过评审闭环。*

> Last updated: 2026-04-27 | Version: v1.0
