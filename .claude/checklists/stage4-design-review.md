# Stage 4: 方案详设 评审清单

## 来源
Rule 2: Mandatory Deep Iterative Review — Covered outputs

## 评审维度

### 架构对应
- [ ] 每个功能模块是否有对应的设计章节
- [ ] 接口契约是否与架构拆解中的定义一致
- [ ] 数据模型是否与架构选型的数据库匹配
- [ ] 架构拆解中的每个最小积木块（函数/组件/API）是否有对应的设计方案

### 详细程度
- [ ] API设计：URL/Method/Request/Response/Error码是否完整
- [ ] 数据模型：字段/类型/约束/索引是否完整
- [ ] 状态机：状态流转图/触发条件/终态是否完整
- [ ] 关键算法：伪代码/流程说明/复杂度分析是否完整

### 可执行性
- [ ] 设计方案是否可直接指导编码（不需要脑补）
- [ ] 依赖关系是否明确（内部依赖/外部依赖）
- [ ] 是否有第三方集成的接入方案

### 可维护性
- [ ] 是否遵循架构拆解中的分层原则
- [ ] 错误处理策略是否统一
- [ ] 日志/监控/埋点设计是否覆盖

### code-review-graph 执行流验证
- [ ] `list_flows_tool` 返回的执行流是否在设计中全部覆盖
- [ ] 关键执行路径复杂度是否与 `get_flow_tool` 分析一致
- [ ] 设计中新增/修改的函数是否会影响现有执行流

### 函数级设计完整性（新增）
- [ ] §14 函数级调用链章节是否存在（强制章节，非可选）
- [ ] §14 包含的函数定义数量 ≥ 架构拆解中 L4 代码块数量的 95%
- [ ] 每个 §14 STEP 包含：输入参数、返回值、异常路径（try/catch/throw）、状态变更
- [ ] §14.0 跨模块依赖注入总表是否完整（每个需要注入的模块都有条目）
- [ ] §14.7 异常传播边界图是否覆盖所有模块的异常出口
- [ ] 每条主流程末尾是否有「状态变更追踪」块
- [ ] 伪代码粒度是否达到 if/try/for/await 级别（不是只有函数签名）
- [ ] 双向引用矩阵是否已产出或可在同批次产出（Dev Plan 与 Design §14 的覆盖预检）

### 复用设计（新增）
- [ ] §15 函数复用矩阵是否存在（函数签名 → 被调用模块 → 调用次数）
- [ ] §16 接口复用声明是否存在（接口 → 消费者 → 消费方式）
- [ ] 重复逻辑是否提取为复用函数（而非 copy-paste）

### 通信协议设计（新增）
- [ ] §17 通信协议逐消息设计是否存在（消息类型/字段/序列化/超时/重试/降级）
- [ ] 协议消息是否有复用设计（通用消息头、共享 payload 结构）
- [ ] 每种消息类型的超时和降级策略是否明确

### 合入计划设计（新增）
- [ ] §18 单元评审与合入计划章节是否存在
- [ ] 每个单元是否有指定的评审人
- [ ] 每个单元是否声明了合入前置条件
- [ ] 每个单元是否指定了合入目标分支
- [ ] 每个单元是否有回滚策略

### verdict
- Pass: 无Critical，Major已修复或有修复计划，Minor≤3
- Conditional Pass: 无Critical，Major已接受并有缓解方案
- Fail: 任何Critical未解决

---

## 首轮全维并行审计子清单（v2 新增·review-gates §4.4 强制）

> R1 必须启用 3+ Agent 并行审计以下 8 维。每个 Agent 最多承担 3 维。
> 每维的每个检查项对应一个具体的 finding 类别。未做检查视为缺失维度。

### 维度 1: 安全纵深（Agent A）

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| 1.1 | 所有用户输入点是否有 sanitize/escape？检查全文 `sanitize\|escape\|validate\|xss\|csrf` 关键词匹配 | CRITICAL — 全局安全缺口 |
| 1.2 | 文件路径是否防穿越？（`path.join(uploadPath, file.originalname)` 中有无 `path.basename` 净化） | CRITICAL — 路径穿越 |
| 1.3 | SQL 是否使用参数化绑定？（所有 DB INSERT/UPDATE/SELECT 是否 `db.prepare(...).run(params)` 而非字符串拼接） | MAJOR — SQL 注入 |
| 1.4 | WebSocket 是否有 maxPayload 限制？（`ws.on('message')` 前有无 `maxPayload` 配置） | MAJOR — DoS |
| 1.5 | JWT 密钥是否有轮转机制？（单 `JWT_SECRET` 环境变量有无 rotation 说明） | MAJOR — 密钥泄露 |
| 1.6 | Express 是否有 helmet/CORS 配置？ | MINOR — 安全 header |
| 1.7 | 第三方 Token (GitHub PAT) 是否声明最小权限范围？ | MINOR — 权限过大 |

### 维度 2: 边界条件（Agent A）

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| 2.1 | 所有 spawn/connect/create 操作是否有首次失败的 try/catch？ | MAJOR — 启动失败无处理 |
| 2.2 | 消息/输入为空时服务端是否有校验拒绝？ | MAJOR — 空消息穿透 |
| 2.3 | 资源不存在（repo/file/session）时是否有降级路径？ | MAJOR — 404 无处理 |
| 2.4 | WebSocket 消息是否只去重不重排？(seq=1,3,2 时 seq=2 是否错误丢弃) | MINOR — 乱序丢失 |
| 2.5 | 是否有最大消息长度声明？（无声明则无保护） | MINOR — 长消息 OOM |
| 2.6 | Unicode/Emoji/RTL 兼容性是否声明？ | MINOR — 国际化缺口 |

### 维度 3: 并发安全（Agent B）

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| 3.1 | 同一 Session 是否允许多设备同时写？有队列吗？ | MAJOR — 上下文混淆 |
| 3.2 | 审批超时与手动响应是否可能同时触发？（60s 超时 + 59.9s 响应到达） | MAJOR — 竞态条件 |
| 3.3 | WS 重连期间到达的新消息与补发消息是否碰撞？ | MINOR — seq 交叉 |
| 3.4 | SQLite WAL 模式下的并发写假设是否声明？ | MINOR — 假设未声明 |
| 3.5 | 任何共享状态是否标注了 `// 单线程串行使用` 注释？ | MINOR — 并发安全文档 |

### 维度 4: 资源限定（Agent B）

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| 4.1 | 最大 WebSocket 连接数是否声明？ | MAJOR — 连接耗尽 |
| 4.2 | SQLite DB 大小是否有上限？有无 VACUUM 策略？ | MAJOR — 磁盘耗尽 |
| 4.3 | 最大并发 Claude 进程数是否有硬上限和降级（503）？ | MINOR — 无降级 |
| 4.4 | stdin ringBuffer 的字节上限和行上限是否一致且精确？ | MINOR — 1MB vs 100 行不一致 |
| 4.5 | 内存总预算是否细化到模块级？ | MINOR — 无预算 |

### 维度 5: 环境声明（Agent B）

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| 5.1 | npm 依赖是否有版本号？（`ws` vs `ws@8.x`） | MAJOR — 版本冲突 |
| 5.2 | Expo SDK 版本是否声明？ | MAJOR — API breaking |
| 5.3 | SQLite 最低版本是否声明？（`json_valid()` 需要 ≥3.37.0） | MINOR — 语法不支持 |
| 5.4 | ECS/服务器最低规格是否在 Design 中重复声明？ | MINOR — 规格不明 |
| 5.5 | Docker base image 和 `claude` CLI 路径是否声明？ | MINOR — 路径假设 |

### 维度 6: 内部一致性（Agent C）

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| 6.1 | 任何伪代码中的方法名是否与 class 签名一致？（如 `jwtVerifier` vs `wsAuthenticate`） | MAJOR — 调用失败 |
| 6.2 | §10.1 Migration 版本号是否覆盖 §6.0 DDL 的所有表？ | MAJOR — DDL 缺失 |
| 6.3 | §7 REST API 端点列表是否覆盖全部 §14 伪代码中调用的端点？ | MAJOR — API 遗漏 |
| 6.4 | §12 包拆分算术是否正确？（小计行数加总 = 总计行数） | MINOR — 算术错误 |
| 6.5 | §1.1 架构图中模块数是否与设计实际模块数一致？ | MINOR — 架构图过期 |
| 6.6 | DDL 字段是否包含所有 class 签名中的过滤维度？（如 `user_id`） | MAJOR — 数据隔离缺失 |

### 维度 7: PRD×Design 对齐（Agent C）

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| 7.1 | 每个 FR-xxx 是否有对应 Design 章节 + §14 流 + Dev Plan @ref？ | MAJOR — 覆盖率缺口 |
| 7.2 | 是否存在 PRD 功能在 Design 中零覆盖？ | MAJOR — 功能遗漏 |
| 7.3 | 是否存在 Design 章节无 PRD 功能追溯？ | MINOR — 孤立设计 |
| 7.4 | PRD 与 Design 之间的命名是否一致？（如 Anthropic vs Kimi） | MINOR — 命名不一致 |

### 维度 8: 设计规范符合性（Agent C）

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| 8.1 | `depth_profile: implementation_blueprint` 声明的蓝图目标是否达成？（开发者只读此文档即可编码） | MAJOR — 可执行性不达标 |
| 8.2 | 是否每个 class 有 DI 声明？（§14.0 依赖注入表覆盖全部模块） | MINOR — DI 缺失 |
| 8.3 | 是否每个写操作有幂等声明？(X-Idempotency-Key) | MINOR — 幂等缺失 |
| 8.4 | 是否遵循命名一致性、DRY、接口隔离原则？ | MINOR — 规范违反 |
| 8.5 | 文档 header 的 maturity_target/version/变更 是否与实际内容一致？ | MINOR — 元信息过期 |

---

## 双文档交叉审计子清单（Dev Plan ↔ Design）

当同时评审设计文档和开发计划时，追加以下检查：

| # | 检查项 | 对应 finding 类别 |
|---|--------|-----------------|
| C1 | Dev Plan 每包的 @ref 是否指向 Design 中实际存在的章节？ | MAJOR — 悬空引用 |
| C2 | Dev Plan 总包数/总行数与 Design §12 是否一致（或差异已解释）？ | MAJOR — 算术不一致 |
| C3 | Sprint 天数 × 人力是否可完成声明的包数？（≤10 包/人/天） | MAJOR — 产能高估 |
| C4 | Sprint 之间的依赖是否存在跨 Sprint 未声明的先决条件？ | MAJOR — 环形依赖 |
| C5 | 站会检查点的累积包数是否算术正确？（Day N = Sprint 1..N 完成包数累加） | CRITICAL — 站会算术错误 |
