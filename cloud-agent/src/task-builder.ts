import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { ClaudeProcessPool } from './claude-process-pool';
import { StdinStdoutBridge } from './stdin-stdout-bridge';
import { SubtaskDAO } from './db/dao/subtask-dao';

export class TaskBuilder {
  private bridge = new StdinStdoutBridge();
  private subtaskDAO: SubtaskDAO;
  constructor(private processPool: ClaudeProcessPool, private db: Database.Database) {
    this.subtaskDAO = new SubtaskDAO(db);
  }

  async plan(taskId: string, userRequest: string, repo: string): Promise<void> {
    const proc = this.processPool.spawn(repo || '/', `planner-${taskId}`);
    if (!proc) return;
    try {
      const prompt = `Given: "${userRequest}". Break into 3-8 subtasks. Return JSON: {"subtasks":[{"title":"...","description":"...","order":1}]}`;
      this.bridge.write(proc, prompt);
      const output = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('planner_timeout')), 30000);
        let buf = '';
        this.bridge.attach(proc, (msg) => { buf += msg.content || ''; if (buf.includes('}')) { clearTimeout(timer); resolve(buf); } });
      });
      const parsed = JSON.parse(output.match(/\{[\s\S]*\}/)?.[0] || output);
      const subtasks = (parsed.subtasks || []).map((st: any) => ({ id: uuid(), task_id: taskId, title: st.title, description: st.description || '', sort_order: st.order || 1, status: 'pending' }));
      this.subtaskDAO.createByTaskId(subtasks);
    } catch { /* timeout or parse error, return empty */ }
    this.processPool.kill(`planner-${taskId}`);
  }
}
