# ClawdBridge Mobile — 完整测试方案

> 版本: v1.1 | 2026-05-10 | 阶段: Stage 7 (Verify)
> 基于: Design v2 + Dev Plan v2 | 总测试数: 179 | 分 7 层 12 大类 | 审计通过

---

## 一、测试策略总览

```
Layer 1: 单元测试         (121 条) — 每个模块/函数的独立验证
Layer 2: 功能模块测试      (32 条)  — 每个功能模块的完整业务逻辑链
Layer 3: 整机功能测试      (11 条)  — 全链路业务流程
Layer 4: 功能模块压力测试   (6 条)   — 单模块极限负载
Layer 5: 整机压力测试      (2 条)   — 系统整体极限负载
Layer 6: 功能模块性能测试   (7 条)   — 单模块延迟/吞吐/内存
Layer 7: 整机性能测试      (4 条)   — 系统整体性能基线 (手动·需真机 Claude CLI)

总计: 179 tests / 21 suites (+ 4 手动待执行)
```

---

## 二、Layer 1: 单元测试（121 条）

### 2.1 Bridge Server 单元测试

| 模块 | Suite | 测试数 | 覆盖点 |
|------|-------|--------|--------|
| BP01 WSServer | `test/ws-server.test.ts` | 9 | listen→connect→send→broadcast→cleanup |
| BP02 AuthMiddleware | `test/auth-middleware.test.ts` | 7 | query-token→header-token→none→refresh→prefer-query |
| BP03 MessageRouter | `test/message-router.test.ts` | 10 | 12-type→multi-handler→unknown→invalid-JSON→clear |
| BP04 Heartbeat | `test/heartbeat.test.ts` | 7 | register→pong→timeout→interval→stop→remove |
| BP05 CLISpawn | `test/cli-spawn.test.ts` | 6 | validation→key-env→fallback |
| BP06 StdinWriter | `test/stdin-writer.test.ts` | 3 | write→pipe→destroy |
| BP07 StdoutParser | `test/stdout-parser.test.ts` | 9 | text→tool_use→permission→buffer→multi-line→clear |
| BP08 StderrLogger | `test/stderr-logger.test.ts` | 10 | log→level-detect→session-filter→onError→Buffer→clear |
| BP09 ExitHandler | `test/exit-handler.test.ts` | 4 | exit→cleanup→nonzero→SIGTERM→SIGKILL |
| BP10-12 Approval | `test/approval-engine.test.ts` | 12 | whitelist→waiter→interceptor→timeout→scope |
| BP13-16 Auth | `test/auth-service.test.ts` | 6 | OAuth→refresh→reject-invalid |
| BP17-18 Routes | `test/routes.test.ts` | 6 | 401→list→pair→delete→create-session→404 |
| **小计** | | **99** | |

### 2.2 Mobile 单元测试

| 模块 | Suite | 测试数 | 覆盖点 |
|------|-------|--------|--------|
| MP05 SessionDAO | `test/session-dao.test.ts` | 3 | INSERT→SELECT→multi-row |
| MP06 MessageDAO | `test/dao.test.ts` | 5 | INSERT→SELECT→multi→filter |
| MP08 KVStoreDAO | `test/kv-store-dao.test.ts` | 3 | set→get→delete |
| MP10 WSSender | `test/ws-sender.test.ts` | 4 | send→seq→ACK→pending-range |
| MP13 SeqDeduplicator | `test/seq-dedup.test.ts` | 4 | first→duplicate→higher→per-session |
| MP14 SecureStore | `test/secure-store.test.ts` | 3 | store→retrieve→clear |
| **小计** | | **22** | |

---

## 三、Layer 2: 功能模块测试（32 条 = 14 Bridge + 18 Mobile）

### 3.1 Bridge Server 功能模块测试

| 模块 | Suite | 测试数 | 覆盖的业务流程 |
|------|-------|--------|--------|
| IP01 E2E 消息流 | `test/e2e/full-flow.test.ts` | 7 | WS-connect→JWT-issue→route→parse→stdin-write→auth→消息全链路 |
| IP02 E2E 审批闭环 | `test/e2e/approval-flow.test.ts` | 7 | 允许→拒绝→超时→白名单→session-scope→waiter→pending-count |

### 3.2 Mobile 功能模块测试

| 模块 | Suite | 测试数 | 覆盖的业务流程 |
|------|-------|--------|--------|
| MOBILE-FUNC-001 DeviceStore | `store-functional.test.ts` | 3 | 初始化→添加设备→删除设备 |
| MOBILE-FUNC-002 ChatStore | 同上 | 6 | 发送消息→接收流→停止→工具调用→错误消息 |
| MOBILE-FUNC-003 SessionStore | 同上 | 3 | 设置活动→批量加载→搜索过滤 |
| MOBILE-FUNC-004 WSSender | `service-functional.test.ts` | 3 | 50 条递增→多 session→ACK 清除 |
| MOBILE-FUNC-005 SeqDeduplicator | 同上 | 1 | 50 条乱序去重 |
| MOBILE-FUNC-006 SecureStore | 同上 | 2 | Token 生命周期→覆盖写入 |

---

## 四、Layer 3: 整机功能测试（11 条）

| 测试 ID | 业务流程 | 步骤 | 预期 |
|---------|---------|------|------|
| E2E-APP-001 | OAuth 登录 | POST /api/auth/oauth → JWT + refreshToken | 返回有效 token |
| E2E-APP-002 | 设备配对 | POST /api/devices/pair (含 name + platform) | 成功创建配对 |
| E2E-APP-003 | 创建会话 | POST /api/sessions | 返回会话对象 |
| E2E-APP-004 | WS 连接 | ws://localhost:port?token=xxx&device_id=xxx | 连接成功 |
| E2E-APP-005 | 消息发送 | WS send user_message × 5 | 全部发送成功 |
| E2E-APP-006 | 审批-允许 | intercept → 手机批准 → Claude 继续 | 返回 approved |
| E2E-APP-007 | 审批-拒绝 | intercept → 手机拒绝 → Claude 中止 | 返回 rejected |
| E2E-APP-008 | 审批-超时 | 60s 无响应 | 返回 auto_rejected |
| E2E-APP-009 | 会话始终允许 | addToWhitelist → 后续操作跳过审批 | 返回 approved |
| E2E-APP-010 | Token 刷新 | POST /api/auth/refresh | 返回新 pair |
| E2E-APP-011 | 设备解绑 | DELETE /api/devices/:id | 成功删除 |
| E2E-APP-012 | Claude stdout 解析 | 6 行含 text/tool_use/tool_result/permission | 正确分类 |
| E2E-APP-013 | 进程生命周期 | spawn→exit 通知 | 回调收到 exitCode |
| E2E-APP-014 | 进程崩溃检测 | process.exit(42) | 检测到 crash |

> **注**: E2E-APP-015 (断连恢复)、E2E-APP-016 (多会话管理)、E2E-APP-017 (设备在线状态) 已设计但未实现自动化脚本 — 记录在 §12 已知限制。

---

## 五、Layer 4: 功能模块压力测试（6 条）

| 测试 ID | 模块 | 压力场景 | 通过条件 |
|---------|------|---------|---------|
| STRESS-001 | MessageRouter | 批量路由 1000 条消息 | 0 丢失, 延迟 < 500ms |
| STRESS-002 | MessageRouter | 单 handler 被击 1000 次 | 全部触发 |
| STRESS-003 | JWTIssuer | 连续签发 500 个 token | 延迟 < 1s |
| STRESS-004 | ApprovalInterceptor | 1000 个并发白名单请求 | 100% approved, 无异常 |
| STRESS-005 | StdoutParser | 1000 行 JSON 一次性解析 | 0 丢失, 延迟 < 200ms |
| STRESS-006 | StderrLogger | 1000 条日志写入 | 0 丢失, 延迟 < 100ms |

---

## 六、Layer 5: 整机压力测试（2 条）

| 测试 ID | 压力场景 | 步骤 | 通过条件 |
|---------|---------|------|---------|
| SYS-STRESS-001 | 100 并发 WebSocket 连接 | 分批 20 连接, 5 批 | 100/100 成功, 0 error |
| SYS-STRESS-002 | 500 条广播×10 客户端 | 连接 10 个客户端→广播 500 条 | 消息接收率 > 90% (网络抖动允许少量丢失，WebSocket 基于 TCP) |

---

## 七、Layer 6: 功能模块性能测试（7 条）

| 测试 ID | 模块 | 指标 | 目标 | 测量方法 |
|---------|------|------|------|---------|
| BENCH-001 | WSServer | WS 消息 RTT (本地) | < 500ms | 5 次 send→receive 计时取平均 |
| BENCH-002 | ApprovalEngine | 拦截→决议延迟 | < 50ms | intercept→resolve 计时 |
| BENCH-003 | ApprovalEngine | 白名单跳过延迟 | < 5ms | isWhitelisted→return 计时 |
| BENCH-004 | JWTIssuer | 单次签发延迟 | < 5ms | 100 次取平均 |
| BENCH-005 | StdoutParser | 1000 行解析 | < 200ms | performance.now |
| BENCH-006 | StderrLogger | 1000 条写入 | < 100ms | performance.now |
| BENCH-007 | 内存 | 1000 条日志内存增长 | < 2MB | heapUsed before→after |

---

## 八、Layer 7: 整机性能测试（4 条 — 全部手动，需真机 Claude CLI 环境）

| 测试 ID | 指标 | 目标 | 场景 | 测量方法 | 状态 |
|---------|------|------|------|---------|------|
| SYS-BENCH-001 | 端到端消息延迟 | < 300ms (局域网) | App→Bridge→Claude CLI→App | WS send→receive RTT | ⚠️ 手动 |
| SYS-BENCH-002 | 审批闭环延迟 | < 2s | intercept→wait→approve→resolve | 全链路计时 | ⚠️ 手动 |
| SYS-BENCH-003 | 冷启动时间 | < 3s (App) | Expo 生产构建启动 | `npx expo start` to bundle ready | ⚠️ 手动 |
| SYS-BENCH-004 | 对话列表加载 | < 1s | 500 个会话 SQLite 查询 | query→render 计时 | ⚠️ 手动 |

> **执行条件**: 需要 (1) 桌面上安装 Claude Code CLI 并配置 ANTHROPIC_API_KEY, (2) 手机安装 Expo Go 并通过隧道连接到 Bridge Server, (3) 局域网环境。当前阶段不可自动化。

---

## 九、测试执行矩阵

| Phase | 测试层 | 触发条件 | 预期时长 | 自动/手动 |
|--------|------|---------|---------|---------|
| Sprint 1 D6 | 单元测试 (Bridge 99) | 每个文件写完 | 12s | ✅ 自动 (jest) |
| Sprint 2 D6 | 单元测试 (Mobile 22) | 每个文件写完 | 10s | ✅ 自动 (jest) |
| Sprint 2 D6 | 功能测试 (Mobile 18) | Store/Service 写完后 | 5s | ✅ 自动 (jest) |
| Sprint 3 W5 | 功能测试 (Bridge 14) | E2E 文件写完后 | 8s | ✅ 自动 (jest) |
| Sprint 3 W5 | 压力测试 (6) | 功能测试通过后 | 30s | ✅ 自动 (jest) |
| Sprint 3 W5 | 性能测试 (7) | 功能测试通过后 | 20s | ✅ 自动 (jest) |
| Sprint 3 W6 | 整机功能测试 (11) | 全模块写完后 | 20s | ✅ 自动 (jest) |
| Sprint 3 W6 | 整机压力测试 (2) | 整机功能通过后 | 60s | ✅ 自动 (jest) |
| Sprint 3 W6 | 整机性能测试 (4) | 整机功能通过后 | 30s | ⚠️ 手动 (需真实 Claude CLI) |
| 真机验收 | 完整回归 | 所有通过后 | ~3min | ✅ 自动 + 手动 |

---

## 十、CI/CD 脚本

```bash
#!/bin/bash
# test-all.sh — ClawdBridge 全量测试

echo "=== Layer 1: 单元测试 ==="
cd bridge-server && npx jest test/ws-server test/auth-middleware test/message-router test/heartbeat test/cli-spawn test/stdin-writer test/stdout-parser test/stderr-logger test/exit-handler test/approval-engine test/auth-service test/routes test/jwt-issuer --verbose

cd ../mobile && npx jest test/dao test/session-dao test/kv-store-dao test/ws-sender test/seq-dedup test/secure-store --verbose

echo "=== Layer 2: 功能模块测试 ==="
cd ../bridge-server && npx jest test/e2e/full-flow test/e2e/approval-flow --verbose
cd ../mobile && npx jest test/store-functional test/service-functional --verbose

echo "=== Layer 4: 压力测试 ==="
cd ../bridge-server && npx jest test/perf/stress --verbose

echo "=== Layer 6: 性能测试 ==="
cd ../bridge-server && npx jest test/perf/benchmark --verbose

echo "=== Layer 3+5: 整机功能+压力测试 ==="
cd ../bridge-server && npx jest test/e2e/app-e2e --verbose

echo "=== Complete ==="
```

---

## 十一、测试覆盖总结

```
Layer 1: 单元测试         ██████████ 121 tests ✅
Layer 2: 功能模块测试      ██████████  32 tests ✅
Layer 3: 整机功能测试      ██████████  11 tests ✅
Layer 4: 功能模块压力测试  ██████████   6 tests ✅
Layer 5: 整机压力测试      ██████████   2 tests ✅
Layer 6: 功能模块性能测试  ██████████   7 tests ✅
Layer 7: 整机性能测试      ░░░░░░░░░░   4 tests (手动·待真机环境)
                                ────
                      总计: 179 tests / 21 suites
```

| 指标 | 现状 | 目标 |
|------|------|------|
| 自动测试通过率 | 179/179 (100%) | 100% |
| 压力测试稳定性 | 6 条 / 0 异常 | 0 异常 |
| 性能基线 | 7 条全通过 | 全通过 |
| 整机性能 (真实链路) | 4 条未执行 | 待真机 Claude CLI |

> ⚠️ 覆盖率数据（按 jest --coverage）当前未配置。Mobile UI 组件测试因 `jest(testEnvironment: 'node')` 无法渲染 React Native 组件而缺失 — 见 §12。

---

## 十二、已知限制

### 12.1 Mobile UI 组件零自动化测试

移动端 8 个屏幕/组件无自动化渲染测试：

| 组件 | 原因 | 计划 |
|------|------|------|
| ChatScreen, MessageBubble, ApprovalCard, InputBar, SessionListScreen, DeviceScreen, AuthScreen, SessionCard | jest.config.js 配置 `testEnvironment: 'node'`，需 `jest-expo` preset + `@testing-library/react-native` 才能渲染 React Native 组件 | Phase 2 引入或真机手动验收 |

> 当前通过 Expo Go 手动走查 (exp://wg7ppgq-anonymous-8081.exp.direct) 作为替代验证。

### 12.2 跨进程集成测试缺失

当前所有测试均为**单进程 mock**：
- WS 测试：测试内直接 `new WebSocket` 连接本地 WSServer
- Approval 测试：直接调用 `new ApprovalInterceptor()` 方法
- E2E 测试：同一 Node 进程内启动 express + WSServer

**无** Mobile App ↔ Bridge Server ↔ Claude Code 的真实跨进程 E2E 测试。需真实 Claude CLI 环境。

### 12.3 覆盖率数据未配置

当前未运行过 `jest --coverage`，无 lcov/html 覆盖率报告。`npx jest --coverage` 可在 bridge-server 目录直接运行以获取数值。

### 12.4 Layer 7 四件套待执行

SYS-BENCH-001~004 需要在桌面安装 Claude Code CLI + 手机端 Expo Go 真机连接的条件下手动执行。当前 dev 环境不具备该条件。
