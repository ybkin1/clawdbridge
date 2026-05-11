import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { WSServer } from '../../src/ws-server';
import { MessageRouter, MessageType } from '../../src/message-router';
import { JWTIssuer } from '../../src/jwt-issuer';
import { ApprovalInterceptor } from '../../src/approval-engine';
import WebSocket from 'ws';

const PORT = 15338;

describe('BRIDGE-STRESS: 压力测试', () => {
  let server: WSServer;
  let issuer: JWTIssuer;
  let token: string;

  beforeAll(async () => {
    issuer = new JWTIssuer('stress-secret');
    token = issuer.issueAccessToken({ userId: 'stress', deviceId: 'dev' });
    server = new WSServer({ port: PORT, jwtSecret: 'stress-secret' });
    await server.listen();
  }, 15000);

  afterAll(() => { server.close(); });

  describe('并发连接', () => {
    it('BRIDGE-STRESS-001: 100 并发 WebSocket 连接', async () => {
      const connections: WebSocket[] = [];
      const errors: Error[] = [];

      const connect = (i: number) =>
        new Promise<void>((resolve) => {
          const ws = new WebSocket(`ws://localhost:${PORT}?token=${token}&device_id=stress-${i}`);
          ws.on('open', () => { connections.push(ws); resolve(); });
          ws.on('error', (e) => { errors.push(e); resolve(); });
        });

      const batch = 20;
      for (let round = 0; round < 5; round++) {
        const promises = [];
        for (let i = round * batch; i < Math.min((round + 1) * batch, 100); i++) {
          promises.push(connect(i));
        }
        await Promise.all(promises);
      }

      connections.forEach((ws) => ws.close());
      expect(connections.length).toBe(100);
      expect(errors.length).toBe(0);
    }, 30000);
  });

  describe('消息吞吐', () => {
    it('BRIDGE-STRESS-002: 路由 1000 条消息', () => {
      const router = new MessageRouter();
      let count = 0;
      router.register(MessageType.USER_MESSAGE, () => { count++; });

      for (let i = 0; i < 1000; i++) {
        router.route(JSON.stringify({
          id: `msg-${i}`, type: 'user_message', sessionId: 's1', timestamp: i, seq: i, payload: { content: 'test' },
        }));
      }
      expect(count).toBe(1000);
    });

    it('BRIDGE-STRESS-003: 1000 条消息批处理延迟 < 500ms', () => {
      const router = new MessageRouter();
      router.register(MessageType.USER_MESSAGE, () => {});

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        router.route(JSON.stringify({
          id: `msg-${i}`, type: 'user_message', sessionId: 's1', timestamp: i, seq: i, payload: {},
        }));
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it('BRIDGE-STRESS-004: JWT 签发 500 个 token < 1s', () => {
      const start = performance.now();
      for (let i = 0; i < 500; i++) {
        issuer.issueAccessToken({ userId: `u${i}`, deviceId: `d${i}` });
      }
      expect(performance.now() - start).toBeLessThan(1000);
    });
  });

  describe('审批引擎压力', () => {
    it('BRIDGE-STRESS-005: 1000 个并发审批请求', async () => {
      const interceptor = new ApprovalInterceptor();
      interceptor.addToWhitelist('s1', 'read');

      const promises: Promise<string>[] = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(interceptor.intercept('s1', 'read', '/tmp/test', 'low').then(r => r));
      }
      const results = await Promise.all(promises);
      expect(results.every((r) => r === 'approved')).toBe(true);
    }, 10000);
  });

  describe('广播压力', () => {
    it('BRIDGE-STRESS-006: 发送 500 条广播消息', async () => {
      const messagesReceived: number[] = [];
      const connCount = 10;
      const connections: WebSocket[] = [];

      const connectAll = () =>
        Promise.all(
          Array.from({ length: connCount }, (_, i) =>
            new Promise<WebSocket>((resolve) => {
              const ws = new WebSocket(`ws://localhost:${PORT}?token=${token}&device_id=bc-${i}`);
              ws.on('open', () => resolve(ws));
              ws.on('message', () => { messagesReceived.push(1); });
            })
          )
        );

      const allWs = await connectAll();
      connections.push(...allWs);

      for (let i = 0; i < 500; i++) {
        server.broadcastToSession('s1', { type: 'ping', payload: { seq: i } });
      }

      await new Promise((r) => setTimeout(r, 2000));
      connections.forEach((ws) => ws.close());
      expect(messagesReceived.length).toBeGreaterThan(0);
    }, 30000);
  });
});
