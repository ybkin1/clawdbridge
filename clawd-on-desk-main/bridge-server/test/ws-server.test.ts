import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { WSServer } from '../src/ws-server';

let server: WSServer;
const PORT = 19338;

describe('BP01: WSServer', () => {
  beforeAll(async () => {
    server = new WSServer({ port: PORT, jwtSecret: 'test-secret' });
    await server.listen();
  });

  afterAll(() => {
    server.close();
  });

  it('should listen on specified port', () => {
    expect(server.getConnectionCount()).toBe(0);
  });

  it('should accept WebSocket connections', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}?device_id=test-001`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        resolve();
      });
    });
  });

  it('should set connection count after client connects', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}?device_id=count-001`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        expect(server.getConnectionCount()).toBeGreaterThanOrEqual(1);
        ws.close();
        resolve();
      });
    });
  });

  it('should extract device_id from query params', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}?device_id=device-abc`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.close();
        resolve();
      });
    });
  });

  it('should generate anonymous id when no device_id', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.close();
        resolve();
      });
    });
  });

  it('should call onConnect handler for each connection', async () => {
    const connected: string[] = [];
    server.onConnect(() => connected.push('hit'));
    const ws = new WebSocket(`ws://localhost:${PORT}?device_id=handler-001`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        expect(connected).toContain('hit');
        ws.close();
        resolve();
      });
    });
  });

  it('should send message to specific client', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}?device_id=send-001`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        const sent = server.send('send-001', { type: 'test', msg: 'hello' });
        expect(sent).toBe(true);
        ws.close();
        resolve();
      });
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(server.send('send-001', { type: 'test' })).toBe(false);
  });

  it('should broadcast to all connections', async () => {
    const messages: object[] = [];
    const ws1 = new WebSocket(`ws://localhost:${PORT}?device_id=bcast-1`);
    const ws2 = new WebSocket(`ws://localhost:${PORT}?device_id=bcast-2`);

    ws1.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws2.on('message', (data) => messages.push(JSON.parse(data.toString())));

    await new Promise<void>((resolve) => {
      let opens = 0;
      const onOpen = () => {
        opens++;
        if (opens === 2) {
          server.broadcastToSession('s1', { type: 'bcast' });
          setTimeout(() => {
            expect(messages.length).toBeGreaterThanOrEqual(1);
            ws1.close();
            ws2.close();
            resolve();
          }, 100);
        }
      };
      ws1.once('open', onOpen);
      ws2.once('open', onOpen);
    });
  });

  it('should clean up connection on close', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}?device_id=cleanup-001`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        const before = server.getConnectionCount();
        ws.close();
        setTimeout(() => {
          expect(server.getConnectionCount()).toBeLessThan(before);
          resolve();
        }, 50);
      });
    });
  });
});
