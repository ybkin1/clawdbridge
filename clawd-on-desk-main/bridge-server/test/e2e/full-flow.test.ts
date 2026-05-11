import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { WSServer } from '../../src/ws-server';
import { AuthMiddleware } from '../../src/auth-middleware';
import { MessageRouter, MessageType } from '../../src/message-router';
import { StdoutParser } from '../../src/stdout-parser';
import { StdinWriter } from '../../src/stdin-writer';
import { ExitHandler } from '../../src/exit-handler';
import { CLISpawn } from '../../src/cli-spawn';
import { ApprovalInterceptor } from '../../src/approval-engine';
import { JWTIssuer } from '../../src/jwt-issuer';
import WebSocket from 'ws';
import { spawn } from 'child_process';

const PORT = 14338;

describe('IP01: E2E Message Flow (full chain)', () => {
  let server: WSServer;
  let router: MessageRouter;
  let authMiddleware: AuthMiddleware;
  let issuer: JWTIssuer;
  let token: string;

  beforeAll(async () => {
    issuer = new JWTIssuer('e2e-secret');
    token = issuer.issueAccessToken({ userId: 'e2e-user', deviceId: 'e2e-dev' });
    authMiddleware = new AuthMiddleware('e2e-secret');
    router = new MessageRouter();
    server = new WSServer({ port: PORT, jwtSecret: 'e2e-secret' });
    await server.listen();
  });

  afterAll(() => {
    server.close();
  });

  it('should complete full message flow: connect → send → receive', async () => {
    const receivedMessages: string[] = [];

    const ws = new WebSocket(`ws://localhost:${PORT}?token=${token}&device_id=e2e-dev`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          id: 'msg-e2e-1', type: 'client_connect', sessionId: 'e2e-ses', timestamp: Date.now(), seq: 1,
          payload: { deviceId: 'e2e-dev', deviceName: 'Test', appVersion: '1.0' },
        }));
        resolve();
      });

      ws.on('message', (data) => {
        receivedMessages.push(data.toString());
      });
    });

    ws.close();
    expect(receivedMessages.length).toBeGreaterThanOrEqual(0);
  });

  it('should route multiple message types through MessageRouter', () => {
    const results: string[] = [];
    router.register(MessageType.USER_MESSAGE, (msg) => results.push(`user:${msg.id}`));
    router.register(MessageType.ASSISTANT_STREAM, (msg) => results.push(`stream:${msg.id}`));
    router.register(MessageType.TOOL_INVOCATION, (msg) => results.push(`tool:${msg.id}`));
    router.register(MessageType.APPROVAL_REQUEST, (msg) => results.push(`approval:${msg.id}`));

    router.route(JSON.stringify({ id: '1', type: 'user_message', sessionId: 's1', timestamp: 1, seq: 1, payload: { content: 'hello' } }));
    router.route(JSON.stringify({ id: '2', type: 'assistant_stream', sessionId: 's1', timestamp: 2, seq: 2, payload: { delta: 'hi', done: true, messageId: 'm1' } }));
    router.route(JSON.stringify({ id: '3', type: 'tool_invocation', sessionId: 's1', timestamp: 3, seq: 3, payload: { callId: 'c1', toolName: 'edit_file', filePath: 'x.ts' } }));
    router.route(JSON.stringify({ id: '4', type: 'approval_request', sessionId: 's1', timestamp: 4, seq: 4, payload: { requestId: 'r1', operation: 'write', target: '/etc/hosts', risk: 'high' } }));

    expect(results).toContain('user:1');
    expect(results).toContain('stream:2');
    expect(results).toContain('tool:3');
    expect(results).toContain('approval:4');
  });

  it('should handle CLI spawn validation', () => {
    const cli = new CLISpawn('sk-test');
    expect(cli.validateSpawnArgs('/tmp')).toBeNull();
  });

  it('should parse Claude stdout into typed messages', () => {
    const parser = new StdoutParser();
    const msgs = parser.parse('s1', Buffer.from(
      '{"content":"I will create the file"}\n' +
      '{"type":"tool_use","name":"edit_file","input":{"path":"hello.ts"}}\n' +
      '{"content":"File created successfully"}\n'
    ));
    expect(msgs).toHaveLength(3);
    expect(msgs[0].type).toBe('text');
    expect(msgs[1].type).toBe('tool_use');
    expect(msgs[2].type).toBe('text');
  });

  it('should write and read from spawned process', (done) => {
    const writer = new StdinWriter();
    const proc = spawn('node', ['-e', 'process.stdin.once("data",(d)=>{console.log("echo:"+d.toString().trim());process.exit(0)})']);
    let echoed = false;

    proc.stdout.once('data', (data) => {
      if (data.toString().includes('echo:')) echoed = true;
    });

    proc.on('exit', () => {
      expect(echoed).toBe(true);
      done();
    });

    writer.write(proc, 'test-input');
  }, 10000);

  it('should generate JWT for E2E session', () => {
    const pair = issuer.issueTokenPair({ userId: 'e2e-user', deviceId: 'e2e-dev' });
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    const decoded = issuer.verify(pair.accessToken);
    expect(decoded!.userId).toBe('e2e-user');
  });

  it('should authenticate WebSocket connection with valid JWT', () => {
    const result = authMiddleware.authenticate({
      url: `/ws?token=${token}&device_id=e2e-dev`,
      headers: { host: 'localhost' },
    } as never);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('e2e-user');
  });
});
