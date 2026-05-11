import Database from 'better-sqlite3';
import type { Subtask } from '../../types/entities';

export class SubtaskDAO {
  constructor(private db: Database.Database) {}

  createByTaskId(subtasks: {
    id: string;
    task_id: string;
    title: string;
    description: string;
    sort_order: number;
    status: string;
  }[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO subtasks (id, task_id, title, description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertAll = this.db.transaction((items: typeof subtasks) => {
      for (const s of items) stmt.run(s.id, s.task_id, s.title, s.description, s.sort_order, s.status);
    });
    insertAll(subtasks);
  }

  getByTaskId(taskId: string): Subtask[] {
    return this.db
      .prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order')
      .all(taskId) as Subtask[];
  }

  updateStatus(id: string, status: string): void {
    this.db.prepare('UPDATE subtasks SET status = ? WHERE id = ?').run(status, id);
  }
}
