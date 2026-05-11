import { describe, it, expect, beforeEach } from '@jest/globals';
import { initDB, getDB } from '../src/db/database';

describe('MP05: SessionDAO (CRUD)', () => {
  beforeEach(async () => { await initDB(); });

  it('should create session and store it in DB', async () => {
    const db = getDB();
    await db.exec("INSERT INTO sessions (id,title,device_id,device_name,status,last_message_at,unread_count,pending_approvals,created_at,archived) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ['s1', 'Test', 'd1', 'PC', 'active', 1000, 0, 0, 1000, 0]);
    const result = await db.query('SELECT * FROM sessions WHERE id = ?', ['s1']);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].title).toBe('Test');
    expect(result.rows[0].device_id).toBe('d1');
  });

  it('should list all sessions', async () => {
    const db = getDB();
    await db.exec("INSERT INTO sessions (id,title,device_id,device_name,status,last_message_at,unread_count,pending_approvals,created_at,archived) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ['a1', 'A', 'd1', 'PC', 'active', 1000, 0, 0, 1000, 0]);
    await db.exec("INSERT INTO sessions (id,title,device_id,device_name,status,last_message_at,unread_count,pending_approvals,created_at,archived) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ['a2', 'B', 'd2', 'Mac', 'active', 2000, 0, 0, 2000, 0]);
    const result = await db.query('SELECT * FROM sessions');
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('should return null for nonexistent session', async () => {
    const db = getDB();
    const result = await db.query('SELECT * FROM sessions WHERE id = ?', ['nonexistent']);
    expect(result.rows.length).toBe(0);
  });
});

describe('MP06: MessageDAO (CRUD)', () => {
  beforeEach(async () => { await initDB(); });

  it('should insert and retrieve messages', async () => {
    const db = getDB();
    await db.exec("INSERT INTO messages (id,session_id,type,content,timestamp,seq,status,metadata) VALUES (?,?,?,?,?,?,?,?)",
      ['m1', 's1', 'user', 'hello', 1000, 1, 'sent', '{}']);
    const result = await db.query('SELECT * FROM messages WHERE session_id = ?', ['s1']);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].content).toBe('hello');
  });

  it('should handle multiple messages per session', async () => {
    const db = getDB();
    await db.exec("INSERT INTO messages (id,session_id,type,content,timestamp,seq,status,metadata) VALUES (?,?,?,?,?,?,?,?)",
      ['m1', 's1', 'user', 'a', 1, 1, 'sent', '{}']);
    await db.exec("INSERT INTO messages (id,session_id,type,content,timestamp,seq,status,metadata) VALUES (?,?,?,?,?,?,?,?)",
      ['m2', 's1', 'assistant', 'b', 2, 2, 'sent', '{}']);
    const result = await db.query('SELECT * FROM messages WHERE session_id = ?', ['s1']);
    expect(result.rows.length).toBe(2);
  });
});
