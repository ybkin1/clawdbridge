import { getDatabase } from '../index';

// ---- Row types ----

export interface TaskRow {
  id: string;
  title: string;
  repo: string;
  status: string;
  tags: string;
  category: string;
  created_at: number;
  updated_at: number;
}

export interface TaskFilter {
  status?: string;
  category?: string;
  repo?: string;
}

// ---- TaskDAO ----

export const TaskDAO = {
  async create(task: Omit<TaskRow, 'id'> & { id?: string }): Promise<TaskRow> {
    const db = getDatabase();
    const id = task.id ?? `task-${Date.now()}`;
    const row: TaskRow = {
      id,
      title: task.title ?? '',
      repo: task.repo ?? '',
      status: task.status ?? 'pending',
      tags: task.tags ?? '',
      category: task.category ?? '',
      created_at: task.created_at ?? Date.now(),
      updated_at: task.updated_at ?? Date.now(),
    };
    await db.runAsync(
      `INSERT INTO tasks (id,title,repo,status,tags,category,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [row.id, row.title, row.repo, row.status, row.tags, row.category, row.created_at, row.updated_at],
    );
    return row;
  },

  async listAll(filter?: TaskFilter): Promise<TaskRow[]> {
    const db = getDatabase();
    const clauses: string[] = [];
    const params: string[] = [];

    if (filter?.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.category) {
      clauses.push('category = ?');
      params.push(filter.category);
    }
    if (filter?.repo) {
      clauses.push('repo = ?');
      params.push(filter.repo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.getAllAsync<TaskRow>(
      `SELECT * FROM tasks ${where} ORDER BY updated_at DESC`,
      params,
    );
  },

  async getById(id: string): Promise<TaskRow | null> {
    const db = getDatabase();
    return db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const db = getDatabase();
    await db.runAsync(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
      [status, Date.now(), id],
    );
  },
};
