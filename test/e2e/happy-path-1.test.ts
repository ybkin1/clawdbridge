import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const BASE = process.env.CLOUD_AGENT_URL || 'http://localhost:4338';

describe('E2E Happy Path 1: OAuth → Task → Chat → Approval', () => {
  let token: string;
  let taskId: string;
  let sessionId: string;

  beforeAll(async () => {
    const res = await fetch(`${BASE}/api/v1/auth/oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'github', code: 'test-code' }),
    });
    const data = await res.json();
    token = data.token;
    expect(token).toBeTruthy();
  });

  it('creates a task', async () => {
    const res = await fetch(`${BASE}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: 'Fix login bug', repo: 'main-project' }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    taskId = data.task.id;
    expect(taskId).toBeTruthy();
  });

  it('creates a session and sends a message', async () => {
    const res = await fetch(`${BASE}/api/v1/tasks/${taskId}/sessions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    sessionId = data.session.id;
    expect(sessionId).toBeTruthy();
  });

  it('returns session messages', async () => {
    const res = await fetch(`${BASE}/api/v1/sessions/${sessionId}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.messages)).toBe(true);
  });

  it('health check passes', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
  });
});
