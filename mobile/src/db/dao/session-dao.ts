import { getDatabase } from '../index';

// ---- Row types ----

export interface SessionRow {
  id: string;
  task_id: string | null;
  title: string;
  device_id: string;
  status: string;
  last_message_at: number;
  unread_count: number;
  pending_approvals: number;
}

export interface MessageRow {
  id: string;
  session_id: string;
  type: string;
  content: string;
  seq: number;
  timestamp: number;
  status: string;
  metadata: string | null;
}

// ---- SessionDAO ----

export const SessionDAO = {
  async create(session: Omit<SessionRow, 'id'> & { id?: string }): Promise<SessionRow> {
    const db = getDatabase();
    const id = session.id ?? `ses-${Date.now()}`;
    const row: SessionRow = {
      id,
      task_id: session.task_id ?? null,
      title: session.title ?? '',
      device_id: session.device_id,
      status: session.status ?? 'active',
      last_message_at: session.last_message_at ?? Date.now(),
      unread_count: session.unread_count ?? 0,
      pending_approvals: session.pending_approvals ?? 0,
    };
    await db.runAsync(
      `INSERT INTO sessions (id,task_id,title,device_id,status,last_message_at,unread_count,pending_approvals)
       VALUES (?,?,?,?,?,?,?,?)`,
      [row.id, row.task_id, row.title, row.device_id, row.status, row.last_message_at, row.unread_count, row.pending_approvals],
    );
    return row;
  },

  async getById(id: string): Promise<SessionRow | null> {
    const db = getDatabase();
    return db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
  },

  async listByTask(taskId: string): Promise<SessionRow[]> {
    const db = getDatabase();
    return db.getAllAsync<SessionRow>(
      'SELECT * FROM sessions WHERE task_id = ? ORDER BY last_message_at DESC',
      [taskId],
    );
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const db = getDatabase();
    await db.runAsync('UPDATE sessions SET status = ? WHERE id = ?', [status, id]);
  },
};

// ---- MessageDAO ----

export const MessageDAO = {
  async insert(msg: Omit<MessageRow, 'id'> & { id?: string }): Promise<void> {
    const db = getDatabase();
    const id = msg.id ?? `msg-${Date.now()}`;
    await db.runAsync(
      `INSERT INTO messages (id,session_id,type,content,seq,timestamp,status,metadata)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, msg.session_id, msg.type, msg.content, msg.seq, msg.timestamp, msg.status, msg.metadata ?? null],
    );
  },

  async getBySession(
    sessionId: string,
    beforeTs?: number,
    limit: number = 50,
  ): Promise<MessageRow[]> {
    const db = getDatabase();
    if (beforeTs != null) {
      return db.getAllAsync<MessageRow>(
        'SELECT * FROM messages WHERE session_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?',
        [sessionId, beforeTs, limit],
      );
    }
    return db.getAllAsync<MessageRow>(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?',
      [sessionId, limit],
    );
  },
};
