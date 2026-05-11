import { describe, it, expect } from '@jest/globals';

const BASE = process.env.CLOUD_AGENT_URL || 'http://localhost:4338';
const WS_BASE = BASE.replace('http', 'ws');

describe('Performance Stress Test', () => {
  it('handles 100 WS connections', async () => {
    const connections: WebSocket[] = [];
    for (let i = 0; i < 100; i++) {
      const ws = new WebSocket(`${WS_BASE}/ws`);
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error(`Connection ${i} failed`));
      });
      connections.push(ws);
    }
    expect(connections.length).toBe(100);
    connections.forEach((ws) => ws.close());
  });

  it('processes 1000 messages within 30s', async () => {
    const ws = new WebSocket(`${WS_BASE}/ws`);
    await new Promise<void>((resolve) => { ws.onopen = () => resolve(); });

    const start = Date.now();
    let received = 0;
    const target = 1000;

    ws.onmessage = () => { received++; };

    for (let i = 0; i < target; i++) {
      ws.send(JSON.stringify({ type: 'ping', seq: i }));
    }

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (received >= target) { clearInterval(interval); resolve(); }
      }, 100);
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThanOrEqual(30000);
    expect(received).toBe(target);
    ws.close();
  });
});
