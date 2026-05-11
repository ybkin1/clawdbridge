import { describe, it, expect, beforeAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { TaskDAO } from '../../cloud-agent/src/db/dao/task-dao';
import { SessionDAO, MessageDAO } from '../../cloud-agent/src/db/dao/session-dao';
import { CREATE_SCHEMA_SQL } from '../../cloud-agent/src/db/schema';
import { MIGRATION_V002_SQL } from '../../cloud-agent/src/db/migrations/v002-indexes';

describe('Performance Benchmarks', () => {
  let db: Database.Database;
  let taskDAO: TaskDAO;
  let sessionDAO: SessionDAO;
  let messageDAO: MessageDAO;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(CREATE_SCHEMA_SQL);
    db.exec(MIGRATION_V002_SQL);
    taskDAO = new TaskDAO(db);
    sessionDAO = new SessionDAO(db);
    messageDAO = new MessageDAO(db);
  });

  it('inserts 1000 tasks within 1s', () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      taskDAO.create({
        id: `t${i}`,
        title: `Task ${i}`,
        repo: `repo${i % 10}`,
        user_id: `user${i % 100}`,
        status: i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'in_progress' : 'completed',
        tags: '[]',
        category: '',
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('queries tasks by user within 50ms', () => {
    const start = Date.now();
    const tasks = taskDAO.listAll({ user_id: 'user50' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('queries tasks by status within 50ms', () => {
    const start = Date.now();
    const tasks = taskDAO.listAll({ status: 'pending' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('inserts 10000 messages within 2s', () => {
    // Create a session first
    sessionDAO.create({ id: 'perf-session', task_id: 't1', title: 'Perf', device_id: 'd1', status: 'running', work_dir: '/', created_at: 1, last_message_at: 1 });

    const start = Date.now();
    for (let i = 0; i < 10000; i++) {
      messageDAO.insert({
        id: `m${i}`,
        session_id: 'perf-session',
        type: 'user',
        content: `Message ${i}`,
        seq: i,
        timestamp: i,
        status: 'sent',
        metadata: '{}',
      });
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it('queries messages with pagination within 50ms', () => {
    const start = Date.now();
    const msgs = messageDAO.getBySession('perf-session', undefined, 50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(msgs.length).toBe(50);
  });

  it('queries messages with timestamp filter within 50ms', () => {
    const start = Date.now();
    const msgs = messageDAO.getBySession('perf-session', 5000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(msgs.length).toBeGreaterThan(0);
  });
});
