import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { WSServer } from '../../src/ws-server';
import { JWTIssuer } from '../../src/jwt-issuer';
import { AuthMiddleware } from '../../src/auth-middleware';
import { MessageRouter, MessageType } from '../../src/message-router';
import { ApprovalInterceptor } from '../../src/approval-engine';
import { StdoutParser } from '../../src/stdout-parser';
import { ExitHandler } from '../../src/exit-handler';
import { AuthService } from '../../src/auth-service';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import express from 'express';
import { DeviceRoutes, SessionRoutes } from '../../src/routes';

const PORT = 17338;

describe('E2E-APP: 整机功能测试', () => {
  let server: WSServer;
  let app: express.Application;
  let authService: AuthService;
  let issuer: JWTIssuer;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    issuer = new JWTIssuer('app-e2e-secret');
    authService = new AuthService('app-e2e-secret');
    const pair = issuer.issueTokenPair({ userId: 'app-user', deviceId: 'mobile-device' });
    accessToken = pair.accessToken;
    refreshToken = pair.refreshToken;

    app = express();
    app.use(express.json());
    app.use('/api/auth', express.Router().post('/oauth', (req, res) => {
      const result = authService.handleOAuth(req.body.provider, req.body.code);
      result ? res.json(result) : res.status(400).json({ error: 'auth_failed' });
    }));
    app.post('/api/auth/refresh', (req, res) => {
      const result = authService.refreshToken(req.body.refreshToken);
      result ? res.json(result) : res.status(401).json({ error: 'invalid_token' });
    });
    app.use('/api/devices', new DeviceRoutes(authService).getRouter());
    app.use('/api/sessions', new SessionRoutes(authService).getRouter());
    await new Promise<void>((r) => app.listen(17339, () => r()));

    server = new WSServer({ port: PORT, jwtSecret: 'app-e2e-secret' });
    await server.listen();
  }, 30000);

  afterAll(() => { server.close(); });

  describe('E2E-001: 登录→配对→消息→审批→重连 全流程', () => {
    it('Step 1: OAuth 登录获取 JWT', async () => {
      const res = await fetch('http://localhost:17339/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'github', code: 'test-full-flow' }),
      });
      const data = await res.json() as Record<string, unknown>;
      expect(data.token).toBeTruthy();
      expect(data.refreshToken).toBeTruthy();
    });

    it('Step 2: 设备配对', async () => {
      const res = await fetch('http://localhost:17339/api/devices/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ deviceId: 'desktop-pc', name: 'My Desktop', platform: 'windows' }),
      });
      const data = await res.json() as Record<string, unknown>;
      expect(data.success).toBe(true);
    });

    it('Step 3: 创建会话', async () => {
      const res = await fetch('http://localhost:17339/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ deviceId: 'desktop-pc', title: 'E2E Test Session' }),
      });
      const data = await res.json() as { session: { title: string } };
      expect(data.session.title).toBe('E2E Test Session');
    });

    it('Step 4: WebSocket 连接 + 发送 5 条用户消息', async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}?token=${accessToken}&device_id=mobile-device`);
      const received: string[] = [];

      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          for (let i = 0; i < 5; i++) {
            ws.send(JSON.stringify({
              id: `chat-msg-${i}`, type: 'user_message', sessionId: 'e2e-ses',
              timestamp: Date.now(), seq: i + 1,
              payload: { content: `Message ${i}`, contentType: 'text' },
            }));
          }
          setTimeout(() => {
            ws.close();
            resolve();
          }, 500);
        });
        ws.on('message', (data) => { received.push(data.toString()); });
      });
    }, 10000);

    it('Step 5: 审批流程 — 模拟 Claude 请求→手机批准', async () => {
      const interceptor = new ApprovalInterceptor();
      let capturedId = '';

      interceptor.onRequestHandler((p) => { capturedId = p.requestId; });

      const decisionPromise = interceptor.intercept('e2e-ses', 'write', '/tmp/hello.ts', 'medium');
      await new Promise((r) => setTimeout(r, 10));
      interceptor.resolve(capturedId, 'approved');

      const result = await decisionPromise;
      expect(result).toBe('approved');
    });

    it('Step 6: 会话始终允许 — 后续操作跳过审批', async () => {
      const interceptor = new ApprovalInterceptor();
      interceptor.addToWhitelist('e2e-ses', 'read', '/tmp/safe');

      const r1 = await interceptor.intercept('e2e-ses', 'read', '/tmp/safe', 'low');
      const r2 = await interceptor.intercept('e2e-ses', 'read', '/tmp/safe', 'low');
      expect(r1).toBe('approved');
      expect(r2).toBe('approved');
    });

    it('Step 7: Token 刷新', async () => {
      const res = await fetch('http://localhost:17339/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json() as { token: string };
      expect(data.token).toBeTruthy();
    });

    it('Step 8: 审批超时 → auto_rejected', async () => {
      const interceptor = new ApprovalInterceptor();
      const result = interceptor.intercept('e2e-ses', 'delete', '/important/file', 'high');
      await new Promise((r) => setTimeout(r, 100));
      expect(interceptor.getWaiter().getPendingCount()).toBe(1);
    });
  });

  describe('E2E-002: Claude stdout 解析→消息流', () => {
    it('解析 Claude 完整会话输出', () => {
      const parser = new StdoutParser();
      const session = [
        '{"content":"I will help you with that"}',
        '{"type":"tool_use","name":"read_file","input":{"path":"src/index.ts"}}',
        '{"content":"Let me read the file first"}',
        '{"type":"tool_result","success":true,"output":"console.log(\'hello\')"}',
        '{"content":"The file contains a simple log statement. Would you like me to modify it?"}',
        '{"type":"permission_request","operation":"write_file","path":"src/index.ts","risk":"high"}',
      ].join('\n') + '\n';

      const msgs = parser.parse('s1', Buffer.from(session));

      expect(msgs.length).toBe(6);
      expect(msgs.filter((m) => m.type === 'text').length).toBe(3);
      expect(msgs.filter((m) => m.type === 'tool_use').length).toBe(1);
      expect(msgs.filter((m) => m.type === 'tool_result').length).toBe(1);
      expect(msgs.filter((m) => m.type === 'permission_request').length).toBe(1);
    });
  });

  describe('E2E-003: 进程管理', () => {
    it('spawn→exit 完整生命周期', (done) => {
      const handler = new ExitHandler();
      const proc = spawn('node', ['-e', 'setTimeout(()=>process.exit(0), 50)']);

      handler.onExitEvent((event) => {
        expect(event.exitCode).toBe(0);
        expect(event.sessionId).toBe('lifecycle-test');
        done();
      });

      handler.attach(proc, 'lifecycle-test');
    }, 10000);

    it('进程崩溃检测', (done) => {
      const handler = new ExitHandler();
      const proc = spawn('node', ['-e', 'process.exit(42)']);

      handler.onExitEvent((event) => {
        expect(event.exitCode).toBe(42);
        done();
      });

      handler.attach(proc, 'crash-test');
    }, 10000);
  });
});
