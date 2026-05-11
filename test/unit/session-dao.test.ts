import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { SessionDAO, MessageDAO } from '../../cloud-agent/src/db/dao/session-dao';
import { CREATE_SCHEMA_SQL } from '../../cloud-agent/src/db/schema';

describe('SessionDAO', () => {
  let db: Database.Database;
  let sessionDAO: SessionDAO;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(CREATE_SCHEMA_SQL);
  });

  beforeEach(() => {
    db.exec('DELETE FROM sessions');
    sessionDAO = new SessionDAO(db);
  });

  it('creates and retrieves a session', () => {
    const session = {
      id: 's1', task_id: 't1', title: 'Test Session', device_id: 'd1',
      status: 'running', work_dir: '/tmp', created_at: Date.now(), last_message_at: Date.now(),
    };
    sessionDAO.create(session);
    const found = sessionDAO.getById('s1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('s1');
    expect(found!.title).toBe('Test Session');
  });

  it('returns null for non-existent session', () => {
    expect(sessionDAO.getById('nonexistent')).toBeNull();
  });

  it('lists sessions by task', () => {
    sessionDAO.create({ id: 's1', task_id: 't1', title: 'S1', device_id: 'd1', status: 'running', work_dir: '/', created_at: 1, last_message_at: 1 });
    sessionDAO.create({ id: 's2', task_id: 't1', title: 'S2', device_id: 'd2', status: 'running', work_dir: '/', created_at: 2, last_message_at: 2 });
    sessionDAO.create({ id: 's3', task_id: 't2', title: 'S3', device_id: 'd3', status: 'running', work_dir: '/', created_at: 3, last_message_at: 3 });
    const list = sessionDAO.listByTask('t1');
    expect(list).toHaveLength(2);
    expect(list.map(s => s.id)).toContain('s1');
    expect(list.map(s => s.id)).toContain('s2');
  });

  it('updates session status', () => {
    sessionDAO.create({ id: 's1', task_id: 't1', title: 'S1', device_id: 'd1', status: 'running', work_dir: '/', created_at: 1, last_message_at: 1 });
    const now = Date.now();
    sessionDAO.updateStatus('s1', 'paused', now);
    const found = sessionDAO.getById('s1');
    expect(found!.status).toBe('paused');
    expect(found!.last_message_at).toBe(now);
  });

  it('updates status without changing last_message_at', () => {
    sessionDAO.create({ id: 's1', task_id: 't1', title: 'S1', device_id: 'd1', status: 'running', work_dir: '/', created_at: 1, last_message_at: 1000 });
    sessionDAO.updateStatus('s1', 'paused');
    const found = sessionDAO.getById('s1');
    expect(found!.status).toBe('paused');
    expect(found!.last_message_at).toBe(1000);
  });
});

describe('MessageDAO', () => {
  let db: Database.Database;
  let messageDAO: MessageDAO;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(CREATE_SCHEMA_SQL);
  });

  beforeEach(() => {
    db.exec('DELETE FROM messages');
    messageDAO = new MessageDAO(db);
  });

  it('inserts and retrieves messages', () => {
    messageDAO.insert({ id: 'm1', session_id: 's1', type: 'user', content: 'hello', seq: 1, timestamp: 1000, status: 'sent', metadata: '{}' });
    const msgs = messageDAO.getBySession('s1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('hello');
  });

  it('filters messages by timestamp', () => {
    messageDAO.insert({ id: 'm1', session_id: 's1', type: 'user', content: 'old', seq: 1, timestamp: 1000, status: 'sent', metadata: '{}' });
    messageDAO.insert({ id: 'm2', session_id: 's1', type: 'user', content: 'new', seq: 2, timestamp: 2000, status: 'sent', metadata: '{}' });
    const msgs = messageDAO.getBySession('s1', 2000);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('old');
  });

  it('limits message count', () => {
    for (let i = 0; i < 10; i++) {
      messageDAO.insert({ id: `m${i}`, session_id: 's1', type: 'user', content: `msg${i}`, seq: i, timestamp: i, status: 'sent', metadata: '{}' });
    }
    const msgs = messageDAO.getBySession('s1', undefined, 5);
    expect(msgs).toHaveLength(5);
  });

  it('orders messages by timestamp desc', () => {
    messageDAO.insert({ id: 'm1', session_id: 's1', type: 'user', content: 'first', seq: 1, timestamp: 1000, status: 'sent', metadata: '{}' });
    messageDAO.insert({ id: 'm2', session_id: 's1', type: 'user', content: 'second', seq: 2, timestamp: 2000, status: 'sent', metadata: '{}' });
    const msgs = messageDAO.getBySession('s1');
    expect(msgs[0].timestamp).toBe(2000);
    expect(msgs[1].timestamp).toBe(1000);
  });
});
