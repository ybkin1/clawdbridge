# 发布评审检查单 (Release Checklist)

> 适用范围: Phase 6 发布与变更管理（Changelog + 发布材料 + 变更请求）
> 执行角色: /pmo（项目经理）主导，/pm 辅助
> 关联契约: lifecycle-contract.md §4.7、review-gates-contract.md §2

---

## Phase 6 发布评审

### Contract Gate（规范合规）
- [ ] [Critical] 版本号是否已更新并符合 SemVer 规范？
- [ ] [Critical] Changelog 是否已更新并符合 Keep a Changelog 规范？
- [ ] [Major] 发布检查单格式是否符合 `templates/06-release-checklist.md` 模板要求？
- [ ] [Major] 变更请求单格式是否规范，审批状态是否明确？
- [ ] [Minor] 文档元信息（版本、日期、作者）是否填写完整？

### Professional Gate（专业质量）
- [ ] [Critical] 文档是否已更新（用户手册、API 文档）？
- [ ] [Critical] 回滚方案是否已准备并经过验证？
- [ ] [Major] 线上监控是否已配置（错误率、性能指标）？
- [ ] [Major] 通知渠道是否已准备（用户群、邮件、站内信）？
- [ ] [Minor] 发布材料是否完整（版本说明、已知问题清单、升级指南）？

### Value Gate（价值判断）
- [ ] [Major] 当前发布内容是否完整覆盖了 PRD 中定义的发布策略和里程碑目标？
- [ ] [Minor] 用户是否能不改、不补、不脑补地直接安装和使用新版本？

---

## 三、变更控制检查（发布后）

- [ ] [Critical] 任何对 PRD 的修改是否都通过了变更请求单？
- [ ] [Major] 变更请求是否经过完整的影响分析（对 PRD、设计、进度、测试的影响）？
- [ ] [Major] 已发布的版本是否禁止直接修改，必须通过新版本发布？

---

## 四、评审通过标准

| 等级 | 标准 | 后续动作 |
|------|------|---------|
| **通过** | 检查单全部勾选，线上监控无 Critical 告警 | 正式发布 |
| **有条件通过** | 检查单全部勾选，有 Major 问题但已制定修复计划 | 有条件发布，Major 问题必须在下一版本前修复 |
| **不通过** | 有未解决的 Critical 问题，或检查单未全部勾选 | 中止发布，回滚或修复后重新评审 |

---

*本文档由 lifecycle-contract.md 和 review-gates-contract.md 驱动。修改检查单项需经过评审闭环。*

> Last updated: 2026-04-27 | Version: v1.0
