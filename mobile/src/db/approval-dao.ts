import { getDB } from './database';

export const ApprovalDAO = {
  async insert(approval: { id: string; session_id: string; operation: string; target: string; risk: string }): Promise<void> {
    const db = getDB();
    await db.exec('INSERT INTO approvals (id,session_id,operation,target,risk) VALUES (?,?,?,?,?)', [approval.id, approval.session_id, approval.operation, approval.target, approval.risk]);
  },
  async getBySession(sessionId: string, limit: number = 50): Promise<{ id: string; session_id: string; operation: string; target: string; risk: string; decision: string | null; decided_at: number | null }[]> {
    const db = getDB();
    const result = await db.query('SELECT * FROM approvals WHERE session_id = ? ORDER BY rowid DESC LIMIT ?', [sessionId, limit]);
    return result.rows as Array<{ id: string; session_id: string; operation: string; target: string; risk: string; decision: string | null; decided_at: number | null }>;
  },
  async updateDecision(id: string, decision: string): Promise<void> { const db = getDB(); await db.exec('UPDATE approvals SET decision = ?, decided_at = ? WHERE id = ?', [decision, Date.now(), id]); },
};
