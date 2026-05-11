import Database from 'better-sqlite3';
import { Task } from '../types/entities';

export class TaskDAO {
  constructor(private db: Database.Database) {}

  create(task: { id: string; title: string; repo: string; user_id: string; status: string; tags: string; category: string; created_at: number; updated_at: number }): void {
    this.db.prepare(
      'INSERT INTO tasks (id, title, repo, user_id, status, tags, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(task.id, task.title, task.repo, task.user_id, task.status, task.tags, task.category, task.created_at, task.updated_at);
  }

  getById(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row ? { ...row, tags: JSON.parse(row.tags) } : null;
  }

  listAll(filter?: { status?: string; repo?: string; user_id?: string }): Task[] {
    const clauses: string[] = [];
    const params: any[] = [];
    if (filter?.status) { clauses.push('status = ?'); params.push(filter.status); }
    if (filter?.repo) { clauses.push('repo = ?'); params.push(filter.repo); }
    if (filter?.user_id) { clauses.push('user_id = ?'); params.push(filter.user_id); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    return (this.db.prepare(`SELECT * FROM tasks${where}`).all(...params) as any[])
      .map(r => ({ ...r, tags: JSON.parse(r.tags) }));
  }

  updateStatus(id: string, status: string): void {
    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), id);
  }
}
