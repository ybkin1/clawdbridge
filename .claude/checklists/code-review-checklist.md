# 代码评审检查单 (Code Review Checklist)

> 适用范围: Phase 4 编码实现（每个 PR / 代码提交）
> 执行角色: /tech-lead（Agent 评审）
> 关联契约: lifecycle-contract.md §4.5、review-gates-contract.md §2、engineering-standards-contract.md

---

## Phase 4 代码评审（每个 PR）

### 分层架构合规性(Standard / Complex 强制,Trivial 豁免)
- [ ] [Critical] Controller 是否直接访问了 DAO / Mapper / PO?(违反 `layered-architecture-contract.md` §5 C3)
- [ ] [Critical] 是否存在逆向调用(内层调外层)或跨层调用(跳层)?
- [ ] [Critical] DTO 是否分类独立:Req / Res / VO / PO 互不复用?
- [ ] [Major] 同层组件间调用是否经过明确接口,有无跨包直接 new?
- [ ] [Major] 组件文件是否超过 200 行(或项目 ADR 中自定义的阈值)?
- [ ] [Minor] 组件矩阵中"测试文件"列是否填写完整(基础层 Util 必填,DDL 可豁免)?

### Contract Gate（规范合规）
- [ ] [Critical] 代码是否通过了 ESLint + TypeScript 编译，无规范冲突？
- [ ] [Critical] Commit 历史是否符合 Conventional Commits 规范（`type(scope): subject`）？
- [ ] [Major] 是否引入了新的依赖？如有，是否有 ADR 记录？
- [ ] [Major] 是否修改了接口协议？如有，协议文档是否同步更新？
- [ ] [Minor] 代码文件头/模块注释是否符合项目模板要求？

### Professional Gate（专业质量）
- [ ] [Critical] 是否包含单元测试？核心模块覆盖率是否达到或超过 80%？
- [ ] [Critical] 是否处理了所有边界条件和错误路径（异步错误必须捕获）？
- [ ] [Major] TypeScript 类型是否严谨：显式返回类型（公共 API）、禁止 `any`、优先 `interface`？
- [ ] [Major] 错误处理是否统一：统一错误类层次、外部边界校验输入、内部信任契约？
- [ ] [Major] 代码是否遵循 Simplicity First 原则（最小代码解决问题）？
- [ ] [Minor] 是否进行了手动验证（Happy Path）？
- [ ] [Minor] 变更范围是否为 Surgical Changes（只修改必要代码）？
- [ ] [Minor] 每个变更是否对应可验证的成功标准（Goal-Driven）？

### Value Gate（价值判断）
- [ ] [Major] 当前代码实现是否完整覆盖了对应开发计划中的任务目标？
- [ ] [Minor] 下一位维护者是否能不改、不补、不脑补地理解和扩展本代码？

---

## 三、评审通过标准

| 等级 | 标准 | 后续动作 |
|------|------|---------|
| **通过** | 检查单全部勾选，CI 全部通过，无 Critical 问题 | 合并代码，进入下一阶段 |
| **有条件通过** | 检查单全部勾选，有 Major 问题但已制定修复计划 | 合并代码，Major 问题必须在下一里程碑前修复 |
| **不通过** | 有未解决的 Critical 问题，或检查单未全部勾选，或 CI 未通过 | 打回修改，重新评审 |

---

*本文档由 lifecycle-contract.md 和 review-gates-contract.md 驱动。具体代码规范细节由 engineering-standards-contract.md 持有。修改检查单项需经过评审闭环。*

> Last updated: 2026-04-27 | Version: v1.0
