import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { Task } from './types/entities';
import { TaskDAO } from './db/dao/task-dao';
import { MessageDAO } from './db/dao/session-dao';

export class TaskManager {
  private dao: TaskDAO;
  private messageDAO: MessageDAO;
  constructor(private db: Database.Database, private sessionMgrCallback?: (taskId: string) => any) {
    this.dao = new TaskDAO(db);
    this.messageDAO = new MessageDAO(db);
  }

  create(title: string, repo: string, userId?: string): Task {
    const id = uuid(); const now = Date.now();
    const task: Task = { id, title, repo, status: 'pending', tags: '[]', category: '', user_id: userId || '', created_at: now, updated_at: now };
    this.dao.create(task);
    return task;
  }

  list(userId: string, filter?: { status?: string; repo?: string }): Task[] {
    return this.dao.listAll({ ...filter, user_id: userId });
  }

  getById(id: string): Task | null { return this.dao.getById(id); }

  updateStatus(id: string, status: string): void {
    this.dao.updateStatus(id, status);
  }

  markCompleted(id: string): void { this.dao.updateStatus(id, 'completed'); }

  retry(taskId: string): { id: string } {
    const task = this.dao.getById(taskId);
    if (!task) throw new Error('task_not_found');
    if (this.sessionMgrCallback) {
      const session = this.sessionMgrCallback(taskId);
      if (!session || !session.id) throw new Error('session_creation_failed');
      return { id: session.id };
    }
    throw new Error('session_manager_not_available');
  }

  pause(taskId: string): void { this.dao.updateStatus(taskId, 'paused'); }
  resume(taskId: string): void { this.dao.updateStatus(taskId, 'in_progress'); }
}
