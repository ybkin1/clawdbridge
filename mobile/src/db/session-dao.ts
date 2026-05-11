import { getDB } from './database';

export interface SessionRow { id: string; title: string; device_id: string; device_name: string; status: string; last_message_at: number; unread_count: number; pending_approvals: number; created_at: number; archived: number; }

export const SessionDAO = {
  async create(title: string, deviceId: string, deviceName: string): Promise<SessionRow> {
    const row: SessionRow = { id: `ses-${Date.now()}`, title, device_id: deviceId, device_name: deviceName, status: 'active', last_message_at: Date.now(), unread_count: 0, pending_approvals: 0, created_at: Date.now(), archived: 0 };
    const db = getDB();
    await db.exec('INSERT INTO sessions (id,title,device_id,device_name,status,last_message_at,unread_count,pending_approvals,created_at,archived) VALUES (?,?,?,?,?,?,?,?,?,?)', [row.id, row.title, row.device_id, row.device_name, row.status, row.last_message_at, row.unread_count, row.pending_approvals, row.created_at, row.archived]);
    return row;
  },
  async list(filter?: { archived?: boolean }): Promise<SessionRow[]> {
    const db = getDB();
    const result = await db.query('SELECT * FROM sessions ORDER BY last_message_at DESC');
    return result.rows as unknown as SessionRow[];
  },
  async getById(id: string): Promise<SessionRow | null> {
    const db = getDB();
    const result = await db.query('SELECT * FROM sessions WHERE id = ?', [id]);
    return (result.rows[0] as unknown as SessionRow) || null;
  },
  async updateLastMessage(id: string, timestamp: number): Promise<void> { const db = getDB(); await db.exec('UPDATE sessions SET last_message_at = ? WHERE id = ?', [timestamp, id]); },
  async updateStatus(id: string, status: string): Promise<void> { const db = getDB(); await db.exec('UPDATE sessions SET status = ? WHERE id = ?', [status, id]); },
  async incrementUnread(id: string): Promise<void> { const db = getDB(); await db.exec('UPDATE sessions SET unread_count = unread_count + 1 WHERE id = ?', [id]); },
  async clearUnread(id: string): Promise<void> { const db = getDB(); await db.exec('UPDATE sessions SET unread_count = 0 WHERE id = ?', [id]); },
  async archive(id: string): Promise<void> { const db = getDB(); await db.exec('UPDATE sessions SET archived = 1 WHERE id = ?', [id]); },
};
