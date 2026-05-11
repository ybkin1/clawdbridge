import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { TaskDAO } from '../../cloud-agent/src/db/dao/task-dao';
import { CREATE_SCHEMA_SQL } from '../../cloud-agent/src/db/schema';

describe('TaskDAO', () => {
  let db: Database.Database;
  let taskDAO: TaskDAO;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(CREATE_SCHEMA_SQL);
  });

  beforeEach(() => {
    db.exec('DELETE FROM tasks');
    taskDAO = new TaskDAO(db);
  });

  it('creates and retrieves a task', () => {
    const task = { id: 't1', title: 'Fix bug', repo: 'main', user_id: 'u1', status: 'pending', tags: '[]', category: 'bug', created_at: Date.now(), updated_at: Date.now() };
    taskDAO.create(task);
    const found = taskDAO.getById('t1');
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Fix bug');
    expect(found!.tags).toEqual([]);
  });

  it('returns null for non-existent task', () => {
    expect(taskDAO.getById('nonexistent')).toBeNull();
  });

  it('lists all tasks', () => {
    taskDAO.create({ id: 't1', title: 'Task 1', repo: 'r1', user_id: 'u1', status: 'pending', tags: '[]', category: '', created_at: 1, updated_at: 1 });
    taskDAO.create({ id: 't2', title: 'Task 2', repo: 'r2', user_id: 'u1', status: 'in_progress', tags: '["urgent"]', category: '', created_at: 2, updated_at: 2 });
    const all = taskDAO.listAll();
    expect(all).toHaveLength(2);
  });

  it('filters by status', () => {
    taskDAO.create({ id: 't1', title: 'T1', repo: 'r1', user_id: 'u1', status: 'pending', tags: '[]', category: '', created_at: 1, updated_at: 1 });
    taskDAO.create({ id: 't2', title: 'T2', repo: 'r2', user_id: 'u1', status: 'completed', tags: '[]', category: '', created_at: 2, updated_at: 2 });
    const pending = taskDAO.listAll({ status: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('t1');
  });

  it('filters by repo', () => {
    taskDAO.create({ id: 't1', title: 'T1', repo: 'repo-a', user_id: 'u1', status: 'pending', tags: '[]', category: '', created_at: 1, updated_at: 1 });
    taskDAO.create({ id: 't2', title: 'T2', repo: 'repo-b', user_id: 'u1', status: 'pending', tags: '[]', category: '', created_at: 2, updated_at: 2 });
    const filtered = taskDAO.listAll({ repo: 'repo-a' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('t1');
  });

  it('filters by user_id', () => {
    taskDAO.create({ id: 't1', title: 'T1', repo: 'r1', user_id: 'u1', status: 'pending', tags: '[]', category: '', created_at: 1, updated_at: 1 });
    taskDAO.create({ id: 't2', title: 'T2', repo: 'r2', user_id: 'u2', status: 'pending', tags: '[]', category: '', created_at: 2, updated_at: 2 });
    const filtered = taskDAO.listAll({ user_id: 'u1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('t1');
  });

  it('combines multiple filters', () => {
    taskDAO.create({ id: 't1', title: 'T1', repo: 'r1', user_id: 'u1', status: 'pending', tags: '[]', category: '', created_at: 1, updated_at: 1 });
    taskDAO.create({ id: 't2', title: 'T2', repo: 'r1', user_id: 'u1', status: 'completed', tags: '[]', category: '', created_at: 2, updated_at: 2 });
    taskDAO.create({ id: 't3', title: 'T3', repo: 'r2', user_id: 'u1', status: 'pending', tags: '[]', category: '', created_at: 3, updated_at: 3 });
    const filtered = taskDAO.listAll({ status: 'pending', repo: 'r1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('t1');
  });

  it('updates task status', () => {
    taskDAO.create({ id: 't1', title: 'T1', repo: 'r1', user_id: 'u1', status: 'pending', tags: '[]', category: '', created_at: 1, updated_at: 1 });
    taskDAO.updateStatus('t1', 'in_progress');
    const found = taskDAO.getById('t1');
    expect(found!.status).toBe('in_progress');
    expect(found!.updated_at).toBeGreaterThan(1);
  });

  it('parses tags as JSON array', () => {
    taskDAO.create({ id: 't1', title: 'T1', repo: 'r1', user_id: 'u1', status: 'pending', tags: '["bug", "urgent"]', category: '', created_at: 1, updated_at: 1 });
    const found = taskDAO.getById('t1');
    expect(found!.tags).toEqual(['bug', 'urgent']);
  });
});
