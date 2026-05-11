import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { Session, Message } from './types/entities';
import { SessionDAO, MessageDAO } from './db/dao/session-dao';
import { ClaudeProcessPool, ClaudeProcess } from './claude-process-pool';
import { StdinStdoutBridge } from './stdin-stdout-bridge';
import { ApprovalInterceptor } from './approval-interceptor';
import { ParsedClaudeMessage } from './types/messages';

export class SessionManager {
  private sessionDAO: SessionDAO;
  private messageDAO: MessageDAO;
  private bridge: StdinStdoutBridge;

  constructor(private db: Database.Database, private processPool: ClaudeProcessPool, private approval: ApprovalInterceptor) {
    this.sessionDAO = new SessionDAO(db);
    this.messageDAO = new MessageDAO(db);
    this.bridge = new StdinStdoutBridge();
  }

  create(taskId: string, workDir: string, userId: string): Session {
    const id = uuid(); const now = Date.now();
    const session: Session = { id, task_id: taskId, title: '', device_id: '', status: 'running', work_dir: workDir, created_at: now, last_message_at: now };
    this.sessionDAO.create(session);
    const proc = this.processPool.spawn(workDir, id);
    if (proc) {
      this.bridge.attach(proc, (msg) => { if (msg.type === 'permission_request') { this.approval.intercept(id, msg.operation || '', msg.target || '', msg.risk || '', ''); } });
      this.bridge.write(proc, `Task and working directory: ${workDir}. Ready.`);
    }
    return session;
  }

  getById(id: string): Session | null { return this.sessionDAO.getById(id); }
  listByTask(taskId: string): Session[] { return this.sessionDAO.listByTask(taskId); }

  routeMessage(sessionId: string, message: { content: string }): void {
    if (!message.content?.trim()) return; // F-K09: 空消息拒绝
    const proc = this.processPool.get(sessionId);
    if (!proc) return;
    this.bridge.write(proc, message.content);
  }

  async recoverCrashedSession(sessionId: string): Promise<void> {
    const proc = this.processPool.get(sessionId);
    if (!proc) return;
    const session = this.sessionDAO.getById(sessionId);
    // Ensure kill completes before spawning to prevent zombie processes
    await this.processPool.killAsync(sessionId);
    const newProc = this.processPool.spawn(session?.work_dir || '/', sessionId);
    if (newProc && proc) {
      for (const line of proc.ringBuffer.slice(-50)) { this.bridge.write(newProc, line); }
      this.bridge.write(newProc, 'System recovered. Continue.');
    }
  }

  getMessages(sessionId: string, beforeTs?: number, limit = 50): { messages: Message[]; hasMore: boolean } {
    const msgs = this.messageDAO.getBySession(sessionId, beforeTs, limit + 1);
    const hasMore = msgs.length > limit;
    return { messages: msgs.slice(0, limit).reverse(), hasMore };
  }

  bindProcess(sessionId: string, proc: ClaudeProcess): void { /* proc.sessionId already bound */ }
}
