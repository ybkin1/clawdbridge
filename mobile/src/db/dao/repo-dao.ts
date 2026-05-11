import { getDatabase } from '../index';

// ---- Row types ----

export interface RepoRow {
  name: string;
  work_dir: string;
  git_remote: string;
  branches: string; // JSON-encoded string[], validated by CHECK(json_valid(branches))
  registered_at: number;
}

// ---- RepoDAO ----

export const RepoDAO = {
  async insert(repo: Omit<RepoRow, 'branches' | 'registered_at'> & { branches?: string[]; registered_at?: number }): Promise<RepoRow> {
    const db = getDatabase();
    const row: RepoRow = {
      name: repo.name,
      work_dir: repo.work_dir,
      git_remote: repo.git_remote ?? '',
      branches: repo.branches ? JSON.stringify(repo.branches) : '[]',
      registered_at: repo.registered_at ?? Date.now(),
    };
    await db.runAsync(
      `INSERT OR REPLACE INTO repos (name,work_dir,git_remote,branches,registered_at)
       VALUES (?,?,?,?,?)`,
      [row.name, row.work_dir, row.git_remote, row.branches, row.registered_at],
    );
    return row;
  },

  async list(): Promise<RepoRow[]> {
    const db = getDatabase();
    return db.getAllAsync<RepoRow>('SELECT * FROM repos ORDER BY registered_at DESC');
  },

  async get(name: string): Promise<RepoRow | null> {
    const db = getDatabase();
    return db.getFirstAsync<RepoRow>('SELECT * FROM repos WHERE name = ?', [name]);
  },

  async delete(name: string): Promise<void> {
    const db = getDatabase();
    await db.runAsync('DELETE FROM repos WHERE name = ?', [name]);
  },
};

// ---- KVDAO ----

export const KVDAO = {
  async get(key: string): Promise<string | null> {
    const db = getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM kv_store WHERE key = ?',
      [key],
    );
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    const db = getDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO kv_store (key,value) VALUES (?,?)',
      [key, value],
    );
  },
};
