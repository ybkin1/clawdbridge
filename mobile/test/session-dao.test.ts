import { describe, it, expect, beforeEach } from '@jest/globals';
import { initDB, getDB } from '../src/db/database';

describe('MP05: SessionDAO', () => {
  beforeEach(async () => { await initDB(); });

  it('should create and retrieve session', async () => {
    const db = getDB();
    await db.exec("INSERT INTO sessions (id,title,device_id,device_name,status,last_message_at,unread_count,pending_approvals,created_at,archived) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ['ses-test', 'Test', 'd1', 'PC', 'active', Date.now(), 0, 0, Date.now(), 0]);
    const result = await db.query('SELECT * FROM sessions WHERE id = ?', ['ses-test']);
    expect(result.rows.length).toBe(1);
  });

  it('should store multiple sessions', async () => {
    const db = getDB();
    await db.exec("INSERT INTO sessions (id,title,device_id,device_name,status,last_message_at,unread_count,pending_approvals,created_at,archived) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ['s1', 'S1', 'd1', 'PC', 'active', 1000, 0, 0, 1000, 0]);
    await db.exec("INSERT INTO sessions (id,title,device_id,device_name,status,last_message_at,unread_count,pending_approvals,created_at,archived) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ['s2', 'S2', 'd2', 'Mac', 'active', 2000, 0, 0, 2000, 0]);
    const result = await db.query('SELECT * FROM sessions');
    expect(result.rows.length).toBe(2);
  });

  it('should return empty for missing session', async () => {
    const db = getDB();
    const result = await db.query('SELECT * FROM sessions WHERE id = ?', ['nonexistent']);
    expect(result.rows.length).toBe(0);
  });
});
