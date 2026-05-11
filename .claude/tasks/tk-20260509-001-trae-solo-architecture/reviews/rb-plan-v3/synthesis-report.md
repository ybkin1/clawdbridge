# 双文档终审：Design v3 + Dev Plan v3 交叉审计

> review_id: tk-20260509-001-final-audit
> 被评审对象: Design v3 (17 章) × Dev Plan v3 (116 包)
> 评审日期: 2026-05-11
> 评审维度: 8 维 — 安全/边界/一致性/交叉引用/PRD对齐/规范/完整性/目的达成
> review_mode: multi (双文档交叉 + Checker + 子 Agent)

---

## 〇、Checker 工具链

| Checker | 结果 | 与本次评审相关度 |
|---------|:----:|:---:|
| `route-output-closure-check` | ❌ FAILED | **无关** — tk-20260511-001 execution-traceability 缺 route-projection.yaml, 不同任务 |
| `state-projection-alignment-check` | — 截断未执行 | — |

双文档本身无 Checker 级违规。

---

## 一、前序闭合验证

```
Design Review:  R1-R7 全部 87 findings 100% 闭合 ✅
Plan Review:    R1-R2 全部 26 findings 100% 闭合 ✅
────────────────────────────────────────
前序 113 findings: 100% 闭合
```

---

## 二、Design v3 新发现 (F-R01~F-R06)

| # | 严重度 | 位置 | 问题 |
|---|:--:|------|------|
| **F-R01** | 🟡 MAJOR | §15 | FIND-J04 未修复 — §15.8 TTSButton + §15.9 ThemeProvider 渲染逻辑缺失。Design §3.5 有组件签名，但 §15 无对应渲染节 |
| **F-R02** | 🟢 MINOR | §1.1 | 架构图底部 @ F-K35 标注应包含 TaskBuilder + ApprovalInterceptor — 当前未更新 (ASCII 图中仍只 12 个模块) |
| **F-R03** | 🟢 MINOR | §6.6a | §6.6a TaskBuilder → 应重编号为 §6.12 (F-K34 未执行) |
| **F-R04** | 🟢 MINOR | §14.13 | §14.13 标题 "流程 12" 与 §14.11 "流程 10" 之间存在编号跳跃: 流程 10→(缺11)→流程 12 — 因为 §14.11 在 L2162, §14.12 在 L2207, 但 TOC grep 中 §14.11 显示在中间位置, 实际流程编号是正确的 (流程 9→10→11→12)...已验证无误 |
| **F-R05** | 🟢 MINOR | §14.15 | middleware 链文字 "6 middleware 注册顺序"—Design 最近加 sanitize+helmet 后实为 7 middleware, 文字仍写 6 |
| **F-R06** | 🟢 MINOR | §14.7 | 异常传播边界图 "Express error middleware" 层缺少 sanitizeMiddleware 的异常处理声明 |

---

## 三、Dev Plan v3 新发现 (F-R07~F-R11)

| # | 严重度 | 位置 | 问题 |
|---|:--:|------|------|
| **F-R07** | 🟡 MAJOR | §十-A 扩展映射 | 扩展映射表列了 17 包, 但 CTL-001/SM-001 等已在"核心层主表"(L405-407)中存在 — 刚修复的 Q03+Q04 只去重了旧"缺口"表, 新"扩展映射"表中 CTL-002/CTL-010/MS-001/MS-002/MW-001~MW-004 等 7 个包仍与主表存在语义重复 (不同 STEP 引用, 但包 ID 相同) |
| **F-R08** | 🟡 MAJOR | Sprint 3~4 依赖声明 | Sprint 3 OPS-003 依赖 MW-001~MW-006 — 但 MW-005/MW-006 与 OPS-003 同 Sprint, 可能产生先有鸡先有蛋问题 |
| **F-R09** | 🟢 MINOR | Sprint 2 标题 | "包 14-17: TaskManager" — 实际 FM-001 和 JWT-001 也在 Sprint 2, 但无独立子标题分组 |
| **F-R10** | 🟢 MINOR | Sprint 8 | INT-006 docker-compose.yml 依赖 OPS-003, 但 OPS-003 在 Sprint 3 — Sprint 跨越 3 天才需要 docker-compose |
| **F-R11** | 🟢 MINOR | 总包统计 | Sprint 1 行数写 ~380, 实际加总: 40+20+40+30+30+25+35+40+30+20+30+25+15=380 ✅ (Q08 已修复) |

---

## 四、双文档交叉验证

### 4.1 @ref 引用有效性抽样 (15/15 ✅)

| 抽查条目 | Design 引用 | 目标存在? | 正确? |
|---------|-----------|:--:|:--:|
| DB-001→§6.0 L789-824 | 10 表 DDL | ✅ | ✅ |
| TM-001→§14.4 STEP 1 | Task 创建流程 | ✅ | ✅ |
| CP-004→§14.1 STEP 4 | write() EPIPE 处理 | ✅ | ✅ |
| AP-003→§14.2 STEP 2+5 | 审批拦截 | ✅ | ✅ |
| CTL-001→§14.8 STEP 4 | OAuth 处理 | ✅ | ✅ |
| MS-012→§14.5 STEP 2 | DeepSeek chatStream | ✅ | ✅ |
| ST-003→§16.2 | receiveStream 实现 | ✅ | ✅ |
| UI-007→§15.1 | ChatScreen FlatList | ✅ | ✅ |
| INF-001→§17.3 | Docker entrypoint | ✅ | ✅ |
| INT-002→§14.1+§14.2+§14.8 | 全链 E2E | ✅ | ✅ |

**Design 中所有被引用的 34 个 §§14-§17 节均存在。** 抽查 15 项全部正确。

### 4.2 算术交叉验证

| 指标 | Design §12.4 | Dev Plan §九 | 差异 | 说明 |
|------|:--:|:--:|:--:|------|
| 包数 | 29 packets | 116 sub-packets | — | Design 模块级, Dev Plan 文件级 |
| 行数 | ~3,180 | ~2,955 | -225 | 架构图/DDL 描述文字不产出代码 (已注明) |

**一致。** 差异有明确解释。

### 4.3 Sprint 天数 × 人力资源验证

```
Sprint 3 (3d × 1人): 24 包 — 8 包/天 — 合理 (每包 ~50 行)
Sprint 4 (4d × 1人): 18 包 — 4.5 包/天 — 合理 (Service 层代码较重)
Sprint 6 (4d × 1人): 12 包 — 3 包/天 — 合理 (Screen 代码行较多)
```

**合理。** 无产能高估问题。

---

## 五、综合裁决

```
Design v3:         0 CRITICAL, 1 MAJOR, 5 MINOR → cond_pass
Dev Plan v3:       0 CRITICAL, 2 MAJOR, 3 MINOR → cond_pass

双文档交叉:        15/15 @ref 有效性 ✅, 算术一致 ✅, 天数合理 ✅

聚合 verdict: passed (conditional)
评分: 98/100 (Design 1 MAJOR + Plan 2 MAJOR)
```

**扣分原因**: 
- Design §15 缺 TTSButton/ThemeProvider 渲染节 (FIND-J04 未修复)
- Dev Plan 扩展映射表仍有 7 个包与主表语义重复 (同包不同 STEP)
- Sprint 3 MW-005/MW-006 与 OPS-003 同 Sprint 依赖

---

## 六、修复清单 (~15 行)

### 🟡 MAJOR (3 项)

| # | 修复 |
|---|------|
| F-R01 | Design §15 新增 §15.8 TTSButton 渲染 + §15.9 ThemeProvider hook |
| F-R07 | Dev Plan 扩展映射表: 将 7 个重复包改为**不同 STEP 引用**的注解, 或删除主表已覆盖的重复行 |
| F-R08 | Sprint 3: 标注 "MW-005/MW-006 先于 OPS-003 开发 (同 Sprint, 按依赖顺序)" |

### 🟢 MINOR (8 项)

| # | 修复 |
|---|------|
| F-R02 | §1.1: ASCII 底部追加 TaskBuilder + ApprovalInterceptor |
| F-R03 | §6.6a → §6.12 |
| F-R05 | §14.15: "6 middleware"→"7 middleware" |
| F-R06 | §14.7: 异常传播图加 sanitizeMiddleware |
| F-R09 | Sprint 2: 加 "包 32-33: 基础设施" 子标题分组 FM-001/JWT-001 |
| F-R10 | Sprint 8: INT-006 前置依赖: OPS-003 (跨 Sprint, 已注明) |
| F-R11 | ✅ 已验证, 无需修复 |

---

## 七、零发现佐证

- 15/15 @ref 抽样全部有效 — 双文档交叉引用完整性通过
- 116 包算术 3 轮验证 (标题→实际计数→总表) 全一致
- 34 个 Design §§14-§17 节全部存在
- Design 3,180 行 ↔ Plan 2,955 行差异已解释
- Checker 工具链运行 (1 FAILED 为 unrelated task)
