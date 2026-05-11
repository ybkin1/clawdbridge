import { getDB } from './database';

export const KVStoreDAO = {
  async get(key: string): Promise<string | null> { const db = getDB(); const result = await db.query('SELECT value FROM kv_store WHERE key = ?', [key]); return (result.rows[0]?.value as string) || null; },
  async set(key: string, value: string): Promise<void> { const db = getDB(); await db.exec('INSERT OR REPLACE INTO kv_store (key,value,updated_at) VALUES (?,?,?)', [key, value, Date.now()]); },
  async delete(key: string): Promise<void> { const db = getDB(); await db.exec('DELETE FROM kv_store WHERE key = ?', [key]); },
};
