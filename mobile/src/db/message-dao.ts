import { getDB } from './database';

export interface MessageRow { id: string; session_id: string; type: string; content: string; timestamp: number; seq: number; status: string; metadata: string; }

export const MessageDAO = {
  async insert(msg: MessageRow): Promise<void> {
    const db = getDB();
    await db.exec('INSERT INTO messages (id,session_id,type,content,timestamp,seq,status,metadata) VALUES (?,?,?,?,?,?,?,?)', [msg.id, msg.session_id, msg.type, msg.content, msg.timestamp, msg.seq, msg.status, msg.metadata]);
  },
  async getPage(sessionId: string, beforeTimestamp: number, limit: number = 50): Promise<{ messages: MessageRow[]; hasMore: boolean }> {
    const db = getDB();
    const result = await db.query('SELECT * FROM messages WHERE session_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?', [sessionId, beforeTimestamp, limit + 1]);
    const rows = result.rows as unknown as MessageRow[];
    return { messages: rows.slice(0, limit), hasMore: rows.length > limit };
  },
  async getLastSeq(sessionId: string): Promise<number> {
    const db = getDB();
    const result = await db.query('SELECT MAX(seq) as max_seq FROM messages WHERE session_id = ?', [sessionId]);
    return (result.rows[0]?.max_seq as number) || 0;
  },
  async updateStatus(id: string, status: string): Promise<void> { const db = getDB(); await db.exec('UPDATE messages SET status = ? WHERE id = ?', [status, id]); },
  async getBySeqRange(sessionId: string, fromSeq: number, toSeq: number): Promise<MessageRow[]> {
    const db = getDB();
    const result = await db.query('SELECT * FROM messages WHERE session_id = ? AND seq >= ? AND seq <= ? ORDER BY seq ASC', [sessionId, fromSeq, toSeq]);
    return result.rows as unknown as MessageRow[];
  },
};
