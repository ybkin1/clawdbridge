# Post-Task Cleanup Rule — 脏数据清理（会话结束强制）

> 触发时机：每次多步骤任务结束时，或用户说"完成/好了/继续下个"时。
> 目的：防止中间文件、废弃草稿、过期引用污染项目。

---

## 强制清理规则

### Step 1: 扫描工作区（必须执行）

在任务闭环前，扫描以下路径确认无残留：

```
检查清单:
  - [ ] 项目根目录下是否有本次任务产生的临时文件（*.tmp, draft*, WIP*）？
  - [ ] .claude/tasks/ 下是否有未归档的中间产出？
  - [ ] Downloads/ 或 Desktop/ 是否有任务相关的暂存文件？
  - [ ] .trae/memory/ 是否需要更新本次任务的决策记录？
```

### Step 2: 分类处置

| 类别 | 动作 | 示例 |
|------|------|------|
| **最终产出** | 保留在项目工作目录内 | PRD.md, design.md, 代码文件 |
| **中间草稿** | 删除或移到 `artifacts/archive/` | draft-*.md, temp-*.txt |
| **搜索结果** | 保留关键结论，删除原始输出 | 大量 WebSearch 全文 |
| **废弃方案** | 移到 `design-docs/rejected/` | rejected-alternative.md |

### Step 3: 记忆沉淀

关键决策/偏好/踩坑 → 写入:

| 信息类型 | 写入位置 |
|---------|---------|
| 用户偏好/风格变更 | `.trae/memory/user-preferences.md` |
| 技术决策/架构选择 | `.trae/memory/project-decisions.md` |
| 反复踩坑/教训 | `.trae/memory/pitfalls.md` |
| 环境/配置变更 | `.trae/memory/environment.md` |

### Step 4: 验证

```bash
# 确认无文件散落到禁止位置
# 禁止位置: Desktop/, Downloads/, %TEMP%, C:\Windows\, C:\Program Files\
```

---

## 禁止行为

1. **禁止**: 把 tmp/test/draft 文件留在项目根目录
2. **禁止**: 在 Downloads/ 中创建任务产出
3. **禁止**: 写了一半的文件不说状态 → 必须标记 complete/draft/rejected
4. **禁止**: 同一个文件存在多个版本不标记最终版 → 归档旧版本
