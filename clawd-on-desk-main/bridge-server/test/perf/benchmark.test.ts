import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { WSServer } from '../../src/ws-server';
import { JWTIssuer } from '../../src/jwt-issuer';
import { ApprovalInterceptor } from '../../src/approval-engine';
import { StderrLogger } from '../../src/stderr-logger';
import { StdoutParser } from '../../src/stdout-parser';
import WebSocket from 'ws';

const PORT = 16340;

describe('BRIDGE-BENCH: 性能基准测试', () => {
  let server: WSServer;
  let issuer: JWTIssuer;
  let token: string;

  beforeAll(async () => {
    issuer = new JWTIssuer('bench-secret');
    token = issuer.issueAccessToken({ userId: 'bench', deviceId: 'dev' });
    server = new WSServer({ port: PORT, jwtSecret: 'bench-secret' });
    await server.listen();
  }, 15000);

  afterAll(() => { server.close(); });

  describe('消息延迟', () => {
    it('BENCH-001: WS 单条消息 RTT < 500ms (本地)', async () => {
      const latencies: number[] = [];

      server.onConnect((ws) => {
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', payload: {} }));
            }
          } catch {}
        });
      });

      const ws = new WebSocket(`ws://localhost:${PORT}?token=${token}&device_id=bench-1`);

      await new Promise<void>((resolve) => {
        ws.on('open', async () => {
          for (let i = 0; i < 5; i++) {
            const start = performance.now();
            ws.send(JSON.stringify({ id: `m${i}`, type: 'ping', sessionId: 's1', timestamp: Date.now(), seq: i, payload: {} }));
            await new Promise<void>((r) => {
              ws.once('message', () => {
                latencies.push(performance.now() - start);
                r();
              });
            });
          }
          ws.close();
          resolve();
        });
      });

      expect(latencies.length).toBe(5);
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avg).toBeLessThan(500);
    }, 20000);
  });

  describe('审批闭环延迟', () => {
    it('BENCH-002: intercept→resolve 延迟 < 50ms', async () => {
      const interceptor = new ApprovalInterceptor();
      let capturedId = '';
      interceptor.onRequestHandler((p) => { capturedId = p.requestId; });

      const start = performance.now();
      const decisionPromise = interceptor.intercept('s1', 'write', '/tmp/x', 'high');
      await new Promise((r) => setTimeout(r, 1));
      interceptor.resolve(capturedId, 'approved');
      await decisionPromise;
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it('BENCH-003: 白名单跳过延迟 < 5ms', async () => {
      const interceptor = new ApprovalInterceptor();
      interceptor.addToWhitelist('s1', 'read', '/tmp/x');
      const start = performance.now();
      await interceptor.intercept('s1', 'read', '/tmp/x', 'low');
      expect(performance.now() - start).toBeLessThan(5);
    });

    it('BENCH-004: JWT 签发延迟 < 5ms', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        issuer.issueAccessToken({ userId: 'u', deviceId: 'd' });
      }
      const avg = (performance.now() - start) / 100;
      expect(avg).toBeLessThan(5);
    });
  });

  describe('解析性能', () => {
    it('BENCH-005: StdoutParser 1000 行 < 200ms', () => {
      const parser = new StdoutParser();
      const lines = Array.from({ length: 1000 }, (_, i) => `{"content":"line${i}"}`).join('\n') + '\n';
      const start = performance.now();
      const msgs = parser.parse('s1', Buffer.from(lines));
      expect(msgs.length).toBe(1000);
      expect(performance.now() - start).toBeLessThan(200);
    });
  });

  describe('日志写入性能', () => {
    it('BENCH-006: 1000 条日志写入 < 100ms', () => {
      const logger = new StderrLogger();
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        logger.log('s1', `debug output line ${i}`);
      }
      expect(performance.now() - start).toBeLessThan(100);
      expect(logger.getLogs().length).toBe(1000);
    });
  });

  describe('内存基准', () => {
    it('BENCH-007: 1000 条日志 ≤ 2MB 内存增长', () => {
      const before = process.memoryUsage().heapUsed;
      const logger = new StderrLogger();
      for (let i = 0; i < 1000; i++) {
        logger.log('s1', `entry ${i} `.repeat(10));
      }
      const after = process.memoryUsage().heapUsed;
      const diffMB = (after - before) / 1024 / 1024;
      expect(diffMB).toBeLessThan(2);
    });
  });
});
