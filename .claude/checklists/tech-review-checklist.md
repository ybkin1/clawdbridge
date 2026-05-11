# 技术评审检查单 (Tech Review Checklist)

> 适用范围: Phase 2 方案详设（架构设计 + 接口协议 + 安全设计）
> 执行角色: /tech-lead 主导，/pm 辅助确认需求理解
> 关联契约: lifecycle-contract.md §4.3、review-gates-contract.md §2

---

## Phase 2 设计评审（架构设计文档 + 接口协议文档 + 安全设计文档）

### 分层架构完整性(Standard / Complex 强制,Trivial 豁免)
- [ ] [Critical] 是否完成项目类型识别,并选定了正确的分层套装(`layered-architecture-contract.md` §2)?
- [ ] [Critical] 分层架构图是否覆盖全部四层(API / 业务 / 数据 / 基础),**无空层**?
- [ ] [Critical] 组件清单矩阵是否完整,每行对应 1 个 WBS 原子任务?
- [ ] [Critical] 跨层调用方向是否合规,无逆向/跨层/Controller 直连 DAO?
- [ ] [Major] DTO 是否分类独立(Req / Res / VO / PO 互不复用)?
- [ ] [Major] WBS 原子任务是否按依赖图调度,关键路径明确?

### Contract Gate（规范合规）
- [ ] [Critical] 架构设计文档格式是否符合 `templates/03-arch-design-template.md` 模板要求？
- [ ] [Critical] 接口协议是否有明确的版本号，版本化策略是否清晰？
- [ ] [Major] 所有设计决策是否有 ADR（Architecture Decision Record）记录？
- [ ] [Major] 文档中的需求追溯是否完整（引用 PRD 需求 ID）？
- [ ] [Minor] 文档元信息（版本、日期、作者）是否填写完整？

### Professional Gate（专业质量）
- [ ] [Critical] 架构图是否覆盖了 PRD 中所有 P0 功能，模块职责是否清晰？
- [ ] [Critical] 状态机是否有死循环或无法到达的状态？
- [ ] [Critical] 错误码是否完整，覆盖所有异常路径？
- [ ] [Major] 模块边界是否合理，耦合度是否可控？
- [ ] [Major] 技术选型是否匹配场景，是否有替代方案对比？
- [ ] [Major] 安全设计是否覆盖了输入过滤、路径安全、认证授权？
- [ ] [Major] 兼容性设计是否明确包含 iOS + 鸿蒙的具体适配点（如 ArkWeb 特性、星盾权限）？
- [ ] [Minor] 数据流设计是否清晰，核心流程是否有箭头图或时序图？
- [ ] [Minor] 是否识别了技术债务并制定了偿还计划（含影响、缓解措施、时间）？
- [ ] [Minor] 可测试性如何（Mock 策略、覆盖率可行性）？

### Value Gate（价值判断）
- [ ] [Major] 当前设计方案是否能支撑 PRD 中所有用户故事的关键动作？
- [ ] [Major] 异常路径和失败触发点是否已设计对应的处理机制？
- [ ] [Minor] 下一位实现者（/dev）是否能不改、不补、不脑补地直接按设计开发？

---

## 三、评审通过标准

| 等级 | 标准 | 后续动作 |
|------|------|---------|
| **通过** | 检查单全部勾选，无 Critical 问题，且通过至少 1 轮同行评审 | 进入下一阶段 |
| **有条件通过** | 检查单全部勾选，有 Major 问题但已制定修复计划 | 进入下一阶段，Major 问题必须在下一里程碑前修复 |
| **不通过** | 有未解决的 Critical 问题，或检查单未全部勾选 | 打回修改，重新评审 |

---

*本文档由 lifecycle-contract.md 和 review-gates-contract.md 驱动。修改检查单项需经过评审闭环。*

> Last updated: 2026-04-27 | Version: v1.0
