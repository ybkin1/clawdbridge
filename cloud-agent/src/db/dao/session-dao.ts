import type Database from 'better-sqlite3';
import type { Session, Message } from '../types/entities';

export class SessionDAO {
  constructor(private db: Database.Database) {}

  create(s: { id: string; task_id: string; title: string; device_id: string;
               status: string; work_dir: string; created_at: number; last_message_at: number }): void {
    this.db.prepare(
      `INSERT INTO sessions (id,task_id,title,device_id,status,work_dir,created_at,last_message_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(s.id, s.task_id, s.title, s.device_id, s.status, s.work_dir, s.created_at, s.last_message_at);
  }

  getById(id: string): Session | null {
    return (this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session) ?? null;
  }

  listByTask(taskId: string): Session[] {
    return this.db.prepare('SELECT * FROM sessions WHERE task_id = ?').all(taskId) as Session[];
  }

  updateStatus(id: string, status: string, lastMessageAt?: number): void {
    this.db.prepare(
      'UPDATE sessions SET status = ?, last_message_at = COALESCE(?, last_message_at) WHERE id = ?'
    ).run(status, lastMessageAt ?? null, id);
  }
}

export class MessageDAO {
  constructor(private db: Database.Database) {}

  insert(m: { id: string; session_id: string; type: string; content: string;
               seq: number; timestamp: number; status: string; metadata: string }): void {
    this.db.prepare(
      `INSERT INTO messages (id,session_id,type,content,seq,timestamp,status,metadata)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(m.id, m.session_id, m.type, m.content, m.seq, m.timestamp, m.status, m.metadata);
  }

  getBySession(sessionId: string, beforeTs?: number, limit?: number): Message[] {
    let sql = 'SELECT * FROM messages WHERE session_id = ?';
    const params: unknown[] = [sessionId];
    if (beforeTs !== undefined) { sql += ' AND timestamp < ?'; params.push(beforeTs); }
    sql += ' ORDER BY timestamp DESC';
    if (limit !== undefined) { sql += ' LIMIT ?'; params.push(limit); }
    return this.db.prepare(sql).all(...params) as Message[];
  }
}
