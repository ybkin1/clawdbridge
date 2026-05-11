# 规范体系升级总结：执行追溯闭环 + AI 可执行蓝图约束

> Task: tk-20260511-001 | 日期: 2026-05-11 | 状态: completed

---

## 一、升级目标

将当前规范体系从「流程约束导向」升级为「内容结构约束导向」，确保 AI 编码 Agent 能直接照着设计文档写出正确代码，且每一行代码的来源可追溯。

## 二、修改清单

### L1 内核层

| 文件 | 修改 | 说明 |
|------|------|------|
| `.claude/CLAUDE.md` | 修正第86行 | "0 可执行脚本" → "10 个可执行脚本" |

### L2 契约层

| 文件 | 修改 | 说明 |
|------|------|------|
| `contracts/registry.yaml` | v1→v2 | 新增 `checklist_refs` / `checker_refs` 字段；所有契约增加纵向映射；新增 `execution-traceability` 契约；`document-depth` 和 `lego-assembly-workflow` 版本升级 |
| `contracts/execution-traceability.md` | 新建 | 定义 Design-Plan-Code 三层追溯链、双向引用矩阵、7 个 checkers、四级评审、审计机制 |
| `contracts/lego-assembly-workflow.md` | v1→v2 | §4.5 新增 §14-§18 强制章节定义；§4.1 新增 L4 代码块追溯规则；§4.6.5 新增 @packet 注释模板；§4.8 升级拼装验证链 |
| `contracts/work-packet-governance.md` | v1→v2 | 第 8 层后新增 8a 函数级层；§4.1 新增函数级拆包规则；§6 新增 `design_ref`/`oversized`/`oversized_reason`/`oversized_review` 字段 |
| `contracts/document-depth.md` | v1→v2 | §3.2 新增 `implementation_blueprint` 深度检查清单（10 项）；§4.2 新增 `implementation-ready` 判定标准（5 项） |

### L3 执行层

| 文件 | 修改 | 说明 |
|------|------|------|
| `checkers/index.yaml` | 新建 | 10 个现有 checker + 7 个新增 checker 的完整索引，含 mode/scope/gate_binding/contracts/stage 映射 |
| `checklists/index.yaml` | 新建 | 15 个 checklist 的完整索引，含 stage/gate/contracts 映射 |
| `checklists/stage4-design-review.md` | 修改 | 新增「函数级设计完整性」「复用设计」「通信协议设计」3 个评审维度（12 项检查） |
| `checklists/stage5-plan-review.md` | 修改 | 新增「设计-计划双向追溯」「包级约束」「合入计划」3 个评审维度（10 项检查） |
| `checklists/stage6-coding-review.md` | 修改 | 新增「代码溯源」「包级验收」「拼装验证」3 个评审维度（10 项检查） |

## 三、核心新增能力

### 1. 三层追溯链

```
L1 Design §14 伪代码
   ↑↓ 双向引用矩阵（≥95% 覆盖率）
L2 Dev Plan 工作包（@packet + @ref）
   ↑↓ 代码溯源注释
L3 代码实现（@packet 头部注释）
```

### 2. 7 个新 Checker

| checker_id | mode | 检查面 | gate |
|-----------|------|--------|------|
| `design-plan-bidirectional-ref-check` | automated | 双向引用覆盖率 ≥95% | contract |
| `packet-size-check` | automated | 包 ≤50 行或声明 oversized_justified | professional |
| `code-packet-annotation-check` | automated | 代码文件有 @packet 注释 | professional |
| `orphan-code-detection` | hybrid | 无未解释的孤儿代码 | professional |
| `exception-path-coverage-check` | manual | 异常路径在设计中有定义 | professional |
| `state-transition-coverage-check` | manual | 状态变更在设计中有追踪 | professional |
| `assembly-interface-alignment-check` | automated | 拼装接口类型对齐 | professional |

### 3. 四级评审体系

- 详设评审（Stage 4 结束）
- 计划评审（Stage 5 结束）
- **包级即时评审**（每个 L4 包编码完成）← 新增
- **拼装级评审**（每级拼装完成）← 新增
- 编码阶段评审（Stage 6 结束）
- 验收评审（Stage 7 结束）

### 4. 详设强制章节 §14-§18

| 章节 | 内容 | 作用 |
|------|------|------|
| §14 | 函数级调用链 + DI 总表 + 异常边界图 + 状态追踪 | AI 编码的直接来源 |
| §15 | 函数复用矩阵 | 防止重复造轮子 |
| §16 | 接口复用声明 | 跨模块消费关系清晰 |
| §17 | 通信协议逐消息设计 | 协议字段/序列化/超时/重试/降级 |
| §18 | 单元评审与合入计划 | 每个单元有评审人/合入条件/回滚策略 |

## 四、验证结果

运行 `dangling-reference-check` 和 `dirty-chain-prevention-check`：

- ✅ 本次修改的 10 个文件无悬空引用
- ✅ 本次修改的 10 个文件无脏链路
- ⚠️ 发现的错误均为历史遗留（tk-20260509-001 的孤儿 bundle、layered-architecture-contract.md 的无效引用），与本次升级无关

## 五、待后续补充（非本次 scope）

1. **7 个新增 checker 的可执行脚本**：当前仅在 `checkers/index.yaml` 中注册，实际 `.sh` 脚本待实现
2. **CLAUDE.md 契约导航表更新**：需补充 `execution-traceability` 到 action_family 映射
3. **契约物理目录分组**：contracts/ 目录下 28 个契约仍为扁平，可按 action_family 分组
4. **checklist 版本机制**：重大修改时应复制为 v2，当前是直接修改

## 六、使用方式

对于新的 Standard/Complex 任务：

1. 意图识别时，`action_family=implementation` 自动激活 `execution-traceability` 契约
2. 方案详设阶段，必须产出 §14-§18（函数级调用链 + 复用矩阵 + 协议设计 + 合入计划）
3. 开发计划阶段，必须产出双向引用矩阵（`artifacts/bidirectional-ref-matrix.yaml`）
4. 编码阶段，每个代码文件头部必须包含 `@packet` 注释
5. 评审阶段，自动运行关联 checklist 和 checker
