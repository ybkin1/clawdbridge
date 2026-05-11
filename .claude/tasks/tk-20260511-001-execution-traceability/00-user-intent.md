# User Intent

## 核心诉求
升级当前 Claude Code 规范体系，使其能够支撑「AI 编码 Agent 可直接照着写出正确代码」的 AI 可执行蓝图标准。

## 已确认的需求
1. 50 行约束改为「默认认知负荷上限 + 例外申报」
2. 方案详设细化到函数级（§14 函数级调用链 + §15-§18 新增章节）
3. 开发计划与详设双向引用（@ref → Design §14 STEP）
4. 设计-计划-执行三层追溯链闭环
5. 四级评审（阶段门控 + 包级即时评审 + 拼装级评审）
6. 自动化审计 checkers（双向引用、包大小、代码溯源、孤儿代码等）

## 当前问题
当前 3 层规范架构（内核→契约→执行）能承载新增内容，但层内缺少索引和纵向映射：
- 契约与 checklist/checker 之间无显式关联
- checkers/ 目录扁平，无分组索引
- registry.yaml 不注册 checklist/checker 引用

## 预期产出
1. 修正 CLAUDE.md 文档错误（checker 数量）
2. 新增 checkers/index.yaml + checklists/index.yaml（L2-L3 纵向映射）
3. 扩展 registry.yaml（增加 checklist_refs / checker_refs）
4. 新增 execution-traceability.md 契约
5. 修改 lego-assembly-workflow.md（§14-§18 强制章节）
6. 修改 work-packet-governance.md（L4 函数级 + oversized 字段）
7. 修改 document-depth.md（implementation_blueprint L4 要求）
8. 修改 stage4/5/6 评审清单（新增追溯/约束/验收检查项）
