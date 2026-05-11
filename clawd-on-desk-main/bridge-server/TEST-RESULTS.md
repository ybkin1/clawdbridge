# Layer 3: 整机功能测试 (11 条) — app-e2e.test.ts
  ✅ E2E-001 Step 1: OAuth 登录      86ms
  ✅ E2E-001 Step 2: 设备配对         7ms
  ✅ E2E-001 Step 3: 创建会话         6ms
  ✅ E2E-001 Step 4: WS 5 条消息    510ms
  ✅ E2E-001 Step 5: 审批→批准      12ms
  ✅ E2E-001 Step 6: 白名单跳过       1ms
  ✅ E2E-001 Step 7: Token 刷新        3ms
  ✅ E2E-001 Step 8: 审批超时       101ms
  ✅ E2E-002 Claude 会话解析          1ms
  ✅ E2E-003 进程生命周期            90ms
  ✅ E2E-003 进程崩溃检测            33ms

# Layer 4: 压力测试 (6 条) — stress.test.ts
  ✅ STRESS-001: 100 并发连接       160ms
  ✅ STRESS-002: 路由 1000 条消息      6ms
  ✅ STRESS-003: 1000 条批处理         7ms
  ✅ STRESS-004: JWT 签发 500 token   10ms
  ✅ STRESS-005: 审批 1000 并发         7ms
  ✅ STRESS-006: 500 广播消息      2,148ms

# Layer 6: 性能测试 (7 条) — benchmark.test.ts
  ✅ BENCH-001: WS RTT < 500ms     71ms
  ✅ BENCH-002: 审批延迟 < 50ms      2ms
  ✅ BENCH-003: 白名单 < 5ms         1ms
  ✅ BENCH-004: JWT 签发 < 5ms       3ms
  ✅ BENCH-005: 1000 行解析 < 200ms   4ms
  ✅ BENCH-006: 1000 条日志 < 100ms   4ms
  ✅ BENCH-007: 内存增长 < 2MB        2ms

# Layer 7: 整机性能测试 (4 条)
  ⚠️ 手动·需真机 Claude CLI 环境
