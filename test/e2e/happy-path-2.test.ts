import { describe, it, expect, beforeAll } from '@jest/globals';

const BASE = process.env.CLOUD_AGENT_URL || 'http://localhost:4338';

describe('E2E Happy Path 2: File Upload → Analysis → Download', () => {
  let token: string;
  let fileId: string;

  beforeAll(async () => {
    const res = await fetch(`${BASE}/api/v1/auth/oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'github', code: 'test-code' }),
    });
    const data = await res.json();
    token = data.token;
  });

  it('uploads a file', async () => {
    const form = new FormData();
    form.append('file', new Blob(['test content']), 'test.txt');
    const res = await fetch(`${BASE}/api/v1/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    fileId = data.fileId;
    expect(fileId).toBeTruthy();
  });

  it('downloads the file', async () => {
    const res = await fetch(`${BASE}/api/v1/files/${fileId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('test content');
  });

  it('gets repo file tree', async () => {
    const res = await fetch(`${BASE}/api/v1/repos/main-project/files`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.tree)).toBe(true);
  });
});
